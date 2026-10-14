-- Follow-up to 20261014_unlimited_access.sql: an account the admin granted unlimited access stays under the technical usage limits.
--
-- Unlimited access means: no charge per dream, no purchase needed, balance untouched. It does NOT lift the safeguards that bound what one
-- dream can cost or what one account can do. Only the existing app owner keeps lifting them, as before. This migration changes just the
-- per-dream technical caps (images, reflections, labels): their condition used public.is_app_owner (owner OR granted); it now uses
-- public.is_dream_admin (the app owner only). For every account other than the owner the statements are the ones a regular account has.
-- (The transcription rate limit is applied in the server and is changed alongside this migration; see server/routes/dreamTranscription.ts.)
--
-- Nothing else changes: is_app_owner (the "no charge" rule), the attempt-start functions, balances, ledger and payments are untouched.

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
    and (image_count < 3 or public.is_dream_admin(p_owner_id))
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
    and (reflection_count < 3 or public.is_dream_admin(p_owner_id))
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
     and (label_count < p_max or public.is_dream_admin(p_owner_id))
  returning label_count;
$$;
