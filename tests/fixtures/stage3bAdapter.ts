/**
 * How the failure cases (stage3bFix.ts) reach a pipeline. THIS VERSION DRIVES THE NEW PIPELINE (stage 3b fix round, doc 30), end to
 * end: the real generation functions of the route (generateMomentQuestion / generateMomentReply / generateWholeView) with a fake model
 * that returns the case's answer on EVERY attempt, so the retries, the refusal of an exhausted quality check and the fallbacks all run
 * as they would in production. What they return is what the dreamer would see.
 *
 * The version that drove the old pipeline is recorded in docs/upgrade-2026-10/32-stage3b-fix-tests-before.txt (30 of 33 failed).
 * The cases and the test file are unchanged, except one expectation corrected before the fix was written (see stage3bFix.ts).
 */
import { DREAMS, type DreamKey, type QuestionCase, type ReplyCase, type WholeCase } from './stage3bFix.ts';
import { typedAnalysis } from '../../src/demo/demoRouter.ts';
import type { DreamAnalysis } from '../../src/hero/dreamAnalysisSchema.ts';
import * as X from '../../src/hero/exploration.ts';
import { eventOrder as order, momentGroups, segmentDream, segmentsForMoment } from '../../src/hero/dreamSegments.ts';
import { checkLabel } from '../../src/hero/claimCheck.ts';
import { isUnsureAnswer } from '../../src/hero/hebrewText.ts';
import { explorationContext, generateMomentQuestion, generateMomentReply, generateWholeView, planCall } from '../../server/routes/dreamExploration.ts';
import { runWithLanguageIntegrity } from '../../server/languageGuard.ts';

export const PIPELINE = 'new';

export interface Shown {
  shown: string[];
  kind: string | null;
}

const T = new Date('2026-10-21T10:00:00Z');

/** A model that always answers the same JSON (every retry gets the same content). */
const fakeClient = (json: unknown) =>
  ({ responses: { create: async () => ({ model: 'fake', output_text: JSON.stringify(json), usage: { input_tokens: 0, output_tokens: 0 } }) } }) as never;

const analysisFor = (dream: DreamKey) => typedAnalysis(DREAMS[dream], true) as unknown as DreamAnalysis;
const segIdFor = (dream: DreamKey, text: string | undefined) => {
  if (!text) return -1;
  const segs = segmentDream(DREAMS[dream]);
  return (segs.find((s) => s.text.includes(text)) ?? segs.find((s) => text.includes(s.text)))?.id ?? -1;
};
const segmentsOf = (dream: DreamKey, e: X.Exploration) => (id: string) => {
  const m = e.moments.find((x) => x.id === id);
  return m ? segmentsForMoment(segmentDream(DREAMS[dream]), m) : [];
};

export function moments(dream: DreamKey, analysis: DreamAnalysis): { label: string; text: string }[] {
  return momentGroups(DREAMS[dream], analysis.unusualElements ?? []).slice(0, X.MAX_MOMENTS).map((g) => ({ label: g.text, text: g.text }));
}

export function label(momentText: string, candidate: string): string {
  return checkLabel(candidate, momentText, []);
}

function explore(e: X.Exploration, id: string, x: { question: string; answer: string; followUp?: { question: string; answer: string } }, focus?: X.QuestionFocus, subject?: string): X.Exploration {
  e = X.beginMoment(e, id, x.question, 'adaptive', T);
  if (focus) e = X.setQuestionFocus(e, id, focus, subject ?? null);
  e = X.answerMoment(e, id, x.answer);
  if (isUnsureAnswer(x.answer)) {
    e = X.receiveUnsureLook(e, id, '«…»');
    return X.completeMoment(e, id, T);
  }
  e = X.receiveReply(e, id, { observation: 'ת', reflection: 'ש', possibility: 'אולי פ' }, x.followUp ? x.followUp.question : null);
  if (x.followUp) {
    e = X.answerFollowUp(e, id, x.followUp.answer);
    e = X.receiveRefreshedInsight(e, id, { observation: 'ת', reflection: 'ש', possibility: 'אולי פ' });
  }
  return X.completeMoment(e, id, T);
}

export async function reply(c: ReplyCase): Promise<Shown> {
  let e = X.createExploration('fx', [{ label: c.momentText, excerpt: c.momentText }]);
  e = X.beginMoment(e, 'm1', c.question, 'adaptive', T);
  e = X.answerMoment(e, 'm1', c.answer);
  if (c.followUp) {
    e = X.receiveReply(e, 'm1', { observation: 'ת', reflection: 'ש', possibility: 'אולי פ' }, c.followUp.question);
    e = X.answerFollowUp(e, 'm1', c.followUp.answer);
  }
  const plan = planCall('moment-reply', e, 'm1', segmentsOf(c.dream, e));
  if (!plan || plan.kind !== 'reply') throw new Error('no reply plan');
  const json = {
    dream: c.model.dream.map((d) => ({ segment: segIdFor(c.dream, d.segmentText), action: d.action, actor: d.actor, target: d.target, text: d.text })),
    user: c.model.user,
    possibilities: c.model.possibilities,
    missingInformation: '',
    followUpQuestion: '',
  };
  const out = await generateMomentReply(fakeClient(json), explorationContext(analysisFor(c.dream), e, 'he', 'feminine', []), plan);
  if (out.status !== 'ok') return { shown: [], kind: out.status };
  const i = out.value.insight;
  return { shown: [i.observation, i.reflection, i.possibility], kind: i.kind };
}

export async function whole(c: WholeCase): Promise<Shown> {
  const seeds = [...c.explored.map((x) => x.momentText), ...c.unexplored].map((t) => ({ label: t, excerpt: t }));
  let e = X.createExploration('fx', seeds);
  c.explored.forEach((x, i) => (e = explore(e, `m${i + 1}`, x)));
  const plan = planCall('whole-view', e, null, segmentsOf(c.dream, e));
  if (!plan || plan.kind !== 'whole') throw new Error('no whole plan');
  const m = (i: number | null | undefined) => (i === null || i === undefined ? '' : `m${i + 1}`);
  const json = {
    overview: c.model.overview.map((o) => ({ source: o.source, segment: segIdFor(c.dream, o.segmentText), action: o.action ?? '', actor: o.actor ?? '', target: o.target ?? '', moment: m(o.moment), quote: o.quote ?? '', basis: o.basis ?? [], text: o.text })),
    connections: c.model.connections.map((x) => ({ from: m(x.from), to: m(x.to), title: x.title, fromQuote: x.fromQuote, toQuote: x.toQuote, link: x.link })),
    recurring: c.model.recurring ? { element: c.model.recurring.element, text: c.model.recurring.text, quotes: c.model.recurring.quotes.map((q) => ({ moment: m(q.moment), quote: q.quote })) } : { element: '', text: '', quotes: [] },
    contrast: c.model.contrast ? { text: c.model.contrast.text, quotes: c.model.contrast.quotes.map((q) => ({ moment: m(q.moment), quote: q.quote })) } : { text: '', quotes: [] },
    readings: c.model.readings.map((r) => ({ segment: segIdFor(c.dream, r.segmentText), text: r.text })),
    closing: { text: c.model.closing.text, moment: m(c.model.closing.moment), quote: c.model.closing.quote },
  };
  const out = await generateWholeView(fakeClient(json), explorationContext(analysisFor(c.dream), e, 'he', 'feminine', []), plan);
  if (out.status !== 'ok') return { shown: [], kind: out.status };
  const v = out.value;
  const invited = (v.invite ?? []).map((id) => e.moments.find((x) => x.id === id)?.label ?? '');
  return {
    shown: [v.notice ?? '', v.overview, ...v.connections.flatMap((x) => [x.title, x.basis]), v.recurring ?? '', v.contrast ?? '', ...v.readings.map((r) => r.reading), v.closingQuestion, ...invited],
    kind: v.kind,
  };
}

export async function question(c: QuestionCase): Promise<string> {
  let e = X.createExploration('fx', [...c.prior.map((p) => p.momentText), c.momentText].map((t) => ({ label: t, excerpt: t })));
  c.prior.forEach((p, i) => (e = explore(e, `m${i + 1}`, p, p.focus, p.subject)));
  const id = `m${c.prior.length + 1}`;
  const plan = planCall('moment-question', e, id, segmentsOf(c.dream, e));
  if (!plan || plan.kind !== 'question') throw new Error('no question plan');
  const out = await generateMomentQuestion(fakeClient({ candidates: c.model }), explorationContext(analysisFor(c.dream), e, 'he', 'feminine', []), plan);
  return out.status === 'ok' ? out.value.question : '';
}

export function eventOrder(dream: DreamKey, a: string, b: string): 'before' | 'after' | 'unknown' | null {
  return order(segmentDream(DREAMS[dream]), segIdFor(dream, a), segIdFor(dream, b));
}

export async function gateRejectsExhausted(): Promise<boolean> {
  const outcome = await runWithLanguageIntegrity(async () => ({ text: 'טקסט' }), (v) => [v.text], {
    route: 'test',
    language: 'he',
    context: '',
    qualityCheck: () => '\n\nCORRECTION: always.',
    maxQualityRetries: 2,
    rejectExhaustedQuality: true,
  });
  return outcome.status !== 'ok';
}
