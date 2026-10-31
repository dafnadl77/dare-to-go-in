import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as X from '../src/hero/exploration';
import { buildReflectionInput, corrects, emphasizes, generateDreamReflection, pointsToHerLife } from '../server/routes/dreamReflection';
import { buildDreamReflectionSystemPrompt, DREAM_REFLECTION_JSON_SCHEMA } from '../src/hero/dreamReflectionSchema';
import { buildTurnSystemPrompt } from '../src/hero/conversationTurn';
import { reflectionContextFromJourney } from '../src/map/journeyRecord';
import { threadWords } from '../src/map/threadWords';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema';

/**
 * POLISHING THE REFLECTION (2026-10-31), after its second live run on the library-and-snow dream. No network and no AI: the saved journey
 * is replayed and the live result is kept beside it (tests/fixtures/library-snow-live-2026-10-30.json). What the live result got wrong:
 * the snow, which she said matters more, was left to a side note; the question assumed a link to her life ("איפה את פוגשת עכשיו…");
 * broken or clinical wording ("לחץ מלחיץ", "כמשהו תמונה", "מערך בלתי פתור"); a summary that said again what was already said.
 * These tests check what the model is now told and given; what a real model writes with it is NOT tested here.
 */

const read = (p: string) => readFileSync(p, 'utf8');
type Step = { step: string; her?: string; dare?: X.ConversationTurn; wholeView?: { overview: string } };
type Reflection = Record<string, unknown> & { lenses: Record<string, string | null>; summary: string; continuityQuestion: string; personalAssociation: string };
const fx = JSON.parse(read('tests/fixtures/library-snow-live-2026-10-30.json')) as { dream: string; analysis: DreamAnalysis; moments: { label: string; excerpt: string }[]; steps: Step[]; liveReflection20261031: { reflection: Reflection } };
const live = fx.liveReflection20261031.reflection;
const T0 = new Date('2026-10-31T09:00:00Z');

/** The live journey, replayed; `swap` replaces some of her answers (to try the same journey without them). */
function replay(swap: Record<string, string> = {}): X.Exploration {
  let e = X.createExploration('library', fx.moments.map((m) => ({ label: m.label, excerpt: m.excerpt })));
  for (const s of fx.steps) {
    const id = s.step.split(' ')[1];
    if (s.step.startsWith('open')) e = X.beginConversation(e, id, s.dare!, T0);
    else if (s.step.startsWith('say')) e = X.addDareTurn(X.addDreamerTurn(e, id, swap[s.her!] ?? s.her!), id, s.dare!);
    else if (s.step.startsWith('steer')) e = X.addDareTurn(X.steerWithReply(e, id, 'shift', threadWords('feminine').shift)!, id, s.dare!);
    else if (s.step.startsWith('leave')) e = X.completeConversation(e, id, T0);
    else if (s.step === 'whole view') {
      while (X.exploringId(e)) e = X.completeConversation(e, X.exploringId(e)!, T0);
      e = X.receiveWholeView(e, { kind: 'whole', notice: null, overview: s.wholeView!.overview, connections: [], recurring: null, contrast: null, readings: [], closingQuestion: '', invite: [] } as never, X.basedOnKey(e), T0);
    }
  }
  return e;
}
const SNOW_MATTERS = 'דווקא השלג נראה לי יותר חשוב. הוא ירד רק בחוץ, ובתוך הספרייה היה חם';
const WORK = 'קצת מזכיר תקופות של הגשות בעבודה. אבל בחלום זה הרגיש פחות לחץ ויותר סקרנות, כמו משחק';
const inputOf = (e: X.Exploration) => buildReflectionInput(fx.analysis, 'x', 'x', [], ['wonder', 'confusion'], 'he', reflectionContextFromJourney(e));
const lineOf = (input: string, start: string) => input.split('\n').find((l) => l.startsWith(start)) ?? '';

// ------------------------------------------------------------------------------------------------ 1. what matters to her

test('1. the snow leads: her "more important" is marked on its answer, in the snow moment, and named as what matters most', () => {
  const input = inputOf(replay());
  assert.match(input, /\[m2\][\s\S]*THE DREAMER answered \(their exact words\): "דווקא השלג נראה לי יותר חשוב\. הוא ירד רק בחוץ, ובתוך הספרייה היה חם" — THE DREAMER MARKED THIS AS MORE IMPORTANT/);
  assert.equal(lineOf(input, 'WHAT MATTERS MOST TO THE DREAMER'), `WHAT MATTERS MOST TO THE DREAMER (their own emphasis, give it matching weight): [m2] "${SNOW_MATTERS}"`);
  assert.equal((input.match(/MARKED THIS AS MORE IMPORTANT/g) ?? []).length, 1, 'nothing about the book is marked');
});

test('1. when she marked nothing, no order of importance is invented', () => {
  const input = inputOf(replay({ [SNOW_MATTERS]: 'השלג ירד רק בחוץ, ובתוך הספרייה היה חם' }));
  assert.match(lineOf(input, 'WHAT MATTERS MOST TO THE DREAMER'), /they did not say that anything matters more; do not invent an order of importance$/);
  assert.doesNotMatch(input, /MARKED THIS AS MORE IMPORTANT/);
});

test('1. what counts as her emphasis and as her correction: her own words only', () => {
  for (const yes of [SNOW_MATTERS, 'הכי חשוב לי היה השקט', 'בעיקר זכור לי האור', 'מה שהכי בלט זה החלון', 'The snow matters more to me', 'Above all, the door']) assert.ok(emphasizes(yes), yes);
  for (const no of ['הדפים היו צהבהבים', 'לא יודעת, זה פשוט היה יפה ושקט', 'It was quiet']) assert.ok(!emphasizes(no), no);
  for (const yes of ['לא בטוחה לגבי זיכרון. מה שאני כן זוכרת זה שהיה לי דחוף', 'בעצם זה היה בשלג', 'זה לא היה בספר', 'Actually, it was the snow', 'No, I meant the window']) assert.ok(corrects(yes), yes);
  for (const no of ['לא יודעת, זה פשוט היה יפה ושקט', 'לא זוכרת', 'הספר היה ישן', "I don't know"]) assert.ok(!corrects(no), no);
  const input = inputOf(replay());
  assert.match(input, /"לא בטוחה לגבי זיכרון\. מה שאני כן זוכרת זה שהיה לי דחוף להתחיל לכתוב בו, בגלל מה שהאישה אמרה" — THE DREAMER CORRECTED OR TURNED DOWN what DARE said before: use their version/);
  assert.match(buildDreamReflectionSystemPrompt('he', 'feminine'), /their correction always wins over DARE's earlier words/);
});

// ------------------------------------------------------------------------------------------------ 2. her own life

test('2. she tied the book moment to work: the question may refer to that only as she said it, never wider', () => {
  assert.equal(lineOf(inputOf(replay()), "THE DREAMER'S OWN LIFE"), `THE DREAMER'S OWN LIFE: they tied the dream to their life only in these words: [m1] "${WORK}". Refer to that link only as they said it, never wider`);
});

test('2. without that answer: no link to her life anywhere, and the question must not present one as given', () => {
  const line = lineOf(inputOf(replay({ [WORK]: 'בחלום זה הרגיש פחות לחץ ויותר סקרנות, כמו משחק' })), "THE DREAMER'S OWN LIFE");
  assert.match(line, /they did not tie the dream to their life anywhere\. The continuity question must not present such a link as given: stay with the dream, or ask gently whether there is any link at all$/);
  for (const yes of [WORK, 'זה מזכיר לי את הבית של סבתא', 'It reminds me of my first job', 'like at work']) assert.ok(pointsToHerLife(yes), yes);
  for (const no of [SNOW_MATTERS, 'לא יודעת, זה פשוט היה יפה ושקט', 'הדפים היו צהבהבים, כאילו הספר ישן מאוד', 'The room was dark']) assert.ok(!pointsToHerLife(no), no);
});

test('2. the instructions no longer ask the question to echo her life now (the line the live "איפה את פוגשת עכשיו…" followed)', () => {
  for (const lang of ['he', 'en'] as const) {
    const p = buildDreamReflectionSystemPrompt(lang, 'feminine');
    assert.match(p, /THEIR OWN LIFE: follow the input line about it/);
    assert.match(p, /never presumes a link \("Where in your life do you…", "איפה בחיים שלך…" presume one\)/);
  }
  const he = buildDreamReflectionSystemPrompt('he', 'feminine');
  assert.doesNotMatch(he, /asks how it may echo something in the dreamer's life now/);
  assert.match(he, /never presuming that the dream echoes something in their life now/);
  assert.match(live.continuityQuestion, /^איפה את פוגשת עכשיו/, 'the live question this round answers');
});

// ------------------------------------------------------------------------------------------------ 3. the wording

test('3. each flaw of the live result is named in the instructions, with the right spelling, and the same care in English', () => {
  const text = JSON.stringify(live);
  const he = buildDreamReflectionSystemPrompt('he', 'feminine');
  for (const flaw of ['לחץ מלחיץ', 'כמשהו תמונה', 'מערך בלתי פתור', 'מבחינה קוגניטיבית']) {
    assert.ok(text.includes(flaw), `the live result had "${flaw}"`);
    assert.ok(he.includes(`"${flaw}"`), `the instructions name "${flaw}"`);
  }
  assert.match(text, /להכתב/);
  assert.match(he, /full spelling \("להיכתב", "דינמית"\)/);
  assert.match(he, /a lens never opens with its own name/);
  assert.match(buildDreamReflectionSystemPrompt('en', 'neutral'), /The same care in English: plain, precise, idiomatic, no doubled words, no jargon \("unresolved complex", "from a cognitive standpoint"\)/);
});

test('3. the three lenses stay: the screen and the result keep their shape', () => {
  const props = DREAM_REFLECTION_JSON_SCHEMA.properties as Record<string, { required?: string[] }>;
  assert.deepEqual(props.lenses.required, ['cognitive', 'jungian', 'psychodynamic']);
  assert.deepEqual(Object.keys(live.lenses).sort(), ['cognitive', 'jungian', 'psychodynamic']);
});

// ------------------------------------------------------------------------------------------------ 4. summary and reflection apart

test('4. the summary is short and faithful, the rest is a new angle; the whole view she read is there to avoid', () => {
  for (const lang of ['he', 'en'] as const) {
    const p = buildDreamReflectionSystemPrompt(lang, 'feminine');
    assert.match(p, /SUMMARY AND REFLECTION ARE TWO THINGS: the SUMMARY is short and faithful: what happened in the dream and what the dreamer said, nothing interpreted, and not the words of the PERSONAL ASSOCIATION or of the whole view again/);
    assert.match(p, /offers a NEW possible angle, marked as a possibility; none of it is presented as something the dreamer said/);
  }
  const input = inputOf(replay());
  assert.match(input, /THE WHOLE VIEW THE DREAMER ALREADY READ ON THE MAP \(never repeat it, not even in other words; add what it did not say\): "הרגשת מוזרות/);
  // the live summary said again what the personal association had just said (urgency and curiosity): the case the rule is for
  assert.match(live.summary, /דחיפות/);
  assert.match(live.personalAssociation, /דחוף/);
});

test('4. the whole view gives more room to what she said matters, and invents no order', () => {
  assert.match(buildTurnSystemPrompt('he', 'feminine'), /If she said one moment or detail matters more to her, give it more room than the others; never invent an order of importance/);
});

test('4. with the stub: one call; the model reads the new rules and the lines about what matters to her and her life', async () => {
  const seen: { instructions: string; input: string }[] = [];
  const client = { responses: { create: async (req: { instructions: string; input: string }) => (seen.push(req), { model: 'stub', output_text: JSON.stringify({ ...live, existentialFit: 'none', existentialLens: null, alternativeReadings: [], continuityQuestion: 'מה עוד זכור לך מהשלג שירד רק בחוץ?', lenses: { cognitive: null, jungian: null, psychodynamic: null } }), usage: { input_tokens: 0, output_tokens: 0 } }) } } as never;
  const out = await generateDreamReflection(client, { input: inputOf(replay()), language: 'he', addressPreference: 'feminine', dreamerText: fx.dream, emotions: ['wonder', 'confusion'] });
  assert.equal(seen.length, 1);
  assert.equal(out.status, 'ok');
  assert.match(seen[0].instructions, /WHAT MATTERS TO THE DREAMER \(2026-10-31\)/);
  assert.match(seen[0].input, /WHAT MATTERS MOST TO THE DREAMER[^\n]*השלג/);
  assert.match(seen[0].input, /THE DREAMER'S OWN LIFE: they tied the dream to their life only in these words/);
});

test('4. the journey before the map reads exactly as it did (none of these lines without the map)', () => {
  const legacy = buildReflectionInput(fx.analysis, 'ספר', 'השם שלי', [], [], 'he');
  assert.doesNotMatch(legacy, /WHAT MATTERS MOST|THE DREAMER'S OWN LIFE/);
});
