import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import OpenAI from 'openai';
import { isBudgetExhausted, analysisBudgetResult, laterStepBudgetResult } from '../server/budgetExhausted';
import type { CreditRefundOutcome } from '../server/dreamAttempts';
import * as R from '../server/routes/dreamExploration';
import { handleDreamAnalysis, type DreamAnalysisDeps } from '../server/routes/dreamAnalysis';
import type { CallerIdentity } from '../server/callerIdentity';
import * as X from '../src/hero/exploration';
import { typedAnalysis } from '../src/demo/demoRouter';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema';
import { CONVERSATIONS } from '../src/map/conversationScript';
import { createExplorationEngine } from '../src/hero/explorationEngineCore';
import { classifyFirstImageFailure, recoveryForFirstImageFailure, MAX_FIRST_IMAGE_TRIES } from '../src/hero/firstImageRecovery';
import { serviceNoticeOf } from '../src/hero/serviceUnavailable';
import { en, he } from '../src/i18n/translations';
import { mapStrings } from '../src/map/mapStrings';

/**
 * DARE'S AI BUDGET RAN OUT IN THE MIDDLE OF A DREAM (approved 2026-10-30, docs/upgrade-2026-10/budget-cap-credit-protection-design-2026-10-30.md).
 * Only OpenAI's 429 `insufficient_quota` is handled; an ordinary 429 (`rate_limit_exceeded`) keeps its behaviour. A later step returns the
 * dream's credit ONCE, only if one was really spent, never after the dream was saved; the attempt stays, so the open dream continues on it
 * without a second charge and without any extra free dream. On an isolated PostgreSQL (PGlite) and a mocked OpenAI: no network, no AI cost.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const sql = (name: string) => read(`supabase/migrations/${name}`);
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const budgetError = () =>
  OpenAI.APIError.generate(429, { error: { message: 'You exceeded your current quota.', type: 'insufficient_quota', code: 'insufficient_quota', param: null } }, undefined, new Headers());
const rateLimitError = () =>
  OpenAI.APIError.generate(429, { error: { message: 'Rate limit reached.', type: 'requests', code: 'rate_limit_exceeded', param: null } }, undefined, new Headers());

// ================================================================================================ the database function

let db: PGlite;
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const OWNER = '33333333-3333-4333-8333-333333333333';
const FREE = '44444444-4444-4444-8444-444444444444';

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
    create table public.dreams (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users (id) on delete cascade, created_at timestamptz not null default now(), favorite boolean not null default false, payload jsonb not null default '{}');
    create table public.trial_identities (
      id uuid primary key, created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
      converted_user_id uuid, claimed_at timestamptz, free_dream_completed_at timestamptz, transcription_count integer not null default 0);
  `);
  await db.query(
    "insert into auth.users (id, email, email_confirmed_at) values ($1, 'a@example.test', now()), ($2, 'b@example.test', now()), ($3, 'owner@example.test', now()), ($4, 'free@example.test', now())",
    [A, B, OWNER, FREE],
  );
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
  await db.query('insert into public.app_owners (owner_id) values ($1) on conflict do nothing', [OWNER]);
});
after(async () => {
  await db.close();
});

const one = async <T>(q: string, p: unknown[] = []) => (await db.query<T>(q, p)).rows[0];
const balance = async (owner: string) => (await one<{ b: number }>('select public.get_credit_balance($1) as b', [owner])).b;
const refund = async (attempt: string | null, owner: string | null) => (await one<{ r: string }>('select public.refund_attempt_credit_once($1, $2) as r', [attempt, owner])).r;
const refunds = async (attempt: string) => Number((await one<{ c: string }>("select count(*) as c from public.credit_ledger where attempt_id = $1 and reason = 'refund'", [attempt])).c);
const spends = async (owner: string) => Number((await one<{ c: string }>("select count(*) as c from public.credit_ledger where owner_id = $1 and reason = 'spend'", [owner])).c);
let seq = 0;
const startDream = async (owner: string) => {
  seq += 1;
  const r = (await one<{ r: { status: string; attempt_id: string } }>('select public.start_user_attempt_idem($1, $2, $3) as r', [owner, `idem-budget-${String(seq).padStart(9, '0')}`, String(seq % 10).repeat(64)])).r;
  return r;
};
const buy = async (owner: string, ref: string) => db.query("select public.grant_credits($1, 1, 'purchase', $2)", [owner, ref]);

test('a later step after the budget ran out: the dream\'s credit comes back once; a retry finds it already returned', async () => {
  await buy(A, 'grow:BUDGET-1');
  const d = await startDream(A);
  assert.equal(d.status, 'created');
  assert.equal(await balance(A), 0, 'the dream spent its credit');
  assert.equal(await refund(d.attempt_id, A), 'refunded');
  assert.equal(await balance(A), 1);
  assert.equal(await refund(d.attempt_id, A), 'already_refunded', 'trying again while the budget is still out');
  assert.equal(await refund(d.attempt_id, A), 'already_refunded');
  assert.equal(await balance(A), 1, 'never a second credit');
  assert.equal(await refunds(d.attempt_id), 1);
});

test('requests at the same moment (image and conversation together): exactly one refund', async () => {
  await buy(A, 'grow:BUDGET-2');
  const before = await balance(A);
  const d = await startDream(A);
  const outcomes = await Promise.all(Array.from({ length: 8 }, () => refund(d.attempt_id, A)));
  assert.equal(outcomes.filter((o) => o === 'refunded').length, 1, JSON.stringify(outcomes));
  assert.deepEqual([...new Set(outcomes.filter((o) => o !== 'refunded'))], ['already_refunded']);
  assert.equal(await balance(A), before, 'spent one, got one back, nothing more');
  assert.equal(await refunds(d.attempt_id), 1);
  // the database itself refuses a second refund row for one dream, whatever the timing (the existing unique index)
  await assert.rejects(db.query("insert into public.credit_ledger (owner_id, delta, reason, attempt_id) values ($1, 1, 'refund', $2)", [A, d.attempt_id]), /duplicate key|unique/);
});

test('the open dream continues on the same attempt with no second charge, and no extra dream is made free', async () => {
  await buy(A, 'grow:BUDGET-3');
  const start = await balance(A);
  const d = await startDream(A);
  const spentBefore = await spends(A);
  assert.equal(await refund(d.attempt_id, A), 'refunded');
  assert.equal(await balance(A), start);
  // the attempt is kept: its own per-step slots still work when the budget is back
  assert.equal((await one<{ c: number }>('select public.reserve_image_attempt($1, $2, null) as c', [d.attempt_id, A])).c, 1);
  assert.equal((await one<{ c: number }>('select public.reserve_labels_attempt($1, $2, null, 3) as c', [d.attempt_id, A])).c, 1);
  assert.equal((await one<{ c: number }>('select public.reserve_reflection_attempt($1, $2, null) as c', [d.attempt_id, A])).c, 1);
  assert.equal(await spends(A), spentBefore, 'continuing spends nothing');
  assert.equal(await balance(A), start);
  // the returned credit is one credit: one new dream with it, then none
  const spare = start; // what the account had before this dream, now back
  for (let i = 0; i < spare; i += 1) assert.equal((await startDream(A)).status, 'created');
  assert.equal(await balance(A), 0);
  assert.equal((await startDream(A)).status, 'credits_required', 'no free dream beyond the credit that came back');
  // a later failure on the same continued dream returns nothing more
  assert.equal(await refund(d.attempt_id, A), 'already_refunded');
  assert.equal(await balance(A), 0);
});

test('nothing is returned when no credit was spent: the owner, a guest\'s attempt, another account, bad input', async () => {
  const o = await startDream(OWNER);
  assert.equal(o.status, 'created');
  const ownerBalance = await balance(OWNER);
  assert.equal(await refund(o.attempt_id, OWNER), 'nothing_spent');
  assert.equal(await balance(OWNER), ownerBalance);
  assert.equal(await refunds(o.attempt_id), 0);

  const guest = (await one<{ id: string }>('insert into public.dream_attempts (trial_id) values (gen_random_uuid()) returning id')).id;
  assert.equal(await refund(guest, A), 'not_found');

  await buy(A, 'grow:BUDGET-4');
  const d = await startDream(A);
  assert.equal(await refund(d.attempt_id, B), 'not_found', 'another account never gets this dream\'s credit');
  assert.equal(await balance(B), 0);
  assert.equal(await refund(null, A), 'invalid');
  assert.equal(await refund(d.attempt_id, null), 'invalid');
  assert.equal(await refunds(d.attempt_id), 0);
});

test('never after the dream was saved', async () => {
  await buy(A, 'grow:BUDGET-5');
  const d = await startDream(A);
  const b = await balance(A);
  await db.query("insert into public.dreams (owner_id, payload) values ($1, jsonb_build_object('exploration', jsonb_build_object('attemptId', $2::text)))", [A, d.attempt_id]);
  assert.equal(await refund(d.attempt_id, A), 'already_saved');
  assert.equal(await balance(A), b);
  assert.equal(await refunds(d.attempt_id), 0);
  // another account's saved dream naming this attempt does not block it
  await buy(A, 'grow:BUDGET-6');
  const d2 = await startDream(A);
  await db.query("insert into public.dreams (owner_id, payload) values ($1, jsonb_build_object('exploration', jsonb_build_object('attemptId', $2::text)))", [B, d2.attempt_id]);
  assert.equal(await refund(d2.attempt_id, A), 'refunded');
});

test('an analysis that already returned the credit (cancel_user_attempt) is never returned again', async () => {
  await buy(A, 'grow:BUDGET-7');
  const d = await startDream(A);
  const b = await balance(A);
  assert.equal((await one<{ r: string }>('select public.cancel_user_attempt($1, $2) as r', [d.attempt_id, A])).r, 'refunded');
  assert.equal(await balance(A), b + 1);
  assert.equal(await refund(d.attempt_id, A), 'not_found');
  assert.equal(await balance(A), b + 1);
  assert.equal(await refunds(d.attempt_id), 1);
  // and the other way round: a later-step refund first, then the cancellation adds nothing
  await buy(A, 'grow:BUDGET-8');
  const d2 = await startDream(A);
  const b2 = await balance(A);
  assert.equal(await refund(d2.attempt_id, A), 'refunded');
  assert.equal((await one<{ r: string }>('select public.cancel_user_attempt($1, $2) as r', [d2.attempt_id, A])).r, 'not_refunded');
  assert.equal(await balance(A), b2 + 1);
  assert.equal(await refunds(d2.attempt_id), 1);
});

test('the free dream: its credit comes back once, and the free dream is never granted a second time', async () => {
  const granted = (await one<{ r: { outcome: string } }>('select public.decide_account_free_dream($1, null, 0) as r', [FREE])).r;
  assert.equal(granted.outcome, 'granted');
  const d = await startDream(FREE);
  assert.equal(d.status, 'created');
  assert.equal(await balance(FREE), 0);
  assert.equal(await refund(d.attempt_id, FREE), 'refunded');
  assert.equal(await balance(FREE), 1);
  const again = (await one<{ r: { new: boolean; balance: number } }>('select public.decide_account_free_dream($1, null, 0) as r', [FREE])).r;
  assert.equal(again.new, false, 'no second free dream');
  assert.equal(again.balance, 1);
  assert.equal(Number((await one<{ c: string }>("select count(*) as c from public.credit_ledger where owner_id = $1 and reason = 'free'", [FREE])).c), 1);
});

test('only the server may call it', async () => {
  for (const role of ['anon', 'authenticated']) {
    const r = await one<{ ok: boolean }>("select has_function_privilege($1, 'public.refund_attempt_credit_once(uuid, uuid)', 'execute') as ok", [role]);
    assert.equal(r.ok, false, role);
  }
  assert.equal((await one<{ ok: boolean }>("select has_function_privilege('service_role', 'public.refund_attempt_credit_once(uuid, uuid)', 'execute') as ok")).ok, true);
  assert.equal((await one<{ d: boolean }>("select prosecdef as d from pg_proc where proname = 'refund_attempt_credit_once'")).d, true);
});

test('the migration changes no table and no data, and names its rollback', () => {
  const m = code('supabase/migrations/20261030_refund_attempt_credit_once.sql'.replace(/^/, ''));
  assert.doesNotMatch(m, /\b(alter|drop|create)\s+table\b/i);
  assert.match(read('supabase/migrations/20261030_refund_attempt_credit_once.sql'), /ROLLBACK: drop function public\.refund_attempt_credit_once\(uuid, uuid\)/);
});

// ================================================================================================ telling the two 429s apart

test('only 429 insufficient_quota is the budget; an ordinary rate limit, a 402 and other errors are not', () => {
  assert.equal(isBudgetExhausted(budgetError()), true);
  assert.equal(isBudgetExhausted(rateLimitError()), false);
  assert.equal(isBudgetExhausted(OpenAI.APIError.generate(402, { error: { code: 'insufficient_quota' } }, undefined, new Headers())), false, 'only on 429');
  assert.equal(isBudgetExhausted(OpenAI.APIError.generate(500, { error: { code: 'server_error' } }, undefined, new Headers())), false);
  assert.equal(isBudgetExhausted(new Error('insufficient_quota')), false, 'a plain error is never the budget');
  assert.equal(isBudgetExhausted(null), false);
});

test('a later step: the answer says whether the credit is back; an ordinary rate limit never touches the credit', async () => {
  const id: CallerIdentity = { kind: 'user', userId: A } as CallerIdentity;
  const calls: string[] = [];
  const stub = (outcome: CreditRefundOutcome | null) => async (attemptId: string) => (calls.push(attemptId), outcome);
  for (const [outcome, reason] of [
    ['refunded', 'service_unavailable_refunded'],
    ['already_refunded', 'service_unavailable_refunded'],
    ['nothing_spent', 'service_unavailable'],
    ['already_saved', 'service_unavailable'],
    ['not_found', 'service_unavailable'],
    [null, 'service_unavailable'],
  ] as const) {
    const res = await laterStepBudgetResult(budgetError(), 'att-1', id, stub(outcome));
    assert.equal(res?.status, 503, String(outcome));
    assert.equal((res?.body as { reason: string }).reason, reason, String(outcome));
  }
  calls.length = 0;
  assert.equal(await laterStepBudgetResult(rateLimitError(), 'att-1', id, stub('refunded')), null);
  assert.equal(await laterStepBudgetResult(new Error('boom'), 'att-1', id, stub('refunded')), null);
  assert.deepEqual(calls, [], 'the credit function is not even called');
  assert.equal(analysisBudgetResult(budgetError())?.status, 503);
  assert.equal((analysisBudgetResult(budgetError())?.body as { reason: string }).reason, 'service_unavailable');
  assert.equal(analysisBudgetResult(rateLimitError()), null);
});

// ================================================================================================ the routes, with a mocked OpenAI

const store = CONVERSATIONS.find((c) => c.key === 'store')!;
const seeds = store.moments.map((m) => ({ label: m.label, excerpt: m.excerpt }));
const answered = () =>
  X.addDreamerTurn(X.beginConversation(X.createExploration('budget-att', seeds), 'm1', { role: 'dare', text: 'איך הוא נראה לך?', move: 'ask' }, new Date('2026-10-30T12:00:00Z')), 'm1', 'הוא היה מבוגר');
const failingClient = (err: () => unknown) => ({ responses: { create: async () => { throw err(); } } }) as never;
function explorationDeps(err: () => unknown) {
  const log = { credit: [] as string[], moment: 0, whole: 0 };
  const deps: R.ExplorationDeps = {
    ...R.realExplorationDeps,
    resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: A } }) as never,
    openai: () => failingClient(err),
    rateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }) as never,
    reserveMoment: async () => 'reserved',
    refundMoment: async () => void (log.moment += 1),
    reserveWhole: async () => 'reserved',
    refundWhole: async () => void (log.whole += 1),
    address: async () => 'feminine',
    moderate: async () => ({ status: 'ok' as const, hit: false }),
    refundCredit: async (attemptId) => (log.credit.push(attemptId), 'refunded'),
  };
  return { deps, log };
}
const analysis = () => typedAnalysis(store.dreamText, true) as unknown as DreamAnalysis;

test('the conversation: the budget out answers 503 with the credit back, returns the turn\'s slot, and the dream stays as it was', async () => {
  const { deps, log } = explorationDeps(budgetError);
  const e = answered();
  const res = await R.handleExploration('conversation-turn', { language: 'he', attemptId: e.attemptId, dreamAnalysis: analysis(), exploration: e, momentId: 'm1' }, {}, deps);
  assert.equal(res.status, 503);
  assert.equal((res.body as { reason: string }).reason, 'service_unavailable_refunded');
  assert.deepEqual(log.credit, ['budget-att']);
  assert.equal(log.moment, 1, 'the slot comes back as for any failure');
  // what she wrote is untouched: the route never changes the journey it was sent
  assert.equal(X.needsTurnCall(e, 'm1'), true);
});

test('the summary of the conversation: the same answer, on the whole-view slot', async () => {
  const { deps, log } = explorationDeps(budgetError);
  const e = X.completeConversation(answered(), 'm1');
  assert.equal(X.canRequestWholeView(e), true, 'a summary is really asked for');
  const res = await R.handleExploration('conversation-summary', { language: 'he', attemptId: e.attemptId, dreamAnalysis: analysis(), exploration: e, momentId: null }, {}, deps);
  assert.equal(res.status, 503);
  assert.equal((res.body as { reason: string }).reason, 'service_unavailable_refunded');
  assert.deepEqual(log.credit, ['budget-att']);
  assert.equal(log.whole, 1);
});

test('the conversation, ordinary rate limit: exactly today\'s behaviour, and the credit is not touched', async () => {
  const { deps, log } = explorationDeps(rateLimitError);
  const e = answered();
  const res = await R.handleExploration('conversation-turn', { language: 'he', attemptId: e.attemptId, dreamAnalysis: analysis(), exploration: e, momentId: 'm1' }, {}, deps);
  assert.equal(res.status, 429);
  assert.equal((res.body as { reason: string }).reason, 'rate_limited');
  assert.deepEqual(log.credit, []);
  assert.equal(log.moment, 1);
});

function analysisDeps(err: () => unknown) {
  const log = { abandoned: 0 };
  const deps: DreamAnalysisDeps = {
    resolveIdentity: (async () => ({ ok: true, identity: { kind: 'user', userId: A } as CallerIdentity })) as DreamAnalysisDeps['resolveIdentity'],
    getClient: () => ({}) as never,
    start: {
      startLegacy: async () => ({ ok: false, reason: 'not_configured' }),
      startIdempotent: async () => ({ kind: 'created', attemptId: 'att-analysis' }),
      sleep: async () => {},
    },
    abandon: (async () => void (log.abandoned += 1)) as DreamAnalysisDeps['abandon'],
    complete: async () => true,
    runModel: (async () => {
      throw err();
    }) as DreamAnalysisDeps['runModel'],
    moderate: async () => ({ status: 'ok' as const, hit: false }),
  };
  return { deps, log };
}
const analyse = (deps: DreamAnalysisDeps) =>
  handleDreamAnalysis({ sourceText: 'I stood at a door by the sea.', inputMode: 'text', idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, { authorization: 'Bearer x' }, deps);

test('the analysis: the attempt is cancelled (its credit back, as before) and the answer names the cause', async () => {
  const { deps, log } = analysisDeps(budgetError);
  const res = await analyse(deps);
  assert.equal(res.status, 503);
  assert.equal((res.body as { reason: string }).reason, 'service_unavailable');
  assert.equal(log.abandoned, 1);
});

test('the analysis, ordinary rate limit: unchanged (429 rate_limited)', async () => {
  const { deps, log } = analysisDeps(rateLimitError);
  const res = await analyse(deps);
  assert.equal(res.status, 429);
  assert.equal((res.body as { reason: string }).reason, 'rate_limited');
  assert.equal(log.abandoned, 1);
});

test('every later-step route checks the budget first, keeps its own slot refund, and leaves its other branches as they were', () => {
  for (const [file, slot] of [
    ['server/routes/dreamImage.ts', 'refundImageAttempt(attemptId)'],
    ['server/routes/dreamElementLabels.ts', 'refundLabelsAttempt(attemptId)'],
    ['server/routes/dreamQuestions.ts', 'refundLabelsAttempt(attemptId)'],
    ['server/routes/dreamReflection.ts', 'refundReflectionAttempt(attemptId)'],
    ['server/routes/dreamExploration.ts', 'refund()'],
  ] as const) {
    const c = code(file);
    const budget = c.indexOf('laterStepBudgetResult(err, attemptId, resolved.identity');
    assert.ok(budget > 0, file);
    assert.ok(c.lastIndexOf(slot, budget + 400) > 0, `${file}: the slot is still returned`);
    const rate = c.indexOf('rate_limited', budget);
    assert.ok(rate > budget, `${file}: the ordinary 429 branch is still there, after the budget check`);
  }
  const a = code('server/routes/dreamAnalysis.ts');
  assert.ok(a.indexOf('await deps.abandon(resolved.identity, attemptId)') < a.indexOf('analysisBudgetResult(err)'), 'the analysis cancels first, as before');
});

// ================================================================================================ the screens

test('the browser reads the new reasons; the conversation engine keeps them apart from an ordinary rate limit', async () => {
  for (const [status, reason, expected] of [
    [503, 'service_unavailable_refunded', 'service_unavailable_refunded'],
    [503, 'service_unavailable', 'service_unavailable'],
    [429, 'rate_limited', 'rate_limited'],
  ] as const) {
    const engine = createExplorationEngine({ post: async () => ({ status, data: { reason, message: 'x' } }) });
    const out = await engine.turn(answered(), analysis(), 'm1', 'he', []);
    assert.equal(out.status, 'error');
    assert.equal((out as { reason: string }).reason, expected);
  }
  assert.equal(serviceNoticeOf('service_unavailable_refunded'), 'refunded');
  assert.equal(serviceNoticeOf('service_unavailable'), 'plain');
  assert.equal(serviceNoticeOf('rate_limited'), null);
});

test('the first image: a budget failure always offers "try again" and never uses up the dream (others unchanged)', () => {
  for (const r of ['service_unavailable', 'service_unavailable_refunded']) {
    assert.equal(classifyFirstImageFailure(r), 'unavailable');
    assert.deepEqual(recoveryForFirstImageFailure('unavailable', MAX_FIRST_IMAGE_TRIES + 5), { action: 'retry' });
  }
  assert.deepEqual(recoveryForFirstImageFailure(classifyFirstImageFailure('request_failed'), MAX_FIRST_IMAGE_TRIES), { action: 'restart' });
  assert.deepEqual(recoveryForFirstImageFailure(classifyFirstImageFailure('rate_limited'), 1), { action: 'retry' });
  assert.deepEqual(recoveryForFirstImageFailure(classifyFirstImageFailure('content_rejected'), 1), { action: 'rephrase' });
  assert.deepEqual(recoveryForFirstImageFailure(classifyFirstImageFailure('limit_reached'), 1), { action: 'restart' });
});

test('the approved wording, word for word, in Hebrew and English', () => {
  assert.equal(he.serviceUnavailable.analysis, 'DARE אינה זמינה כרגע. לא נוצל קרדיט, ואפשר לנסות שוב מאוחר יותר.');
  assert.equal(en.serviceUnavailable.analysis, 'DARE is unavailable right now. No credit was used, and you can try again later.');
  assert.equal(he.serviceUnavailable.laterRefunded, 'DARE אינה זמינה כרגע. הקרדיט של החלום הזה הוחזר לחשבון. אם הדף יישאר פתוח, אפשר לנסות שוב מאוחר יותר ולהמשיך מאותה נקודה.');
  assert.equal(en.serviceUnavailable.laterRefunded, 'DARE is unavailable right now. The credit for this dream has been returned to your account. If this page stays open, you can try again later and continue from the same point.');
  assert.equal(he.serviceUnavailable.later, 'DARE אינה זמינה כרגע. אם הדף יישאר פתוח, אפשר לנסות שוב מאוחר יותר ולהמשיך מאותה נקודה.');
  assert.equal(en.serviceUnavailable.later, 'DARE is unavailable right now. If this page stays open, you can try again later and continue from the same point.');
  assert.equal(mapStrings('he').troubleUnavailableRefunded, he.serviceUnavailable.laterRefunded);
  assert.equal(mapStrings('en').troubleUnavailableRefunded, en.serviceUnavailable.laterRefunded);
  assert.equal(mapStrings('he').troubleUnavailable, he.serviceUnavailable.later);
  assert.equal(mapStrings('en').troubleUnavailable, en.serviceUnavailable.later);
  // the ordinary failure lines are unchanged
  assert.equal(mapStrings('he').troubleTurn, 'DARE לא הצליחה לענות כרגע. אפשר לנסות שוב בעוד רגע.');
  assert.equal(he.hold.analysisFailed, 'משהו השתבש בזמן שניסיתי להרכיב את זה מחדש.');
});

test('each screen shows the budget wording only for the budget reasons, with its existing retry kept', () => {
  const hold = code('src/hero/HoldToRemember.tsx');
  assert.match(hold, /analysisUnavailable \? 'serviceUnavailable\.analysis' : analysisUncertain \? 'hold\.analysisUncertain' : 'hold\.analysisFailed'/);
  const hero = code('src/hero/HeroDream.tsx');
  assert.match(hero, /analysisUnavailable=\{analysisResult\?\.status === 'error' && analysisResult\.reason === 'service_unavailable'\}/);
  assert.match(hero, /serviceNoticeOf\(imageResult\.reason\) \?\?/, 'a failed regeneration keeps the last image and names the cause');
  const recon = code('src/hero/DreamReconstruction.tsx');
  assert.match(recon, /imageServiceNotice\s*\?/);
  assert.match(recon, /regenNotice !== 'limit'/, 'NOT QUITE (the retry) stays for the budget notice');
  const refl = code('src/hero/DreamReflection.tsx');
  assert.match(refl, /serviceNotice === 'refunded' \? 'serviceUnavailable\.laterRefunded'/);
  assert.match(refl, /onClick=\{onRetryReflection\}/);
  const map = code('src/map/DreamJourneyMap.tsx');
  assert.match(map, /unavailableOf\(reason\) \?\?/);
});
