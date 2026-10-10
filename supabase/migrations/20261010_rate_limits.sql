-- Server-side rate limiting that works across every server instance (Vercel runs many; an in-memory counter would give each its own).
--
-- One small counter table in the existing database and one function that takes a "hit" atomically. A counter row exists per
-- (bucket, fixed time window); the single INSERT .. ON CONFLICT DO UPDATE is the atomic increment, so two instances answering at
-- the same moment can never both see "under the limit" for the same last slot. No new service, no cost: the same Postgres.
--
-- Service-role only, like every other server table here: RLS on with no policies, nothing granted to anon/authenticated, the function
-- executable by service_role alone. The browser can neither read nor write a counter.
--
-- ROLLBACK (nothing else depends on it): drop function public.take_rate_limit(text, integer, integer); drop table public.rate_limits;

create table if not exists public.rate_limits (
  bucket       text        not null check (length(bucket) between 1 and 200),
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (bucket, window_start)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from public, anon, authenticated;

-- Takes one hit from `p_bucket` in the current fixed window of `p_window_seconds`.
--   {status: 'ok',      hits}                          within the limit
--   {status: 'limited', hits, retry_after}             over the limit; retry_after = whole seconds until the window ends
--   {status: 'invalid'}                                nonsense arguments (never allows by accident: callers treat it as "unknown")
create or replace function public.take_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
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
     or p_limit is null or p_limit < 1 or p_limit > 100000
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    return jsonb_build_object('status', 'invalid');
  end if;

  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_end   := v_start + make_interval(secs => p_window_seconds);

  insert into public.rate_limits as r (bucket, window_start, hits)
    values (p_bucket, v_start, 1)
    on conflict (bucket, window_start) do update set hits = r.hits + 1
    returning r.hits into v_hits;

  -- Bounded housekeeping: now and then, drop windows that ended more than a day ago.
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  if v_hits > p_limit then
    return jsonb_build_object('status', 'limited', 'hits', v_hits, 'retry_after', greatest(1, ceil(extract(epoch from (v_end - now())))::integer));
  end if;
  return jsonb_build_object('status', 'ok', 'hits', v_hits);
end $$;

revoke all on function public.take_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.take_rate_limit(text, integer, integer) to service_role;
