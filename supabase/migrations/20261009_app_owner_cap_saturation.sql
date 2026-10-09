-- Follow-up to 20261009_app_owner.sql.
--
-- Production's dream_attempts carries CHECK constraints (image_count between 0 and 3, reflection_count between 0 and 3) that the
-- per-dream caps relied on. Lifting the cap for the app owner by letting the counter grow would violate them on the 4th use. Instead
-- the owner's counter SATURATES at 3: the reservation still succeeds (it returns the count, so the route proceeds), and nothing is
-- rejected. For every other account `least(count + 1, 3)` equals `count + 1`, because the cap condition already guarantees count < 3.
-- The label counter has no such constraint and is unchanged.

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
