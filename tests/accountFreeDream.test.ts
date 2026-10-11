import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { ensureFreeDreamDecision, readFreeDreamDecision, accountFreeDreamsPerDay, freeDreamGrantedNow, type FreeDreamStore } from '../server/freeDream.ts';
import { summarizeFreeDream, summarizeGrants } from '../server/creditHistory.ts';
import { mintTrialCookie } from '../server/trialIdentity.ts';
import { handleDreamAnalysis, type DreamAnalysisDeps } from '../server/routes/dreamAnalysis.ts';
import type { CallerIdentity } from '../server/callerIdentity.ts';
import { parseCreditSummary } from '../src/credits/creditSummary.ts';
import { describeBalance, balanceMessageKey } from '../src/credits/dreamBalance.ts';
import { en, he } from '../src/i18n/translations.ts';

/**
 * ONE free dream per person: a guest, a person who signs up first, a guest who signs up half-way, a guest who finished — run for real on
 * PostgreSQL (PGlite) with the repo's migrations and the production trial functions, then the server and screen rules around it.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const sql = (name: string) => read(`supabase/migrations/${name}`);

// The production definitions of the guest (trial) objects, which are not part of the repo's migrations.
const TRIAL_SQL = `
create table public.trial_identities (
  id uuid primary key, created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  converted_user_id uuid, claimed_at timestamptz, free_dream_completed_at timestamptz, transcription_count integer not null default 0);
create unique index dream_attempts_one_completed_per_trial on public.dream_attempts (trial_id) where completed_at is not null and trial_id is not null;
CREATE OR REPLACE FUNCTION public.create_trial_attempt(p_trial_id uuid, p_max_attempts integer, p_global_limit integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_trial_id::text, 0));
  if not exists (select 1 from trial_identities where id = p_trial_id) then return jsonb_build_object('status', 'unknown_trial'); end if;
  if exists (select 1 from trial_identities where id = p_trial_id and (free_dream_completed_at is not null or converted_user_id is not null)) then
    return jsonb_build_object('status', 'consumed'); end if;
  if (select count(*) from dream_attempts where trial_id = p_trial_id) >= p_max_attempts then return jsonb_build_object('status', 'attempt_limit'); end if;
  insert into dream_attempts (trial_id) values (p_trial_id) returning id into v_id;
  return jsonb_build_object('status', 'created', 'attempt_id', v_id);
end $function$;
CREATE OR REPLACE FUNCTION public.complete_trial_attempt(p_attempt_id uuid, p_trial_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_trial_id::text, 0));
  if exists (select 1 from dream_attempts where id = p_attempt_id and trial_id = p_trial_id and completed_at is not null) then return 'completed'; end if;
  if exists (select 1 from trial_identities where id = p_trial_id and free_dream_completed_at is not null) then return 'consumed'; end if;
  update dream_attempts set completed_at = now() where id = p_attempt_id and trial_id = p_trial_id and completed_at is null;
  if not found then return 'not_found'; end if;
  update trial_identities set free_dream_completed_at = now() where id = p_trial_id;
  return 'completed';
end $function$;
`;

let db: PGlite;
const OWNER_ID = '7d55396c-3582-4aec-8470-d188fc029829';
before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz);
    grant usage on schema public to anon, authenticated, service_role;
    create table public.dream_attempts (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid references auth.users (id) on delete cascade,
      trial_id uuid,
      image_count integer not null default 0 constraint dream_attempts_image_count_bounds check (image_count >= 0 and image_count <= 3),
      reflection_count integer not null default 0 constraint dream_attempts_reflection_count_bounds check (reflection_count >= 0 and reflection_count <= 3),
      label_count integer not null default 0, created_at timestamptz not null default now(), saved_dream_id uuid, completed_at timestamptz);
  `);
  await db.exec(sql('20260924_credits_entitlement.sql'));
  await db.exec(`
    alter table public.credit_ledger alter column owner_id drop not null;
    alter table public.credit_ledger drop constraint if exists credit_ledger_owner_id_fkey;
    alter table public.credit_ledger add constraint credit_ledger_owner_id_fkey foreign key (owner_id) references auth.users (id) on delete set null;`);
  await db.exec(sql('20260925_idempotent_analysis.sql'));
  await db.exec(sql('20261007_payment_orders.sql'));
  await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${OWNER_ID}', 'dafnadl77@gmail.com', now())`);
  await db.exec(sql('20261009_app_owner.sql'));
  await db.exec(sql('20261009_app_owner_cap_saturation.sql'));
  await db.exec(TRIAL_SQL);
  await db.exec(sql('20261011_account_free_dream.sql'));
});
after(async () => {
  await db.close();
});

// ------------------------------------------------------------------ helpers
let n = 0;
async function newUser(confirmed = true): Promise<string> {
  n += 1;
  return (await db.query<{ id: string }>('insert into auth.users (email, email_confirmed_at) values ($1, $2) returning id', [`u${n}@example.test`, confirmed ? new Date().toISOString() : null])).rows[0].id;
}
async function newTrial(): Promise<string> {
  const id = (await db.query<{ id: string }>('select gen_random_uuid() as id')).rows[0].id;
  await db.query('insert into public.trial_identities (id) values ($1)', [id]);
  return id;
}
type Decided = { status: string; outcome?: string; new?: boolean; balance?: number };
async function decide(user: string, trial: string | null = null, limit = 100): Promise<Decided> {
  return (await db.query<{ r: Decided }>('select public.decide_account_free_dream($1, $2, $3) as r', [user, trial, limit])).rows[0].r;
}
async function guestAttempt(trial: string, progress: { images?: number; reflections?: number } = {}): Promise<string> {
  const r = (await db.query<{ r: { status: string; attempt_id: string } }>('select public.create_trial_attempt($1, 3, 150) as r', [trial])).rows[0].r;
  assert.equal(r.status, 'created');
  if (progress.images || progress.reflections) {
    await db.query('update public.dream_attempts set image_count = $2, reflection_count = $3 where id = $1', [r.attempt_id, progress.images ?? 0, progress.reflections ?? 0]);
  }
  return r.attempt_id;
}
async function guestFinishes(trial: string): Promise<string> {
  const a = await guestAttempt(trial);
  assert.equal((await db.query<{ r: string }>('select public.complete_trial_attempt($1, $2) as r', [a, trial])).rows[0].r, 'completed');
  return a;
}
let k = 0;
async function startDream(user: string) {
  k += 1;
  return (await db.query<{ r: { status: string; attempt_id?: string } }>('select public.start_user_attempt_idem($1, $2, $3) as r', [user, `free-dream-key-${String(k).padStart(12, '0')}`, 'c'.repeat(64)])).rows[0].r;
}
const balance = async (u: string) => (await db.query<{ b: number }>('select public.get_credit_balance($1) as b', [u])).rows[0].b;
const freeRows = async (u: string) => (await db.query("select 1 from public.credit_ledger where owner_id = $1 and reason = 'free'", [u])).rows.length;
async function ledgerRows(u: string) {
  return (await db.query<{ delta: number; reason: string; attempt_id: string | null }>('select delta, reason, attempt_id from public.credit_ledger where owner_id = $1 order by id', [u])).rows;
}
async function purchase(user: string, amount: number, ref: string) {
  await db.query("select public.grant_credits($1, $2, 'purchase', $3)", [user, amount, ref]);
}
/** What /api/credits derives for the account (the same statements as getCreditHistory) -> what the screens are told. */
async function summaryFor(user: string) {
  const rows = (await db.query<{ delta: number; reason: string }>('select delta, reason from public.credit_ledger where owner_id = $1', [user])).rows;
  const grants = summarizeGrants(rows.filter((r) => ['purchase', 'backfill', 'admin'].includes(r.reason)))!;
  const trialDone = (await db.query('select 1 from public.trial_identities where converted_user_id = $1 and free_dream_completed_at is not null', [user])).rows.length > 0;
  const outcome = (await db.query<{ outcome: string }>('select outcome from public.free_dream_decisions where owner_id = $1', [user])).rows[0]?.outcome ?? null;
  const free = summarizeFreeDream(rows, outcome, trialDone)!;
  return parseCreditSummary({
    balance: await balance(user),
    purchasedPackage: null,
    ...grants,
    freeDreamUsed: free.freeDreamUsed,
    ...(free.freeGranted > 0 ? { freeGranted: free.freeGranted } : {}),
    ...(free.freeDream ? { freeDream: free.freeDream } : {}),
  })!;
}
const say = (summary: ReturnType<typeof parseCreditSummary>, lang: 'he' | 'en') => {
  const view = describeBalance(summary!);
  const key = balanceMessageKey(view, 'archive')!;
  const [section, name] = key.split('.');
  const dict = (lang === 'he' ? he : en) as unknown as Record<string, Record<string, string>>;
  return dict[section][name].replace('{remaining}', String(view.remaining)).replace('{total}', String(view.total ?? ''));
};

// ================================================================== 1. a person who signs up BEFORE starting a dream
test('signing up first gives exactly one free dream, which can be used and saved once', async () => {
  const user = await newUser();
  assert.deepEqual(await decide(user), { status: 'decided', outcome: 'granted', new: true, balance: 1 });
  assert.equal(await balance(user), 1);
  assert.equal(say(await summaryFor(user), 'he'), 'החלום החינמי שלך מחכה לך');
  assert.equal(say(await summaryFor(user), 'en'), 'Your free dream is waiting for you');
  const first = await startDream(user);
  assert.equal(first.status, 'created', 'the free credit pays for the dream through the ordinary path');
  assert.equal(await balance(user), 0);
  assert.equal((await startDream(user)).status, 'credits_required', 'and there is no second one');
  assert.equal(say(await summaryFor(user), 'he'), 'החלום החינמי שלך נוצל');
  assert.deepEqual((await ledgerRows(user)).map((r) => [r.delta, r.reason]), [[1, 'free'], [-1, 'spend']]);
});

test('a free dream whose analysis fails is given back, exactly once (the ordinary refund path)', async () => {
  const user = await newUser();
  await decide(user);
  const a = await startDream(user);
  assert.equal((await db.query<{ r: string }>('select public.cancel_user_attempt($1, $2) as r', [a.attempt_id, user])).rows[0].r, 'refunded');
  assert.equal((await db.query<{ r: string }>('select public.cancel_user_attempt($1, $2) as r', [a.attempt_id, user])).rows[0].r, 'not_refunded');
  assert.equal(await balance(user), 1);
  assert.equal((await summaryFor(user)).freeDream, 'available');
  assert.equal(await freeRows(user), 1, 'a refund is not a second grant');
});

// ================================================================== 2. a guest who FINISHED the free dream
test('a guest who finished the free dream and signs up gets no further free dream', async () => {
  const user = await newUser(); const trial = await newTrial();
  await guestFinishes(trial);
  assert.deepEqual(await decide(user, trial), { status: 'decided', outcome: 'used_as_guest', new: true, balance: 0 });
  assert.equal(await balance(user), 0);
  assert.equal(await freeRows(user), 0);
  assert.equal((await startDream(user)).status, 'credits_required');
  assert.equal(say(await summaryFor(user), 'he'), 'החלום החינמי שלך נוצל');
  assert.equal((await db.query('select 1 from public.trial_identities where id = $1 and converted_user_id = $2', [trial, user])).rows.length, 1, 'the guest became the account');
});

test('...and no refresh, double click, second tab or second sign-in changes that', async () => {
  const user = await newUser(); const trial = await newTrial();
  await guestFinishes(trial);
  await decide(user, trial);
  for (let i = 0; i < 4; i += 1) assert.deepEqual(await decide(user, trial), { status: 'decided', outcome: 'used_as_guest', new: false, balance: 0 });
  assert.deepEqual(await decide(user, null), { status: 'decided', outcome: 'used_as_guest', new: false, balance: 0 }, 'even with no cookie at all');
  assert.equal(await freeRows(user), 0);
});

// ================================================================== 3. a guest who signs up HALF-WAY
test('a guest who started (analysis only) and signs up keeps a free dream: the credit is theirs, the half-started attempt cannot be continued on top of it', async () => {
  const user = await newUser(); const trial = await newTrial();
  const half = await guestAttempt(trial);
  assert.deepEqual(await decide(user, trial), { status: 'decided', outcome: 'granted', new: true, balance: 1 });
  assert.equal((await db.query('select 1 from public.dream_attempts where id = $1', [half])).rows.length, 0, 'the half-started attempt is dropped');
  assert.equal((await db.query<{ r: { status: string } }>('select public.create_trial_attempt($1, 3, 150) as r', [trial])).rows[0].r.status, 'consumed', 'the guest identity cannot also start another free dream');
  assert.equal((await startDream(user)).status, 'created');
  assert.equal(await balance(user), 0);
  assert.equal((await startDream(user)).status, 'credits_required');
});

test('a guest whose dream already produced its image or reflection and then signs up: that dream IS the free dream (no second one), and it is given back if it is released', async () => {
  const user = await newUser(); const trial = await newTrial();
  const inflight = await guestAttempt(trial, { images: 1 });
  assert.deepEqual(await decide(user, trial), { status: 'decided', outcome: 'used_inflight', new: true, balance: 0 });
  assert.equal(await balance(user), 0);
  assert.equal((await startDream(user)).status, 'credits_required', 'no second free dream');
  assert.equal((await db.query('select 1 from public.dream_attempts where id = $1 and owner_id = $2', [inflight, user])).rows.length, 1, 'the dream in progress belongs to the account and can be finished');
  assert.deepEqual((await ledgerRows(user)).map((r) => [r.delta, r.reason, r.attempt_id === inflight]), [[1, 'free', false], [-1, 'spend', true]]);
  // if that dream fails and is released, the free dream is theirs again
  assert.equal((await db.query<{ r: string }>('select public.cancel_user_attempt($1, $2) as r', [inflight, user])).rows[0].r, 'refunded');
  assert.equal(await balance(user), 1);
});

// ================================================================== 4. one free dream, whatever the device, tab or repeat
test('refresh / double click / two tabs at once: exactly one free dream (the decision is atomic and idempotent)', async () => {
  const user = await newUser();
  const results = await Promise.all(Array.from({ length: 12 }, () => decide(user)));
  assert.equal(results.filter((r) => r.new === true).length, 1);
  assert.equal(await freeRows(user), 1);
  assert.equal(await balance(user), 1);
});

test('a second device (with its own guest cookie) cannot add another one to the same account', async () => {
  const user = await newUser();
  await decide(user);
  const otherDevice = await newTrial();
  assert.deepEqual(await decide(user, otherDevice), { status: 'decided', outcome: 'granted', new: false, balance: 1 });
  assert.equal(await freeRows(user), 1);
  assert.equal(await balance(user), 1);
});

test('a browser whose guest was already claimed by ANOTHER account gives a second account no free dream', async () => {
  const first = await newUser(); const second = await newUser(); const trial = await newTrial();
  assert.equal((await decide(first, trial)).outcome, 'granted');
  assert.deepEqual(await decide(second, trial), { status: 'decided', outcome: 'browser_used', new: true, balance: 0 });
  assert.equal(await freeRows(second), 0);
});

test('an account that already received a free dream the old way (an attempt that never spent a credit) is not given another', async () => {
  const user = await newUser();
  await db.query('insert into public.dream_attempts (owner_id) values ($1)', [user]);
  assert.deepEqual(await decide(user), { status: 'decided', outcome: 'legacy_used', new: true, balance: 0 });
  assert.equal(await freeRows(user), 0);
});

// ================================================================== 5. purchased credits and the Owner are untouched
test('an account with purchased credits keeps every one of them, gets the free one on top, and spends the free one first', async () => {
  const user = await newUser();
  await purchase(user, 3, 'grow:TX-FD-1');
  assert.deepEqual(await decide(user), { status: 'decided', outcome: 'granted', new: true, balance: 4 });
  assert.deepEqual((await ledgerRows(user)).map((r) => [r.delta, r.reason]), [[3, 'purchase'], [1, 'free']]);
  let s = await summaryFor(user);
  assert.equal(say(s, 'en'), 'You have 4 of 4 dreams left, including your free dream');
  assert.equal((await startDream(user)).status, 'created');
  s = await summaryFor(user);
  assert.equal(s.balance, 3);
  assert.equal(s.freeDream, 'used');
  assert.equal(say(s, 'he'), 'נותרו לך 3 מתוך 3 חלומות בחבילה', 'once the free one is used, what is left is the purchased package, exactly as before');
});

test('the app owner never gets or needs a free credit, and nothing about the owner changes', async () => {
  const before = await balance(OWNER_ID);
  assert.deepEqual(await decide(OWNER_ID), { status: 'decided', outcome: 'owner', new: true, balance: before });
  assert.equal(await freeRows(OWNER_ID), 0);
  for (let i = 0; i < 4; i += 1) assert.equal((await startDream(OWNER_ID)).status, 'created');
  assert.equal(await balance(OWNER_ID), before);
});

// ================================================================== 6. protections against abuse
test('an unconfirmed e-mail gets nothing, and nothing is changed (the guest is not even claimed yet)', async () => {
  const user = await newUser(false); const trial = await newTrial();
  await guestAttempt(trial);
  assert.deepEqual(await decide(user, trial), { status: 'unconfirmed' });
  assert.equal((await db.query('select 1 from public.free_dream_decisions where owner_id = $1', [user])).rows.length, 0);
  assert.equal((await db.query('select 1 from public.trial_identities where id = $1 and converted_user_id is not null', [trial])).rows.length, 0);
  assert.equal(await balance(user), 0);
});

test('a daily cap bounds new free dreams: beyond it nothing is changed and the same call succeeds once there is room', async () => {
  const before = (await db.query<{ c: number }>("select count(*)::int as c from public.credit_ledger where reason = 'free' and created_at > now() - interval '24 hours'")).rows[0].c;
  const a = await newUser(); const b = await newUser(); const trial = await newTrial();
  await guestAttempt(trial);
  assert.equal((await decide(a, null, before + 1)).outcome, 'granted');
  assert.deepEqual(await decide(b, trial, before + 1), { status: 'unavailable' });
  assert.equal((await db.query('select 1 from public.trial_identities where id = $1 and converted_user_id is not null', [trial])).rows.length, 0, 'nothing claimed while deferred');
  assert.equal((await db.query('select 1 from public.free_dream_decisions where owner_id = $1', [b])).rows.length, 0);
  assert.equal((await decide(b, trial, before + 50)).outcome, 'granted');
  assert.equal((await decide(a, null, 1)).outcome, 'granted', 'an account that already has its answer is never turned away by the cap');
});

test('only the server can use any of this: the browser can neither read nor call it, and the ledger still rejects nonsense reasons', async () => {
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query<{ r: boolean }>(`select has_function_privilege('${role}', 'public.decide_account_free_dream(uuid, uuid, integer)', 'execute') as r`)).rows[0].r, false, role);
    for (const priv of ['select', 'insert', 'update', 'delete']) {
      assert.equal((await db.query<{ r: boolean }>(`select has_table_privilege('${role}', 'public.free_dream_decisions', '${priv}') as r`)).rows[0].r, false, `${role} ${priv}`);
    }
  }
  assert.equal((await db.query<{ r: boolean }>("select has_function_privilege('service_role', 'public.decide_account_free_dream(uuid, uuid, integer)', 'execute') as r")).rows[0].r, true);
  assert.equal((await db.query<{ r: boolean }>("select relrowsecurity as r from pg_class where oid = 'public.free_dream_decisions'::regclass")).rows[0].r, true);
  const user = await newUser();
  await assert.rejects(db.query("insert into public.credit_ledger (owner_id, delta, reason) values ($1, 1, 'gift')", [user]));
  await assert.rejects(db.query("insert into public.credit_ledger (owner_id, delta, reason, external_ref) values ($1, 1, 'free', $2)", [user, `free:${user}`]).then(() => db.query("insert into public.credit_ledger (owner_id, delta, reason, external_ref) values ($1, 1, 'free', $2)", [user, `free:${user}`])), 'a second free ledger row for the same account is refused by the ledger itself');
});

test('deleting an account removes its decision and keeps the anonymized ledger, without error', async () => {
  const user = await newUser();
  await decide(user);
  await db.query('delete from auth.users where id = $1', [user]);
  assert.equal((await db.query('select 1 from public.free_dream_decisions where owner_id = $1', [user])).rows.length, 0);
  assert.equal((await db.query("select 1 from public.credit_ledger where reason = 'free' and external_ref = $1 and owner_id is null", [`free:${user}`])).rows.length, 1);
});

// ================================================================== the server around it
const SECRET = 'a'.repeat(48);
const ENV = { VERCEL: '1', NODE_ENV: 'production', DARE_TRIAL_COOKIE_SECRET: SECRET };

test('the guest is identified ONLY by the request\'s own signed cookie: a forged or missing cookie means "no guest"', async () => {
  const seen: Array<string | null> = [];
  const store: FreeDreamStore = { decide: async (_u, trial) => (seen.push(trial), { status: 'decided', outcome: 'granted', new: true }) };
  const minted = mintTrialCookie(ENV)!;
  const pair = minted.setCookieHeader.split(';')[0];
  await ensureFreeDreamDecision('u', pair, store, ENV);
  await ensureFreeDreamDecision('u', 'dare_trial=forged.value', store, ENV);
  await ensureFreeDreamDecision('u', undefined, store, ENV);
  assert.deepEqual(seen, [minted.trialId, null, null]);
});

test('the decision never throws and fails safe: nothing is granted when it cannot be made', async () => {
  assert.equal(await ensureFreeDreamDecision('u', null, { decide: async () => { throw new Error('db down'); } }, ENV), null);
  assert.equal(await ensureFreeDreamDecision('u', null, { decide: async () => null }, ENV), null);
  assert.equal(await ensureFreeDreamDecision('u', null, { decide: async () => ({ status: 'whatever' }) }, ENV), null);
  assert.equal(readFreeDreamDecision({ status: 'decided', outcome: 'free-for-all', new: true }), null);
  assert.deepEqual(readFreeDreamDecision({ status: 'unavailable' }), { status: 'unavailable' });
  assert.deepEqual(readFreeDreamDecision({ status: 'decided', outcome: 'used_as_guest', new: false }), { status: 'decided', outcome: 'used_as_guest', isNew: false });
});

test('the daily cap is 100 by default, overridable, never below 1', () => {
  assert.equal(accountFreeDreamsPerDay({}), 100);
  assert.equal(accountFreeDreamsPerDay({ DARE_ACCOUNT_FREE_PER_DAY: '25' }), 25);
  assert.equal(accountFreeDreamsPerDay({ DARE_ACCOUNT_FREE_PER_DAY: '0' }), 100);
});

test('summarizeFreeDream: the free credit is counted as the first one used; guests who used theirs are "used"; unknown stays unknown', () => {
  assert.deepEqual(summarizeFreeDream([{ delta: 1, reason: 'free' }], 'granted', false), { freeGranted: 1, freeDream: 'available', freeDreamUsed: false });
  assert.deepEqual(summarizeFreeDream([{ delta: 1, reason: 'free' }, { delta: -1, reason: 'spend' }], 'granted', false), { freeGranted: 1, freeDream: 'used', freeDreamUsed: true });
  assert.deepEqual(summarizeFreeDream([{ delta: 1, reason: 'free' }, { delta: -1, reason: 'spend' }, { delta: 1, reason: 'refund' }], 'granted', false), { freeGranted: 1, freeDream: 'available', freeDreamUsed: false });
  assert.deepEqual(summarizeFreeDream([{ delta: 3, reason: 'purchase' }, { delta: -1, reason: 'spend' }], null, false), { freeGranted: 0, freeDreamUsed: false });
  assert.deepEqual(summarizeFreeDream([], 'used_as_guest', false), { freeGranted: 0, freeDream: 'used', freeDreamUsed: true });
  assert.deepEqual(summarizeFreeDream([], null, true), { freeGranted: 0, freeDream: 'used', freeDreamUsed: true });
  assert.equal(summarizeFreeDream(null, null, false), null);
  assert.equal(summarizeFreeDream([{ delta: 'x', reason: 'free' }], null, false), null);
});

// ------------------------------------------------ the analysis route: a credit-less account owed its free dream
function analysisHarness(settle: DreamAnalysisDeps['settleFreeDream'], identity: CallerIdentity = { kind: 'user', userId: 'user-1' }) {
  const starts: string[] = [];
  let models = 0;
  const deps: DreamAnalysisDeps = {
    resolveIdentity: (async () => ({ ok: true, identity })) as DreamAnalysisDeps['resolveIdentity'],
    getClient: () => ({}) as never,
    start: {
      startLegacy: async () => ({ ok: false, reason: 'credits_required' }),
      startIdempotent: async () => {
        starts.push('start');
        return starts.length === 1 ? { kind: 'refused', reason: 'credits_required' } : { kind: 'created', attemptId: 'attempt-1' };
      },
      sleep: async () => {},
    },
    abandon: async () => {},
    complete: async () => true,
    runModel: (async () => {
      models += 1;
      return { status: 'ok', value: { summary: 'x' } };
    }) as DreamAnalysisDeps['runModel'],
    settleFreeDream: settle,
  };
  return { deps, starts, models: () => models };
}
const KEY = 'free-dream-route-key-0001';
const post = (deps: DreamAnalysisDeps) => handleDreamAnalysis({ sourceText: 'a door by the sea', inputMode: 'text', idempotencyKey: KEY }, { authorization: 'Bearer x', cookie: 'dare_trial=c' }, deps);

test('route: a credit-less account whose free dream has JUST been given starts its dream (once more, one model call)', async () => {
  const seen: Array<[string, string | null | undefined]> = [];
  const h = analysisHarness(async (user, cookie) => (seen.push([user, cookie]), true));
  const res = await post(h.deps);
  assert.equal(res.status, 200);
  assert.deepEqual(h.starts, ['start', 'start']);
  assert.equal(h.models(), 1);
  assert.deepEqual(seen, [['user-1', 'dare_trial=c']], 'the verified account and the request\'s own cookie');
});

test('route: when no free dream is owed, the answer is the same credits_required as before and the model is never called', async () => {
  const h = analysisHarness(async () => false);
  const res = await post(h.deps);
  assert.equal(res.status, 402);
  assert.equal((res.body as { reason: string }).reason, 'credits_required');
  assert.deepEqual(h.starts, ['start']);
  assert.equal(h.models(), 0);
});

test('route: a guest (trial) identity never triggers the account free-dream decision', async () => {
  let asked = 0;
  const h = analysisHarness(async () => (asked += 1, true), { kind: 'trial', trialId: 't-1' });
  const res = await post(h.deps);
  assert.equal(asked, 0);
  assert.equal(res.status, 402);
});

test('wiring: credits, claim-trial and transcription settle the decision where it must happen, and never for the owner or a payment poll', () => {
  const credits = code('server/routes/credits.ts');
  assert.match(credits, /if \(orderId === undefined && owner !== true\) await ensureFreeDreamDecision\(verified\.userId, requestHeaders\.cookie\);/);
  assert.ok(credits.indexOf('owner === true && orderId === undefined') < credits.indexOf('ensureFreeDreamDecision('), 'the owner is answered before any of this');
  assert.ok(credits.indexOf('ensureFreeDreamDecision(') < credits.indexOf('getCreditBalance(verified.userId)', credits.indexOf('ensureFreeDreamDecision(')), 'decided BEFORE the balance is read');
  const claim = code('server/routes/claimTrial.ts');
  assert.ok(claim.indexOf('ensureFreeDreamDecision(') < claim.indexOf('claimTrialForUser('), 'linked and decided together, before the plain claim');
  assert.match(claim, /decision\?\.status === 'unavailable' \|\| decision\?\.status === 'unconfirmed'\) return okResult\(\{ claimed: false, outcome: 'deferred' \}\)/);
  const transcription = code('server/routes/dreamTranscription.ts');
  assert.match(transcription, /balance === 0 && \(await freeDreamGrantedNow\(resolved\.identity\.userId, requestHeaders\.cookie\)\)/);
  assert.ok(transcription.indexOf('freeDreamGrantedNow(') < transcription.indexOf("errorResult(402, 'credits_required'"), 'the free dream is settled before refusing for lack of credit');
  assert.ok(transcription.indexOf('freeDreamGrantedNow(') < transcription.indexOf('enforceRateLimits('), 'and the rate limit still applies to it');
  assert.match(code('server/routes/dreamAnalysis.ts'), /deps\.settleFreeDream\(resolved\.identity\.userId, requestHeaders\.cookie\)/);
  assert.equal(typeof freeDreamGrantedNow, 'function');
});

test('payments, Grow, Make and checkout are untouched, and the decision never writes through any other credit function', () => {
  for (const file of ['server/payments/paymentComplete.ts', 'server/payments/checkoutStart.ts', 'server/payments/checkoutPackages.ts', 'server/payments/completionStore.ts', 'api/payment-complete.ts', 'src/payments/CheckoutDialog.tsx']) {
    assert.ok(!/freeDream|free_dream/i.test(read(file)), file);
  }
  const migration = sql('20261011_account_free_dream.sql').replace(/--.*$/gm, '');
  assert.ok(!/grant_credits|complete_payment_order|payment_orders|app_owners|drop table|truncate/i.test(migration));
  assert.ok(!/create or replace function public\.(start_user_attempt|cancel_user_attempt|grant_credits|start_user_attempt_idem)/i.test(migration), 'no existing credit function is redefined');
});

// ------------------------------------------------ the screens
test('several purchases: the screens show the total purchased and the total remaining, never the latest package as the only one', () => {
  const several = parseCreditSummary({ balance: 12, purchasedPackage: 'explore_10', grantedCredits: 13, grantCount: 2, freeDreamUsed: true })!;
  assert.equal(say(several, 'he'), 'נותרו לך 12 מתוך 13 חלומות מכל החבילות שרכשת');
  assert.equal(say(several, 'en'), 'You have 12 of 13 dreams left across your packages');
  const archive = read('src/archive/DreamArchive.tsx');
  assert.match(archive, /accountPlan\.several \? t\('archive\.settingsPlanSeveral'\) : planDisplayName\(accountPlan\.plan, t\)/, 'Settings does not name only the latest package');
  assert.match(archive, /summary\.grantedCredits/);
  assert.match(archive, /summary\.balance/);
  const plan = code('src/credits/useAccountPlan.ts');
  assert.match(plan, /several: \(summary\.grantCount \?\? 0\) > 1/);
  const pricing = read('src/pricing/PricingPage.tsx');
  assert.match(pricing, /isLatestOfSeveral=\{accountPlan\.status === 'ready' && accountPlan\.several\}/);
  assert.equal(he.pricing.yourLatestPackage, 'זו החבילה האחרונה שלך');
  assert.equal(en.pricing.yourLatestPackage, 'This is your latest package');
  assert.equal(he.archive.settingsPlanSeveral, 'כמה חבילות');
});

test('the free dream on screen: waiting / used, in both languages, and in Settings', () => {
  const waiting = parseCreditSummary({ balance: 1, purchasedPackage: null, grantedCredits: 0, grantCount: 0, freeDreamUsed: false, freeGranted: 1, freeDream: 'available' })!;
  assert.equal(describeBalance(waiting).kind, 'free-available');
  assert.equal(say(waiting, 'he'), 'החלום החינמי שלך מחכה לך');
  const used = parseCreditSummary({ balance: 0, purchasedPackage: null, grantedCredits: 0, grantCount: 0, freeDreamUsed: true, freeGranted: 1, freeDream: 'used' })!;
  assert.equal(describeBalance(used).kind, 'free-used');
  assert.equal(parseCreditSummary({ balance: 1, freeDream: 'maybe' })?.freeDream, undefined, 'only the two known values are kept');
  assert.equal(parseCreditSummary({ balance: 1, freeGranted: -1 })?.freeGranted, undefined);
  assert.equal(he.archive.settingsFreeDreamAvailable, 'זמין');
  assert.equal(he.archive.settingsFreeDreamUsed, 'נוצל');
  assert.match(read('src/archive/DreamArchive.tsx'), /summary\.freeDream === 'available' \? t\('archive\.settingsFreeDreamAvailable'\) : t\('archive\.settingsFreeDreamUsed'\)/);
});

test('the entry gate lets an account with its free dream in (a balance of 1), and still sends only a definite zero to Packages', () => {
  const app = code('src/App.tsx');
  assert.match(app, /fetchCreditBalance\(\)\.then\(\(balance\) => \{\s*if \(cancelled \|\| balance !== 0\) return;/);
  assert.equal(describeBalance(parseCreditSummary({ balance: 1, grantedCredits: 0, grantCount: 0, freeGranted: 1, freeDream: 'available' })!).remaining, 1);
});

test('an owner is shown unlimited, whatever else is in the answer', () => {
  assert.equal(describeBalance(parseCreditSummary({ balance: 1, owner: true })!).kind, 'owner');
  assert.equal(say(parseCreditSummary({ balance: 1, owner: true }), 'he'), 'חלומות ללא הגבלה ∞');
});
