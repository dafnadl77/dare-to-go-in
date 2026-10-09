-- The app owner: a permanent, server-side role that lifts every dream limit for ONE verified account.
--
-- The role lives only in this table. It is service-role only (RLS on with NO policies, every privilege revoked from
-- anon/authenticated); the browser cannot read it, and no API route writes it. The owner is recognized by the verified
-- auth.users id the server derives from the bearer token — never by an email, a flag or a header the client sends.
--
-- For an owner the existing accounting is simply bypassed where it would block or charge:
--   * start_user_attempt / start_user_attempt_idem  create the attempt WITHOUT spending a credit and WITHOUT a ledger row
--     (a failed attempt is cancelled by the existing cancel_user_attempt, which refunds only an attempt that has a spend row
--     — an owner's never has one — and deletes the row), so the owner's balance and ledger are never touched;
--   * reserve_image / reflection / labels_attempt   no longer stop at the per-dream caps (3 / 3 / label cap).
-- Every other account keeps exactly the previous behavior: the new conditions are `or is_app_owner(...)`, false for everyone else.
--
-- Existing purchase and credit history is left untouched (nothing here updates or deletes dream_credits / credit_ledger /
-- payment_orders). Granting happens in this migration, once, ONLY if the id found for the owner's email is the verified account.

create table if not exists public.app_owners (
  owner_id   uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  note       text
);

-- Append-only record of every grant/revocation (who, when, why).
create table if not exists public.app_owner_audit (
  id         bigint generated always as identity primary key,
  owner_id   uuid not null,
  action     text not null check (action in ('grant', 'revoke')),
  note       text,
  created_at timestamptz not null default now()
);

alter table public.app_owners enable row level security;
alter table public.app_owner_audit enable row level security;
revoke all on public.app_owners from public, anon, authenticated;
revoke all on public.app_owner_audit from public, anon, authenticated;

create or replace function public.is_app_owner(p_owner uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_owner is not null and exists (select 1 from public.app_owners where owner_id = p_owner);
$$;

revoke all on function public.is_app_owner(uuid) from public, anon, authenticated;
grant execute on function public.is_app_owner(uuid) to service_role;

-- Creates the attempt; spends ONE credit unless the caller is the app owner.
create or replace function public.start_user_attempt(p_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_attempt uuid;
begin
  if public.is_app_owner(p_owner) then
    insert into public.dream_attempts (owner_id) values (p_owner) returning id into v_attempt;
    return jsonb_build_object('status', 'created', 'attempt_id', v_attempt);
  end if;
  update public.dream_credits
     set balance = balance - 1, updated_at = now()
   where owner_id = p_owner and balance >= 1;
  if not found then
    return jsonb_build_object('status', 'credits_required');
  end if;
  insert into public.dream_attempts (owner_id) values (p_owner) returning id into v_attempt;
  insert into public.credit_ledger (owner_id, delta, reason, attempt_id)
    values (p_owner, -1, 'spend', v_attempt);
  return jsonb_build_object('status', 'created', 'attempt_id', v_attempt);
end $$;

-- The idempotent start: identical to the previous definition except for the owner branch before the credit spend.
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

  perform pg_advisory_xact_lock(hashtextextended('analysis-idem:' || p_owner::text || ':' || p_key, 0));

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
    perform public.cancel_user_attempt(a.id, p_owner);
  end if;

  if public.is_app_owner(p_owner) then
    -- The app owner is never charged: no credit is spent and no ledger row is written.
    insert into public.dream_attempts (owner_id, idempotency_key, input_hash, analysis_status)
      values (p_owner, p_key, p_input_hash, 'processing')
      returning id into v_attempt;
    return jsonb_build_object('status', 'created', 'attempt_id', v_attempt);
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

-- Per-dream technical caps (images, reflections, labels): the same statements as before, lifted for the app owner only.
create or replace function public.reserve_image_attempt(p_attempt_id uuid, p_owner_id uuid, p_trial_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.dream_attempts
  set image_count = image_count + 1
  where id = p_attempt_id
    and ((p_owner_id is not null and owner_id = p_owner_id) or (p_trial_id is not null and trial_id = p_trial_id))
    and (image_count < 3 or public.is_app_owner(p_owner_id))
  returning image_count;
$$;

create or replace function public.reserve_reflection_attempt(p_attempt_id uuid, p_owner_id uuid, p_trial_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.dream_attempts
  set reflection_count = reflection_count + 1
  where id = p_attempt_id
    and ((p_owner_id is not null and owner_id = p_owner_id) or (p_trial_id is not null and trial_id = p_trial_id))
    and (reflection_count < 3 or public.is_app_owner(p_owner_id))
  returning reflection_count;
$$;

create or replace function public.reserve_labels_attempt(p_attempt_id uuid, p_owner_id uuid, p_trial_id uuid, p_max integer)
returns integer
language sql
security definer
set search_path = public
as $$
  update dream_attempts set label_count = label_count + 1
   where id = p_attempt_id
     and ((p_owner_id is not null and owner_id = p_owner_id) or (p_trial_id is not null and trial_id = p_trial_id))
     and (label_count < p_max or public.is_app_owner(p_owner_id))
  returning label_count;
$$;

-- The one grant. The owner is the account whose id was verified in auth.users for dafnadl77@gmail.com: the row is written
-- only if that account exists, with that exact id, and its email is confirmed. Idempotent.
do $$
declare v_id constant uuid := '7d55396c-3582-4aec-8470-d188fc029829';
begin
  if exists (
       select 1 from auth.users
        where id = v_id and lower(email) = 'dafnadl77@gmail.com' and email_confirmed_at is not null
     )
     and not exists (select 1 from public.app_owners where owner_id = v_id) then
    insert into public.app_owners (owner_id, note) values (v_id, 'App owner (dafnadl77@gmail.com), granted by migration 20261009_app_owner');
    insert into public.app_owner_audit (owner_id, action, note) values (v_id, 'grant', 'migration 20261009_app_owner: verified auth.users id for dafnadl77@gmail.com');
  end if;
end $$;
