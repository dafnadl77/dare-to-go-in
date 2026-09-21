-- READ-ONLY checks after the apply (run before considering the backfill done).
-- 1) Every legacy dream is now classified exactly once, with the current taxonomy version:
select count(*) filter (where payload -> 'dreamAnalysis' ? 'conceptVersion') as classified,
       count(*) filter (where not (payload -> 'dreamAnalysis' ? 'conceptVersion')) as still_unclassified,
       count(*) filter (where jsonb_array_length(payload -> 'dreamAnalysis' -> 'concepts') > 4) as over_cap
from public.dreams where payload ? 'dreamAnalysis';
-- 2) Only two keys were added: after removing them, the analysis must be identical to the backup (compare against the saved JSON).
select id, (payload -> 'dreamAnalysis') - 'concepts' - 'conceptVersion' as analysis_without_new_keys
from public.dreams where payload ? 'dreamAnalysis' order by id;
-- 3) Nothing outside dreamAnalysis changed: payload keys other than dreamAnalysis, favorite and created_at are compared with the backup the same way.
