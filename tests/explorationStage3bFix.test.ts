import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { typedAnalysis } from '../src/demo/demoRouter.ts';
import * as X from '../src/hero/exploration.ts';
import { handleExploration, planCall, type ExplorationDeps } from '../server/routes/dreamExploration.ts';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema.ts';
import { DREAMS, LABEL_CASES, MOMENT_CASES, QUESTION_CASES, REPLY_CASES, WHOLE_CASES } from './fixtures/stage3bFix.ts';
import * as pipeline from './fixtures/stage3bAdapter.ts';

/**
 * STAGE 3B FIX ROUND: tests that can fail (doc 30). Written before the fix and run first against the old pipeline, where they are
 * expected to fail; the cases themselves (fixtures/stage3bFix.ts) are not edited afterwards. Only the adapter changes, from the old
 * pipeline to the new one. New functions are reached through a namespace import, so on the old code a missing function fails its own
 * test instead of breaking the whole file.
 */

const analysisOf = (key: 'short' | 'rich' | 'sensitive' | null, text: string): DreamAnalysis =>
  key ? JSON.parse(readFileSync(new URL(`./fixtures/analysis-${key}.json`, import.meta.url), 'utf8')) : (typedAnalysis(text, true) as unknown as DreamAnalysis);

const joined = (texts: string[]) => texts.filter(Boolean).join(' | ');

function expectShown(name: string, shown: string[], mustNotShow: string[], mustShow: string[]) {
  const all = joined(shown);
  for (const bad of mustNotShow) assert.ok(!all.includes(bad), `${name}: must not show "${bad}" — shown: ${all}`);
  for (const good of mustShow) assert.ok(all.includes(good), `${name}: a correct piece was lost: "${good}" — shown: ${all}`);
}

// ------------------------------------------------------------------------------------------------ the dream layer, the dreamer's layer, the possibility

for (const c of REPLY_CASES) {
  test(`reply: ${c.name}`, async () => {
    const out = await pipeline.reply(c);
    expectShown(c.name, out.shown, c.mustNotShow, c.mustShow);
    if (c.expectKind) assert.equal(out.kind, c.expectKind, `${c.name}: kind`);
  });
}

// ------------------------------------------------------------------------------------------------ the whole view

for (const c of WHOLE_CASES) {
  test(`whole view: ${c.name}`, async () => {
    const out = await pipeline.whole(c);
    expectShown(c.name, out.shown, c.mustNotShow, c.mustShow);
    if (c.expectKind) assert.equal(out.kind, c.expectKind, `${c.name}: kind`);
  });
}

// ------------------------------------------------------------------------------------------------ questions

for (const c of QUESTION_CASES) {
  test(`question: ${c.name}`, async () => {
    const shown = await pipeline.question(c);
    expectShown(c.name, [shown], c.mustNotShow, c.mustShow);
    assert.ok(shown.trim().endsWith('?'), `${c.name}: a question is always shown (a safe one when every candidate fails): "${shown}"`);
  });
}

// ------------------------------------------------------------------------------------------------ moments and labels

for (const c of MOMENT_CASES) {
  test(`moments: ${c.name}`, () => {
    const offered = pipeline.moments(c.dream, analysisOf(c.analysis, DREAMS[c.dream]));
    const texts = offered.map((m) => m.text);
    for (const piece of c.mustCover) assert.ok(texts.some((t) => t.includes(piece)), `${c.name}: no moment covers "${piece}" — moments: ${joined(texts)}`);
    assert.ok(offered.length <= c.maxMoments, `${c.name}: ${offered.length} moments offered, at most ${c.maxMoments} — ${joined(offered.map((m) => m.label))}`);
    for (let i = 0; i < texts.length; i++)
      for (let j = i + 1; j < texts.length; j++)
        assert.ok(!texts[i].includes(texts[j]) && !texts[j].includes(texts[i]), `${c.name}: two moments rest on the same words: "${texts[i]}" / "${texts[j]}"`);
  });
}

for (const c of LABEL_CASES) {
  test(`label: "${c.candidate}" for "${c.momentText}"`, () => {
    const shown = pipeline.label(c.momentText, c.candidate);
    expectShown(c.candidate, [` ${shown} `], c.mustNotShow, []);
    assert.ok(shown.trim().length > 0, 'a label is always shown');
    if (c.keep) assert.equal(shown, c.candidate, 'a good label is kept as it is');
  });
}

// ------------------------------------------------------------------------------------------------ story order is not event order

test('event order: a flashback is never read as "later"; with no word for it the order is unknown; "בסוף" is known', () => {
  assert.notEqual(pipeline.eventOrder('flashback', 'ישבתי במטבח', 'לפני זה הלכתי'), null, 'the pipeline can tell');
  assert.notEqual(pipeline.eventOrder('flashback', 'ישבתי במטבח', 'לפני זה הלכתי'), 'before', 'the forest walk came BEFORE the kitchen');
  assert.equal(pipeline.eventOrder('rich', 'אחי הקטן נתן לי מפתח', 'הלכנו לאורך החוף'), 'unknown', 'nothing in the text says which came first');
  assert.equal(pipeline.eventOrder('sensitive', 'רדפו אחריי', 'בסוף הגעתי לחדר'), 'before', '"בסוף" says the room came last');
});

// ------------------------------------------------------------------------------------------------ a failed quality check never reaches the dreamer

test('a quality check that fails on every attempt ends without text (it is not shown because the attempts ran out)', async () => {
  assert.equal(await pipeline.gateRejectsExhausted(), true);
});

// ------------------------------------------------------------------------------------------------ "I don't know"

const T = new Date('2026-10-21T10:00:00Z');
const one = () => X.createExploration('att-1', [{ label: 'הדלתות שנסגרות' }, { label: 'אבא שלא מתעורר' }]);

test('"לא יודעת": no insight call, and one different question may be offered instead (never twice)', () => {
  let e = X.beginMoment(one(), 'm1', 'מה נשאר פתוח בשבילך כשהדלתות נסגרו?', 'adaptive', T);
  e = X.answerMoment(e, 'm1', 'לא יודעת.');
  assert.equal(planCall('moment-reply', e, 'm1'), null, 'an answer of "I don\'t know" is not interpreted');
  const alt = planCall('moment-question', e, 'm1');
  assert.equal(alt?.kind, 'question', 'a different question about the same moment may be asked once');
  const ask = (X as unknown as Record<string, (...a: unknown[]) => X.Exploration>).beginAlternativeQuestion;
  assert.equal(typeof ask, 'function');
  e = ask(e, 'm1', 'מה שמעת כשהדלתות נסגרו?', 'sense', 'דלתות', T);
  assert.equal(e.explored.m1?.answer, null, 'the new question waits for a new answer');
  e = X.answerMoment(e, 'm1', 'לא יודעת.');
  assert.equal(planCall('moment-question', e, 'm1'), null, 'never a third question');
  assert.equal(planCall('moment-reply', e, 'm1'), null);
});

// ------------------------------------------------------------------------------------------------ fallbacks, slots and retries

function deps(over: Partial<ExplorationDeps>) {
  const log: string[] = [];
  const d = {
    resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: 'u1' } }),
    openai: () => ({}) as never,
    trialState: async () => 'open',
    completeTrial: async () => 'completed',
    rateLimit: async () => (log.push('rate'), { allowed: true }),
    reserveMoment: async () => (log.push('reserve-moment'), 'reserved'),
    refundMoment: async () => void log.push('refund-moment'),
    reserveWhole: async () => (log.push('reserve-whole'), 'reserved'),
    refundWhole: async () => void log.push('refund-whole'),
    address: async () => 'neutral',
    moderate: async () => ({ status: 'ok' as const, hit: false }),
    ...over,
  } as unknown as ExplorationDeps;
  return { d, log };
}
const analysis = typedAnalysis(DREAMS.sensitive, true) as unknown as DreamAnalysis;
const body = (e: X.Exploration, extra: Record<string, unknown> = {}) => ({ attemptId: e.attemptId, language: 'he', dreamAnalysis: analysis, exploration: e, ...extra });
const factual = { observation: '«הדלתות נסגרו אחת אחרי השנייה»', reflection: 'אמרת: «שקט»', possibility: '', kind: 'factual' };

test('a factual fallback insight keeps its slot (the call was made), is not a success, and may be retried once', async () => {
  let e = X.beginMoment(one(), 'm1', 'מה שמעת כשהדלתות נסגרו?', 'adaptive', T);
  e = X.answerMoment(e, 'm1', 'שקט מוזר');
  const { d, log } = deps({ generateReply: (async () => (log.push('model'), { status: 'ok', value: { insight: factual, followUpQuestion: null, missingInformation: null } })) as never });
  const res = await handleExploration('moment-reply', body(e, { momentId: 'm1' }), {}, d);
  assert.equal(res.status, 200);
  assert.deepEqual(log, ['rate', 'reserve-moment', 'model'], 'no refund: the per-dream cap still bounds the cost');
  assert.equal((res.body as { retryAllowed?: boolean }).retryAllowed, true);
  e = X.receiveReply(e, 'm1', factual as never, null);
  assert.equal(planCall('moment-reply', e, 'm1')?.kind, 'reply', 'one retry for an interpretive insight');
  e = X.receiveReply(e, 'm1', factual as never, null);
  assert.equal(planCall('moment-reply', e, 'm1'), null, 'never a second retry');
});

test('a whole view that fails every check: 200 with the verified summary, the slot returned once', async () => {
  let e = X.beginMoment(one(), 'm1', 'מה שמעת כשהדלתות נסגרו?', 'adaptive', T);
  e = X.answerMoment(e, 'm1', 'שקט מוזר');
  e = X.receiveReply(e, 'm1', { observation: 'א', reflection: 'ב', possibility: 'אולי ג' }, null);
  e = X.completeMoment(e, 'm1', T);
  const summary = { kind: 'factual-summary', notice: 'זה עדיין לא המבט השלם', overview: '', connections: [], recurring: null, contrast: null, readings: [], closingQuestion: '' };
  const { d, log } = deps({ generateWhole: (async () => (log.push('model'), { status: 'ok', value: summary })) as never });
  const res = await handleExploration('whole-view', body(e), {}, d);
  assert.equal(res.status, 200);
  assert.equal((res.body as { wholeView?: { kind?: string } }).wholeView?.kind, 'factual-summary');
  assert.deepEqual(log, ['rate', 'reserve-whole', 'model', 'refund-whole']);
});

// ------------------------------------------------------------------------------------------------ what the checks cannot do (kept visible)

test.todo('Hebrew that is grammatical word by word but broken as a phrase ("התחושה שלך שלבד וגעגוע") is not caught by a deterministic check');
