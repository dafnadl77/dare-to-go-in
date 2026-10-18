-- Rollback of 20261018_pattern_reflections_follow_dream_deletion.sql: deleting a dream goes back to leaving the pattern reflections
-- drawn from it in place (they are then removed only with the account). Deletes no data. Safe to run twice.
drop trigger if exists dreams_delete_pattern_reflections on public.dreams;
drop function if exists public.delete_pattern_reflections_of_deleted_dream();
