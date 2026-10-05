import type { CallerIdentity } from './callerIdentity.js';
import type { TrialAttemptDecision } from './trialAllowance.js';

/**
 * How a dream-analysis request obtains its attempt, and what it does when the SAME submitted
 * dream is sent again (client timeout, dropped connection, refresh, uncertain response).
 *
 * A signed-in account that sends an idempotency key goes through the database's
 * start_user_attempt_idem, which decides atomically (advisory lock + unique index):
 *   created    -> one credit spent, run the model
 *   replay     -> already analyzed: return the stored result, NO spend, NO model call
 *   processing -> the original request is still running: wait for it (never spend or run again)
 *   refused    -> credits_required / conflict (same key, different text) / expired / invalid key
 * Everything else (anonymous trials, and accounts whose client sends no key) keeps the existing
 * non-idempotent path unchanged: for anonymous trials there is no credit to protect, and their
 * one-free-dream and three-technical-attempts rules are decided by create_trial_attempt, which
 * this deliberately does not touch.
 */
export type IdemStartDecision =
  | { kind: 'created'; attemptId: string }
  | { kind: 'replay'; attemptId: string; analysis: Record<string, unknown> }
  | { kind: 'processing'; attemptId: string }
  | { kind: 'refused'; reason: 'credits_required' | 'conflict' | 'expired' | 'invalid_key' | 'not_configured' };

/** Maps start_user_attempt_idem's jsonb. Anything unrecognized fails closed (never creates or replays). */
export function decideIdemStart(rpcResult: unknown): IdemStartDecision {
  if (!rpcResult || typeof rpcResult !== 'object') return { kind: 'refused', reason: 'not_configured' };
  const r = rpcResult as { status?: unknown; attempt_id?: unknown; analysis?: unknown };
  const id = typeof r.attempt_id === 'string' ? r.attempt_id : null;
  switch (r.status) {
    case 'created':
      return id ? { kind: 'created', attemptId: id } : { kind: 'refused', reason: 'not_configured' };
    case 'replay':
      return id && r.analysis && typeof r.analysis === 'object' && !Array.isArray(r.analysis)
        ? { kind: 'replay', attemptId: id, analysis: r.analysis as Record<string, unknown> }
        : { kind: 'refused', reason: 'not_configured' };
    case 'processing':
      return id ? { kind: 'processing', attemptId: id } : { kind: 'refused', reason: 'not_configured' };
    case 'credits_required':
      return { kind: 'refused', reason: 'credits_required' };
    case 'conflict':
      return { kind: 'refused', reason: 'conflict' };
    case 'expired':
      return { kind: 'refused', reason: 'expired' };
    case 'invalid_key':
      return { kind: 'refused', reason: 'invalid_key' };
    default:
      return { kind: 'refused', reason: 'not_configured' };
  }
}

export interface AnalysisStartDeps {
  /** The existing attempt creation (anonymous trials; and signed-in accounts without a key). */
  startLegacy(identity: CallerIdentity): Promise<TrialAttemptDecision>;
  /** start_user_attempt_idem. */
  startIdempotent(userId: string, key: string, inputHash: string): Promise<IdemStartDecision>;
  sleep(ms: number): Promise<void>;
}

export type AnalysisStart =
  /** A fresh attempt: the caller runs the model. `idempotent` = record the result for replays. */
  | { kind: 'run'; attemptId: string; idempotent: boolean }
  | { kind: 'replay'; attemptId: string; analysis: Record<string, unknown> }
  | { kind: 'refused'; reason: TrialAttemptDecisionReason | Extract<IdemStartDecision, { kind: 'refused' }>['reason'] }
  /** The original request is still running after the bounded wait: the client may ask again later. */
  | { kind: 'in_progress' };

type TrialAttemptDecisionReason = Extract<TrialAttemptDecision, { ok: false }>['reason'];

/** How long a duplicate waits for the original request (polling the database), before answering in_progress. */
export const DUPLICATE_POLL_MS = 1500;
export const DUPLICATE_MAX_POLLS = 20;

export async function startAnalysisAttempt(
  identity: CallerIdentity,
  key: string | null,
  inputHash: string,
  deps: AnalysisStartDeps,
  options: { pollMs?: number; maxPolls?: number } = {},
): Promise<AnalysisStart> {
  if (identity.kind !== 'user' || key === null) {
    const created = await deps.startLegacy(identity);
    return created.ok ? { kind: 'run', attemptId: created.attemptId, idempotent: false } : { kind: 'refused', reason: created.reason };
  }
  const pollMs = options.pollMs ?? DUPLICATE_POLL_MS;
  const maxPolls = options.maxPolls ?? DUPLICATE_MAX_POLLS;
  for (let poll = 0; poll <= maxPolls; poll += 1) {
    const decision = await deps.startIdempotent(identity.userId, key, inputHash);
    if (decision.kind === 'created') return { kind: 'run', attemptId: decision.attemptId, idempotent: true };
    if (decision.kind === 'replay') return { kind: 'replay', attemptId: decision.attemptId, analysis: decision.analysis };
    if (decision.kind === 'refused') return { kind: 'refused', reason: decision.reason };
    // 'processing': the original request owns this attempt. Never spend, never run the model: wait.
    if (poll < maxPolls) await deps.sleep(pollMs);
  }
  return { kind: 'in_progress' };
}
