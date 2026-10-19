-- AFTER A RESTORE ONLY. Never run on the live project (it already has exactly this state).
--
-- Why: the nightly backup is `pg_dump --no-owner --no-privileges`, so tables, data, RLS policies, functions and triggers are in it but GRANT/REVOKE are NOT.
-- A fresh Supabase project gives anon/authenticated broad default rights on new objects. Our payment, credit and admin functions rely on being callable by
-- service_role ONLY. Run this right after the restore, before the site is pointed at the restored project.
--
-- It reproduces the production state (read 2026-10-17, updated 2026-10-19): 34 functions in `public` executable only by service_role (33 until the 2026-10-19 trigger function was added); every table in `public` has RLS on;
-- `dreams` is open to `authenticated` (own rows, by policy); `pattern_reflections` to `anon` + `authenticated` (own rows, by policy); everything else is service_role only.

-- 1. functions: service_role only
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

-- 2. tables: nothing for the browser roles, then the two that the browser really uses (RLS limits them to the signed-in owner)
revoke all on all tables in schema public from public, anon, authenticated;
grant all on all tables in schema public to service_role;
grant select, insert, update, delete on public.dreams to authenticated;
grant select, insert, update, delete on public.pattern_reflections to anon, authenticated;

-- 3. sequences
revoke all on all sequences in schema public from public, anon, authenticated;
grant usage, select on all sequences in schema public to service_role;

-- 4. new objects created later in `public` by the migrations must not open themselves to the browser roles
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- 5. VERIFY (each query must return 0 rows)
select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'));
select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity;
select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname not in ('dreams', 'pattern_reflections')
  and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'));

-- Storage: the `dream-images` bucket and its 4 policies are rows/objects in the `storage` schema and come back with the dump; check that the bucket is
-- private afterwards:  select id, public from storage.buckets;   -- dream-images must be false.
