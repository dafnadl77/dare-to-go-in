-- ADDITIVE + IDEMPOTENT. Adds only dreamAnalysis.concepts and dreamAnalysis.conceptVersion.
-- The ROWS marker below is replaced by the approved list: ('<dream id prefix>', array['id1','id2']::text[]), ...
-- The EXPECTED marker is replaced by the number of rows in that list.
begin;
with approved(id_prefix, concepts) as (values {{ROWS}}),
upd as (
  update public.dreams d
     set payload = jsonb_set(
                     jsonb_set(d.payload, '{dreamAnalysis,concepts}', to_jsonb(a.concepts), true),
                     '{dreamAnalysis,conceptVersion}', '1'::jsonb, true)
    from approved a
   where d.id::text like a.id_prefix || '%'
     and d.payload ? 'dreamAnalysis'
     and not (d.payload -> 'dreamAnalysis' ? 'conceptVersion')
  returning d.id)
select count(*) as rows_updated from upd;
-- Expect rows_updated = {{EXPECTED}}. If not: ROLLBACK; and investigate. Otherwise: COMMIT;
