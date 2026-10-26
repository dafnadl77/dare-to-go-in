import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as S from '../src/hero/explorationSchema.ts';
import * as I from '../src/hero/interpretationCheck.ts';
import * as C from '../src/hero/claimCheck.ts';
import * as G from './fixtures/goldenSet.ts';
import { segmentDream } from '../src/hero/dreamSegments.ts';

/**
 * THE FIX ROUND OF doc 62 (after the development run p3dev-1). Written BEFORE the fixes and run first against the code as it was
 * (docs/upgrade-2026-10/63-fix62-tests-before.txt). Every case is the run's REAL output (docs/upgrade-2026-10/33-stage3b-fix-eval-p3dev-1.json):
 * the fixes go to the cause of each failure, not to more words on a list, and each comes with the case it must NOT let through.
 */

const RUN = JSON.parse(readFileSync(new URL('../docs/upgrade-2026-10/33-stage3b-fix-eval-p3dev-1.json', import.meta.url), 'utf8'));
const DREAM: string = RUN.journeys[0].text;
const SEGS = segmentDream(DREAM);
const STEP = RUN.journeys[0].steps[0];
const MOMENT = SEGS.filter((s) => STEP.momentText.includes(s.text)).map((s) => s.id); // «ניסיתי לסגור אותה אבל היא נקרעה לי בידיים»
const qctx = { language: 'he' as const, segments: SEGS, momentSegments: MOMENT, answers: [] as string[], prior: [] };
const ask = (q: string) => C.verifyQuestion({ question: q, focus: 'salience', subject: '' }, qctx).reasons;
const reply = { language: 'he' as const, sourceText: DREAM, segments: SEGS, allowed: MOMENT, answers: [STEP.answer as string] };
const X = C as unknown as { antecedents?: (segments: typeof SEGS, ids: number[]) => string[] };

// ------------------------------------------------------------------------------------------------ 1. a moment that names its object only by a pronoun

test('1. the moment part refers back by a pronoun: its referent is found in the part just before ("מטריה"), and only there', () => {
  assert.equal(typeof X.antecedents, 'function');
  assert.deepEqual(X.antecedents!(SEGS, MOMENT).map((w) => w.replace(/^ה/, '')), ['מטריה']);
  const noPronoun = SEGS.filter((s) => s.text.includes('הלכה קדימה')).map((s) => s.id);
  assert.deepEqual(X.antecedents!(SEGS, noPronoun), [], 'a part with no pronoun has no referent');
});

test('1. the run\'s 9 refused questions: none is refused any more for naming the umbrella, and every other reason stays', () => {
  const rejected = STEP.question.rejected as { question: string; reasons: string[] }[];
  assert.equal(rejected.length, 9);
  for (const r of rejected) {
    const now = ask(r.question);
    assert.ok(!now.some((x) => /מטריה/.test(x)), `${r.question}: ${now.join('; ')}`);
    for (const old of r.reasons.filter((x) => !/מטריה/.test(x))) assert.ok(now.some((x) => x.split(' (')[0] === old.split(' (')[0]), `${r.question} lost: ${old}`);
  }
});

test('1. what is NOT the referent is still refused: another object of the dream, or a detail of the part before', () => {
  assert.ok(ask('מה עבר לך בראש כשהכד נקרע לך בידיים?').some((x) => /another part/.test(x)), 'the jar is in another part');
  assert.ok(ask('איך הנייר נראה כשהמטריה נקרעה לך בידיים?').some((x) => /another part/.test(x) && /נייר/.test(x)), 'the paper is a detail of the part before, not the referent');
});

test('1. the dream sentence of the run ("ניסית לסגור את המטריה…") no longer counts as bringing in another part', () => {
  const v = C.verifyDreamClaim({ text: 'ניסית לסגור את המטריה אבל היא נקרעה לך בידיים.', segment: MOMENT[0], action: 'ניסיתי', actor: 'dreamer', target: '' }, reply);
  assert.ok(!v.reasons.some((x) => /another part/.test(x)), v.reasons.join('; '));
});

// ------------------------------------------------------------------------------------------------ 2. a "vague" reference that is the dream's own words

test('2. "למישהו שאני לא מכירה" is the dream\'s own words, not a vague reference: no clarification is demanded (the run\'s answer)', () => {
  assert.equal((S.clarificationNote as (r: { followUpQuestion: string | null }, a: string, d?: string) => string | null)({ followUpQuestion: null }, STEP.answer, DREAM), null);
});

test('2. a vague reference the dream does not have still asks for a clarification', () => {
  const note = S.clarificationNote as (r: { followUpQuestion: string | null }, a: string, d?: string) => string | null;
  assert.ok(note({ followUpQuestion: null }, 'זה הזכיר לי משהו שקרה פעם עם מישהו שגר לידי.', DREAM));
  assert.ok(note({ followUpQuestion: null }, 'נזכרתי באותה פעם בים.', DREAM));
});

// ------------------------------------------------------------------------------------------------ 3. an anchor turned into the second person

test('3. the run\'s anchor «נקרעה לך בידיים» is the dream\'s «נקרעה לי בידיים» told to her: accepted, and kept in the dream\'s own words', () => {
  const card = STEP.insightReport.first.cards[0] as I.SourceCard;
  const v = I.verifyCandidate({ text: STEP.insightReport.first.texts.possibilities[0], card }, reply);
  assert.ok(!v.safety.reasons.some((x) => /anchor that is not/.test(x)), v.safety.reasons.join('; '));
  const R = I as unknown as { restoreAnchors?: (c: I.SourceCard, s: typeof reply) => I.SourceCard };
  assert.equal(typeof R.restoreAnchors, 'function');
  assert.deepEqual(R.restoreAnchors!(card, reply).anchors.map((a) => a.quote), ['הכל היה מאוד מבולגן', 'נקרעה לי בידיים']);
});

test('3. only the person changes: an anchor with another word, or her answer put in the dream, is still refused', () => {
  const base = STEP.insightReport.first.cards[0] as I.SourceCard;
  const withAnchor = (quote: string, from: 'dream' | 'answer'): I.SourceCard => ({ ...base, anchors: [base.anchors[0], { quote, from }] });
  const refused = (c: I.SourceCard) => I.verifyCandidate({ text: 'אולי יש קשר בין השניים.', card: c }, reply).safety.reasons.some((x) => /anchor that is not/.test(x));
  assert.ok(refused(withAnchor('נקרעה לך ברגליים', 'dream')), 'another word');
  assert.ok(refused(withAnchor('נפתחה לך בידיים', 'dream')), 'another verb');
  assert.ok(refused(withAnchor('את צריכה לבחור מתנה', 'dream')), 'her answer is not the dream');
  // (corrected after the run before the fixes: a verbatim quote is whole words, so "את צריכה" could never stand for "כשאני צריכה")
  assert.ok(!refused(withAnchor('כשאת צריכה לבחור מתנה', 'answer')), 'her own answer, told to her ("כשאני" → "כשאת"), is hers');
});

// ------------------------------------------------------------------------------------------------ 4. three candidates

test('4. the reply schema asks for exactly three possibilities (minItems/maxItems, supported in strict mode for base models)', () => {
  const p = (S.MOMENT_REPLY_JSON_SCHEMA as unknown as { schema?: { properties: Record<string, { minItems?: number; maxItems?: number }> }; properties?: Record<string, { minItems?: number; maxItems?: number }> });
  const props = p.schema?.properties ?? p.properties ?? {};
  assert.equal(props.possibilities?.minItems, 3);
  assert.equal(props.possibilities?.maxItems, 3);
});

// ------------------------------------------------------------------------------------------------ 5. the run script

const EVAL = readFileSync(new URL('../scripts/explorationEval.ts', import.meta.url), 'utf8');

test('5. the run script stops before any client exists when it has no run name with a hard round cap', () => {
  const guard = EVAL.search(/a paid run only with an explicit name/);
  assert.ok(guard > 0, 'the guard');
  assert.ok(guard < EVAL.indexOf('new OpenAI('), 'before the client');
  assert.ok(guard < EVAL.indexOf('await import('), 'before the routes are loaded');
  assert.ok(!/process\.argv\[2\] \|\| `run-/.test(EVAL), 'no automatic run name');
});

test('5. started without a name, it exits with an error and the cost ledger is untouched (a test key: no call can be paid)', () => {
  const ledger = new URL('../docs/upgrade-2026-10/27-eval-cost-ledger.json', import.meta.url);
  const before = readFileSync(ledger, 'utf8');
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/explorationEval.ts'], { cwd: new URL('..', import.meta.url), env: { ...process.env, OPENAI_API_KEY: 'sk-test-not-a-key' }, encoding: 'utf8', timeout: 60_000 });
  assert.notEqual(r.status, 0, r.stdout);
  assert.match(`${r.stderr}${r.stdout}`, /run name/);
  assert.equal(readFileSync(ledger, 'utf8'), before);
});

test('5. the run script keeps every model response (every attempt), not only the first and the last', () => {
  assert.match(EVAL, /responses\.push\(/);
  assert.match(EVAL, /responses: responses\.filter/);
});

// ------------------------------------------------------------------------------------------------ no regression: what was good stays good

test('no regression: the possibility shown in the run, and the golden examples, keep their verdicts and levels', () => {
  const shown = STEP.insightReport.retry;
  const v = I.verifyCandidate({ text: shown.texts.possibilities[0], card: shown.cards[0] }, reply);
  assert.equal(v.safety.ok, true, v.safety.reasons.join('; '));
  assert.equal(v.quality.level, 2);
  for (const e of G.WRITTEN) assert.equal(I.verifyCandidate({ text: e.text, card: e.card as never }, G.sourcesOf(e.dream)).quality.level, e.level, e.id);
});

// Added AFTER the first version of the fix, when the sweep of doc 64 (part C) showed 4 wrong referents out of 11 ("אותה מעטפה" read as a
// pronoun, "פנימה", "בדירה", "שנים"); the rule was narrowed, and this locks what each pronoun of those dreams now refers to.
test('1. every pronoun of the development, sealed and acceptance dreams: the right referent, or none (never a wrong one)', () => {
  const dreams = ['37-dev-dreams.json', '37-sealed-dreams.json', '47-acceptance-dreams.json'].flatMap(
    (f) => JSON.parse(readFileSync(new URL(`../docs/upgrade-2026-10/${f}`, import.meta.url), 'utf8')) as { key: string; text: string }[],
  );
  const expected: Record<string, string> = {
    'וכשפתחתי אותה היא נפתחה הפוך': 'מטריה',
    'ניסיתי לסגור אותה אבל היא נקרעה': 'מטריה',
    'ואני לוקח אותה וחוזר לאוטו': 'מעטפה',
    'כשכרכתי אותו על הצוואר': 'צעיף',
  };
  const PRON = /(?<![א-ת])(?:ו|ש|וש|כש|וכש)?(?:אותה|היא|אותו|הוא)(?![א-ת])/;
  let resolved = 0;
  for (const d of dreams) {
    const segs = segmentDream(d.text);
    for (const seg of segs.filter((x) => PRON.test(x.text))) {
      const got = C.antecedents(segs, [seg.id]).map((w) => w.replace(/^ה/, ''));
      const key = Object.keys(expected).find((k) => seg.text.includes(k));
      if (key) {
        assert.deepEqual(got, [expected[key]], seg.text);
        resolved += 1;
      } else assert.deepEqual(got, [], `${d.key}: "${seg.text}" must stay unresolved (a subject pronoun, "אותה" + noun, or a noun in the moment itself)`);
    }
  }
  assert.equal(resolved, 4);
});
