import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from '../src/hero/explorationSchema.ts';
import * as I from '../src/hero/interpretationCheck.ts';
import * as C from '../src/hero/claimCheck.ts';
import { segmentDream } from '../src/hero/dreamSegments.ts';

/**
 * STEP 1 OF doc 59: the prompts teach the model, with examples, what the checker now refuses ("אצלך", "מעורר בך", "הרגשת" she did not
 * say, "ובכל זאת" as a fact, "אפשר לראות את X כ‹new concept›"), so fewer attempts are refused and paid for. Written BEFORE the prompt
 * change (docs/upgrade-2026-10/60-prompt-hardening-tests-before.txt). The examples in the prompt are checked by the real checker: a
 * prompt must never teach a sentence the checker refuses, nor show as "bad" a sentence the checker lets through.
 */

type Example = { where: 'insight' | 'whole'; bad: string; good: string };
const X = S as unknown as { ABOUT_HER_EXAMPLES?: Example[]; EXAMPLE_DREAM?: string; EXAMPLE_ANSWER?: string };
const EXAMPLES = X.ABOUT_HER_EXAMPLES ?? [];
const sourcesOfExample = () => {
  const segs = segmentDream(X.EXAMPLE_DREAM ?? '');
  return { language: 'he' as const, sourceText: X.EXAMPLE_DREAM ?? '', segments: segs, allowed: segs.map((s) => s.id), answers: [X.EXAMPLE_ANSWER ?? ''] };
};
const CARD: I.SourceCard = { relation: 'open-link', anchors: [{ quote: 'אני לא עליתי', from: 'dream' }, { quote: 'הרגשתי שקטה', from: 'answer' }], basis: [], aboutHer: [], openEdge: '' };
const refusals = (e: Example, text: string) =>
  e.where === 'insight' ? I.verifyCandidate({ text, card: CARD }, sourcesOfExample()).safety.reasons : C.verifyInterpretation(text, [], new Set(), sourcesOfExample(), { requireBasis: false });

test('1. the prompt examples exist: at least three for the insight and three for the whole view, on a dream of their own', () => {
  assert.ok(X.EXAMPLE_DREAM && X.EXAMPLE_ANSWER, 'an example dream and answer');
  assert.ok(EXAMPLES.filter((e) => e.where === 'insight').length >= 3, 'insight examples');
  assert.ok(EXAMPLES.filter((e) => e.where === 'whole').length >= 3, 'whole-view examples');
});

test('1. every "bad" example is refused by the checker, and every "good" one passes it', () => {
  assert.ok(EXAMPLES.length > 0);
  for (const e of EXAMPLES) {
    assert.ok(refusals(e, e.bad).length > 0, `bad passes: ${e.bad}`);
    assert.deepEqual(refusals(e, e.good), [], `good refused: ${e.good}`);
  }
});

test('1. the examples do not come from the development, sealed or acceptance dreams (no leak into later runs)', () => {
  const dreams = ['37-dev-dreams.json', '37-sealed-dreams.json', '47-acceptance-dreams.json'].flatMap((f) =>
    (JSON.parse(readFileSync(new URL(`../docs/upgrade-2026-10/${f}`, import.meta.url), 'utf8')) as { text: string }[]).map((d) => d.text),
  );
  assert.ok(X.EXAMPLE_DREAM);
  for (const d of dreams) for (const sentence of `${X.EXAMPLE_DREAM}`.split(/[.!?]\s*/).filter(Boolean)) assert.ok(!d.includes(sentence.trim()), sentence);
});

test('2. the Hebrew reply and whole-view prompts carry the rule and its examples, in every address form', () => {
  for (const address of ['feminine', 'masculine', 'neutral'] as const) {
    const reply = S.buildMomentReplySystemPrompt('he', address);
    const whole = S.buildWholeViewSystemPrompt('he', address);
    for (const marker of ['אצלך', 'מעורר בך', 'הרגשת', 'ובכל זאת', 'אפשר לראות את']) {
      assert.ok(reply.includes(marker), `reply/${address}: ${marker}`);
      assert.ok(whole.includes(marker), `whole/${address}: ${marker}`);
    }
    for (const e of EXAMPLES) {
      const p = e.where === 'insight' ? reply : whole;
      assert.ok(p.includes(e.bad) && p.includes(e.good), `${e.where}/${address}: ${e.good}`);
    }
  }
  assert.ok(EXAMPLES.length > 0);
});

test('2. the English prompts keep the rule but carry no Hebrew example (language integrity)', () => {
  const reply = S.buildMomentReplySystemPrompt('en', 'neutral');
  assert.match(reply, /inner world/i);
  assert.ok(EXAMPLES.length > 0);
  for (const e of EXAMPLES) assert.ok(!reply.includes(e.good), e.good);
});

test('3. the reply prompt no longer offers "ובכל זאת" as a pattern without a condition', () => {
  const reply = S.buildMomentReplySystemPrompt('he', 'feminine');
  assert.ok(!reply.includes('"‹detail›, ובכל זאת ‹other detail›." ·'), 'the old unconditional pattern');
  assert.match(reply, /ובכל זאת[^\n]*only when/);
});

test('4. a correction note after a refusal about her inner world says what to do instead', () => {
  const report = { dream: [], user: [], possibilities: [['says something about her inner world she did not say ("אצלך")']], texts: { dream: [], user: [], possibilities: ['x'] } } as unknown as C.ClaimReport;
  assert.match(S.replyRetryNote(report), /אמרת ש/);
  const plain = { dream: [], user: [], possibilities: [['an echo of her answer']], texts: { dream: [], user: [], possibilities: ['x'] } } as unknown as C.ClaimReport;
  assert.doesNotMatch(S.replyRetryNote(plain), /אמרת ש/, 'only when that was the reason');
  const whole = { overview: [{ source: 'interpretation', ok: false, reasons: ['says something about her inner world she did not say ("נתפס")'] }], connections: [], recurring: [], contrast: [], readings: [], closing: [], texts: { overview: [], connections: [], recurring: '', contrast: '', readings: [], closing: '' } } as unknown as C.WholeReport;
  assert.match(S.wholeRetryNote(whole, 'factual-summary'), /אמרת ש/);
});

test('4. a correction note after a link stated as a fact, or an image given a new meaning, names that fix too', () => {
  const r = (reason: string) => S.replyRetryNote({ dream: [], user: [], possibilities: [[reason]], texts: { dream: [], user: [], possibilities: ['x'] } } as unknown as C.ClaimReport);
  assert.match(r('states as a fact a link the dream and her words do not show (offer it openly: "אולי…")'), /אולי יש קשר/);
  assert.match(r('gives a psychological meaning she did not give (sees the image as "מקום מעבר")'), /another detail of the dream/);
});
