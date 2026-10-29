import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDreamReflectionSystemPrompt } from '../src/hero/dreamReflectionSchema';

/**
 * "כלד בר" in the symbolic lens (2026-10-29): the reflection model wrote a word that does not exist, and the app showed it as written
 * (the lens text is kept or dropped, never rewritten). The fix is one rule in the Hebrew instructions: every field, the theory lenses,
 * the alternative readings and the existential angle included, is reread for spelling, and nothing else changes. No automatic rewriting.
 */

test('the Hebrew reflection instructions ask for correct spelling in every field, the lenses included, without changing the reading', () => {
  for (const address of ['feminine', 'masculine', 'neutral'] as const) {
    const prompt = buildDreamReflectionSystemPrompt('he', address);
    assert.match(prompt, /The same spelling rule holds for every field, the three theory lenses, the alternative readings and the existential angle included/);
    assert.match(prompt, /keep the reading, its images and its meaning exactly as they are, and change nothing else\./);
    assert.match(prompt, /"כלד בר"/);
  }
});

test('the English instructions are unchanged by it', () => {
  const prompt = buildDreamReflectionSystemPrompt('en', 'neutral');
  assert.doesNotMatch(prompt, /The same spelling rule holds for every field/);
  assert.doesNotMatch(prompt, /כלד בר/);
});
