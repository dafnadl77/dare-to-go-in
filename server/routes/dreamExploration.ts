import OpenAI from 'openai';
import { getOpenAIClient } from '../openaiClient.js';
import { okResult, errorResult, withHeaders, type HandlerResult } from '../httpResult.js';
import { resolveCallerIdentity, type CallerIdentity, type RequestHeaders, type ResolveCallerResult } from '../callerIdentity.js';
import {
  completeTrialAttempt,
  getTrialAttemptState,
  refundLabelsAttempt,
  refundReflectionAttempt,
  reserveLabelsAttempt,
  reserveReflectionAttempt,
} from '../dreamAttempts.js';
import { FREE_DREAM_USED_MESSAGE, MAX_LABEL_CALLS_PER_ATTEMPT } from '../trialAllowance.js';
import { databaseRateLimitStore, enforceRateLimits, explorationRules, type RateDecision } from '../rateLimit.js';
import { runWithLanguageIntegrity } from '../languageGuard.js';
import { logModelUsed, resolveStageModel } from '../stageModel.js';
import { resolveAddressPreference } from './dreamReflection.js';
import { validateDreamAnalysis, type DreamAnalysis } from '../../src/hero/dreamAnalysisSchema.js';
import { computeDreamDepth, maxAlternativeReadings, type DreamDepth } from '../../src/hero/dreamDepth.js';
import type { AppLanguage } from '../../src/hero/appLanguage.js';
import type { AddressPreference } from '../../src/hero/addressPreference.js';
import { emotionNamesForModel, normalizeEmotions, type EmotionId } from '../../src/hero/dreamEmotions.js';
import { collectStrings, findAddressViolation, findHebrewSlashForm } from '../../src/hero/languageIntegrity.js';
import { garbledTextNote } from '../../src/hero/reflectionChecks.js';
import { segmentDream, segmentsForMoment, type DreamSegment } from '../../src/hero/dreamSegments.js';
import {
  assembleReply,
  assembleWhole,
  factualSummary,
  fallbackQuestion,
  quoted,
  verifyQuestion,
  type AssembledInsight,
  type AssembledWhole,
  type ClaimReport,
  type QuestionFocus,
  type WholeRaw,
  type WholeReport,
} from '../../src/hero/claimCheck.js';
import {
  alternativeQuestionAllowed,
  basedOnKey,
  canRequestWholeView,
  exploredCount,
  exploredInOrder,
  isInsightRetry,
  MAX_MOMENT_CALLS,
  needsReplyCall,
  parseExploration,
  type Exploration,
  type MomentId,
} from '../../src/hero/exploration.js';
import {
  buildMomentQuestionInput,
  buildMomentQuestionSystemPrompt,
  buildMomentReplyInput,
  buildMomentReplySystemPrompt,
  buildWholeViewInput,
  buildWholeViewSystemPrompt,
  clarificationNote,
  keepFollowUp,
  mixedPluralNote,
  MOMENT_QUESTION_JSON_SCHEMA,
  MOMENT_REPLY_JSON_SCHEMA,
  parseMomentQuestion,
  parseMomentReply,
  parseWholeView,
  priorMoments,
  questionProse,
  questionRetryNote,
  quotedWordsNote,
  replyProse,
  replyRetryNote,
  usableAnswers,
  wholeRetryNote,
  wholeViewProse,
  WHOLE_VIEW_JSON_SCHEMA,
  type MomentQuestionRaw,
  type MomentReplyRaw,
  type PriorMoment,
} from '../../src/hero/explorationSchema.js';

/**
 * THE MULTI-MOMENT JOURNEY'S THREE MODEL CALLS (stage 3b, reworked in the fix round, doc 30). Reached through the existing functions
 * (the 12-function limit leaves no room for a new one): /api/dream-element-labels with mode 'moment-question', /api/dream-reflection
 * with mode 'moment-reply' or 'whole-view'. Never a credit: the dream's one credit was spent by its analysis.
 *
 * What is shown: only what passed claimCheck.ts. A result that fails its quality check after the last retry is never shown as it is
 * (rejectExhaustedQuality): a question falls back to a safe one written by code, an insight to the dream's own words and hers
 * (a "factual" insight, not counted as a successful one, one retry allowed), a whole view to a verified factual summary.
 *
 * What bounds the model use (unchanged mechanism):
 *  - the call must name an attempt the caller owns (checked in SQL when the slot is reserved);
 *  - per-dream slots: moment calls on label_count up to MAX_LABEL_CALLS_PER_ATTEMPT + MAX_MOMENT_CALLS, whole views on
 *    reflection_count (3, a database CHECK);
 *  - a rate limit per account / trial taken BEFORE the call and never given back;
 *  - no call when nothing new is asked (409 not_needed), and none after "I don't know" (that moment gets the dream's own words);
 *  - inside one call at most 3 model responses.
 * Slots: a failed or thrown call returns its slot (as before). A factual insight KEEPS its slot: the call was made, and the per-dream
 * cap is what bounds its one retry. A factual whole-view summary returns its slot (only 3 per dream exist); its one retry is bounded by
 * the journey's rules and the rate limit.
 */

export type ExplorationMode = 'moment-question' | 'moment-reply' | 'whole-view';

/** The ceiling of label_count for the moment calls: the journey's own allowance on top of what the labels and questions may use. */
export const EXPLORATION_LABEL_CAP = MAX_LABEL_CALLS_PER_ATTEMPT + MAX_MOMENT_CALLS;

const MAX_BODY_EXPLORATION_CHARS = 60_000;

type Usage = (u: { input: number; output: number; model: string }) => void;

interface DreamContext {
  sourceText: string;
  segments: DreamSegment[];
  depth: DreamDepth;
  language: AppLanguage;
  addressPreference: AddressPreference;
  feelings: string;
  emotions: readonly EmotionId[];
  /** Everything the dreamer wrote: quoting it in another script is legitimate. */
  dreamerText: string;
  segmentsOf: (id: MomentId) => number[];
}

function contextOf(analysis: DreamAnalysis, e: Exploration, language: AppLanguage, addressPreference: AddressPreference, emotions: readonly EmotionId[]): DreamContext {
  const answers = Object.values(e.explored).flatMap((x) => [x.answer ?? '', x.followUp?.answer ?? '', x.firstTry?.answer ?? '']);
  const segments = segmentDream(analysis.sourceText);
  return {
    sourceText: analysis.sourceText,
    segments,
    depth: computeDreamDepth(analysis),
    language,
    addressPreference,
    feelings: emotions.length ? emotionNamesForModel(emotions, language) : '',
    emotions,
    dreamerText: [analysis.sourceText, ...e.moments.map((m) => m.label), ...answers].filter(Boolean).join('\n'),
    segmentsOf: (id) => {
      const m = e.moments.find((x) => x.id === id);
      return m ? segmentsForMoment(segments, m) : [];
    },
  };
}

async function callModel<T>(client: OpenAI, stage: string, modelVar: 'OPENAI_QUESTIONS_MODEL' | 'OPENAI_REFLECTION_MODEL', instructions: string, input: string, schemaName: string, schema: object, parse: (raw: unknown) => T | null, onUsage?: Usage): Promise<T | null> {
  const requestedModel = resolveStageModel(modelVar);
  const response = await client.responses.create({
    model: requestedModel,
    store: false,
    instructions,
    input,
    // A little less randomness than the default: these texts are short and every odd word shows (a real sample coined a non-word).
    temperature: 0.7,
    text: { format: { type: 'json_schema', name: schemaName, schema: schema as Record<string, unknown>, strict: true } },
  });
  logModelUsed(stage, requestedModel, response.model);
  if (response.usage) onUsage?.({ input: response.usage.input_tokens, output: response.usage.output_tokens, model: response.model });
  try {
    return parse(JSON.parse(response.output_text));
  } catch {
    return null;
  }
}

const safety = (ctx: DreamContext, texts: string[]) => findAddressViolation(texts, ctx.language, ctx.addressPreference) ?? findHebrewSlashForm(texts, ctx.language);

// ------------------------------------------------------------------------------------------------ what each mode may do (pure)

export type Plan =
  | { kind: 'question'; moment: { id: MomentId; label: string; segments: number[] }; momentId: MomentId; momentLabel: string; prior: PriorMoment[]; otherMoments: string[]; alternative: { question: string; answer: string } | null }
  | { kind: 'reply'; moment: { id: MomentId; label: string; segments: number[]; excerpt: string | null }; momentId: MomentId; momentLabel: string; prior: PriorMoment[]; question: string; answer: string; followUp: { question: string; answer: string } | null; first: boolean; retry: boolean }
  | { kind: 'whole'; explored: PriorMoment[]; unexplored: { id: MomentId; label: string }[]; basedOn: string; exploredIds: MomentId[]; previous: { overview: string; closingQuestion: string } | null };

/** Decides from the stored journey whether the call is needed at all; null = nothing new to ask (no model call, no slot). */
export function planCall(mode: ExplorationMode, e: Exploration, momentId: string | null, segmentsOf: (id: MomentId) => number[] = () => []): Plan | null {
  if (mode === 'moment-question') {
    const m = e.moments.find((x) => x.id === momentId);
    if (!m) return null;
    const entry = e.explored[m.id];
    const moment = { id: m.id, label: m.label, segments: segmentsOf(m.id) };
    const explored = new Set(Object.keys(e.explored));
    const otherMoments = e.moments.filter((x) => x.id !== m.id && !explored.has(x.id)).map((x) => x.label);
    // after "I don't know": one different question about the same moment, once
    if (entry) return alternativeQuestionAllowed(entry) && entry.answer !== null ? { kind: 'question', moment, momentId: m.id, momentLabel: m.label, prior: priorMoments(e, m.id, segmentsOf), otherMoments, alternative: { question: entry.question, answer: entry.answer } } : null;
    if (Object.values(e.explored).some((x) => x.status === 'exploring')) return null;
    return { kind: 'question', moment, momentId: m.id, momentLabel: m.label, prior: priorMoments(e, undefined, segmentsOf), otherMoments, alternative: null };
  }
  if (mode === 'moment-reply') {
    const m = e.moments.find((x) => x.id === momentId);
    const entry = m ? e.explored[m.id] : undefined;
    if (!m || !entry || !needsReplyCall(e, m.id) || entry.answer === null) return null;
    const retry = isInsightRetry(entry);
    const refreshing = !retry && entry.insight !== null && entry.followUp?.answer ? { question: entry.followUp.question, answer: entry.followUp.answer } : null;
    const followUp = retry && entry.followUp?.answer ? { question: entry.followUp.question, answer: entry.followUp.answer } : refreshing;
    return {
      kind: 'reply',
      moment: { id: m.id, label: m.label, segments: segmentsOf(m.id), excerpt: m.excerpt },
      momentId: m.id,
      momentLabel: m.label,
      prior: priorMoments(e, m.id, segmentsOf),
      question: entry.question,
      answer: entry.answer,
      followUp,
      first: exploredCount(e) === 0 && entry.insight === null,
      retry,
    };
  }
  if (!canRequestWholeView(e)) return null;
  const explored = priorMoments(e, undefined, segmentsOf);
  const ids = new Set(explored.map((x) => x.id));
  const w = e.wholeView;
  const previous = w && (w.kind ?? 'whole') !== 'factual-summary' && w.kind !== 'no-link' ? { overview: w.overview, closingQuestion: w.closingQuestion } : null;
  return { kind: 'whole', explored, unexplored: e.moments.filter((m) => !ids.has(m.id)).map((m) => ({ id: m.id, label: m.label })), basedOn: basedOnKey(e), exploredIds: exploredInOrder(e).map((x) => x.moment.id), previous };
}

// ------------------------------------------------------------------------------------------------ the generations (route + quality script)

export interface QuestionValue {
  question: string;
  focus: QuestionFocus | null;
  subject: string | null;
  buildsOn: string | null;
  /** 'adaptive' = written for this moment and passed every check; 'fixed' = every candidate failed, the safe question written by code. */
  source: 'adaptive' | 'fixed';
  rejected: { question: string; reasons: string[] }[];
}

function pickQuestion(raw: MomentQuestionRaw, ctx: DreamContext, p: Extract<Plan, { kind: 'question' }>) {
  const said = [...p.prior.flatMap(usableAnswers)];
  const prior = [...p.prior.map((m) => ({ question: m.question, focus: m.focus, subject: m.subject })), ...(p.alternative ? [{ question: p.alternative.question, focus: null, subject: null }] : [])];
  const rejected: { question: string; reasons: string[] }[] = [];
  for (const c of raw.candidates) {
    const v = verifyQuestion(c, { language: ctx.language, segments: ctx.segments, momentSegments: p.moment.segments, answers: said, prior });
    const reasons = [...v.reasons];
    if (safety(ctx, [c.question])) reasons.push('wrong grammatical address for this dreamer');
    if (garbledTextNote([c.question])) reasons.push('garbled wording');
    if (mixedPluralNote([c.question], ctx.dreamerText)) reasons.push('a feminine plural for the dreamer together with a man');
    if (quotedWordsNote([c.question], [ctx.dreamerText])) reasons.push('quotes words she did not say');
    if (reasons.length === 0) return { chosen: { ...c, focus: v.focus, subject: v.subject || null }, rejected };
    rejected.push({ question: c.question, reasons });
  }
  return { chosen: null, rejected };
}

export async function generateMomentQuestion(client: OpenAI, ctx: DreamContext, p: Extract<Plan, { kind: 'question' }>, onUsage?: Usage) {
  const instructions = buildMomentQuestionSystemPrompt(ctx.language, ctx.addressPreference);
  const input = buildMomentQuestionInput({ sourceText: ctx.sourceText, segments: ctx.segments, prior: p.prior, moment: p.moment, otherMoments: p.otherMoments, alternative: p.alternative });
  const rejectedAll: { question: string; reasons: string[] }[] = [];
  const outcome = await runWithLanguageIntegrity<MomentQuestionRaw>(
    (note) => callModel(client, 'moment-question', 'OPENAI_QUESTIONS_MODEL', instructions + note, input, 'moment_question', MOMENT_QUESTION_JSON_SCHEMA, parseMomentQuestion, onUsage),
    (v) => questionProse(v),
    {
      route: 'moment-question',
      language: ctx.language,
      context: ctx.dreamerText,
      strictLatin: true,
      qualityCheck: (v) => {
        const { chosen, rejected } = pickQuestion(v, ctx, p);
        rejectedAll.push(...rejected);
        return chosen ? null : questionRetryNote(rejected.flatMap((r) => r.reasons));
      },
      maxQualityRetries: 2,
      rejectExhaustedQuality: true,
    },
  );
  if (outcome.status === 'ok') {
    const { chosen } = pickQuestion(outcome.value, ctx, p);
    if (chosen) return { status: 'ok' as const, value: { question: chosen.question, focus: chosen.focus, subject: chosen.subject, buildsOn: chosen.buildsOn || null, source: 'adaptive', rejected: rejectedAll } satisfies QuestionValue };
  }
  if (outcome.status === 'ok' || outcome.status === 'quality_failed') {
    const safe = fallbackQuestion(ctx.language, p.alternative !== null, p.prior.map((m) => m.focus));
    return { status: 'ok' as const, value: { question: safe.question, focus: safe.focus, subject: null, buildsOn: null, source: 'fixed', rejected: rejectedAll } satisfies QuestionValue };
  }
  return outcome;
}

export interface ReplyValue {
  insight: AssembledInsight;
  followUpQuestion: string | null;
  missingInformation: string | null;
  report: ClaimReport;
}

function replySources(ctx: DreamContext, p: Extract<Plan, { kind: 'reply' }>) {
  return { language: ctx.language, sourceText: ctx.sourceText, segments: ctx.segments, allowed: p.moment.segments, answers: [p.answer, p.followUp?.answer ?? ''].filter(Boolean) };
}

export async function generateMomentReply(client: OpenAI, ctx: DreamContext, p: Extract<Plan, { kind: 'reply' }>, onUsage?: Usage) {
  const instructions = buildMomentReplySystemPrompt(ctx.language, ctx.addressPreference);
  const input = buildMomentReplyInput({ sourceText: ctx.sourceText, segments: ctx.segments, prior: p.prior, moment: p.moment, question: p.question, answer: p.answer, followUp: p.followUp, feelings: ctx.feelings });
  const sources = replySources(ctx, p);
  const earlier = p.prior.flatMap((m) => (m.insight ? [m.insight.possibility, m.insight.observation] : [])).filter(Boolean);
  const assemble = (v: MomentReplyRaw) => {
    const a = assembleReply(v, sources, earlier);
    // a moment whose parts could not be found (an older record): its own excerpt or label, quoted, is the dream's line
    if (!a.insight.observation) a.insight.observation = quoted(ctx.language, p.moment.excerpt ?? p.moment.label);
    return a;
  };
  const shownProse = (a: ReturnType<typeof assemble>) => [a.insight.observation, a.insight.reflection, a.insight.possibility].filter(Boolean);
  const outcome = await runWithLanguageIntegrity<MomentReplyRaw>(
    (note) => callModel(client, 'moment-reply', 'OPENAI_REFLECTION_MODEL', instructions + note, input, 'moment_reply', MOMENT_REPLY_JSON_SCHEMA, parseMomentReply, onUsage),
    (v) => replyProse(v),
    {
      route: 'moment-reply',
      language: ctx.language,
      context: ctx.dreamerText,
      strictLatin: true,
      extraCheck: (v) => safety(ctx, shownProse(assemble(v))),
      qualityCheck: (v) => {
        const a = assemble(v);
        return (
          (a.insight.kind === 'factual' ? replyRetryNote(a.report) : null) ??
          (p.followUp ? null : clarificationNote(v, p.answer)) ??
          mixedPluralNote(shownProse(a), ctx.dreamerText) ??
          garbledTextNote(shownProse(a))
        );
      },
      maxQualityRetries: 2,
      rejectExhaustedQuality: true,
    },
  );
  if (outcome.status !== 'ok' && outcome.status !== 'quality_failed') return outcome;
  const a = assemble(outcome.value);
  // a sentence that still fails the plural or wording check after the last retry is not shown: the dream's words and hers are
  if (outcome.status === 'quality_failed' && (mixedPluralNote(shownProse(a), ctx.dreamerText) || garbledTextNote(shownProse(a)))) {
    a.insight.possibility = '';
    a.insight.kind = 'factual';
    a.insight.observation = quoted(ctx.language, p.moment.segments.length ? ctx.segments.filter((x) => p.moment.segments.includes(x.id)).map((x) => x.text).join(' … ') : p.moment.excerpt ?? p.moment.label);
    a.insight.reflection = sources.answers.length ? `${ctx.language === 'he' ? 'אמרת:' : 'You said:'} ${quoted(ctx.language, sources.answers[0])}` : '';
  }
  const followUpQuestion = keepFollowUp(outcome.value, { sourceText: ctx.sourceText, momentLabel: p.momentLabel, answer: p.answer, prior: p.prior, refreshing: p.followUp !== null || p.retry });
  return { status: 'ok' as const, value: { insight: a.insight, followUpQuestion, missingInformation: outcome.value.missingInformation, report: a.report } satisfies ReplyValue };
}

export interface WholeValue extends AssembledWhole {
  report: WholeReport | null;
}

function wholeSources(ctx: DreamContext, p: Extract<Plan, { kind: 'whole' }>) {
  return {
    language: ctx.language,
    sourceText: ctx.sourceText,
    segments: ctx.segments,
    explored: p.explored.map((m) => ({ id: m.id, label: m.label, segments: m.segments, answers: [m.answer, m.followUp?.answer ?? ''].filter(Boolean), question: m.question, insight: m.insight })),
    unexplored: p.unexplored.map((u) => ({ id: u.id, text: u.label })),
    previous: p.previous,
    maxReadings: maxAlternativeReadings(ctx.depth),
  };
}

export async function generateWholeView(client: OpenAI, ctx: DreamContext, p: Extract<Plan, { kind: 'whole' }>, onUsage?: Usage) {
  const instructions = buildWholeViewSystemPrompt(ctx.language, ctx.addressPreference);
  const input = buildWholeViewInput({ sourceText: ctx.sourceText, segments: ctx.segments, depth: ctx.depth, explored: p.explored, unexplored: p.unexplored, feelings: ctx.feelings, previous: p.previous });
  const sources = wholeSources(ctx, p);
  const shownProse = (v: AssembledWhole) => [v.overview, ...v.connections.flatMap((c) => [c.title, c.basis]), v.recurring ?? '', v.contrast ?? '', ...v.readings.map((r) => r.reading), v.closingQuestion].filter(Boolean);
  const outcome = await runWithLanguageIntegrity<WholeRaw>(
    (note) => callModel(client, 'whole-view', 'OPENAI_REFLECTION_MODEL', instructions + note, input, 'whole_view', WHOLE_VIEW_JSON_SCHEMA, parseWholeView, onUsage),
    (v) => wholeViewProse(v),
    {
      route: 'whole-view',
      language: ctx.language,
      context: ctx.dreamerText,
      strictLatin: true,
      extraCheck: (v) => safety(ctx, shownProse(assembleWhole(v, sources).view)),
      qualityCheck: (v) => {
        const { view, report } = assembleWhole(v, sources);
        return (
          (view.kind === 'factual-summary' || view.kind === 'no-link' ? wholeRetryNote(report, view.kind) : null) ??
          mixedPluralNote(shownProse(view), ctx.dreamerText) ??
          garbledTextNote(shownProse(view))
        );
      },
      maxQualityRetries: 2,
      rejectExhaustedQuality: true,
    },
  );
  if (outcome.status !== 'ok' && outcome.status !== 'quality_failed') return outcome;
  const { view, report } = assembleWhole(outcome.value, sources);
  // still failing a wording check after the last retry: nothing interpreted is shown
  if (outcome.status === 'quality_failed' && view.kind !== 'no-link' && (mixedPluralNote(shownProse(view), ctx.dreamerText) || garbledTextNote(shownProse(view)))) {
    return { status: 'ok' as const, value: { ...factualSummary(sources), report } satisfies WholeValue };
  }
  return { status: 'ok' as const, value: { ...view, report } satisfies WholeValue };
}

// ------------------------------------------------------------------------------------------------ the request

export interface ExplorationDeps {
  resolveIdentity: (headers: RequestHeaders) => Promise<ResolveCallerResult>;
  openai: () => OpenAI | null;
  trialState: typeof getTrialAttemptState;
  completeTrial: typeof completeTrialAttempt;
  rateLimit: (subject: string) => Promise<RateDecision>;
  reserveMoment: (attemptId: string, identity: CallerIdentity) => Promise<'reserved' | 'rejected' | null>;
  refundMoment: (attemptId: string) => Promise<void>;
  reserveWhole: (attemptId: string, identity: CallerIdentity) => Promise<'reserved' | 'rejected' | null>;
  refundWhole: (attemptId: string) => Promise<void>;
  address: (identity: CallerIdentity, headers: RequestHeaders) => Promise<AddressPreference>;
  generateQuestion: typeof generateMomentQuestion;
  generateReply: typeof generateMomentReply;
  generateWhole: typeof generateWholeView;
}

export const realExplorationDeps: ExplorationDeps = {
  resolveIdentity: (h) => resolveCallerIdentity(h),
  openai: getOpenAIClient,
  trialState: getTrialAttemptState,
  completeTrial: completeTrialAttempt,
  rateLimit: (subject) => enforceRateLimits(databaseRateLimitStore, 'explore', subject, explorationRules(), (m) => console.warn(`[rate-limit] ${m}`)),
  reserveMoment: (attemptId, identity) => reserveLabelsAttempt(attemptId, identity, EXPLORATION_LABEL_CAP),
  refundMoment: refundLabelsAttempt,
  reserveWhole: reserveReflectionAttempt,
  refundWhole: refundReflectionAttempt,
  address: resolveAddressPreference,
  generateQuestion: generateMomentQuestion,
  generateReply: generateMomentReply,
  generateWhole: generateWholeView,
};

export async function handleExploration(mode: ExplorationMode, rawBody: unknown, headers: RequestHeaders, deps: ExplorationDeps = realExplorationDeps): Promise<HandlerResult> {
  const resolved = await deps.resolveIdentity(headers);
  if (!resolved.ok) return errorResult(resolved.status, resolved.reason, resolved.message);
  const cookie = resolved.setCookieHeader ? { 'Set-Cookie': resolved.setCookieHeader } : undefined;
  const fail = (status: number, reason: string, message: string) => withHeaders(errorResult(status, reason, message), cookie);

  const body = (rawBody ?? {}) as Record<string, unknown>;
  const language: AppLanguage = body.language === 'he' ? 'he' : 'en';
  const attemptId = typeof body.attemptId === 'string' ? body.attemptId : '';
  if (!attemptId) return fail(400, 'invalid_response', 'attemptId is required.');
  const analysis = validateDreamAnalysis(body.dreamAnalysis);
  if (!analysis) return fail(400, 'invalid_response', 'dreamAnalysis is missing or invalid.');
  if (JSON.stringify(body.exploration ?? null).length > MAX_BODY_EXPLORATION_CHARS) return fail(413, 'invalid_response', 'The journey is too large.');
  const exploration = parseExploration(body.exploration);
  if (!exploration || exploration.attemptId !== attemptId) return fail(400, 'invalid_response', 'exploration is missing, invalid, or not for this attempt.');
  const momentId = typeof body.momentId === 'string' ? body.momentId : null;

  const emotions = normalizeEmotions(body.emotions);
  const segments = segmentDream(analysis.sourceText);
  const segmentsOf = (id: MomentId) => {
    const m = exploration.moments.find((x) => x.id === id);
    return m ? segmentsForMoment(segments, m) : [];
  };

  // Nothing new to ask: no model call, no slot, no rate-limit hit.
  const plan = planCall(mode, exploration, momentId, segmentsOf);
  if (!plan) return fail(409, 'not_needed', 'Nothing new to ask for this journey: the stored result is the answer.');

  const client = deps.openai();
  if (!client) return fail(503, 'not_configured', 'The exploration backend is missing OPENAI_API_KEY.');

  if (resolved.identity.kind === 'trial') {
    const state = await deps.trialState(attemptId, resolved.identity.trialId);
    if (state === null) return fail(503, 'not_configured', 'Usage tracking is not configured.');
    if (state === 'consumed_elsewhere') return fail(403, 'free_dream_used', FREE_DREAM_USED_MESSAGE);
  }

  const subject = resolved.identity.kind === 'user' ? `u:${resolved.identity.userId}` : `t:${resolved.identity.trialId}`;
  const rate = await deps.rateLimit(subject);
  if (!rate.allowed) return withHeaders(errorResult(429, 'rate_limited', 'Too many requests for now. Please try again a little later.'), { ...(cookie ?? {}), 'Retry-After': String(rate.retryAfterSeconds) });

  const whole = plan.kind === 'whole';
  const reservation = await (whole ? deps.reserveWhole : deps.reserveMoment)(attemptId, resolved.identity);
  if (reservation === null) return fail(503, 'not_configured', 'Usage tracking is not configured.');
  if (reservation === 'rejected') return fail(403, 'limit_reached', 'This dream has used its allowance for this step, or the attempt is invalid.');
  const refund = () => (whole ? deps.refundWhole : deps.refundMoment)(attemptId);

  const ctx = contextOf(analysis, exploration, language, await deps.address(resolved.identity, headers), emotions);

  try {
    if (plan.kind === 'question') {
      const outcome = await deps.generateQuestion(client, ctx, plan);
      if (outcome.status !== 'ok') {
        await refund();
        return fail(502, 'invalid_response', 'The question could not be written.');
      }
      const v = outcome.value as Partial<QuestionValue> & { question: string };
      return withHeaders(okResult({ momentId: plan.momentId, question: v.question, source: v.source ?? 'adaptive', focus: v.focus ?? null, subject: v.subject ?? null, alternative: plan.alternative !== null }), cookie);
    }
    if (plan.kind === 'reply') {
      const outcome = await deps.generateReply(client, ctx, plan);
      if (outcome.status !== 'ok') {
        await refund();
        return fail(502, 'invalid_response', 'The insight could not be written.');
      }
      const v = outcome.value as Partial<ReplyValue> & { insight: AssembledInsight };
      // An anonymous trial's free dream is complete when its first insight is delivered (fails closed, like the reflection).
      if (resolved.identity.kind === 'trial' && plan.first) {
        const completion = await deps.completeTrial(attemptId, resolved.identity.trialId);
        if (completion !== 'completed') {
          await refund();
          return completion === 'consumed' ? fail(403, 'free_dream_used', FREE_DREAM_USED_MESSAGE) : fail(503, 'not_configured', 'Usage tracking is not configured.');
        }
      }
      const factual = v.insight.kind === 'factual';
      // A factual insight keeps its slot (the call was made); it is not a successful one, so one retry is offered (never on a retry).
      return withHeaders(okResult({ momentId: plan.momentId, insight: v.insight, followUpQuestion: plan.retry ? null : v.followUpQuestion ?? null, refreshed: plan.followUp !== null && !plan.retry, retryAllowed: factual && !plan.retry }), cookie);
    }
    const outcome = await deps.generateWhole(client, ctx, plan);
    if (outcome.status !== 'ok') {
      await refund();
      return fail(502, 'invalid_response', 'The whole view could not be written.');
    }
    const view = { ...(outcome.value as Partial<WholeValue>) } as Partial<WholeValue>;
    delete view.report;
    const kind = view.kind ?? 'whole';
    // Every check failed: the verified summary is shown and the whole-view slot is returned (only 3 per dream exist).
    if (kind === 'factual-summary') await refund();
    return withHeaders(okResult({ basedOn: plan.basedOn, wholeView: { ...view, kind } }), cookie);
  } catch (err) {
    await refund();
    if (err instanceof OpenAI.APIError && err.status === 429) return fail(429, 'rate_limited', 'The AI service is busy. Please try again shortly.');
    return fail(502, 'request_failed', 'The request could not be completed.');
  }
}

/** The modes the existing functions forward here, or null for their own original behaviour. */
export function explorationModeOf(rawBody: unknown, allowed: readonly ExplorationMode[]): ExplorationMode | null {
  const mode = typeof rawBody === 'object' && rawBody !== null ? (rawBody as { mode?: unknown }).mode : undefined;
  return typeof mode === 'string' && (allowed as readonly string[]).includes(mode) ? (mode as ExplorationMode) : null;
}

/** For the quality script: the same context the route builds. */
export { contextOf as explorationContext };
export type { DreamContext as ExplorationContext };

/** A JSON-safe copy of the collected prose of a result (used by tests and the quality script). */
export const proseOf = (value: unknown) => collectStrings(value);
