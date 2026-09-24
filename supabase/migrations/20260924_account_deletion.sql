-- Permanent account deletion: the database half.
--
-- The server (server/accountDeletion.ts) deletes an account in this order:
--   1. delete_account_data(user)   <- this migration: ONE transaction for every user-owned row
--   2. purge the user's Storage images and verify none remain
--   3. verify no owned rows remain
--   4. delete the Supabase Auth user LAST
-- Nothing is deleted from Auth until everything that depends on it is already gone.
--
-- Two deliberate decisions, both explained in the delivery report:
--
-- TRIAL HISTORY. trial_identities.converted_user_id is ON DELETE SET NULL, and every trial
-- gate reads `free_dream_completed_at is not null OR converted_user_id is not null`. So if an
-- account claimed a trial WITHOUT a completed dream, deleting the account would silently
-- re-open that anonymous identity's free dream. delete_account_data therefore first marks any
-- trial the account claimed as consumed (free_dream_completed_at = coalesce(existing, now()))
-- and only then removes the personal link (converted_user_id / claimed_at). What survives is the
-- non-personal fact "this anonymous identity has used its one free dream" — no user id, no
-- email, no timestamp of the claim.
--
-- CREDIT LEDGER. The purchase record (a row with the payment provider's external_ref) is kept,
-- but ANONYMIZED (owner_id set NULL), because a replayed payment webhook must still hit the
-- unique (reason, external_ref) index and grant nothing, and because payment records may have
-- to be retained for accounting. Every other ledger row (spends, refunds, backfills, admin
-- grants without a provider reference) is deleted, and the balance row is deleted. Unspent
-- purchased credits are forfeited with the account. The ledger FK therefore changes from
-- ON DELETE CASCADE to ON DELETE SET NULL, and owner_id becomes nullable.

alter table public.credit_ledger alter column owner_id drop not null;
alter table public.credit_ledger drop constraint if exists credit_ledger_owner_id_fkey;
alter table public.credit_ledger
  add constraint credit_ledger_owner_id_fkey
  foreign key (owner_id) references auth.users (id) on delete set null;

create or replace function public.delete_account_data(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_trials integer; n_patterns integer; n_attempts integer; n_dreams integer;
  n_ledger_deleted integer; n_ledger_anonymized integer; n_credits integer;
begin
  if p_user is null then
    raise exception 'user id is required';
  end if;

  -- Serialize against a concurrent credit spend for this account (start_user_attempt updates this row).
  perform 1 from public.dream_credits where owner_id = p_user for update;

  -- 1. Trial lifetime protection: consume first, unlink second (see header).
  update public.trial_identities
     set free_dream_completed_at = coalesce(free_dream_completed_at, now()),
         converted_user_id = null,
         claimed_at = null
   where converted_user_id = p_user;
  get diagnostics n_trials = row_count;

  -- 2. Personal content.
  delete from public.pattern_reflections where owner_id = p_user;
  get diagnostics n_patterns = row_count;
  delete from public.dream_attempts where owner_id = p_user;
  get diagnostics n_attempts = row_count;
  delete from public.dreams where owner_id = p_user;
  get diagnostics n_dreams = row_count;

  -- 3. Credits: keep only anonymized payment records.
  delete from public.credit_ledger where owner_id = p_user and external_ref is null;
  get diagnostics n_ledger_deleted = row_count;
  update public.credit_ledger set owner_id = null where owner_id = p_user;
  get diagnostics n_ledger_anonymized = row_count;
  delete from public.dream_credits where owner_id = p_user;
  get diagnostics n_credits = row_count;

  return jsonb_build_object(
    'trials_unlinked', n_trials,
    'pattern_reflections', n_patterns,
    'attempts', n_attempts,
    'dreams', n_dreams,
    'ledger_deleted', n_ledger_deleted,
    'ledger_anonymized', n_ledger_anonymized,
    'credit_rows', n_credits
  );
end $$;

-- True only when NOTHING user-owned is left in the database (used right before the Auth user is deleted).
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
       + (select count(*) from public.trial_identities where converted_user_id = p_user);
$$;

revoke all on function public.delete_account_data(uuid) from public, anon, authenticated;
revoke all on function public.account_data_remaining(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_data(uuid) to service_role;
grant execute on function public.account_data_remaining(uuid) to service_role;
