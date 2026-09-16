import { errorResult, okResult, type HandlerResult } from '../httpResult.js';
import { verifyBearerToken, type RequestHeaders } from '../callerIdentity.js';
import { readTrialIdFromCookieHeader } from '../trialIdentity.js';
import { claimTrialForUser } from '../dreamAttempts.js';

/**
 * POST /api/claim-trial — called once right after a real sign-in/sign-up
 * (see AuthContext.tsx). Re-points this browser's anonymous trial history
 * to the now-authenticated account, so a visitor who tried DARE
 * anonymously and then created an account doesn't lose that history — and,
 * later, doesn't get a second free trial allowance on top of it.
 *
 * Unlike every other route here, this one REQUIRES a real bearer token —
 * there is no sense in which "claim a trial anonymously" is meaningful, so
 * a missing/invalid Authorization header is rejected outright rather than
 * falling back to an anonymous identity (see resolveCallerIdentity's own
 * comment on why that fallback exists for the OpenAI-backed routes and not
 * here).
 *
 * The trialId is read ONLY from this request's own signed `dare_trial`
 * cookie — never from anything in the request body — so one signed-in
 * account can never claim another browser's trial merely by knowing or
 * guessing its id.
 */
export async function handleClaimTrial(_rawBody: unknown, requestHeaders: RequestHeaders): Promise<HandlerResult> {
  const authHeader = requestHeaders.authorization;
  if (!authHeader) {
    return errorResult(401, 'not_authenticated', 'Claiming a trial requires being signed in.');
  }
  const verified = await verifyBearerToken(authHeader);
  if (!verified.ok) {
    return errorResult(verified.status, verified.reason, verified.message);
  }

  const trialId = readTrialIdFromCookieHeader(requestHeaders.cookie);
  if (!trialId) {
    // Not an error — this browser simply has no trial to claim (e.g. it
    // signed up without ever using the anonymous trial first).
    return okResult({ claimed: false, outcome: 'no_trial' });
  }

  const outcome = await claimTrialForUser(trialId, verified.userId);
  if (outcome === 'not_configured') {
    return errorResult(503, 'not_configured', 'Trial claiming is not configured.');
  }
  return okResult({ claimed: outcome === 'claimed' || outcome === 'already_claimed_by_you', outcome });
}
