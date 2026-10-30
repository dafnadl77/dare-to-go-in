import type { AppLanguage } from './appLanguage';
import type { DreamAnalysis } from './dreamAnalysisSchema';
import type { EmotionId } from './dreamEmotions';
import { REFLECTION_TIMEOUT_MS, LABELS_TIMEOUT_MS } from './requestTimeouts';
import { segmentDream, segmentsForMoment } from './dreamSegments';
import { unsureLook, type QuestionFocus } from './claimCheck';
import {
  alternativeQuestionAllowed,
  answeredUnsure,
  basedOnKey,
  canRequestWholeView,
  needsQuestionCall,
  needsReplyCall,
  questionPlanFor,
  wholeViewIsStale,
  type Exploration,
  type MomentId,
  type MomentInsight,
  type WholeViewRecord,
  type ConversationTurn,
  exploringId,
  needsTurnCall,
  MOVES,
} from './exploration';
import { journeyGate, safetyAckOf } from './safety/journeySafety';
import type { RiskLevel, SafetyAck } from './safety/riskDetector';

/**
 * The browser side of the multi-moment journey's three calls (stage 3b; the screens use it in stage 3c). Before any request it asks the
 * journey's own rules whether a call is needed at all (exploration.ts): a pre-written question for the first moment, a moment already
 * opened or explored, a reply already received, or a whole view of the same answers is answered from what is stored, with no request.
 * Two identical requests at the same time share one; a whole view already received for the same answers is served from memory.
 */

/** 'safety': her words call for the distress path (doc 106), so nothing was sent. */
/** 'held_back': the answer did not pass the safety check; 'budget_reached': the live test's budget guard refused (local bridge only).
    'service_unavailable' / 'service_unavailable_refunded': DARE's AI budget ran out (2026-10-30), the dream's credit returned or not. */
export type EngineError = 'safety' | 'not_needed' | 'limit_reached' | 'rate_limited' | 'free_dream_used' | 'not_authenticated' | 'request_failed' | 'held_back' | 'budget_reached' | 'service_unavailable' | 'service_unavailable_refunded';

export type QuestionOutcome =
  | { status: 'ok'; question: string; source: 'pregenerated' | 'adaptive' | 'fixed'; focus: QuestionFocus | null; subject: string | null; alternative: boolean; requested: boolean }
  | { status: 'error'; reason: EngineError };
/** retryAllowed: the insight is factual (no interpretation passed its checks) and one more try may be asked for. unsure: the answer was
    "I don't know" — the moment gets the dream's own words, with no request. */
export type ReplyOutcome =
  | { status: 'ok'; insight: MomentInsight; followUpQuestion: string | null; refreshed: boolean; retryAllowed: boolean; unsure: boolean }
  | { status: 'error'; reason: EngineError };
export type WholeViewOutcome =
  | { status: 'ok'; view: Omit<WholeViewRecord, 'basedOn' | 'momentIds' | 'generatedAt'>; basedOn: string; requested: boolean }
  | { status: 'error'; reason: EngineError };

/** 'safety': her words call for the distress path (doc 106); nothing was sent, or the route answered with it. */
export type TurnOutcome = { status: 'ok'; turn: ConversationTurn } | { status: 'error'; reason: EngineError } | { status: 'safety'; level: RiskLevel };

export interface EngineDeps {
  post: (url: string, body: unknown, timeoutMs: number) => Promise<{ status: number; data: unknown }>;
}

export interface ExplorationEngine {
  question(e: Exploration, analysis: DreamAnalysis, momentId: MomentId, language: AppLanguage): Promise<QuestionOutcome>;
  reply(e: Exploration, analysis: DreamAnalysis, momentId: MomentId, language: AppLanguage, emotions: readonly EmotionId[]): Promise<ReplyOutcome>;
  /** 'conversation-summary' asks for "what came up" of the conversation (doc 102), on the same whole-view slot. */
  wholeView(e: Exploration, analysis: DreamAnalysis, language: AppLanguage, emotions: readonly EmotionId[], mode?: 'whole-view' | 'conversation-summary'): Promise<WholeViewOutcome>;
  /** One turn of DARE in a moment's conversation (doc 102): opening a moment, or answering her. Never asked when DARE spoke last. */
  turn(e: Exploration, analysis: DreamAnalysis, momentId: MomentId, language: AppLanguage, emotions: readonly EmotionId[], extra?: { safetyAck?: SafetyAck }): Promise<TurnOutcome>;
  /** Requests actually sent, and calls avoided because the answer was already known. */
  readonly stats: { sent: number; avoided: number };
}

function reasonOf(status: number, data: unknown): EngineError {
  const r = typeof data === 'object' && data !== null ? (data as { reason?: unknown }).reason : undefined;
  if (status === 409 || r === 'not_needed') return 'not_needed';
  if (r === 'service_unavailable_refunded') return 'service_unavailable_refunded';
  if (r === 'service_unavailable') return 'service_unavailable';
  if (status === 429 || r === 'rate_limited') return 'rate_limited';
  if (r === 'free_dream_used') return 'free_dream_used';
  if (r === 'limit_reached') return 'limit_reached';
  if (r === 'held_back') return 'held_back';
  if (r === 'budget_reached') return 'budget_reached';
  if (status === 401 || r === 'not_authenticated') return 'not_authenticated';
  return 'request_failed';
}

const isStr = (v: unknown): v is string => typeof v === 'string';

export function createExplorationEngine(deps: EngineDeps): ExplorationEngine {
  const inFlight = new Map<string, Promise<unknown>>();
  const wholeViews = new Map<string, WholeViewOutcome>();
  const stats = { sent: 0, avoided: 0 };

  const once = <T>(key: string, run: () => Promise<T>): Promise<T> => {
    const existing = inFlight.get(key);
    if (existing) {
      stats.avoided += 1;
      return existing as Promise<T>;
    }
    const p = run().finally(() => inFlight.delete(key));
    inFlight.set(key, p);
    return p;
  };

  const send = async (url: string, body: unknown, timeoutMs: number) => {
    stats.sent += 1;
    return deps.post(url, body, timeoutMs);
  };

  return {
    stats,

    async question(e, analysis, momentId, language) {
      if (!journeyGate(e, 'moment-question', momentId, null).allowed) return { status: 'error', reason: 'safety' };
      const plan = questionPlanFor(e, momentId);
      if (plan.kind === 'ready' && !e.explored[momentId]) {
        stats.avoided += 1;
        return { status: 'ok', question: plan.question, source: 'pregenerated', focus: null, subject: null, alternative: false, requested: false };
      }
      const alternative = alternativeQuestionAllowed(e.explored[momentId]);
      if (!needsQuestionCall(e, momentId) && !alternative) {
        stats.avoided += 1;
        return { status: 'error', reason: 'not_needed' };
      }
      return once(`${e.attemptId}|q|${momentId}|${alternative ? 'alt' : 'first'}`, async () => {
        try {
          const { status, data } = await send('/api/dream-element-labels', { mode: 'moment-question', attemptId: e.attemptId, language, dreamAnalysis: analysis, exploration: e, momentId }, LABELS_TIMEOUT_MS);
          const d = data as Record<string, unknown> | null;
          if (status === 200 && d && isStr(d.question))
            return {
              status: 'ok' as const,
              question: d.question,
              source: d.source === 'fixed' ? ('fixed' as const) : ('adaptive' as const),
              focus: isStr(d.focus) ? (d.focus as QuestionFocus) : null,
              subject: isStr(d.subject) ? d.subject : null,
              alternative: d.alternative === true,
              requested: true,
            };
          return { status: 'error' as const, reason: reasonOf(status, data) };
        } catch {
          return { status: 'error' as const, reason: 'request_failed' as const };
        }
      });
    },

    async reply(e, analysis, momentId, language, emotions) {
      if (!journeyGate(e, 'moment-reply', momentId, null).allowed) return { status: 'error', reason: 'safety' };
      const entry = e.explored[momentId];
      // "I don't know": never interpreted, never a request — the dream's own words for the moment
      if (entry && entry.status === 'exploring' && answeredUnsure(entry) && entry.insight === null) {
        stats.avoided += 1;
        const segments = segmentDream(analysis.sourceText);
        const m = e.moments.find((x) => x.id === momentId);
        const look = unsureLook(language, analysis.sourceText, segments, m ? segmentsForMoment(segments, m) : []);
        return { status: 'ok', insight: look, followUpQuestion: null, refreshed: false, retryAllowed: false, unsure: true };
      }
      if (!needsReplyCall(e, momentId)) {
        stats.avoided += 1;
        return { status: 'error', reason: 'not_needed' };
      }
      const refresh = entry?.insight ? (entry.insight.kind === 'factual' ? 'retry' : 'refresh') : 'first';
      return once(`${e.attemptId}|r|${momentId}|${refresh}`, async () => {
        try {
          const { status, data } = await send('/api/dream-reflection', { mode: 'moment-reply', attemptId: e.attemptId, language, dreamAnalysis: analysis, exploration: e, momentId, emotions }, REFLECTION_TIMEOUT_MS);
          const d = data as Record<string, unknown> | null;
          const ins = d && typeof d.insight === 'object' && d.insight !== null ? (d.insight as Record<string, unknown>) : null;
          if (status === 200 && ins && isStr(ins.observation) && isStr(ins.reflection) && isStr(ins.possibility)) {
            const kind = ins.kind === 'factual' ? ('factual' as const) : ins.kind === 'listening' ? ('listening' as const) : null;
            // a listening insight may carry two details and a question (doc 90 v3); the journey's own reader checks it on receipt
            const pair = kind === 'listening' && typeof ins.pair === 'object' && ins.pair !== null ? (ins.pair as MomentInsight['pair']) : undefined;
            return {
              status: 'ok' as const,
              insight: { observation: ins.observation, reflection: ins.reflection, possibility: ins.possibility, ...(kind ? { kind } : {}), ...(pair ? { pair } : {}) },
              followUpQuestion: d && isStr(d.followUpQuestion) && d.followUpQuestion.trim() ? d.followUpQuestion : null,
              refreshed: d?.refreshed === true,
              retryAllowed: d?.retryAllowed === true,
              unsure: false,
            };
          }
          return { status: 'error' as const, reason: reasonOf(status, data) };
        } catch {
          return { status: 'error' as const, reason: 'request_failed' as const };
        }
      });
    },

    async turn(e, analysis, momentId, language, emotions, extra) {
      const opening = !e.explored[momentId] && exploringId(e) === null;
      if (!opening && !needsTurnCall(e, momentId)) {
        stats.avoided += 1;
        return { status: 'error', reason: 'not_needed' };
      }
      // her words are checked here before they leave the browser (and again by the route)
      const ack = safetyAckOf(extra?.safetyAck);
      const gate = journeyGate(e, 'conversation-turn', momentId, ack);
      if (!gate.allowed) return { status: 'safety', level: gate.level };
      const n = e.explored[momentId]?.turns?.length ?? 0;
      return once(`${e.attemptId}|t|${momentId}|${n}|${ack ?? ''}`, async () => {
        try {
          const { status, data } = await send('/api/dream-reflection', { mode: 'conversation-turn', attemptId: e.attemptId, language, dreamAnalysis: analysis, exploration: e, momentId, emotions, ...(ack ? { safetyAck: ack } : {}) }, REFLECTION_TIMEOUT_MS);
          const d = data as Record<string, unknown> | null;
          const t = d && typeof d.turn === 'object' && d.turn !== null ? (d.turn as Record<string, unknown>) : null;
          const safety = d && typeof d.safety === 'object' && d.safety !== null ? (d.safety as { level?: unknown }).level : undefined;
          if (status === 200 && (safety === 'uncertain' || safety === 'concern' || safety === 'danger' || safety === 'threat')) return { status: 'safety' as const, level: safety };
          if (status === 200 && t && isStr(t.text)) {
            const move = isStr(t.move) && (MOVES as readonly string[]).includes(t.move) ? (t.move as ConversationTurn['move']) : undefined;
            return { status: 'ok' as const, turn: { role: 'dare' as const, text: t.text, ...(move ? { move } : {}), ...(isStr(t.offer) && t.offer ? { offer: t.offer, ...(Array.isArray(t.anchors) ? { anchors: t.anchors.filter(isStr) } : {}) } : {}), ...(t.closing === true ? { closing: true as const } : {}) } };
          }
          return { status: 'error' as const, reason: reasonOf(status, data) };
        } catch {
          return { status: 'error' as const, reason: 'request_failed' as const };
        }
      });
    },

    async wholeView(e, analysis, language, emotions, mode = 'whole-view') {
      if (!journeyGate(e, mode, null, null).allowed) return { status: 'error', reason: 'safety' };
      const key = basedOnKey(e);
      // The stored view of these same answers: shown again, never requested again.
      if (e.wholeView && !wholeViewIsStale(e) && !canRequestWholeView(e)) {
        stats.avoided += 1;
        const { basedOn, momentIds: _m, generatedAt: _g, ...view } = e.wholeView;
        void _m;
        void _g;
        return { status: 'ok', view, basedOn, requested: false };
      }
      const remembered = wholeViews.get(`${e.attemptId}|${key}`);
      if (remembered) {
        stats.avoided += 1;
        return remembered.status === 'ok' ? { ...remembered, requested: false } : remembered;
      }
      if (!canRequestWholeView(e)) {
        stats.avoided += 1;
        return { status: 'error', reason: e.wholeViewCount >= 3 ? 'limit_reached' : 'not_needed' };
      }
      return once(`${e.attemptId}|w|${key}`, async () => {
        try {
          const { status, data } = await send('/api/dream-reflection', { mode, attemptId: e.attemptId, language, dreamAnalysis: analysis, exploration: e, emotions }, REFLECTION_TIMEOUT_MS);
          const d = data as Record<string, unknown> | null;
          const w = d && typeof d.wholeView === 'object' && d.wholeView !== null ? (d.wholeView as Record<string, unknown>) : null;
          if (status === 200 && d && isStr(d.basedOn) && w && isStr(w.overview)) {
            const outcome: WholeViewOutcome = {
              status: 'ok',
              basedOn: d.basedOn,
              requested: true,
              view: {
                overview: w.overview,
                recurring: isStr(w.recurring) ? w.recurring : null,
                contrast: isStr(w.contrast) ? w.contrast : null,
                readings: Array.isArray(w.readings) ? (w.readings as { basis: string; reading: string }[]) : [],
                closingQuestion: isStr(w.closingQuestion) ? w.closingQuestion : '',
                connections: Array.isArray(w.connections) ? (w.connections as WholeViewRecord['connections']) : [],
                kind: isStr(w.kind) ? (w.kind as WholeViewRecord['kind']) : 'whole',
                notice: isStr(w.notice) ? w.notice : null,
                invite: Array.isArray(w.invite) ? w.invite.filter(isStr) : [],
                // "מה לקחתי מהחלום": passed through as received; the journey keeps only strings, at most three each
                ...(w.takeaways && typeof w.takeaways === 'object' ? { takeaways: w.takeaways as WholeViewRecord['takeaways'] } : {}),
              },
            };
            // a factual summary is not remembered: one retry of the same answers stays possible
            if (w.kind !== 'factual-summary') wholeViews.set(`${e.attemptId}|${key}`, outcome);
            return outcome;
          }
          return { status: 'error' as const, reason: reasonOf(status, data) };
        } catch {
          return { status: 'error' as const, reason: 'request_failed' as const };
        }
      });
    },
  };
}
