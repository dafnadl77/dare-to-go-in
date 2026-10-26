import { okResult, errorResult, type HandlerResult } from '../httpResult.js';
import { resolveCallerIdentity, mintTrialIdentity, type IdentityDeps, type RequestHeaders, type ResolveCallerResult } from '../callerIdentity.js';
import { mintAgeCookie, recordUserAge, trialAgeConfirmed } from '../ageGate.js';
import { checkTrialMintBackstop, trialMintBackstopPerHour, type TrialMintStore } from '../anonymousSafetyValves.js';
import { trialMintStore } from '../dreamAttempts.js';
import { guestDreamsAllowed, SIGN_IN_REQUIRED_MESSAGE, SIGN_IN_REQUIRED_REASON } from '../guestPolicy.js';

export interface TrialSessionDeps {
  identity?: IdentityDeps;
  mintStore?: TrialMintStore;
  mintBackstopPerHour?: number;
  /** Whether new guest identities may be minted (default: the DARE_GUEST_DREAMS setting, which keeps them closed). */
  guestsAllowed?: boolean;
  /** The age question (ageGate.ts): the identity check, and the write of the time into the account. */
  resolve?: (headers: RequestHeaders) => Promise<ResolveCallerResult>;
  recordUserAge?: (userId: string, at: string) => Promise<boolean>;
  env?: Record<string, string | undefined>;
}

/**
 * The age question rides on this same endpoint (no new serverless function): { action: 'age-status' } says whether this account or
 * browser confirmed being 18 or over; { action: 'confirm-age', adult: true } records the time. "Under 18" is never sent here — the
 * screen stops by itself and nothing is recorded — and { adult: false } is refused, so it can never be stored.
 */
async function handleAge(action: 'age-status' | 'confirm-age', adult: unknown, requestHeaders: RequestHeaders, deps: TrialSessionDeps): Promise<HandlerResult> {
  const resolved = await (deps.resolve ?? ((h) => resolveCallerIdentity(h, deps.identity)))(requestHeaders);
  if (!resolved.ok) return action === 'age-status' && resolved.reason === 'trial_required' ? okResult({ ageConfirmed: false }) : errorResult(resolved.status, resolved.reason, resolved.message);
  const confirmed = resolved.identity.kind === 'user' ? Boolean(resolved.ageConfirmedAt) : trialAgeConfirmed(requestHeaders.cookie, resolved.identity.trialId, deps.env);
  if (action === 'age-status') return okResult({ ageConfirmed: confirmed });
  if (adult !== true) return errorResult(400, 'invalid_response', 'Only a confirmation of being 18 or over is recorded.');
  if (resolved.identity.kind === 'user') {
    const ok = await (deps.recordUserAge ?? recordUserAge)(resolved.identity.userId, new Date().toISOString());
    return ok ? okResult({ ageConfirmed: true }) : errorResult(503, 'not_configured', 'The age confirmation could not be saved. Please try again.');
  }
  const cookie = mintAgeCookie(resolved.identity.trialId, deps.env);
  return cookie ? okResult({ ageConfirmed: true }, { 'Set-Cookie': cookie }) : errorResult(503, 'not_configured', 'The age confirmation could not be saved. Please try again.');
}

/**
 * POST /api/trial-session — the ONLY place an anonymous browser gets its one
 * stable trial identity (the signed dare_trial cookie). It calls no model and
 * costs nothing, and paid routes never mint identities themselves: a cookie-less
 * request to a paid endpoint gets 401 trial_required instead of a fresh trial.
 *
 * Idempotent: a browser that already has a valid session (a signed-in user, or a
 * trial cookie) gets 200 and nothing is minted, so the same cookie always maps
 * to the same trial.
 *
 * Minting is guarded only by an EMERGENCY BACKSTOP (anonymousSafetyValves.ts,
 * env-configurable, counted on trial_identities.created_at). It is NOT a defence
 * against someone deleting the cookie and asking again — that needs edge/WAF rate
 * limiting in front of this route, which is a separate required layer.
 */
export async function handleTrialSession(requestHeaders: RequestHeaders, deps: TrialSessionDeps = {}, body: unknown = null): Promise<HandlerResult> {
  const action = body && typeof body === 'object' ? (body as { action?: unknown }).action : undefined;
  if (action === 'age-status' || action === 'confirm-age') return handleAge(action, (body as { adult?: unknown }).adult, requestHeaders, deps);
  const resolved = await resolveCallerIdentity(requestHeaders, deps.identity);
  if (resolved.ok) return okResult({ kind: resolved.identity.kind });
  if (resolved.reason !== 'trial_required') return errorResult(resolved.status, resolved.reason, resolved.message);

  // A browser with no account and no valid guest cookie: starting a dream needs an account, so no new guest identity is minted (the
  // mint backstop is not even consulted). A valid existing cookie, or a signed-in account, was already answered above.
  if (!(deps.guestsAllowed ?? guestDreamsAllowed())) return errorResult(403, SIGN_IN_REQUIRED_REASON, SIGN_IN_REQUIRED_MESSAGE);

  const backstop = await checkTrialMintBackstop(deps.mintStore ?? trialMintStore, deps.mintBackstopPerHour ?? trialMintBackstopPerHour());
  if (backstop === 'backstop_reached') return errorResult(429, 'rate_limited', 'Too many new sessions right now. Please try again shortly.');
  if (backstop === 'unavailable') return errorResult(503, 'not_configured', 'Session tracking is not available.');

  const minted = await mintTrialIdentity(deps.identity);
  if (!minted.ok) return errorResult(minted.status, minted.reason, minted.message);
  return okResult({ kind: 'trial' }, minted.setCookieHeader ? { 'Set-Cookie': minted.setCookieHeader } : undefined);
}
