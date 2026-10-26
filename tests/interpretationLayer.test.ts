import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as I from '../src/hero/interpretationCheck.ts';
import * as C from '../src/hero/claimCheck.ts';
import * as S from '../src/hero/dreamSegments.ts';
import * as G from './fixtures/goldenSet.ts';

/**
 * THE INTERPRETATION LAYER, PHASE 2 (doc 50 v2, approved 2026-10-22 with three binding notes):
 *  1. level 3 is a quality aim, never a reason to manufacture depth: an accurate observation (level 2) is a good result;
 *  2. a possible (not factual) link is offered openly, never as a conclusion;
 *  3. a refusal for an unfounded claim (safety) is kept apart from a low rating for quality, naturalness or lack of novelty.
 * Written BEFORE the implementation and run first against the code without it (docs/upgrade-2026-10/52-phase2-tests-before.txt).
 * New functions are reached through namespace imports, so a missing one fails its own test.
 */

const api = I as unknown as Record<string, (...a: unknown[]) => any>;
const capi = C as unknown as Record<string, (...a: unknown[]) => any>;
const verdict = (e: G.Example, extra: Record<string, unknown> = {}) => api.verifyCandidate({ text: e.text, card: e.card ?? null }, G.sourcesOf(e.dream), extra);
const segOf = (k: G.DreamKey, piece: string) => S.segmentDream(G.DREAM[k]).filter((s) => piece.includes(s.text) || s.text.includes(piece)).map((s) => s.id);

// ------------------------------------------------------------------------------------------------ 1. safety: unfounded claims are refused

test('safety: every real output with a claim she never gave is refused (R1–R3, R6–R10)', () => {
  for (const e of G.R_UNSAFE) {
    const v = verdict(e);
    assert.equal(v.safety.ok, false, `${e.id} must be refused: ${e.text}`);
    assert.ok(v.safety.reasons.length > 0, e.id);
  }
});

test('safety: a psychological meaning is refused even with no "you" in the sentence, and "אולי" does not make it acceptable (R15–R20)', () => {
  for (const e of G.R_PSYCH) {
    for (const text of [e.text, `אולי ${e.text}`]) {
      const v = api.verifyCandidate({ text, card: null }, G.sourcesOf(e.dream), {});
      assert.equal(v.safety.ok, false, `${e.id}: ${text}`);
      assert.ok(v.safety.reasons.some((r: string) => /psycholog|meaning|message/i.test(r)), `${e.id} for the psychological meaning itself: ${v.safety.reasons.join('; ')}`);
    }
  }
});

test('safety: a cause is hers only when she gave a cause herself, not when its words are hers (R3 vs her own "זה גרם לי")', () => {
  assert.equal(verdict(G.R_UNSAFE.find((e) => e.id === 'R3')!).safety.ok, false);
  const own = api.verifyCandidate({ text: 'ייתכן שהכלב שהלך החוצה גרם לך להרגיש לא נוח, כמו שאמרת.', card: null }, G.sourcesOf('sealed3'), {});
  assert.equal(own.safety.ok, true, own.safety.reasons.join('; '));
});

// ------------------------------------------------------------------------------------------------ 2. the link itself must be founded, or offered openly

test('relation: anchors must be verbatim and at least two different details (one event is enough)', () => {
  const w13 = G.WRITTEN.find((e) => e.id === 'W13')!;
  assert.equal(verdict(w13).safety.ok, true, verdict(w13).safety.reasons.join('; '));
  const fake = { ...w13, card: { ...w13.card!, anchors: [{ quote: 'הכלב רץ קדימה מהר', from: 'dream' as const }, w13.card!.anchors[1]] } };
  assert.equal(verdict(fake).safety.ok, false, 'an anchor that is not in the dream');
  const single = { ...w13, card: { ...w13.card!, anchors: [w13.card!.anchors[0]] } };
  assert.equal(verdict(single).safety.ok, false, 'one anchor is not a link');
  const twice = { ...w13, card: { ...w13.card!, anchors: [w13.card!.anchors[0], w13.card!.anchors[0]] } };
  assert.equal(verdict(twice).safety.ok, false, 'the same anchor twice');
});

test('relation: a link stated as a fact must be in the anchors; a possible link is fine only when offered openly (her note 2)', () => {
  const w1 = G.WRITTEN.find((e) => e.id === 'W1')!;
  assert.equal(verdict(w1).safety.ok, true, verdict(w1).safety.reasons.join('; '));
  const asserted = { ...w1, text: w1.text.replace(/אולי יש קשר בין .*$/, 'שני הרגעים מדברים על אותו דבר.') };
  assert.equal(verdict(asserted).safety.ok, false, 'a possible link stated as a conclusion');
  const w11 = G.WRITTEN.find((e) => e.id === 'W11')!;
  const noShared = { ...w11, card: { ...w11.card!, anchors: [w11.card!.anchors[0], { quote: 'ולא הצלחתי לבכות למרות שרציתי', from: 'dream' as const }] } };
  assert.equal(verdict(noShared).safety.ok, false, '"repeat" with nothing repeated in the anchors');
});

// ------------------------------------------------------------------------------------------------ 3. quality is rated apart from safety (her note 3)

test('separation: an empty or echoing possibility is not "unsafe", it is rated level 0 and never shown as a possibility (R4, R5)', () => {
  for (const e of G.R_EMPTY) {
    const v = verdict(e, { exchanges: e.exchange ? [e.exchange] : [] });
    assert.equal(v.safety.ok, true, `${e.id} makes no unfounded claim: ${v.safety.reasons.join('; ')}`);
    assert.equal(v.quality.level, 0, `${e.id} level: ${v.quality.level} (${v.quality.notes.join('; ')})`);
  }
});

test('separation: therapy-like or artificial wording lowers the rating, it does not refuse', () => {
  const w10 = G.WRITTEN.find((e) => e.id === 'W10')!;
  const plain = verdict(w10);
  const tone = verdict({ ...w10, text: w10.text.replace('אולי מה שבולט כאן', 'אולי מה שפותח כאן מרחב ובולט') });
  assert.equal(tone.safety.ok, true, tone.safety.reasons.join('; '));
  assert.ok(tone.quality.score < plain.quality.score, `${tone.quality.score} < ${plain.quality.score}`);
});

test('the written examples are safe and rated as doc 50 v2 rates them: six insights (3), three observations (2)', () => {
  for (const e of G.WRITTEN) {
    const v = verdict(e);
    assert.equal(v.safety.ok, true, `${e.id}: ${v.safety.reasons.join('; ')}`);
    assert.equal(v.quality.level, e.level, `${e.id} rated ${v.quality.level}, doc 50 says ${e.level} (${v.quality.notes.join('; ')})`);
  }
});

test('the good real outputs are safe and at least an observation (G1, G3); without a source card a sentence is never rated 3', () => {
  for (const e of G.G_REAL) {
    const v = verdict(e);
    assert.equal(v.safety.ok, true, `${e.id}: ${v.safety.reasons.join('; ')}`);
    assert.equal(v.quality.level, 2, `${e.id}: ${v.quality.level}`);
  }
});

test('choice: the better version is shown whatever the order, and a link inside one event is not ranked below a distant one (her note 5)', () => {
  for (const id of ['W3', 'W13']) {
    const now = G.WRITTEN.find((e) => e.id === id)!;
    const old = G.OLDER[id];
    const s = G.sourcesOf(now.dream);
    for (const order of [[old, now], [now, old]]) {
      const pick = api.selectPossibility(order.map((e) => ({ text: e.text, card: e.card })), s, {});
      assert.equal(order[pick.index].id, id, `${id}: picked ${order[pick.index]?.id}`);
    }
  }
  const w13 = verdict(G.WRITTEN.find((e) => e.id === 'W13')!);
  assert.ok(!w13.quality.notes.some((n: string) => /distan|far|רחוק/i.test(n)), 'no distance bonus or penalty');
});

test('choice: when the best candidate is only an echo, nothing is shown as a possibility (level 3 is never manufactured)', () => {
  const s = G.sourcesOf('acc3');
  const r5 = G.R_EMPTY.find((e) => e.id === 'R5')!;
  const pick = api.selectPossibility([{ text: r5.text, card: null }], s, { exchanges: [r5.exchange] });
  assert.equal(pick.index, null);
});

// ------------------------------------------------------------------------------------------------ 4. questions

const qctx = (k: G.DreamKey, moment: string, prior: { question: string; focus: string | null }[] = [], explored: number[] = []) => ({
  language: 'he' as const,
  segments: S.segmentDream(G.DREAM[k]),
  momentSegments: segOf(k, moment),
  answers: [],
  prior: prior.map((p) => ({ ...p, subject: null })),
  explored,
});

test('questions: the written questions and G2 pass every check of the moment', () => {
  for (const [id, q] of Object.entries(G.QUESTIONS)) {
    // W9 after the bus stop was explored, W14 after the gate was (in the sealed-3 run the gate was the next moment)
    const explored = id === 'W9' ? segOf('acc3', 'חיכיתי, ואף אוטובוס לא עצר') : id === 'W14' ? segOf('sealed3', 'ובגינה פתאום אני רואה שמישהו פתח את השער') : [];
    const v = C.verifyQuestion({ question: q.question, focus: q.focus, subject: '' }, qctx(q.dream, q.moment, [], explored) as never);
    assert.deepEqual(v.reasons, [], `${id}: ${q.question}`);
  }
  assert.deepEqual(C.verifyQuestion({ question: G.G2.question, focus: 'detail', subject: '' }, qctx(G.G2.dream, G.G2.moment) as never).reasons, []);
});

test('questions: a part of the dream that was already explored may be brought in; one that was not, may not', () => {
  const w9 = G.QUESTIONS.W9;
  assert.ok(C.verifyQuestion({ question: w9.question, focus: w9.focus, subject: '' }, qctx(w9.dream, w9.moment) as never).reasons.length > 0, 'the bus stop was not explored');
});

test('questions: "או איך" is two questions in one', () => {
  const r = C.verifyQuestion({ question: 'איך נראה הגג או איך הרגשת שם בזמן שתיקנת את האנטנה בלילה?', focus: 'detail', subject: '' }, qctx('acc2', 'הייתי על הגג של בניין משרדים בלילה ותיקנתי אנטנה עם מברג') as never).reasons;
  assert.ok(r.some((x) => /two questions/.test(x)), r.join('; '));
});

test('questions: a creative question that tests nothing ranks below the floor; one about what the dream leaves open does not (R21, R22, W2, W14)', () => {
  const quality = (q: { dream: G.DreamKey; moment: string; question: string }, prior: string[] = []) => api.questionQuality(q.question, { momentText: q.moment, prior });
  assert.ok(quality(G.R21).score < api.QUESTION_FLOOR, `R21 ${quality(G.R21).score}`);
  assert.ok(quality(G.QUESTIONS.W14).score >= api.QUESTION_FLOOR, `W14 ${quality(G.QUESTIONS.W14).score}`);
  assert.ok(quality(G.QUESTIONS.W2).score > quality(G.R22).score, `W2 ${quality(G.QUESTIONS.W2).score} > R22 ${quality(G.R22).score}`);
});

test('questions: the questionnaire of acc-3 (R13): the second and third "מה הדבר הראשון / התחושה הראשונה" rank below the floor', () => {
  const [a, b, c] = G.R13.sequence;
  assert.ok(api.questionQuality(a, { momentText: '', prior: [] }).score >= api.QUESTION_FLOOR, 'the first one is fine');
  assert.ok(api.questionQuality(b, { momentText: '', prior: [a] }).score < api.QUESTION_FLOOR, b);
  assert.ok(api.questionQuality(c, { momentText: '', prior: [a, b] }).score < api.QUESTION_FLOOR, c);
});

test('questions: the kind of question is planned from the moment (a wish not done, a figure that speaks, a change, an open possibility)', () => {
  assert.equal(api.planQuestionFocus(G.QUESTIONS.W2.moment, []), 'feeling');
  assert.equal(api.planQuestionFocus(G.QUESTIONS.W6.moment, []), 'figure');
  assert.equal(api.planQuestionFocus('כשהסתכלתי על היד, המברג כבר היה מזלג עץ ארוך, כמו של מנגל', []), 'change');
  assert.equal(api.planQuestionFocus(G.QUESTIONS.W14.moment, []), 'whatif');
  assert.notEqual(api.planQuestionFocus('ישבתי בתחנת אוטובוס ליד הים, לפנות ערב', ['salience']), 'salience', 'not the same kind again');
});

// ------------------------------------------------------------------------------------------------ 5. moments

test('segmentation: in acc-1 the wish to apologise is its own part, the teacher\'s instruction keeps "לפני שהיא גומרת שורה"', () => {
  const parts = S.segmentDream(G.DREAM.acc1).map((s) => s.text);
  assert.ok(parts.some((p) => p.startsWith('רציתי להגיד לסבתא')), parts.join(' | '));
  assert.ok(parts.some((p) => p.includes('ואמרה לי') && p.includes('לפני שהיא גומרת שורה')), parts.join(' | '));
  assert.ok(parts.some((p) => p.startsWith('ניסיתי לשחות')), parts.join(' | '));
});

test('priority: a charged moment is offered early, but not a sensitive one (illness, death, injury)', () => {
  const groups = S.momentGroups(G.DREAM.acc1);
  const wish = groups.find((g) => g.text.includes('רציתי להגיד לסבתא'))!;
  const pool = groups.find((g) => g.text.includes('בבריכה העירונית'))!;
  assert.ok(wish && pool && wish.priority > pool.priority, `${wish?.priority} > ${pool?.priority}`);
  const plain = S.momentGroups('הייתי בחדר. רציתי להגיד לאבא שלי משהו אבל לא יצא לי קול.').find((g) => g.text.includes('רציתי'))!;
  const sensitive = S.momentGroups('הייתי בחדר. רציתי להגיד לאבא שלי בבית החולים משהו אבל לא יצא לי קול.').find((g) => g.text.includes('בבית החולים'))!;
  assert.ok(sensitive.priority < plain.priority, `${sensitive.priority} < ${plain.priority}`);
});

// ------------------------------------------------------------------------------------------------ 6. whole view

const wholeOf = (k: G.DreamKey): C.WholeSources => ({
  language: 'he',
  sourceText: G.DREAM[k],
  segments: S.segmentDream(G.DREAM[k]),
  explored: G.ANSWERS[k].map((a, i) => ({ id: `m${i + 1}`, label: `m${i + 1}`, segments: [i], answers: [a], question: 'q', insight: null })),
  unexplored: [],
  previous: null,
  maxReadings: 1,
});

test('whole view: a closing never quotes her word with its "ו" (R12), and the modest opening does not take words that described someone else', () => {
  assert.ok(!/«ו/.test(C.modestClosing(wholeOf('acc3'))), C.modestClosing(wholeOf('acc3')));
  const opening = C.modestOpening(wholeOf('acc2'));
  assert.ok(!/«ומבולבל»|«מופתע»|«מצחיק»/.test(opening), opening);
});

test('whole view: a reading that gives a psychological meaning is refused there too', () => {
  const s = G.sourcesOf('sealed2');
  assert.ok(C.verifyInterpretation('אולי החלום הזה עוסק בפרידה.', [], new Set(), s, { requireBasis: false }).length > 0);
  assert.ok(C.verifyInterpretation('ייתכן שהצעיף הוא החלק שבך שמחזיק בעבר.', [], new Set(), s, { requireBasis: false }).length > 0);
});

// ------------------------------------------------------------------------------------------------ 7. the insight as assembled

test('insight: among candidates with source cards the best is shown, not the first; with nothing worth showing, an inviting question instead', () => {
  const s = G.sourcesOf('sealed3');
  const w13 = G.WRITTEN.find((e) => e.id === 'W13')!;
  const old = G.OLDER.W13;
  const raw = { dream: [], user: [], possibilities: [old, w13].map((e) => ({ basis: [], text: e.text, card: e.card })), invitation: '' };
  const a = C.assembleReply(raw as never, s);
  assert.equal(a.insight.possibility, w13.text);
  const s3 = G.sourcesOf('acc3');
  const empty = { dream: [], user: [], possibilities: [{ basis: [], text: G.R_EMPTY[1].text }], invitation: G.QUESTIONS.W9.question };
  const b = C.assembleReply(empty as never, { ...s3, momentSegments: segOf('acc3', G.QUESTIONS.W9.moment), explored: segOf('acc3', 'חיכיתי, ואף אוטובוס לא עצר') } as never);
  assert.equal(b.insight.possibility, '');
  assert.equal((b.insight as unknown as { invitation?: string }).invitation, G.QUESTIONS.W9.question);
});

test('(after the fix) the root rule for a fixed meaning does not catch "סימנים" (traces), only the verbs and "סמל" (benchmark row 18)', () => {
  const s = G.sourcesOf('acc2');
  const has = (t: string) => C.verifyInterpretation(t, [], new Set(), s, { requireBasis: false }).some((r) => /fixed meaning/.test(r));
  assert.equal(has('אולי נשארו שם סימנים קטנים של מה שהיה.'), false);
  for (const t of ['אולי הידיים הכבדות מסמנות מצב קשה.', 'אולי המזלג מסמל משהו אחר.', 'אולי השעה היא סמל לזמן.', 'אולי יוסי סימל את הבעיה.']) assert.equal(has(t), true, t);
});

test('(after the fix) a feeling under a negation is not listed as hers ("לא הכניס לי ביטחון"), and a "what if" on a wish not done ranks below the direct question', () => {
  const opening = C.modestOpening({ language: 'he', sourceText: G.DREAM.acc2, segments: S.segmentDream(G.DREAM.acc2), explored: G.ANSWERS.acc2.map((a, i) => ({ id: `m${i + 1}`, label: `m${i + 1}`, segments: [i], answers: [a], question: 'q', insight: null })), unexplored: [], previous: null, maxReadings: 1 });
  assert.ok(!/ביטחון/.test(opening), opening);
  const r22 = api.questionQuality(G.R22.question, { momentText: G.R22.moment, prior: [] });
  const w2 = api.questionQuality(G.QUESTIONS.W2.question, { momentText: G.QUESTIONS.W2.moment, prior: [] });
  assert.ok(r22.score >= api.QUESTION_FLOOR && r22.score < w2.score, `${r22.score} < ${w2.score}`);
});
