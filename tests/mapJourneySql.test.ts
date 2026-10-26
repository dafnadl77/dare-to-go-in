import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import * as X from '../src/hero/exploration';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema';
import { buildSavedDream } from '../src/hero/dreamStorage';
import { mapJourneyFrom, reflectionFromJourney, savedFieldsFromJourney } from '../src/map/journeyRecord';
import { MAX_LABEL_CALLS_PER_ATTEMPT } from '../server/trialAllowance';

/**
 * THE DREAM MAP AGAINST THE DATABASE, on an isolated PostgreSQL (PGlite) — never the live project and never another app's project. The
 * repo's own migrations (credits, idempotent analysis, owner, unlimited access with limits kept) run for real; the parts production has
 * that the migrations do not hold are rebuilt from what was measured read-only in production (doc 26): the counters and their CHECKs on
 * dream_attempts (no CHECK on label_count), and `dreams` with RLS on and the four owner-only policies for `authenticated`. A dream map
 * journey is then run through it: one credit for the dream, the slots of the conversation and the whole views exactly as the route asks
 * for them, the saved dream with its journey, and what another account can and cannot do.
 */

const sql = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');

// the route's own numbers (server/routes/dreamExploration.ts): label calls before the conversation, 16 turns, up to 3 rejection replies
const MOMENT_CALLS = 16;
const REJECTION_REPLIES = 3;
const momentCap = (extra: number) => MAX_LABEL_CALLS_PER_ATTEMPT + MOMENT_CALLS + Math.min(REJECTION_REPLIES, extra);

let db: PGlite;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz, created_at timestamptz not null default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public to anon, authenticated, service_role;
    grant usage on schema auth to anon, authenticated, service_role;
    create table public.dream_attempts (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid references auth.users (id) on delete cascade,
      trial_id uuid,
      image_count integer not null default 0 constraint dream_attempts_image_count_bounds check (image_count >= 0 and image_count <= 3),
      reflection_count integer not null default 0 constraint dream_attempts_reflection_count_bounds check (reflection_count >= 0 and reflection_count <= 3),
      label_count integer not null default 0,
      created_at timestamptz not null default now(),
      saved_dream_id uuid,
      completed_at timestamptz
    );
    -- dreams as measured in production (doc 26): RLS on, four owner-only policies for authenticated
    create table public.dreams (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users (id) on delete cascade, created_at timestamptz not null default now(), favorite boolean not null default false, payload jsonb not null default '{}');
    alter table public.dreams enable row level security;
    create policy dreams_select_own on public.dreams for select to authenticated using (auth.uid() = owner_id);
    create policy dreams_insert_own on public.dreams for insert to authenticated with check (auth.uid() = owner_id);
    create policy dreams_update_own on public.dreams for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
    create policy dreams_delete_own on public.dreams for delete to authenticated using (auth.uid() = owner_id);
    grant select, insert, update, delete on public.dreams to authenticated;
  `);
  await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'a@example.test', now()), ($2, 'b@example.test', now())", [A, B]);
  for (const m of ['20260924_credits_entitlement.sql', '20260925_idempotent_analysis.sql', '20261009_app_owner.sql', '20261009_app_owner_cap_saturation.sql', '20261014_unlimited_access.sql', '20261015_unlimited_access_keep_limits.sql']) {
    await db.exec(sql(m));
  }
  // the slot functions' privileges as measured in production (doc 26: postgres and service_role only); not part of the repo's migrations
  await db.exec(`
    revoke all on function public.reserve_labels_attempt(uuid, uuid, uuid, integer) from public, anon, authenticated;
    revoke all on function public.reserve_reflection_attempt(uuid, uuid, uuid) from public, anon, authenticated;
    grant execute on function public.reserve_labels_attempt(uuid, uuid, uuid, integer) to service_role;
    grant execute on function public.reserve_reflection_attempt(uuid, uuid, uuid) to service_role;
  `);
});
after(async () => {
  await db.close();
});

const one = async <T>(q: string, p: unknown[] = []) => (await db.query<T>(q, p)).rows[0];
const balance = async (owner: string) => (await one<{ b: number }>('select public.get_credit_balance($1) as b', [owner])).b;
const reserveLabels = async (attempt: string, owner: string, max: number) => (await db.query<{ n: number }>('select public.reserve_labels_attempt($1, $2, null, $3) as n', [attempt, owner, max])).rows[0]?.n ?? null;
const reserveWhole = async (attempt: string, owner: string) => (await db.query<{ n: number }>('select public.reserve_reflection_attempt($1, $2, null) as n', [attempt, owner])).rows[0]?.n ?? null;
/** As the signed-in account in the browser: the authenticated role, with its own id (RLS applies). */
async function asUser<T>(id: string, run: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
  try {
    return await run();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

let attempt = '';

test('a map dream costs exactly one credit, once, however often the same dream is sent', async () => {
  await db.query("select public.grant_credits($1, 1, 'purchase', 'grow:TEST-MAP-1')", [A]);
  assert.equal(await balance(A), 1);
  const first = await one<{ r: { status: string; attempt_id: string } }>('select public.start_user_attempt_idem($1, $2, $3) as r', [A, 'idem-map-000000000001', 'a'.repeat(64)]);
  assert.equal(first.r.status, 'created');
  attempt = first.r.attempt_id;
  const again = await one<{ r: { status: string; attempt_id: string } }>('select public.start_user_attempt_idem($1, $2, $3) as r', [A, 'idem-map-000000000001', 'a'.repeat(64)]);
  assert.notEqual(again.r.status, 'created', 'the same dream sent again is never a second charge');
  assert.equal(again.r.attempt_id, attempt);
  assert.equal(await balance(A), 0);
  const next = await one<{ r: { status: string } }>('select public.start_user_attempt_idem($1, $2, $3) as r', [A, 'idem-map-000000000002', 'b'.repeat(64)]);
  assert.equal(next.r.status, 'credits_required', 'no credit, no new dream');
});

test('the map\'s slots: two label calls, then 16 conversation turns, then up to 3 rejection replies, then nothing', async () => {
  // the memory fragments and the moment titles (the existing labels cap)
  assert.equal(await reserveLabels(attempt, A, MAX_LABEL_CALLS_PER_ATTEMPT), 1);
  assert.equal(await reserveLabels(attempt, A, MAX_LABEL_CALLS_PER_ATTEMPT), 2);
  // the conversation: the route reserves against the larger cap
  let granted = 0;
  while ((await reserveLabels(attempt, A, momentCap(0))) !== null) granted += 1;
  assert.equal(granted, momentCap(0) - 2, '17 more on this attempt (the unused labels slot plus the 16 turns)');
  // "זה לא מתאים לי" sits above them, at most 3 a dream
  let extra = 0;
  while ((await reserveLabels(attempt, A, momentCap(extra + 1))) !== null && extra < 10) extra += 1;
  assert.equal(extra, REJECTION_REPLIES);
  assert.equal(await reserveLabels(attempt, A, momentCap(99)), null, 'never above 16 + 3');
});

test('the whole view: at most 3 a dream, on the dream\'s own reflection counter', async () => {
  assert.equal(await reserveWhole(attempt, A), 1);
  assert.equal(await reserveWhole(attempt, A), 2);
  assert.equal(await reserveWhole(attempt, A), 3);
  assert.equal(await reserveWhole(attempt, A), null);
});

test('another account cannot use this dream\'s slots', async () => {
  const fresh = await one<{ r: { status: string; attempt_id: string } }>("select public.grant_credits($1, 1, 'purchase', 'grow:TEST-MAP-2') as g, public.start_user_attempt_idem($1, $2, $3) as r", [A, 'idem-map-000000000003', 'c'.repeat(64)]);
  assert.equal(fresh.r.status, 'created');
  assert.equal(await reserveLabels(fresh.r.attempt_id, B, momentCap(3)), null);
  assert.equal(await reserveWhole(fresh.r.attempt_id, B), null);
  assert.equal(await reserveLabels(fresh.r.attempt_id, A, momentCap(0)), 1, 'its owner still can');
});

test('the saved map dream: its owner saves and reads it with the journey; another account cannot see, change or delete it', async () => {
  const analysis = { sourceText: 'הייתי בתחנת רכבת ישנה. הרכבת לא הגיעה. פתאום מצאתי מפתח קטן בכיס.', unusualElements: [] } as unknown as DreamAnalysis;
  let e = mapJourneyFrom(attempt, analysis, null);
  const id = e.moments[0].id;
  e = X.beginConversation(e, id, { role: 'dare', text: 'מה עלה לך?' });
  e = X.addDreamerTurn(e, id, 'זה מזכיר לי משהו');
  e = X.completeConversation(e, id);
  e = X.receiveWholeView(e, { overview: 'עלה משהו.', recurring: null, contrast: null, readings: [], closingQuestion: '', connections: [], kind: 'whole', notice: null, invite: [] }, X.basedOnKey(e));
  const saved = buildSavedDream({ sourceText: analysis.sourceText, inputMode: 'text', dreamAnalysis: analysis, dreamImageDataUrl: null, corrections: [], ...savedFieldsFromJourney(e), dreamReflection: reflectionFromJourney(e, 'he')!, exploration: e });
  const { id: dreamId, createdAt: _c, ...payload } = saved;
  void _c;

  await asUser(A, () => db.query('insert into public.dreams (id, owner_id, payload) values ($1, $2, $3)', [dreamId, A, JSON.stringify(payload)]));
  const mine = await asUser(A, () => db.query<{ payload: { exploration: unknown } }>('select payload from public.dreams where id = $1', [dreamId]));
  assert.equal(mine.rows.length, 1);
  assert.equal(X.parseExploration(mine.rows[0].payload.exploration)?.wholeView?.overview, 'עלה משהו.', 'the journey comes back whole');

  const seen = await asUser(B, () => db.query('select 1 from public.dreams where id = $1', [dreamId]));
  assert.equal(seen.rows.length, 0, 'B cannot see it');
  const changed = await asUser(B, () => db.query("update public.dreams set payload = '{}' where id = $1", [dreamId]));
  assert.equal(changed.affectedRows ?? 0, 0, 'B cannot change it');
  const deleted = await asUser(B, () => db.query('delete from public.dreams where id = $1', [dreamId]));
  assert.equal(deleted.affectedRows ?? 0, 0, 'B cannot delete it');
  await assert.rejects(asUser(B, () => db.query('insert into public.dreams (owner_id, payload) values ($1, $2)', [A, '{}'])), 'B cannot save a dream as A');
  const still = await one<{ n: number }>('select count(*)::int as n from public.dreams where id = $1', [dreamId]);
  assert.equal(still.n, 1);
});

test('the browser\'s roles cannot reach the credit or slot functions at all', async () => {
  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(db.exec(`set role ${role}; select public.reserve_labels_attempt('${attempt}', '${A}', null, 99);`), role);
    await db.exec('reset role;');
    await assert.rejects(db.exec(`set role ${role}; select public.grant_credits('${A}', 5, 'purchase', 'x');`), role);
    await db.exec('reset role;');
  }
});
