import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as R from '../server/routes/dreamExploration.ts';
import * as X from '../src/hero/exploration.ts';
import { checkLabel } from '../src/hero/claimCheck.ts';
import { checkMomentTitle, weakEnglishTitle } from '../src/hero/momentTitle.ts';
import { attributionNote, unreportedAttribution } from '../src/hero/attribution.ts';
import { pickFallbackQuestion, fallbackReply } from '../src/hero/conversationTurn.ts';
import { stillUnverified } from '../src/hero/verifiedFallback.ts';
import { mapJourneyFrom } from '../src/map/journeyRecord.ts';
import { typedAnalysis } from '../src/demo/demoRouter.ts';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema.ts';

/**
 * THE THREE PROBLEMS OF THE LIVE TESTS OF 2026-11-15 (checked 2026-11-17). Fictional dreams only; the model is a stub: no network, no AI call.
 *   1. English moment titles: "said", "reading room found", "walking through a large" (a lone verb, a verb with no object, a phrase cut in the middle).
 *   2. The whole view turned her "it does not fit" into a claim about her feelings ("the child did not raise a sense of safety in you").
 *   3. The plain backup question was one fixed sentence: it came back in two moments, and "change direction" did not open another angle.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const T0 = new Date('2026-11-17T10:00:00Z');
const X_ = X as unknown as Record<string, any>;

// ------------------------------------------------------------------------------------------------ 1. English titles

const library = 'I was walking through a large library at night, and every book I touched turned warm like fresh bread. In the reading room I found a long table with one lit candle and a silver key lying beside it. A woman I did not know sat across from me and asked whether I had brought the map. I said no, and she smiled and opened a window, and the whole room slowly filled with the sound of the sea.';
const momentsOfLibrary = [
  'A woman I did not know sat across from me and asked whether I had brought the map',
  'I said no, and she smiled and opened a window, and the whole room slowly filled with the sound of the sea',
  'In the reading room I found a long table with one lit candle and a silver key lying beside it',
  'I was walking through a large library at night, and every book I touched turned warm like fresh bread',
];

test('1. the three weak English titles of the live run are never kept, whoever wrote them', () => {
  const [, said, reading, walking] = momentsOfLibrary;
  for (const [bad, moment] of [['said', said], ['reading room found', reading], ['walking through a large', walking]] as const) {
    assert.equal(weakEnglishTitle(bad, moment), true, `weak: ${bad}`);
    const kept = checkMomentTitle(bad, moment, [], library);
    assert.notEqual(kept, bad, `replaced: ${bad}`);
    assert.equal(weakEnglishTitle(kept, moment), false, `what replaces it is whole: ${kept}`);
    assert.ok(kept.split(/\s+/).length >= 2 && kept.split(/\s+/).length <= 5, kept);
  }
});

test('1. with no title from the model the title is the moment\'s own first whole noun phrase, never a clause cut at a word count', () => {
  const [, said, reading, walking] = momentsOfLibrary;
  assert.equal(checkMomentTitle('', walking, [], library), 'a large library');
  assert.equal(checkMomentTitle('', reading, [], library), 'the reading room');
  assert.equal(checkMomentTitle('', said, [], library), 'a window');
  assert.equal(checkMomentTitle('', 'I stood at the edge of a cliff and below me there was a city of lights.', []), 'the edge of a cliff');
  assert.equal(checkMomentTitle('', 'I found a small brass key in my coat pocket.', []), 'a small brass key');
  // the same in the journey's own starting point (the call for titles failed): every title is whole, none is a lone verb, and none repeats
  const analysis = { ...(typedAnalysis(library, true) as unknown as DreamAnalysis), sourceText: library };
  const e = mapJourneyFrom('attempt-en', analysis, null);
  const labels = e.moments.map((m) => m.label);
  assert.equal(new Set(labels.map((l) => l.toLowerCase())).size, labels.length, 'no two alike');
  for (const [i, label] of labels.entries()) assert.equal(weakEnglishTitle(label, e.moments[i].excerpt ?? ''), false, label);
});

test('1. a good title stays, and Hebrew titles are checked exactly as before', () => {
  assert.equal(checkMomentTitle('UNKNOWN WOMAN ASKS ABOUT MAP', momentsOfLibrary[0], [], library), 'UNKNOWN WOMAN ASKS ABOUT MAP');
  assert.equal(checkMomentTitle('The locked doors', 'I was walking through a large empty house and every door was locked.', []), 'The locked doors');
  assert.equal(weakEnglishTitle('הרכבת שלא הגיעה', 'הרכבת שלא הגיעה בסוף'), false, 'Hebrew is not judged by the English check');
  const he = 'בסוף התור נגמר, ואף אחד לא חזר לשבת מאחורי הקופה';
  for (const cand of ['סיום התור ללא קופאית', 'חיכיתי בתור', '']) assert.equal(checkMomentTitle(cand, he, [], he), checkLabel(cand, he, [], he), 'Hebrew goes through checkLabel unchanged');
  assert.equal(checkLabel('סיום התור ללא קופאית', 'בסוף התור נגמר, ואף אחד לא חזר לשבת מאחורי הקופה', [], 'בסוף התור נגמר, ואף אחד לא חזר לשבת מאחורי הקופה'), 'סיום התור ללא קופאית');
});

// ------------------------------------------------------------------------------------------------ 2. a rejection is not a claim about her

const child = {
  herWords: ['חיכיתי הרבה, בלי לדעת למה', 'הילד נראה רגוע, כאילו הוא יודע משהו שאני לא', 'זה לא מתאים לי'],
  sourceText: 'חיכיתי בתחנה ריקה. ילד קטן עמד לידי ושתק. הרכבת לא הגיעה.',
  language: 'he' as const,
};

test('2. what she turned down is not turned into a fact about what she felt', () => {
  const claim = 'הדמות של הילד לא העלתה בך תחושת ביטחון או ידיעה.';
  assert.ok(unreportedAttribution(claim, child), 'the live sentence');
  assert.ok(stillUnverified([claim], child), 'so a fresh answer is asked for, and if it still says it, it is not shown');
  assert.match(attributionNote([claim], child) ?? '', /never told/);
  for (const s of ['הילד לא עורר אצלך תחושת בטחון.', 'המקום לא יצר בך שום ביטחון.', 'השתיקה לא גרמה לך לפחד.'])
    assert.ok(unreportedAttribution(s, child), s);
  assert.ok(unreportedAttribution('The woman did not make you feel safe.', { herWords: ['She asked about the map.', 'It did not fit.'], sourceText: 'A woman sat across from me.', language: 'en' }));
  assert.ok(unreportedAttribution("The child didn't evoke a sense of trust in you.", { herWords: ['He was calm.'], sourceText: 'A child stood beside me.', language: 'en' }));
});

test('2. what she said, a possibility, a question and the dream\'s own events stay', () => {
  // she told it herself
  assert.equal(unreportedAttribution('הילד לא עורר בך ביטחון.', { ...child, herWords: [...child.herWords, 'לא הרגשתי ביטחון לידו'] }), null);
  // her own no to DARE's question makes the negated claim hers
  assert.equal(unreportedAttribution('הילד לא העלה בך תחושת ביטחון.', { ...child, answeredNo: ['האם הילד נתן לך תחושת ביטחון?'] }), null);
  assert.equal(unreportedAttribution('The woman did not make you feel safe.', { herWords: ['I did not feel safe with her.'], sourceText: 'A woman sat across from me.', language: 'en' }), null);
  // a possibility, a question
  assert.equal(unreportedAttribution('אולי הילד לא העלה בך תחושת ביטחון.', child), null);
  assert.equal(unreportedAttribution('האם הילד לא העלה בך תחושת ביטחון?', child), null);
  assert.equal(unreportedAttribution('Maybe the woman did not make you feel safe.', { herWords: ['She asked.'], sourceText: 'A woman sat across from me.', language: 'en' }), null);
  // what the dream itself says about a thing (no "you")
  assert.equal(unreportedAttribution('הילד לא הזיז את הרכבת, והרכבת לא הגיעה.', child), null);
  assert.equal(unreportedAttribution('הרכבת לא הגיעה ואף אחד לא אמר מילה.', child), null);
});

// ------------------------------------------------------------------------------------------------ 3. the plain question does not repeat

test('3. the backup question is never one already asked, and "change direction" opens another angle', () => {
  const first = pickFallbackQuestion('he', []);
  assert.equal(first, fallbackReply('he'), 'the first time it is the usual one');
  const second = pickFallbackQuestion('he', [first]);
  assert.notEqual(second, first, 'not twice in the journey');
  assert.notEqual(pickFallbackQuestion('he', [first, second]), second);
  // after "change direction" or "it does not fit": another angle, not the same kind of question again
  const steered = pickFallbackQuestion('he', [first], true);
  assert.notEqual(steered, first);
  assert.ok(!['מה בלט לך ברגע הזה?', 'מה הפתיע אותך ברגע הזה?'].includes(steered), steered);
  assert.match(steered, /פרט|סביב|לפני/);
  // every question is a question, neutral, and in its own language
  for (const lang of ['he', 'en'] as const) {
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      const q = pickFallbackQuestion(lang, seen, i % 3 === 2);
      assert.ok(q.endsWith('?'), q);
      assert.equal(lang === 'he' ? /[A-Za-z]/.test(q) : /[א-ת]/.test(q), false, q);
      if (i < 6) assert.ok(!seen.includes(q), `no repeat while unasked ones are left: ${q}`);
      seen.push(q);
    }
    assert.equal(pickFallbackQuestion(lang, ['What else comes to mind about this moment?', fallbackReply(lang)]) === '', false);
  }
  // all asked: the one asked longest ago, never a crash
  const all = Array.from({ length: 12 }, (_, i) => pickFallbackQuestion('en', Array.from({ length: i }, (_, j) => pickFallbackQuestion('en', [], false) + String(j))));
  assert.ok(all.every(Boolean));
  const asked: string[] = [];
  for (let i = 0; i < 20; i++) asked.push(pickFallbackQuestion('he', asked));
  assert.ok(asked.every((q) => q.endsWith('?')));
});

const analysisOf = (text: string) => ({ ...(typedAnalysis(text, true) as unknown as DreamAnalysis), sourceText: text });
const dream = 'חיכיתי בתחנה ריקה. ילד קטן עמד לידי ושתק. הרכבת לא הגיעה. אחר כך נכנסתי לחדר גדול עם שולחן ארוך.';
const seeds = [{ label: 'התחנה הריקה', excerpt: 'חיכיתי בתחנה ריקה. ילד קטן עמד לידי ושתק. הרכבת לא הגיעה.' }, { label: 'החדר הגדול', excerpt: 'אחר כך נכנסתי לחדר גדול עם שולחן ארוך.' }];

/** One real turn through the route with a model whose only sentence is a therapist's phrase (checkTurn removes it): the plain question takes its place. */
async function plainTurn(e: unknown, momentId: string) {
  const client = { responses: { create: async () => ({ model: 'stub', output_text: JSON.stringify({ reply: 'מה זה מעורר בך?', offer: '', anchors: [], facts: [], move: 'reflect' }), usage: { input_tokens: 0, output_tokens: 0 } }) } } as never;
  const res = await R.handleExploration('conversation-turn', { language: 'he', attemptId: (e as { attemptId: string }).attemptId, dreamAnalysis: analysisOf(dream), exploration: e, momentId }, {}, {
    ...R.realExplorationDeps,
    moderate: async () => ({ status: 'ok' as const, hit: false }),
    resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: 'u' } }) as never,
    openai: () => client,
    rateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }) as never,
    reserveMoment: async () => 'reserved',
    refundMoment: async () => {},
    address: async () => 'masculine',
  });
  return res as unknown as { status: number; body?: { turn?: { text: string; offer?: string } }; data?: { turn?: { text: string; offer?: string } } };
}
const textOf = (res: Awaited<ReturnType<typeof plainTurn>>) => {
  const turn = (res.body ?? res.data)?.turn;
  return `${turn?.text ?? ''} ${turn?.offer ?? ''}`.trim();
};

test('3. through the route: the same plain question does not come back in a second moment, nor after "change direction"', async () => {
  let e = X.createExploration('quality-1117', seeds) as unknown;
  e = X_.beginConversation(e, 'm1', { role: 'dare', text: 'מה ראית כשהגעת לתחנה?', move: 'ask' }, T0);
  e = X_.addDreamerTurn(e, 'm1', 'תחנה ריקה, אף אחד');
  const one = await plainTurn(e, 'm1');
  assert.equal(one.status, 200, JSON.stringify(one).slice(0, 300));
  const q1 = textOf(one);
  assert.ok(q1.includes(fallbackReply('he')), `the first plain question is the usual one: ${q1}`);
  // the journey keeps that turn; another moment, the same kind of failure
  e = X_.addDareTurn(e, 'm1', { role: 'dare', text: q1, move: 'reflect' });
  e = X_.completeConversation(e, 'm1', T0);
  e = X_.beginConversation(e, 'm2', { role: 'dare', text: 'מה בלט לך בחדר?', move: 'ask' }, T0);
  e = X_.addDreamerTurn(e, 'm2', 'השולחן היה ארוך מאוד');
  const two = await plainTurn(e, 'm2');
  assert.equal(two.status, 200, JSON.stringify(two).slice(0, 300));
  const q2 = textOf(two);
  assert.ok(!q2.includes(fallbackReply('he')), `not the same question in the second moment: ${q2}`);
  assert.match(q2, /\?$/);
});

test('3. the route uses the rotating question everywhere the plain one was used for a turn, and the whole view keeps its own line', () => {
  const route = read('server/routes/dreamExploration.ts');
  assert.match(route, /pickFallbackQuestion\(ctx\.language, askedHere/);
  assert.match(route, /signals\.steer === 'shift' \|\| signals\.rejectedNow/);
  assert.equal((route.match(/\$\{freshQuestion\(\)\}/g) ?? []).length, 2, 'the ending question of a turn, in the offer and in the text');
  assert.match(route, /fallbackSummaryLine\(ctx\.language\)/, 'the whole view keeps its own plain line');
  assert.match(route, /otherQuestion:/, 'a moment question already asked is not asked again');
});

test('3. through the route: after "change direction" the plain question opens another angle', async () => {
  let e = X.createExploration('quality-1117b', seeds) as unknown;
  e = X_.beginConversation(e, 'm1', { role: 'dare', text: 'מה ראית כשהגעת לתחנה?', move: 'ask' }, T0);
  e = X_.addDreamerTurn(e, 'm1', 'תחנה ריקה, אף אחד');
  e = X_.addDareTurn(e, 'm1', { role: 'dare', text: fallbackReply('he'), move: 'reflect' });
  const steered = X_.steerWithReply(e, 'm1', 'shift');
  assert.ok(steered, 'the direction button is allowed here');
  const res = await plainTurn(steered, 'm1');
  assert.equal(res.status, 200, JSON.stringify(res).slice(0, 300));
  const q = textOf(res);
  assert.ok(!q.includes(fallbackReply('he')), q);
  assert.match(q, /פרט|סביב|לפני/, `another angle, not the same kind of question: ${q}`);
});
