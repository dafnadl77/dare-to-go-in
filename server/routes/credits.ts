import { errorResult, okResult, type HandlerResult } from '../httpResult.js';
import { verifyBearerToken, type RequestHeaders } from '../callerIdentity.js';
import { getCreditBalance } from '../dreamAttempts.js';
import { DREAM_JOURNAL_EXPORT, hasEntitlement } from '../entitlements.js';

/**
 * GET /api/credits — the signed-in account's server-side dream-credit balance.
 * Read-only and advisory for the client (it lets the UI send a zero-credit
 * account to Pricing before they record anything); the real enforcement is the
 * atomic spend inside /api/dream-analysis. Requires a verified bearer token —
 * the account is always the token's own, never anything the client names — and
 * there is no route that lets a client set, add or spend credits.
 */
export async function handleCredits(requestHeaders: RequestHeaders): Promise<HandlerResult> {
  const authHeader = requestHeaders.authorization;
  if (!authHeader) {
    return errorResult(401, 'not_authenticated', 'Checking credits requires being signed in.');
  }
  const verified = await verifyBearerToken(authHeader);
  if (!verified.ok) {
    return errorResult(verified.status, verified.reason, verified.message);
  }
  const balance = await getCreditBalance(verified.userId);
  if (balance === null) {
    return errorResult(503, 'not_configured', 'Credit tracking is not configured.');
  }
  // Read-only status for the UI (e.g. whether to offer Dream Journal export). Advisory only: the export route
  // re-checks the entitlement server-side. null = could not be determined.
  const journal = await hasEntitlement(verified.userId, DREAM_JOURNAL_EXPORT);
  return okResult({ balance, entitlements: { dreamJournalExport: journal } });
}
