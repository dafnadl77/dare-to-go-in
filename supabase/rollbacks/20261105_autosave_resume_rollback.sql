-- ROLLBACK of 20261105_autosave_resume.sql. NOT APPLIED. Running it needs its own approval.
-- Order: the previous code goes back first (Vercel), then this. The new code needs what this removes.
--
-- What it removes: the two scheduled jobs, the six functions, and the table dream_ai_requests (only DARE's latest reply of open dreams,
-- temporary by design: an open dream asks again and the model answers anew, on a slot of the dream).
-- What it restores: refund_attempt_credit_once, exactly as 20261030_refund_attempt_credit_once.sql wrote it.
-- What it does not touch: dreams, dream_attempts, credit_ledger, balances, Storage. Dreams opened meanwhile stay in the account.

begin;

select cron.unschedule(jobname) from cron.job where jobname in ('refund-stale-analyses', 'purge-finished-ai-requests');

drop function if exists public.complete_analysis_open_dream(uuid, uuid, jsonb, jsonb);
drop function if exists public.purge_finished_ai_requests();
drop function if exists public.refund_stale_analyses(integer);
drop function if exists public.release_dream_ai_request(uuid, uuid, uuid);
drop function if exists public.finish_dream_ai_request(uuid, uuid, uuid, jsonb);
drop function if exists public.claim_dream_ai_request(uuid, uuid, text, integer);
drop table if exists public.dream_ai_requests;

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

commit;
