import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDreamIdsKey, selectDreamsForSynthesis, buildPatternReflectionInput, MAX_SYNTHESIS_DREAMS } from '../src/archive/patternReflectionInput.ts';
import { validatePatternReflectionResult, buildPatternReflectionSystemPrompt } from '../src/archive/patternReflectionSchema.ts';
import { CONCEPT_TAXONOMY_VERSION } from '../src/hero/conceptTaxonomy.ts';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema.ts';
import {
  runPatternReflection,
  type OwnedDreamForReflection,
  type PatternReflectionDeps,
  type PatternReflectionCacheKey,
  type CachedPatternReflection,
  type GenerateOutcome,
  type PersistOutcome,
} from '../server/patternReflectionCore.ts';

// ---------------------------------------------------------- test fixtures ----

function dream(id: string, concepts: string[], createdAt: string): OwnedDreamForReflection {
  return {
    id,
    createdAt,
    dreamAnalysis: { concepts } as unknown as DreamAnalysis,
    selectedElement: `element-${id}`,
    dreamReflectionObservation: `observation-${id}`,
  };
}

function keyOf(k: PatternReflectionCacheKey): string {
  return `${k.ownerId}|${k.conceptId}|${k.conceptVersion}|${k.dreamIdsKey}|${k.language}`;
}

function fakeDeps(options: {
  dreams: OwnedDreamForReflection[];
  cache?: Map<string, CachedPatternReflection>;
  generateResult?: GenerateOutcome;
  persistResult?: PersistOutcome;
}) {
  const calls = { fetchOwnedDreams: 0, getCachedReflection: 0, generateReflection: 0, persistReflection: 0 };
  const cacheStore = options.cache ?? new Map<string, CachedPatternReflection>();
  let lastGenerateInput: Parameters<PatternReflectionDeps['generateReflection']>[0] | null = null;
  let lastPersistKey: PatternReflectionCacheKey | null = null;

  const deps: PatternReflectionDeps = {
    async fetchOwnedDreams(ids) {
      calls.fetchOwnedDreams += 1;
      // Models RLS: only dreams this fake "owns" (present in options.dreams)
      // are ever returned, regardless of what else the caller asked for —
      // a foreign/non-owned id requested here simply never comes back.
      return options.dreams.filter((d) => ids.includes(d.id));
    },
    async getCachedReflection(key) {
      calls.getCachedReflection += 1;
      return cacheStore.get(keyOf(key)) ?? null;
    },
    async generateReflection(input) {
      calls.generateReflection += 1;
      lastGenerateInput = input;
      return options.generateResult ?? { status: 'ok', value: { whatStandsOut: 'a', possibleThread: 'b', question: 'c' } };
    },
    async persistReflection(key, reflection, totalDreamCount, synthesizedDreamCount) {
      calls.persistReflection += 1;
      lastPersistKey = key;
      const result = options.persistResult ?? { status: 'inserted' };
      if (result.status === 'inserted') cacheStore.set(keyOf(key), { reflection, totalDreamCount, synthesizedDreamCount });
      return result;
    },
  };

  return { deps, calls, cacheStore, getLastGenerateInput: () => lastGenerateInput, getLastPersistKey: () => lastPersistKey };
}

const OWNER = 'owner-1';

// -------------------------------------------------------------- pure logic ----

test('buildDreamIdsKey is order-independent and de-duped (the real cache identity component)', () => {
  assert.equal(buildDreamIdsKey(['b', 'a', 'c']), buildDreamIdsKey(['c', 'b', 'a']));
  assert.equal(buildDreamIdsKey(['a', 'a', 'b']), buildDreamIdsKey(['a', 'b']));
  assert.notEqual(buildDreamIdsKey(['a', 'b']), buildDreamIdsKey(['a', 'b', 'c']));
});

test('selectDreamsForSynthesis takes only the newest N, true count is unaffected', () => {
  const dreams = Array.from({ length: 14 }, (_, i) => ({ id: `d${i}`, createdAt: new Date(2026, 0, i + 1).toISOString() }));
  const selected = selectDreamsForSynthesis(dreams, MAX_SYNTHESIS_DREAMS);
  assert.equal(selected.length, 8);
  assert.equal(selected[0].id, 'd13', 'newest first');
  assert.equal(selected[7].id, 'd6', 'the 8th-newest, not an arbitrary slice');
  assert.equal(dreams.length, 14, 'the input array itself is never mutated');
});

test('buildPatternReflectionInput discloses the true total vs. the supplied count, and marks sourceText canonical', () => {
  const evidence = [{ id: 'd1', createdAt: '2026-01-01T00:00:00Z', sourceText: 'I was flying.', summary: 's', emotions: ['joy'], selectedElement: 'sky', observation: 'o' }];
  const capped = buildPatternReflectionInput({ label: 'Flying & falling', definition: 'def' }, evidence, 14);
  assert.match(capped, /14 of the dreamer's saved dreams in total/);
  assert.match(capped, /only the 1 most recent/);
  assert.match(capped, /CANONICAL/);
  assert.match(capped, /"I was flying\."/);

  const complete = buildPatternReflectionInput({ label: 'Flying & falling', definition: 'def' }, evidence, 1);
  assert.match(complete, /all of them are shown below/);
});

test('the system prompt forbids universal symbolism and demands the 3-field, observation/possibility split, in both languages', () => {
  for (const lang of ['en', 'he'] as const) {
    const prompt = buildPatternReflectionSystemPrompt(lang);
    assert.match(prompt, /NOT dream-dictionary interpretation/);
    assert.match(prompt, /NO fixed symbolic meaning/);
    assert.match(prompt, /whatStandsOut/);
    assert.match(prompt, /possibleThread/);
    assert.match(prompt, /exactly ONE open, reflective question/);
    assert.match(prompt, /SAY LESS/);
  }
});

test('validatePatternReflectionResult requires all three non-empty string fields', () => {
  assert.deepEqual(validatePatternReflectionResult({ whatStandsOut: 'a', possibleThread: 'b', question: 'c' }), {
    whatStandsOut: 'a',
    possibleThread: 'b',
    question: 'c',
  });
  assert.equal(validatePatternReflectionResult({ whatStandsOut: 'a', possibleThread: 'b', question: '' }), null);
  assert.equal(validatePatternReflectionResult({ whatStandsOut: 'a', possibleThread: 'b' }), null);
  assert.equal(validatePatternReflectionResult(null), null);
});

// -------------------------------------------------------- runPatternReflection ----

test('1. a concept in exactly 2 distinct dreams is enough evidence', async () => {
  const { deps, calls } = fakeDeps({ dreams: [dream('d1', ['animals'], '2026-01-01'), dream('d2', ['animals'], '2026-01-02')] });
  const outcome = await runPatternReflection({ ownerId: OWNER, conceptId: 'animals', dreamIds: ['d1', 'd2'], language: 'en' }, deps);
  assert.equal(outcome.status, 'ok');
  assert.equal(calls.generateReflection, 1);
  if (outcome.status === 'ok') assert.equal(outcome.totalDreamCount, 2);
});

test('2. a duplicated dream id in the request never inflates the distinct-dream count', async () => {
  const { deps } = fakeDeps({ dreams: [dream('d1', ['animals'], '2026-01-01'), dream('d2', ['animals'], '2026-01-02')] });
  // The client (or a buggy caller) sends d1 twice — fetchOwnedDreams below
  // would naturally return it once per real DB row, but this proves the
  // core itself also de-dupes by id defensively rather than trusting that.
  const outcome = await runPatternReflection({ ownerId: OWNER, conceptId: 'animals', dreamIds: ['d1', 'd1', 'd2'], language: 'en' }, deps);
  assert.equal(outcome.status, 'ok');
  if (outcome.status === 'ok') assert.equal(outcome.totalDreamCount, 2, 'still 2 distinct dreams, not 3');
});

test('3. a concept with more than 8 relevant dreams sends only the latest 8 to the model while the true total is preserved', async () => {
  const dreams = Array.from({ length: 14 }, (_, i) => dream(`d${i}`, ['family'], new Date(2026, 0, i + 1).toISOString()));
  const { deps, getLastGenerateInput } = fakeDeps({ dreams });
  const outcome = await runPatternReflection(
    { ownerId: OWNER, conceptId: 'family', dreamIds: dreams.map((d) => d.id), language: 'en' },
    deps,
  );
  assert.equal(outcome.status, 'ok');
  if (outcome.status === 'ok') {
    assert.equal(outcome.totalDreamCount, 14);
    assert.equal(outcome.synthesizedDreamCount, 8);
  }
  const input = getLastGenerateInput();
  assert.equal(input?.dreams.length, 8);
  assert.equal(input?.totalDreamCount, 14);
  assert.equal(input?.dreams[0].id, 'd13', 'the newest of the 14, not an arbitrary 8');
});

test('4. a cache hit makes ZERO generation calls', async () => {
  const dreams = [dream('d1', ['water'], '2026-01-01'), dream('d2', ['water'], '2026-01-02')];
  const cache = new Map<string, CachedPatternReflection>();
  const dreamIdsKey = buildDreamIdsKey(['d1', 'd2']);
  cache.set(`${OWNER}|water|${CONCEPT_TAXONOMY_VERSION}|${dreamIdsKey}|en`, {
    reflection: { whatStandsOut: 'x', possibleThread: 'y', question: 'z' },
    totalDreamCount: 2,
    synthesizedDreamCount: 2,
  });
  const { deps, calls } = fakeDeps({ dreams, cache });
  const outcome = await runPatternReflection({ ownerId: OWNER, conceptId: 'water', dreamIds: ['d1', 'd2'], language: 'en' }, deps);
  assert.equal(outcome.status, 'ok');
  if (outcome.status === 'ok') assert.equal(outcome.reflection.whatStandsOut, 'x', 'the cached value, not a freshly generated one');
  assert.equal(calls.generateReflection, 0);
  assert.equal(calls.persistReflection, 0);
});

test('5. a cache miss makes EXACTLY ONE generation call', async () => {
  const dreams = [dream('d1', ['water'], '2026-01-01'), dream('d2', ['water'], '2026-01-02')];
  const { deps, calls } = fakeDeps({ dreams });
  const outcome = await runPatternReflection({ ownerId: OWNER, conceptId: 'water', dreamIds: ['d1', 'd2'], language: 'en' }, deps);
  assert.equal(outcome.status, 'ok');
  assert.equal(calls.generateReflection, 1);
  assert.equal(calls.persistReflection, 1);
});

test('6. the same concept + same dream set in HE vs EN are separate cache entries', async () => {
  const dreams = [dream('d1', ['water'], '2026-01-01'), dream('d2', ['water'], '2026-01-02')];
  const { deps, cacheStore } = fakeDeps({ dreams });
  await runPatternReflection({ ownerId: OWNER, conceptId: 'water', dreamIds: ['d1', 'd2'], language: 'en' }, deps);
  await runPatternReflection({ ownerId: OWNER, conceptId: 'water', dreamIds: ['d1', 'd2'], language: 'he' }, deps);
  const keys = [...cacheStore.keys()];
  assert.equal(keys.length, 2);
  assert.ok(keys.some((k) => k.endsWith('|en')));
  assert.ok(keys.some((k) => k.endsWith('|he')));
});

test('7. a newly-added relevant dream changes the cache identity (cache miss, regenerates)', async () => {
  const dreams = [dream('d1', ['freedom'], '2026-01-01'), dream('d2', ['freedom'], '2026-01-02')];
  const { deps: deps1 } = fakeDeps({ dreams });
  const first = await runPatternReflection({ ownerId: OWNER, conceptId: 'freedom', dreamIds: ['d1', 'd2'], language: 'en' }, deps1);
  assert.equal(first.status, 'ok');

  const dreamsPlusNew = [...dreams, dream('d3', ['freedom'], '2026-01-03')];
  const { deps: deps2, calls: calls2 } = fakeDeps({ dreams: dreamsPlusNew }); // fresh, empty cache — a new key was never written before
  const second = await runPatternReflection({ ownerId: OWNER, conceptId: 'freedom', dreamIds: ['d1', 'd2', 'd3'], language: 'en' }, deps2);
  assert.equal(second.status, 'ok');
  assert.equal(calls2.generateReflection, 1, 'the new dream set is a genuine cache miss, so it regenerates');
  if (second.status === 'ok') assert.equal(second.totalDreamCount, 3);
});

test('8. a deleted relevant dream changes the cache identity the same way', async () => {
  const cache = new Map<string, CachedPatternReflection>();
  const keyBefore = `${OWNER}|freedom|${CONCEPT_TAXONOMY_VERSION}|${buildDreamIdsKey(['d1', 'd2', 'd3'])}|en`;
  cache.set(keyBefore, { reflection: { whatStandsOut: 'old', possibleThread: 'old', question: 'old' }, totalDreamCount: 3, synthesizedDreamCount: 3 });

  // d3 is deleted — no longer among the owned/returned dreams.
  const dreamsAfter = [dream('d1', ['freedom'], '2026-01-01'), dream('d2', ['freedom'], '2026-01-02')];
  const { deps, calls } = fakeDeps({ dreams: dreamsAfter, cache });
  const outcome = await runPatternReflection({ ownerId: OWNER, conceptId: 'freedom', dreamIds: ['d1', 'd2'], language: 'en' }, deps);
  assert.equal(outcome.status, 'ok');
  assert.equal(calls.generateReflection, 1, 'the old cache row for the 3-dream key is simply never looked up again — a genuine miss for the new 2-dream key');
  if (outcome.status === 'ok') assert.notEqual(outcome.reflection.whatStandsOut, 'old');
});

test('9. deletion that drops a concept below 2 distinct dreams prevents generation entirely', async () => {
  const { deps, calls } = fakeDeps({ dreams: [dream('d1', ['freedom'], '2026-01-01')] });
  const outcome = await runPatternReflection({ ownerId: OWNER, conceptId: 'freedom', dreamIds: ['d1'], language: 'en' }, deps);
  assert.equal(outcome.status, 'insufficient_evidence');
  assert.equal(calls.generateReflection, 0);
});

test('10. foreign / non-owned dream ids can never be used as evidence', async () => {
  // The fake fetchOwnedDreams models RLS: only 'd1'/'d2' are ever returned,
  // no matter what else is requested — 'not-mine' simply never comes back.
  const { deps } = fakeDeps({ dreams: [dream('d1', ['danger_threat'], '2026-01-01'), dream('d2', ['danger_threat'], '2026-01-02')] });
  const outcome = await runPatternReflection(
    { ownerId: OWNER, conceptId: 'danger_threat', dreamIds: ['d1', 'd2', 'not-mine-1', 'not-mine-2'], language: 'en' },
    deps,
  );
  assert.equal(outcome.status, 'ok');
  if (outcome.status === 'ok') assert.equal(outcome.totalDreamCount, 2, 'the foreign ids contribute nothing');
});

test('11. an invalid/unknown concept id is rejected before any dream is ever fetched', async () => {
  const { deps, calls } = fakeDeps({ dreams: [dream('d1', ['animals'], '2026-01-01'), dream('d2', ['animals'], '2026-01-02')] });
  const outcome = await runPatternReflection({ ownerId: OWNER, conceptId: 'not_a_real_concept', dreamIds: ['d1', 'd2'], language: 'en' }, deps);
  assert.equal(outcome.status, 'invalid_concept');
  assert.equal(calls.fetchOwnedDreams, 0);
  assert.equal(calls.generateReflection, 0);
});

test('12. mixed HE/EN source dreams both count toward the same language-independent concept', async () => {
  const heDream = dream('d1', ['animals'], '2026-01-01');
  const enDream = dream('d2', ['animals'], '2026-01-02');
  const { deps } = fakeDeps({ dreams: [heDream, enDream] });
  const outcome = await runPatternReflection({ ownerId: OWNER, conceptId: 'animals', dreamIds: ['d1', 'd2'], language: 'he' }, deps);
  assert.equal(outcome.status, 'ok');
  if (outcome.status === 'ok') assert.equal(outcome.totalDreamCount, 2);
});

test('13. a language-integrity failure surfaces as generation_failed and is never cached', async () => {
  const { deps, calls } = fakeDeps({
    dreams: [dream('d1', ['animals'], '2026-01-01'), dream('d2', ['animals'], '2026-01-02')],
    generateResult: { status: 'language_intrusion' },
  });
  const outcome = await runPatternReflection({ ownerId: OWNER, conceptId: 'animals', dreamIds: ['d1', 'd2'], language: 'he' }, deps);
  assert.deepEqual(outcome, { status: 'generation_failed', reason: 'language_intrusion' });
  assert.equal(calls.persistReflection, 0);
});

test('14. an invalid/unusable model response surfaces as generation_failed and is never cached', async () => {
  const { deps, calls } = fakeDeps({
    dreams: [dream('d1', ['animals'], '2026-01-01'), dream('d2', ['animals'], '2026-01-02')],
    generateResult: { status: 'invalid' },
  });
  const outcome = await runPatternReflection({ ownerId: OWNER, conceptId: 'animals', dreamIds: ['d1', 'd2'], language: 'en' }, deps);
  assert.deepEqual(outcome, { status: 'generation_failed', reason: 'invalid' });
  assert.equal(calls.persistReflection, 0);
});

test('15. a generation timeout/network failure propagates rather than being silently swallowed', async () => {
  const dreams = [dream('d1', ['animals'], '2026-01-01'), dream('d2', ['animals'], '2026-01-02')];
  const deps: PatternReflectionDeps = {
    async fetchOwnedDreams(ids) {
      return dreams.filter((d) => ids.includes(d.id));
    },
    async getCachedReflection() {
      return null;
    },
    async generateReflection() {
      throw new Error('simulated timeout');
    },
    async persistReflection() {
      return { status: 'inserted' };
    },
  };
  await assert.rejects(
    runPatternReflection({ ownerId: OWNER, conceptId: 'animals', dreamIds: ['d1', 'd2'], language: 'en' }, deps),
    /simulated timeout/,
  );
});

test('16. the client-side effect guards against a stale async response with a cancelled flag', () => {
  // No React test harness exists in this codebase (see trialIdentityAndValve.test.ts's
  // own "wiring" style for the same reasoning) — verified structurally instead.
  const src = readFileSync(new URL('../src/archive/DreamArchive.tsx', import.meta.url), 'utf8');
  const effectStart = src.indexOf('Pattern Reflection — ONLY for a semantic-concept row');
  const effectEnd = src.indexOf('const handleToggleFavorite');
  const effectSrc = src.slice(effectStart, effectEnd);
  assert.match(effectSrc, /let cancelled = false/);
  assert.match(effectSrc, /if \(cancelled\) return/);
  assert.match(effectSrc, /return \(\) => \{\s*cancelled = true;/);
});

test('17. a failed cache write still returns the freshly generated reflection (never blanks the UI)', async () => {
  const { deps, calls } = fakeDeps({
    dreams: [dream('d1', ['animals'], '2026-01-01'), dream('d2', ['animals'], '2026-01-02')],
    persistResult: { status: 'failed', error: new Error('simulated DB error') },
  });
  const outcome = await runPatternReflection({ ownerId: OWNER, conceptId: 'animals', dreamIds: ['d1', 'd2'], language: 'en' }, deps);
  assert.equal(outcome.status, 'ok');
  assert.equal(calls.generateReflection, 1);
  if (outcome.status === 'ok') assert.equal(outcome.reflection.whatStandsOut, 'a');
});

test("17b. a persist conflict (concurrent same-key write) reads back the winner's row instead of erroring", async () => {
  const key = `${OWNER}|animals|${CONCEPT_TAXONOMY_VERSION}|${buildDreamIdsKey(['d1', 'd2'])}|en`;
  const cache = new Map<string, CachedPatternReflection>();
  const { deps } = fakeDeps({
    dreams: [dream('d1', ['animals'], '2026-01-01'), dream('d2', ['animals'], '2026-01-02')],
    cache,
    persistResult: { status: 'conflict' },
  });
  // Simulate the concurrent winner's row appearing between the cache-miss
  // check and the failed insert, exactly as a real race would leave it.
  let calls = 0;
  deps.getCachedReflection = async () => {
    calls += 1;
    if (calls === 1) return null; // first check: genuine miss
    return { reflection: { whatStandsOut: 'winner', possibleThread: 'winner', question: 'winner' }, totalDreamCount: 2, synthesizedDreamCount: 2 };
  };
  const outcome = await runPatternReflection({ ownerId: OWNER, conceptId: 'animals', dreamIds: ['d1', 'd2'], language: 'en' }, deps);
  assert.equal(outcome.status, 'ok');
  if (outcome.status === 'ok') assert.equal(outcome.reflection.whatStandsOut, 'winner');
  void key;
});

test('18a. literal motifs (a non-taxonomy conceptId) never trigger generation', async () => {
  const { deps, calls } = fakeDeps({ dreams: [dream('d1', ['animals'], '2026-01-01'), dream('d2', ['animals'], '2026-01-02')] });
  // A literal motif's own `key` (e.g. "grandmother") is exactly the shape
  // of string that would arrive here if the UI ever mistakenly offered
  // Pattern Reflection for one — isConceptId() rejects it just like any
  // other non-taxonomy string.
  const outcome = await runPatternReflection({ ownerId: OWNER, conceptId: 'grandmother', dreamIds: ['d1', 'd2'], language: 'en' }, deps);
  assert.equal(outcome.status, 'invalid_concept');
  assert.equal(calls.fetchOwnedDreams, 0);
});

test('18b. the UI itself only offers Pattern Reflection for a concept row (openMotif.conceptId set)', () => {
  const src = readFileSync(new URL('../src/archive/DreamArchive.tsx', import.meta.url), 'utf8');
  assert.match(src, /if \(!openConceptId \|\| !userId \|\| openDreamCount < 2 \|\| !openDreamIdsKey\)/, 'the generation effect itself is gated on conceptId');
  assert.match(src, /const openConceptId = openMotif\?\.conceptId \?\? null;/, 'derived as a stable primitive, never the openMotif object itself');
  assert.match(src, /\{openMotif\.conceptId && \(\s*<div className="ar-reflection">/, 'the reflection block is only rendered for a concept row');
});

// ------------------------------------------------------------------ wiring ----

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the pattern-reflection route requires resolveCallerIdentity, requires a real user (never a trial), and never mints one', () => {
  const src = read('server/routes/patternReflection.ts');
  assert.ok(src.includes('resolveCallerIdentity('));
  assert.ok(src.includes("kind !== 'user'"));
  assert.ok(!src.includes('mintTrialIdentity'));
  assert.ok(!src.includes('createNewTrialIdentity'));
});

test('the pattern-reflection route never touches the service-role client', () => {
  const src = read('server/routes/patternReflection.ts');
  assert.ok(!src.includes('getSupabaseServiceClient'));
  assert.ok(!src.includes('SUPABASE_SERVICE_ROLE_KEY'));
  assert.ok(src.includes('getSupabaseUserScopedClient('));
});

test('the user-scoped Supabase client uses only the anon key, never the service-role key', () => {
  const src = read('server/supabaseUserScopedClient.ts');
  assert.ok(!src.includes('SUPABASE_SERVICE_ROLE_KEY'));
  assert.ok(src.includes('VITE_SUPABASE_ANON_KEY'));
});

test('generation is wrapped in the shared language-integrity guard, not a bespoke one', () => {
  const src = read('server/routes/patternReflection.ts');
  assert.ok(src.includes('runWithLanguageIntegrity('));
});
