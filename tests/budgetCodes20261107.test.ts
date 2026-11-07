import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import OpenAI from 'openai';
import { isBudgetExhausted, analysisBudgetResult, laterStepBudgetResult } from '../server/budgetExhausted';
import { OPENAI_BUDGET_CODES, namesBudgetCode } from '../server/openaiBudgetCodes';
import { budgetAwareFetch } from '../server/openaiClient';
import type { CreditRefundOutcome } from '../server/dreamAttempts';
import type { CallerIdentity } from '../server/callerIdentity';
import * as R from '../server/routes/dreamExploration';
import { handleDreamAnalysis, type DreamAnalysisDeps } from '../server/routes/dreamAnalysis';
import * as X from '../src/hero/exploration';
import { typedAnalysis } from '../src/demo/demoRouter';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema';
import { CONVERSATIONS } from '../src/map/conversationScript';

/**
 * EVERY WAY OPENAI SAYS "THE MONEY RAN OUT" (2026-11-07). The credit protection of 2026-10-30 knew only `insufficient_quota`; OpenAI's
 * current answer for a project's hard spend limit is `project_spend_limit_exceeded` (and three more budget codes). All five are now the
 * budget; an ordinary rate limit, a server error, an overload and a timeout are not, and never touch a credit. A budget answer is never
 * retried by the SDK, so handling it makes no second request. Isolated PostgreSQL (PGlite) with the LIVE refund function (the autosave
 * migration of 2026-11-05) and a mocked OpenAI: no network, no AI cost, no real data.
 */

const BUDGET_CODES = [
  'project_spend_limit_exceeded',
  'organization_spend_limit_exceeded',
  'organization_usage_limit_exceeded',
  'credit_balance_exhausted',
  'insufficient_quota',
] as const;

const apiError = (status: number, error: Record<string, unknown>) => OpenAI.APIError.generate(status, { error: { message: 'x', param: null, ...error } }, undefined, new Headers());
/** The code alone (no `insufficient_quota` anywhere): what the old check missed. Used end to end below. */
const budget = (code: string) => () => apiError(429, { type: null, code });
/** The same code with the older type beside it, and the code given as the type only. */
const budgetWithOldType = (code: string) => () => apiError(429, { type: 'insufficient_quota', code });
const budgetAsTypeOnly = (code: string) => () => apiError(429, { type: code, code: null });
const NOT_BUDGET: ReadonlyArray<[string, () => unknown]> = [
  ['ordinary rate limit', () => apiError(429, { type: 'requests', code: 'rate_limit_exceeded' })],
  ['slow down', () => apiError(429, { type: 'rate_limit_error', code: 'slow_down' })],
  ['429 with no code', () => apiError(429, {})],
  ['server error 500', () => apiError(500, { type: 'server_error', code: 'server_error' })],
  ['overloaded 503', () => apiError(503, { code: 'server_is_overloaded' })],
  ['budget code on a non-429 (402)', () => apiError(402, { code: 'project_spend_limit_exceeded' })],
  ['timeout', () => new OpenAI.APIConnectionTimeoutError()],
  ['connection lost', () => new OpenAI.APIConnectionError({ message: 'socket hang up' })],
  ['plain error naming a code', () => new Error('project_spend_limit_exceeded')],
];

// ================================================================================================ telling them apart

test('the list is exactly the five budget codes, and nothing that means "slow down"', () => {
  assert.deepEqual([...OPENAI_BUDGET_CODES].sort(), [...BUDGET_CODES].sort());
  for (const c of ['rate_limit_exceeded', 'slow_down', 'rate_limit_error', 'server_error', 'requests', 'tokens']) assert.equal(OPENAI_BUDGET_CODES.has(c), false, c);
});

test('every budget code is the budget, whether OpenAI puts it in code or in type', () => {
  for (const code of BUDGET_CODES) {
    assert.equal(isBudgetExhausted(budget(code)()), true, code);
    assert.equal(isBudgetExhausted(budgetWithOldType(code)()), true, `${code} with the older type`);
    assert.equal(isBudgetExhausted(budgetAsTypeOnly(code)()), true, `${code} as type`);
  }
});

test('nothing else is the budget: rate limits, server errors, overload, timeouts, a 402, plain errors', () => {
  for (const [name, err] of NOT_BUDGET) assert.equal(isBudgetExhausted(err()), false, name);
  assert.equal(isBudgetExhausted(null), false);
  assert.equal(isBudgetExhausted(undefined), false);
  assert.equal(namesBudgetCode('project_spend_limit_exceeded'), false, 'a bare string is not a body');
  assert.equal(namesBudgetCode({ error: null }), false);
  assert.equal(namesBudgetCode({ error: { code: 7 } }), false);
});

test('a later step: every budget code answers 503 and asks for the credit once; nothing else asks for it at all', async () => {
  const id = { kind: 'user', userId: 'u' } as CallerIdentity;
  for (const code of BUDGET_CODES) {
    const calls: string[] = [];
    const res = await laterStepBudgetResult(budget(code)(), 'att', id, async (a) => (calls.push(a), 'refunded'));
    assert.ok(res, code);
    assert.equal(res.status, 503, code);
    assert.equal((res.body as { reason: string }).reason, 'service_unavailable_refunded', code);
    assert.deepEqual(calls, ['att'], code);
  }
  for (const [name, err] of NOT_BUDGET) {
    const calls: string[] = [];
    assert.equal(await laterStepBudgetResult(err(), 'att', id, async (a) => (calls.push(a), 'refunded')), null, name);
    assert.deepEqual(calls, [], `${name}: the credit function is not called`);
    assert.equal(analysisBudgetResult(err()), null, name);
  }
  for (const code of BUDGET_CODES) assert.equal(analysisBudgetResult(budget(code)())?.status, 503, code);
});

// ================================================================================================ no second request

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

test('the fetch wrapper: a budget 429 is marked "do not retry", body and status unchanged; everything else passes through untouched', async () => {
  for (const code of BUDGET_CODES) {
    const original = jsonResponse(429, { error: { message: 'm', type: null, code } }, { 'content-encoding': 'gzip' });
    const res = await budgetAwareFetch(async () => original)('https://openai.test/v1/responses');
    assert.equal(res.status, 429, code);
    assert.equal(res.headers.get('x-should-retry'), 'false', code);
    assert.equal(res.headers.get('content-encoding'), null, 'the body is already plain text');
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, code);
  }
  const passthrough: Response[] = [
    jsonResponse(429, { error: { type: 'requests', code: 'rate_limit_exceeded' } }),
    jsonResponse(429, { error: { type: 'rate_limit_error', code: 'slow_down' } }),
    new Response('not json', { status: 429 }),
    jsonResponse(500, { error: { code: 'project_spend_limit_exceeded' } }),
    jsonResponse(200, { ok: true }),
  ];
  for (const r of passthrough) assert.equal(await budgetAwareFetch(async () => r)('https://openai.test/x'), r, 'the very same response object');
});

function countingClient(make: () => Response) {
  let calls = 0;
  const base = async () => (calls += 1, make());
  const client = new OpenAI({ apiKey: 'sk-test-not-a-real-key', baseURL: 'https://openai.test/v1', maxRetries: 2, fetch: budgetAwareFetch(base) });
  return { client, calls: () => calls };
}

test('through the real SDK: a budget answer is ONE request (no retry); an ordinary rate limit and a server error keep their retries', async () => {
  for (const code of BUDGET_CODES) {
    const c = countingClient(() => jsonResponse(429, { error: { message: 'limit', type: null, code } }));
    const err = await c.client.responses.create({ model: 'gpt-4o-mini', input: 'x' }).then(() => null, (e: unknown) => e);
    assert.equal(c.calls(), 1, `${code}: exactly one request`);
    assert.equal(isBudgetExhausted(err), true, `${code}: the route still sees the budget`);
  }
  const rate = countingClient(() => jsonResponse(429, { error: { type: 'requests', code: 'rate_limit_exceeded' } }, { 'retry-after-ms': '1' }));
  const rateErr = await rate.client.responses.create({ model: 'gpt-4o-mini', input: 'x' }).then(() => null, (e: unknown) => e);
  assert.equal(rate.calls(), 3, 'an ordinary rate limit: the first try and the SDK\'s two retries, exactly as before');
  assert.equal(isBudgetExhausted(rateErr), false);
  const server = countingClient(() => jsonResponse(500, { error: { code: 'server_error' } }, { 'retry-after-ms': '1' }));
  await server.client.responses.create({ model: 'gpt-4o-mini', input: 'x' }).catch(() => {});
  assert.equal(server.calls(), 3, 'a server error: unchanged');
});

test('the shared client is built with the wrapper (one place, every route)', () => {
  const src = readFileSync(new URL('../server/openaiClient.ts', import.meta.url), 'utf8');
  assert.match(src, /new OpenAI\(\{ apiKey, fetch: budgetAwareFetch\(/);
  const routes = ['dreamAnalysis', 'dreamElementLabels', 'dreamExploration', 'dreamImage', 'dreamQuestions', 'dreamReflection'];
  for (const r of routes) {
    const s = readFileSync(new URL(`../server/routes/${r}.ts`, import.meta.url), 'utf8');
    assert.doesNotMatch(s, /new OpenAI\(/, `${r} uses the shared client`);
  }
});

// ================================================================================================ the routes and the LIVE refund function

const sql = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
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
  // the live version of refund_attempt_credit_once (only a FINISHED dream counts as saved), without its two cron lines (no cron here)
  await db.exec(sql('20261105_autosave_resume.sql').replace(/^select cron\.schedule\(.*$/gm, ''));
});
after(async () => {
  await db.close();
});

const one = async <T>(q: string, p: unknown[] = []) => (await db.query<T>(q, p)).rows[0];
const balance = async (owner: string) => (await one<{ b: number }>('select public.get_credit_balance($1) as b', [owner])).b;
const refunds = async (attempt: string) => Number((await one<{ c: string }>("select count(*) as c from public.credit_ledger where attempt_id = $1 and reason = 'refund'", [attempt])).c);
const payloadOf = async (id: string) => (await one<{ p: unknown }>('select payload as p from public.dreams where id = $1', [id]))?.p ?? null;
let seq = 0;
const startDream = async (owner: string) => {
  seq += 1;
  await db.query("select public.grant_credits($1, 1, 'purchase', $2)", [owner, `grow:CODES-${seq}`]);
  const r = (await one<{ r: { status: string; attempt_id: string } }>('select public.start_user_attempt_idem($1, $2, $3) as r', [owner, `idem-codes-key-${seq}-0123456789abcdef`, String(seq % 10).repeat(64)])).r;
  assert.equal(r.status, 'created');
  return r.attempt_id;
};
const openRow = (id: string, owner: string, status: 'open' | 'done' | null) =>
  db.query(
    `insert into public.dreams (id, owner_id, payload) values ($1, $2, case when $3::text is null then '{"sourceText":"legacy"}'::jsonb else jsonb_build_object('journey', jsonb_build_object('status', $3::text, 'rev', 4), 'sourceText', 'kept as it is') end)`,
    [id, owner, status],
  );
/** The real refund, exactly as server/dreamAttempts.ts calls it (service role), on the isolated database. */
const realRefund = async (attemptId: string, identity: CallerIdentity): Promise<CreditRefundOutcome | null> =>
  identity.kind === 'user' ? ((await one<{ r: CreditRefundOutcome }>('select public.refund_attempt_credit_once($1, $2) as r', [attemptId, identity.userId])).r) : 'nothing_spent';

const store = CONVERSATIONS.find((c) => c.key === 'store')!;
const seeds = store.moments.map((m) => ({ label: m.label, excerpt: m.excerpt }));
const answered = (attemptId: string) =>
  X.addDreamerTurn(X.beginConversation(X.createExploration(attemptId, seeds), 'm1', { role: 'dare', text: 'איך הוא נראה לך?', move: 'ask' }, new Date('2026-11-07T12:00:00Z')), 'm1', 'הוא היה מבוגר');
const analysis = () => typedAnalysis(store.dreamText, true) as unknown as DreamAnalysis;

function routeDeps(err: () => unknown, owner = A) {
  const log = { aiCalls: 0, slot: 0 };
  const client = { responses: { create: async () => { log.aiCalls += 1; throw err(); } } } as never;
  const deps: R.ExplorationDeps = {
    ...R.realExplorationDeps,
    resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: owner } }) as never,
    openai: () => client,
    rateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }) as never,
    reserveMoment: async () => 'reserved',
    refundMoment: async () => void (log.slot += 1),
    reserveWhole: async () => 'reserved',
    refundWhole: async () => void (log.slot += 1),
    address: async () => 'feminine',
    moderate: async () => ({ status: 'ok' as const, hit: false }),
    refundCredit: realRefund,
  };
  return { deps, log };
}
const turn = (attemptId: string, deps: R.ExplorationDeps) => {
  const e = answered(attemptId);
  return R.handleExploration('conversation-turn', { language: 'he', attemptId, dreamAnalysis: analysis(), exploration: e, momentId: 'm1' }, {}, deps);
};

test('each budget code, end to end: one AI request, 503 "credit back", exactly one refund, the open dream untouched and still continuing', async () => {
  for (const code of BUDGET_CODES) {
    const attempt = await startDream(A);
    await openRow(attempt, A, 'open');
    const payloadBefore = await payloadOf(attempt);
    const before = await balance(A);
    const { deps, log } = routeDeps(budget(code));
    const res = await turn(attempt, deps);
    assert.equal(res.status, 503, code);
    assert.equal((res.body as { reason: string }).reason, 'service_unavailable_refunded', code);
    assert.equal(log.aiCalls, 1, `${code}: handling the budget makes no second AI request`);
    assert.equal(log.slot, 1, `${code}: the step's own slot comes back as for any failure`);
    assert.equal(await balance(A), before + 1, code);
    assert.equal(await refunds(attempt), 1, code);
    assert.deepEqual(await payloadOf(attempt), payloadBefore, `${code}: the saved dream is not touched`);
    // still out of budget: she tries again; nothing more comes back
    const again = await turn(attempt, routeDeps(budget(code)).deps);
    assert.equal((again.body as { reason: string }).reason, 'service_unavailable_refunded', 'the answer still says the credit is back');
    assert.equal(await balance(A), before + 1, `${code}: never twice`);
    assert.equal(await refunds(attempt), 1);
    // the budget is back: the same dream continues on the same attempt, with its slots, and spends nothing
    assert.equal((await one<{ c: number }>('select public.reserve_reflection_attempt($1, $2, null) as c', [attempt, A])).c, 1, `${code}: continues`);
    assert.equal(await balance(A), before + 1);
  }
});

test('requests at the same moment for one dream, every code mixed in: exactly one refund', async () => {
  const attempt = await startDream(A);
  await openRow(attempt, A, 'open');
  const before = await balance(A);
  const results = await Promise.all(
    [...BUDGET_CODES, ...BUDGET_CODES].map((code) => turn(attempt, routeDeps(budget(code)).deps)),
  );
  for (const r of results) assert.equal(r.status, 503);
  assert.equal(await refunds(attempt), 1, 'one refund row, whatever the timing');
  assert.equal(await balance(A), before + 1);
  // and the database itself refuses a second refund row for this dream (the existing unique index)
  await assert.rejects(db.query("insert into public.credit_ledger (owner_id, delta, reason, attempt_id) values ($1, 1, 'refund', $2)", [A, attempt]), /duplicate key|unique/);
});

test('partial saves: an open dream gets its credit back; a finished one, an old saved one and a deleted one do not, and none is touched', async () => {
  const cases: Array<[status: 'open' | 'done' | null | 'deleted', reason: string, delta: number]> = [
    ['open', 'service_unavailable_refunded', 1],
    ['done', 'service_unavailable', 0],
    [null, 'service_unavailable', 0],
    ['deleted', 'service_unavailable', 0],
  ];
  for (const [status, reason, delta] of cases) {
    const attempt = await startDream(A);
    if (status !== 'deleted') await openRow(attempt, A, status);
    const payloadBefore = await payloadOf(attempt);
    const before = await balance(A);
    const res = await turn(attempt, routeDeps(budget('project_spend_limit_exceeded')).deps);
    assert.equal(res.status, 503, String(status));
    assert.equal((res.body as { reason: string }).reason, reason, String(status));
    assert.equal(await balance(A), before + delta, String(status));
    assert.deepEqual(await payloadOf(attempt), payloadBefore, `${String(status)}: the dream row is exactly as it was (or still absent)`);
  }
});

test('another account never gets the credit, even with a budget error on someone else\'s dream', async () => {
  const attempt = await startDream(A);
  await openRow(attempt, A, 'open');
  const a = await balance(A);
  const b = await balance(B);
  const res = await turn(attempt, routeDeps(budget('project_spend_limit_exceeded'), B).deps);
  assert.equal(res.status, 503);
  assert.equal((res.body as { reason: string }).reason, 'service_unavailable');
  assert.equal(await balance(A), a);
  assert.equal(await balance(B), b);
  assert.equal(await refunds(attempt), 0);
});

test('not the budget (rate limit, slow down, server error, overload, timeout, connection): no refund, and each keeps its own answer', async () => {
  const expected: Record<string, [number, string]> = {
    'ordinary rate limit': [429, 'rate_limited'],
    'slow down': [429, 'rate_limited'],
    '429 with no code': [429, 'rate_limited'],
    'server error 500': [502, 'request_failed'],
    'overloaded 503': [502, 'request_failed'],
    'budget code on a non-429 (402)': [502, 'request_failed'],
    timeout: [502, 'request_failed'],
    'connection lost': [502, 'request_failed'],
    'plain error naming a code': [502, 'request_failed'],
  };
  for (const [name, err] of NOT_BUDGET) {
    const attempt = await startDream(A);
    await openRow(attempt, A, 'open');
    const before = await balance(A);
    const { deps, log } = routeDeps(err);
    const res = await turn(attempt, deps);
    assert.deepEqual([res.status, (res.body as { reason: string }).reason], expected[name], name);
    assert.equal(log.aiCalls, 1, name);
    assert.equal(log.slot, 1, `${name}: the step's slot comes back as before`);
    assert.equal(await balance(A), before, `${name}: the credit is not touched`);
    assert.equal(await refunds(attempt), 0, name);
  }
});

function analysisDeps(err: () => unknown) {
  const log = { abandoned: 0, model: 0 };
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
      log.model += 1;
      throw err();
    }) as DreamAnalysisDeps['runModel'],
    moderate: async () => ({ status: 'ok' as const, hit: false }),
  };
  return { deps, log };
}

test('the analysis: every budget code is 503 with the attempt cancelled once (its existing refund); other errors keep their answers', async () => {
  for (const code of BUDGET_CODES) {
    const { deps, log } = analysisDeps(budget(code));
    const res = await handleDreamAnalysis({ sourceText: 'I stood at a door by the sea.', inputMode: 'text', idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, { authorization: 'Bearer x' }, deps);
    assert.equal(res.status, 503, code);
    assert.equal((res.body as { reason: string }).reason, 'service_unavailable', code);
    assert.equal(log.abandoned, 1, code);
    assert.equal(log.model, 1, `${code}: no second model call`);
  }
  const { deps } = analysisDeps(NOT_BUDGET[0][1]);
  const rate = await handleDreamAnalysis({ sourceText: 'I stood at a door by the sea.', inputMode: 'text', idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab' }, { authorization: 'Bearer x' }, deps);
  assert.equal(rate.status, 429);
  assert.equal((rate.body as { reason: string }).reason, 'rate_limited');
});
