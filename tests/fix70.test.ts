import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from '../src/hero/explorationSchema.ts';
import * as I from '../src/hero/interpretationCheck.ts';
import * as C from '../src/hero/claimCheck.ts';
import { segmentDream } from '../src/hero/dreamSegments.ts';

/**
 * THE FIX ROUND OF doc 70 (after the development run p4dev-1). Written BEFORE the fixes and run first against the code as it was
 * (docs/upgrade-2026-10/71-fix70-tests-before.txt). Every case is a real response of the model in that run (the run keeps them all):
 * sound links must pass, unfounded claims must still be refused, and the whole view must not fall to a factual summary for a false reason.
 */

const RUN = JSON.parse(readFileSync(new URL('../docs/upgrade-2026-10/33-stage3b-fix-eval-p4dev-1.json', import.meta.url), 'utf8'));
const J = RUN.journeys[0];
const SEGS = segmentDream(J.text);
const segOf = (t: string) => SEGS.filter((s) => t.includes(s.text) || s.text.includes(t)).map((s) => s.id);
const R = RUN.responses as { stage: string; text: string }[];
const reply = (i: number) => S.parseMomentReply(JSON.parse(R[i].text))!;
const stepSources = (k: number) => ({ language: 'he' as const, sourceText: J.text, segments: SEGS, allowed: segOf(J.steps[k].momentText), answers: [J.steps[k].answer as string] });
const verdict = (i: number, c: number, k: number) => {
  const p = reply(i).possibilities[c];
  return I.verifyCandidate({ text: p.text, card: p.card ?? null }, stepSources(k), { exploredCount: 1, exchanges: [{ question: J.steps[k].question.text, answer: J.steps[k].answer }] });
};
const wholeSources = () => ({
  language: 'he' as const, sourceText: J.text, segments: SEGS, unexplored: [], previous: null, maxReadings: 2,
  explored: J.steps.slice(0, 2).map((st: { moment: string; momentText: string; answer: string; question: { text: string }; insight: unknown }, k: number) => ({ id: `m${k + 1}`, label: st.moment, segments: segOf(st.momentText), answers: [st.answer], question: st.question.text, insight: st.insight })),
});
const lastWhole = () => C.assembleWhole(S.parseWholeView(JSON.parse(R[11].text))!, wholeSources() as never);
const timeWord = (r: string[]) => r.some((x) => /time word|before or after/.test(x));

// ------------------------------------------------------------------------------------------------ א. "אחרי" of searching, "עד הסוף"

test('א. "החיפוש אחרי משהו לא מוכר" is not a time word: the run\'s best candidate of step 1 passes (level 3)', () => {
  const v = verdict(4, 0, 0);
  assert.equal(v.safety.ok, true, v.safety.reasons.join('; '));
  assert.equal(v.quality.level, 3, v.quality.notes.join('; '));
});

test('א. the whole view: no time word is found in "החיפוש אחרי מתנה" or "לא מובנים עד הסוף", nor in the closing question', () => {
  const { report } = lastWhole();
  for (const r of [...report.overview.map((o) => o.reasons), ...report.connections, report.closing]) assert.ok(!timeWord(r), r.join('; '));
});

test('א. a real time word is still refused: "אחרי ש…", "אחרי" an event, "עד ש…"', () => {
  const s = stepSources(0);
  for (const t of ['אולי אחרי שחיפשת מתנה, השוק נהיה רועש.', 'אולי אחרי השוק הגעת למדרגות.', 'אולי חיפשת מתנה עד שהשוק נסגר.'])
    assert.ok(timeWord(C.verifyInterpretation(t, [], new Set(), s, { requireBasis: false })), t);
});

// ------------------------------------------------------------------------------------------------ ב. quotes with a conjunction letter, and the whole view's quotes

test('ב. «לא הבנת איך הוא הגיע אליה.» is the dream\'s «ולא הבנתי איך הוא הגיע אליה»: the run\'s first candidate of step 2 passes', () => {
  const v = verdict(9, 0, 1);
  assert.ok(!v.safety.reasons.some((x) => /anchor that is not/.test(x)), v.safety.reasons.join('; '));
  assert.equal(v.safety.ok, true, v.safety.reasons.join('; '));
  const card = reply(9).possibilities[0].card!;
  assert.ok(I.restoreAnchors(card, stepSources(1)).anchors.some((a) => a.quote === 'ולא הבנתי איך הוא הגיע אליה'));
});

test('ב. only a conjunction letter or the person may differ: a dropped negation, or "we" turned into "you", is still refused', () => {
  const base = reply(9).possibilities[0].card!;
  const refused = (quote: string) => I.verifyCandidate({ text: 'אולי שווה לשים לב לשני הדברים יחד.', card: { ...base, anchors: [base.anchors[0], { quote, from: 'dream' }] } }, stepSources(1)).safety.reasons.some((x) => /anchor that is not/.test(x));
  assert.ok(refused('הבנת איך הוא הגיע אליה'), '"לא" dropped: the meaning flips');
  // (a case removed after the run before the fixes: «לא הבנת איך הוא הגיע», cut short at the end, keeps the meaning and rightly passes)
  const whole = lastWhole().report;
  assert.ok(whole.connections[0].some((x) => /first end/.test(x)), '"חיפשת" for the dream\'s "וחיפשנו" changes who searched');
});

test('ב. the whole view\'s quotes use the same matching: a closing quote told to her, with a conjunction dropped, is hers', () => {
  const ws = wholeSources();
  const raw = S.parseWholeView(JSON.parse(R[11].text))!;
  const closing = { ...raw, closing: { text: raw.closing.text, moment: 'm2', quote: 'הרגשת מבולבלת' } };
  assert.ok(!C.assembleWhole(closing, ws as never).report.closing.some((x) => /quoted words/.test(x)), 'her "הרגשתי מבולבלת", told to her');
});

// ------------------------------------------------------------------------------------------------ the whole view does not fall to a factual summary for a false reason

// (doc 76: the independent review found this opening unfounded, "שתי החוויות מציבות אותך מול…", and about 40 words in one sentence;
// it is now refused for exactly that. What this test keeps: no false refusal of doc 70 comes back, and the closing question passes.)
test('the whole view of the run: no false refusal (time word, quote) remains; its opening is refused only for what doc 76 found', () => {
  const { report } = lastWhole();
  for (const o of report.overview) assert.ok(o.reasons.every((x) => /inner world|too long/.test(x)), o.reasons.join('; '));
  assert.deepEqual(report.closing, []);
});

test('unfounded claims of the run are still refused: "ריחות חזקים וקולות רועשים", "בגלל הרעש", "מסמנת", the unexplored "קודם"', () => {
  assert.equal(verdict(4, 1, 0).safety.ok, false, 'step 1, candidate 2');
  assert.equal(verdict(9, 2, 1).safety.ok, false, 'step 2, candidate 3 rests on an unexplored part');
  const { report } = lastWhole();
  assert.ok(report.readings.every((r) => r.length > 0), JSON.stringify(report.readings));
});

// ------------------------------------------------------------------------------------------------ ג. the kind of question from the main clause

test('ג. the kind of a question comes from its main clause, not from a "כש…" clause ("מה הפתיע אותך כשראית…" is not about how it looked)', () => {
  assert.notEqual(C.inferFocus('מה הפתיע אותך כשראית את החברה שלך יושבת על המדרגות עם הכד ביד?'), 'sense');
  assert.notEqual(C.inferFocus('מה היה הרגע הראשון שתפס אותך כשראית את החברה שלך עם הכד על המדרגות?'), 'sense');
  // (corrected after the run before the fixes: "נראתה" was never one of the words the classifier knows; "ראית" in the main clause is)
  assert.equal(C.inferFocus('מה ראית כשהגעת למדרגות?'), 'sense');
  assert.equal(C.inferFocus('איך הרגיש לך לראות את החברה שלך מחזיקה את הכד?'), 'feeling');
});

test('ג. the run\'s step-2 candidate "מה היה הרגע הראשון שתפס אותך…" is no longer refused as "a second question about how it looked"', () => {
  const st = J.steps[1];
  const cand = JSON.parse(R[7].text).candidates[0];
  const v = C.verifyQuestion(cand, { language: 'he', segments: SEGS, momentSegments: segOf(st.momentText), answers: [J.steps[0].answer], prior: [{ question: J.steps[0].question.text, focus: 'detail', subject: null }], explored: segOf(J.steps[0].momentText) });
  assert.ok(!v.reasons.some((x) => /how it looked/.test(x)), v.reasons.join('; '));
});

// ------------------------------------------------------------------------------------------------ ד. a noun of hers with "ך" or "שלך"

test('ד. "מקומך בין אנשים" (the run\'s first look) is a claim about her: a noun of hers that is neither her word nor the dream\'s', () => {
  const s = { ...stepSources(0) };
  const r = C.verifyInterpretation(J.wholeViews[0].report.texts.overview[0].replace('[interpretation] ', ''), [], new Set(), s, { requireBasis: false });
  assert.ok(r.some((x) => /inner world/.test(x) && /מקומך/.test(x)), r.join('; '));
  assert.ok(C.verifyInterpretation('אולי המקום שלך בשוק היה בין אנשים.', [], new Set(), s, { requireBasis: false }).some((x) => /inner world/.test(x)), '"המקום שלך"');
});

test('ד. her people and things of the dream with "ך" or "שלך" still pass: "אחותך", "החברה שלך", "הידיים שלך", "החלום שלך"', () => {
  const s = { ...stepSources(0), allowed: SEGS.map((x) => x.id) };
  for (const t of ['אולי בחלום שלך אחותך התמקחה על הכד.', 'אולי החברה שלך הלכה קדימה.', 'אולי המטריה נקרעה לך בידיים שלך.'])
    assert.ok(!C.verifyInterpretation(t, [], new Set(), s, { requireBasis: false }).some((x) => /inner world/.test(x)), t);
});

// ------------------------------------------------------------------------------------------------ ה. the prompt pattern that produced unnatural Hebrew

test('ה. the reply prompt no longer offers "לאותו ‹object› נכנסים… שני דברים שונים" (copied as "לאותו כד נכנסות שתי דמויות")', () => {
  const p = S.buildMomentReplySystemPrompt('he', 'feminine');
  assert.ok(!/לאותו ‹object› נכנסים/.test(p));
  assert.match(p, /בחלום יש ‹a›, ויש גם ‹b›/);
});

// ------------------------------------------------------------------------------------------------ ו. the closing question written by code

test('ו. the closing question written by code is an open question, not "מה עוד עולה…"', () => {
  const q = C.modestClosing(wholeSources() as never);
  assert.ok(!/מה עוד עולה/.test(q), q);
  assert.match(q, /אם בכלל/);
  assert.ok(I.questionQuality(q, { momentText: '', prior: [] }).score >= I.QUESTION_FLOOR, q);
});

// ------------------------------------------------------------------------------------------------ fewer paid retries, same quality

test('cost: a whole view with no link between the moments (an honest "no-link") is not sent back for a paid retry', () => {
  const { report } = lastWhole();
  assert.equal(S.wholeRetryNote(report, 'no-link'), null);
  assert.ok(S.wholeRetryNote(report, 'factual-summary'), 'a factual summary is still retried once more');
});
