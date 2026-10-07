-- Payment orders for the Grow-through-Make purchase flow: checkout initiation AND completion.
--
-- APPLIED to production on 2026-10-07, after a rollback dry-run on the production database (identical function definitions, no data
-- touched). Additive: nothing existing reads or writes these objects and no existing function is changed.
-- It CALLS the existing public.grant_credits (credits migration), the only writer of a positive balance.
--
-- A purchase starts with a row here, created by the server for the VERIFIED account BEFORE Make/Grow are called. The
-- row's id is the only thing Make and Grow ever see (an opaque, unguessable 32-hex string; no account id, no email).
-- Amount and credits are fixed per package, enforced by a CHECK so even a buggy server cannot record a package at the
-- wrong price.
--
-- Completion (complete_payment_order) is the ONLY place a purchase becomes credits. It takes the order id and the payment
-- facts reported by Make, but derives owner, expected amount and credit count from THIS table, never from the caller. It is
-- atomic and idempotent: the order row is locked, the ledger's unique (reason, external_ref) index and the unique
-- provider_tx index make a replay, a retry or a reused transaction grant nothing further.
--
-- A notification NEVER closes an order. A non-paid report only records the last status seen; an amount/currency mismatch (or a
-- deleted owner) grants nothing and is written to the review_* columns for manual review, but the order stays open: only a later
-- notification that is independently valid (paid, right amount, right currency, living owner) can complete it.
--
-- Everything is service-role only: RLS on with NO policies, table privileges revoked from clients, and every function
-- SECURITY DEFINER with EXECUTE granted to service_role alone.
--
-- Account deletion: the owner FK is ON DELETE SET NULL, so deleting the auth user anonymizes the order (same principle as
-- credit_ledger: payment records are kept without the person). Only non-personal audit data is stored: no payer name, phone
-- or email, no card data. delete_account_data needs no change.

create table if not exists public.payment_orders (
  id              text primary key default replace(gen_random_uuid()::text, '-', ''),
  owner_id        uuid references auth.users (id) on delete set null,
  package_id      text not null check (package_id in ('go_deeper_3', 'explore_10', 'dive_in_25')),
  amount_ils      integer not null,
  credits         integer not null,
  status          text not null default 'created'
                  check (status in ('created', 'link_created', 'link_failed', 'granted')),
  created_at      timestamptz not null default now(),
  link_created_at timestamptz,
  -- Verified completion facts (audit trail; no personal data).
  provider_tx     text,          -- Grow's immutable transaction id of the payment that completed the order (unique)
  provider_status text,          -- the latest status text Make reported for this order (<= 64 chars), paid or not
  last_notice_at  timestamptz,   -- when a notification last arrived (any status)
  paid_amount_ils numeric(10, 2),
  paid_currency   text,
  paid_at         timestamptz,
  granted_at      timestamptz,
  -- Manual-review trail for a paid report that could NOT be applied (the order stays open):
  review_tx         text,
  review_reason     text,        -- amount_mismatch | currency_mismatch | owner_deleted
  review_amount_ils numeric(10, 2),
  review_currency   text,
  review_at         timestamptz,
  constraint payment_orders_package_price check (
    (package_id = 'go_deeper_3' and amount_ils = 59  and credits = 3)  or
    (package_id = 'explore_10'  and amount_ils = 149 and credits = 10) or
    (package_id = 'dive_in_25'  and amount_ils = 279 and credits = 25)
  )
);

create unique index if not exists payment_orders_provider_tx_uidx
  on public.payment_orders (provider_tx) where provider_tx is not null;
create index if not exists payment_orders_owner_created_idx
  on public.payment_orders (owner_id, created_at desc);

alter table public.payment_orders enable row level security;
revoke all on public.payment_orders from public, anon, authenticated;

-- Creates an order for `p_owner`. At most 5 orders per account per 10 minutes (every order creates a payment link
-- in the shop's Grow account, so this keeps a signed-in user from flooding it). The advisory lock makes the count
-- race-free for one account.
create or replace function public.create_payment_order(p_owner uuid, p_package text, p_amount integer, p_credits integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id text;
begin
  if p_owner is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text, 7));
  if (select count(*) from public.payment_orders
       where owner_id = p_owner and created_at > now() - interval '10 minutes') >= 5 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  insert into public.payment_orders (owner_id, package_id, amount_ils, credits)
    values (p_owner, p_package, p_amount, p_credits)
    returning id into v_id;
  return jsonb_build_object('status', 'created', 'order_id', v_id);
end $$;

-- Records whether Make returned a payment link. Only a still-'created' order of that owner can move, once.
create or replace function public.set_payment_order_link_status(p_order text, p_owner uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('link_created', 'link_failed') then
    return false;
  end if;
  update public.payment_orders
     set status = p_status,
         link_created_at = case when p_status = 'link_created' then now() else link_created_at end
   where id = p_order and owner_id = p_owner and status = 'created';
  return found;
end $$;

-- COMPLETION. Called only by the server after it authenticated Make, and only for a payment Make normalized to "paid". Returns:
--   granted                          credits added now (first time)
--   duplicate                        the same transaction already completed this order: nothing added, safe to answer 200
--   order_not_found                  no such order
--   transaction_used_by_other_order  this transaction already belongs to / was reviewed on another order: refused
--   order_already_completed          the order was completed with a DIFFERENT transaction: refused
--   amount_mismatch / currency_mismatch / owner_gone
--                                    nothing granted; recorded in review_* for manual review; the order stays OPEN
--   invalid                          malformed arguments
-- The owner, the expected amount and the credit count come from the ORDER row, never from the caller.
create or replace function public.complete_payment_order(
  p_order text, p_tx text, p_amount numeric, p_currency text, p_provider_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.payment_orders%rowtype;
  v_grant jsonb;
  v_reason text;
  v_status text := left(coalesce(p_provider_status, ''), 64);
begin
  if p_order is null or p_order !~ '^[0-9a-f]{32}$'
     or p_tx is null or p_tx !~ '^[A-Za-z0-9_-]{3,64}$'
     or p_amount is null or p_amount <= 0
     or p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into o from public.payment_orders where id = p_order for update;
  if not found then
    return jsonb_build_object('status', 'order_not_found');
  end if;

  if exists (select 1 from public.payment_orders
              where id <> p_order and (provider_tx = p_tx or review_tx = p_tx)) then
    return jsonb_build_object('status', 'transaction_used_by_other_order');
  end if;

  if o.status = 'granted' then
    if o.provider_tx = p_tx then
      return jsonb_build_object('status', 'duplicate', 'balance', public.get_credit_balance(o.owner_id));
    end if;
    return jsonb_build_object('status', 'order_already_completed');
  end if;

  v_reason := case
    when o.owner_id is null then 'owner_deleted'
    when p_currency <> 'ILS' then 'currency_mismatch'
    when p_amount <> o.amount_ils then 'amount_mismatch'
    else null
  end;
  if v_reason is not null then
    update public.payment_orders
       set review_tx = p_tx, review_reason = v_reason, review_amount_ils = p_amount, review_currency = p_currency,
           review_at = now(), provider_status = v_status, last_notice_at = now()
     where id = p_order;
    return jsonb_build_object('status', case v_reason when 'owner_deleted' then 'owner_gone' else v_reason end);
  end if;

  v_grant := public.grant_credits(o.owner_id, o.credits, 'purchase', 'grow:' || p_tx);
  if v_grant->>'status' is distinct from 'granted' then
    -- Cannot happen while the checks above hold; fail loudly (the whole transaction rolls back) rather than guess.
    raise exception 'payment completion: grant did not apply (%)', v_grant->>'status';
  end if;

  update public.payment_orders
     set status = 'granted', provider_tx = p_tx, provider_status = v_status, last_notice_at = now(),
         paid_amount_ils = p_amount, paid_currency = p_currency, paid_at = now(), granted_at = now()
   where id = p_order;
  return jsonb_build_object('status', 'granted', 'balance', (v_grant->>'balance')::integer);
end $$;

-- A NON-PAID report (failed / cancelled / pending as Make normalized it). Grants nothing and closes nothing: it only remembers the
-- last status text and when it arrived, so the order stays eligible for a later legitimate paid notification.
create or replace function public.record_payment_notice(p_order text, p_provider_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_order is null or p_order !~ '^[0-9a-f]{32}$' then
    return false;
  end if;
  update public.payment_orders
     set provider_status = left(coalesce(p_provider_status, ''), 64), last_notice_at = now()
   where id = p_order and status <> 'granted';
  return found;
end $$;

-- What the customer's return page may learn about ITS OWN order: 'confirmed' (credits added), 'pending', or 'unknown' (no such
-- order for this account: a foreign order id looks exactly like a missing one).
create or replace function public.get_payment_order_state(p_order text, p_owner uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select case when status = 'granted' then 'confirmed' else 'pending' end
       from public.payment_orders where id = p_order and owner_id = p_owner),
    'unknown');
$$;

revoke all on function public.create_payment_order(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.set_payment_order_link_status(text, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_payment_order(text, text, numeric, text, text) from public, anon, authenticated;
revoke all on function public.record_payment_notice(text, text) from public, anon, authenticated;
revoke all on function public.get_payment_order_state(text, uuid) from public, anon, authenticated;
grant execute on function public.create_payment_order(uuid, text, integer, integer) to service_role;
grant execute on function public.set_payment_order_link_status(text, uuid, text) to service_role;
grant execute on function public.complete_payment_order(text, text, numeric, text, text) to service_role;
grant execute on function public.record_payment_notice(text, text) to service_role;
grant execute on function public.get_payment_order_state(text, uuid) to service_role;
