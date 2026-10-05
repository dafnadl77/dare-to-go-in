-- Idempotent paid analysis for signed-in accounts.
--
-- Problem: start_user_attempt spends one credit per call, the attempt row carries no
-- identity for "the same submitted dream", and the analysis result is never stored. A client
-- that times out, disconnects, refreshes or retries therefore spends a second credit while the
-- first request may still be completing (and the first result is lost).
--
-- Design (no parallel credit system: the existing spend / refund / ledger functions do all the
-- accounting; this only decides WHETHER to call them):
--   * A client-generated idempotency key identifies one submitted dream analysis. It is scoped
--     PER ACCOUNT (unique (owner_id, key)), so two accounts can never collide and a forged
--     owner is impossible (the owner always comes from the verified token).
--   * The attempt row records the key, a hash of the submitted text, a status
--     ('processing' -> 'succeeded') and, on success, the analysis result.
--   * start_user_attempt_idem serializes same-key callers with a transaction-level advisory lock
--     (and a unique index as the backstop), then:
--       new key                      -> spend ONE credit + create the attempt ('processing')
--       same key, succeeded          -> 'replay': return the stored result, NO spend, NO model call
--       same key, still processing   -> 'processing': the caller waits; NO spend
--       same key, processing but stale (the original request is gone) -> refund it once via the
--                                       existing cancel_user_attempt, then start over (net one spend)
--       same key, different text     -> 'conflict' (never returns another dream's result)
--   * A genuine failure still goes through the existing cancel_user_attempt (refund exactly once,
--     row deleted); the key is then free, so retrying the same submission starts a fresh, correctly
--     charged attempt.
--   * Stored results are personal content: they are cleared after a short retention window
--     (opportunistically on the account's next start) and deleted with the account (attempts are).
--
-- Additive: nothing existing is altered except new nullable columns on dream_attempts; the old
-- start_user_attempt(uuid) stays for any client that does not send a key. The anonymous trial
-- functions are untouched (trial attempts never carry a key). Existing credit_ledger idempotency
-- indexes (payments, one spend / one refund per attempt) are untouched.

alter table public.dream_attempts
  add column if not exists idempotency_key text,
  add column if not exists input_hash text,
  add column if not exists analysis_status text,
  add column if not exists analysis_result jsonb;

alter table public.dream_attempts drop constraint if exists dream_attempts_idem_key_format;
alter table public.dream_attempts
  add constraint dream_attempts_idem_key_format
  check (idempotency_key is null or idempotency_key ~ '^[A-Za-z0-9_-]{16,64}$');

alter table public.dream_attempts drop constraint if exists dream_attempts_analysis_status_values;
alter table public.dream_attempts
  add constraint dream_attempts_analysis_status_values
  check (analysis_status is null or analysis_status in ('processing', 'succeeded'));

create unique index if not exists dream_attempts_owner_idem_uidx
  on public.dream_attempts (owner_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.start_user_attempt_idem(
  p_owner uuid,
  p_key text,
  p_input_hash text,
  p_stale_seconds integer default 150,
  p_retention_hours integer default 2
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  v_attempt uuid;
begin
  if p_owner is null or p_key is null or p_key !~ '^[A-Za-z0-9_-]{16,64}$'
     or p_input_hash is null or p_input_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'invalid_key');
  end if;

  -- Same-key callers are serialized; different keys (and other accounts) never block each other.
  perform pg_advisory_xact_lock(hashtextextended('analysis-idem:' || p_owner::text || ':' || p_key, 0));

  -- Privacy: stored analysis results only live for a short window.
  update public.dream_attempts
     set analysis_result = null
   where owner_id = p_owner
     and analysis_result is not null
     and created_at < now() - make_interval(hours => p_retention_hours);

  select id, input_hash, analysis_status, analysis_result, created_at
    into a
    from public.dream_attempts
   where owner_id = p_owner and idempotency_key = p_key;

  if found then
    if a.input_hash is distinct from p_input_hash then
      return jsonb_build_object('status', 'conflict');
    end if;
    if a.analysis_status = 'succeeded' then
      if a.analysis_result is null then
        return jsonb_build_object('status', 'expired', 'attempt_id', a.id);
      end if;
      return jsonb_build_object('status', 'replay', 'attempt_id', a.id, 'analysis', a.analysis_result);
    end if;
    if a.created_at > now() - make_interval(secs => p_stale_seconds) then
      return jsonb_build_object('status', 'processing', 'attempt_id', a.id);
    end if;
    -- The original request can no longer be running: refund it exactly once (existing function,
    -- idempotent in SQL) and fall through to a fresh, separately charged attempt.
    perform public.cancel_user_attempt(a.id, p_owner);
  end if;

  update public.dream_credits
     set balance = balance - 1, updated_at = now()
   where owner_id = p_owner and balance >= 1;
  if not found then
    return jsonb_build_object('status', 'credits_required');
  end if;

  insert into public.dream_attempts (owner_id, idempotency_key, input_hash, analysis_status)
    values (p_owner, p_key, p_input_hash, 'processing')
    returning id into v_attempt;
  insert into public.credit_ledger (owner_id, delta, reason, attempt_id)
    values (p_owner, -1, 'spend', v_attempt);
  return jsonb_build_object('status', 'created', 'attempt_id', v_attempt);
end $$;

-- Records the finished analysis on ITS OWN attempt (only while it is still 'processing', so a
-- request whose attempt was already refunded or replaced can never resurrect anything).
create or replace function public.complete_user_analysis(p_attempt uuid, p_owner uuid, p_result jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.dream_attempts
     set analysis_status = 'succeeded', analysis_result = p_result
   where id = p_attempt and owner_id = p_owner and analysis_status = 'processing';
  return found;
end $$;

revoke all on function public.start_user_attempt_idem(uuid, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_user_analysis(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.start_user_attempt_idem(uuid, text, text, integer, integer) to service_role;
grant execute on function public.complete_user_analysis(uuid, uuid, jsonb) to service_role;
