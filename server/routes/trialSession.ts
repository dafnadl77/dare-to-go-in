import { okResult, errorResult, type HandlerResult } from '../httpResult.js';
import { resolveCallerIdentity, mintTrialIdentity, type IdentityDeps, type RequestHeaders } from '../callerIdentity.js';
import { checkTrialMintBackstop, trialMintBackstopPerHour, type TrialMintStore } from '../anonymousSafetyValves.js';
import { trialMintStore } from '../dreamAttempts.js';

export interface TrialSessionDeps {
  identity?: IdentityDeps;
  mintStore?: TrialMintStore;
  mintBackstopPerHour?: number;
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
export async function handleTrialSession(requestHeaders: RequestHeaders, deps: TrialSessionDeps = {}): Promise<HandlerResult> {
  const resolved = await resolveCallerIdentity(requestHeaders, deps.identity);
  if (resolved.ok) return okResult({ kind: resolved.identity.kind });
  if (resolved.reason !== 'trial_required') return errorResult(resolved.status, resolved.reason, resolved.message);

  const backstop = await checkTrialMintBackstop(deps.mintStore ?? trialMintStore, deps.mintBackstopPerHour ?? trialMintBackstopPerHour());
  if (backstop === 'backstop_reached') return errorResult(429, 'rate_limited', 'Too many new sessions right now. Please try again shortly.');
  if (backstop === 'unavailable') return errorResult(503, 'not_configured', 'Session tracking is not available.');

  const minted = await mintTrialIdentity(deps.identity);
  if (!minted.ok) return errorResult(minted.status, minted.reason, minted.message);
  return okResult({ kind: 'trial' }, minted.setCookieHeader ? { 'Set-Cookie': minted.setCookieHeader } : undefined);
}
