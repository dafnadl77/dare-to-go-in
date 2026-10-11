-- ONE free dream per person, whether they first tried DARE as a guest or signed up first.
--
--   * a guest who finishes the free dream and then signs up gets nothing more (their trial is marked completed);
--   * someone who signs up BEFORE starting a dream gets one free dream, as one credit in the existing credit ledger (reason 'free');
--   * a guest who signs up in the middle of a dream keeps their free dream: if that dream already produced its image or reflection it
--     counts as the free dream (and is refunded by the ordinary cancel path if it later fails); a half-started one is dropped and the
--     free credit is theirs;
--   * the decision is made exactly ONCE per account (primary key + a ledger unique index on 'free:<owner>'), under an advisory lock, so a
--     refresh, a double click, two tabs or a second device can never produce a second one.
--
-- The guest -> account link is the server-verified, signed trial cookie of the request itself (never anything the browser names). A trial
-- already claimed by ANOTHER account in the same browser gives the new account no free dream. Only a CONFIRMED e-mail account can receive
-- one, the app owner never needs one, and a global daily cap bounds the spend (the decision is simply retried later when it is reached).
--
-- Purchased credits, the owner role and every existing function are untouched: the only change to an existing object is that the ledger's
-- reason CHECK also accepts 'free'. Service-role only, like every other credit object. Existing accounts are decided lazily the first time
-- the server looks at them (no backfill here).
--
-- ROLLBACK (nothing else depends on it; any 'free' ledger rows must be removed first if the CHECK is restored):
--   drop function public.decide_account_free_dream(uuid, uuid, integer); drop table public.free_dream_decisions;
--   delete from public.credit_ledger where reason = 'free'; (then restore the CHECK without 'free')

alter table public.credit_ledger drop constraint if exists credit_ledger_reason_check;
alter table public.credit_ledger add constraint credit_ledger_reason_check
  check (reason in ('purchase', 'spend', 'refund', 'backfill', 'admin', 'free'));

create index if not exists credit_ledger_free_created_idx on public.credit_ledger (created_at) where reason = 'free';

create table if not exists public.free_dream_decisions (
  owner_id   uuid primary key references auth.users (id) on delete cascade,
  outcome    text not null check (outcome in ('granted', 'used_inflight', 'used_as_guest', 'legacy_used', 'browser_used', 'owner')),
  trial_id   uuid,
  decided_at timestamptz not null default now()
);

alter table public.free_dream_decisions enable row level security;
revoke all on public.free_dream_decisions from public, anon, authenticated;

-- Decides (once) whether this account has a free dream, and gives it. Returns
--   {status:'decided', outcome, new, balance}   decided now (new = true) or earlier (new = false)
--   {status:'unavailable'}                      the daily cap is reached: nothing was changed, ask again later
--   {status:'unconfirmed'}                      the e-mail is not confirmed yet: nothing was changed
--   {status:'unknown_user'} / {status:'invalid'}
create or replace function public.decide_account_free_dream(p_owner uuid, p_trial uuid, p_daily_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing   text;
  v_confirmed  timestamptz;
  t            public.trial_identities%rowtype;
  v_other      boolean := false;
  v_moved      uuid[] := '{}';
  v_completed  boolean;
  v_legacy     boolean;
  v_inserted   integer;
  v_progressed uuid;
  v_outcome    text;
begin
  if p_owner is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('free-dream:' || p_owner::text, 3));

  select outcome into v_existing from public.free_dream_decisions where owner_id = p_owner;
  if found then
    return jsonb_build_object('status', 'decided', 'outcome', v_existing, 'new', false, 'balance', public.get_credit_balance(p_owner));
  end if;

  select email_confirmed_at into v_confirmed from auth.users where id = p_owner;
  if not found then
    return jsonb_build_object('status', 'unknown_user');
  end if;
  if v_confirmed is null then
    return jsonb_build_object('status', 'unconfirmed');
  end if;

  if public.is_app_owner(p_owner) then
    insert into public.free_dream_decisions (owner_id, outcome) values (p_owner, 'owner');
    return jsonb_build_object('status', 'decided', 'outcome', 'owner', 'new', true, 'balance', public.get_credit_balance(p_owner));
  end if;

  if p_daily_limit is not null and p_daily_limit > 0
     and (select count(*) from public.credit_ledger where reason = 'free' and created_at > now() - interval '24 hours') >= p_daily_limit then
    return jsonb_build_object('status', 'unavailable');
  end if;

  -- Link the guest this browser was (same lock key as create_trial_attempt / complete_trial_attempt, so a guest finishing at this very
  -- moment is seen consistently): the trial becomes the account's, with its attempt history.
  if p_trial is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_trial::text, 0));
    select * into t from public.trial_identities where id = p_trial for update;
    if found then
      if t.converted_user_id is null then
        update public.trial_identities set converted_user_id = p_owner, claimed_at = now() where id = p_trial;
        select coalesce(array_agg(id), '{}') into v_moved from public.dream_attempts where trial_id = p_trial;
        update public.dream_attempts set owner_id = p_owner, trial_id = null where trial_id = p_trial;
      elsif t.converted_user_id <> p_owner then
        v_other := true;
      end if;
    end if;
  end if;

  v_completed := exists (select 1 from public.trial_identities where converted_user_id = p_owner and free_dream_completed_at is not null);
  -- An attempt of this account that never spent a credit is a free dream it already received (the way it was before accounts had one).
  v_legacy := exists (
    select 1 from public.dream_attempts a
     where a.owner_id = p_owner
       and not (a.id = any (v_moved))
       and not exists (select 1 from public.credit_ledger l where l.attempt_id = a.id and l.reason = 'spend'));

  if v_completed then
    v_outcome := 'used_as_guest';
  elsif v_legacy then
    v_outcome := 'legacy_used';
  elsif v_other then
    v_outcome := 'browser_used';
  else
    insert into public.credit_ledger (owner_id, delta, reason, external_ref)
      values (p_owner, 1, 'free', 'free:' || p_owner::text)
      on conflict do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 1 then
      insert into public.dream_credits (owner_id, balance) values (p_owner, 1)
        on conflict (owner_id) do update set balance = public.dream_credits.balance + 1, updated_at = now();
    end if;
    -- A guest dream that already produced its image or reflection IS the free dream: the credit is spent on it (and comes back through
    -- the ordinary cancel path if that attempt is later released).
    select id into v_progressed from public.dream_attempts
     where id = any (v_moved) and (image_count > 0 or reflection_count > 0)
     order by created_at desc limit 1;
    if v_progressed is not null and v_inserted = 1 then
      update public.dream_credits set balance = balance - 1, updated_at = now() where owner_id = p_owner and balance >= 1;
      insert into public.credit_ledger (owner_id, delta, reason, attempt_id) values (p_owner, -1, 'spend', v_progressed);
      v_outcome := 'used_inflight';
    else
      v_outcome := 'granted';
    end if;
    -- Half-started guest attempts (analysis only) are not a dream the person received: dropped, so they cannot be continued ON TOP of the credit.
    delete from public.dream_attempts
     where id = any (v_moved) and id is distinct from v_progressed and image_count = 0 and reflection_count = 0 and completed_at is null;
  end if;

  insert into public.free_dream_decisions (owner_id, outcome, trial_id) values (p_owner, v_outcome, p_trial);
  return jsonb_build_object('status', 'decided', 'outcome', v_outcome, 'new', true, 'balance', public.get_credit_balance(p_owner));
end $$;

revoke all on function public.decide_account_free_dream(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.decide_account_free_dream(uuid, uuid, integer) to service_role;
