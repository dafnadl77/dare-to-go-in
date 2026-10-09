import { errorResult, okResult, type HandlerResult } from '../httpResult.js';
import { verifyBearerToken, type RequestHeaders } from '../callerIdentity.js';
import { getCreditBalance, isAppOwner } from '../dreamAttempts.js';
import { getPaymentOrderState } from '../payments/orderStore.js';
import { getPurchasedPackage } from '../payments/purchasedPackage.js';

/**
 * GET /api/credits — the signed-in account's server-side dream-credit balance.
 * Read-only and advisory for the client (it lets the UI send a zero-credit
 * account to Pricing before they record anything); the real enforcement is the
 * atomic spend inside /api/dream-analysis. Requires a verified bearer token —
 * the account is always the token's own, never anything the client names — and
 * there is no route that lets a client set, add or spend credits.
 */
export async function handleCredits(requestHeaders: RequestHeaders, orderId?: string): Promise<HandlerResult> {
  const authHeader = requestHeaders.authorization;
  if (!authHeader) {
    return errorResult(401, 'not_authenticated', 'Checking credits requires being signed in.');
  }
  const verified = await verifyBearerToken(authHeader);
  if (!verified.ok) {
    return errorResult(verified.status, verified.reason, verified.message);
  }
  // The app owner is told so (and nothing else about packages or limits): the UI shows unlimited dreams. Every other account
  // continues below exactly as before. An unknown role is treated as "not the owner".
  if ((await isAppOwner(verified.userId)) === true && orderId === undefined) {
    return okResult({ balance: (await getCreditBalance(verified.userId)) ?? 0, owner: true });
  }
  const balance = await getCreditBalance(verified.userId);
  if (balance === null) {
    return errorResult(503, 'not_configured', 'Credit tracking is not configured.');
  }
  // The customer's return page after paying may ask about ITS OWN order (never anyone else's: a foreign or missing id both
  // answer 'unknown'). Read-only and advisory: it changes nothing and a redirect can never mark a payment paid.
  if (orderId !== undefined) {
    const order = await getPaymentOrderState(orderId, verified.userId);
    if (order === null) return errorResult(503, 'not_configured', 'Payment status is not available right now.');
    return okResult({ balance, order });
  }
  // The package the account last PURCHASED (null = a free account), read from its completed orders, never from the balance. If it
  // cannot be determined the field is left out so the UI shows nothing rather than guessing.
  const purchasedPackage = await getPurchasedPackage(verified.userId);
  return okResult(purchasedPackage === undefined ? { balance } : { balance, purchasedPackage });
}
