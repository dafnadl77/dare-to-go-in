import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EMOTION_IDS, MAX_EMOTIONS, emotionNamesForModel, normalizeEmotions } from '../src/hero/dreamEmotions.ts';
import {
  DREAM_REFLECTION_JSON_SCHEMA,
  buildDreamReflectionSystemPrompt,
  validateDreamReflectionResult,
} from '../src/hero/dreamReflectionSchema.ts';
import { buildSavedDream } from '../src/hero/dreamStorage.ts';
import { buildReflectionInput } from '../server/routes/dreamReflection.ts';
import { en, he } from '../src/i18n/translations.ts';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const OLD_REFLECTION = {
  observation: 'o',
  personalAssociation: 'a',
  possibleThread: 't',
  continuityQuestion: 'q?',
  lenses: { cognitive: null, jungian: null, psychodynamic: null },
  confidenceNotes: [],
  groundingStatement: 'g',
};

function analysis(): DreamAnalysis {
  return {
    sourceText: 'I flew over the sea.',
    summary: 'A flight over the sea.',
    language: 'en',
    people: [],
    places: [],
    objects: [],
    actions: [],
    emotions: [],
    sensoryDetails: { visual: [], sounds: [], physicalSensations: [], atmosphere: [] },
    unusualElements: [],
    relationships: [],
    sequence: [],
    unresolvedDetails: [],
    emotionalTone: null,
    reconstruction: { primarySetting: null, keyPeople: [], keyObjects: [], keyActions: [], visualAtmosphere: [], emotionalAtmosphere: [] },
    concepts: [],
    conceptVersion: 1,
  } as unknown as DreamAnalysis;
}

test('the twelve feelings are fixed ids, at most three, deduplicated, and anything else is dropped', () => {
  assert.equal(EMOTION_IDS.length, 12);
  assert.equal(MAX_EMOTIONS, 3);
  assert.deepEqual(normalizeEmotions(['fear', 'fear', 'calm', 'love', 'joy']), ['fear', 'calm', 'love']);
  assert.deepEqual(normalizeEmotions(['fear', 'rage', 42, null, 'calm']), ['fear', 'calm']);
  assert.deepEqual(normalizeEmotions('fear'), []);
  assert.deepEqual(normalizeEmotions(undefined), []);
  assert.deepEqual(normalizeEmotions([]), []);
  assert.equal(emotionNamesForModel(['fear', 'longing']), 'fear, longing');
});

test('every feeling has a label in both languages (Hebrew and English), and the step texts exist', () => {
  for (const id of EMOTION_IDS) {
    assert.ok(en.reflection.emotions[id].trim().length > 0, `en ${id}`);
    assert.ok(he.reflection.emotions[id].trim().length > 0, `he ${id}`);
  }
  assert.equal(he.reflection.emotionsTitle, 'איזו תחושה נשארה איתכם מהחלום?');
  assert.equal(he.reflection.emotionsContinue, 'לגלות מה החלום מספר');
  assert.equal(he.reflection.emotionsSkip, 'לא בטוחים מה הרגשנו? אפשר להמשיך');
  assert.deepEqual(
    EMOTION_IDS.map((id) => he.reflection.emotions[id]),
    ['פחד', 'שמחה', 'שלווה', 'אהבה', 'געגוע', 'בלבול', 'כעס', 'עצב', 'פליאה', 'חופש', 'חוסר אונים', 'התרגשות'],
  );
  assert.ok(en.reflection.emotionsCount.includes('{count}') && he.reflection.emotionsCount.includes('{count}'));
});

test('a reflection saved or returned without the new fields stays valid; wrong types are rejected', () => {
  assert.ok(validateDreamReflectionResult(OLD_REFLECTION));
  assert.ok(validateDreamReflectionResult({ ...OLD_REFLECTION, emotionReflection: null, summary: null }));
  assert.ok(validateDreamReflectionResult({ ...OLD_REFLECTION, emotionReflection: 'x', summary: 'y' }));
  assert.equal(validateDreamReflectionResult({ ...OLD_REFLECTION, emotionReflection: 5 }), null);
  assert.equal(validateDreamReflectionResult({ ...OLD_REFLECTION, summary: ['no'] }), null);
});

test('the structured-output schema lists every property as required (strict mode) and includes the two new nullable strings', () => {
  const props = Object.keys(DREAM_REFLECTION_JSON_SCHEMA.properties).sort();
  assert.deepEqual([...DREAM_REFLECTION_JSON_SCHEMA.required].sort(), props);
  assert.ok(props.includes('emotionReflection') && props.includes('summary'));
  assert.deepEqual(DREAM_REFLECTION_JSON_SCHEMA.properties.emotionReflection.type, ['string', 'null']);
  assert.deepEqual(DREAM_REFLECTION_JSON_SCHEMA.properties.summary.type, ['string', 'null']);
});

test('the one reflection prompt separates reported feelings from the dream, forbids diagnosis, and nulls the feelings text without feelings', () => {
  const prompt = buildDreamReflectionSystemPrompt('en', 'neutral');
  assert.match(prompt, /FEELINGS THE DREAMER REPORTED/);
  assert.match(prompt, /NOT part of what happened in the dream/);
  assert.match(prompt, /Never diagnose/);
  assert.match(prompt, /emotionReflection MUST be null/);
  assert.match(prompt, /SUMMARY/);
});

test('the model input carries the feelings only when the dreamer named some, labelled as their own report', () => {
  const without = buildReflectionInput(analysis(), 'the sea', 'it is calm', [], []);
  assert.doesNotMatch(without, /FEELINGS THE DREAMER REPORTED/);
  const withFeelings = buildReflectionInput(analysis(), 'the sea', 'it is calm', [], ['fear', 'calm']);
  assert.match(withFeelings, /FEELINGS THE DREAMER REPORTED \(their own report/);
  assert.match(withFeelings, /NOT part of what happened in the dream\): fear, calm/);
  // omitted parameter behaves exactly as before the step existed
  assert.equal(buildReflectionInput(analysis(), 'the sea', 'it is calm', []), without);
});

test('a saved dream stores the feelings in its own record (jsonb payload, no migration) and omits them when none were named', () => {
  const base = {
    sourceText: 's',
    inputMode: 'text' as const,
    dreamAnalysis: analysis(),
    dreamImageDataUrl: null,
    selectedElement: 'the sea',
    reflectionResponse: 'calm',
    dreamReflection: OLD_REFLECTION,
    corrections: [],
    appLanguage: 'he' as const,
  };
  assert.deepEqual(buildSavedDream({ ...base, emotions: ['fear', 'calm', 'bogus' as never] }).emotions, ['fear', 'calm']);
  assert.equal('emotions' in buildSavedDream({ ...base, emotions: [] }), false);
  assert.equal('emotions' in buildSavedDream(base), false);
});

test('the flow: the association no longer starts the reflection; the feelings step (or its skip) does, once, with no new request or credit', () => {
  const hero = read('src/hero/HeroDream.tsx');
  const submitReflection = hero.slice(hero.indexOf('const handleSubmitReflection'), hero.indexOf('const handleSubmitEmotions'));
  assert.match(submitReflection, /setInsideStep\('emotions'\)/);
  assert.doesNotMatch(submitReflection, /startReflectionEngine/);
  const submitEmotions = hero.slice(hero.indexOf('const handleSubmitEmotions'), hero.indexOf('useEffect(() => {', hero.indexOf('const handleSubmitEmotions')));
  assert.equal((submitEmotions.match(/startReflectionEngine\(/g) ?? []).length, 1);
  assert.match(submitEmotions, /emotions,\r?\n/);
  // the retry carries the same feelings, and the saved dream records them
  assert.match(hero, /emotions: selectedEmotions,\r?\n\s+attemptId: analysisResult\.attemptId/);
  assert.match(hero, /emotions: selectedEmotions,\r?\n\s+appLanguage/);
  const ui = read('src/hero/DreamReflection.tsx');
  assert.match(ui, /onClick=\{\(\) => onSubmitEmotions\(selectedEmotions\)\}/);
  assert.match(ui, /onClick=\{\(\) => onSubmitEmotions\(\[\]\)\}/);
  // the primary button works with nothing chosen: it is not disabled
  assert.doesNotMatch(ui.slice(ui.indexOf("step === 'emotions' &&")), /disabled=\{selectedEmotions/);
});

test('the route reads the feelings only through normalizeEmotions and forces the feelings text to null when there are none', () => {
  const route = read('server/routes/dreamReflection.ts');
  assert.match(route, /normalizeEmotions\(body\.emotions\)/);
  assert.match(route, /if \(emotions\.length === 0\) validated\.emotionReflection = null/);
  assert.equal((route.match(/responses\.create\(/g) ?? []).length, 1, 'still exactly one model call in the reflection route');
});
