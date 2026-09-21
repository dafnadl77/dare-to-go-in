-- READ-ONLY. Save the result as JSON before running 02_apply. Backs up every dreamAnalysis payload that the backfill can touch.
select id, owner_id, payload -> 'dreamAnalysis' as dream_analysis
from public.dreams
where payload ? 'dreamAnalysis'
  and not (payload -> 'dreamAnalysis' ? 'conceptVersion')
order by id;
