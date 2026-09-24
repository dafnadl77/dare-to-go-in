import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDreamReflectionSystemPrompt } from '../src/hero/dreamReflectionSchema.ts';

/**
 * Focused tests for extending the SAME persisted address preference
 * (src/hero/addressPreference.ts) to the individual per-dream Dream
 * Reflection prompt — grammatical-address consistency only, see
 * server/routes/dreamReflection.ts's own resolveAddressPreference. Mirrors
 * the equivalent Pattern Reflection tests in tests/patternReflection.test.ts.
 */

test('feminine Hebrew Dream Reflection prompt uses the shared feminine address instruction', () => {
  const prompt = buildDreamReflectionSystemPrompt('he', 'feminine');
  assert.match(prompt, /HEBREW GRAMMATICAL ADDRESS/);
  assert.match(prompt, /FEMININE/);
  assert.match(prompt, /Never use a masculine/);
});

test('masculine Hebrew Dream Reflection prompt uses the shared masculine address instruction', () => {
  const prompt = buildDreamReflectionSystemPrompt('he', 'masculine');
  assert.match(prompt, /MASCULINE/);
  assert.match(prompt, /Never use a feminine/);
});

test('neutral Hebrew Dream Reflection prompt never defaults to masculine and forbids slash-forms', () => {
  const prompt = buildDreamReflectionSystemPrompt('he', 'neutral');
  assert.match(prompt, /do NOT default to masculine Hebrew/);
  assert.match(prompt, /NEVER use an awkward slash form/);
  assert.match(prompt, /את\/ה/);
});

test('English Dream Reflection output is completely unaffected by address preference (unchanged, gender-neutral)', () => {
  const feminine = buildDreamReflectionSystemPrompt('en', 'feminine');
  const masculine = buildDreamReflectionSystemPrompt('en', 'masculine');
  const neutral = buildDreamReflectionSystemPrompt('en', 'neutral');
  assert.equal(feminine, masculine, 'the address preference must never change English output');
  assert.equal(feminine, neutral);
  assert.ok(!feminine.includes('HEBREW GRAMMATICAL ADDRESS'), 'no Hebrew instruction ever leaks into the English prompt');
});

test('this is a grammatical-address change only — the reflection\'s own meaning/structure is untouched', () => {
  const prompt = buildDreamReflectionSystemPrompt('en', 'neutral');
  // The exact same five layers as before this change, unmodified.
  assert.match(prompt, /1\. OBSERVATION — state what actually happened in the dream/);
  assert.match(prompt, /2\. PERSONAL ASSOCIATION/);
  assert.match(prompt, /3\. POSSIBLE THREAD — exactly ONE concise thematic possibility/);
  assert.match(prompt, /4\. CONTINUITY QUESTION — exactly ONE strong question/);
  assert.match(prompt, /5\. LENSES \(optional\)/);
  assert.match(prompt, /never use generic internet dream-dictionary meanings/);
});

// ------------------------------------------------------------------ wiring ----

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the dream-reflection route derives address preference ONLY from the caller\'s verified user record, never the request body', () => {
  const src = read('server/routes/dreamReflection.ts');
  assert.ok(src.includes('resolveAddressPreference('));
  assert.ok(src.includes('scoped.auth.getUser()'));
  assert.match(src, /data\.user\?\.user_metadata\?\.addressPreference/);
  assert.ok(!src.includes('body.addressPreference'), 'never trusts a client-claimed preference');
});

test('an anonymous trial caller (no account) always resolves to neutral, never a guess, and never even attempts a Supabase call', () => {
  const src = read('server/routes/dreamReflection.ts');
  const fnStart = src.indexOf('async function resolveAddressPreference');
  const fnEnd = src.indexOf('\n}', fnStart);
  const fnSrc = src.slice(fnStart, fnEnd);
  assert.match(fnSrc, /if \(identity\.kind !== 'user'\) return 'neutral';/);
});

test('the dream-reflection route never touches the service-role client for this', () => {
  const src = read('server/routes/dreamReflection.ts');
  assert.ok(!src.includes('getSupabaseServiceClient'));
  assert.ok(src.includes('getSupabaseUserScopedClient('));
});

test('no unrelated AI route was touched by this change (dream-analysis, element-labels, translation, reconstruction stay untouched)', () => {
  for (const routeFile of ['server/routes/dreamAnalysis.ts', 'server/routes/dreamElementLabels.ts', 'server/routes/dreamTranslation.ts', 'server/routes/dreamTranscription.ts']) {
    const src = read(routeFile);
    assert.ok(!src.includes('addressPreference'), `${routeFile} must not reference addressPreference`);
  }
});
