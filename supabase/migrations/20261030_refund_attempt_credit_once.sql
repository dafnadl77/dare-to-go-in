-- Returns a dream's credit ONCE when DARE's AI budget ran out after the dream began (OpenAI answered 429 insufficient_quota on a later
-- step: the image, the moments' titles or questions, the conversation, the whole view or the reflection). Approved 2026-10-30
-- (docs/upgrade-2026-10/budget-cap-credit-protection-design-2026-10-30.md). NOT YET APPLIED TO PRODUCTION: that needs its own approval.
--
-- What it does, and only this:
--   * Only for the attempt's own account, and only if a credit was really spent on THIS attempt (a 'spend' ledger row). An account that
--     spends nothing (the app owner, an account with unlimited access) and a guest are never credited.
--   * Never after the dream was saved: a saved dream in the archive whose journey names this attempt means nothing is returned.
--   * At most once per attempt, enforced by the existing partial unique index credit_ledger_one_refund_per_attempt_uidx (the same index
--     that keeps cancel_user_attempt's refund single). A second call, a concurrent call, or a call after cancel_user_attempt adds nothing.
--   * The attempt is KEPT (unlike cancel_user_attempt): the dream stays open on her screen and continues on the same attempt, with its own
--     per-step slots, when the budget is back. It does not start a new dream and grants nothing else.
--
-- Returns: 'refunded' | 'already_refunded' | 'nothing_spent' | 'already_saved' | 'not_found' | 'invalid'.
-- Service-role only: SECURITY DEFINER with EXECUTE granted to service_role alone, like every other credit function.
--
-- ROLLBACK: drop function public.refund_attempt_credit_once(uuid, uuid);  (no table, column or data is changed by this migration)

create or replace function public.refund_attempt_credit_once(p_attempt uuid, p_owner uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
begin
  if p_attempt is null or p_owner is null then
    return 'invalid';
  end if;

  -- the attempt is locked, so two simultaneous refunds for it are handled one after the other
  perform 1 from public.dream_attempts where id = p_attempt and owner_id = p_owner for update;
  if not found then
    return 'not_found';
  end if;

  if exists (
    select 1 from public.dreams d
     where d.owner_id = p_owner
       and d.payload -> 'exploration' ->> 'attemptId' = p_attempt::text
  ) then
    return 'already_saved';
  end if;

  insert into public.credit_ledger (owner_id, delta, reason, attempt_id)
    select p_owner, 1, 'refund', p_attempt
      from public.credit_ledger s
     where s.attempt_id = p_attempt and s.reason = 'spend' and s.owner_id = p_owner
    on conflict do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    update public.dream_credits set balance = balance + 1, updated_at = now() where owner_id = p_owner;
    return 'refunded';
  end if;

  if exists (select 1 from public.credit_ledger where attempt_id = p_attempt and reason = 'refund') then
    return 'already_refunded';
  end if;
  return 'nothing_spent';
end $$;

revoke all on function public.refund_attempt_credit_once(uuid, uuid) from public, anon, authenticated;
grant execute on function public.refund_attempt_credit_once(uuid, uuid) to service_role;
