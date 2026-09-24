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

/** The four collaborators identity resolution needs — injectable so the rules
    below can be tested without a database or Supabase. */
export interface IdentityDeps {
  verifyBearer: (authorizationHeader: string) => Promise<VerifyBearerResult>;
  readTrialId: (cookieHeader: string | undefined | null) => string | null;
  ensureTrial: (trialId: string) => Promise<boolean>;
  mintCookie: () => { trialId: string; setCookieHeader: string } | null;
  createTrial: (trialId: string) => Promise<boolean>;
}

const realDeps: IdentityDeps = {
  verifyBearer: verifyBearerToken,
  readTrialId: readTrialIdFromCookieHeader,
  ensureTrial: ensureTrialIdentityExists,
  mintCookie: mintTrialCookie,
  createTrial: createNewTrialIdentity,
};

/**
 * The single place every OpenAI-backed route resolves "who is calling"
 * (architecture v2, section B). Resolution:
 *
 *  1. An "Authorization: Bearer <token>" header is present — it MUST
 *     verify via Supabase's own auth server, or the request is rejected
 *     outright (401). A caller explicitly presenting credentials that
 *     turn out invalid/expired is never silently downgraded to an
 *     anonymous trial.
 *  2. No Authorization header — the signed "dare_trial" cookie, if present
 *     and valid, identifies the anonymous trial.
 *  3. Neither — the request is REJECTED (401 trial_required). Resolving an
 *     identity never mints one: a paid endpoint can no longer hand a fresh
 *     trial (and a fresh quota) to every cookie-less request. A browser
 *     obtains its one stable trial cookie from /api/trial-session
 *     (mintTrialIdentity below), which costs nothing and is itself throttled.
 *
 * Never trusts a client-supplied user id or trial id for anything other
 * than looking up a cookie's own signature.
 */
export async function resolveCallerIdentity(headers: RequestHeaders, deps: IdentityDeps = realDeps): Promise<ResolveCallerResult> {
  const authHeader = headers.authorization;
  if (authHeader) {
    const verified = await deps.verifyBearer(authHeader);
    if (!verified.ok) {
      return { ok: false, status: verified.status, reason: verified.reason, message: verified.message };
    }
    return { ok: true, identity: { kind: 'user', userId: verified.userId } };
  }

  const existingTrialId = deps.readTrialId(headers.cookie);
  if (existingTrialId) {
    if (await deps.ensureTrial(existingTrialId)) {
      return { ok: true, identity: { kind: 'trial', trialId: existingTrialId } };
    }
    // A valid cookie whose row can't be confirmed/recreated (service client
    // unavailable): fail closed rather than fabricate an identity.
    return { ok: false, status: 503, reason: 'not_configured', message: 'Could not resume your session.' };
  }

  return { ok: false, status: 401, reason: 'trial_required', message: 'A browser session is required. Please reload and try again.' };
}

/** Mints a brand-new anonymous trial identity (cookie + DB row). ONLY for
    /api/trial-session, after its own throttle — never called from a paid route. */
export async function mintTrialIdentity(deps: IdentityDeps = realDeps): Promise<ResolveCallerResult> {
  const minted = deps.mintCookie();
  if (!minted) {
    // No valid dedicated DARE_TRIAL_COOKIE_SECRET in a production-like
    // environment (see trialIdentity.ts): fail closed, never mint.
    return { ok: false, status: 503, reason: 'not_configured', message: 'Could not start a trial session.' };
  }
  const { trialId, setCookieHeader } = minted;
  const created = await deps.createTrial(trialId);
  if (!created) {
    return { ok: false, status: 503, reason: 'not_configured', message: 'Could not start a trial session.' };
  }
  return { ok: true, identity: { kind: 'trial', trialId }, setCookieHeader };
}
