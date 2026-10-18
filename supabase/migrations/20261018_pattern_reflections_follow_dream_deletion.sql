-- When a saved dream is deleted, the pattern reflections that were drawn from it are deleted with it.
--
-- Why: a pattern reflection (public.pattern_reflections) is an AI-written summary built from SEVERAL dreams; dream_ids lists them.
-- Until now deleting one dream removed the dream and its image but left every reflection that used it, so text derived from the deleted
-- dream stayed until the whole account was deleted. The Privacy Policy used to say so. This closes that gap.
--
-- How: an AFTER DELETE trigger on public.dreams, so it applies to EVERY way a dream disappears (the archive's delete button, the account
-- deletion function, a cascade from the Auth user). It runs as the table owner (SECURITY DEFINER), because no row-level-security DELETE
-- policy exists on pattern_reflections for the browser roles and none is added: the browser still cannot delete reflections directly.
--
-- Scope: ONLY reflections of the SAME owner whose dream_ids contain the deleted dream's id. A reflection built from other dreams only
-- is untouched; so are reflections of other accounts. Nothing else is read or written. The existing unique index on pattern_reflections
-- starts with owner_id, so the lookup stays on one account's rows.
--
-- No backfill: on 2026-10-18 no existing reflection pointed at a deleted dream (checked read-only: 0 of 7). Safe to run twice.
-- Rollback: supabase/rollbacks/20261018_pattern_reflections_follow_dream_deletion_rollback.sql (drops the trigger and the function).

create or replace function public.delete_pattern_reflections_of_deleted_dream()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.pattern_reflections
   where owner_id = old.owner_id
     and old.id::text = any (dream_ids);
  return old;
end $$;

revoke all on function public.delete_pattern_reflections_of_deleted_dream() from public, anon, authenticated;

drop trigger if exists dreams_delete_pattern_reflections on public.dreams;
create trigger dreams_delete_pattern_reflections
  after delete on public.dreams
  for each row
  execute function public.delete_pattern_reflections_of_deleted_dream();
