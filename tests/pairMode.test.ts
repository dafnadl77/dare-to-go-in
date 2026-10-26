import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { segmentDream } from '../src/hero/dreamSegments';
import {
  choosePair,
  conversationalClosing,
  listeningWhole,
  locateQuote,
  oneReflection,
  pairAllowedHere,
  pairAnswerReflection,
  pairQuestionProblems,
  safePairQuestion,
  verifyPair,
  type PairCandidate,
  type PairSources,
} from '../src/hero/pairCheck';

/**
 * DOC 90 v3, step 3 (local build): "two details and a question" instead of a finished insight. Every case below is a real output of
 * the saved acceptance run acc2-1 (docs/upgrade-2026-10/33-stage3b-fix-eval-acc2-1.json): the model's anchors as it wrote them, the
 * answers, the whole views. The rules are hers (doc 90 v3 and the notes of 2026-10-23); a pair is never stated as a link.
 */

const run = JSON.parse(readFileSync('docs/upgrade-2026-10/33-stage3b-fix-eval-acc2-1.json', 'utf8'));
const dreams = JSON.parse(readFileSync('docs/upgrade-2026-10/74-acceptance-dreams-2.json', 'utf8')) as { key: string; text: string; address: string }[];
const HALL = dreams[0].text;
const STORE = dreams[1].text;
const BALCONY = dreams[2].text;

/** The parts of a dream whose text holds every one of `bits`. */
function partsOf(text: string, ...bits: string[]): number[] {
  const segs = segmentDream(text);
  return segs.filter((s) => bits.some((b) => s.text.includes(b) || b.includes(s.text))).map((s) => s.id);
}
function sources(text: string, momentBits: string[], answers: string[], address: PairSources['address'] = 'masculine'): PairSources {
  return { language: 'he', sourceText: text, segments: segmentDream(text), allowed: partsOf(text, ...momentBits), answers, address };
}
const pair = (a: [string, 'dream' | 'answer'], b: [string, 'dream' | 'answer'], relation: PairCandidate['relation'], question = 'מה אתה רואה כשהם עומדים יחד?'): PairCandidate => ({
  a: { quote: a[0], from: a[1] },
  b: { quote: b[0], from: b[1] },
  relation,
  question,
});

const STORE_LEAVE_ANSWER = run.journeys[1].steps[2].answer as string; // "הדבר הכי מפתיע היה שהבנתי שאני מחפש משהו, אבל בעצם ידעתי כבר…"
const storeLeave = () => sources(STORE, ['אני יוצא מהחנות בלי כלום ביד'], [STORE_LEAVE_ANSWER]);

// ------------------------------------------------------------------------------------------------ exact quotes, the dream's own words

test('real #31: the best candidate of the whole run is shown, in the dream\'s own words and tense ("יצאת" is "אני יוצא")', () => {
  const v = verifyPair(pair(['יצאת מהחנות בלי כלום ביד', 'dream'], ['אבל בעצם ידעתי כבר מה אני צריך', 'answer'], 'negation'), storeLeave());
  assert.deepEqual(v.reasons, []);
  assert.ok(v.pair);
  assert.equal(v.pair.a.quote, 'אני יוצא מהחנות בלי כלום ביד');
  assert.equal(v.pair.b.quote, 'בעצם ידעתי כבר מה אני צריך', 'a leading "אבל" is not part of the detail');
});

test('a quote is found only as written: another word, or a cut negation, is not the same quote', () => {
  assert.equal(locateQuote('יצאת מהחנות עם כלום ביד', STORE), null);
  assert.equal(locateQuote('מוצא את המידה הנכונה', STORE), null, '"ולא מוצא" cut after its negation says the opposite');
  assert.equal(locateQuote('ידעת כבר מה אתה צריך', STORE_LEAVE_ANSWER), 'ידעתי כבר מה אני צריך');
});

// ------------------------------------------------------------------------------------------------ what is never a pair

test('real #31: two pieces of one sentence of his answer are a link he made himself, not a pair', () => {
  const v = verifyPair(pair(['הבנתי שאני מחפש משהו', 'answer'], ['אבל בעצם ידעתי כבר מה אני צריך', 'answer'], 'negation'), storeLeave());
  assert.equal(v.pair, null);
  assert.ok(v.reasons.some((r) => /made herself/.test(r)), v.reasons.join(' | '));
});

test('real #32: a detail of another moment is not a detail of this one (the box belongs to "המוכר עם הקופסה")', () => {
  const v = verifyPair(pair(['קופסה מלאה ברגים', 'dream'], ['יצאת מהחנות בלי כלום ביד', 'dream'], 'negation'), storeLeave());
  assert.equal(v.pair, null);
  assert.ok(v.reasons.some((r) => /not in this moment/.test(r)), v.reasons.join(' | '));
});

test('real #46: "השמיים היו ורודים" and "לא רציתי לזוז משם" are one sentence of the dream: the dream already says it', () => {
  const s = sources(BALCONY, ['השמיים היו ורודים', 'ולא רציתי לזוז משם'], [run.journeys[2].steps[1].answer], 'feminine');
  const v = verifyPair(pair(['השמיים היו ורודים', 'dream'], ['לא רצית לזוז משם', 'dream'], 'negation', 'מה את רואה כשהם עומדים יחד?'), s);
  assert.equal(v.pair, null);
  assert.ok(v.reasons.some((r) => /one sentence/.test(r)), v.reasons.join(' | '));
});

test('the hall (dictated, no full stop): wanting to go up and the legs that could not are one breath of the dream, not a pair', () => {
  const s = sources(HALL, ['ואני רציתי לעלות למעלה לסיפון', 'המדרגות היו צרות', 'והרגליים שלי לא הצליחו'], [run.journeys[0].steps[0].answer], 'feminine');
  const v = verifyPair(pair(['רציתי לעלות למעלה לסיפון לראות לאן אנחנו שטים', 'dream'], ['והרגליים שלי לא הצליחו לעלות אפילו מדרגה אחת', 'dream'], 'wanted-not-managed', 'מה את רואה כשהם עומדים יחד?'), s);
  assert.equal(v.pair, null);
  assert.ok(v.reasons.some((r) => /one sentence/.test(r)), v.reasons.join(' | '));
});

test('real #8 (her decision after doc 91): a repeated word is never a basis — "ישבה" / "יושבת" is not one of the three relations', () => {
  const s = sources(HALL, ['ונועה ישבה על ספסל'], [run.journeys[0].steps[1].answer], 'feminine');
  const asRepeat = verifyPair({ ...pair(['נועה ישבה על ספסל', 'dream'], ['אני מדמיינת את עצמי יושבת בסופו של מסע רוגע', 'answer'], 'negation'), relation: 'repeat' as never }, s);
  assert.equal(asRepeat.pair, null);
  assert.ok(asRepeat.reasons.some((r) => /not one of the three/.test(r)), asRepeat.reasons.join(' | '));
  // labelled a "negation" it still has none: the shared word does not make one
  const asNegation = verifyPair(pair(['נועה ישבה על ספסל', 'dream'], ['אני מדמיינת את עצמי יושבת בסופו של מסע רוגע', 'answer'], 'negation'), s);
  assert.equal(asNegation.pair, null);
});

test('a detail is one detail: a run of clauses ("ישבה… ואכלה… ולא הסתכלה") is not', () => {
  const s = sources(HALL, ['ונועה ישבה על ספסל'], [run.journeys[0].steps[1].answer], 'feminine');
  const v = verifyPair(pair(['נועה ישבה על ספסל ואכלה תפוז ולא הסתכלה עליי', 'dream'], ['אני מדמיינת את עצמי יושבת בסופו של מסע רוגע', 'answer'], 'negation'), s);
  assert.equal(v.pair, null);
  assert.ok(v.reasons.some((r) => /one detail/.test(r)), v.reasons.join(' | '));
});

test('real #11: "הבנת שזה בעצם אונייה" does not say anything changed, and she already joined change and surprise herself', () => {
  const s = sources(HALL, ['ופתאום הבנתי שזה בעצם אונייה גדולה'], [run.journeys[0].steps[2].answer], 'feminine');
  const v = verifyPair(pair(['הבנת שזה בעצם אונייה גדולה', 'dream'], ['דברים יכולים להשתנות ולפתע להראות אחרת', 'answer'], 'change'), s);
  assert.equal(v.pair, null);
  assert.ok(v.reasons.some((r) => /does not say .*changed/.test(r)), v.reasons.join(' | '));
});

test('a negation must be on ONE side: real #25 ("לא היה מה שהייתי צריך" / "לא מוצא") has it on both', () => {
  const s = sources(STORE, ['מושיט לי קופסה מלאה ברגים', 'ואני מחפש ומחפש ולא מוצא את המידה הנכונה'], ['היו שם סוגים שונים, אבל אף אחד מהם לא היה מה שהייתי צריך באמת.']);
  const v = verifyPair(pair(['אף אחד מהם לא היה מה שהייתי צריך באמת', 'answer'], ['ואני מחפש ומחפש ולא מוצא את המידה הנכונה', 'dream'], 'negation'), s);
  assert.equal(v.pair, null);
  assert.ok(v.reasons.some((r) => /both sides|one side/.test(r)), v.reasons.join(' | '));
});

// ------------------------------------------------------------------------------------------------ what is allowed

test('her emphasis (2026-10-23): two different images are not refused for that — real #41, an unfamiliar place and a calming sound', () => {
  const s = sources(BALCONY, ['ישבתי על מרפסת של דירה שלא הכרתי', 'ומישהו בחדר הסמוך'], [run.journeys[2].steps[0].answer], 'feminine');
  const v = verifyPair(pair(['ישבתי על מרפסת של דירה שלא הכרתי', 'dream'], ['הצליל היה מאוד מרגיע', 'answer'], 'negation', 'מה את רואה כשהם עומדים יחד?'), s);
  assert.deepEqual(v.reasons, []);
  assert.equal(v.pair?.differentImages, true, 'marked as different images: shown only as an open question');
});

test('real #18: "המוכר כבר לא איש אלא עץ" says it changed', () => {
  const s = sources(STORE, ['המוכר כבר לא איש אלא עץ זית קטן בתוך עציץ'], [run.journeys[1].steps[0].answer]);
  const v = verifyPair(pair(['המוכר כבר לא איש אלא עץ זית קטן בתוך עציץ', 'dream'], ['הוא נתן תחושה של שקט ושלווה', 'answer'], 'change'), s);
  assert.deepEqual(v.reasons, []);
});

// ------------------------------------------------------------------------------------------------ the question

test('the question is open and leads nowhere; a leading or presuming one is replaced by the plain one, never shown', () => {
  const s = sources(BALCONY, ['ישבתי על מרפסת של דירה שלא הכרתי'], [run.journeys[2].steps[0].answer], 'feminine');
  const ctx = { answers: s.answers };
  assert.deepEqual(pairQuestionProblems('מה את רואה כשהם עומדים יחד?', ctx), []);
  assert.ok(pairQuestionProblems('מה ההבדל בעינייך בין השניים?', ctx).length > 0, 'names the answer (a difference)');
  assert.ok(pairQuestionProblems('האם יש קשר בין השניים?', ctx).length > 0, 'yes/no, and says "a link"');
  assert.ok(pairQuestionProblems('מה הפחד שעולה כשהם עומדים יחד?', ctx).length > 0, 'a feeling she did not say');
  assert.ok(pairQuestionProblems('מה הפתיע אותך כשהם עומדים יחד?', ctx).length > 0, 'a surprise she did not say');
  assert.ok(pairQuestionProblems('אולי הם מתחברים?', ctx).length > 0);
  const v = verifyPair(pair(['ישבתי על מרפסת של דירה שלא הכרתי', 'dream'], ['הצליל היה מאוד מרגיע', 'answer'], 'negation', 'מה ההבדל בעינייך בין השניים?'), s);
  assert.equal(v.pair?.question, safePairQuestion('he', 'feminine'));
  assert.equal(safePairQuestion('he', 'masculine'), 'מה אתה רואה כשהם עומדים יחד?');
});

test('real #30–#32: of three candidates the one that passes is chosen, the same way every time', () => {
  const s = storeLeave();
  const cands = [
    pair(['הרגשתי חוסר ומוזרות', 'answer'], ['יצאת מהחנות בלי כלום ביד', 'dream'], 'negation'),
    pair(['קופסה מלאה ברגים', 'dream'], ['יצאת מהחנות בלי כלום ביד', 'dream'], 'negation'),
    pair(['יצאת מהחנות בלי כלום ביד', 'dream'], ['אבל בעצם ידעתי כבר מה אני צריך', 'answer'], 'negation'),
  ];
  const a = choosePair(cands, s);
  const b = choosePair(cands, s);
  assert.equal(a.index, b.index);
  assert.equal(a.index, 2, JSON.stringify(a.verdicts.map((v) => v.reasons)));
  assert.ok(a.pair && [a.pair.a.quote, a.pair.b.quote].includes('בעצם ידעתי כבר מה אני צריך'));
  // "חוסר" and "בלי כלום" both say something is missing: absence on both sides is the same thing twice, not a tension ("חוסר X" is her "לא X", doc 76)
  assert.ok(a.verdicts[0].reasons.some((r) => /both sides/.test(r)), a.verdicts[0].reasons.join(' | '));
});

// ------------------------------------------------------------------------------------------------ pacing

test('pacing: the first moment listens; never two moments in a row; never after "I don\'t know", a few words, or a sensitive moment', () => {
  const long = 'הבנתי שאני מחפש משהו, אבל בעצם ידעתי כבר מה אני צריך.';
  const ok = { priorPairs: [false, false], answer: long, momentText: 'אני יוצא מהחנות בלי כלום ביד', refreshing: false };
  assert.equal(pairAllowedHere(ok).allowed, true);
  assert.equal(pairAllowedHere({ ...ok, priorPairs: [] }).allowed, false, 'first moment');
  assert.equal(pairAllowedHere({ ...ok, priorPairs: [false, true] }).allowed, false, 'a pair in the moment before');
  assert.equal(pairAllowedHere({ ...ok, priorPairs: [true, false, true, false] }).allowed, false, 'at most two in a journey');
  assert.equal(pairAllowedHere({ ...ok, answer: 'לא יודע.' }).allowed, false);
  assert.equal(pairAllowedHere({ ...ok, answer: 'מגוון הברגים.' }).allowed, false, 'a few words');
  assert.equal(pairAllowedHere({ ...ok, momentText: 'אבא שלי שכב בבית החולים' }).allowed, false, 'sensitive');
  assert.equal(pairAllowedHere({ ...ok, refreshing: true }).allowed, false, 'after her answer to a pair: only a reflection');
});

test('replay finding (doc 95): "באמת" is not a sensitive word — the real box answer was wrongly kept from a pair', () => {
  const box = 'הפרט שהכי תפס את העין שלי היה מגוון הברגים. היו שם סוגים שונים, אבל אף אחד מהם לא היה מה שהייתי צריך באמת.';
  assert.equal(pairAllowedHere({ priorPairs: [false], answer: box, momentText: 'המוכר מושיט לי קופסה מלאה ברגים', refreshing: false }).allowed, true);
  assert.equal(pairAllowedHere({ priorPairs: [false], answer: 'ראיתי שהוא מת ולא יכולתי לעשות כלום.', momentText: 'x', refreshing: false }).allowed, false);
});

// ------------------------------------------------------------------------------------------------ the reflection

test('one short reflection; with a pair it does not say the pair first (real store moment 3)', () => {
  const real = run.journeys[1].steps[2].insight.reflection as string; // two "אמרת ש…" sentences
  assert.equal((real.match(/אמרת/g) ?? []).length, 2);
  const withPair = oneReflection(real, { a: { quote: 'אני יוצא מהחנות בלי כלום ביד', from: 'dream' }, b: { quote: 'בעצם ידעתי כבר מה אני צריך', from: 'answer' } });
  assert.equal(withPair, 'אמרת שהרגשת חוסר ומוזרות.');
  const alone = oneReflection(real, null);
  assert.equal((alone.match(/אמרת/g) ?? []).length, 1);
});

test('her answer to the pair is given back by code, in one sentence, with no call', () => {
  const back = pairAnswerReflection('הרגשתי שאני יודע ולא לוקח.', 'masculine');
  assert.equal((back.match(/אמרת/g) ?? []).length, 1);
  assert.match(back, /הרגשת/);
  assert.match(pairAnswerReflection('אולי ידעתי, ופשוט לא לקחתי את זה.', 'masculine'), /אולי ידעתי, ופשוט לא לקחתי את זה/);
});

// ------------------------------------------------------------------------------------------------ the whole view

const shownStorePair = [{ a: { quote: 'אני יוצא מהחנות בלי כלום ביד', from: 'dream' as const }, b: { quote: 'בעצם ידעתי כבר מה אני צריך', from: 'answer' as const } }];
const wv = (j: number, k: number) => {
  const w = run.journeys[j].wholeViews[k];
  return { kind: w.kind, notice: w.notice, overview: w.overview, connections: w.connections ?? [], recurring: w.recurring ?? null, contrast: w.contrast ?? null, readings: w.readings ?? [], closingQuestion: w.closingQuestion, invite: w.invite ?? [] };
};
const closingCtx = (unexplored: string[], answers: string[]) => ({ language: 'he' as const, address: 'masculine' as const, unexplored, answers });

test('real whole views: no technical notice ("זו התבוננות ראשונה…", "עוד לא נמצא קשר…") is shown', () => {
  for (const [j, k] of [[0, 0], [1, 0], [2, 0]]) {
    const out = listeningWhole(wv(j, k), [], closingCtx([], ['הצליל היה מאוד מרגיע']));
    assert.equal(out.notice, null);
  }
});

test('real store whole view: a sentence that says again what the pair showed ("ידעת מה אתה צריך") is not shown', () => {
  const real = wv(1, 1);
  assert.match(real.overview, /ידעת מה אתה צריך/);
  const out = listeningWhole(real, shownStorePair, closingCtx(['בחנות כלי עבודה', 'אומר בשקט'], [STORE_LEAVE_ANSWER]));
  for (const part of [out.overview, out.recurring ?? '', out.contrast ?? '', out.closingQuestion, ...out.readings.map((r) => r.reading)]) assert.doesNotMatch(part, /ידעת\S* (כבר )?מה את\S* צריך/);
});

test('her note: a closing is a person continuing the talk, not a questionnaire — real "…מזכיר לך, אם בכלל?" closings are replaced', () => {
  for (const [j, k] of [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]]) {
    const out = listeningWhole(wv(j, k), [], closingCtx(['אומר בשקט'], ['הצליל היה מאוד מרגיע']));
    assert.doesNotMatch(out.closingQuestion, /אם בכלל|מזכיר|מה עוד עולה|משמעות|מסמל/, out.closingQuestion);
    assert.equal((out.closingQuestion.match(/\?/g) ?? []).length, 1, out.closingQuestion);
  }
  assert.match(conversationalClosing(closingCtx(['אומר בשקט'], [])), /«אומר בשקט»/, 'forward, to a moment not explored');
  assert.match(conversationalClosing(closingCtx([], ['הרגשתי כאילו אני במקום אינטימי ומיוחד'])), /\?$/);
});
