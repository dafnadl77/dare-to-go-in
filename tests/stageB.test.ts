import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as X from '../src/hero/exploration';
import * as R from '../server/routes/dreamExploration';
import { typedAnalysis } from '../src/demo/demoRouter';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema';
import { CONVERSATIONS } from '../src/map/conversationScript';
import { clearLocalAccountState, ACCOUNT_LOCAL_STORAGE_KEYS } from '../src/auth/localAccountState';

/**
 * STAGE ב (doc 109, approved 2026-10-24): adults only, enforced by the server; the browser's own speech recognition off; the dream draft
 * cleared at sign-out; OpenAI moderation as a second layer that can only raise a level; and every AI route checking her words before
 * and DARE's words after, failing closed. Written BEFORE the code (docs/upgrade-2026-10/111-stage-b-tests-before.txt). No network, no AI.
 */

const src = (p: string) => readFileSync(p, 'utf8');
const quiet = async () => ({ status: 'ok' as const, hit: false });
const hits = async () => ({ status: 'ok' as const, hit: true });
const down = async () => ({ status: 'unavailable' as const });

// ------------------------------------------------------------------------------------------------ 1. the live words stay (her decision of 2026-10-24)

test('live words: they stay exactly as they work today, beside the recording and the final OpenAI transcription', () => {
  const hold = src('src/hero/HoldToRemember.tsx');
  assert.match(hold, /livePreview\.start\(getAppLanguage\(\)\)/, 'the live words still start with the recording');
  assert.doesNotMatch(hold, /LIVE_WORDS_ENABLED/, 'no switch that turns them off');
  assert.doesNotMatch(src('src/hero/livePreviewController.ts'), /processLocally/, 'the behaviour is unchanged');
  assert.match(src('src/hero/dreamTranscription.ts'), /\/api\/dream-transcription/);
  assert.match(src('server/routes/dreamTranscription.ts'), /audio\.transcriptions\.create/);
  // the privacy policy says where the live words' audio goes (the browser maker's speech service; in Chrome, Google)
  const privacy = src('src/legal/privacyContent.ts');
  assert.match(privacy, /Google/);
  assert.match(privacy, /speech recognition/i);
  assert.match(privacy, /זיהוי הדיבור/);
});

// ------------------------------------------------------------------------------------------------ 2. the draft at sign-out

test('sign-out removes the dream draft from the device, with the rest of the account state', () => {
  assert.ok((ACCOUNT_LOCAL_STORAGE_KEYS as readonly string[]).includes('dare.dreamDraft.v1'));
  const removed: string[] = [];
  const store = { removeItem: (k: string) => void removed.push(k) };
  clearLocalAccountState(store, store);
  assert.ok(removed.includes('dare.dreamDraft.v1'));
});

// ------------------------------------------------------------------------------------------------ 3. adults only, enforced by the server

test('age: an account without a confirmation is refused by every AI route (403 age_required); with one it passes', async () => {
  const A = await import('../server/ageGate');
  const user = (ageConfirmedAt: string | null) => async () => ({ ok: true as const, identity: { kind: 'user' as const, userId: 'u1' }, ageConfirmedAt });
  const refused = await A.resolveAdultCaller({}, { resolve: user(null) });
  assert.equal(refused.ok, false);
  assert.equal((refused as { status: number }).status, 403);
  assert.equal((refused as { reason: string }).reason, 'age_required');
  assert.equal((await A.resolveAdultCaller({}, { resolve: user('2026-10-24T10:00:00.000Z') })).ok, true);
});

test('age: an anonymous visitor passes only with the signed age cookie of the same trial; a copied, edited or missing one is refused', async () => {
  const A = await import('../server/ageGate');
  const env = { DARE_TRIAL_COOKIE_SECRET: 'x'.repeat(40) };
  const trial = (id: string) => async () => ({ ok: true as const, identity: { kind: 'trial' as const, trialId: id } });
  const minted = A.mintAgeCookie('t-1', env);
  assert.ok(minted);
  assert.match(minted!, /^dare_age=/);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.ok(minted!.includes(flag), flag);
  const cookie = minted!.split(';')[0];
  assert.equal((await A.resolveAdultCaller({ cookie }, { resolve: trial('t-1'), env })).ok, true);
  assert.equal((await A.resolveAdultCaller({ cookie }, { resolve: trial('t-2'), env })).ok, false, "another trial's cookie");
  assert.equal((await A.resolveAdultCaller({ cookie: cookie.slice(0, -3) + 'abc' }, { resolve: trial('t-1'), env })).ok, false, 'edited');
  assert.equal((await A.resolveAdultCaller({}, { resolve: trial('t-1'), env })).ok, false, 'missing');
  // nothing personal in it: the trial's own random id and a time
  const payload = JSON.parse(Buffer.from(decodeURIComponent(cookie.split('=')[1]).split('.')[0], 'base64url').toString('utf8'));
  assert.deepEqual(Object.keys(payload).sort(), ['iat', 'id']);
});

test('age: confirming is recorded by the server — the time only — and "under 18" records nothing', async () => {
  const S = await import('../server/routes/trialSession');
  const written: { userId: string; at: string }[] = [];
  const deps = {
    identity: undefined,
    resolve: async () => ({ ok: true as const, identity: { kind: 'user' as const, userId: 'u1' }, ageConfirmedAt: null }),
    recordUserAge: async (userId: string, at: string) => (written.push({ userId, at }), true),
  };
  const yes = await S.handleTrialSession({ authorization: 'Bearer x' }, deps as never, { action: 'confirm-age', adult: true });
  assert.equal(yes.status, 200);
  assert.equal(written.length, 1);
  assert.match(written[0].at, /^\d{4}-\d\d-\d\dT/);
  const no = await S.handleTrialSession({ authorization: 'Bearer x' }, deps as never, { action: 'confirm-age', adult: false });
  assert.equal(no.status, 400);
  assert.equal(written.length, 1, 'nothing recorded for "under 18"');
  // the account could not be updated: fail closed, never "confirmed"
  const failing = { ...deps, recordUserAge: async () => false };
  assert.equal((await S.handleTrialSession({ authorization: 'Bearer x' }, failing as never, { action: 'confirm-age', adult: true })).status, 503);
  // status
  const status = await S.handleTrialSession({ authorization: 'Bearer x' }, deps as never, { action: 'age-status' });
  assert.equal((status.body as { ageConfirmed: boolean }).ageConfirmed, false);
});

test('age: every AI route asks the adult check (no route reaches a model without it); sign-up records the time of the tick', () => {
  for (const f of ['dreamAnalysis', 'dreamElementLabels', 'dreamExploration', 'dreamImage', 'dreamQuestions', 'dreamReflection', 'dreamTranscription', 'dreamTranslation', 'patternReflection']) {
    const s = src(`server/routes/${f}.ts`);
    assert.match(s, /resolveAdultCaller/, f);
    assert.doesNotMatch(s.replace(/import[^;]+;/g, ''), /resolveCallerIdentity\(/, `${f} still calls the identity check without the age check`);
  }
  assert.match(src('src/auth/AuthContext.tsx'), /age_confirmed_at/);
  // the browser hears "age_required" and shows the age question
  assert.match(src('src/auth/paidFetch.ts'), /age_required/);
});

// ------------------------------------------------------------------------------------------------ 4. the moderation layer itself

test('moderation: raw and normalized text in one request; only the chosen categories; never "violence" or "flagged"', async () => {
  const M = await import('../server/safety/moderation');
  let sent: { input: string[] } | null = null;
  const answer = (scores: Record<string, number>, flagged = false) =>
    M.createModerate({
      apiKey: () => 'k',
      fetch: async (_u, init) => {
        sent = JSON.parse(init.body);
        return { ok: true, json: async () => ({ results: sent!.input.map(() => ({ flagged, category_scores: scores })) }) };
      },
    });
  const v = await answer({ 'self-harm/intent': 0.7 })(['א נ י  ר ו צ ה'], M.HER_CATEGORIES);
  assert.deepEqual(v, { status: 'ok', hit: true });
  assert.equal(sent!.input.length, 2, 'as written + normalized');
  assert.deepEqual(await answer({ violence: 0.99 }, true)(['בחלום הוא רדף אחריי עם סכין'], M.HER_CATEGORIES), { status: 'ok', hit: false });
  assert.deepEqual(await answer({ 'self-harm/intent': 0.49 })(['x'], M.HER_CATEGORIES), { status: 'ok', hit: false }, 'below 0.5');
});

test('moderation: no key, a rate limit, an error, a timeout or an odd answer are all "unavailable" — never "fine"', async () => {
  const M = await import('../server/safety/moderation');
  const make = (f: () => Promise<{ ok: boolean; json: () => Promise<unknown> }>, key: string | undefined = 'k', timeoutMs?: number) => M.createModerate({ apiKey: () => key, fetch: f, timeoutMs });
  const un = { status: 'unavailable' };
  assert.deepEqual(await make(async () => ({ ok: true, json: async () => ({}) }), undefined)(['x'], M.HER_CATEGORIES), un);
  assert.deepEqual(await make(async () => ({ ok: false, json: async () => ({}) }))(['x'], M.HER_CATEGORIES), un, '429');
  assert.deepEqual(await make(async () => { throw new TypeError('fetch failed'); })(['x'], M.HER_CATEGORIES), un);
  assert.deepEqual(await make(async () => ({ ok: true, json: async () => ({ results: [] }) }))(['x'], M.HER_CATEGORIES), un);
  assert.deepEqual(await make(() => new Promise((ok) => setTimeout(() => ok({ ok: true, json: async () => ({}) }), 200)), 'k', 20)(['x'], M.HER_CATEGORIES), un, 'timeout');
  assert.doesNotMatch(src('server/safety/moderation.ts'), /console\./, 'nothing is logged');
});

// ------------------------------------------------------------------------------------------------ 5. the conversation route with the second layer

const store = CONVERSATIONS.find((c) => c.key === 'store')!;
const seeds = store.moments.map((m) => ({ label: m.label, excerpt: m.excerpt }));
const analysis = () => typedAnalysis(store.dreamText, true) as unknown as DreamAnalysis;
let calls = 0;
const client = (reply = 'פשוט וקליל.') => ({ responses: { create: async () => ((calls += 1), { model: 'stub', output_text: JSON.stringify({ reply, offer: '', anchors: [], facts: [], move: 'reflect' }), usage: { input_tokens: 0, output_tokens: 0 } }) } }) as never;
const deps = (over: Partial<R.ExplorationDeps> = {}): R.ExplorationDeps => ({
  ...R.realExplorationDeps,
  resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: 'u' } }) as never,
  openai: () => client(),
  rateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }) as never,
  reserveMoment: async () => 'reserved',
  refundMoment: async () => {},
  reserveWhole: async () => 'reserved',
  refundWhole: async () => {},
  address: async () => 'feminine',
  moderate: quiet,
  ...over,
});
const journey = (her: string) => X.addDreamerTurn(X.beginConversation(X.createExploration('b', seeds), 'm1', { role: 'dare', text: 'איך הוא נראה לך?', move: 'ask' }, new Date('2026-10-24T12:00:00Z')), 'm1', her);
const turn = (e: X.Exploration, d: R.ExplorationDeps, extra: Record<string, unknown> = {}) => R.handleExploration('conversation-turn', { language: 'he', attemptId: e.attemptId, dreamAnalysis: analysis(), exploration: e, momentId: 'm1', ...extra }, {}, d);

test('her words: moderation alone only ASKS (uncertain), never stops; "it was in the dream" goes on; when it is down the detector decides', async () => {
  calls = 0;
  const asked = await turn(journey('אני רוצה להפסיק לסבול, לתמיד'), deps({ moderate: hits }));
  assert.equal((asked.body as { safety: { level: string } }).safety.level, 'uncertain');
  assert.equal(calls, 0);
  const goes = await turn(journey('אני רוצה להפסיק לסבול, לתמיד'), deps({ moderate: hits }), { safetyAck: 'dream' });
  assert.ok((goes.body as { turn?: unknown }).turn);
  const downGoes = await turn(journey('עץ הזית היה קטן'), deps({ moderate: down }));
  assert.ok((downGoes.body as { turn?: unknown }).turn, 'an ordinary answer goes on when moderation is down');
  const downStops = await turn(journey('אני רוצה למות'), deps({ moderate: down }));
  assert.equal((downStops.body as { safety: { level: string } }).safety.level, 'concern', 'the detector still stops');
});

test("DARE's words: a moderation hit, or moderation down, means the answer is not shown (the plain line instead)", async () => {
  // moderation hits DARE's sentence only (her ordinary answer passes), or is down for everything
  const hitsDare = async (texts: readonly string[]) => ({ status: 'ok' as const, hit: texts.some((t) => t.includes('זו תשובה')) });
  for (const m of [hitsDare, down]) {
    const res = await turn(journey('עץ הזית היה קטן'), deps({ moderate: m, openai: () => client('זו תשובה שנראית רגילה לגמרי.') }));
    const shown = JSON.stringify(res.body);
    assert.ok(!shown.includes('זו תשובה שנראית רגילה'), 'not shown');
    assert.ok(shown.includes('אפשר להמשיך מכאן'), 'the plain line');
  }
});

// ------------------------------------------------------------------------------------------------ 6. the dream analysis route

test('analysis: real present danger in the dream text stops before any credit or model; a frightening dream goes on', async () => {
  const { handleDreamAnalysis } = await import('../server/routes/dreamAnalysis');
  const log: string[] = [];
  const aDeps = (moderate = quiet) => ({
    resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: 'u' } }),
    getClient: () => ({}) as never,
    start: { startLegacy: async () => (log.push('start'), { ok: false, reason: 'credits_required' }), startIdempotent: async () => (log.push('start'), { kind: 'refused', reason: 'credits_required' }), sleep: async () => {} },
    abandon: async () => void log.push('abandon'),
    complete: async () => true,
    runModel: async () => (log.push('model'), { status: 'ok', value: { sourceText: 'x' } }),
    moderate,
  }) as never;
  const body = (sourceText: string, extra = {}) => ({ sourceText, inputMode: 'text', ...extra });
  const stop = await handleDreamAnalysis(body('חלמתי על ים, וגם במציאות אני רוצה למות'), {}, aDeps());
  assert.equal((stop.body as { safety: { level: string } }).safety.level, 'concern');
  const danger = await handleDreamAnalysis(body('לקחתי הרבה כדורים לפני שנרדמתי וחלמתי על ים'), {}, aDeps());
  assert.equal((danger.body as { safety: { level: string } }).safety.level, 'danger');
  const dangerAck = await handleDreamAnalysis(body('לקחתי הרבה כדורים לפני שנרדמתי וחלמתי על ים', { safetyAck: 'not-immediate' }), {}, aDeps());
  assert.equal((dangerAck.body as { safety: { level: string } }).safety.level, 'danger', 'immediate danger is never acknowledged away');
  const dreamWords = await handleDreamAnalysis(body('חלמתי שאני רוצה להתאבד ואז התעוררתי'), {}, aDeps());
  assert.equal((dreamWords.body as { safety: { level: string } }).safety.level, 'uncertain');
  const modOnly = await handleDreamAnalysis(body('חלמתי על חדר שקט'), {}, aDeps(hits));
  assert.equal((modOnly.body as { safety: { level: string } }).safety.level, 'uncertain', 'moderation alone asks');
  assert.deepEqual(log, [], 'no credit spent, no model called');
  const scary = await handleDreamAnalysis(body('חלמתי שהבית נשרף ואנשים מתו, ומישהו רדף אחריי עם סכין'), {}, aDeps());
  assert.ok(!(scary.body as { safety?: unknown }).safety, 'a frightening dream is a dream');
});

// ------------------------------------------------------------------------------------------------ 7. the older reflection, and the routes that only write

test('reflection: her answer is checked before anything else; with "not in immediate danger" it goes on', async () => {
  const { handleDreamReflection } = await import('../server/routes/dreamReflection');
  const base = { dreamAnalysis: analysis(), selectedElement: 'העץ', attemptId: 'a1', language: 'he' };
  const d = { resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: 'u' } }), moderate: quiet } as never;
  const stop = await handleDreamReflection({ ...base, reflectionResponse: 'אני רוצה למות' }, {}, d);
  assert.equal((stop.body as { safety: { level: string } }).safety.level, 'concern');
  const link = await handleDreamReflection({ ...base, reflectionResponse: 'שקט', linkResponse: 'אני הולך להרוג אותו' }, {}, d);
  assert.equal((link.body as { safety: { level: string } }).safety.level, 'threat');
  const goes = await handleDreamReflection({ ...base, reflectionResponse: 'אני רוצה למות', safetyAck: 'not-immediate' }, {}, d);
  assert.ok(!(goes.body as { safety?: unknown }).safety, 'past the gate');
});

test('every route that shows model words checks them first (local + moderation), and fails closed', () => {
  for (const f of ['dreamAnalysis', 'dreamElementLabels', 'dreamExploration', 'dreamQuestions', 'dreamReflection', 'dreamTranslation', 'patternReflection']) {
    assert.match(src(`server/routes/${f}.ts`), /dareWordsSafe\(/, f);
  }
  const rs = src('server/safety/routeSafety.ts');
  assert.match(rs, /unavailable/);
  assert.doesNotMatch(rs, /console\./, 'nothing about risk is logged');
});

test('after immediate danger or a threat, the browser sends no more AI requests on this page', async () => {
  const S = await import('../src/hero/safety/sessionStop');
  assert.equal(S.sessionStopped(), null);
  S.stopForSession('danger');
  assert.equal(S.sessionStopped(), 'danger');
  assert.match(src('src/auth/paidFetch.ts'), /sessionStopped\(\)/);
  S.resetSessionStopForTests();
});
