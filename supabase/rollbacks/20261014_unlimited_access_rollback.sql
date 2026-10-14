-- ROLLBACK for supabase/migrations/20261014_unlimited_access.sql and 20261015_unlimited_access_keep_limits.sql. NOT a migration: it lives outside supabase/migrations and is only run by hand.
--
-- Effect: every account that was granted unlimited access returns to the regular credit rules with the balance it holds (nothing here
-- touches dream_credits / credit_ledger / payment_orders), and the app owner stays unlimited exactly as before the feature.
-- The audit table is KEPT on purpose (it is the record of who was granted and revoked); drop it by hand only if it is not needed.
-- Roll the code back first (Vercel: promote the previous production deployment), or the credits route will ask for functions dropped here
-- and simply stop showing the admin area (an unknown answer is never "admin").

-- 1. The role check returns to its previous definition (20261009_app_owner.sql): the app owner only.
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

-- 2. The per-dream technical caps return to their previous definitions (20261009_app_owner*.sql): lifted for the app owner (is_app_owner).
create or replace function public.reserve_image_attempt(p_attempt_id uuid, p_owner_id uuid, p_trial_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.dream_attempts
  set image_count = least(image_count + 1, 3)
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
  set reflection_count = least(reflection_count + 1, 3)
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

-- 3. The admin functions and the grants table.
drop function if exists public.admin_grant_unlimited(uuid, text);
drop function if exists public.admin_revoke_unlimited(uuid, uuid);
drop function if exists public.admin_list_unlimited(uuid);
drop function if exists public.is_dream_admin(uuid);
drop table if exists public.unlimited_dream_access;
