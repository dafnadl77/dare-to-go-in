-- Payment orders for the Grow-through-Make checkout (initiation half).
--
-- WRITTEN, NOT APPLIED. Additive and inert: nothing existing reads or writes these objects, and no existing
-- function is changed. Completion (granting credits for a verified payment) is a LATER migration/function.
--
-- A purchase starts with a row here, created by the server for the VERIFIED account BEFORE Make/Grow are
-- called. The row's id is the only thing Make and Grow ever see (an opaque, unguessable 32-hex string; no
-- account id, no email). Amount and credits are fixed per package, enforced by a CHECK so even a buggy server
-- cannot record a package at the wrong price.
--
-- Everything is service-role only: RLS on with NO policies, table privileges revoked from clients, and every
-- function SECURITY DEFINER with EXECUTE granted to service_role alone.
--
-- Account deletion: the owner FK is ON DELETE SET NULL, so deleting the auth user anonymizes the order (same
-- principle as credit_ledger: payment records are kept without the person). delete_account_data needs no change.

create table if not exists public.payment_orders (
  id            text primary key default replace(gen_random_uuid()::text, '-', ''),
  owner_id      uuid references auth.users (id) on delete set null,
  package_id    text not null check (package_id in ('go_deeper_3', 'explore_10', 'dive_in_25')),
  amount_ils    integer not null,
  credits       integer not null,
  status        text not null default 'created'
                check (status in ('created', 'link_created', 'link_failed', 'paid', 'granted', 'rejected')),
  -- Filled by the later completion step: Grow's own transaction id (unique: one transaction can fund one order).
  provider_tx   text,
  created_at    timestamptz not null default now(),
  link_created_at timestamptz,
  paid_at       timestamptz,
  granted_at    timestamptz,
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

revoke all on function public.create_payment_order(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.set_payment_order_link_status(text, uuid, text) from public, anon, authenticated;
grant execute on function public.create_payment_order(uuid, text, integer, integer) to service_role;
grant execute on function public.set_payment_order_link_status(text, uuid, text) to service_role;
