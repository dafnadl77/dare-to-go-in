import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveDreamElements, deriveFallbackDreamElements, wholeDreamReference } from '../src/hero/dreamElements.ts';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function analysis(over: Record<string, unknown> = {}): DreamAnalysis {
  return {
    people: [], places: [], objects: [], actions: [], emotions: [],
    sensoryDetails: { visual: [], sounds: [], physicalSensations: [], atmosphere: [] },
    unusualElements: [], relationships: [], sequence: [], unresolvedDetails: [],
    emotionalTone: '',
    reconstruction: { primarySetting: '', keyPeople: [], keyObjects: [], keyActions: [], visualAtmosphere: [], emotionalAtmosphere: [] },
    concepts: [], summary: 'I was walking through my old school at night.', sourceText: 'I was walking through my old school at night and could not find my class.', language: 'en',
    ...over,
  } as unknown as DreamAnalysis;
}

test('normal path unchanged: a dream that already yields elements never touches the fallback', () => {
  const a = analysis({
    unusualElements: ['a glowing door'],
    people: [{ nameOrRole: 'my sister', explicit: true }],
    reconstruction: { primarySetting: 'school', keyPeople: [], keyObjects: ['backpack'], keyActions: [], visualAtmosphere: [], emotionalAtmosphere: [] },
  });
  assert.deepEqual(deriveDreamElements(a), ['a glowing door', 'my sister']);
});

test('no explicit elements: grounded fallback comes from reconstruction/structured data, in the specified order', () => {
  const a = analysis({
    reconstruction: { primarySetting: 'old school', keyPeople: ['a teacher'], keyObjects: ['backpack'], keyActions: ['walking'], visualAtmosphere: [], emotionalAtmosphere: ['anxious'] },
  });
  assert.deepEqual(deriveDreamElements(a), ['backpack', 'a teacher', 'walking', 'old school', 'anxious']);
});

test('fallback never invents: every candidate is a value the analysis itself holds', () => {
  const a = analysis({
    people: [{ nameOrRole: 'a stranger', explicit: false }],
    emotions: [{ emotion: 'confusion', explicit: false }],
    places: [{ name: 'a hallway', explicit: false }],
  });
  const out = deriveFallbackDreamElements(a);
  const held = JSON.stringify(a).toLowerCase();
  assert.ok(out.length > 0);
  for (const e of out) assert.ok(held.includes(e.toLowerCase()), `"${e}" not in analysis`);
});

test('fallback dedupes, skips sentence-length values, and caps at max', () => {
  const long = 'x'.repeat(200);
  const a = analysis({
    reconstruction: { primarySetting: 'Beach', keyPeople: [], keyObjects: ['beach', long, 'a', 'b', 'c', 'd', 'e', 'f'], keyActions: [], visualAtmosphere: [], emotionalAtmosphere: [] },
  });
  const out = deriveFallbackDreamElements(a, 6);
  assert.equal(out.length, 6);
  assert.ok(!out.includes(long));
  assert.equal(new Set(out.map((x) => x.toLowerCase())).size, out.length);
});

test('a truly empty analysis yields no elements and NO fabricated ones', () => {
  assert.deepEqual(deriveDreamElements(analysis()), []);
});

test('wholeDreamReference is grounded in the dream itself and non-empty', () => {
  assert.equal(wholeDreamReference(analysis()), 'I was walking through my old school at night');
  assert.equal(wholeDreamReference(analysis({ summary: '' })).startsWith('I was walking through my old school'), true);
  assert.ok(wholeDreamReference(analysis()).length <= 60);
});

test('HeroDream never dead-ends: resolved + zero elements continues to the reflection question on the same attempt', () => {
  const src = read('src/hero/HeroDream.tsx');
  assert.match(src, /insideStep === 'prompt' && elementsResolved && dreamElements\.length === 0/);
  assert.match(src, /setSelectedElement\(wholeDreamReference\(analysisResult\.analysis\)\)/);
  assert.match(src, /setInsideStep\('reflecting'\)/);
  // resolved is set on the empty path and after labels ok/fallback; reset on go-home
  assert.match(src, /\} else \{\s*setElementsResolved\(true\);/);
  assert.match(src, /setElementsResolved\(false\);\s*\n\s*setElementsResolved|setElementsResolved\(false\)/);
  // continuation reuses the existing reflection submit with the analysis' own attemptId
  assert.match(src, /attemptId: analysisResult\.attemptId,\s*\}\);/);
});

test('the empty-state path never starts a new analysis / consumes another attempt', () => {
  const src = read('src/hero/HeroDream.tsx');
  const start = src.indexOf("insideStep === 'prompt' && elementsResolved");
  const block = src.slice(start, start + 400);
  assert.ok(!/analyzeDream|runAnalysis|startAnalysis|getDisplayLabels|generateDreamImage/.test(block));
});
