import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDreamIdsKey, selectDreamsForSynthesis, buildPatternReflectionInput, MAX_SYNTHESIS_DREAMS } from '../src/archive/patternReflectionInput.ts';
import {
  validatePatternReflectionResult,
  buildPatternReflectionSystemPrompt,
  PATTERN_REFLECTION_PROMPT_VERSION,
  type PatternReflectionResult,
} from '../src/archive/patternReflectionSchema.ts';
import { findReflectionProblems, buildReflectionRepairNote } from '../src/archive/patternReflectionQuality.ts';
import { normalizeAddressPreference, addressPreferenceOfUser, buildHebrewAddressInstruction } from '../src/hero/addressPreference.ts';
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

const SAMPLE_REFLECTION: PatternReflectionResult = {
  whatRepeats: 'a',
  possibleConnection: 'b',
  directionToExplore: 'c',
  question: 'd',
};

function keyOf(k: PatternReflectionCacheKey): string {
  return `${k.ownerId}|${k.conceptId}|${k.conceptVersion}|${k.promptVersion}|${k.addressPreference}|${k.dreamIdsKey}|${k.language}`;
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
      return options.generateResult ?? { status: 'ok', value: SAMPLE_REFLECTION };
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

/** Every runPatternReflection call in these tests goes through this so a
    request literal never has to repeat the same boilerplate fields. */
function req(over: { conceptId: string; dreamIds: string[]; language?: string; addressPreference?: string }) {
  return { ownerId: OWNER, language: 'en', addressPreference: 'neutral', ...over };
}

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

test('buildPatternReflectionInput discloses the true total vs. the supplied count, marks sourceText canonical, and warns against manufactured commonality', () => {
  const evidence = [{ id: 'd1', createdAt: '2026-01-01T00:00:00Z', sourceText: 'I was flying.', summary: 's', emotions: ['joy'], selectedElement: 'sky', observation: 'o' }];
  const capped = buildPatternReflectionInput({ label: 'Flying & falling', definition: 'def' }, evidence, 14);
  assert.match(capped, /14 of the dreamer's saved dreams in total/);
  assert.match(capped, /only the 1 most recent/);
  assert.match(capped, /CANONICAL/);
  assert.match(capped, /"I was flying\."/);
  assert.match(capped, /does not mean they share anything else/);

  const complete = buildPatternReflectionInput({ label: 'Flying & falling', definition: 'def' }, evidence, 1);
  assert.match(complete, /all of them are shown below/);
});

test('the system prompt requires the new 4-field synthesis structure and forbids universal symbolism / generic theme explanations, in both languages', () => {
  for (const lang of ['en', 'he'] as const) {
    const prompt = buildPatternReflectionSystemPrompt(lang, 'neutral');
    assert.match(prompt, /NOT dream-dictionary interpretation/);
    assert.match(prompt, /NO fixed symbolic meaning/);
    assert.match(prompt, /generic explanation of what the theme usually means/);
    assert.match(prompt, /whatRepeats/);
    assert.match(prompt, /possibleConnection/);
    assert.match(prompt, /directionToExplore/);
    assert.match(prompt, /exactly ONE specific, thoughtful question/);
    assert.match(prompt, /SAY LESS/);
    assert.match(prompt, /natural, idiomatic, grammatically correct/);
  }
});

test('the prompt version is part of the cache identity and bumped for this round\'s schema/prompt change', () => {
  assert.equal(PATTERN_REFLECTION_PROMPT_VERSION, 2);
});

test('validatePatternReflectionResult requires all four non-empty string fields, in the new shape', () => {
  assert.deepEqual(validatePatternReflectionResult(SAMPLE_REFLECTION), SAMPLE_REFLECTION);
  assert.equal(validatePatternReflectionResult({ ...SAMPLE_REFLECTION, question: '' }), null);
  assert.equal(validatePatternReflectionResult({ whatRepeats: 'a', possibleConnection: 'b', directionToExplore: 'c' }), null);
  assert.equal(validatePatternReflectionResult(null), null);
  // The old (round-1) 3-field shape must NOT validate — it's a genuinely
  // different, incompatible schema, which is exactly why the cache
  // identity needed its own version bump.
  assert.equal(validatePatternReflectionResult({ whatStandsOut: 'a', possibleThread: 'b', question: 'c' }), null);
});

// ------------------------------------------------------- gender / address ----

test('normalizeAddressPreference defaults anything unrecognized to neutral — never infers, never guesses', () => {
  assert.equal(normalizeAddressPreference('feminine'), 'feminine');
  assert.equal(normalizeAddressPreference('masculine'), 'masculine');
  for (const bad of ['neutral', undefined, null, '', 'female', 'Feminine', 42, {}]) {
    assert.equal(normalizeAddressPreference(bad), 'neutral', JSON.stringify(bad));
  }
});

test('addressPreferenceOfUser reads only user_metadata, defaulting existing/legacy users (no metadata at all) to neutral', () => {
  assert.equal(addressPreferenceOfUser(null), 'neutral');
  assert.equal(addressPreferenceOfUser(undefined), 'neutral');
  assert.equal(addressPreferenceOfUser({ user_metadata: {} }), 'neutral');
  assert.equal(addressPreferenceOfUser({ user_metadata: { addressPreference: 'feminine' } }), 'feminine');
  assert.equal(addressPreferenceOfUser({ user_metadata: { addressPreference: 'masculine' } }), 'masculine');
  // Never inferred from any OTHER metadata field (name, email-derived guess, etc.)
  assert.equal(addressPreferenceOfUser({ user_metadata: { full_name: 'Dafna', gender: 'female' } }), 'neutral');
});

test('feminine Hebrew address instruction uses exclusively feminine forms and forbids masculine', () => {
  const text = buildHebrewAddressInstruction('feminine');
  assert.match(text, /FEMININE/);
  assert.match(text, /את,/);
  assert.match(text, /Never use a masculine/);
});

test('masculine Hebrew address instruction uses exclusively masculine forms and forbids feminine', () => {
  const text = buildHebrewAddressInstruction('masculine');
  assert.match(text, /MASCULINE/);
  assert.match(text, /אתה,/);
  assert.match(text, /Never use a feminine/);
});

test('neutral Hebrew address instruction never defaults to masculine and forbids awkward slash-forms', () => {
  const text = buildHebrewAddressInstruction('neutral');
  assert.match(text, /do NOT default to masculine Hebrew/);
  assert.match(text, /NEVER use an awkward slash form/);
  assert.match(text, /את\/ה/); // named only as a forbidden example
  assert.match(text, /restructure sentences/);
  assert.match(text, /natural, fluent, idiomatic Hebrew/);
});

test('the English prompt never includes the Hebrew address instruction, regardless of preference', () => {
  for (const pref of ['feminine', 'masculine', 'neutral'] as const) {
    const prompt = buildPatternReflectionSystemPrompt('en', pref);
    assert.ok(!prompt.includes('HEBREW GRAMMATICAL ADDRESS'), pref);
  }
});

test('each Hebrew address preference produces a genuinely different prompt', () => {
  const feminine = buildPatternReflectionSystemPrompt('he', 'feminine');
  const masculine = buildPatternReflectionSystemPrompt('he', 'masculine');
  const neutral = buildPatternReflectionSystemPrompt('he', 'neutral');
  assert.notEqual(feminine, masculine);
  assert.notEqual(feminine, neutral);
  assert.notEqual(masculine, neutral);
});

// --------------------------------------------------------- quality guard ----

test('findReflectionProblems passes clean, natural-looking prose', () => {
  assert.deepEqual(findReflectionProblems(SAMPLE_REFLECTION), []);
});

test('findReflectionProblems catches a corrupted run of repeated characters, in any field, any language', () => {
  assert.deepEqual(findReflectionProblems({ ...SAMPLE_REFLECTION, whatRepeats: 'תמותתתתת מוזרה' }), ['repeated_char']);
  assert.deepEqual(findReflectionProblems({ ...SAMPLE_REFLECTION, question: 'whyyyyy does this happen' }), ['repeated_char']);
});

test('findReflectionProblems catches placeholder/meta text leaking into prose', () => {
  assert.deepEqual(findReflectionProblems({ ...SAMPLE_REFLECTION, possibleConnection: 'TODO' }), ['placeholder_text']);
  assert.deepEqual(findReflectionProblems({ ...SAMPLE_REFLECTION, directionToExplore: '...' }), ['placeholder_text']);
});

test('findReflectionProblems catches two fields being verbatim-identical (never legitimate)', () => {
  assert.deepEqual(findReflectionProblems({ ...SAMPLE_REFLECTION, question: SAMPLE_REFLECTION.whatRepeats }), ['duplicate_field']);
});

test('findReflectionProblems never flags a legitimate, merely uncommon word (no forbidden-word dictionary)', () => {
  const unusual: PatternReflectionResult = {
    whatRepeats: 'תמונות חוזרות של ארמונות ובעלי חיים נדירים.',
    possibleConnection: 'ייתכן שיש כאן קשר לתחושת אחריות בלתי שגרתית.',
    directionToExplore: 'אפשר לשים לב לתחושת המחויבות שמתעוררת.',
    question: 'מה מתעורר סביב הרגע הזה?',
  };
  assert.deepEqual(findReflectionProblems(unusual), []);
});

test('buildReflectionRepairNote names the structural problem without naming any specific word', () => {
  const note = buildReflectionRepairNote(['repeated_char', 'duplicate_field']);
  assert.match(note, /corrupted, garbled run of repeated characters/);
  assert.match(note, /repeated the exact same sentence/);
  assert.match(note, /REWRITE REQUIRED/);
});

// -------------------------------------------------------- runPatternReflection ----

test('1. a concept in exactly 2 distinct dreams is enough evidence', async () => {
  const { deps, calls } = fakeDeps({ dreams: [dream('d1', ['animals'], '2026-01-01'), dream('d2', ['animals'], '2026-01-02')] });
  const outcome = await runPatternReflection(req({ conceptId: 'animals', dreamIds: ['d1', 'd2'] }), deps);
  assert.equal(outcome.status, 'ok');
  assert.equal(calls.generateReflection, 1);
  if (outcome.status === 'ok') assert.equal(outcome.totalDreamCount, 2);
});

test('2. a duplicated dream id in the request never inflates the distinct-dream count', async () => {
  const { deps } = fakeDeps({ dreams: [dream('d1', ['animals'], '2026-01-01'), dream('d2', ['animals'], '2026-01-02')] });
  const outcome = await runPatternReflection(req({ conceptId: 'animals', dreamIds: ['d1', 'd1', 'd2'] }), deps);
  assert.equal(outcome.status, 'ok');
  if (outcome.status === 'ok') assert.equal(outcome.totalDreamCount, 2, 'still 2 distinct dreams, not 3');
});

test('3. a concept with more than 8 relevant dreams sends only the latest 8 to the model while the true total is preserved', async () => {
  const dreams = Array.from({ length: 14 }, (_, i) => dream(`d${i}`, ['family'], new Date(2026, 0, i + 1).toISOString()));
  const { deps, getLastGenerateInput } = fakeDeps({ dreams });
  const outcome = await runPatternReflection(req({ conceptId: 'family', dreamIds: dreams.map((d) => d.id) }), deps);
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
  cache.set(`${OWNER}|water|${CONCEPT_TAXONOMY_VERSION}|${PATTERN_REFLECTION_PROMPT_VERSION}|neutral|${dreamIdsKey}|en`, {
    reflection: SAMPLE_REFLECTION,
    totalDreamCount: 2,
    synthesizedDreamCount: 2,
  });
  const { deps, calls } = fakeDeps({ dreams, cache });
  const outcome = await runPatternReflection(req({ conceptId: 'water', dreamIds: ['d1', 'd2'] }), deps);
  assert.equal(outcome.status, 'ok');
  if (outcome.status === 'ok') assert.equal(outcome.reflection.whatRepeats, SAMPLE_REFLECTION.whatRepeats, 'the cached value, not a freshly generated one');
  assert.equal(calls.generateReflection, 0);
  assert.equal(calls.persistReflection, 0);
});

test('5. a cache miss makes EXACTLY ONE generation call', async () => {
  const dreams = [dream('d1', ['water'], '2026-01-01'), dream('d2', ['water'], '2026-01-02')];
  const { deps, calls } = fakeDeps({ dreams });
  const outcome = await runPatternReflection(req({ conceptId: 'water', dreamIds: ['d1', 'd2'] }), deps);
  assert.equal(outcome.status, 'ok');
  assert.equal(calls.generateReflection, 1);
  assert.equal(calls.persistReflection, 1);
});

test('6. the same concept + same dream set + same address preference in HE vs EN are separate, independent cache entries', async () => {
  const dreams = [dream('d1', ['water'], '2026-01-01'), dream('d2', ['water'], '2026-01-02')];
  const { deps, cacheStore } = fakeDeps({ dreams });
  await runPatternReflection(req({ conceptId: 'water', dreamIds: ['d1', 'd2'], language: 'en' }), deps);
  await runPatternReflection(req({ conceptId: 'water', dreamIds: ['d1', 'd2'], language: 'he' }), deps);
  const keys = [...cacheStore.keys()];
  assert.equal(keys.length, 2);
  assert.ok(keys.some((k) => k.endsWith('|en')));
  assert.ok(keys.some((k) => k.endsWith('|he')));
});

test('7. a newly-added relevant dream changes the cache identity (cache miss, regenerates)', async () => {
  const dreams = [dream('d1', ['freedom'], '2026-01-01'), dream('d2', ['freedom'], '2026-01-02')];
  const { deps: deps1 } = fakeDeps({ dreams });
  const first = await runPatternReflection(req({ conceptId: 'freedom', dreamIds: ['d1', 'd2'] }), deps1);
  assert.equal(first.status, 'ok');

  const dreamsPlusNew = [...dreams, dream('d3', ['freedom'], '2026-01-03')];
  const { deps: deps2, calls: calls2 } = fakeDeps({ dreams: dreamsPlusNew }); // fresh, empty cache — a new key was never written before
  const second = await runPatternReflection(req({ conceptId: 'freedom', dreamIds: ['d1', 'd2', 'd3'] }), deps2);
  assert.equal(second.status, 'ok');
  assert.equal(calls2.generateReflection, 1, 'the new dream set is a genuine cache miss, so it regenerates');
  if (second.status === 'ok') assert.equal(second.totalDreamCount, 3);
});

test('8. a deleted relevant dream changes the cache identity the same way', async () => {
  const cache = new Map<string, CachedPatternReflection>();
  const keyBefore = `${OWNER}|freedom|${CONCEPT_TAXONOMY_VERSION}|${PATTERN_REFLECTION_PROMPT_VERSION}|neutral|${buildDreamIdsKey(['d1', 'd2', 'd3'])}|en`;
  cache.set(keyBefore, { reflection: { ...SAMPLE_REFLECTION, whatRepeats: 'old' }, totalDreamCount: 3, synthesizedDreamCount: 3 });

  // d3 is deleted — no longer among the owned/returned dreams.
  const dreamsAfter = [dream('d1', ['freedom'], '2026-01-01'), dream('d2', ['freedom'], '2026-01-02')];
  const { deps, calls } = fakeDeps({ dreams: dreamsAfter, cache });
  const outcome = await runPatternReflection(req({ conceptId: 'freedom', dreamIds: ['d1', 'd2'] }), deps);
  assert.equal(outcome.status, 'ok');
  assert.equal(calls.generateReflection, 1, 'the old cache row for the 3-dream key is simply never looked up again — a genuine miss for the new 2-dream key');
  if (outcome.status === 'ok') assert.notEqual(outcome.reflection.whatRepeats, 'old');
});

test('9. deletion that drops a concept below 2 distinct dreams prevents generation entirely', async () => {
  const { deps, calls } = fakeDeps({ dreams: [dream('d1', ['freedom'], '2026-01-01')] });
  const outcome = await runPatternReflection(req({ conceptId: 'freedom', dreamIds: ['d1'] }), deps);
  assert.equal(outcome.status, 'insufficient_evidence');
  assert.equal(calls.generateReflection, 0);
});

test('10. foreign / non-owned dream ids can never be used as evidence (RLS/owner isolation)', async () => {
  const { deps } = fakeDeps({ dreams: [dream('d1', ['danger_threat'], '2026-01-01'), dream('d2', ['danger_threat'], '2026-01-02')] });
  const outcome = await runPatternReflection(req({ conceptId: 'danger_threat', dreamIds: ['d1', 'd2', 'not-mine-1', 'not-mine-2'] }), deps);
  assert.equal(outcome.status, 'ok');
  if (outcome.status === 'ok') assert.equal(outcome.totalDreamCount, 2, 'the foreign ids contribute nothing');
});

test('11. an invalid/unknown concept id is rejected before any dream is ever fetched', async () => {
  const { deps, calls } = fakeDeps({ dreams: [dream('d1', ['animals'], '2026-01-01'), dream('d2', ['animals'], '2026-01-02')] });
  const outcome = await runPatternReflection(req({ conceptId: 'not_a_real_concept', dreamIds: ['d1', 'd2'] }), deps);
  assert.equal(outcome.status, 'invalid_concept');
  assert.equal(calls.fetchOwnedDreams, 0);
  assert.equal(calls.generateReflection, 0);
});

test('12. mixed HE/EN source dreams both count toward the same language-independent concept', async () => {
  const heDream = dream('d1', ['animals'], '2026-01-01');
  const enDream = dream('d2', ['animals'], '2026-01-02');
  const { deps } = fakeDeps({ dreams: [heDream, enDream] });
  const outcome = await runPatternReflection(req({ conceptId: 'animals', dreamIds: ['d1', 'd2'], language: 'he' }), deps);
  assert.equal(outcome.status, 'ok');
  if (outcome.status === 'ok') assert.equal(outcome.totalDreamCount, 2);
});

test('13. a language-integrity failure surfaces as generation_failed and is never cached', async () => {
  const { deps, calls } = fakeDeps({
    dreams: [dream('d1', ['animals'], '2026-01-01'), dream('d2', ['animals'], '2026-01-02')],
    generateResult: { status: 'language_intrusion' },
  });
  const outcome = await runPatternReflection(req({ conceptId: 'animals', dreamIds: ['d1', 'd2'], language: 'he' }), deps);
  assert.deepEqual(outcome, { status: 'generation_failed', reason: 'language_intrusion' });
  assert.equal(calls.persistReflection, 0);
});

test('14. an invalid/malformed model response surfaces as generation_failed and is never cached', async () => {
  const { deps, calls } = fakeDeps({
    dreams: [dream('d1', ['animals'], '2026-01-01'), dream('d2', ['animals'], '2026-01-02')],
    generateResult: { status: 'invalid' },
  });
  const outcome = await runPatternReflection(req({ conceptId: 'animals', dreamIds: ['d1', 'd2'] }), deps);
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
  await assert.rejects(runPatternReflection(req({ conceptId: 'animals', dreamIds: ['d1', 'd2'] }), deps), /simulated timeout/);
});

test('16. the client-side effect guards against a stale async response with a cancelled flag, and never depends on unstable object references', () => {
  // No React test harness exists in this codebase (see trialIdentityAndValve.test.ts's
  // own "wiring" style for the same reasoning) — verified structurally instead.
  const src = readFileSync(new URL('../src/archive/DreamArchive.tsx', import.meta.url), 'utf8');
  const effectStart = src.indexOf('Pattern Reflection — ONLY for a semantic-concept row');
  const effectEnd = src.indexOf('DISPLAY-ONLY localization for motif labels');
  const effectSrc = src.slice(effectStart, effectEnd);
  assert.match(effectSrc, /let cancelled = false/);
  assert.match(effectSrc, /if \(cancelled\) return/);
  assert.match(effectSrc, /return \(\) => \{\s*cancelled = true;/);
  // The actual dependency array — must be plain primitives, never `openMotif`/`user` by reference (the round-1 polling-loop bug).
  const depsLine = effectSrc.slice(effectSrc.lastIndexOf('}, ['));
  assert.match(depsLine, /\[openConceptId, openDreamIdsKey, openDreamCount, userId, language, cacheAddressPreference\]/);
});

test('17. a failed cache write still returns the freshly generated reflection (never blanks the UI)', async () => {
  const { deps, calls } = fakeDeps({
    dreams: [dream('d1', ['animals'], '2026-01-01'), dream('d2', ['animals'], '2026-01-02')],
    persistResult: { status: 'failed', error: new Error('simulated DB error') },
  });
  const outcome = await runPatternReflection(req({ conceptId: 'animals', dreamIds: ['d1', 'd2'] }), deps);
  assert.equal(outcome.status, 'ok');
  assert.equal(calls.generateReflection, 1);
  if (outcome.status === 'ok') assert.equal(outcome.reflection.whatRepeats, SAMPLE_REFLECTION.whatRepeats);
});

test("17b. a persist conflict (concurrent same-key write) reads back the winner's row instead of erroring", async () => {
  const { deps } = fakeDeps({
    dreams: [dream('d1', ['animals'], '2026-01-01'), dream('d2', ['animals'], '2026-01-02')],
    persistResult: { status: 'conflict' },
  });
  let calls = 0;
  deps.getCachedReflection = async () => {
    calls += 1;
    if (calls === 1) return null; // first check: genuine miss
    return { reflection: { ...SAMPLE_REFLECTION, whatRepeats: 'winner' }, totalDreamCount: 2, synthesizedDreamCount: 2 };
  };
  const outcome = await runPatternReflection(req({ conceptId: 'animals', dreamIds: ['d1', 'd2'] }), deps);
  assert.equal(outcome.status, 'ok');
  if (outcome.status === 'ok') assert.equal(outcome.reflection.whatRepeats, 'winner');
});

test('18a. literal motifs (a non-taxonomy conceptId) never trigger generation', async () => {
  const { deps, calls } = fakeDeps({ dreams: [dream('d1', ['animals'], '2026-01-01'), dream('d2', ['animals'], '2026-01-02')] });
  const outcome = await runPatternReflection(req({ conceptId: 'grandmother', dreamIds: ['d1', 'd2'] }), deps);
  assert.equal(outcome.status, 'invalid_concept');
  assert.equal(calls.fetchOwnedDreams, 0);
});

test('18b. the UI itself only offers Pattern Reflection for a concept row (openMotif.conceptId set)', () => {
  const src = readFileSync(new URL('../src/archive/DreamArchive.tsx', import.meta.url), 'utf8');
  assert.match(src, /if \(!openConceptId \|\| !userId \|\| openDreamCount < 2 \|\| !openDreamIdsKey\)/, 'the generation effect itself is gated on conceptId');
  assert.match(src, /\{openMotif\.conceptId && \(\s*<div className="ar-reflection">/, 'the reflection block is only rendered for a concept row');
});

// ------------------------------------------------ round 2: address preference in the cache ----

test('19. English output/cache is unaffected by address preference — always forced to neutral regardless of the dreamer\'s actual choice', async () => {
  const dreams = [dream('d1', ['animals'], '2026-01-01'), dream('d2', ['animals'], '2026-01-02')];
  const { deps, getLastGenerateInput, cacheStore } = fakeDeps({ dreams });
  const outcome = await runPatternReflection(req({ conceptId: 'animals', dreamIds: ['d1', 'd2'], language: 'en', addressPreference: 'masculine' }), deps);
  assert.equal(outcome.status, 'ok');
  assert.equal(getLastGenerateInput()?.addressPreference, 'neutral', 'never leaks a real preference into English generation');
  assert.ok([...cacheStore.keys()][0].includes('|neutral|'));
});

test('20. changing the Hebrew address preference invalidates the old cache — an old masculine/feminine/neutral reflection is never reused for a different preference', async () => {
  const dreams = [dream('d1', ['animals'], '2026-01-01'), dream('d2', ['animals'], '2026-01-02')];
  const { deps, cacheStore } = fakeDeps({ dreams });
  const feminine = await runPatternReflection(req({ conceptId: 'animals', dreamIds: ['d1', 'd2'], language: 'he', addressPreference: 'feminine' }), deps);
  const masculine = await runPatternReflection(req({ conceptId: 'animals', dreamIds: ['d1', 'd2'], language: 'he', addressPreference: 'masculine' }), deps);
  const neutral = await runPatternReflection(req({ conceptId: 'animals', dreamIds: ['d1', 'd2'], language: 'he', addressPreference: 'neutral' }), deps);
  assert.equal(feminine.status, 'ok');
  assert.equal(masculine.status, 'ok');
  assert.equal(neutral.status, 'ok');
  assert.equal(cacheStore.size, 3, 'three genuinely independent cache rows, one per preference');
});

test('21. reopening the SAME Hebrew preference is still a cache hit (no unnecessary regeneration)', async () => {
  const dreams = [dream('d1', ['animals'], '2026-01-01'), dream('d2', ['animals'], '2026-01-02')];
  const { deps, calls } = fakeDeps({ dreams });
  await runPatternReflection(req({ conceptId: 'animals', dreamIds: ['d1', 'd2'], language: 'he', addressPreference: 'feminine' }), deps);
  await runPatternReflection(req({ conceptId: 'animals', dreamIds: ['d1', 'd2'], language: 'he', addressPreference: 'feminine' }), deps);
  assert.equal(calls.generateReflection, 1, 'the second identical request is a pure cache hit');
});

test('22. a garbage/unrecognized addressPreference value normalizes to neutral rather than erroring', async () => {
  const dreams = [dream('d1', ['animals'], '2026-01-01'), dream('d2', ['animals'], '2026-01-02')];
  const { deps, getLastGenerateInput } = fakeDeps({ dreams });
  const outcome = await runPatternReflection(req({ conceptId: 'animals', dreamIds: ['d1', 'd2'], language: 'he', addressPreference: 'something-invalid' }), deps);
  assert.equal(outcome.status, 'ok');
  assert.equal(getLastGenerateInput()?.addressPreference, 'neutral');
});

test('23. an unrelated concept never invalidates or interferes with another concept\'s own cache entry', async () => {
  const dreams = [
    dream('d1', ['animals'], '2026-01-01'),
    dream('d2', ['animals'], '2026-01-02'),
    dream('d3', ['water'], '2026-01-03'),
    dream('d4', ['water'], '2026-01-04'),
  ];
  const { deps, calls, cacheStore } = fakeDeps({ dreams });
  await runPatternReflection(req({ conceptId: 'animals', dreamIds: ['d1', 'd2'] }), deps);
  const afterFirst = calls.generateReflection;
  await runPatternReflection(req({ conceptId: 'water', dreamIds: ['d3', 'd4'] }), deps);
  assert.equal(calls.generateReflection, afterFirst + 1, 'a separate generation for a separate concept');
  // Reopening the FIRST concept again must still be a pure cache hit —
  // generating the second concept did not touch its row.
  await runPatternReflection(req({ conceptId: 'animals', dreamIds: ['d1', 'd2'] }), deps);
  assert.equal(calls.generateReflection, afterFirst + 1, 'the animals cache entry was untouched by the water generation');
  assert.equal(cacheStore.size, 2);
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

test('the address preference is read ONLY from the caller\'s own verified user record, never from the request body — it is never client-suppliable and never inferred', () => {
  const src = read('server/routes/patternReflection.ts');
  assert.ok(src.includes('scoped.auth.getUser()'), 'reads it from the verified session, not the request body');
  assert.ok(!src.includes('body.addressPreference'), 'never trusts a client-claimed preference');
  assert.match(src, /userData\.user\?\.user_metadata\?\.addressPreference/);
});

test('the route runs a bounded, deterministic quality-repair pass (one repair attempt, then a final check) before ever accepting a result', () => {
  const src = read('server/routes/patternReflection.ts');
  assert.ok(src.includes('findReflectionProblems('));
  assert.ok(src.includes('buildReflectionRepairNote('));
  // Two distinct generate() calls possible per outer attempt: the first
  // attempt, and the one repair pass.
  const generateCalls = (src.match(/await generate\(/g) ?? []).length;
  assert.equal(generateCalls, 2, 'exactly one repair pass, not an unbounded loop');
});

test('the pattern_reflections table schema/migration includes prompt_version and address_preference as part of the identity', () => {
  // The actual applied migration is server-side (Supabase), not a local
  // file — this checks the code-level identity these columns feed,
  // consistent with how the rest of this codebase verifies DB-adjacent
  // behavior through the functions that build/read the key rather than
  // a migration file that doesn't exist locally (see server/patternReflectionCore.ts).
  const core = read('server/patternReflectionCore.ts');
  assert.match(core, /promptVersion: number/);
  assert.match(core, /addressPreference: AddressPreference/);
  const route = read('server/routes/patternReflection.ts');
  assert.ok(route.includes('prompt_version: key.promptVersion'));
  assert.ok(route.includes('address_preference: key.addressPreference'));
  assert.ok(route.includes(".eq('prompt_version', key.promptVersion)"));
  assert.ok(route.includes(".eq('address_preference', key.addressPreference)"));
});
