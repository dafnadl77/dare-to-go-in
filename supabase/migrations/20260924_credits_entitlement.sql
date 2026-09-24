-- Credits entitlement for signed-in accounts (ONE free dream total = the anonymous
-- trial dream; every further dream costs one purchased credit).
--
-- Everything here is service-role only: RLS is on with NO policies, table privileges are
-- revoked from anon/authenticated, and every function is SECURITY DEFINER with EXECUTE
-- granted to service_role alone. The client can never read or write a balance directly;
-- it asks the server, which asks these functions.
--
-- Additive and inert until the matching server code ships: nothing existing reads or writes
-- these objects, and no existing function is changed.

create table if not exists public.dream_credits (
  owner_id   uuid primary key references auth.users (id) on delete cascade,
  balance    integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id           bigint generated always as identity primary key,
  owner_id     uuid not null references auth.users (id) on delete cascade,
  delta        integer not null check (delta <> 0),
  reason       text not null check (reason in ('purchase', 'spend', 'refund', 'backfill', 'admin')),
  -- Deliberately NOT a foreign key: a refunded attempt row is deleted, its ledger history stays.
  attempt_id   uuid,
  -- The payment provider's own id for a purchase; makes a replayed webhook grant exactly once.
  external_ref text,
  created_at   timestamptz not null default now()
);

create unique index if not exists credit_ledger_external_ref_uidx
  on public.credit_ledger (reason, external_ref) where external_ref is not null;
create unique index if not exists credit_ledger_one_spend_per_attempt_uidx
  on public.credit_ledger (attempt_id) where reason = 'spend';
create unique index if not exists credit_ledger_one_refund_per_attempt_uidx
  on public.credit_ledger (attempt_id) where reason = 'refund';
create index if not exists credit_ledger_owner_idx on public.credit_ledger (owner_id, created_at desc);

alter table public.dream_credits enable row level security;
alter table public.credit_ledger enable row level security;
revoke all on public.dream_credits from public, anon, authenticated;
revoke all on public.credit_ledger from public, anon, authenticated;

-- Spends ONE credit and creates the attempt, atomically. The UPDATE takes the row lock and
-- re-checks `balance >= 1` after any concurrent spender commits, so two parallel requests can
-- never spend the same last credit.
create or replace function public.start_user_attempt(p_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_attempt uuid;
begin
  update public.dream_credits
     set balance = balance - 1, updated_at = now()
   where owner_id = p_owner and balance >= 1;
  if not found then
    return jsonb_build_object('status', 'credits_required');
  end if;
  insert into public.dream_attempts (owner_id) values (p_owner) returning id into v_attempt;
  insert into public.credit_ledger (owner_id, delta, reason, attempt_id)
    values (p_owner, -1, 'spend', v_attempt);
  return jsonb_build_object('status', 'created', 'attempt_id', v_attempt);
end $$;

-- Releases an attempt whose analysis genuinely failed: refunds its credit EXACTLY once (the
-- partial unique index makes a second call a no-op) and deletes the attempt row. An attempt
-- with no recorded spend (created before credits existed) is only deleted, never refunded.
create or replace function public.cancel_user_attempt(p_attempt uuid, p_owner uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_inserted integer;
begin
  insert into public.credit_ledger (owner_id, delta, reason, attempt_id)
    select p_owner, 1, 'refund', p_attempt
      from public.credit_ledger s
     where s.attempt_id = p_attempt and s.reason = 'spend' and s.owner_id = p_owner
    on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    update public.dream_credits set balance = balance + 1, updated_at = now() where owner_id = p_owner;
  end if;
  delete from public.dream_attempts where id = p_attempt and owner_id = p_owner;
  return case when v_inserted = 1 then 'refunded' else 'not_refunded' end;
end $$;

-- Adds credits. The only writer of a positive balance; the future payment webhook is its only
-- caller, after verifying the payment. A purchase MUST carry the provider's external_ref, and
-- replaying the same one grants nothing further.
create or replace function public.grant_credits(p_owner uuid, p_amount integer, p_reason text, p_external_ref text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_inserted integer; v_balance integer;
begin
  if p_amount is null or p_amount < 1 or p_amount > 1000 then
    return jsonb_build_object('status', 'invalid');
  end if;
  if p_reason not in ('purchase', 'backfill', 'admin') then
    return jsonb_build_object('status', 'invalid');
  end if;
  if p_reason = 'purchase' and coalesce(p_external_ref, '') = '' then
    return jsonb_build_object('status', 'invalid');
  end if;
  insert into public.credit_ledger (owner_id, delta, reason, external_ref)
    values (p_owner, p_amount, p_reason, nullif(p_external_ref, ''))
    on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    insert into public.dream_credits (owner_id, balance) values (p_owner, p_amount)
      on conflict (owner_id) do update set balance = public.dream_credits.balance + excluded.balance, updated_at = now();
  end if;
  select balance into v_balance from public.dream_credits where owner_id = p_owner;
  return jsonb_build_object('status', case when v_inserted = 1 then 'granted' else 'duplicate' end, 'balance', coalesce(v_balance, 0));
end $$;

create or replace function public.get_credit_balance(p_owner uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select balance from public.dream_credits where owner_id = p_owner), 0);
$$;

revoke all on function public.start_user_attempt(uuid) from public, anon, authenticated;
revoke all on function public.cancel_user_attempt(uuid, uuid) from public, anon, authenticated;
revoke all on function public.grant_credits(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.get_credit_balance(uuid) from public, anon, authenticated;
grant execute on function public.start_user_attempt(uuid) to service_role;
grant execute on function public.cancel_user_attempt(uuid, uuid) to service_role;
grant execute on function public.grant_credits(uuid, integer, text, text) to service_role;
grant execute on function public.get_credit_balance(uuid) to service_role;
