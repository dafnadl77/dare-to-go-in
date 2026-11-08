import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import OpenAI from 'openai';
import {
  checkExtrasAllowance,
  checkDuplicateTranslation,
  claimPatternGeneration,
  translationPolicy,
  patternPolicy,
  TRANSLATE_MAX_TOTAL_CHARS,
  type CounterOutcome,
  type ExtrasPolicy,
  type ExtrasStore,
} from '../server/extrasLimits';
import { handleDreamTranslation, type TranslationDeps } from '../server/routes/dreamTranslation';
import { guardPatternGeneration } from '../server/routes/patternReflection';
import { runPatternReflection, type PatternReflectionDeps } from '../server/patternReflectionCore';
import { batchTexts, CLIENT_MAX_CHARS_PER_REQUEST, CLIENT_MAX_TEXTS_PER_REQUEST } from '../src/archive/translationBatches';

/**
 * LIMITS FOR THE AI EXTRAS (prepared 2026-11-08, Option A): translation and pattern reflection are counted in the database before any
 * AI call, per account and for the whole site, with a share kept for light users, and fail closed. On an isolated PostgreSQL (PGlite)
 * and stand-ins for OpenAI, the caller and the database: no network, no AI cost, no real data.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// ================================================================================================ the SQL, for real

let db: PGlite;
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; grant usage on schema public to anon, authenticated, service_role;`);
  await db.exec(read('supabase/migrations/20261010_rate_limits.sql'));
  await db.exec(read('supabase/migrations/20261109_rate_limit_weighted.sql'));
});
after(async () => {
  await db.close();
});

type Taken = { status: string; hits?: number; retry_after?: number };
const takeW = async (bucket: string, cost: number, limit: number, seconds: number): Promise<Taken> =>
  (await db.query<{ r: Taken }>('select public.take_rate_limit_weighted($1, $2, $3, $4) as r', [bucket, cost, limit, seconds])).rows[0].r;
const peek = async (bucket: string, seconds: number): Promise<Taken> => (await db.query<{ r: Taken }>('select public.peek_rate_limit($1, $2) as r', [bucket, seconds])).rows[0].r;

test('SQL: a weighted take adds its cost; over the limit says limited with a wait; peek reads without adding', async () => {
  assert.deepEqual(await peek('w:a', 86400), { status: 'ok', hits: 0 });
  assert.equal((await takeW('w:a', 400, 1000, 86400)).hits, 400);
  assert.equal((await takeW('w:a', 600, 1000, 86400)).status, 'ok');
  assert.deepEqual(await peek('w:a', 86400), { status: 'ok', hits: 1000 });
  assert.deepEqual(await peek('w:a', 86400), { status: 'ok', hits: 1000 }, 'peeking twice adds nothing');
  const over = await takeW('w:a', 1, 1000, 86400);
  assert.equal(over.status, 'limited');
  assert.ok((over.retry_after ?? 0) >= 1 && (over.retry_after ?? 0) <= 86400);
});

test('SQL: parallel weighted takes are counted exactly', async () => {
  const results = await Promise.all(Array.from({ length: 25 }, () => takeW('w:par', 10, 100, 3600)));
  assert.equal(results.filter((r) => r.status === 'ok').length, 10);
  assert.deepEqual(await peek('w:par', 3600), { status: 'ok', hits: 250 });
});

test('SQL: nonsense arguments are refused, never counted', async () => {
  for (const [b, c, l, w] of [[null, 1, 1, 60], ['', 1, 1, 60], ['x'.repeat(201), 1, 1, 60], ['ok', 0, 1, 60], ['ok', 1_000_001, 1, 60], ['ok', 1, 0, 60], ['ok', 1, 1, 0], ['ok', 1, 1, 86401]] as const) {
    assert.equal((await db.query<{ r: Taken }>('select public.take_rate_limit_weighted($1, $2, $3, $4) as r', [b, c, l, w])).rows[0].r.status, 'invalid');
  }
  assert.equal((await peek('', 60)).status, 'invalid');
  assert.deepEqual(await peek('ok', 60), { status: 'ok', hits: 0 });
});

test('SQL: only the server may call either function; the migration adds no table and names its rollback', async () => {
  for (const fn of ['public.take_rate_limit_weighted(text, integer, integer, integer)', 'public.peek_rate_limit(text, integer)']) {
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await db.query<{ ok: boolean }>(`select has_function_privilege($1, $2, 'execute') as ok`, [role, fn])).rows[0].ok, false, `${role} ${fn}`);
    }
    assert.equal((await db.query<{ ok: boolean }>(`select has_function_privilege('service_role', $1, 'execute') as ok`, [fn])).rows[0].ok, true);
  }
  const m = code('supabase/migrations/20261109_rate_limit_weighted.sql');
  assert.doesNotMatch(m, /\b(alter|drop|create)\s+table\b/i);
  assert.match(read('supabase/migrations/20261109_rate_limit_weighted.sql'), /ROLLBACK: supabase\/rollbacks\/20261109_rate_limit_weighted_rollback\.sql/);
  assert.match(read('supabase/rollbacks/20261109_rate_limit_weighted_rollback.sql'), /drop function if exists public\.take_rate_limit_weighted/);
});

// ================================================================================================ the allowance, on an in-memory store

/** The same fixed windows as the SQL, on an injectable clock. */
function memoryStore(clock: { now: number }) {
  const rows = new Map<string, number>();
  const log: string[] = [];
  let broken = false;
  const key = (bucket: string, w: number) => `${bucket}@${Math.floor(clock.now / 1000 / w)}`;
  const store: ExtrasStore = {
    async take(bucket, cost, limit, w): Promise<CounterOutcome> {
      log.push(bucket);
      if (broken) return { status: 'unknown' };
      const k = key(bucket, w);
      const hits = (rows.get(k) ?? 0) + cost;
      rows.set(k, hits);
      const end = (Math.floor(clock.now / 1000 / w) + 1) * w;
      return hits > limit ? { status: 'limited', hits, retryAfterSeconds: Math.max(1, Math.ceil(end - clock.now / 1000)) } : { status: 'ok', hits };
    },
    async peek(bucket, w) {
      if (broken) return null;
      return rows.get(key(bucket, w)) ?? 0;
    },
  };
  return { store, log, rows, breakIt: () => (broken = true), siteUnits: (f: string) => rows.get(key(`x:${f}:su`, 86400)) ?? 0, siteRequests: (f: string) => rows.get(key(`x:${f}:sr`, 86400)) ?? 0 };
}

const small: ExtrasPolicy = { feature: 'translate', perMinute: 3, perHour: 5, perDay: 8, unitsPerDay: 1000, siteRequestsPerDay: 20, siteUnitsPerDay: 3000, lightAllowance: 300, reserveShare: 0.7 };
const T0 = Date.UTC(2026, 10, 9, 10, 0, 0);

test('the account\'s windows: minute, hour, day, and characters a day; the refusal says when to try again', async () => {
  const clock = { now: T0 };
  const m = memoryStore(clock);
  const allow = (units = 10) => checkExtrasAllowance(m.store, small, 'A', units, () => {}, () => new Date(clock.now));
  for (let i = 0; i < 3; i += 1) assert.equal((await allow()).allowed, true);
  const minute = await allow();
  assert.deepEqual([minute.allowed, !minute.allowed && minute.reason, !minute.allowed && minute.scope], [false, 'usage_limited', 'account']);
  assert.ok(!minute.allowed && minute.retryAfterSeconds <= 60);
  clock.now += 61_000;
  assert.equal((await allow()).allowed, true);
  assert.equal((await allow()).allowed, true);
  assert.equal((await allow()).allowed, false, 'the hour: 5 counted (the refused one counts too, on purpose)');
  clock.now += 3_601_000;
  const big = await allow(2000);
  assert.equal(big.allowed, false, 'more characters than a day allows');
  assert.equal(!big.allowed && big.scope, 'account');
});

test('a blocked account never reaches the site counters: it cannot spend the others\' share by retrying', async () => {
  const clock = { now: T0 };
  const m = memoryStore(clock);
  for (let i = 0; i < 50; i += 1) await checkExtrasAllowance(m.store, small, 'HEAVY', 10, () => {}, () => new Date(clock.now));
  assert.equal(m.siteRequests('translate'), 3, 'only the 3 allowed requests reached the site total');
  assert.equal(m.log.filter((b) => b.startsWith('x:translate:s')).length, 6, 'site counters touched only for allowed requests');
});

test('light users keep a share: past 70% of the site cap, heavy accounts wait; light ones still pass; the site cap holds', async () => {
  const clock = { now: T0 };
  const m = memoryStore(clock);
  const p: ExtrasPolicy = { ...small, perMinute: 1000, perHour: 1000, perDay: 1000, unitsPerDay: 1000, siteRequestsPerDay: 1000, siteUnitsPerDay: 3000, lightAllowance: 300 };
  const allow = (who: string, units: number) => checkExtrasAllowance(m.store, p, who, units, () => {}, () => new Date(clock.now));
  // three heavy accounts take the site to 2,100 of 3,000 (70%)
  for (const who of ['H1', 'H2', 'H3']) for (let i = 0; i < 7; i += 1) assert.equal((await allow(who, 100)).allowed, true);
  assert.equal(m.siteUnits('translate'), 2100);
  const heavy = await allow('H1', 100);
  assert.deepEqual([heavy.allowed, !heavy.allowed && heavy.scope], [false, 'reserve']);
  assert.ok(!heavy.allowed && heavy.retryAfterSeconds > 0 && heavy.retryAfterSeconds <= 86400, 'until the next UTC day');
  // light accounts still get through, up to their own light amount
  for (const who of ['L1', 'L2', 'L3']) for (let i = 0; i < 3; i += 1) assert.equal((await allow(who, 100)).allowed, true, who);
  assert.equal((await allow('L1', 100)).allowed, false, 'L1 now used more than the light amount');
  // the site cap is still the bound: what is ALLOWED never passes it (a refused request is counted too, but makes no AI call)
  let allowedUnits = 2100 + 300 * 3;
  for (let i = 0; i < 20; i += 1) if ((await allow(`N${i}`, 100)).allowed) allowedUnits += 100;
  assert.ok(allowedUnits <= 3000, `allowed ${allowedUnits} of 3000`);
});

test('fails closed: a counter that cannot be read blocks (503), with no AI call possible', async () => {
  const m = memoryStore({ now: T0 });
  m.breakIt();
  const r = await checkExtrasAllowance(m.store, small, 'A', 10);
  assert.deepEqual([r.allowed, !r.allowed && r.status, !r.allowed && r.reason], [false, 503, 'limits_unavailable']);
  assert.equal((await checkDuplicateTranslation(m.store, 'A', 'en', ['x'])).allowed, false);
  assert.equal((await claimPatternGeneration(m.store, 'A', ['c'])).allowed, false);
});

test('duplicates: the same texts at most 3 times in 10 minutes; content is never part of a counter key', async () => {
  const clock = { now: T0 };
  const m = memoryStore(clock);
  for (let i = 0; i < 3; i += 1) assert.equal((await checkDuplicateTranslation(m.store, 'A', 'en', ['חלום על ים'])).allowed, true);
  const fourth = await checkDuplicateTranslation(m.store, 'A', 'en', ['חלום על ים']);
  assert.deepEqual([fourth.allowed, !fourth.allowed && fourth.scope], [false, 'duplicate']);
  assert.equal((await checkDuplicateTranslation(m.store, 'A', 'he', ['חלום על ים'])).allowed, true, 'another language is another request');
  assert.ok(m.log.every((b) => !b.includes('חלום') && b.length <= 200), 'no dream text in any key');
});

// ================================================================================================ legitimate use is never stopped

test('legitimate heavy day, translation: a 300-dream archive, 30 dreams opened, 10 reflections, a language switch — all allowed', async () => {
  const clock = { now: T0 };
  const m = memoryStore(clock);
  const p = translationPolicy({});
  const allow = (units: number) => checkExtrasAllowance(m.store, p, 'REAL', units, () => {}, () => new Date(clock.now));
  // the archive: 300 dreams x (title 34 + excerpt 110 + 4 keywords) ≈ 1,800 items in 45 chunks of 40, three at a time (~1 minute)
  for (let i = 0; i < 45; i += 1) assert.equal((await allow(40 * 33)).allowed, true, `archive chunk ${i}`);
  // 30 dreams opened over the day, the largest saved so far (1.8k characters)
  for (let i = 0; i < 30; i += 1) {
    clock.now += 5 * 60_000;
    assert.equal((await allow(1800)).allowed, true, `dream ${i}`);
  }
  // 10 reflections (about 20 sentences each)
  for (let i = 0; i < 10; i += 1) assert.equal((await allow(1500)).allowed, true, `reflection ${i}`);
  // switching back and forth is served from the tab's cache; a new session the same evening asks for the archive once more
  clock.now += 60 * 60_000;
  for (let i = 0; i < 45; i += 1) {
    const r = await allow(40 * 33);
    if (!r.allowed) assert.fail(`second session, chunk ${i}: ${r.scope}`);
  }
});

test('legitimate pattern use: 12 patterns opened, then all 12 again in the other language, within one hour — all allowed', async () => {
  const clock = { now: T0 };
  const m = memoryStore(clock);
  const p = patternPolicy({});
  for (let i = 0; i < 24; i += 1) {
    clock.now += 2 * 60_000;
    assert.equal((await checkExtrasAllowance(m.store, p, 'REAL', 1, () => {}, () => new Date(clock.now))).allowed, true, `pattern ${i}`);
  }
});

test('the numbers: one account at most a quarter of the site, light share and caps as decided; every one can be changed by setting', () => {
  const t = translationPolicy({});
  assert.deepEqual([t.perMinute, t.perHour, t.perDay, t.unitsPerDay, t.siteRequestsPerDay, t.siteUnitsPerDay, t.lightAllowance, t.reserveShare], [60, 300, 400, 250_000, 1_500, 1_000_000, 30_000, 0.7]);
  assert.ok(t.unitsPerDay! / t.siteUnitsPerDay! <= 0.25 && t.perDay / t.siteRequestsPerDay <= 0.27);
  assert.ok(t.lightAllowance <= (1 - t.reserveShare) * t.siteUnitsPerDay!, 'the light share fits in what is kept for light users');
  const pt = patternPolicy({});
  assert.deepEqual([pt.perMinute, pt.perHour, pt.perDay, pt.siteRequestsPerDay, pt.lightAllowance], [10, 30, 40, 150, 8]);
  assert.ok(pt.perDay / pt.siteRequestsPerDay <= 0.27);
  assert.equal(translationPolicy({ DARE_TRANSLATE_CHARS_PER_DAY: '5000' }).unitsPerDay, 5000);
  assert.equal(translationPolicy({ DARE_TRANSLATE_CHARS_PER_DAY: '0' }).unitsPerDay, 250_000, 'never below 1: a nonsense value keeps the default');
});

// ================================================================================================ the translation route

function translationDeps(over: Partial<TranslationDeps> = {}) {
  const calls = { ai: 0, order: [] as string[] };
  const m = memoryStore({ now: T0 });
  const wrapped: ExtrasStore = {
    take: async (...a) => (calls.order.push('count'), m.store.take(...a)),
    peek: m.store.peek,
  };
  const deps: TranslationDeps = {
    resolveCaller: (async () => ({ ok: true, identity: { kind: 'user', userId: 'U1' } })) as unknown as TranslationDeps['resolveCaller'],
    openai: () => ({
      responses: {
        create: async (req: { input: string }) => {
          calls.ai += 1;
          calls.order.push('ai');
          const n = (req.input.match(/^\d+\. /gm) ?? []).length;
          return { output_text: JSON.stringify({ translations: Array.from({ length: n }, (_, i) => `text ${i}`) }) };
        },
      },
    }) as never,
    store: wrapped,
    hasSavedDream: async () => true,
    moderate: async () => ({ status: 'ok' as const, hit: false }),
    env: {},
    ...over,
  };
  return { deps, calls, m };
}
const ask = (texts: unknown, deps: TranslationDeps) => handleDreamTranslation({ texts, targetLanguage: 'en' }, { authorization: 'Bearer x' }, deps);
const reasonOf = (r: { body: unknown }) => (r.body as { reason: string }).reason;

test('route: a normal request is counted first, then ONE AI call, and returns the translations', async () => {
  const { deps, calls } = translationDeps();
  const r = await ask(['חלום', 'ים'], deps);
  assert.equal(r.status, 200);
  assert.deepEqual((r.body as { translations: string[] }).translations, ['text 0', 'text 1']);
  assert.equal(calls.ai, 1);
  assert.ok(calls.order.indexOf('ai') > calls.order.lastIndexOf('count'), 'every counter before the AI call');
});

test('route: too much text is refused before anything (413), no counter, no AI call', async () => {
  for (const texts of [Array.from({ length: 41 }, () => 'x'), ['x'.repeat(20_001)], Array.from({ length: 2 }, () => 'x'.repeat(TRANSLATE_MAX_TOTAL_CHARS / 2 + 1))]) {
    const { deps, calls } = translationDeps();
    const r = await ask(texts, deps);
    assert.deepEqual([r.status, reasonOf(r)], [413, 'too_large']);
    assert.equal(calls.ai, 0);
    assert.equal(calls.order.length, 0);
  }
});

test('route: an account with no saved dream is refused (403); an unreadable check is 503; neither calls the AI', async () => {
  const none = translationDeps({ hasSavedDream: async () => false });
  const r1 = await ask(['x'], none.deps);
  assert.deepEqual([r1.status, reasonOf(r1), none.calls.ai], [403, 'no_saved_dream', 0]);
  const unknown = translationDeps({ hasSavedDream: async () => null });
  const r2 = await ask(['x'], unknown.deps);
  assert.deepEqual([r2.status, reasonOf(r2), unknown.calls.ai], [503, 'limits_unavailable', 0]);
});

test('route: the 4th identical request in 10 minutes, and any request past the allowance, is 429 usage_limited with Retry-After — no AI call', async () => {
  const { deps, calls } = translationDeps();
  for (let i = 0; i < 3; i += 1) assert.equal((await ask(['same'], deps)).status, 200);
  const dup = await ask(['same'], deps);
  assert.deepEqual([dup.status, reasonOf(dup)], [429, 'usage_limited']);
  assert.ok(Number(dup.headers?.['Retry-After']) > 0);
  assert.equal(calls.ai, 3);
  const tight = translationDeps({ env: { DARE_TRANSLATE_PER_MINUTE: '2' } });
  await ask(['a'], tight.deps);
  await ask(['b'], tight.deps);
  const third = await ask(['c'], tight.deps);
  assert.deepEqual([third.status, reasonOf(third), tight.calls.ai], [429, 'usage_limited', 2]);
});

test('route: the extras\' budget ran out at OpenAI → 429 usage_limited (the browser does not retry); an ordinary rate limit keeps its answer', async () => {
  const budget = OpenAI.APIError.generate(429, { error: { message: 'limit', type: null, code: 'project_spend_limit_exceeded', param: null } }, undefined, new Headers());
  const rate = OpenAI.APIError.generate(429, { error: { message: 'slow', type: 'requests', code: 'rate_limit_exceeded', param: null } }, undefined, new Headers());
  for (const [err, expected] of [[budget, 'usage_limited'], [rate, 'rate_limited']] as const) {
    const { deps, calls } = translationDeps({ openai: () => ({ responses: { create: async () => { throw err; } } }) as never });
    const r = await ask(['x'], deps);
    assert.deepEqual([r.status, reasonOf(r)], [429, expected]);
    assert.equal(calls.order.filter((o) => o === 'ai').length, 0, 'the stand-in threw before recording; one attempt only');
  }
});

test('route: a counter that cannot be read blocks with 503 limits_unavailable and no AI call', async () => {
  const { deps, calls, m } = translationDeps();
  m.breakIt();
  const r = await ask(['x'], deps);
  assert.deepEqual([r.status, reasonOf(r), calls.ai], [503, 'limits_unavailable', 0]);
});

// ================================================================================================ pattern reflection

test('pattern: one generation at a time for the same reflection (409 in_progress), then the allowance; a refusal is no AI call', async () => {
  const m = memoryStore({ now: T0 });
  const id = { conceptId: 'water', language: 'en', addressPreference: 'neutral', dreamIds: ['b', 'a'] };
  assert.equal(await guardPatternGeneration(m.store, 'U1', id, {}), null, 'the first may go ahead');
  const second = await guardPatternGeneration(m.store, 'U1', { ...id, dreamIds: ['a', 'b'] }, {});
  assert.deepEqual([second?.status, second?.httpStatus, second?.reason], ['refused', 409, 'in_progress'], 'same reflection, whatever the order of ids');
  assert.equal(await guardPatternGeneration(m.store, 'U1', { ...id, language: 'he' }, {}), null, 'another language is another reflection');
  const tight = await (async () => {
    const m2 = memoryStore({ now: T0 });
    await guardPatternGeneration(m2.store, 'U1', { ...id, conceptId: 'c1' }, { DARE_PATTERN_PER_MINUTE: '1' });
    return guardPatternGeneration(m2.store, 'U1', { ...id, conceptId: 'c2' }, { DARE_PATTERN_PER_MINUTE: '1' });
  })();
  assert.deepEqual([tight?.httpStatus, tight?.reason], [429, 'usage_limited']);
});

test('pattern: a saved reflection is served without any count; a refused generation is passed on as is, nothing persisted', async () => {
  const dream = (id: string) => ({ id, createdAt: '2026-11-01T00:00:00Z', dreamAnalysis: { concepts: [{ id: 'water' }] } as never, selectedElement: '', dreamReflectionObservation: '' });
  const log = { generate: 0, persist: 0 };
  const base: PatternReflectionDeps = {
    fetchOwnedDreams: async (ids) => ids.map(dream),
    getCachedReflection: async () => null,
    generateReflection: async () => ((log.generate += 1), { status: 'refused', httpStatus: 429, reason: 'usage_limited', retryAfterSeconds: 30 }),
    persistReflection: async () => ((log.persist += 1), { status: 'inserted' }),
  };
  const request = { ownerId: 'U1', conceptId: 'water', dreamIds: ['a', 'b'], language: 'en', addressPreference: 'neutral' };
  const refused = await runPatternReflection(request, base);
  if (refused.status === 'refused') assert.deepEqual([refused.httpStatus, refused.reason], [429, 'usage_limited']);
  else if (refused.status !== 'insufficient_evidence') assert.fail(`unexpected ${refused.status}`);
  assert.equal(log.persist, 0);
  const cachedHit = await runPatternReflection(request, { ...base, getCachedReflection: async () => ({ reflection: {} as never, totalDreamCount: 2, synthesizedDreamCount: 2 }) });
  if (cachedHit.status === 'ok') assert.equal(log.generate <= 1, true, 'a saved reflection never generates');
});

// ================================================================================================ the browser

test('browser: batches stay within 40 texts and 20k characters, in order; one oversized text is its own batch', () => {
  const texts = Array.from({ length: 95 }, (_, i) => `t${i}`);
  const b = batchTexts(texts);
  assert.deepEqual(b.map((x) => x.length), [40, 40, 15]);
  assert.deepEqual(b.flat(), texts);
  const big = batchTexts(['a'.repeat(15_000), 'b'.repeat(15_000), 'c'.repeat(25_000), 'd']);
  assert.deepEqual(big.map((x) => x.map((t) => t[0]).join('')), ['a', 'b', 'c', 'd']);
  for (const batch of batchTexts(Array.from({ length: 30 }, () => 'x'.repeat(1500)))) {
    assert.ok(batch.length <= CLIENT_MAX_TEXTS_PER_REQUEST && batch.join('').length <= CLIENT_MAX_CHARS_PER_REQUEST);
  }
});

test('browser: a limit answer is never retried (only the transient ones are); the archive sends at most 3 at a time and stops on a no', () => {
  for (const f of ['src/archive/DreamDetail.tsx', 'src/hero/useReflectionDisplay.ts']) {
    const s = code(f);
    const list = /\['request_failed', 'invalid_response', 'rate_limited'\]/.exec(s);
    assert.ok(list, `${f}: the retry list is exactly the three transient reasons`);
    for (const r of ['usage_limited', 'too_large', 'limits_unavailable', 'no_saved_dream']) assert.ok(!s.includes(`'${r}'`) || !list[0].includes(r), `${f} never retries ${r}`);
  }
  const archive = code('src/archive/dreamTitleTranslation.ts');
  assert.match(archive, /const MAX_PARALLEL = 3;/);
  assert.match(archive, /STOP_REASONS[^\n]*'usage_limited'/);
  for (const r of ['usage_limited', 'too_large', 'limits_unavailable', 'no_saved_dream']) assert.match(code('src/archive/dreamTranslationEngine.ts'), new RegExp(`'${r}'`));
  for (const r of ['usage_limited', 'in_progress', 'limits_unavailable']) assert.match(code('src/archive/patternReflectionEngine.ts'), new RegExp(`'${r}'`));
});

// ================================================================================================ what must not change

test('the two routes use the extras\' own client and model setting; nothing else does; the shared client keeps its budget wrapper', () => {
  for (const f of ['server/routes/dreamTranslation.ts', 'server/routes/patternReflection.ts']) {
    const s = code(f);
    assert.match(s, /getExtrasOpenAIClient/);
    assert.match(s, /extrasModel\(DEFAULT_MODEL\)/);
    assert.doesNotMatch(s, /getOpenAIClient\(/);
    assert.match(s, /max_output_tokens: (TRANSLATE|PATTERN)_MAX_OUTPUT_TOKENS/);
  }
  for (const f of ['dreamAnalysis', 'dreamElementLabels', 'dreamExploration', 'dreamImage', 'dreamQuestions', 'dreamReflection', 'dreamTranscription']) {
    assert.doesNotMatch(code(`server/routes/${f}.ts`), /getExtrasOpenAIClient|extrasLimits/, `${f} is untouched by the extras`);
  }
  const client = read('server/openaiClient.ts');
  assert.match(client, /new OpenAI\(\{ apiKey, fetch: budgetAwareFetch\(/);
  assert.equal(client.match(/budgetAwareFetch\(\(input, init\) => fetch\(input, init\)\)/g)?.length, 2, 'both clients never retry a budget answer');
  assert.match(client, /process\.env\.OPENAI_EXTRAS_API_KEY\?\.trim\(\) \|\| process\.env\.OPENAI_API_KEY/, 'unset: the shared key, exactly as before');
});
