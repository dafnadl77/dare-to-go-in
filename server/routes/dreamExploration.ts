import OpenAI from 'openai';
import { getOpenAIClient } from '../openaiClient.js';
import { okResult, errorResult, withHeaders, type HandlerResult } from '../httpResult.js';
import { type CallerIdentity, type RequestHeaders, type ResolveCallerResult } from '../callerIdentity.js';
import { resolveAdultCaller } from '../ageGate.js';
import {
  completeTrialAttempt,
  getTrialAttemptState,
  refundAttemptCreditOnce,
  refundLabelsAttempt,
  refundReflectionAttempt,
  reserveLabelsAttempt,
  reserveReflectionAttempt,
} from '../dreamAttempts.js';
import { laterStepBudgetResult } from '../budgetExhausted.js';
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
  QUESTION_FLOOR,
  questionQuality,
  planQuestionFocus,
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
  type MomentInsight,
  type ConversationTurn,
  exploringId,
  needsTurnCall,
  rejectionRepliesUsed,
  MAX_REJECTION_REPLIES,
  questionsAsked,
  isQuestionTurn,
  MAX_QUESTIONS_PER_MOMENT,
} from '../../src/hero/exploration.js';
import { isUnsureAnswer } from '../../src/hero/hebrewText.js';
import { buildTurnInput, buildTurnSystemPrompt, checkTurn, fallbackReply, parseTurn, TURN_JSON_SCHEMA, turnSignals, type TurnRaw } from '../../src/hero/conversationTurn.js';
import { herWordsForSafety, safetyAckOf } from '../../src/hero/safety/journeySafety.js';
import { realModerate, type Moderate } from '../safety/moderation.js';
import { checkHerAnswers, dareWordsSafe } from '../safety/routeSafety.js';
import { choosePair, listeningWhole, observationBeside, oneReflection, pairAllowedHere, PAIR_WHOLE_NOTE, type PairSources, type PairVerdict } from '../../src/hero/pairCheck.js';
import {
  buildMomentQuestionInput,
  buildMomentQuestionSystemPrompt,
  buildMomentReplyInput,
  buildMomentReplySystemPrompt,
  buildPairReplyInput,
  buildPairReplySystemPrompt,
  buildWholeViewInput,
  buildWholeViewSystemPrompt,
  clarificationNote,
  keepFollowUp,
  mixedPluralNote,
  MOMENT_QUESTION_JSON_SCHEMA,
  MOMENT_REPLY_JSON_SCHEMA,
  parseMomentQuestion,
  parseMomentReply,
  parsePairReply,
  pairReplyProse,
  PAIR_REPLY_JSON_SCHEMA,
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
  type PairReplyRaw,
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

export type ExplorationMode = 'moment-question' | 'moment-reply' | 'whole-view' | 'conversation-turn' | 'conversation-summary';

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

async function callModel<T>(client: OpenAI, stage: string, modelVar: 'OPENAI_QUESTIONS_MODEL' | 'OPENAI_REFLECTION_MODEL', instructions: string, input: string, schemaName: string, schema: object, parse: (raw: unknown) => T | null, onUsage?: Usage, maxOutputTokens?: number): Promise<T | null> {
  const requestedModel = resolveStageModel(modelVar);
  const response = await client.responses.create({
    model: requestedModel,
    store: false,
    instructions,
    input,
    // A little less randomness than the default: these texts are short and every odd word shows (a real sample coined a non-word).
    temperature: 0.7,
    ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {}),
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
  | {
      kind: 'question';
      moment: { id: MomentId; label: string; segments: number[] };
      momentId: MomentId;
      momentLabel: string;
      prior: PriorMoment[];
      otherMoments: string[];
      alternative: { question: string; answer: string; focus?: QuestionFocus | null; subject?: string | null } | null;
      /** The kind of question that fits this moment (doc 50 v2, א6): told to the model, and preferred when choosing. */
      plannedFocus: QuestionFocus;
    }
  | { kind: 'reply'; moment: { id: MomentId; label: string; segments: number[]; excerpt: string | null }; momentId: MomentId; momentLabel: string; prior: PriorMoment[]; question: string; answer: string; followUp: { question: string; answer: string } | null; first: boolean; retry: boolean }
  | { kind: 'whole'; explored: PriorMoment[]; unexplored: { id: MomentId; label: string }[]; basedOn: string; exploredIds: MomentId[]; previous: { overview: string; closingQuestion: string } | null }
  | ConversationPlan;

/** Decides from the stored journey whether the call is needed at all; null = nothing new to ask (no model call, no slot). */
export function planCall(mode: ExplorationMode, e: Exploration, momentId: string | null, segmentsOf: (id: MomentId) => number[] = () => []): Plan | null {
  if (mode === 'conversation-turn' || mode === 'conversation-summary') return planConversation(mode, e, momentId);
  if (mode === 'moment-question') {
    const m = e.moments.find((x) => x.id === momentId);
    if (!m) return null;
    const entry = e.explored[m.id];
    const moment = { id: m.id, label: m.label, segments: segmentsOf(m.id) };
    const explored = new Set(Object.keys(e.explored));
    const otherMoments = e.moments.filter((x) => x.id !== m.id && !explored.has(x.id)).map((x) => x.label);
    // after "I don't know": one different question about the same moment, once
    const priorFoci = priorMoments(e, m.id, segmentsOf).map((x) => x.focus);
    if (entry)
      return alternativeQuestionAllowed(entry) && entry.answer !== null
        ? { kind: 'question', moment, momentId: m.id, momentLabel: m.label, prior: priorMoments(e, m.id, segmentsOf), otherMoments, alternative: { question: entry.question, answer: entry.answer, focus: entry.focus ?? null, subject: entry.subject ?? null }, plannedFocus: planQuestionFocus(m.excerpt ?? m.label, [...priorFoci, entry.focus ?? null]) }
        : null;
    if (Object.values(e.explored).some((x) => x.status === 'exploring')) return null;
    return { kind: 'question', moment, momentId: m.id, momentLabel: m.label, prior: priorMoments(e, undefined, segmentsOf), otherMoments, alternative: null, plannedFocus: planQuestionFocus(m.excerpt ?? m.label, priorFoci) };
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
  const prior = [...p.prior.map((m) => ({ question: m.question, focus: m.focus, subject: m.subject })), ...(p.alternative ? [{ question: p.alternative.question, focus: p.alternative.focus ?? null, subject: p.alternative.subject ?? null, sameMoment: true }] : [])];
  const asked = [...p.prior.flatMap((m) => [m.question, m.followUp?.question ?? '']), p.alternative?.question ?? ''].filter(Boolean);
  const momentText = p.moment.segments.map((id) => ctx.segments[id]?.text ?? '').join(' ');
  const explored = [...new Set(p.prior.flatMap((m) => m.segments))];
  const rejected: { question: string; reasons: string[] }[] = [];
  const passing: { c: { question: string; focus: QuestionFocus; subject: string | null; buildsOn: string }; score: number }[] = [];
  for (const c of raw.candidates) {
    const v = verifyQuestion(c, { language: ctx.language, segments: ctx.segments, momentSegments: p.moment.segments, answers: said, prior, explored });
    const reasons = [...v.reasons];
    if (safety(ctx, [c.question])) reasons.push('wrong grammatical address for this dreamer');
    if (garbledTextNote([c.question])) reasons.push('garbled wording');
    if (mixedPluralNote([c.question], ctx.dreamerText)) reasons.push('a feminine plural for the dreamer together with a man');
    if (quotedWordsNote([c.question], [ctx.dreamerText])) reasons.push('quotes words she did not say');
    // quality is not a refusal (doc 50 v2): it ranks the passing ones; one below the floor is not asked (another candidate, a retry, or the safe question)
    const q = questionQuality(c.question, { momentText, prior: asked, plannedFocus: p.plannedFocus, focus: v.focus, answers: said });
    if (reasons.length === 0 && q.score >= QUESTION_FLOOR) passing.push({ c: { ...c, focus: v.focus, subject: v.subject || null }, score: q.score });
    else rejected.push({ question: c.question, reasons: reasons.length ? reasons : q.notes });
  }
  const best = passing.reduce<(typeof passing)[number] | null>((a, b) => (a === null || b.score > a.score ? b : a), null);
  return { chosen: best ? best.c : null, rejected };
}

export async function generateMomentQuestion(client: OpenAI, ctx: DreamContext, p: Extract<Plan, { kind: 'question' }>, onUsage?: Usage) {
  const instructions = buildMomentQuestionSystemPrompt(ctx.language, ctx.addressPreference);
  const input = buildMomentQuestionInput({ sourceText: ctx.sourceText, segments: ctx.segments, prior: p.prior, moment: p.moment, otherMoments: p.otherMoments, alternative: p.alternative, plannedFocus: p.plannedFocus });
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
    const safe = fallbackQuestion(ctx.language, p.alternative !== null, [...p.prior.map((m) => m.focus), p.alternative?.focus ?? null]);
    return { status: 'ok' as const, value: { question: safe.question, focus: safe.focus, subject: null, buildsOn: null, source: 'fixed', rejected: rejectedAll } satisfies QuestionValue };
  }
  return outcome;
}

/** No endless chain of questions (doc 50 v2, א5): at most this many follow-up questions in one journey. */
export const MAX_FOLLOW_UPS_PER_JOURNEY = 2;

export interface ReplyValue {
  insight: AssembledInsight;
  followUpQuestion: string | null;
  missingInformation: string | null;
  report: ClaimReport;
}

function replySources(ctx: DreamContext, p: Extract<Plan, { kind: 'reply' }>) {
  return {
    language: ctx.language,
    sourceText: ctx.sourceText,
    segments: ctx.segments,
    allowed: p.moment.segments,
    answers: [p.answer, p.followUp?.answer ?? ''].filter(Boolean),
    address: ctx.addressPreference,
    // for the inviting question: the moment, the parts explored before, and the questions already asked
    momentSegments: p.moment.segments,
    explored: [...new Set(p.prior.flatMap((m) => m.segments))],
    priorQuestions: [...p.prior.flatMap((m) => [m.question, m.followUp?.question ?? '']), p.question].filter(Boolean),
    exchanges: [{ question: p.question, answer: p.answer }, ...(p.followUp ? [p.followUp] : [])],
  };
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
          (p.followUp ? null : clarificationNote(v, p.answer, ctx.sourceText)) ??
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
  const refreshing = p.followUp !== null || p.retry;
  // the inviting question, when no possibility was worth showing: one per moment, at most two follow-up questions in a journey
  const followUpsSoFar = p.prior.filter((m) => m.followUp !== null).length;
  const followUpQuestion =
    keepFollowUp(outcome.value, { sourceText: ctx.sourceText, momentLabel: p.momentLabel, answer: p.answer, prior: p.prior, refreshing }) ??
    (!refreshing && a.insight.invitation && followUpsSoFar < MAX_FOLLOW_UPS_PER_JOURNEY ? a.insight.invitation : null);
  delete a.insight.invitation;
  return { status: 'ok' as const, value: { insight: a.insight, followUpQuestion, missingInformation: outcome.value.missingInformation, report: a.report } satisfies ReplyValue };
}

/** The listening reply (doc 90 v3): the moment's line, one reflection, perhaps two details and a question; nothing interpreted. */
export interface PairReplyValue {
  insight: MomentInsight;
  followUpQuestion: string | null;
  missingInformation: string | null;
  report: ClaimReport;
  /** Why a pair was or was not offered, and each candidate's verdict (for the reports; never shown). */
  pairs: { allowed: boolean; why: string; verdicts: PairVerdict[]; chosen: number | null };
}

/**
 * What one pair reply is made of, shared by the route and the fixed-input test (scripts/pairFixedInputTest.ts), so the test runs the
 * product's own code: the instructions and input sent, the pacing, and `finish`, which turns the model's answer into what is shown.
 * `pairsNow` may be forced only by the test, to collect candidates in every moment (doc 90 §5: quality is judged without the pacing).
 */
export function pairReplySetup(ctx: DreamContext, p: Extract<Plan, { kind: 'reply' }>, opts: { pairsNow?: boolean } = {}) {
  const momentText = p.moment.segments.map((id) => ctx.segments[id]?.text ?? '').join(' ') || p.moment.excerpt || p.momentLabel;
  const pacing = pairAllowedHere({ priorPairs: p.prior.map((m) => Boolean(m.insight?.pair)), answer: p.answer, momentText, refreshing: p.followUp !== null || p.retry });
  const followUpsSoFar = p.prior.filter((m) => m.followUp !== null).length;
  const pairsNow = opts.pairsNow ?? (pacing.allowed && followUpsSoFar < MAX_FOLLOW_UPS_PER_JOURNEY);
  const why = pacing.why || (pacing.allowed && followUpsSoFar >= MAX_FOLLOW_UPS_PER_JOURNEY ? 'two follow-up questions in this journey already' : '');
  const instructions = buildPairReplySystemPrompt(ctx.language, ctx.addressPreference);
  const input = buildPairReplyInput({ sourceText: ctx.sourceText, segments: ctx.segments, prior: p.prior, moment: p.moment, question: p.question, answer: p.answer, followUp: p.followUp, feelings: ctx.feelings, pairsNow });
  const sources = replySources(ctx, p);
  const pairSources: PairSources = { language: ctx.language, sourceText: ctx.sourceText, segments: ctx.segments, allowed: p.moment.segments, answers: sources.answers, address: ctx.addressPreference };
  const assemble = (v: PairReplyRaw) => {
    const a = assembleReply({ ...v, possibilities: [], invitation: '' }, sources, []);
    if (!a.insight.observation) a.insight.observation = quoted(ctx.language, p.moment.excerpt ?? p.moment.label);
    const chosen = pairsNow ? choosePair(v.pairs, pairSources) : { index: null, pair: null, verdicts: [] as PairVerdict[] };
    return { a, chosen };
  };
  const shownProse = (x: ReturnType<typeof assemble>) => [x.a.insight.observation, x.a.insight.reflection, x.chosen.pair?.question ?? ''].filter(Boolean);
  /** The model's answer made into what is shown. `exhausted`: a wording check still failed after the last retry. */
  const finish = (raw: PairReplyRaw, exhausted: boolean): PairReplyValue => {
    const { a, chosen } = assemble(raw);
    let pair = chosen.pair;
    // still failing a wording check after the last retry: the dream's words and hers, and no pair
    if (exhausted && (mixedPluralNote(shownProse({ a, chosen }), ctx.dreamerText) || garbledTextNote(shownProse({ a, chosen })))) {
      pair = null;
      a.insight.observation = quoted(ctx.language, p.moment.segments.length ? ctx.segments.filter((x) => p.moment.segments.includes(x.id)).map((x) => x.text).join(' … ') : p.moment.excerpt ?? p.moment.label);
      a.insight.reflection = sources.answers.length ? `${ctx.language === 'he' ? 'אמרת:' : 'You said:'} ${quoted(ctx.language, sources.answers[0])}` : '';
    }
    // a clarification asks first: the moment has one follow-up slot
    const clarification = keepFollowUp(raw, { sourceText: ctx.sourceText, momentLabel: p.momentLabel, answer: p.answer, prior: p.prior, refreshing: p.followUp !== null || p.retry });
    if (clarification) pair = null;
    const insight: MomentInsight = {
      observation: observationBeside(a.insight.observation, pair),
      reflection: ctx.language === 'he' ? oneReflection(a.insight.reflection, pair) : a.insight.reflection,
      possibility: '',
      kind: 'listening',
      ...(pair ? { pair: { a: pair.a, b: pair.b, question: pair.question } } : {}),
    };
    return {
      insight,
      followUpQuestion: clarification ?? pair?.question ?? null,
      missingInformation: raw.missingInformation,
      report: a.report,
      pairs: { allowed: pairsNow, why, verdicts: chosen.verdicts, chosen: pair ? chosen.index : null },
    };
  };
  return { instructions, input, pairsNow, pacing: { allowed: pacing.allowed && !why, why }, assemble, shownProse, finish };
}

/**
 * TWO DETAILS AND A QUESTION (doc 90 v3, step 3): the reply the live route uses. What the moment shows and what she said pass the same
 * checks as before (assembleReply); a pair is asked for only where the pacing allows it and is shown only when pairCheck verifies it.
 * When no pair passes there is no paid retry: the moment is a listening one. Her answer to a pair is given back by code, with no call.
 */
export async function generatePairReply(client: OpenAI, ctx: DreamContext, p: Extract<Plan, { kind: 'reply' }>, onUsage?: Usage) {
  const r = pairReplySetup(ctx, p);
  const outcome = await runWithLanguageIntegrity<PairReplyRaw>(
    (note) => callModel(client, 'moment-reply', 'OPENAI_REFLECTION_MODEL', r.instructions + note, r.input, 'pair_reply', PAIR_REPLY_JSON_SCHEMA, parsePairReply, onUsage),
    (v) => pairReplyProse(v),
    {
      route: 'moment-reply',
      language: ctx.language,
      context: ctx.dreamerText,
      strictLatin: true,
      extraCheck: (v) => safety(ctx, r.shownProse(r.assemble(v))),
      // no retry for a missing pair (doc 90: none is a good result); only the checks every reply had
      qualityCheck: (v) => {
        const x = r.assemble(v);
        return (p.followUp ? null : clarificationNote(v, p.answer, ctx.sourceText)) ?? mixedPluralNote(r.shownProse(x), ctx.dreamerText) ?? garbledTextNote(r.shownProse(x));
      },
      maxQualityRetries: 2,
      rejectExhaustedQuality: true,
    },
  );
  if (outcome.status !== 'ok' && outcome.status !== 'quality_failed') return outcome;
  return { status: 'ok' as const, value: r.finish(outcome.value, outcome.status === 'quality_failed') satisfies PairReplyValue };
}

export interface WholeValue extends AssembledWhole {
  report: WholeReport | null;
}

/**
 * The whole view of the listening journey (doc 90 v3, principle 6, and her note on closings): written and checked as before, then shown
 * with no technical notice, nothing a pair already showed, and a closing that goes on talking.
 */
export async function generateListeningWhole(client: OpenAI, ctx: DreamContext, p: Extract<Plan, { kind: 'whole' }>, onUsage?: Usage) {
  const outcome = await generateWholeView(client, ctx, p, onUsage, PAIR_WHOLE_NOTE);
  if (outcome.status !== 'ok') return outcome;
  const shown = p.explored.flatMap((m) => (m.insight?.pair ? [m.insight.pair] : []));
  const view = listeningWhole(outcome.value, shown, {
    language: ctx.language,
    address: ctx.addressPreference,
    unexplored: p.unexplored.map((u) => u.label),
    answers: p.explored.flatMap((m) => usableAnswers(m)),
  });
  return { status: 'ok' as const, value: { ...view, report: outcome.value.report } satisfies WholeValue };
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

export async function generateWholeView(client: OpenAI, ctx: DreamContext, p: Extract<Plan, { kind: 'whole' }>, onUsage?: Usage, note = '') {
  const instructions = buildWholeViewSystemPrompt(ctx.language, ctx.addressPreference) + note;
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

// ------------------------------------------------------------------------------------------------ the conversation (doc 102)

/** A turn of the conversation, or "what came up" (on the whole-view slot). */
export type ConversationPlan =
  | {
      kind: 'turn';
      request: 'open' | 'reply' | 'close';
      momentId: MomentId;
      moment: { label: string; text: string };
      turns: ConversationTurn[];
      earlier: { label: string; text?: string; turns: ConversationTurn[] }[];
      moments: { label: string; explored: boolean }[];
      /** Her first words of the journey were just answered: an anonymous trial's free dream completes here (as with the first insight). */
      first: boolean;
      /** She said she is not in immediate danger, or that it was in the dream (doc 106): the model is told this is a sensitive moment. */
      distress?: boolean;
    }
  | { kind: 'summary'; basedOn: string; earlier: { label: string; text?: string; turns: ConversationTurn[] }[]; moments: { label: string; explored: boolean }[]; unexploredIds: MomentId[] };

/** Every word she said in this journey: the conversations, and the answers of moments explored the earlier way. */
const herWordsIn = (e: Exploration) =>
  Object.values(e.explored).flatMap((x) => [...(x.turns ?? []).filter((t) => t.role === 'dreamer' && !t.rejection && !t.steer).map((t) => t.text), x.answer ?? '', x.followUp?.answer ?? '']).filter((a) => a && !isUnsureAnswer(a));

function planConversation(mode: 'conversation-turn' | 'conversation-summary', e: Exploration, momentId: string | null): ConversationPlan | null {
  const moments = e.moments.map((m) => ({ label: m.label, explored: e.explored[m.id]?.status === 'explored' }));
  const earlier = exploredInOrder(e)
    .filter((x) => x.moment.id !== momentId)
    .map(({ moment, entry }) => ({ label: moment.label, text: moment.excerpt ?? moment.label, turns: entry.turns ?? [{ role: 'dare' as const, text: entry.question }, ...(entry.answer ? [{ role: 'dreamer' as const, text: entry.answer }] : [])] }));
  if (mode === 'conversation-summary') {
    if (!canRequestWholeView(e)) return null;
    return { kind: 'summary', basedOn: basedOnKey(e), earlier, moments, unexploredIds: e.moments.filter((m) => !e.explored[m.id]).map((m) => m.id) };
  }
  const m = e.moments.find((x) => x.id === momentId);
  if (!m) return null;
  const entry = e.explored[m.id];
  const moment = { label: m.label, text: m.excerpt ?? m.label };
  // three questions a moment: a moment whose questions were all asked on an earlier, unanswered visit is not opened again
  if (!entry) return exploringId(e) === null && questionsAsked(e, m.id) < MAX_QUESTIONS_PER_MOMENT ? { kind: 'turn', request: 'open', momentId: m.id, moment, turns: [], earlier, moments, first: false } : null;
  if (!needsTurnCall(e, m.id)) return null;
  // the "זה לא מתאים לי" button: answered at once, at most MAX_REJECTION_REPLIES times a dream (a forged extra bubble gets nothing)
  if (entry.turns?.[entry.turns.length - 1]?.rejection && rejectionRepliesUsed(e) >= MAX_REJECTION_REPLIES) return null;
  const turns = entry.turns ?? [];
  // after her answer to the third question (in words or with a button): the closing line, never a fourth question
  return { kind: 'turn', request: questionsAsked(e, m.id) >= MAX_QUESTIONS_PER_MOMENT ? 'close' : 'reply', momentId: m.id, moment, turns, earlier, moments, first: exploredCount(e) === 0 && turns.filter((t) => t.role === 'dreamer').length === 1 };
}

/**
 * How far above the 16 moment calls this dream's allowance reaches: the rejection replies already given, and the one asked for now.
 * Never more than MAX_REJECTION_REPLIES, so a dream can never reach more than 16 + 3 moment calls, however the journey was written.
 */
export function momentCapExtra(e: Exploration): number {
  const pending = Object.values(e.explored).some((x) => x.status === 'exploring' && x.turns?.[x.turns.length - 1]?.rejection);
  return Math.min(MAX_REJECTION_REPLIES, rejectionRepliesUsed(e) + (pending ? 1 : 0));
}

/** A turn is two to five lines: its answer is bounded, so its worst cost is known before it is asked for. */
export const TURN_MAX_OUTPUT_TOKENS = 700;

/** The closing line of a moment when none came back usable (no question, nothing invented); "another moment" only when one is left. */
export const closingLine = (language: AppLanguage, anotherLeft = true) =>
  anotherLeft
    ? language === 'he'
      ? 'תודה על מה ששיתפת ברגע הזה. אפשר לעבור לרגע אחר, או לראות מה עלה.'
      : 'Thank you for what you shared in this moment. You can go to another moment, or see what came up.'
    : language === 'he'
      ? 'תודה על מה ששיתפת ברגע הזה. אפשר לראות מה עלה.'
      : 'Thank you for what you shared in this moment. You can see what came up.';

const conversationContext = (ctx: DreamContext, e: Exploration) => ({ sourceText: ctx.sourceText, labels: e.moments.map((m) => m.label), herWords: herWordsIn(e), language: ctx.language,
  // the only ideas a summary may list as offered: DARE's offers she did not reject
  offers: Object.values(e.explored).flatMap((x) => (x.turns ?? []).filter((t) => t.role === 'dare' && t.offer && !t.rejected).map((t) => t.offer as string)),
  // the only "open questions" a summary may keep (with her own): questions DARE really asked
  questions: Object.values(e.explored).flatMap((x) => (x.turns ?? []).filter((t) => t.role === 'dare').flatMap((t) => `${t.text} ${t.offer ?? ''}`.split(/(?<=[.!?…])\s+/u)).filter((q) => q.includes('?'))) });

/** One turn: one call, checked (conversationTurn.ts); never a retry for a quote. The existing wording and address checks stay. */
export async function generateConversationTurn(client: OpenAI, ctx: DreamContext, p: Extract<ConversationPlan, { kind: 'turn' | 'summary' }>, e: Exploration, onUsage?: Usage, moderate: Moderate = realModerate) {
  const found = p.kind === 'turn' ? turnSignals({ turns: p.turns, momentText: p.moment.text }) : { rejectedOffer: false, shortOrUnsure: false, sensitive: false, sheAsked: false, meaningDoubt: false, rejectedNow: false };
  const signals = p.kind === 'turn' && p.distress ? { ...found, sensitive: true } : found;
  const instructions = buildTurnSystemPrompt(ctx.language, ctx.addressPreference);
  const input = buildTurnInput({ sourceText: ctx.sourceText, moments: p.moments, moment: p.kind === 'turn' ? p.moment : null, earlier: p.earlier, turns: p.kind === 'turn' ? p.turns : [], signals, request: p.kind === 'turn' ? p.request : 'summary', asked: p.kind === 'turn' ? questionsAsked(e, p.momentId) : undefined });
  // an angle she turned down (the button, or "not sure it means anything" right after it) is not offered again, unless she brings it back
  const turnsNow = p.kind === 'turn' ? p.turns : [];
  const herLast = [...turnsNow].reverse().find((t) => t.role === 'dreamer' && !t.rejection && !t.steer)?.text ?? '';
  const lastIsHers = turnsNow[turnsNow.length - 1]?.role === 'dreamer' && !turnsNow[turnsNow.length - 1]?.rejection && !turnsNow[turnsNow.length - 1]?.steer;
  const avoidAnchors = turnsNow.flatMap((t, i) => (t.role === 'dare' && t.anchors && (t.rejected || ((signals.meaningDoubt || signals.steer === 'shift') && i === turnsNow.length - 2)) ? t.anchors : []));
  const cc = { ...conversationContext(ctx, e), avoidAnchors, herLatest: lastIsHers ? herLast : '' };
  const shown = (raw: TurnRaw) => {
    const c = checkTurn(raw, cc);
    return [c.reply, c.offer].filter(Boolean);
  };
  const outcome = await runWithLanguageIntegrity<TurnRaw>(
    (note) => callModel(client, p.kind === 'turn' ? 'conversation-turn' : 'conversation-summary', 'OPENAI_REFLECTION_MODEL', instructions + note, input, 'conversation_turn', TURN_JSON_SCHEMA, parseTurn, onUsage, TURN_MAX_OUTPUT_TOKENS),
    (v) => [v.reply, v.offer].filter(Boolean),
    {
      route: p.kind === 'turn' ? 'conversation-turn' : 'conversation-summary',
      language: ctx.language,
      context: ctx.dreamerText,
      strictLatin: true,
      extraCheck: (v) => safety(ctx, shown(v)),
      qualityCheck: (v) => mixedPluralNote(shown(v), ctx.dreamerText) ?? garbledTextNote(shown(v)),
      maxQualityRetries: 1,
      rejectExhaustedQuality: true,
    },
  );
  if (outcome.status !== 'ok' && outcome.status !== 'quality_failed') return outcome;
  const checked = checkTurn(outcome.value, cc);
  // still failing a wording check after its one retry: the plain line, never the odd wording
  const odd = outcome.status === 'quality_failed' && (mixedPluralNote(shown(outcome.value), ctx.dreamerText) || garbledTextNote(shown(outcome.value)));
  // DARE's words are checked before they are shown (doc 106): its own check and moderation (doc 110). If either fails, the check
  // cannot run, or moderation is down, the plain line instead.
  const unsafe = !(await dareWordsSafe([checked.reply, checked.offer, ...checked.mine, ...checked.ideas].filter(Boolean), moderate));
  if (unsafe && p.kind === 'summary') return { status: 'unsafe' as const };
  if (p.kind === 'turn' && p.request === 'close') {
    // the closing line: no question of any kind and no offer, whatever came back; nothing usable = the plain closing line
    const said = odd || unsafe ? '' : checked.reply.split(/(?<=[.!?…])\s+/u).filter((x) => x.trim() && !isQuestionTurn({ role: 'dare', text: x })).join(' ');
    const anotherLeft = p.moments.some((x) => !x.explored && x.label !== p.moment.label);
    const closing: ConversationTurn = { role: 'dare', text: said || closingLine(ctx.language, anotherLeft), move: 'summarize', closing: true };
    return { status: 'ok' as const, value: { turn: closing, dropped: checked.dropped, fixed: checked.fixed, takeaways: { mine: [], ideas: [], open: [] } } };
  }
  const turn: ConversationTurn = odd || unsafe
    ? { role: 'dare', text: fallbackReply(ctx.language), move: 'reflect' }
    : { role: 'dare', text: checked.reply, move: checked.move, ...(checked.offer ? { offer: checked.offer, anchors: checked.anchors } : {}) };
  return { status: 'ok' as const, value: { turn, dropped: checked.dropped, fixed: checked.fixed, takeaways: { mine: unsafe || odd ? [] : checked.mine, ideas: unsafe || odd ? [] : checked.ideas, open: unsafe || odd ? [] : checked.open } } };
}

// ------------------------------------------------------------------------------------------------ the request

export interface ExplorationDeps {
  resolveIdentity: (headers: RequestHeaders) => Promise<ResolveCallerResult>;
  openai: () => OpenAI | null;
  trialState: typeof getTrialAttemptState;
  completeTrial: typeof completeTrialAttempt;
  rateLimit: (subject: string) => Promise<RateDecision>;
  /** `extra`: the dream's rejection replies (at most MAX_REJECTION_REPLIES) sit above the moment calls, so they never use up the 16. */
  reserveMoment: (attemptId: string, identity: CallerIdentity, extra?: number) => Promise<'reserved' | 'rejected' | null>;
  refundMoment: (attemptId: string) => Promise<void>;
  reserveWhole: (attemptId: string, identity: CallerIdentity) => Promise<'reserved' | 'rejected' | null>;
  refundWhole: (attemptId: string) => Promise<void>;
  address: (identity: CallerIdentity, headers: RequestHeaders) => Promise<AddressPreference>;
  generateQuestion: typeof generateMomentQuestion;
  generateReply: typeof generateMomentReply | typeof generatePairReply;
  generateWhole: typeof generateWholeView;
  generateTurn: typeof generateConversationTurn;
  /** The second safety layer (moderation.ts); what its failure means is decided by the callers. */
  moderate: Moderate;
  /** DARE's AI budget ran out (2026-10-30): the dream's credit, once. */
  refundCredit: typeof refundAttemptCreditOnce;
}

export const realExplorationDeps: ExplorationDeps = {
  resolveIdentity: (h) => resolveAdultCaller(h),
  openai: getOpenAIClient,
  trialState: getTrialAttemptState,
  completeTrial: completeTrialAttempt,
  rateLimit: (subject) => enforceRateLimits(databaseRateLimitStore, 'explore', subject, explorationRules(), (m) => console.warn(`[rate-limit] ${m}`)),
  reserveMoment: (attemptId, identity, extra = 0) => reserveLabelsAttempt(attemptId, identity, EXPLORATION_LABEL_CAP + Math.min(MAX_REJECTION_REPLIES, Math.max(0, extra))),
  refundMoment: refundLabelsAttempt,
  reserveWhole: reserveReflectionAttempt,
  refundWhole: refundReflectionAttempt,
  address: resolveAddressPreference,
  generateQuestion: generateMomentQuestion,
  // the listening journey (doc 90 v3): two details and a question, never an interpretation; the earlier reply stays, unused here
  generateReply: generatePairReply,
  generateWhole: generateListeningWhole,
  // the conversation engine (doc 102)
  generateTurn: generateConversationTurn,
  moderate: realModerate,
  refundCredit: refundAttemptCreditOnce,
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

  // The distress path (doc 106), in code and before anything else: on risk no model call, no slot, no rate-limit hit, and nothing is
  // logged or kept. After immediate danger or a threat, the journey makes no further call, whatever is sent with it.
  const ack = safetyAckOf(body.safetyAck);
  let words: ReturnType<typeof herWordsForSafety> | null = null;
  try {
    words = herWordsForSafety(exploration, mode, momentId);
  } catch {
    /* the check could not run: closed, just below */
  }
  // her last words in this moment, joined, so a sentence split over turns is read whole
  const recent = momentId ? (exploration.explored[momentId]?.turns ?? []).filter((t) => t.role === 'dreamer').slice(-3).map((t) => t.text).join(' ') : '';
  const gate = words ? await checkHerAnswers({ ...words, recent, ack, moderate: deps.moderate }) : ({ allowed: false, level: 'concern' } as const);
  if (!gate.allowed) return withHeaders(okResult({ safety: { level: gate.level } }), cookie);

  // Nothing new to ask: no model call, no slot, no rate-limit hit.
  const planned = planCall(mode, exploration, momentId, segmentsOf);
  if (!planned) return fail(409, 'not_needed', 'Nothing new to ask for this journey: the stored result is the answer.');
  const plan: Plan = planned.kind === 'turn' && gate.level !== 'none' ? { ...planned, distress: true } : planned;

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

  const whole = plan.kind === 'whole' || plan.kind === 'summary';
  const reservation = await (whole ? deps.reserveWhole(attemptId, resolved.identity) : deps.reserveMoment(attemptId, resolved.identity, momentCapExtra(exploration)));
  if (reservation === null) return fail(503, 'not_configured', 'Usage tracking is not configured.');
  if (reservation === 'rejected') return fail(403, 'limit_reached', 'This dream has used its allowance for this step, or the attempt is invalid.');
  const refund = () => (whole ? deps.refundWhole : deps.refundMoment)(attemptId);

  const ctx = contextOf(analysis, exploration, language, await deps.address(resolved.identity, headers), emotions);

  try {
    if (plan.kind === 'turn' || plan.kind === 'summary') {
      const outcome = await deps.generateTurn(client, ctx, plan, exploration, undefined, deps.moderate);
      if (outcome.status !== 'ok') {
        await refund();
        // a summary held back by the safety check (or with moderation down) is said so, apart from a failure of the service
        if (outcome.status === 'unsafe') return fail(502, 'held_back', 'The summary did not pass the safety check, so it is not shown.');
        return fail(502, 'invalid_response', 'The turn could not be written.');
      }
      const { turn, takeaways } = outcome.value;
      if (plan.kind === 'summary') {
        // "what came up": the conversation's own words, kept as the whole view (no technical notice, nothing interpreted by code)
        const wholeView = { kind: 'whole', notice: null, overview: [turn.text, turn.offer ?? ''].filter(Boolean).join(' '), connections: [], recurring: null, contrast: null, readings: [], closingQuestion: '', invite: plan.unexploredIds, ...(takeaways.mine.length || takeaways.ideas.length || takeaways.open.length ? { takeaways: { mine: takeaways.mine, ideas: takeaways.ideas, ...(takeaways.open.length ? { open: takeaways.open } : {}) } } : {}) };
        return withHeaders(okResult({ basedOn: plan.basedOn, wholeView }), cookie);
      }
      // An anonymous trial's free dream is complete when DARE first answers her (fails closed, like the first insight).
      if (resolved.identity.kind === 'trial' && plan.first) {
        const completion = await deps.completeTrial(attemptId, resolved.identity.trialId);
        if (completion !== 'completed') {
          await refund();
          return completion === 'consumed' ? fail(403, 'free_dream_used', FREE_DREAM_USED_MESSAGE) : fail(503, 'not_configured', 'Usage tracking is not configured.');
        }
      }
      return withHeaders(okResult({ momentId: plan.momentId, turn }), cookie);
    }
    if (plan.kind === 'question') {
      const outcome = await deps.generateQuestion(client, ctx, plan);
      if (outcome.status !== 'ok') {
        await refund();
        return fail(502, 'invalid_response', 'The question could not be written.');
      }
      const v = outcome.value as Partial<QuestionValue> & { question: string };
      if (!(await dareWordsSafe(v.question, deps.moderate))) {
        await refund();
        return fail(502, 'invalid_response', 'The question could not be written.');
      }
      return withHeaders(okResult({ momentId: plan.momentId, question: v.question, source: v.source ?? 'adaptive', focus: v.focus ?? null, subject: v.subject ?? null, alternative: plan.alternative !== null }), cookie);
    }
    if (plan.kind === 'reply') {
      const outcome = await deps.generateReply(client, ctx, plan);
      if (outcome.status !== 'ok') {
        await refund();
        return fail(502, 'invalid_response', 'The insight could not be written.');
      }
      const v = outcome.value as unknown as Partial<ReplyValue> & { insight: AssembledInsight | MomentInsight };
      if (!(await dareWordsSafe([v.insight, v.followUpQuestion], deps.moderate))) {
        await refund();
        return fail(502, 'invalid_response', 'The insight could not be written.');
      }
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
    if (!(await dareWordsSafe(view, deps.moderate))) {
      await refund();
      return fail(502, 'invalid_response', 'The whole view could not be written.');
    }
    const kind = view.kind ?? 'whole';
    // Every check failed: the verified summary is shown and the whole-view slot is returned (only 3 per dream exist).
    if (kind === 'factual-summary') await refund();
    return withHeaders(okResult({ basedOn: plan.basedOn, wholeView: { ...view, kind } }), cookie);
  } catch (err) {
    await refund();
    // DARE's AI budget ran out (2026-10-30): once, the dream's credit comes back; the journey stays as it is on her screen
    const budget = await laterStepBudgetResult(err, attemptId, resolved.identity, deps.refundCredit);
    if (budget) return withHeaders(budget, cookie);
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
