-- Exact inverse of 02_apply: removes only the two added keys. Safe to run more than once.
begin;
update public.dreams
   set payload = jsonb_set(payload, '{dreamAnalysis}', (payload -> 'dreamAnalysis') - 'concepts' - 'conceptVersion')
 where payload ? 'dreamAnalysis'
   and (payload -> 'dreamAnalysis') ?| array['concepts', 'conceptVersion'];
-- Check the affected count, then COMMIT; (or ROLLBACK;)
