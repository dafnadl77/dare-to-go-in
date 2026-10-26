import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as X from '../src/hero/exploration.ts';
import * as Sch from '../src/hero/explorationSchema.ts';
import { typedAnalysis } from '../src/demo/demoRouter.ts';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema.ts';
import { segmentDream, segmentsForMoment } from '../src/hero/dreamSegments.ts';
import { explorationContext, generateMomentQuestion, generateMomentReply, planCall } from '../server/routes/dreamExploration.ts';
import * as G from './fixtures/goldenSet.ts';

/**
 * THE INTERPRETATION LAYER IN THE REAL FLOW (doc 50 v2, phase 2): the schema the model fills, the route that chooses by quality, the
 * inviting question with its limits, and the planned kind of question. Written BEFORE the flow was changed
 * (docs/upgrade-2026-10/53-phase2-flow-tests-before.txt). The model is a stub: no network, no AI call.
 */

const T = new Date('2026-10-22T10:00:00Z');
const stub = (json: unknown) => ({ responses: { create: async () => ({ model: 'stub', output_text: JSON.stringify(json), usage: { input_tokens: 0, output_tokens: 0 } }) } }) as never;
const sch = Sch as unknown as Record<string, any>;

function journey(k: G.DreamKey, moments: string[]) {
  const segments = segmentDream(G.DREAM[k]);
  let e = X.createExploration(`flow-${k}`, moments.map((m) => ({ label: m.split(' ').slice(0, 3).join(' '), excerpt: m })));
  const segmentsOf = (id: string) => {
    const m = e.moments.find((x) => x.id === id);
    return m ? segmentsForMoment(segments, m) : [];
  };
  const ctx = () => explorationContext({ ...(typedAnalysis(G.DREAM[k], true) as unknown as DreamAnalysis), sourceText: G.DREAM[k] }, e, 'he', G.ADDRESS[k], []);
  const explore = (id: string, question: string, answer: string, followUp?: { question: string; answer: string }) => {
    e = X.beginMoment(e, id, question, 'adaptive', T);
    e = X.answerMoment(e, id, answer);
    e = X.receiveReply(e, id, { observation: 'ת', reflection: 'ש', possibility: 'אולי פ' }, followUp ? followUp.question : null);
    if (followUp) {
      e = X.answerFollowUp(e, id, followUp.answer);
      e = X.receiveRefreshedInsight(e, id, { observation: 'ת', reflection: 'ש', possibility: 'אולי פ' });
    }
    e = X.completeMoment(e, id, T);
  };
  const ask = (id: string, question: string, answer: string) => {
    e = X.beginMoment(e, id, question, 'adaptive', T);
    e = X.answerMoment(e, id, answer);
    return planCall('moment-reply', e, id, segmentsOf);
  };
  return { e: () => e, segmentsOf, ctx, explore, ask };
}

// ------------------------------------------------------------------------------------------------ the schema the model fills

test('schema: each possibility comes with its source card, three candidates, and an inviting question for when none is worth showing', () => {
  const items = sch.MOMENT_REPLY_JSON_SCHEMA.properties.possibilities.items;
  for (const field of ['text', 'anchors', 'relation', 'relationBasis', 'aboutHer', 'openEdge']) assert.ok(items.required.includes(field), field);
  assert.ok(sch.MOMENT_REPLY_JSON_SCHEMA.required.includes('invitation'));
  const prompt: string = sch.buildMomentReplySystemPrompt('he', 'feminine');
  assert.ok(/THREE/.test(prompt) && /anchors/.test(prompt), 'asks for three candidates with anchors');
  assert.ok(/accurate observation/i.test(prompt), 'says an accurate observation is better than a forced insight (her note 1)');
  assert.ok(/פותח מרחב/.test(prompt), 'names the therapy-like wording to avoid');
});

test('parse: a card is read; an older reply without cards is still read (its sentences rest on ids)', () => {
  const now = sch.parseMomentReply({
    dream: [],
    user: [],
    possibilities: [{ text: 'אולי…', anchors: [{ quote: 'א', from: 'dream' }, { quote: 'ב', from: 'answer' }], relation: 'contrast', relationBasis: ['א'], aboutHer: [], openEdge: 'x' }],
    invitation: 'מה עוד?',
    missingInformation: '',
    followUpQuestion: '',
  });
  assert.equal(now.possibilities[0].card.relation, 'contrast');
  assert.equal(now.possibilities[0].card.anchors.length, 2);
  assert.equal(now.invitation, 'מה עוד?');
  const old = sch.parseMomentReply({ dream: [], user: [], possibilities: [{ basis: ['u0'], text: 'אולי…' }], missingInformation: '', followUpQuestion: '' });
  assert.equal(old.possibilities[0].card ?? null, null);
  assert.deepEqual(old.possibilities[0].basis, ['u0']);
});

// ------------------------------------------------------------------------------------------------ the route

test('reply: the route shows the best candidate, not the first that passes', async () => {
  const W13 = G.WRITTEN.find((w) => w.id === 'W13')!;
  const old = G.OLDER.W13;
  const j = journey('sealed3', ['והכלב עומד ברחוב וממשיך ללכת אחורה עד שהוא נעלם מאחורי פינה ואני רוצה לרוץ אחריו אבל הרגליים שלי נשארות דבוקות לחול']);
  const plan = j.ask('m1', 'מה הרגשת כשהכלב המשיך ללכת אחורה?', G.ANSWERS.sealed3[2]);
  assert.ok(plan && plan.kind === 'reply');
  const card = (e: G.Example) => ({ text: e.text, anchors: e.card!.anchors, relation: e.card!.relation, relationBasis: e.card!.basis, aboutHer: [], openEdge: e.card!.openEdge });
  const out = await generateMomentReply(stub({ dream: [], user: [], possibilities: [card(old), card(W13)], invitation: '', missingInformation: '', followUpQuestion: '' }), j.ctx(), plan as never);
  assert.equal(out.status, 'ok');
  if (out.status === 'ok') assert.equal(out.value.insight.possibility, W13.text);
});

test('reply: with nothing worth showing, the inviting question becomes the follow-up question; never more than two in a journey', async () => {
  const bus = 'חיכיתי, ואף אוטובוס לא עצר';
  const tea = 'על הספסל לידי היה ספל תה חם, והאדים ממנו ירדו למטה, אל החול';
  const j = journey('acc3', [bus, tea]);
  j.explore('m1', 'מה בלט לך בזה שאף אוטובוס לא עצר?', G.ANSWERS.acc3[0]);
  const plan = j.ask('m2', 'מה תפס את העין שלך בספל התה?', G.ANSWERS.acc3[2]);
  const echo = { text: 'אולי אפשר לראות בספל התה החם מקום שבו מורגשת חמימות בניגוד לסביבה.', anchors: [{ quote: 'ספל תה חם', from: 'dream' }, { quote: 'תחושה של חמימות בניגוד לסביבה', from: 'answer' }], relation: 'side-by-side', relationBasis: [], aboutHer: [], openEdge: '' };
  const out = await generateMomentReply(stub({ dream: [], user: [], possibilities: [echo], invitation: G.QUESTIONS.W9.question, missingInformation: '', followUpQuestion: '' }), j.ctx(), plan as never);
  assert.equal(out.status, 'ok');
  if (out.status === 'ok') {
    assert.equal(out.value.insight.possibility, '', `no possibility: "${out.value.insight.possibility}"`);
    assert.equal(out.value.followUpQuestion, G.QUESTIONS.W9.question);
  }

  // a journey that already had two follow-up questions gets no third
  const k = journey('acc3', ['ישבתי בתחנת אוטובוס ליד הים, לפנות ערב', bus, tea]);
  k.explore('m1', 'מה ראית בתחנה?', G.ANSWERS.acc3[1], { question: 'מה עוד היה שם?', answer: 'הים.' });
  k.explore('m2', 'מה בלט לך בזה שאף אוטובוס לא עצר?', G.ANSWERS.acc3[0], { question: 'מי חלף שם?', answer: 'אנשים.' });
  const p3 = k.ask('m3', 'מה תפס את העין שלך בספל התה?', G.ANSWERS.acc3[2]);
  const third = await generateMomentReply(stub({ dream: [], user: [], possibilities: [echo], invitation: G.QUESTIONS.W9.question, missingInformation: '', followUpQuestion: '' }), k.ctx(), p3 as never);
  if (third.status === 'ok') assert.equal(third.value.followUpQuestion, null);
});

test('question: the plan carries the kind of question for the moment, and the input tells the model', () => {
  const j = journey('acc1', [G.QUESTIONS.W2.moment]);
  const plan = planCall('moment-question', j.e(), 'm1', j.segmentsOf) as unknown as { plannedFocus?: string };
  assert.equal(plan.plannedFocus, 'feeling');
  const input: string = sch.buildMomentQuestionInput({ sourceText: G.DREAM.acc1, segments: segmentDream(G.DREAM.acc1), prior: [], moment: { id: 'm1', label: 'x', segments: j.segmentsOf('m1') }, otherMoments: [], alternative: null, plannedFocus: 'feeling' });
  assert.ok(/KIND OF QUESTION/.test(input), input.slice(-300));
});

test('question: among passing candidates the route asks the better one (not "what stood out" again), not the first', async () => {
  const j = journey('acc3', ['חיכיתי, ואף אוטובוס לא עצר', 'על הספסל לידי היה ספל תה חם, והאדים ממנו ירדו למטה, אל החול']);
  j.explore('m1', 'מה הדבר הראשון שמשך את תשומת הלב שלך בזה שאף אוטובוס לא עצר?', G.ANSWERS.acc3[0]);
  const plan = planCall('moment-question', j.e(), 'm2', j.segmentsOf);
  assert.ok(plan && plan.kind === 'question');
  const again = { question: 'מה הדבר הראשון שתפס את העין שלך בספל התה החם הזה על הספסל?', focus: 'salience', subject: 'ספל', buildsOn: '' };
  const better = { question: 'מה מוזר בעינייך באדים שירדו מהתה למטה, אל החול?', focus: 'surprise', subject: 'אדים', buildsOn: '' };
  const out = await generateMomentQuestion(stub({ candidates: [again, better] }), j.ctx(), plan as never);
  assert.equal(out.status, 'ok');
  if (out.status === 'ok') assert.equal(out.value.question, better.question);
});
