import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeDreamDepth, maxAlternativeReadings } from '../src/hero/dreamDepth.ts';
import { namesBoth, sharesContentWord } from '../src/hero/groundedText.ts';
import {
  buildDreamQuestionsInput,
  buildDreamQuestionsSystemPrompt,
  DREAM_QUESTIONS_JSON_SCHEMA,
  factsFromAnalysis,
  findQuestionProblems,
  sanitizeDreamQuestions,
  validateDreamQuestionFacts,
  validateRawDreamQuestions,
} from '../src/hero/dreamQuestionsSchema.ts';
import {
  buildDreamReflectionSystemPrompt,
  DREAM_REFLECTION_JSON_SCHEMA,
  finalizeReflectionExtras,
  reflectionLengthNote,
  validateDreamReflectionResult,
  type DreamReflectionResult,
} from '../src/hero/dreamReflectionSchema.ts';
import { buildReflectionInput, proseOf } from '../server/routes/dreamReflection.ts';
import { findScriptIntrusion } from '../src/hero/languageIntegrity.ts';
import { buildSavedDream } from '../src/hero/dreamStorage.ts';
import { findHebrewSlashForm } from '../src/hero/languageIntegrity.ts';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function analysis(over: Record<string, unknown> = {}): DreamAnalysis {
  return {
    people: [], places: [], objects: [], actions: [], emotions: [],
    sensoryDetails: { visual: [], sounds: [], physicalSensations: [], atmosphere: [] },
    unusualElements: [], relationships: [], sequence: [], unresolvedDetails: [],
    emotionalTone: null,
    reconstruction: { primarySetting: '', keyPeople: [], keyObjects: [], keyActions: [], visualAtmosphere: [], emotionalAtmosphere: [] },
    concepts: [], summary: 'Waiting alone at an empty station.', sourceText: 'I stood at an empty train station waiting. The train never came.', language: 'en',
    ...over,
  } as unknown as DreamAnalysis;
}

const HOUSE = 'הייתי בבית ילדותי אבל החדרים היו גדולים יותר. אמא שלי עמדה במטבח ובישלה ולא הסתכלה עליי. עליתי למעלה וגיליתי חדר שלא הכרתי, ובו מים עד הקרסוליים ומנורה דולקת.';

// ---- depth ----------------------------------------------------------------------------------------------------------------

test('depth is decided in code from the dream: short = brief, long or many facts = rich, otherwise standard', () => {
  assert.equal(computeDreamDepth(analysis()), 'brief');
  const many = Array.from({ length: 8 }, (_, i) => ({ nameOrRole: `p${i}`, explicit: true }));
  assert.equal(computeDreamDepth(analysis({ people: many, actions: many, sourceText: 'word '.repeat(60) })), 'rich');
  assert.equal(computeDreamDepth(analysis({ sourceText: 'word '.repeat(150) })), 'rich');
  assert.equal(computeDreamDepth(analysis({ sourceText: 'word '.repeat(60), people: many.slice(0, 3) })), 'standard');
  assert.equal(maxAlternativeReadings('brief'), 1);
  assert.equal(maxAlternativeReadings('standard'), 2);
  assert.equal(maxAlternativeReadings('rich'), 2);
});

// ---- grounding check ----------------------------------------------------------------------------------------------------

test('grounding: a line must touch the dream; Hebrew prefixes and plural forms still match', () => {
  assert.ok(sharesContentWord('מה עולה כשחושבים על המטבח?', HOUSE));
  assert.ok(sharesContentWord('מה במדרגות מוכר לך?', 'עליתי במדרגה ארוכה'));
  assert.ok(sharesContentWord('What does the empty station bring up?', 'I stood at an empty train station'));
  assert.ok(!sharesContentWord('מה את חושבת על הים הכחול?', HOUSE));
  assert.ok(!sharesContentWord('Tell me about your childhood', 'I stood at an empty train station'));
  assert.ok(!sharesContentWord('', HOUSE));
});

// ---- the questions written for the dream ---------------------------------------------------------------------------------------

test('a good question passes; too long, not a question, several questions, diagnostic wording and an unrelated question are refused', () => {
  const grounding = [HOUSE, 'המטבח'];
  assert.deepEqual(findQuestionProblems('מה עולה כשחושבים על אמא במטבח שלא הסתכלה עליך?', grounding), []);
  assert.deepEqual(findQuestionProblems('', grounding), ['empty']);
  assert.ok(findQuestionProblems('אמא במטבח ' + 'מילה '.repeat(30) + '?', grounding).includes('too_long'));
  assert.ok(findQuestionProblems('ספרי לי על המטבח.', grounding).includes('not_a_question'));
  assert.ok(findQuestionProblems('מה המטבח? ומה המנורה?', grounding).includes('several_questions'));
  assert.ok(findQuestionProblems('האם המטבח מעיד על דיכאון?', grounding).includes('diagnostic'));
  assert.ok(findQuestionProblems('מה את חושבת על הים הכחול?', grounding).includes('not_grounded'));
});

test('sanitizing blanks the unusable questions (never rewrites them) and keeps the good ones in place', () => {
  const moments = ['אמא במטבח', 'המנורה הדולקת'];
  const kept = sanitizeDreamQuestions(
    {
      associationQuestions: ['מה עולה כשחושבים על אמא במטבח שלא הסתכלה עליך?', 'ספרי על הים'],
      linkQuestions: ['האם יש קשר בין אמא במטבח לחדר שלא הכרת?', ''],
    },
    moments,
    HOUSE,
  );
  assert.equal(kept.associationQuestions[0], 'מה עולה כשחושבים על אמא במטבח שלא הסתכלה עליך?');
  assert.equal(kept.associationQuestions[1], '', 'an unrelated question is blanked, so the fixed question is used');
  assert.equal(kept.linkQuestions[0], 'האם יש קשר בין אמא במטבח לחדר שלא הכרת?');
  assert.equal(kept.linkQuestions[1], '', 'no link question stays no link question');
});

test('raw questions are matched to their moment by number: a missing, repeated or out-of-range item blanks only that moment', () => {
  const ok = validateRawDreamQuestions({ questions: [{ moment: 1, associationQuestion: 'a', linkQuestion: '' }, { moment: 2, associationQuestion: 'b', linkQuestion: 'd' }] }, 2);
  assert.deepEqual(ok, { associationQuestions: ['a', 'b'], linkQuestions: ['', 'd'] });
  // moment 2 missing, moment 1 repeated (the first one wins), moment 9 and a non-object ignored, a non-string field ignored
  const messy = validateRawDreamQuestions(
    { questions: [{ moment: 1, associationQuestion: 'a', linkQuestion: 'x' }, { moment: 1, associationQuestion: 'again', linkQuestion: 'y' }, { moment: 9, associationQuestion: 'z', linkQuestion: 'z' }, 'nope', { moment: 3, associationQuestion: 5, linkQuestion: 'l' }], },
    3,
  );
  assert.deepEqual(messy, { associationQuestions: ['a', '', ''], linkQuestions: ['x', '', 'l'] });
  assert.equal(validateRawDreamQuestions({ questions: 'no' }, 2), null);
  assert.equal(validateRawDreamQuestions(null, 2), null);
});

test('the questions prompt asks only (no interpretation, no invention, no diagnosis, no "why") and carries the extracted structure', () => {
  const he = buildDreamQuestionsSystemPrompt('he', 'feminine');
  const en = buildDreamQuestionsSystemPrompt('en', 'neutral');
  for (const p of [he, en]) {
    assert.match(p, /Never invent a person, place, object, event, feeling or circumstance/);
    assert.match(p, /never explain or interpret the dream/i);
    assert.match(p, /no diagnosis/);
    assert.match(p, /not "why"/);
    assert.match(p, /empty string/);
    assert.match(p, /at most 24 words/);
  }
  assert.match(he, /HEBREW/);
  assert.match(he, /FEMININE/);
  assert.ok(!en.includes('HEBREW:'), 'no Hebrew instruction in the English prompt');
  const input = buildDreamQuestionsInput(
    HOUSE,
    ['אמא במטבח', 'המנורה הדולקת'],
    factsFromAnalysis(analysis({ summary: 'בית ילדות', relationships: [{ from: 'אמא', to: 'אני', relationship: 'לא מסתכלת' }], sequence: [{ order: 2, description: 'עליתי למעלה' }, { order: 1, description: 'נכנסתי לבית' }], unresolvedDetails: ['מי קרא בשמי'] })),
  );
  assert.match(input, /אמא → אני: לא מסתכלת/);
  const order = input.slice(input.indexOf('Order of events'));
  assert.ok(order.indexOf('נכנסתי לבית') < order.indexOf('עליתי למעלה'), 'events are given in order');
  assert.match(input, /מי קרא בשמי/);
  assert.match(input, /1\. אמא במטבח\n2\. המנורה הדולקת/);
});

test('the facts that arrive from the browser are bounded and typed', () => {
  const f = validateDreamQuestionFacts({ summary: 'x'.repeat(1000), relationships: Array(20).fill('r'), sequence: [1, 'ok'], unresolved: 'no', emotionalTone: 5 });
  assert.equal(f.summary.length, 400);
  assert.equal(f.relationships.length, 8);
  assert.deepEqual(f.sequence, ['ok']);
  assert.deepEqual(f.unresolved, []);
  assert.equal(f.emotionalTone, null);
  assert.deepEqual(validateDreamQuestionFacts('nope'), { summary: '', relationships: [], sequence: [], unresolved: [], emotionalTone: null });
});

// ---- the reflection input ---------------------------------------------------------------------------------------------------------

test('the reflection input now carries the structure that was extracted but never used, plus the depth', () => {
  const a = analysis({
    sourceText: HOUSE,
    relationships: [{ from: 'אמא', to: 'אני', relationship: 'לא מסתכלת' }],
    sequence: [{ order: 1, description: 'נכנסתי לבית' }, { order: 2, description: 'עליתי למעלה' }],
    unresolvedDetails: ['מי קרא בשמי'],
    objects: [{ name: 'כוס מים', description: null, explicit: true, confidence: 1 }],
  });
  const input = buildReflectionInput(a, 'אמא במטבח', 'הרגשתי שקופה', [], [], 'he');
  assert.match(input, /RELATIONSHIPS between people\/things: אמא -> אני: לא מסתכלת/);
  assert.match(input, /ORDER OF EVENTS: נכנסתי לבית > עליתי למעלה/);
  assert.match(input, /LEFT UNRESOLVED or ambiguous in the dream: מי קרא בשמי/);
  assert.match(input, /Named objects: כוס מים/);
  assert.match(input, /DEPTH: (brief|standard|rich)/);
  assert.ok(!input.includes('SECOND, OPTIONAL QUESTION'), 'nothing about the link question when it was not answered');
});

test('the link answer counts only together with its question; the asked question is passed so it is not repeated', () => {
  const a = analysis();
  const both = buildReflectionInput(a, 'התחנה', 'מחכה לתשובה', [], [], 'he', { associationQuestion: 'מה עולה על התחנה הריקה?', linkQuestion: 'יש קשר בין התחנה לרכבת?', linkResponse: 'אולי' });
  assert.match(both, /ALREADY ASKED|already asked; do not repeat it\): "מה עולה על התחנה הריקה\?"/);
  assert.match(both, /SECOND, OPTIONAL QUESTION THE DREAMER CHOSE TO ANSWER[^\n]*"יש קשר בין התחנה לרכבת\?"/);
  assert.match(both, /THEIR ANSWER \(their exact words\): "אולי"/);
  const skipped = buildReflectionInput(a, 'התחנה', 'מחכה לתשובה', [], [], 'he', { linkQuestion: 'יש קשר?' });
  assert.ok(!skipped.includes('SECOND, OPTIONAL QUESTION'), 'a question without an answer is never sent as if answered');
});

// ---- the reflection prompt and schema ---------------------------------------------------------------------------------------------------

test('the reflection prompt asks for readings and the existential angle only under strict conditions, and forbids padding', () => {
  const p = buildDreamReflectionSystemPrompt('en', 'neutral');
  assert.match(p, /ALTERNATIVE READINGS \(alternativeReadings\)/);
  assert.match(p, /brief = 0 or 1, standard = 1 or 2, rich = 2/);
  assert.match(p, /never rephrase the thread to fill the quota/);
  assert.match(p, /EXISTENTIAL PERSPECTIVE — first decide "existentialFit"/);
  assert.match(p, /Most dreams are "partial" or "none"/);
  assert.match(p, /No named philosophers or doctrines used as an authority/);
  assert.match(p, /no claim about the dreamer's life, beliefs or circumstances/);
  assert.match(p, /LENGTH\. The five main lines are shown one after another on a single screen/);
  assert.match(p, /observation at most 28 words/);
  assert.match(p, /possibleThread at most 38 words/);
  assert.match(p, /never invent personal circumstances/);
  assert.match(p, /Do not retell the dream and do not repeat the dreamer's association/);
  assert.match(p, /never repeat or rephrase either question the input says was already asked/);
  // the old safety rules are all still there
  assert.match(p, /NOT dream-dictionary interpretation. NOT diagnosis. NOT therapy/);
  assert.match(p, /"I don't know" is a completely valid answer/);
});

/** OpenAI strict structured outputs reject a schema unless every object lists all of its properties as required and forbids extras. */
function assertStrict(node: unknown, path: string): void {
  if (typeof node !== 'object' || node === null) return;
  const n = node as Record<string, unknown>;
  if (n.type === 'object' || (Array.isArray(n.type) && n.type.includes('object'))) {
    assert.equal(n.additionalProperties, false, `${path} must forbid additional properties`);
    const props = Object.keys((n.properties as object) ?? {}).sort();
    assert.deepEqual([...((n.required as string[]) ?? [])].sort(), props, `${path} must require every property`);
  }
  for (const [k, v] of Object.entries(n)) {
    if (Array.isArray(v)) v.forEach((x, i) => assertStrict(x, `${path}.${k}[${i}]`));
    else assertStrict(v, `${path}.${k}`);
  }
}

test('both JSON schemas satisfy the strict structured-output rules', () => {
  assertStrict(DREAM_REFLECTION_JSON_SCHEMA, 'reflection');
  assertStrict(DREAM_QUESTIONS_JSON_SCHEMA, 'questions');
  assert.ok((DREAM_REFLECTION_JSON_SCHEMA.required as readonly string[]).includes('alternativeReadings'));
  assert.ok((DREAM_REFLECTION_JSON_SCHEMA.required as readonly string[]).includes('existentialLens'));
});

function reflection(over: Partial<DreamReflectionResult> = {}): DreamReflectionResult {
  return {
    observation: 'o', personalAssociation: 'p', possibleThread: 'אולי המטבח הוא מקום של ציפייה.', continuityQuestion: 'q?',
    lenses: { cognitive: null, jungian: null, psychodynamic: null }, confidenceNotes: [], groundingStatement: 'g', ...over,
  };
}

test('a reflection saved before these parts existed is still valid, and malformed new parts are dropped rather than failing everything', () => {
  const old = validateDreamReflectionResult(reflection());
  assert.ok(old);
  assert.equal(old.alternativeReadings, null);
  assert.equal(old.existentialLens, null);
  const messy = validateDreamReflectionResult({ ...reflection(), alternativeReadings: [{ basis: 'x', reading: 'y' }, { basis: 1 }, 'z'], existentialLens: { basis: 'x' } });
  assert.ok(messy);
  assert.deepEqual(messy.alternativeReadings, [{ basis: 'x', reading: 'y' }]);
  assert.equal(messy.existentialLens, null);
});

test('readings and the existential angle are kept only when grounded, not diagnostic, different and within the depth limit', () => {
  const sources = [HOUSE, 'הרגשתי שקופה'];
  const r = reflection({
    alternativeReadings: [
      { basis: 'אמא לא הסתכלה', reading: 'ייתכן שזו כמיהה להיראות.' },
      { basis: 'אמא לא הסתכלה', reading: 'אולי זו התעלמות שאפשר להבין אחרת.' }, // same basis
      { basis: 'הים הכחול', reading: 'אולי הים מסמל חופש.' }, // not in the dream
      { basis: 'החדר שלא הכרתי', reading: 'אולי חדר לא מוכר מזמין לגלות.' },
      { basis: 'המנורה הדולקת', reading: 'אולי זה מעיד על דיכאון.' }, // diagnostic
    ],
    existentialLens: { basis: 'המים עד הקרסוליים', text: 'אפשר לשאול מה קורה כשהמקום המוכר מפסיק להתאים.' },
    existentialFit: 'clear',
  });
  const rich = finalizeReflectionExtras(r, 'rich', sources);
  assert.deepEqual(rich.alternativeReadings?.map((x) => x.basis), ['אמא לא הסתכלה', 'החדר שלא הכרתי']);
  assert.ok(rich.existentialLens);
  const brief = finalizeReflectionExtras(r, 'brief', sources);
  assert.equal(brief.alternativeReadings?.length, 1, 'a very short dream carries at most one extra reading');
  // an ungrounded or diagnostic existential angle is dropped, a duplicate of the thread is dropped
  assert.equal(finalizeReflectionExtras(reflection({ existentialFit: 'clear', existentialLens: { basis: 'הים הכחול', text: 'מה משמעות הזמן?' } }), 'rich', sources).existentialLens, null);
  assert.equal(finalizeReflectionExtras(reflection({ existentialFit: 'clear', existentialLens: { basis: 'המטבח', text: 'זה מעיד על הפרעה.' } }), 'rich', sources).existentialLens, null);
  // the model's own verdict gates it: anything but "clear" drops the lens, and the verdict is never part of the delivered reflection
  const lens = { basis: 'המים עד הקרסוליים', text: 'אפשר לשאול מה קורה כשהמקום המוכר מפסיק להתאים.' };
  for (const fit of ['partial', 'none', undefined] as const) assert.equal(finalizeReflectionExtras(reflection({ existentialFit: fit, existentialLens: lens }), 'rich', sources).existentialLens, null, String(fit));
  const clear = finalizeReflectionExtras(reflection({ existentialFit: 'clear', existentialLens: lens }), 'rich', sources);
  assert.ok(clear.existentialLens);
  assert.ok(!('existentialFit' in clear), 'the verdict is internal');
  const dup = finalizeReflectionExtras(reflection({ alternativeReadings: [{ basis: 'המטבח', reading: 'אולי המטבח הוא מקום של ציפייה.' }] }), 'rich', sources);
  assert.deepEqual(dup.alternativeReadings, []);
  // a theory lens worded like a diagnosis is dropped; the others stay
  const lensed = finalizeReflectionExtras(reflection({ lenses: { cognitive: 'אולי זה משקף התמודדות עם לחץ.', jungian: 'עדשה סמלית זהירה.', psychodynamic: null } }), 'rich', sources);
  assert.equal(lensed.lenses.cognitive, null);
  assert.equal(lensed.lenses.jungian, 'עדשה סמלית זהירה.');
  // nothing else about the reflection changes
  assert.equal(rich.possibleThread, r.possibleThread);
  assert.equal(rich.continuityQuestion, r.continuityQuestion);
});

// ---- saving ------------------------------------------------------------------------------------------------------------------------------

test('the link question and answer are saved only when answered, and a dream saved without them is unchanged', () => {
  const base = { sourceText: 'x', inputMode: 'text' as const, dreamAnalysis: analysis(), dreamImageDataUrl: null, selectedElement: 'e', reflectionResponse: 'r', dreamReflection: reflection(), corrections: [] };
  const answered = buildSavedDream({ ...base, linkQuestion: 'יש קשר?', linkResponse: '  כן, קצת  ' });
  assert.equal(answered.linkQuestion, 'יש קשר?');
  assert.equal(answered.linkResponse, 'כן, קצת');
  for (const none of [{}, { linkQuestion: 'יש קשר?' }, { linkQuestion: 'יש קשר?', linkResponse: '   ' }, { linkResponse: 'כן' }]) {
    const saved = buildSavedDream({ ...base, ...none });
    assert.ok(!('linkQuestion' in saved) && !('linkResponse' in saved), 'nothing stored when the question was not answered');
  }
});

// ---- wiring ------------------------------------------------------------------------------------------------------------------------------

test('wiring: the questions share the existing endpoint (no new serverless function), run in the background, and fall back to the fixed question', () => {
  const labels = read('server/routes/dreamElementLabels.ts');
  assert.match(labels, /mode === 'questions'[\s\S]*handleDreamQuestions/);
  const hero = read('src/hero/HeroDream.tsx');
  assert.match(hero, /getDreamQuestions\(analysis, moments, analysisResult\.attemptId, journeyLanguage\)/);
  assert.match(hero, /setInsideStep\(linkQuestion \? 'link' : 'emotions'\)/);
  assert.match(hero, /if \(q\.status === 'ok'\) setDreamQuestions/);
  const ui = read('src/hero/DreamReflection.tsx');
  assert.match(ui, /associationQuestion \? writtenForDisplay\(associationQuestion\) : buildReflectionQuestion\(selectedElement, t\)/);
  assert.match(ui, /onSubmitLink\(''\)/);
  const route = read('server/routes/dreamQuestions.ts');
  assert.match(route, /reserveLabelsAttempt/);
  assert.match(route, /refundLabelsAttempt/);
  assert.match(route, /store: false/);
});

test('wiring: the reflection request carries the answers, and the money paths are not touched', () => {
  const route = read('server/routes/dreamReflection.ts');
  assert.match(route, /finalizeDeliveredReflection\(outcome\.value, \{ emotions, language, depth, dreamerText, summary: dreamAnalysis\.summary \}\)/);
  assert.match(route, /finalizeReflectionExtras\(accepted, p\.depth/);
  assert.match(route, /completeTrialAttempt/);
  const engine = read('src/hero/dreamReflectionEngine.ts');
  assert.match(engine, /linkResponse\?: string/);
  const labelsRoute = read('server/routes/dreamQuestions.ts');
  for (const forbidden of ['spendCredit', 'grow', 'payment', 'purchase']) assert.ok(!labelsRoute.toLowerCase().includes(forbidden), `questions route must not touch ${forbidden}`);
});

test('a link question must name the chosen moment AND something else from the dream; a vague one is blanked', () => {
  const moments = ['אמא במטבח', 'המנורה הדולקת'];
  const kept = sanitizeDreamQuestions(
    {
      associationQuestions: ['מה עולה כשחושבים על אמא במטבח?', 'מה עולה כשחושבים על המנורה הדולקת?'],
      linkQuestions: ['האם יש קשר בין אמא במטבח לבין החדר שלא הכרת?', 'בזמן שהמנורה דולקת, האם יש קשר בין הדברים?'],
    },
    moments,
    HOUSE,
  );
  assert.equal(kept.linkQuestions[0], 'האם יש קשר בין אמא במטבח לבין החדר שלא הכרת?');
  assert.equal(kept.linkQuestions[1], '', 'a question that names only one thing is not shown');
  assert.equal(namesBoth('Is there a link between the empty station and the weather?', 'empty station', 'I stood at an empty station. The train never came.'), false, 'the weather is not in the dream');
  assert.equal(namesBoth('Is there a link between the empty station and the train?', 'empty station', 'I stood at an empty station. The train never came.'), true);
});

test('the prompts forbid invented intentions, vague links and fixed meanings for objects', () => {
  const q = buildDreamQuestionsSystemPrompt('en', 'neutral');
  assert.match(q, /intention, plan or motive that the dream does not state/);
  assert.match(q, /BOTH things are named inside the question/);
  const r = buildDreamReflectionSystemPrompt('en', 'neutral');
  assert.match(r, /NEVER a fixed meaning for an object or image/);
});

test('a Hebrew gender slash form is caught deterministically (and ordinary slashes are not)', () => {
  assert.ok(findHebrewSlashForm(['הרגשת שאת/ה משאיר/ה דברים'], 'he'));
  assert.ok(findHebrewSlashForm(['משאיר/ה'], 'he'));
  assert.equal(findHebrewSlashForm(['ו/או עוד דבר, 24/7, ו-A/B'], 'he'), null);
  assert.equal(findHebrewSlashForm(['את/ה'], 'en'), null, 'only Hebrew output is checked');
});

test('regression: the internal existential verdict (Latin letters) is never mistaken for foreign script inside a Hebrew reflection', () => {
  const hebrew = reflection({ observation: 'עמדת בתחנה ריקה.', personalAssociation: 'אמרת שזה מזכיר המתנה.', possibleThread: 'ייתכן שיש כאן ציפייה.', continuityQuestion: 'מה מחכה לך עכשיו?', existentialFit: 'clear', existentialLens: { basis: 'תחנה ריקה', text: 'אפשר לשאול מה עושים בזמן ההמתנה.' } });
  assert.ok(!proseOf(hebrew).some((t) => /[a-z]/i.test(t)), 'no Latin letters in the prose that is checked');
  assert.equal(findScriptIntrusion(proseOf(hebrew), 'he', 'עמדתי בתחנה', { strictLatin: true }), null);
});

test('main lines that are far too long for the one-screen layout ask for a fresh response (nothing is cut), ordinary lengths do not', () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `מילה${i}`).join(' ');
  assert.equal(reflectionLengthNote(reflection({ observation: words(28), possibleThread: words(38), continuityQuestion: words(22) })), null);
  assert.equal(reflectionLengthNote(reflection({ observation: words(40), possibleThread: words(55) })), null, 'a little over is tolerated');
  assert.match(reflectionLengthNote(reflection({ possibleThread: words(70) })) ?? '', /too long for the screen/);
  assert.match(reflectionLengthNote(reflection({ summary: words(40) })) ?? '', /too long for the screen/);
});
