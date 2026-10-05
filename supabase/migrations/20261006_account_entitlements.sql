-- Durable account entitlements (first one: `dream_journal_export`, included with DIVE IN only).
--
-- Why a table and not "credits > 0": the Dream Journal export is a PERMANENT perk of having bought
-- DIVE IN. It must survive the 25 credits being used up, and it must not be inferred from the credit
-- balance, the number of archived dreams or past usage. So it is its own durable fact:
-- (owner, entitlement) exists or it does not.
--
-- Idempotency: the primary key is (owner_id, entitlement), so granting again (a repeat DIVE IN
-- purchase, a replayed webhook) is a harmless no-op that keeps the first grant's audit fields. The
-- payment itself stays recorded, idempotently, in credit_ledger via grant_credits' (reason, external_ref)
-- unique index; this table never duplicates payments or credits.
--
-- Service-role only, like the credits tables: RLS on with no policies, no client privileges. The
-- server asks has_entitlement(owner) with the owner taken from the verified token; a client can never
-- read, grant or remove one. The future payment webhook is the only intended caller of grant_entitlement
-- (Grow is NOT implemented here).
--
-- Account deletion: the rows are owned data. delete_account_data now deletes them and
-- account_data_remaining counts them, so the "nothing owned remains" check before the Auth user is
-- deleted covers them (the FK cascade would also remove them, but the explicit check keeps the
-- ordered, verified deletion honest).

create table if not exists public.account_entitlements (
  owner_id     uuid not null references auth.users (id) on delete cascade,
  entitlement  text not null check (entitlement in ('dream_journal_export')),
  source       text not null check (source in ('purchase', 'admin', 'backfill')),
  external_ref text,
  granted_at   timestamptz not null default now(),
  primary key (owner_id, entitlement)
);

alter table public.account_entitlements enable row level security;
revoke all on public.account_entitlements from public, anon, authenticated;

create or replace function public.grant_entitlement(p_owner uuid, p_entitlement text, p_source text, p_external_ref text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_inserted integer;
begin
  if p_owner is null or p_entitlement is distinct from 'dream_journal_export' then
    return jsonb_build_object('status', 'invalid');
  end if;
  if p_source is null or p_source not in ('purchase', 'admin', 'backfill') then
    return jsonb_build_object('status', 'invalid');
  end if;
  if p_source = 'purchase' and coalesce(p_external_ref, '') = '' then
    return jsonb_build_object('status', 'invalid');
  end if;
  insert into public.account_entitlements (owner_id, entitlement, source, external_ref)
    values (p_owner, p_entitlement, p_source, nullif(p_external_ref, ''))
    on conflict (owner_id, entitlement) do nothing;
  get diagnostics v_inserted = row_count;
  return jsonb_build_object('status', case when v_inserted = 1 then 'granted' else 'already_granted' end);
end $$;

create or replace function public.has_entitlement(p_owner uuid, p_entitlement text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.account_entitlements where owner_id = p_owner and entitlement = p_entitlement);
$$;

revoke all on function public.grant_entitlement(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.has_entitlement(uuid, text) from public, anon, authenticated;
grant execute on function public.grant_entitlement(uuid, text, text, text) to service_role;
grant execute on function public.has_entitlement(uuid, text) to service_role;

-- Account deletion: include the new owned table (bodies otherwise identical to 20260924_account_deletion.sql).
create or replace function public.delete_account_data(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_trials integer; n_patterns integer; n_attempts integer; n_dreams integer;
  n_ledger_deleted integer; n_ledger_anonymized integer; n_credits integer; n_entitlements integer;
begin
  if p_user is null then
    raise exception 'user id is required';
  end if;

  perform 1 from public.dream_credits where owner_id = p_user for update;

  update public.trial_identities
     set free_dream_completed_at = coalesce(free_dream_completed_at, now()),
         converted_user_id = null,
         claimed_at = null
   where converted_user_id = p_user;
  get diagnostics n_trials = row_count;

  delete from public.pattern_reflections where owner_id = p_user;
  get diagnostics n_patterns = row_count;
  delete from public.dream_attempts where owner_id = p_user;
  get diagnostics n_attempts = row_count;
  delete from public.dreams where owner_id = p_user;
  get diagnostics n_dreams = row_count;

  delete from public.credit_ledger where owner_id = p_user and external_ref is null;
  get diagnostics n_ledger_deleted = row_count;
  update public.credit_ledger set owner_id = null where owner_id = p_user;
  get diagnostics n_ledger_anonymized = row_count;
  delete from public.dream_credits where owner_id = p_user;
  get diagnostics n_credits = row_count;

  delete from public.account_entitlements where owner_id = p_user;
  get diagnostics n_entitlements = row_count;

  return jsonb_build_object(
    'trials_unlinked', n_trials,
    'pattern_reflections', n_patterns,
    'attempts', n_attempts,
    'dreams', n_dreams,
    'ledger_deleted', n_ledger_deleted,
    'ledger_anonymized', n_ledger_anonymized,
    'credit_rows', n_credits,
    'entitlements', n_entitlements
  );
end $$;

create or replace function public.account_data_remaining(p_user uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select (select count(*) from public.dreams where owner_id = p_user)
       + (select count(*) from public.pattern_reflections where owner_id = p_user)
       + (select count(*) from public.dream_attempts where owner_id = p_user)
       + (select count(*) from public.dream_credits where owner_id = p_user)
       + (select count(*) from public.credit_ledger where owner_id = p_user)
       + (select count(*) from public.account_entitlements where owner_id = p_user)
       + (select count(*) from public.trial_identities where converted_user_id = p_user);
$$;

revoke all on function public.delete_account_data(uuid) from public, anon, authenticated;
revoke all on function public.account_data_remaining(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;
grant execute on function public.account_data_remaining(uuid) to service_role;
