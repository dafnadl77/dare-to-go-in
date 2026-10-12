-- FIX: a NEW, confirmed account no longer loses its free dream because the browser it signs up in carries a guest cookie that is already
-- claimed by a DIFFERENT account.
--
-- What happened (production, 2026-10-12): the owner's browser still held the owner's old guest cookie; a brand-new account verified its
-- e-mail there, the decision saw 'this trial belongs to another account' and recorded 'browser_used' — no free credit, no dream used, yet the
-- dreamer was told her free dream was used. Eligibility must come from VERIFIED facts about THIS account (a guest dream it finished, an attempt
-- it already received, the one-time decision itself), never from whose cookie happens to be in the browser. So:
--   * a cookie whose trial belongs to another account is ignored;
--   * a cookie whose trial is unclaimed is still linked to this account, and a guest dream that trial FINISHED still counts as this person's
--     free dream (a guest who finished and then signs up gets nothing more) — that is the server's own record of a completed dream;
--   * 'a guest dream that was finished' means a COMPLETED ATTEMPT of this person (the evidence), not the trial's completion flag, which account
--     deletion also sets on trials that never finished anything — a browser holding such a leftover cookie must not cost a new person their dream;
--   * 'browser_used' stays an allowed value so existing rows remain valid, but is never produced again.
-- Nothing else changes: same signature, privileges, cap, owner exemption, in-flight handling.
--
-- ROLLBACK: re-run 20261011_account_free_dream.sql (it redefines this function).

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
      end if;
      -- A trial that ALREADY belongs to another account (the owner's own old test, a family member on a shared computer, an account since
      -- deleted) is simply not this person's: it is ignored, and it neither grants nor denies anything here.
    end if;
  end if;

  -- A guest dream this person REALLY finished leaves a completed attempt behind (only complete_trial_attempt sets completed_at). The trial's own
  -- free_dream_completed_at flag is NOT evidence: account deletion sets it on trials that never finished anything, to keep them consumed.
  v_completed := exists (select 1 from public.dream_attempts where owner_id = p_owner and completed_at is not null);
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
