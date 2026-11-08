-- WEIGHTED COUNTERS FOR THE AI EXTRAS (translation, pattern reflection). Prepared 2026-11-08; NOT APPLIED: running it needs its own approval.
-- Apply BEFORE the code that calls these functions is deployed (the code fails closed without them: translation then shows the original
-- text and a pattern reflection is "not available right now"; nothing else in DARE uses them).
--
-- What it adds, and only this:
--   * take_rate_limit_weighted: like take_rate_limit (20261010_rate_limits.sql), but one call can count more than one unit (the number
--     of characters sent for translation). Same table, same fixed windows, same atomic upsert, so parallel calls are counted exactly.
--   * peek_rate_limit: reads a counter WITHOUT adding to it (the "light users keep a share" rule looks at the site total before counting).
-- What it does not change: no table, column, row, policy or existing function. Both functions are service-role only.
--
-- ROLLBACK: supabase/rollbacks/20261109_rate_limit_weighted_rollback.sql (drop the two functions; the counters they wrote are ordinary
-- rate_limits rows and are swept by take_rate_limit's own housekeeping within a day).

create or replace function public.take_rate_limit_weighted(p_bucket text, p_cost integer, p_limit integer, p_window_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_end   timestamptz;
  v_hits  integer;
begin
  if p_bucket is null or length(p_bucket) = 0 or length(p_bucket) > 200
     or p_cost is null or p_cost < 1 or p_cost > 1000000
     or p_limit is null or p_limit < 1 or p_limit > 100000000
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    return jsonb_build_object('status', 'invalid');
  end if;

  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_end   := v_start + make_interval(secs => p_window_seconds);

  insert into public.rate_limits as r (bucket, window_start, hits)
    values (p_bucket, v_start, p_cost)
    on conflict (bucket, window_start) do update set hits = least(r.hits::bigint + p_cost, 2147483647)::integer
    returning r.hits into v_hits;

  if v_hits > p_limit then
    return jsonb_build_object('status', 'limited', 'hits', v_hits, 'retry_after', greatest(1, ceil(extract(epoch from (v_end - now())))::integer));
  end if;
  return jsonb_build_object('status', 'ok', 'hits', v_hits);
end $$;

create or replace function public.peek_rate_limit(p_bucket text, p_window_seconds integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_hits  integer;
begin
  if p_bucket is null or length(p_bucket) = 0 or length(p_bucket) > 200
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    return jsonb_build_object('status', 'invalid');
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  select hits into v_hits from public.rate_limits where bucket = p_bucket and window_start = v_start;
  return jsonb_build_object('status', 'ok', 'hits', coalesce(v_hits, 0));
end $$;

revoke all on function public.take_rate_limit_weighted(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.take_rate_limit_weighted(text, integer, integer, integer) to service_role;
revoke all on function public.peek_rate_limit(text, integer) from public, anon, authenticated;
grant execute on function public.peek_rate_limit(text, integer) to service_role;
