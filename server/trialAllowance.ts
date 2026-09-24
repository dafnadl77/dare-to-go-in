import { readPositiveIntEnv } from './anonymousSafetyValves.js';

/**
 * The anonymous "first dream free" rule — ONE completed free dream per trial
 * identity, for life. Authoritative state is server-side only
 * (public.trial_identities.free_dream_completed_at, public.dream_attempts.completed_at,
 * enforced atomically by the create_trial_attempt / complete_trial_attempt SQL
 * functions and a partial unique index — see the trial_lifetime_free_dream_enforcement
 * migration). This module holds only the tunable limits and the typed mapping
 * from the database's answer to an HTTP response.
 *
 * "Completed" = the dream's grounded reflection (dream-reflection) was
 * successfully generated and delivered: the last AI product of the journey and
 * the point at which the dreamer has received the whole experience. Earlier
 * points (analysis, image) can still fail or be corrected; the SAVE step
 * cannot be the marker because an anonymous dreamer is asked to sign up there
 * and may simply leave.
 *
 * Technical attempts (refresh, transient failures) get bounded grace: up to
 * MAX_TRIAL_ATTEMPTS attempt rows for the identity's whole life, all before
 * completion. An attempt whose AI call failed is deleted by the route and
 * never counts.
 */
export const DEFAULT_MAX_TRIAL_ATTEMPTS = 3;
export const MAX_TRIAL_ATTEMPTS_ENV = 'DARE_TRIAL_MAX_ATTEMPTS';

/** Emergency circuit breaker: total anonymous attempts started (all identities) in a rolling 24h.
    Default is far above real traffic yet bounds worst-case anonymous spend. */
export const DEFAULT_ANON_ATTEMPTS_PER_DAY = 150;
export const ANON_ATTEMPTS_PER_DAY_ENV = 'DARE_ANON_MAX_ATTEMPTS_PER_DAY';

/** Voice transcriptions an anonymous identity may ever use before the free dream is complete. */
export const DEFAULT_MAX_TRIAL_TRANSCRIPTIONS = 8;
export const MAX_TRIAL_TRANSCRIPTIONS_ENV = 'DARE_TRIAL_MAX_TRANSCRIPTIONS';

/** Element-label calls per attempt (the journey makes one; the rest is retry headroom). */
export const MAX_LABEL_CALLS_PER_ATTEMPT = 3;

type Env = Record<string, string | undefined>;

export const maxTrialAttempts = (env: Env = process.env) => readPositiveIntEnv(env[MAX_TRIAL_ATTEMPTS_ENV], DEFAULT_MAX_TRIAL_ATTEMPTS);
export const anonAttemptsPerDay = (env: Env = process.env) => readPositiveIntEnv(env[ANON_ATTEMPTS_PER_DAY_ENV], DEFAULT_ANON_ATTEMPTS_PER_DAY);
export const maxTrialTranscriptions = (env: Env = process.env) => readPositiveIntEnv(env[MAX_TRIAL_TRANSCRIPTIONS_ENV], DEFAULT_MAX_TRIAL_TRANSCRIPTIONS);

/** What the database said when asked to create an anonymous attempt. */
export type TrialAttemptDecision =
  | { ok: true; attemptId: string }
  | { ok: false; reason: 'free_dream_used' | 'temporarily_unavailable' | 'not_configured' };

/** Maps the create_trial_attempt SQL function's jsonb result. Anything
    unrecognized fails closed. */
export function decideTrialAttempt(rpcResult: unknown): TrialAttemptDecision {
  if (!rpcResult || typeof rpcResult !== 'object') return { ok: false, reason: 'not_configured' };
  const r = rpcResult as { status?: unknown; attempt_id?: unknown };
  if (r.status === 'created' && typeof r.attempt_id === 'string') return { ok: true, attemptId: r.attempt_id };
  if (r.status === 'consumed' || r.status === 'attempt_limit') return { ok: false, reason: 'free_dream_used' };
  if (r.status === 'unavailable') return { ok: false, reason: 'temporarily_unavailable' };
  return { ok: false, reason: 'not_configured' };
}

export type TrialAttemptState = 'open' | 'own_completed' | 'consumed_elsewhere' | 'unknown_attempt';
export function readTrialAttemptState(value: unknown): TrialAttemptState | null {
  return value === 'open' || value === 'own_completed' || value === 'consumed_elsewhere' || value === 'unknown_attempt' ? value : null;
}

export type TrialCompletionResult = 'completed' | 'consumed' | 'not_found';
export function readTrialCompletion(value: unknown): TrialCompletionResult | null {
  return value === 'completed' || value === 'consumed' || value === 'not_found' ? value : null;
}

/** The user-facing wording never mentions quotas; the typed reason is what
    the client maps to its existing sign-in flow. */
export const FREE_DREAM_USED_MESSAGE = 'Your first dream was free. To continue with more dreams, sign in or create an account.';
export const TEMPORARILY_UNAVAILABLE_MESSAGE = 'DARE is resting for a moment. Please try again a little later.';
