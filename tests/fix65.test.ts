import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as X from '../src/hero/exploration.ts';
import * as I from '../src/hero/interpretationCheck.ts';
import * as C from '../src/hero/claimCheck.ts';
import * as G from './fixtures/goldenSet.ts';
import { segmentDream } from '../src/hero/dreamSegments.ts';

/**
 * THE ROUND OF doc 65, open issues 1–4 only. Written BEFORE the fixes and run first against the code as it was
 * (docs/upgrade-2026-10/66-fix65-tests-before.txt). The cases are the real outputs of the runs p3dev-1 and acc-1; each fix comes with
 * the case it must NOT change (naturalness and good insights kept).
 */

const load = (f: string) => JSON.parse(readFileSync(new URL(`../docs/upgrade-2026-10/${f}`, import.meta.url), 'utf8'));
const P3 = load('33-stage3b-fix-eval-p3dev-1.json').journeys[0];
const P3_SEGS = segmentDream(P3.text);
const P3_STEP = P3.steps[0];
const P3_MOMENT = P3_SEGS.filter((s) => P3_STEP.momentText.includes(s.text)).map((s) => s.id);
const ACC = load('33-stage3b-fix-eval-acc-1.json').journeys[0];
const ACC_SEGS = segmentDream(ACC.text);
const accSources = (k: number) => ({ language: 'he' as const, sourceText: ACC.text, segments: ACC_SEGS, allowed: ACC_SEGS.filter((s) => ACC.steps[k].momentText.includes(s.text) || s.text.includes(ACC.steps[k].momentText)).map((s) => s.id), answers: [ACC.steps[k].answer as string] });
const inner = (r: string[]) => r.some((x) => /inner world|psychological meaning/.test(x));
const line = (t: string, s: ReturnType<typeof accSources>) => C.verifyInterpretation(t, [], new Set(), s, { requireBasis: false });

// ------------------------------------------------------------------------------------------------ 1. the "what if" kind of question is kept

test('1. a "what if" question keeps its kind in the journey, and after saving and resuming it', () => {
  let e = X.createExploration('a', [{ label: 'm', pregeneratedQuestion: 'q?' }]);
  const id = e.moments[0].id;
  e = X.beginMoment(e, id, 'אם היית מצליחה לסגור את המטריה, מה היה קורה?', 'adaptive');
  e = X.setQuestionFocus(e, id, 'whatif' as X.QuestionFocus, 'מטריה');
  assert.equal(e.explored[id]?.focus, 'whatif', 'kept when set');
  assert.equal(X.parseExploration(JSON.parse(JSON.stringify(e)))?.explored[id]?.focus, 'whatif', 'kept after resuming');
});

test('1. one list of question kinds for the checker and the journey (so they cannot drift apart again)', () => {
  assert.deepEqual([...C.FOCI].sort(), [...((X as unknown as { FOCI?: readonly string[] }).FOCI ?? [])].sort());
});

// ------------------------------------------------------------------------------------------------ 2. ranking the passing questions

const rank = (q: string) => I.questionQuality(q, { momentText: P3_STEP.momentText, prior: [], answers: [] } as never).score;
const Q = {
  firstNoticed: 'מה הדבר הראשון ששמת לב אליו כשנקרעה לך המטריה בידיים?',
  detail: 'איזה פרט הכי תפס אותך ברגע שהמטריה נקרעה לך בידיים?',
  hands: 'מה הרגשת בידיים שלך כשניסית לסגור את המטריה והיא נקרעה?',
  ifClosed: 'אם היית מצליחה לסגור את המטריה, איך לדעתך זה היה מרגיש ברגע הזה?',
  body: 'מה עובר לך בגוף כשאת מרגישה את הקריעה של המטריה?',
  sayToYourself: 'אם היית יכולה להגיד משהו לעצמך ברגע שהמטריה נקרעה, מה היית אומרת?',
};

test('2. "אם היית…" is recognised as a "what if" (it was not, so every hypothetical scored like a plain question)', () => {
  assert.ok(rank(Q.ifClosed) < rank(Q.firstNoticed), `${rank(Q.ifClosed)} vs ${rank(Q.firstNoticed)}`);
});

test('2. a "what if" about what the moment itself wanted and did not do ("ניסיתי לסגור… אבל… נקרעה") stays askable', () => {
  assert.ok(rank(Q.ifClosed) >= I.QUESTION_FLOOR, String(rank(Q.ifClosed)));
});

test('2. a "what if" about something the dream does not have (saying something to yourself) is an exercise: below the floor', () => {
  assert.ok(rank(Q.sayToYourself) < I.QUESTION_FLOOR, String(rank(Q.sayToYourself)));
});

test('2. a question that presupposes what she feels ("כשאת מרגישה את הקריעה") ranks below the floor, unless she said it', () => {
  assert.ok(rank(Q.body) < I.QUESTION_FLOOR, String(rank(Q.body)));
  const hers = I.questionQuality('מה עובר לך כשאת מרגישה את הקריעה של המטריה?', { momentText: P3_STEP.momentText, prior: [], answers: ['הרגשתי את הקריעה בידיים'] } as never).score;
  assert.ok(hers >= I.QUESTION_FLOOR, `her own feeling: ${hers}`);
});

test('2. the natural, concrete questions keep the top: the one asked first is one of them', () => {
  const top = Math.max(...Object.values(Q).map(rank));
  for (const q of [Q.firstNoticed, Q.detail, Q.hands]) assert.equal(rank(q), top, q);
});

// (corrected after the run before the fixes: acc-1 predates the ranking, and one question it showed is already below the floor for an older
// rule, "what stood out" twice in a journey; what this round must not do is add one of its new penalties to a question that was shown)
test('2. no regression: none of the new penalties falls on a question shown in the stored runs', () => {
  for (const f of ['33-stage3b-fix-eval-acc-1.json', '33-stage3b-fix-eval-p2dev-1.json']) {
    for (const J of load(f).journeys) {
      (J.steps as { question: { text: string; source: string }; momentText: string; answer: string }[]).forEach((st, k, all) => {
        if (st.question.source === 'fixed') return;
        const prior = all.slice(0, k).map((b) => b.question.text);
        const answers = all.slice(0, k).map((b) => b.answer);
        const notes = I.questionQuality(st.question.text, { momentText: st.momentText, prior, answers } as never).notes;
        assert.ok(!notes.some((n) => /exercise|presupposes/.test(n)), `${f}: "${st.question.text}" ${notes.join('; ')}`);
      });
    }
  }
});

// ------------------------------------------------------------------------------------------------ 3. her words about another moment

const p3Sources = (answer: string) => ({ language: 'he' as const, sourceText: P3.text, segments: P3_SEGS, allowed: P3_MOMENT, answers: [answer] });

test('3. her answer was about the market, not the umbrella: a link to it is not rated 3 (the run\'s first possibility)', () => {
  const r = P3_STEP.insightReport.first;
  const v = I.verifyCandidate({ text: r.texts.possibilities[0], card: r.cards[0] }, p3Sources(P3_STEP.answer));
  assert.equal(v.safety.ok, true);
  assert.ok(v.quality.level <= 2, `${v.quality.level}: ${v.quality.notes.join('; ')}`);
  assert.ok(v.quality.notes.some((n) => /another part/.test(n)), v.quality.notes.join('; '));
});

test('3. the same link, when her words were about this moment, keeps level 3', () => {
  const r = P3_STEP.insightReport.first;
  // (corrected after the run before the fixes: an answer repeating the anchor "נקרעה לי בידיים" is rightly an echo)
  const answer = 'ברגע הזה הכל היה מאוד מבולגן, והמטריה הייתה בידיים שלי.';
  const v = I.verifyCandidate({ text: r.texts.possibilities[0], card: r.cards[0] }, p3Sources(answer));
  assert.equal(v.quality.level, 3, v.quality.notes.join('; '));
});

test('3. no regression: the golden examples keep their levels', () => {
  for (const e of G.WRITTEN) assert.equal(I.verifyCandidate({ text: e.text, card: e.card as never }, G.sourcesOf(e.dream)).quality.level, e.level, e.id);
});

// ------------------------------------------------------------------------------------------------ 4. forms the checker did not cover (acc-1)

test('4. "קשור עבורך ל…" claims something about her inner world (acc-1, step 3, possibility 2)', () => {
  assert.ok(inner(line(ACC.steps[2].insightReport.texts.possibilities[1], accSources(2))));
});

test('4. "ראית ב-X ביטוי ל-Y" with a new meaning is seeing the image as something she did not say', () => {
  assert.ok(line('ייתכן שראית במטבח ביטוי למקום של ביטחון ושייכות.', accSources(2)).some((x) => /psychological meaning/.test(x)));
});

test('4. "שחשובה לך": an evaluation of hers must be her word (acc-1, step 1, possibility 2: she said "אהבתי", not "חשוב")', () => {
  const r = line(ACC.steps[0].insightReport.texts.possibilities[1], accSources(0));
  assert.ok(r.some((x) => /inner world/.test(x) && /חשובה/.test(x)), r.join('; '));
});

test('4. her own words given back with these forms still pass (no harm to good insights)', () => {
  // she said "המים החמים היו כמו חיבור… רגע של רוך ונעימות": seeing the water as tenderness is her meaning
  assert.ok(!line('ייתכן שראית בטפטוף המים החמים ביטוי לרוך ולנעימות שתיארת.', accSources(0)).some((x) => /psychological meaning/.test(x)));
  const s = { ...accSources(2), answers: ['זה חשוב לי, וזה קשור לסבתא שלי.'] };
  assert.deepEqual(line('אולי, כמו שאמרת, המטבח קשור עבורך לסבתא, וזה חשוב לך.', s), []);
});

// Added after the extension of "seeing as" to every form of "to see": "ראית" in its plain sense, before a word of the dream that only
// starts with כ ("כחול"), is not "as", and nothing that only describes what she saw is refused for a meaning.
test('4. "ראית" in its plain sense is not "seeing as": "ראית את המורה סורגת משהו ארוך כחול" keeps passing that check', () => {
  assert.ok(!line('ראית את המורה סורגת משהו ארוך כחול.', accSources(0)).some((x) => /psychological meaning/.test(x)));
  assert.ok(!line('ראית שהמים חמים כמו מרק.', accSources(0)).some((x) => /psychological meaning/.test(x)), '"כמו" is a comparison, not "as"');
});
