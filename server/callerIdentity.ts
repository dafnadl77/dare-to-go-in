import { getSupabaseAuthVerifierClient } from './supabaseServiceClient.js';
import { readTrialIdFromCookieHeader, mintTrialCookie } from './trialIdentity.js';
import { createNewTrialIdentity, ensureTrialIdentityExists } from './dreamAttempts.js';

export type CallerIdentity = { kind: 'user'; userId: string } | { kind: 'trial'; trialId: string };

export type ResolveCallerResult =
  | { ok: true; identity: CallerIdentity; setCookieHeader?: string }
  | { ok: false; status: number; reason: string; message: string };

export interface RequestHeaders {
  authorization?: string | null;
  cookie?: string | null;
}

function extractBearerToken(authorizationHeader: string): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match ? match[1].trim() || null : null;
}

export type VerifyBearerResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; reason: string; message: string };

/** Shared by resolveCallerIdentity below and routes/claimTrial.ts, which
    — unlike every other route — must reject outright when no bearer
    token is present at all (claiming a trial makes no sense without a
    real account to claim it into), rather than falling back to treating
    the request as anonymous. */
export async function verifyBearerToken(authorizationHeader: string): Promise<VerifyBearerResult> {
  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    return { ok: false, status: 401, reason: 'not_authenticated', message: 'Malformed Authorization header.' };
  }
  const verifier = getSupabaseAuthVerifierClient();
  if (!verifier) {
    return { ok: false, status: 503, reason: 'not_configured', message: 'Authentication is not configured.' };
  }
  const { data, error } = await verifier.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, status: 401, reason: 'not_authenticated', message: 'Your session is invalid or has expired. Please sign in again.' };
  }
  return { ok: true, userId: data.user.id };
}

/**
 * The single place every OpenAI-backed route resolves "who is calling"
 * (architecture v2, section B). Three-step resolution:
 *
 *  1. An `Authorization: Bearer <token>` header is present — it MUST
 *     verify via Supabase's own auth server, or the request is rejected
 *     outright (401). A caller explicitly presenting credentials that
 *     turn out invalid/expired is never silently downgraded to an
 *     anonymous trial — that would both hide a "please sign in again"
 *     situation from the user and let a deliberately-broken token dodge
 *     the stricter authenticated identity for the looser trial one.
 *  2. No Authorization header at all — fall back to the signed
 *     `dare_trial` cookie, if present and valid.
 *  3. Neither — mint a brand-new trial identity (cookie + DB row) and
 *     proceed as a fresh trial.
 *
 * Never trusts a client-supplied user id or trial id for anything other
 * than looking up a cookie's own signature.
 */
export async function resolveCallerIdentity(headers: RequestHeaders): Promise<ResolveCallerResult> {
  const authHeader = headers.authorization;
  if (authHeader) {
    const verified = await verifyBearerToken(authHeader);
    if (!verified.ok) {
      return { ok: false, status: verified.status, reason: verified.reason, message: verified.message };
    }
    return { ok: true, identity: { kind: 'user', userId: verified.userId } };
  }

  const existingTrialId = readTrialIdFromCookieHeader(headers.cookie);
  if (existingTrialId) {
    const ensured = await ensureTrialIdentityExists(existingTrialId);
    if (ensured) {
      return { ok: true, identity: { kind: 'trial', trialId: existingTrialId } };
    }
    // Couldn't confirm/recreate the row (service client unavailable) —
    // fall through to minting a fresh identity below rather than
    // returning an identity with nothing backing it in the database.
  }

  const { trialId, setCookieHeader } = mintTrialCookie();
  const created = await createNewTrialIdentity(trialId);
  if (!created) {
    return { ok: false, status: 503, reason: 'not_configured', message: 'Could not start a trial session.' };
  }
  return { ok: true, identity: { kind: 'trial', trialId }, setCookieHeader };
}
