import { getSupabaseServiceClient } from './supabaseServiceClient.js';
import type { CallerIdentity } from './callerIdentity.js';
import type { TrialMintStore } from './anonymousSafetyValves.js';
import {
  anonAttemptsPerDay,
  decideTrialAttempt,
  decideUserAttempt,
  maxTrialAttempts,
  maxTrialTranscriptions,
  MAX_LABEL_CALLS_PER_ATTEMPT,
  readTrialAttemptState,
  readTrialCompletion,
  type TrialAttemptDecision,
  type TrialAttemptState,
  type TrialCompletionResult,
} from './trialAllowance.js';

const MAX_IMAGE_ATTEMPTS = 3;
const MAX_REFLECTION_ATTEMPTS = 3;

export { MAX_IMAGE_ATTEMPTS, MAX_REFLECTION_ATTEMPTS };

/** Creates the trial_identities row for a brand-new trial cookie just
    minted by this request. */
export async function createNewTrialIdentity(trialId: string): Promise<boolean> {
  const client = getSupabaseServiceClient();
  if (!client) return false;
  const { error } = await client.from('trial_identities').insert({ id: trialId });
  return !error;
}

/** A previously-issued (signature-verified) trial cookie's row should
    already exist — this just touches last_seen_at. If the row is
    genuinely missing (e.g. a database reset), it re-creates it rather
    than silently treating the identity as backed by nothing; either way
    this never fabricates usage history, it only ensures a row exists to
    attach future attempts to. */
export async function ensureTrialIdentityExists(trialId: string): Promise<boolean> {
  const client = getSupabaseServiceClient();
  if (!client) return false;
  const { error: updateError, count } = await client
    .from('trial_identities')
    .update({ last_seen_at: new Date().toISOString() }, { count: 'exact' })
    .eq('id', trialId);
  if (!updateError && count && count > 0) return true;
  // Missing row — recreate it (upsert, ignoring a race with a concurrent
  // request doing the same thing).
  const { error: insertError } = await client
    .from('trial_identities')
    .upsert({ id: trialId }, { onConflict: 'id', ignoreDuplicates: true });
  return !insertError;
}

export const trialMintStore: TrialMintStore = {
  async countTrialsSince(sinceIso) {
    const client = getSupabaseServiceClient();
    if (!client) return null;
    const { count, error } = await client.from('trial_identities').select('id', { count: 'exact', head: true }).gte('created_at', sinceIso);
    return error || count === null ? null : count;
  },
};

/**
 * dream-analysis's attempt creation. A signed-in account spends ONE purchased
 * credit atomically with creating the attempt (start_user_attempt) and is
 * refused with credits_required at a zero balance; the account never gets an
 * implicit free dream — the free dream is the anonymous trial's alone. An
 * anonymous trial goes through
 * the create_trial_attempt SQL function, which — serialized per trial identity
 * by an advisory lock — refuses once the identity's ONE free dream is complete
 * (or the identity was claimed by an account), refuses beyond the lifetime cap
 * of technical attempts, and refuses when the global anonymous-spend breaker
 * is open. Nothing here trusts any client-side flag.
 */
export async function createAttemptForIdentity(identity: CallerIdentity): Promise<TrialAttemptDecision> {
  const client = getSupabaseServiceClient();
  if (!client) return { ok: false, reason: 'not_configured' };
  if (identity.kind === 'user') {
    const { data, error } = await client.rpc('start_user_attempt', { p_owner: identity.userId });
    return error ? { ok: false, reason: 'not_configured' } : decideUserAttempt(data);
  }
  const { data, error } = await client.rpc('create_trial_attempt', {
    p_trial_id: identity.trialId,
    p_max_attempts: maxTrialAttempts(),
    p_global_limit: anonAttemptsPerDay(),
  });
  if (error) return { ok: false, reason: 'not_configured' };
  return decideTrialAttempt(data);
}

/** For a trial's attempt: is the free dream still open, already delivered by THIS attempt, or consumed by another? null = could not be determined (callers fail closed). */
export async function getTrialAttemptState(attemptId: string, trialId: string): Promise<TrialAttemptState | null> {
  const client = getSupabaseServiceClient();
  if (!client) return null;
  const { data, error } = await client.rpc('trial_attempt_state', { p_attempt_id: attemptId, p_trial_id: trialId });
  return error ? null : readTrialAttemptState(data);
}

/** Atomically marks the trial's free dream as completed by this attempt (idempotent for the same attempt; 'consumed' if another attempt already completed it). */
export async function completeTrialAttempt(attemptId: string, trialId: string): Promise<TrialCompletionResult | null> {
  const client = getSupabaseServiceClient();
  if (!client) return null;
  const { data, error } = await client.rpc('complete_trial_attempt', { p_attempt_id: attemptId, p_trial_id: trialId });
  return error ? null : readTrialCompletion(data);
}

export async function reserveTrialTranscription(trialId: string): Promise<'reserved' | 'consumed' | 'limit' | null> {
  const client = getSupabaseServiceClient();
  if (!client) return null;
  const { data, error } = await client.rpc('reserve_trial_transcription', { p_trial_id: trialId, p_max: maxTrialTranscriptions() });
  if (error) return null;
  return data === 'reserved' || data === 'consumed' || data === 'limit' ? data : null;
}

export function refundTrialTranscription(trialId: string): Promise<void> {
  return callVoidRpc('refund_trial_transcription', { p_trial_id: trialId });
}

/** Bounded element-label calls per attempt (owner/trial-checked in SQL, like images/reflections). */
export async function reserveLabelsAttempt(attemptId: string, identity: CallerIdentity): Promise<'reserved' | 'rejected' | null> {
  const client = getSupabaseServiceClient();
  if (!client) return null;
  const { data, error } = await client.rpc('reserve_labels_attempt', {
    p_attempt_id: attemptId,
    p_owner_id: identity.kind === 'user' ? identity.userId : null,
    p_trial_id: identity.kind === 'trial' ? identity.trialId : null,
    p_max: MAX_LABEL_CALLS_PER_ATTEMPT,
  });
  if (error) return null;
  return typeof data === 'number' ? 'reserved' : 'rejected';
}

export function refundLabelsAttempt(attemptId: string): Promise<void> {
  return callVoidRpc('refund_labels_attempt', { p_attempt_id: attemptId });
}

async function callVoidRpc(fnName: string, args: Record<string, unknown>): Promise<void> {
  const client = getSupabaseServiceClient();
  if (!client) return;
  await client.rpc(fnName, args).then(
    () => {},
    () => {},
  );
}

/** Deletes an attempt row outright — used only to compensate a genuine
    infra-side analysis failure (see dreamAnalysis.ts), where nothing was
    ever actually delivered, so there is nothing to "decrement", just a
    reservation to release entirely. */
export async function deleteDreamAttempt(attemptId: string): Promise<void> {
  const client = getSupabaseServiceClient();
  if (!client) return;
  await client.from('dream_attempts').delete().eq('id', attemptId);
}

/**
 * Releases an attempt whose analysis genuinely failed. Anonymous: the row is
 * deleted (nothing was spent). Signed-in: cancel_user_attempt refunds the
 * attempt's credit EXACTLY once (idempotent in SQL) and deletes the row. Only
 * ever called by the server after its own failed provider call — no client
 * request can reach it.
 */
export async function abandonAttempt(identity: CallerIdentity, attemptId: string): Promise<void> {
  if (identity.kind === 'trial') return deleteDreamAttempt(attemptId);
  const client = getSupabaseServiceClient();
  if (!client) return;
  await client.rpc('cancel_user_attempt', { p_attempt: attemptId, p_owner: identity.userId }).then(
    () => {},
    () => {},
  );
}

/** The account's server-side credit balance; null = could not be determined (callers fail closed). */
export async function getCreditBalance(userId: string): Promise<number | null> {
  const client = getSupabaseServiceClient();
  if (!client) return null;
  const { data, error } = await client.rpc('get_credit_balance', { p_owner: userId });
  return error || typeof data !== 'number' ? null : data;
}

type ReserveOutcome = 'reserved' | 'rejected';

async function callReserveFn(fnName: string, attemptId: string, identity: CallerIdentity): Promise<ReserveOutcome | null> {
  const client = getSupabaseServiceClient();
  if (!client) return null;
  const { data, error } = await client.rpc(fnName, {
    p_attempt_id: attemptId,
    p_owner_id: identity.kind === 'user' ? identity.userId : null,
    p_trial_id: identity.kind === 'trial' ? identity.trialId : null,
  });
  if (error) return null;
  // The SQL function is declared `returns integer` — a single scalar,
  // not `setof integer` or a table — so PostgREST's RPC call returns the
  // bare new count directly (a JSON number) on a successful conditional
  // UPDATE, or JSON null when the underlying UPDATE...RETURNING matched
  // zero rows (wrong ownership, unknown id, or the cap already reached).
  // It is never wrapped in an array; checking Array.isArray(data) here
  // was the actual production bug (every reservation, including the
  // very first for a brand-new dream, was misread as rejected because a
  // bare number is never an array) — caught via a real anonymous
  // end-to-end test after the service-role key fix, confirmed against
  // both the HTTP response and the dream_attempts row's own image_count.
  return typeof data === 'number' ? 'reserved' : 'rejected';
}

async function callRefundFn(fnName: string, attemptId: string): Promise<void> {
  const client = getSupabaseServiceClient();
  if (!client) return;
  // Best-effort — a failed refund only means one attempt slot is lost to
  // a genuine infra hiccup, never a security issue, so this never throws
  // further up into the request's own success/failure path.
  await client.rpc(fnName, { p_attempt_id: attemptId }).then(
    () => {},
    () => {},
  );
}

/** Atomically checks the image-generation cap AND reserves the next slot
    in ONE statement (server/functions: reserve_image_attempt) — see the
    migration. Row-level locking makes it impossible for two concurrent
    requests to both observe count < 3 and both succeed past it. Returns
    null only if the service client itself isn't configured. */
export function reserveImageAttempt(attemptId: string, identity: CallerIdentity): Promise<ReserveOutcome | null> {
  return callReserveFn('reserve_image_attempt', attemptId, identity);
}

/** Compensating release for a reservation whose OpenAI call then failed
    for a genuine infra/provider reason (network, 5xx, timeout, rate
    limit, billing) — never called for a content-moderation rejection,
    which is a real, evaluated outcome of the reservation, not a fault. */
export function refundImageAttempt(attemptId: string): Promise<void> {
  return callRefundFn('refund_image_attempt', attemptId);
}

export function reserveReflectionAttempt(attemptId: string, identity: CallerIdentity): Promise<ReserveOutcome | null> {
  return callReserveFn('reserve_reflection_attempt', attemptId, identity);
}

export function refundReflectionAttempt(attemptId: string): Promise<void> {
  return callRefundFn('refund_reflection_attempt', attemptId);
}

export type ClaimTrialOutcome = 'claimed' | 'already_claimed_by_you' | 'claimed_by_someone_else' | 'not_found' | 'not_configured';

/**
 * Idempotent, anti-hijack trial claim — see server/routes/claimTrial.ts
 * for the identity-resolution context (the trialId here MUST already
 * come from a signature-verified cookie read on the actual request, never
 * a client-supplied body field). Safe to call any number of times: the
 * conditional UPDATE only ever does real work once; every call after
 * that (a retried network request, a duplicate auth-callback firing) sees
 * `converted_user_id` already set and returns the same outcome without
 * re-touching dream_attempts. Never modifies public.dreams.
 */
export async function claimTrialForUser(trialId: string, userId: string): Promise<ClaimTrialOutcome> {
  const client = getSupabaseServiceClient();
  if (!client) return 'not_configured';

  const { data: claimed, error: claimError } = await client
    .from('trial_identities')
    .update({ converted_user_id: userId, claimed_at: new Date().toISOString() })
    .eq('id', trialId)
    .is('converted_user_id', null)
    .select('id')
    .maybeSingle();

  if (claimError) return 'not_configured';

  if (claimed) {
    // First successful claim — re-point this trial's attempt history to
    // the real account. Naturally idempotent: a second invocation finds
    // no rows left with trial_id = trialId and safely affects nothing.
    await client.from('dream_attempts').update({ owner_id: userId, trial_id: null }).eq('trial_id', trialId);
    return 'claimed';
  }

  // Nothing was claimed just now — find out why, without changing anything.
  const { data: existing, error: readError } = await client
    .from('trial_identities')
    .select('converted_user_id')
    .eq('id', trialId)
    .maybeSingle();

  if (readError) return 'not_configured';
  if (!existing) return 'not_found';
  if (existing.converted_user_id === userId) return 'already_claimed_by_you';
  return 'claimed_by_someone_else';
}
