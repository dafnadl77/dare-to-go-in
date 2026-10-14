-- Unlimited dream access, granted by the admin to chosen accounts and kept until the admin revokes it.
--
-- WHO IS THE ADMIN. The existing app owner (public.app_owners, one verified account) is the only admin. Nobody else can grant or revoke,
-- and the admin check lives INSIDE every function below, so even a bug in the API could not let another account use them.
--
-- HOW A GRANTED ACCOUNT IS UNLIMITED. It is not a new accounting path: public.is_app_owner(uuid) (already used by start_user_attempt,
-- start_user_attempt_idem, reserve_image/reflection/labels_attempt and decide_account_free_dream, i.e. every route that creates or
-- continues a dream) now answers true for the app owner OR for an account in public.unlimited_dream_access. Those functions already
-- skip the credit spend, the ledger row and the per-dream caps for such an account, so:
--   * a granted account's balance and ledger are never touched (nothing here updates or deletes dream_credits / credit_ledger /
--     payment_orders), and revoking the grant simply returns the account to the regular credit rules with the balance it still holds;
--   * the grant holds in every creation path, background or alternative, because the rule sits in the database functions themselves.
--
-- WHAT IT DOES NOT TOUCH. Payments, packages, prices, purchase history and every regular account's behaviour: for an account that is
-- not in either table, is_app_owner is false exactly as before.
--
-- Both tables are service-role only (RLS on, no policies, every privilege revoked from anon/authenticated); the browser cannot read or
-- write them. Accounts are identified by the verified auth.users id the server derives from the bearer token, never by an email the
-- browser sends: an email is only ever the ADMIN's input, resolved here, in the database, to an existing confirmed account.
-- Every grant and revocation is appended to an audit table that survives account deletion.

create table if not exists public.unlimited_dream_access (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  granted_at timestamptz not null default now(),
  granted_by uuid not null
);

create table if not exists public.unlimited_access_audit (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  email      text,
  action     text not null check (action in ('grant', 'revoke')),
  actor_id   uuid not null,
  created_at timestamptz not null default now()
);

alter table public.unlimited_dream_access enable row level security;
alter table public.unlimited_access_audit enable row level security;
revoke all on public.unlimited_dream_access from public, anon, authenticated;
revoke all on public.unlimited_access_audit from public, anon, authenticated;

-- The admin: the verified app-owner account (the role table of 20261009_app_owner.sql). Granted accounts are NOT admins.
create or replace function public.is_dream_admin(p_actor uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_actor is not null and exists (select 1 from public.app_owners where owner_id = p_actor);
$$;

-- "Unlimited dreams": the app owner, or an account the admin granted. The same name and signature as before, so every function that
-- already calls it picks the granted accounts up without being redefined.
create or replace function public.is_app_owner(p_owner uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_owner is not null and (
    exists (select 1 from public.app_owners where owner_id = p_owner)
    or exists (select 1 from public.unlimited_dream_access where user_id = p_owner)
  );
$$;

-- Grants unlimited access to the EXISTING, confirmed account with this email. Never creates an account.
create or replace function public.admin_grant_unlimited(p_actor uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user  uuid;
  v_found text;
  v_rows  integer;
begin
  if not public.is_dream_admin(p_actor) then
    return jsonb_build_object('status', 'not_authorized');
  end if;
  if length(v_email) = 0 or length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('status', 'invalid_email');
  end if;
  select id, email into v_user, v_found
    from auth.users
   where lower(email) = v_email and email_confirmed_at is not null
   order by created_at
   limit 1;
  if v_user is null then
    return jsonb_build_object('status', 'not_registered');
  end if;
  if exists (select 1 from public.app_owners where owner_id = v_user) then
    return jsonb_build_object('status', 'already_unlimited', 'user_id', v_user, 'email', v_found);
  end if;
  insert into public.unlimited_dream_access (user_id, email, granted_by)
    values (v_user, v_found, p_actor)
    on conflict (user_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('status', 'already_granted', 'user_id', v_user, 'email', v_found);
  end if;
  insert into public.unlimited_access_audit (user_id, email, action, actor_id) values (v_user, v_found, 'grant', p_actor);
  return jsonb_build_object('status', 'granted', 'user_id', v_user, 'email', v_found);
end $$;

-- Ends the grant: the account returns to the regular credit rules with the balance it holds.
create or replace function public.admin_revoke_unlimited(p_actor uuid, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if not public.is_dream_admin(p_actor) then
    return jsonb_build_object('status', 'not_authorized');
  end if;
  delete from public.unlimited_dream_access where user_id = p_user returning email into v_email;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  insert into public.unlimited_access_audit (user_id, email, action, actor_id) values (p_user, v_email, 'revoke', p_actor);
  return jsonb_build_object('status', 'revoked', 'user_id', p_user, 'email', v_email);
end $$;

-- The admin's list: who holds the access, since when.
create or replace function public.admin_list_unlimited(p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_dream_admin(p_actor) then
    return jsonb_build_object('status', 'not_authorized');
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'email', coalesce(u.email, a.email), 'granted_at', a.granted_at) order by a.granted_at desc, a.user_id)
        from public.unlimited_dream_access a
        left join auth.users u on u.id = a.user_id
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.is_dream_admin(uuid) from public, anon, authenticated;
revoke all on function public.is_app_owner(uuid) from public, anon, authenticated;
revoke all on function public.admin_grant_unlimited(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_revoke_unlimited(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_list_unlimited(uuid) from public, anon, authenticated;
grant execute on function public.is_dream_admin(uuid) to service_role;
grant execute on function public.is_app_owner(uuid) to service_role;
grant execute on function public.admin_grant_unlimited(uuid, text) to service_role;
grant execute on function public.admin_revoke_unlimited(uuid, uuid) to service_role;
grant execute on function public.admin_list_unlimited(uuid) to service_role;
