import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as X from '../src/hero/exploration.ts';
import * as Sch from '../src/hero/explorationSchema.ts';
import { typedAnalysis } from '../src/demo/demoRouter.ts';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema.ts';
import { segmentDream, segmentsForMoment } from '../src/hero/dreamSegments.ts';
import * as R from '../server/routes/dreamExploration.ts';
import { createExplorationEngine } from '../src/hero/explorationEngineCore.ts';

/**
 * DOC 90 v3, step 3, IN THE REAL FLOW: the reply the model fills (pairs, not possibilities), the route (pacing, one pair at most, no
 * paid retry when there is none), the journey's data (a pair and its answer kept in the existing follow-up slot, no database change),
 * the browser side, and the whole view. The model is a stub built from the real acc2-1 outputs: no network, no AI call.
 */

const T = new Date('2026-10-23T10:00:00Z');
const run = JSON.parse(readFileSync('docs/upgrade-2026-10/33-stage3b-fix-eval-acc2-1.json', 'utf8'));
const STORE = (JSON.parse(readFileSync('docs/upgrade-2026-10/74-acceptance-dreams-2.json', 'utf8')) as { text: string }[])[1].text;
const R_ = R as unknown as Record<string, any>;
const X_ = X as unknown as Record<string, any>;
const Sch_ = Sch as unknown as Record<string, any>;

let calls = 0;
const stub = (json: unknown) => {
  calls = 0;
  return { responses: { create: async () => ((calls += 1), { model: 'stub', output_text: JSON.stringify(json), usage: { input_tokens: 0, output_tokens: 0 } }) } } as never;
};

/** The store journey of acc2-1: tree, box, then leaving the store (moment 3), with the real answers. */
function storeJourney() {
  const segments = segmentDream(STORE);
  let e = X.createExploration('pair-store', [
    { label: 'המוכר לתוך העץ', excerpt: 'כשאני מרים את הראש, המוכר כבר לא איש אלא עץ זית קטן בתוך עציץ' },
    { label: 'המוכר עם הקופסה', excerpt: 'המוכר, איש מבוגר עם משקפיים עבים, מושיט לי קופסה מלאה ברגים, ואני מחפש ומחפש ולא מוצא את המידה הנכונה' },
    { label: 'יוצא מהחנות ריק', excerpt: 'אני יוצא מהחנות בלי כלום ביד' },
    { label: 'אומר בשקט', excerpt: 'והוא אומר לי בשקט: "אתה כבר יודע איזה צריך' },
  ]);
  const segmentsOf = (id: string) => {
    const m = e.moments.find((x) => x.id === id);
    return m ? segmentsForMoment(segments, m) : [];
  };
  const ctx = () => R.explorationContext({ ...(typedAnalysis(STORE, true) as unknown as DreamAnalysis), sourceText: STORE }, e, 'he', 'masculine', []);
  const listen = (id: string, question: string, answer: string) => {
    e = X.beginMoment(e, id, question, 'adaptive', T);
    e = X.answerMoment(e, id, answer);
    e = X.receiveReply(e, id, { observation: 'ת', reflection: 'אמרת ש…', possibility: '', kind: 'listening' } as never, null);
    e = X.completeMoment(e, id, T);
  };
  const ask = (id: string, question: string, answer: string) => {
    e = X.beginMoment(e, id, question, 'adaptive', T);
    e = X.answerMoment(e, id, answer);
    return R.planCall('moment-reply', e, id, segmentsOf);
  };
  return { e: () => e, set: (x: X.Exploration) => (e = x), ctx, listen, ask };
}

const steps = run.journeys[1].steps;
/** The model's reply for the leaving moment, in the new shape, with the real anchors of #31 and #30. */
const leavingReply = {
  dream: [{ segment: 8, action: 'יוצא', actor: 'dreamer', target: '', text: 'יצאת מהחנות בלי כלום ביד.' }],
  user: [
    { quote: 'הבנתי שאני מחפש משהו, אבל בעצם ידעתי כבר מה אני צריך', text: 'אמרת שהבנת שאתה מחפש משהו, אבל בעצם ידעת כבר מה אתה צריך.' },
    { quote: 'הרגשתי חוסר ומוזרות', text: 'אמרת שהרגשת חוסר ומוזרות.' },
  ],
  pairs: [
    { a: { quote: 'הרגשתי חוסר ומוזרות', from: 'answer' }, b: { quote: 'יצאת מהחנות בלי כלום ביד', from: 'dream' }, relation: 'negation', question: 'מה אתה רואה כשהם עומדים יחד?' },
    { a: { quote: 'יצאת מהחנות בלי כלום ביד', from: 'dream' }, b: { quote: 'אבל בעצם ידעתי כבר מה אני צריך', from: 'answer' }, relation: 'negation', question: 'מה ההבדל בעיניך בין השניים?' },
    { a: { quote: 'הבנתי שאני מחפש משהו', from: 'answer' }, b: { quote: 'אבל בעצם ידעתי כבר מה אני צריך', from: 'answer' }, relation: 'negation', question: 'מה אתה רואה כשהם עומדים יחד?' },
  ],
  missingInformation: '',
  followUpQuestion: '',
};

// ------------------------------------------------------------------------------------------------ the schema and the prompt

test('the reply schema asks for pairs (two exact quotes, one of three relations, a question), up to three, and no possibility', () => {
  const schema = Sch_.PAIR_REPLY_JSON_SCHEMA;
  assert.ok(schema, 'PAIR_REPLY_JSON_SCHEMA');
  assert.deepEqual(schema.required.slice().sort(), ['dream', 'followUpQuestion', 'missingInformation', 'pairs', 'user'].sort());
  const item = schema.properties.pairs.items;
  assert.deepEqual(item.properties.relation.enum, ['negation', 'change', 'wanted-not-managed']);
  assert.equal(schema.properties.pairs.maxItems, 3);
  assert.equal(schema.properties.possibilities, undefined);
});

test('the pair prompt: exact quotes, the three relations, never says what joins them, a plain question; no test dream inside', () => {
  const p = Sch_.buildPairReplySystemPrompt('he', 'masculine') as string;
  assert.match(p, /EXACTLY/);
  assert.match(p, /negation/);
  assert.match(p, /wanted-not-managed/);
  assert.match(p, /never say what joins them|Never say what joins/i);
  assert.doesNotMatch(p, /"possibilities"/);
  for (const d of JSON.parse(readFileSync('docs/upgrade-2026-10/74-acceptance-dreams-2.json', 'utf8')) as { text: string }[])
    for (const piece of d.text.split(/[,.]/).map((x) => x.trim()).filter((x) => x.split(' ').length >= 4)) assert.ok(!p.includes(piece), `the prompt holds a test dream: ${piece}`);
  // the input says whether a pair may be offered now
  const input = Sch_.buildPairReplyInput({ sourceText: STORE, segments: segmentDream(STORE), prior: [], moment: { id: 'm1', label: 'x', segments: [5] }, question: 'q', answer: 'a', followUp: null, feelings: '', pairsNow: false }) as string;
  assert.match(input, /PAIRS: NOT NOW/);
});

// ------------------------------------------------------------------------------------------------ the route

test('the live route uses the pair reply (realExplorationDeps)', () => {
  assert.equal(R.realExplorationDeps.generateReply, R_.generatePairReply);
  assert.equal(R.realExplorationDeps.generateWhole, R_.generateListeningWhole);
});

test('real store moment 3: one pair, in the dream\'s words, the plain question, the reflection does not say it first; one call', async () => {
  const j = storeJourney();
  j.listen('m1', steps[0].question.text, steps[0].answer);
  j.listen('m2', 'איזה פרט בקופסה המלאה ברגים הכי תפס את העין שלך ברגע הזה?', 'מגוון הברגים. היו שם סוגים שונים, אבל אף אחד מהם לא היה מה שהייתי צריך באמת.');
  const plan = j.ask('m3', 'מה עבר לך בראש כשיצאת מהחנות בלי כלום ביד?', 'הבנתי שאני מחפש משהו, אבל בעצם ידעתי כבר מה אני צריך. הרגשתי חוסר ומוזרות.');
  assert.equal(plan?.kind, 'reply');
  const out = await R_.generatePairReply(stub(leavingReply), j.ctx(), plan);
  assert.equal(out.status, 'ok');
  assert.equal(calls, 1);
  const ins = out.value.insight;
  assert.equal(ins.kind, 'listening');
  assert.equal(ins.possibility, '');
  assert.deepEqual([ins.pair.a.quote, ins.pair.b.quote], ['אני יוצא מהחנות בלי כלום ביד', 'בעצם ידעתי כבר מה אני צריך']);
  assert.equal(ins.pair.question, 'מה אתה רואה כשהם עומדים יחד?', 'the leading question was replaced');
  assert.equal(out.value.followUpQuestion, ins.pair.question);
  assert.equal(ins.reflection, 'אמרת שהרגשת חוסר ומוזרות.');
  assert.doesNotMatch(ins.observation, /בלי כלום ביד/, 'the dream line does not say the pair first');
});

test('the first moment only listens: even when the model writes a pair, none is shown, and the model was told so', async () => {
  const j = storeJourney();
  const plan = j.ask('m3', 'מה עבר לך בראש כשיצאת מהחנות בלי כלום ביד?', 'הבנתי שאני מחפש משהו, אבל בעצם ידעתי כבר מה אני צריך. הרגשתי חוסר ומוזרות.');
  const out = await R_.generatePairReply(stub(leavingReply), j.ctx(), plan);
  assert.equal(out.value.insight.pair, undefined);
  assert.equal(out.value.followUpQuestion, null);
  assert.equal(calls, 1);
});

test('no pair passes: no paid retry, the moment is a listening one (not "factual"), and no retry is offered', async () => {
  const j = storeJourney();
  j.listen('m1', steps[0].question.text, steps[0].answer);
  j.listen('m2', 'איזה פרט בקופסה המלאה ברגים הכי תפס את העין שלך ברגע הזה?', 'מגוון הברגים. היו שם סוגים שונים, אבל אף אחד מהם לא היה מה שהייתי צריך באמת.');
  const plan = j.ask('m3', 'מה עבר לך בראש כשיצאת מהחנות בלי כלום ביד?', 'הבנתי שאני מחפש משהו, אבל בעצם ידעתי כבר מה אני צריך. הרגשתי חוסר ומוזרות.');
  const out = await R_.generatePairReply(stub({ ...leavingReply, pairs: [leavingReply.pairs[2]] }), j.ctx(), plan);
  assert.equal(calls, 1, 'no second call');
  assert.equal(out.value.insight.kind, 'listening');
  assert.equal(out.value.insight.pair, undefined);
  let e = X.receiveReply(j.e(), 'm3', out.value.insight, out.value.followUpQuestion);
  assert.equal(X.needsReplyCall(e, 'm3'), false, 'no retry call');
  e = X.completeMoment(e, 'm3', T);
  assert.equal(e.explored.m3.status, 'explored');
});

// ------------------------------------------------------------------------------------------------ the journey's data

test('a pair and its answer: kept in the follow-up slot, given back by code, no refresh call, the moment closes', () => {
  const j = storeJourney();
  j.listen('m1', steps[0].question.text, steps[0].answer);
  j.ask('m2', 'q', 'הבנתי שאני מחפש משהו, אבל בעצם ידעתי כבר מה אני צריך. הרגשתי חוסר ומוזרות.');
  const pairData = { a: { quote: 'אני יוצא מהחנות בלי כלום ביד', from: 'dream' }, b: { quote: 'בעצם ידעתי כבר מה אני צריך', from: 'answer' }, question: 'מה אתה רואה כשהם עומדים יחד?' };
  let e = X.receiveReply(j.e(), 'm2', { observation: '', reflection: 'אמרת שהרגשת חוסר ומוזרות.', possibility: '', kind: 'listening', pair: pairData } as never, pairData.question);
  assert.deepEqual((e.explored.m2.insight as any).pair, pairData);
  assert.equal(e.explored.m2.followUp?.question, pairData.question);
  e = X.answerFollowUp(e, 'm2', 'אולי ידעתי, ופשוט לא לקחתי את זה.');
  assert.equal(X.needsReplyCall(e, 'm2'), false, 'her answer to a pair is given back by code');
  e = X.completeMoment(e, 'm2', T);
  assert.equal(e.explored.m2.status, 'explored');
  // stored and read back (the dream's saved record): the pair stays, older records are unchanged
  const back = X.parseExploration(JSON.parse(JSON.stringify(e)));
  assert.deepEqual((back?.explored.m2.insight as any).pair, pairData);
  assert.equal(back?.explored.m2.insight?.kind, 'listening');
  assert.equal(back?.explored.m1.insight?.kind, 'listening');
});

test('a skipped pair closes the moment too', () => {
  const j = storeJourney();
  j.listen('m1', steps[0].question.text, steps[0].answer);
  j.ask('m2', 'q', 'הבנתי שאני מחפש משהו, אבל בעצם ידעתי כבר מה אני צריך.');
  const pairData = { a: { quote: 'אני יוצא מהחנות בלי כלום ביד', from: 'dream' }, b: { quote: 'בעצם ידעתי כבר מה אני צריך', from: 'answer' }, question: 'מה אתה רואה כשהם עומדים יחד?' };
  let e = X.receiveReply(j.e(), 'm2', { observation: 'ת', reflection: 'ש', possibility: '', kind: 'listening', pair: pairData } as never, pairData.question);
  e = X.answerFollowUp(e, 'm2', null);
  e = X.completeMoment(e, 'm2', T);
  assert.equal(e.explored.m2.status, 'explored');
});

test('older insights keep their behaviour: a factual one still gets its one retry', () => {
  const j = storeJourney();
  j.ask('m1', 'q', 'עץ הזית הקטן היה פשוט וקליל.');
  const e = X.receiveReply(j.e(), 'm1', { observation: 'ת', reflection: 'ש', possibility: '', kind: 'factual' }, null);
  assert.equal(X.needsReplyCall(e, 'm1'), true);
});

test('the browser side keeps the pair and the listening kind it receives', async () => {
  const pairData = { a: { quote: 'אני יוצא מהחנות בלי כלום ביד', from: 'dream' }, b: { quote: 'בעצם ידעתי כבר מה אני צריך', from: 'answer' }, question: 'מה אתה רואה כשהם עומדים יחד?' };
  const engine = createExplorationEngine({ post: async () => ({ status: 200, data: { insight: { observation: '', reflection: 'אמרת ש…', possibility: '', kind: 'listening', pair: pairData }, followUpQuestion: pairData.question, refreshed: false, retryAllowed: false } }) });
  const j = storeJourney();
  j.ask('m1', 'q', 'הבנתי שאני מחפש משהו.');
  const out = await engine.reply(j.e(), { ...(typedAnalysis(STORE, true) as unknown as DreamAnalysis), sourceText: STORE }, 'm1', 'he', []);
  assert.equal(out.status, 'ok');
  if (out.status === 'ok') {
    assert.equal(out.insight.kind, 'listening');
    assert.deepEqual((out.insight as any).pair, pairData);
  }
});

// ------------------------------------------------------------------------------------------------ the whole view

test('the whole view through the route: no technical notice, nothing the pair already showed, a conversational closing', async () => {
  const j = storeJourney();
  j.listen('m1', steps[0].question.text, steps[0].answer);
  const pairData = { a: { quote: 'אני יוצא מהחנות בלי כלום ביד', from: 'dream' }, b: { quote: 'בעצם ידעתי כבר מה אני צריך', from: 'answer' }, question: 'מה אתה רואה כשהם עומדים יחד?' };
  let e = j.e();
  e = X.beginMoment(e, 'm3', 'q', 'adaptive', T);
  e = X.answerMoment(e, 'm3', 'הבנתי שאני מחפש משהו, אבל בעצם ידעתי כבר מה אני צריך. הרגשתי חוסר ומוזרות.');
  e = X.receiveReply(e, 'm3', { observation: '', reflection: 'אמרת שהרגשת חוסר ומוזרות.', possibility: '', kind: 'listening', pair: pairData } as never, pairData.question);
  e = X.answerFollowUp(e, 'm3', 'אולי ידעתי, ופשוט לא לקחתי את זה.');
  e = X.completeMoment(e, 'm3', T);
  j.set(e);
  const plan = R.planCall('whole-view', e, null, (id) => segmentsForMoment(segmentDream(STORE), e.moments.find((m) => m.id === id)!));
  assert.equal(plan?.kind, 'whole');
  // the real whole-view response of the store journey (it repeats "ידעת… מה אתה צריך" and closes with "…אם בכלל?")
  const real = run.responses.filter((r: any) => r.stage === 'whole-view').map((r: any) => JSON.parse(r.text)).find((x: any) => JSON.stringify(x).includes('ידעת מה אתה צריך'));
  assert.ok(real, 'the real response');
  const out = await R_.generateListeningWhole(stub(real), j.ctx(), plan);
  assert.equal(out.status, 'ok');
  const v = out.value;
  assert.equal(v.notice, null);
  const shown = [v.overview, v.recurring ?? '', v.contrast ?? '', v.closingQuestion, ...v.readings.map((r: any) => r.reading), ...v.connections.flatMap((c: any) => [c.title, c.basis])].join(' ');
  assert.doesNotMatch(shown, /ידעת\S* (כבר )?מה את\S* צריך|יוצא מהחנות בלי כלום ביד/);
  assert.doesNotMatch(v.closingQuestion, /אם בכלל|מזכיר/);
});
