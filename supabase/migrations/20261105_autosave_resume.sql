-- AUTOSAVE AND RESUME (approved for preparation 2026-11-05). NOT APPLIED TO PRODUCTION: running it needs its own approval.
-- Must be applied BEFORE the code is deployed, and the code deployed right after it, at a quiet time: the code writes dreams through
-- complete_analysis_open_dream, so without the migration every analysis would fail; and from this migration on a dream with no row gets no
-- budget refund, which is every dream in progress under the old code until the new code is live.
--
-- What it changes: refund_attempt_credit_once (only a finished dream that still exists counts; a deleted dream gets none);
-- complete_analysis_open_dream (the analysis and its dream in one transaction); a new closed table dream_ai_requests with three
-- service-only functions (one logical AI request runs once); refund_stale_analyses and purge_finished_ai_requests on a schedule.
-- What it does not change: the dreams table, credit_ledger, balances or any existing row.
--
-- The 330 seconds of a stuck request: longer than the longest a server function may run (300 s), so a run that is still alive is
-- never run a second time in parallel.
--
-- ROLLBACK: supabase/rollbacks/20261105_autosave_resume_rollback.sql (after the previous code is back).

-- 1. Credit refund when the AI budget runs out: only a FINISHED dream counts as saved.
--    A row without journey.status (every dream saved until now) still counts as saved, exactly as today.
--    The dream must still exist: a dream she deleted gets no refund (a failed analysis is refunded by cancel_user_attempt, not here).
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

  perform 1 from public.dream_attempts where id = p_attempt and owner_id = p_owner for update;
  if not found then
    return 'not_found';
  end if;

  if exists (
    select 1 from public.dreams d
     where d.owner_id = p_owner
       and (d.id = p_attempt or d.payload -> 'exploration' ->> 'attemptId' = p_attempt::text)
       and coalesce(d.payload -> 'journey' ->> 'status', 'done') <> 'open'
  ) then
    return 'already_saved';
  end if;

  if not exists (
    select 1 from public.dreams d
     where d.owner_id = p_owner
       and (d.id = p_attempt or d.payload -> 'exploration' ->> 'attemptId' = p_attempt::text)
  ) then
    if exists (select 1 from public.credit_ledger where attempt_id = p_attempt and reason = 'refund') then
      return 'already_refunded';
    end if;
    return 'no_dream';
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

-- 1b. The analysis is recorded and the dream's row is written in one transaction: an analysis that completed always has its dream, so a row
--     that is missing later can only be a dream she deleted, and an old analysis key can never bring it back.
create or replace function public.complete_analysis_open_dream(p_attempt uuid, p_owner uuid, p_result jsonb, p_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.complete_user_analysis(p_attempt, p_owner, p_result) then
    return false;
  end if;
  insert into public.dreams (id, owner_id, created_at, favorite, payload)
    values (p_attempt, p_owner, now(), false, p_payload)
    on conflict (id) do nothing;
  return true;
end $$;

revoke all on function public.complete_analysis_open_dream(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.complete_analysis_open_dream(uuid, uuid, jsonb, jsonb) to service_role;

-- 2. One record per dream of its latest AI request and result. Closed to the browser: RLS on, no policy, no grant.
--    It goes with the dream (cascade), so deleting a dream or an account deletes it too.
create table if not exists public.dream_ai_requests (
  dream_id    uuid primary key references public.dreams(id) on delete cascade,
  owner_id    uuid not null,
  request_key text not null,
  token       uuid not null,
  status      text not null check (status in ('processing', 'done')),
  result      jsonb,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.dream_ai_requests enable row level security;
revoke all on table public.dream_ai_requests from public, anon, authenticated;

-- One logical request runs once, across parallel requests and devices. The lock serializes callers of the same dream.
--   new        run it (take one slot)              done       the finished result: no model, no slot
--   processing the same request is running: wait   retry      the same request is stuck: run it again on its existing slot
--   busy       another request is running: wait    no_dream   not this account's dream, or no row: no record is kept
create or replace function public.claim_dream_ai_request(p_dream uuid, p_owner uuid, p_key text, p_stale_seconds integer default 330)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.dream_ai_requests;
  v_token uuid := gen_random_uuid();
begin
  if p_dream is null or p_owner is null or p_key is null or length(p_key) > 200 then
    return jsonb_build_object('state', 'invalid');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dream-ai:' || p_dream::text, 0));
  if not exists (select 1 from public.dreams where id = p_dream and owner_id = p_owner) then
    return jsonb_build_object('state', 'no_dream');
  end if;

  select * into r from public.dream_ai_requests where dream_id = p_dream;
  if not found then
    insert into public.dream_ai_requests (dream_id, owner_id, request_key, token, status)
      values (p_dream, p_owner, p_key, v_token, 'processing');
    return jsonb_build_object('state', 'new', 'token', v_token);
  end if;

  if r.request_key = p_key then
    if r.status = 'done' then
      return jsonb_build_object('state', 'done', 'result', r.result);
    end if;
    if r.started_at > now() - make_interval(secs => p_stale_seconds) then
      return jsonb_build_object('state', 'processing');
    end if;
    update public.dream_ai_requests set token = v_token, started_at = now() where dream_id = p_dream;
    return jsonb_build_object('state', 'retry', 'token', v_token);
  end if;

  if r.status = 'processing' and r.started_at > now() - make_interval(secs => p_stale_seconds) then
    return jsonb_build_object('state', 'busy');
  end if;
  update public.dream_ai_requests
     set request_key = p_key, token = v_token, status = 'processing', result = null, started_at = now(), finished_at = null
   where dream_id = p_dream;
  return jsonb_build_object('state', 'new', 'token', v_token);
end $$;

-- Only the run that still holds the token can finish: a stuck run that wakes up late changes nothing.
create or replace function public.finish_dream_ai_request(p_dream uuid, p_owner uuid, p_token uuid, p_result jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.dream_ai_requests
     set status = 'done', result = p_result, finished_at = now()
   where dream_id = p_dream and owner_id = p_owner and token = p_token and status = 'processing';
  return found;
end $$;

-- A failed run: the record goes, so the same request can be tried again (its slot is returned by the existing refund).
create or replace function public.release_dream_ai_request(p_dream uuid, p_owner uuid, p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.dream_ai_requests where dream_id = p_dream and owner_id = p_owner and token = p_token;
  return found;
end $$;

-- 3. An analysis that never finished: its credit comes back once, through the existing cancel_user_attempt.
--    Never touches an attempt that has a dream. Returns a count only.
create or replace function public.refund_stale_analyses(p_stale_minutes integer default 15)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  v_count integer := 0;
begin
  if p_stale_minutes is null or p_stale_minutes < 10 then
    raise exception 'stale window must be at least 10 minutes';
  end if;
  for a in
    select t.id, t.owner_id
      from public.dream_attempts t
     where t.analysis_status = 'processing'
       and t.owner_id is not null
       and t.created_at < now() - make_interval(mins => p_stale_minutes)
       and not exists (select 1 from public.dreams d where d.id = t.id)
     for update skip locked
  loop
    perform public.cancel_user_attempt(a.id, a.owner_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- 4. A finished dream no longer needs its request record.
create or replace function public.purge_finished_ai_requests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.dream_ai_requests r
   using public.dreams d
   where d.id = r.dream_id
     and coalesce(d.payload -> 'journey' ->> 'status', 'done') <> 'open';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.claim_dream_ai_request(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.finish_dream_ai_request(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.release_dream_ai_request(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.refund_stale_analyses(integer) from public, anon, authenticated;
revoke all on function public.purge_finished_ai_requests() from public, anon, authenticated;
grant execute on function public.claim_dream_ai_request(uuid, uuid, text, integer) to service_role;
grant execute on function public.finish_dream_ai_request(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.release_dream_ai_request(uuid, uuid, uuid) to service_role;
grant execute on function public.refund_stale_analyses(integer) to service_role;
grant execute on function public.purge_finished_ai_requests() to service_role;

select cron.schedule('refund-stale-analyses', '*/10 * * * *', $cron$select public.refund_stale_analyses(15)$cron$);
select cron.schedule('purge-finished-ai-requests', '17 * * * *', $cron$select public.purge_finished_ai_requests()$cron$);

-- The server's API sees the new functions at once.
notify pgrst, 'reload schema';
