-- ADDITIVE + IDEMPOTENT. Adds only dreamAnalysis.concepts and dreamAnalysis.conceptVersion.
-- The ROWS marker below is replaced by the approved list: ('<dream id prefix>', array['id1','id2']::text[]), ...
-- The EXPECTED marker is replaced by the number of rows in that list.
-- Any failed guard RAISES an exception, which aborts the whole transaction (nothing is written).
begin;

-- Guard 1 (before writing): exactly EXPECTED approved dreams exist, each matches one dream, each is still unclassified.
do $guard$
declare n_match int; n_eligible int;
begin
  with approved(id_prefix, concepts) as (values {{ROWS}})
  select count(*), count(*) filter (where d.payload ? 'dreamAnalysis' and not (d.payload -> 'dreamAnalysis' ? 'conceptVersion'))
    into n_match, n_eligible
    from approved a join public.dreams d on d.id::text like a.id_prefix || '%';
  if n_match <> {{EXPECTED}} or n_eligible <> {{EXPECTED}} then
    raise exception 'Backfill aborted: expected % eligible dreams, matched %, eligible %', {{EXPECTED}}, n_match, n_eligible;
  end if;
end
$guard$;

with approved(id_prefix, concepts) as (values {{ROWS}})
update public.dreams d
   set payload = jsonb_set(
                   jsonb_set(d.payload, '{dreamAnalysis,concepts}', to_jsonb(a.concepts), true),
                   '{dreamAnalysis,conceptVersion}', '1'::jsonb, true)
  from approved a
 where d.id::text like a.id_prefix || '%'
   and d.payload ? 'dreamAnalysis'
   and not (d.payload -> 'dreamAnalysis' ? 'conceptVersion');

-- Guard 2 (after writing, before commit): exactly EXPECTED dreams carry the new keys.
do $guard$
declare n_done int;
begin
  select count(*) into n_done from public.dreams where payload -> 'dreamAnalysis' ? 'conceptVersion';
  if n_done <> {{EXPECTED}} then
    raise exception 'Backfill aborted: expected % classified dreams after the update, found %', {{EXPECTED}}, n_done;
  end if;
end
$guard$;

commit;
