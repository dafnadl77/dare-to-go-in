import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collectStrings, findAddressViolation, findScriptIntrusion } from '../src/hero/languageIntegrity.ts';
import { mentionsUnlistedFeeling, normalizeEmotions } from '../src/hero/dreamEmotions.ts';

type Pref = 'neutral' | 'feminine' | 'masculine';
interface Sample { pref: Pref; feelings: string[]; observation: string; personalAssociation: string; emotionReflection: string; possibleThread: string; continuityQuestion: string; summary: string }
const fixture = JSON.parse(readFileSync(new URL('./fixtures/hebrewReflectionSamples.json', import.meta.url), 'utf8')) as { round3: Sample[]; sourceDreams: string[] };

test('hebrew samples: the reflections collected from the real model for invented dreams pass every deterministic output control (no model call)', () => {
  assert.equal(fixture.round3.length, 5);
  fixture.round3.forEach((s, i) => {
    const { pref: _p, feelings: _f, ...fields } = s;
    const texts = collectStrings(fields);
    assert.equal(findScriptIntrusion(texts, 'he', fixture.sourceDreams[i], { strictLatin: true }), null, `sample ${i + 1}: no foreign script or untranslated word`);
    assert.equal(findAddressViolation(texts, 'he', s.pref), null, `sample ${i + 1}: address matches the dreamer's preference`);
    const named = normalizeEmotions(s.feelings);
    assert.equal(named.length, s.feelings.length, `sample ${i + 1}: feelings are valid ids`);
    for (const field of [s.emotionReflection, s.summary]) {
      assert.equal(mentionsUnlistedFeeling(field, named, 'he'), false, `sample ${i + 1}: names only the feelings the dreamer chose`);
    }
  });
});

test('hebrew samples: the feelings are always attributed to the dreamer, never concluded from', () => {
  for (const s of fixture.round3) {
    assert.match(s.emotionReflection, /^בחר(תם|ת|תי) לציין/, 'the reflection opens by attributing the feelings to the dreamer');
    assert.doesNotMatch(collectStrings({ ...s, pref: '', feelings: [] }).join(' '), /(מעיד|מעידה|אבחנה|הפרעה|סימפטום|דיכאון|חרדה)/, 'no diagnostic wording');
  }
});
