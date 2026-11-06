import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

/**
 * THE AUTOSAVE MIGRATION (20261105_autosave_resume.sql) ON AN ISOLATED POSTGRESQL (PGlite): never the live project. The repo's own credit
 * migrations run for real, then this one, with only its two cron.schedule lines left out (no cron here); the jobs' own functions are
 * called directly. PGlite has one connection, so "parallel" here means one request arriving while the other is recorded as running, not
 * two transactions at the same instant; the lock in claim_dream_ai_request is what covers the instant itself.
 */

const sql = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const MIGRATION = sql('20261105_autosave_resume.sql');

let db: PGlite;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz, created_at timestamptz not null default now());
    grant usage on schema public to anon, authenticated, service_role;
    create table public.dream_attempts (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid references auth.users (id) on delete cascade,
      trial_id uuid,
      image_count integer not null default 0 constraint dream_attempts_image_count_bounds check (image_count >= 0 and image_count <= 3),
      reflection_count integer not null default 0 constraint dream_attempts_reflection_count_bounds check (reflection_count >= 0 and reflection_count <= 3),
      label_count integer not null default 0, created_at timestamptz not null default now(), saved_dream_id uuid, completed_at timestamptz);
    create table public.dreams (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users (id) on delete cascade, created_at timestamptz not null default now(), favorite boolean not null default false, payload jsonb not null);
    create table public.trial_identities (
      id uuid primary key, created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
      converted_user_id uuid, claimed_at timestamptz, free_dream_completed_at timestamptz, transcription_count integer not null default 0);
  `);
  await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'a@example.test', now()), ($2, 'b@example.test', now())", [A, B]);
  for (const m of [
    '20260924_credits_entitlement.sql',
    '20260925_idempotent_analysis.sql',
    '20261009_app_owner.sql',
    '20261009_app_owner_cap_saturation.sql',
    '20261011_account_free_dream.sql',
    '20261012_free_dream_ignore_foreign_cookie.sql',
    '20261030_refund_attempt_credit_once.sql',
  ]) {
    await db.exec(sql(m));
  }
  // a dream saved before autosave, as every row in the live table is: no journey at all
  await db.query(`insert into public.dreams (id, owner_id, payload) values ('aaaaaaaa-0000-4000-8000-000000000001', $1, '{"sourceText":"a saved dream"}')`, [A]);
  await db.exec(MIGRATION.replace(/^select cron\.schedule\(.*$/gm, ''));
});
after(async () => {
  await db.close();
});

const one = async <T>(q: string, p: unknown[] = []) => (await db.query<T>(q, p)).rows[0];
const balance = async (owner: string) => (await one<{ b: number }>('select public.get_credit_balance($1) as b', [owner])).b;
const refunds = async (attempt: string) => Number((await one<{ c: string }>("select count(*) as c from public.credit_ledger where attempt_id = $1 and reason = 'refund'", [attempt])).c);
const refundOnce = async (attempt: string, owner: string) => (await one<{ r: string }>('select public.refund_attempt_credit_once($1, $2) as r', [attempt, owner])).r;
const staleJob = async (minutes = 15) => (await one<{ n: number }>('select public.refund_stale_analyses($1) as n', [minutes])).n;

let seq = 0;
const startDream = async (owner: string) => {
  seq += 1;
  await db.query("select public.grant_credits($1, 1, 'purchase', $2)", [owner, `grow:AUTOSAVE-${seq}`]);
  const r = (await one<{ r: { status: string; attempt_id: string } }>('select public.start_user_attempt_idem($1, $2, $3) as r', [owner, `idem-autosave-key-${seq}-0123456789abcdef`, String(seq % 10).repeat(64)])).r;
  assert.equal(r.status, 'created');
  return r.attempt_id;
};
const complete = async (attempt: string, owner: string) => (await one<{ r: boolean }>(`select public.complete_user_analysis($1, $2, '{"title":"x"}'::jsonb) as r`, [attempt, owner])).r;
const age = (attempt: string, minutes: number) => db.query(`update public.dream_attempts set created_at = now() - make_interval(mins => $2) where id = $1`, [attempt, minutes]);
const openRow = (id: string, owner: string, status: 'open' | 'done' = 'open') =>
  db.query(`insert into public.dreams (id, owner_id, payload) values ($1, $2, jsonb_build_object('journey', jsonb_build_object('status', $3::text, 'rev', 0)))`, [id, owner, status]);

const claim = async (dream: string, owner: string, key: string) =>
  (await one<{ r: { state: string; token?: string; result?: unknown } }>('select public.claim_dream_ai_request($1, $2, $3) as r', [dream, owner, key])).r;
const finish = async (dream: string, owner: string, token: string, result: unknown) =>
  (await one<{ r: boolean }>('select public.finish_dream_ai_request($1, $2, $3, $4::jsonb) as r', [dream, owner, token, JSON.stringify(result)])).r;
const age330 = (dream: string, seconds = 331) => db.query(`update public.dream_ai_requests set started_at = now() - make_interval(secs => $2) where dream_id = $1`, [dream, seconds]);

// ---------------------------------------------------------------- existing dreams

test('an existing dream is untouched, and without a journey it still counts as saved', async () => {
  const row = await one<{ payload: unknown }>(`select payload from public.dreams where id = 'aaaaaaaa-0000-4000-8000-000000000001'`);
  assert.deepEqual(row.payload, { sourceText: 'a saved dream' });
  assert.doesNotMatch(MIGRATION.replace(/--.*$/gm, ''), /update\s+public\.dreams|alter\s+table\s+public\.dreams|delete\s+from\s+public\.dreams/i);

  const attempt = await startDream(A);
  await db.query(`update public.dreams set payload = payload || jsonb_build_object('exploration', jsonb_build_object('attemptId', $1::text)) where id = 'aaaaaaaa-0000-4000-8000-000000000001'`, [attempt]);
  const before = await balance(A);
  assert.equal(await refundOnce(attempt, A), 'already_saved');
  assert.equal(await balance(A), before);
});

// ---------------------------------------------------------------- refund against a valid analysis

test('the stale job returns the credit of an analysis that never finished, once, however many times it runs', async () => {
  const attempt = await startDream(B);
  await age(attempt, 16);
  const before = await balance(B);
  assert.equal(await staleJob(), 1);
  assert.equal(await balance(B), before + 1);
  assert.equal(await refunds(attempt), 1);
  assert.equal(await staleJob(), 0);
  assert.equal(await staleJob(), 0);
  assert.equal(await balance(B), before + 1);
  assert.equal(await refunds(attempt), 1);
});

test('the stale job never touches an analysis inside its window: a live run is far shorter than the window', async () => {
  const attempt = await startDream(A);
  await age(attempt, 14);
  const before = await balance(A);
  assert.equal(await staleJob(), 0);
  assert.equal(await balance(A), before);
  assert.equal(await complete(attempt, A), true);
  await assert.rejects(() => staleJob(5), /at least 10 minutes/);
});

test('an analysis that completed is never refunded by the job, however old it is', async () => {
  const attempt = await startDream(A);
  assert.equal(await complete(attempt, A), true);
  await age(attempt, 600);
  const before = await balance(A);
  assert.equal(await staleJob(), 0);
  assert.equal(await balance(A), before);
  assert.equal(await refunds(attempt), 0);
});

test('never both: an analysis that comes back after its refund completes nothing, so no dream is opened', async () => {
  const attempt = await startDream(A);
  await age(attempt, 20);
  assert.equal(await staleJob(), 1);
  assert.equal(await refunds(attempt), 1);
  assert.equal(await complete(attempt, A), false); // the route opens the dream only when this is true
});

test('never both: an attempt that has a dream row is left alone by the job even if it reads as processing', async () => {
  const attempt = await startDream(A);
  await openRow(attempt, A);
  await age(attempt, 60);
  const before = await balance(A);
  assert.equal(await staleJob(), 0);
  assert.equal(await balance(A), before);
  assert.equal(await refunds(attempt), 0);
});

test('a finished dream can never be refunded; finishing it after the budget refund is the one case that keeps both, and only once', async () => {
  const finished = await startDream(A);
  await complete(finished, A);
  await openRow(finished, A, 'done');
  const before = await balance(A);
  assert.equal(await refundOnce(finished, A), 'already_saved');
  assert.equal(await balance(A), before);

  const open = await startDream(A);
  await complete(open, A);
  await openRow(open, A);
  const mid = await balance(A);
  assert.equal(await refundOnce(open, A), 'refunded'); // the AI budget ran out mid-dream (decision of 2026-10-30)
  assert.equal(await refundOnce(open, A), 'already_refunded');
  assert.equal(await balance(A), mid + 1);
  assert.equal(await refunds(open), 1);
});

test('a deleted dream gets no refund, however it is asked; a failed analysis still does', async () => {
  const gone = await startDream(A);
  await complete(gone, A);
  await openRow(gone, A, 'done');
  await db.query('delete from public.dreams where id = $1', [gone]);
  const before = await balance(A);
  assert.equal(await refundOnce(gone, A), 'no_dream');
  assert.equal(await balance(A), before);
  assert.equal(await refunds(gone), 0);

  const openGone = await startDream(A);
  await complete(openGone, A);
  await openRow(openGone, A);
  await db.query('delete from public.dreams where id = $1', [openGone]);
  assert.equal(await refundOnce(openGone, A), 'no_dream');

  // refunded while it existed, then deleted: nothing more, and it says so
  const refunded = await startDream(A);
  await complete(refunded, A);
  await openRow(refunded, A);
  assert.equal(await refundOnce(refunded, A), 'refunded');
  await db.query('delete from public.dreams where id = $1', [refunded]);
  assert.equal(await refundOnce(refunded, A), 'already_refunded');

  // the justified refunds have no dream at all, and are untouched
  const failed = await startDream(A);
  const mid = await balance(A);
  await one('select public.cancel_user_attempt($1, $2)', [failed, A]);
  assert.equal(await balance(A), mid + 1);
  assert.equal(await refunds(failed), 1);
  const stuck = await startDream(A);
  await age(stuck, 20);
  const mid2 = await balance(A);
  assert.equal(await staleJob(), 1);
  assert.equal(await balance(A), mid2 + 1);
});

test('the analysis and its dream are one transaction: both or neither', async () => {
  const openIt = async (a: string) => (await one<{ r: boolean }>(`select public.complete_analysis_open_dream($1, $2, '{"t":1}'::jsonb, '{"journey":{"status":"open","rev":0}}'::jsonb) as r`, [a, A])).r;
  const rows = async (a: string) => Number((await one<{ c: string }>('select count(*) as c from public.dreams where id = $1', [a])).c);
  const a = await startDream(A);
  assert.equal(await openIt(a), true);
  assert.equal(await rows(a), 1);
  assert.equal(await openIt(a), false, 'a second completion does nothing');

  const b = await startDream(A);
  await age(b, 20);
  await staleJob();
  assert.equal(await openIt(b), false, 'an attempt already refunded never becomes a dream');
  assert.equal(await rows(b), 0);

  const c = await startDream(A);
  await assert.rejects(() => db.query(`select public.complete_analysis_open_dream($1, $2, '{"t":1}'::jsonb, null)`, [c, A]), /null value/);
  assert.equal((await one<{ s: string }>('select analysis_status as s from public.dream_attempts where id = $1', [c])).s, 'processing', 'a row that cannot be written leaves the analysis uncompleted');
  assert.equal(await rows(c), 0);
});

test('deleting an open dream gives no credit back and leaves nothing behind', async () => {
  const attempt = await startDream(A);
  await complete(attempt, A);
  await openRow(attempt, A);
  await claim(attempt, A, 'k');
  const before = await balance(A);
  await db.query('delete from public.dreams where id = $1', [attempt]);
  assert.equal(await balance(A), before);
  assert.equal(await staleJob(), 0);
  assert.equal(await refunds(attempt), 0);
  assert.equal(Number((await one<{ c: string }>('select count(*) as c from public.dream_ai_requests where dream_id = $1', [attempt])).c), 0);
});

// ---------------------------------------------------------------- one request, one run

test('one logical request runs once: the second arrival waits, the finished one is handed back, with no new run', async () => {
  const d = await startDream(A);
  await openRow(d, A);
  const first = await claim(d, A, 'turn-1');
  assert.equal(first.state, 'new');
  assert.equal((await claim(d, A, 'turn-1')).state, 'processing');
  assert.equal((await claim(d, A, 'turn-2')).state, 'busy');
  assert.equal(await finish(d, A, first.token!, { text: 'reply' }), true);
  const again = await claim(d, A, 'turn-1');
  assert.equal(again.state, 'done');
  assert.deepEqual(again.result, { text: 'reply' });
  // the result is there on another day and from another device: nothing about it depends on time
  await db.query(`update public.dream_ai_requests set started_at = now() - interval '3 days', finished_at = now() - interval '3 days' where dream_id = $1`, [d]);
  assert.equal((await claim(d, A, 'turn-1')).state, 'done');
  // the next request of the journey replaces it
  assert.equal((await claim(d, A, 'turn-2')).state, 'new');
});

test('stuck-request recovery gives one run only: the first to come takes it, the next waits', async () => {
  const d = await startDream(A);
  await openRow(d, A);
  const first = await claim(d, A, 'turn-1');
  await age330(d, 300); // still inside the longest a server function may run
  assert.equal((await claim(d, A, 'turn-1')).state, 'processing');
  await age330(d);
  const retry = await claim(d, A, 'turn-1');
  assert.equal(retry.state, 'retry');
  assert.notEqual(retry.token, first.token);
  assert.equal((await claim(d, A, 'turn-1')).state, 'processing');
  // the stuck run wakes up late: it changes nothing, and the run that holds the token finishes
  assert.equal(await finish(d, A, first.token!, { text: 'late' }), false);
  assert.equal(await finish(d, A, retry.token!, { text: 'on time' }), true);
  assert.deepEqual((await claim(d, A, 'turn-1')).result, { text: 'on time' });
});

test('a failed run is released and can be tried again; a stale token releases nothing', async () => {
  const d = await startDream(A);
  await openRow(d, A);
  const first = await claim(d, A, 'turn-1');
  assert.equal((await one<{ r: boolean }>('select public.release_dream_ai_request($1, $2, $3) as r', [d, A, '00000000-0000-4000-8000-000000000000'])).r, false);
  assert.equal((await claim(d, A, 'turn-1')).state, 'processing');
  assert.equal((await one<{ r: boolean }>('select public.release_dream_ai_request($1, $2, $3) as r', [d, A, first.token])).r, true);
  assert.equal((await claim(d, A, 'turn-1')).state, 'new');
});

test('no record for a dream that is not this account\'s, and no row is created', async () => {
  const d = await startDream(A);
  await openRow(d, A);
  assert.equal((await claim(d, B, 'turn-1')).state, 'no_dream');
  assert.equal((await claim('bbbbbbbb-0000-4000-8000-000000000001', A, 'turn-1')).state, 'no_dream');
  assert.equal(Number((await one<{ c: string }>('select count(*) as c from public.dream_ai_requests where dream_id = $1', [d])).c), 0);
  assert.equal((await claim(d, A, 'x'.repeat(201))).state, 'invalid');
});

test('the record goes when the dream is finished: the hourly job clears finished dreams only', async () => {
  const open = await startDream(A);
  await openRow(open, A);
  const done = await startDream(A);
  await openRow(done, A, 'done');
  await claim(open, A, 'k');
  await claim(done, A, 'k');
  await one('select public.purge_finished_ai_requests()');
  assert.equal(Number((await one<{ c: string }>('select count(*) as c from public.dream_ai_requests where dream_id = $1', [open])).c), 1);
  assert.equal(Number((await one<{ c: string }>('select count(*) as c from public.dream_ai_requests where dream_id = $1', [done])).c), 0);
});

// ---------------------------------------------------------------- access

test('the record is closed to every browser role: no table right, no function right, RLS on with no policy', async () => {
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await one<{ ok: boolean }>(`select has_table_privilege($1, 'public.dream_ai_requests', 'select') as ok`, [role])).ok, false);
    assert.equal((await one<{ ok: boolean }>(`select has_table_privilege($1, 'public.dream_ai_requests', 'insert') as ok`, [role])).ok, false);
    for (const fn of [
      'public.claim_dream_ai_request(uuid, uuid, text, integer)',
      'public.finish_dream_ai_request(uuid, uuid, uuid, jsonb)',
      'public.release_dream_ai_request(uuid, uuid, uuid)',
      'public.refund_stale_analyses(integer)',
      'public.purge_finished_ai_requests()',
      'public.complete_analysis_open_dream(uuid, uuid, jsonb, jsonb)',
      'public.refund_attempt_credit_once(uuid, uuid)',
    ]) {
      assert.equal((await one<{ ok: boolean }>(`select has_function_privilege($1, $2, 'execute') as ok`, [role, fn])).ok, false, `${role} ${fn}`);
      assert.equal((await one<{ ok: boolean }>(`select has_function_privilege('service_role', $1, 'execute') as ok`, [fn])).ok, true, fn);
    }
  }
  assert.equal((await one<{ on: boolean }>(`select relrowsecurity as on from pg_class where oid = 'public.dream_ai_requests'::regclass`)).on, true);
  assert.equal(Number((await one<{ c: string }>(`select count(*) as c from pg_policies where tablename = 'dream_ai_requests'`)).c), 0);
  for (const name of ['claim_dream_ai_request', 'finish_dream_ai_request', 'release_dream_ai_request', 'refund_stale_analyses', 'purge_finished_ai_requests']) {
    const f = await one<{ d: boolean; c: string[] | null }>('select prosecdef as d, proconfig as c from pg_proc where proname = $1', [name]);
    assert.equal(f.d, true, name);
    assert.ok(f.c?.some((x) => x.startsWith('search_path=')), `${name} has a fixed search_path`);
  }
});

test('running the migration a second time changes nothing and loses nothing', async () => {
  const d = await startDream(A);
  await openRow(d, A);
  const first = await claim(d, A, 'kept');
  await finish(d, A, first.token!, { text: 'kept' });
  await db.exec(MIGRATION.replace(/^select cron\.schedule\(.*$/gm, ''));
  assert.deepEqual((await claim(d, A, 'kept')).result, { text: 'kept' });
  assert.equal((await one<{ on: boolean }>(`select relrowsecurity as on from pg_class where oid = 'public.dream_ai_requests'::regclass`)).on, true);
  assert.equal((await one<{ ok: boolean }>(`select has_table_privilege('authenticated', 'public.dream_ai_requests', 'select') as ok`)).ok, false);
});

test('the migration schedules exactly the two jobs and says it must come before the code', () => {
  assert.equal(MIGRATION.match(/^select cron\.schedule\(/gm)?.length, 2);
  assert.match(MIGRATION, /NOT APPLIED/);
  assert.match(MIGRATION, /ROLLBACK/);
  assert.match(MIGRATION, /p_stale_seconds integer default 330/);
});
