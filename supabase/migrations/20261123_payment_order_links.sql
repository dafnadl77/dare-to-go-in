-- Grow payment-link binding and a payment-notice log, for the DIRECT Grow notification (server/payments/growNotify.ts).
--
-- NOT APPLIED anywhere. Written and tested only against an isolated in-process PostgreSQL (tests/growLinkBindingSql.test.ts).
-- Applying it to production is a separate, approved step.
--
-- ADDITIVE ONLY: two new tables and three new functions. No existing table, column, index or function is changed, so the live
-- Make completion path (complete_payment_order called by /api/payment-complete) behaves exactly as before.
--
-- What the binding is, and what it is NOT:
--   When DARE creates a payment link, Make returns Grow's link identifiers (process id and process token). DARE keeps the id and a
--   KEYED HASH of the token (never the token itself) next to the order, together with the Grow environment (sandbox / production)
--   and DARE's own merchant reference that created it. A paid notification can then complete the order only if it carries the
--   SAME identifiers, for the SAME environment and merchant, while the order is open.
--   This is a matching rule. It is NOT proof that the notification came from DARE's own Grow account: Grow has not committed that
--   these identifiers are secret or globally unique, and its notification carries no signature. Uniqueness is therefore enforced
--   only per (provider, environment, merchant), and nothing here may be described as proof of origin or ownership.
--
-- Everything is service-role only (RLS on, no policies, client privileges revoked; SECURITY DEFINER functions executable by
-- service_role alone). No personal data: no name, phone, e-mail or card data; the notice log keeps a hash of the transaction id.

create table if not exists public.payment_order_links (
  order_id      text primary key references public.payment_orders (id) on delete restrict,
  provider      text not null default 'grow' check (provider = 'grow'),
  environment   text not null check (environment in ('sandbox', 'production')),
  merchant_ref  text not null check (merchant_ref ~ '^[a-z0-9][a-z0-9_-]{1,31}$'),
  process_id    text not null check (process_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  -- HMAC-SHA256 (server key, never in the database) over the token and its context. The token itself is never stored.
  token_hash    text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Observation for the Sandbox exposure check: the token was visible in the payment link the customer receives.
  token_in_url  boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Grow does not promise global uniqueness, so uniqueness is scoped: one order per identifier within one environment and merchant.
create unique index if not exists payment_order_links_process_uidx
  on public.payment_order_links (provider, environment, merchant_ref, process_id);

alter table public.payment_order_links enable row level security;
revoke all on public.payment_order_links from public, anon, authenticated;

create table if not exists public.payment_notices (
  id           bigint generated always as identity primary key,
  received_at  timestamptz not null default now(),
  provider     text not null default 'grow' check (provider = 'grow'),
  environment  text not null check (environment in ('sandbox', 'production', 'unknown')),
  -- Only a well-formed order id is kept; anything else is dropped (never stored as sent).
  order_id     text check (order_id is null or order_id ~ '^[0-9a-f]{32}$'),
  -- SHA-256 of the transaction id: enough to reconcile against Grow's report, without keeping the id itself.
  tx_hash      text check (tx_hash is null or tx_hash ~ '^[0-9a-f]{64}$'),
  status_code  text check (status_code is null or status_code ~ '^[0-9]{1,3}$'),
  shape        text check (shape is null or shape ~ '^[a-z/]{1,32}$'),
  outcome      text not null check (outcome ~ '^[a-z_]{1,40}$'),
  approve      text check (approve is null or approve in ('approved', 'failed', 'not_configured'))
);
create index if not exists payment_notices_order_idx on public.payment_notices (order_id, received_at desc);
create index if not exists payment_notices_received_idx on public.payment_notices (received_at desc);

alter table public.payment_notices enable row level security;
revoke all on public.payment_notices from public, anon, authenticated;

-- BINDING, at checkout, right after the order was marked link_created for its owner. Returns:
--   bound            stored now
--   already_bound    the same values were stored before (a retried checkout step): nothing changed
--   conflict         this order already has DIFFERENT link values: refused, nothing changed
--   process_in_use   this identifier already belongs to another order of the same environment and merchant: refused
--   order_not_open   no such order for this owner, or it is not in link_created
--   invalid          malformed arguments
create or replace function public.bind_payment_order_link(
  p_order text, p_owner uuid, p_environment text, p_merchant text, p_process_id text, p_token_hash text, p_token_in_url boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.payment_orders%rowtype;
  l public.payment_order_links%rowtype;
begin
  if p_order is null or p_order !~ '^[0-9a-f]{32}$' or p_owner is null
     or p_environment is null or p_environment not in ('sandbox', 'production')
     or p_merchant is null or p_merchant !~ '^[a-z0-9][a-z0-9_-]{1,31}$'
     or p_process_id is null or p_process_id !~ '^[A-Za-z0-9_-]{1,64}$'
     or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid';
  end if;

  select * into o from public.payment_orders where id = p_order and owner_id = p_owner for update;
  if not found or o.status <> 'link_created' then
    return 'order_not_open';
  end if;

  select * into l from public.payment_order_links where order_id = p_order;
  if found then
    if l.environment = p_environment and l.merchant_ref = p_merchant and l.process_id = p_process_id and l.token_hash = p_token_hash then
      return 'already_bound';
    end if;
    return 'conflict';
  end if;

  begin
    insert into public.payment_order_links (order_id, environment, merchant_ref, process_id, token_hash, token_in_url)
    values (p_order, p_environment, p_merchant, p_process_id, p_token_hash, coalesce(p_token_in_url, false));
  exception when unique_violation then
    return 'process_in_use';
  end;
  return 'bound';
end $$;

-- COMPLETION for the direct Grow notification. Every check below runs in ONE transaction with the order row locked, then hands over
-- to the existing complete_payment_order (unchanged), which alone grants. Returns complete_payment_order's own result, or:
--   link_missing     the order has no stored link identifiers: nothing granted
--   link_mismatch    environment, merchant, process id or token hash differ: nothing granted, nothing written to the order
--   order_not_open   the order is not link_created (or granted, for a duplicate): nothing granted
--   order_not_found / invalid
-- A mismatch writes nothing to payment_orders: an unmatched notification must not be able to touch an order's review trail.
create or replace function public.complete_bound_payment_order(
  p_order text, p_environment text, p_merchant text, p_process_id text, p_token_hash text,
  p_tx text, p_amount numeric, p_currency text, p_provider_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.payment_orders%rowtype;
  l public.payment_order_links%rowtype;
begin
  if p_order is null or p_order !~ '^[0-9a-f]{32}$'
     or p_environment is null or p_environment not in ('sandbox', 'production')
     or p_merchant is null or p_merchant !~ '^[a-z0-9][a-z0-9_-]{1,31}$'
     or p_process_id is null or p_process_id !~ '^[A-Za-z0-9_-]{1,64}$'
     or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_tx is null or p_tx !~ '^[A-Za-z0-9_-]{3,64}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into o from public.payment_orders where id = p_order for update;
  if not found then
    return jsonb_build_object('status', 'order_not_found');
  end if;

  select * into l from public.payment_order_links where order_id = p_order;
  if not found then
    return jsonb_build_object('status', 'link_missing');
  end if;
  if l.environment <> p_environment or l.merchant_ref <> p_merchant
     or l.process_id <> p_process_id or l.token_hash <> p_token_hash then
    return jsonb_build_object('status', 'link_mismatch');
  end if;

  if o.status not in ('link_created', 'granted') then
    return jsonb_build_object('status', 'order_not_open');
  end if;

  return public.complete_payment_order(p_order, p_tx, p_amount, p_currency, p_provider_status);
end $$;

-- NOTICE LOG: one row per notification that passed the source check. Values outside the fixed formats are dropped, not stored.
create or replace function public.log_payment_notice(
  p_environment text, p_order text, p_tx_hash text, p_status_code text, p_shape text, p_outcome text, p_approve text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_outcome is null or p_outcome !~ '^[a-z_]{1,40}$' then
    return false;
  end if;
  insert into public.payment_notices (environment, order_id, tx_hash, status_code, shape, outcome, approve)
  values (
    case when p_environment in ('sandbox', 'production') then p_environment else 'unknown' end,
    case when p_order ~ '^[0-9a-f]{32}$' then p_order end,
    case when p_tx_hash ~ '^[0-9a-f]{64}$' then p_tx_hash end,
    case when p_status_code ~ '^[0-9]{1,3}$' then p_status_code end,
    case when p_shape ~ '^[a-z/]{1,32}$' then p_shape end,
    p_outcome,
    case when p_approve in ('approved', 'failed', 'not_configured') then p_approve end);
  return true;
end $$;

revoke all on function public.bind_payment_order_link(text, uuid, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.complete_bound_payment_order(text, text, text, text, text, text, numeric, text, text) from public, anon, authenticated;
revoke all on function public.log_payment_notice(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.bind_payment_order_link(text, uuid, text, text, text, text, boolean) to service_role;
grant execute on function public.complete_bound_payment_order(text, text, text, text, text, text, numeric, text, text) to service_role;
grant execute on function public.log_payment_notice(text, text, text, text, text, text, text) to service_role;
