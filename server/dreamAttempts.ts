import { getSupabaseServiceClient } from './supabaseServiceClient.js';
import type { CallerIdentity } from './callerIdentity.js';

const MAX_IMAGE_ATTEMPTS = 3;
const MAX_REFLECTION_ATTEMPTS = 3;

export { MAX_IMAGE_ATTEMPTS, MAX_REFLECTION_ATTEMPTS };

/** Creates the trial_identities row for a brand-new trial cookie just
    minted by this request. */
export async function createNewTrialIdentity(trialId: string): Promise<boolean> {
  const client = getSupabaseServiceClient();
  if (!client) {
    console.error('[trialIdentity] service client not configured (missing env var) — cannot create trial row');
    return false;
  }
  const { error } = await client.from('trial_identities').insert({ id: trialId });
  if (error) {
    // Never logs the key/url — only Supabase's own error metadata, which
    // is exactly what's needed to tell an auth/apikey rejection apart
    // from an unrelated database error.
    console.error('[trialIdentity] insert failed:', { message: error.message, code: error.code, hint: error.hint, details: error.details });
  }
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

/** One row per dream-creation attempt, created the moment analysis
    starts — see server/routes/dreamAnalysis.ts. Never created by the
    client; the returned id is the only thing later routes accept. */
export async function createDreamAttempt(identity: CallerIdentity): Promise<string | null> {
  const client = getSupabaseServiceClient();
  if (!client) return null;
  const row: { owner_id?: string; trial_id?: string } =
    identity.kind === 'user' ? { owner_id: identity.userId } : { trial_id: identity.trialId };
  const { data, error } = await client.from('dream_attempts').insert(row).select('id').single();
  if (error || !data) return null;
  return data.id as string;
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
  // The SQL function RETURNs the new count only on a successful
  // conditional UPDATE; no rows back means the WHERE clause rejected it
  // (wrong ownership, unknown id, or the cap already reached) — the
  // request is never distinguished further than that to the caller.
  return Array.isArray(data) && data.length > 0 ? 'reserved' : 'rejected';
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
