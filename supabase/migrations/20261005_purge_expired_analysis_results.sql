-- Scheduled purge of the temporarily stored idempotent analysis result.
--
-- start_user_attempt_idem only cleared an expired analysis_result when the SAME account started
-- another analysis, so a result could outlive its ~2 hour retention for an account that never
-- came back. This clears it on a schedule instead, independent of any user.
--
-- What it clears: dream_attempts.analysis_result (the personal content), and nothing else.
-- What it keeps: the attempt row itself, its status ('succeeded'), idempotency_key, input_hash,
-- owner, counters, completed_at and saved_dream_id. So ownership, accounting, the unique key and
-- the per-attempt image/reflection/label limits are unchanged, and a late replay of an expired
-- key answers 'expired' exactly as before. Rows still 'processing' have no result and are never
-- touched. Saved dreams, credits, the ledger and anonymous trials are not referenced at all.
--
-- Retention is measured from the attempt's created_at, the same anchor start_user_attempt_idem
-- uses, so both paths agree. Idempotent: a second run clears nothing more.
-- Returns only a COUNT (cron's run log therefore never contains dream content).

create or replace function public.purge_expired_analysis_results(p_retention_hours integer default 2)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_cleared integer;
begin
  if p_retention_hours is null or p_retention_hours < 1 then
    raise exception 'retention must be at least 1 hour';
  end if;
  update public.dream_attempts
     set analysis_result = null
   where analysis_result is not null
     and analysis_status = 'succeeded'
     and created_at < now() - make_interval(hours => p_retention_hours);
  get diagnostics v_cleared = row_count;
  return v_cleared;
end $$;

revoke all on function public.purge_expired_analysis_results(integer) from public, anon, authenticated;
grant execute on function public.purge_expired_analysis_results(integer) to service_role;

-- Every 10 minutes: a result lives at most ~2h10m, matching "up to about 2 hours".
create extension if not exists pg_cron;

select cron.schedule(
  'purge-expired-analysis-results',
  '*/10 * * * *',
  $cron$select public.purge_expired_analysis_results(2)$cron$
);
