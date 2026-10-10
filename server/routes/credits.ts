import { errorResult, okResult, type HandlerResult } from '../httpResult.js';
import { verifyBearerToken, type RequestHeaders } from '../callerIdentity.js';
import { getCreditBalance, isAppOwner } from '../dreamAttempts.js';
import { getPaymentOrderState } from '../payments/orderStore.js';
import { getPurchasedPackage } from '../payments/purchasedPackage.js';
import { getCreditHistory } from '../creditHistory.js';

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
  // continues below exactly as before. The role is decided here, from the verified account, before anything about credits is said.
  const owner = await isAppOwner(verified.userId);
  if (owner === true && orderId === undefined) {
    // `balance` is advisory and meaningless for the owner (nothing is ever spent). It is never reported as 0, so a browser tab that
    // is still running a version from before the owner role existed — which sends any account whose balance is exactly 0 to
    // Pricing — can never send the owner there.
    return okResult({ balance: Math.max((await getCreditBalance(verified.userId)) ?? 0, 1), owner: true });
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
  if (owner === null) {
    // The role could not be determined (never "not the owner" by assumption): enforcement stays with the server's own atomic
    // checks, but the UI is told not to act on a zero balance — it is not allowed to send a possible owner to Pricing.
    console.warn('owner_check_unavailable');
    return okResult({ balance, ...(purchasedPackage === undefined ? {} : { purchasedPackage }), roleUnknown: true });
  }
  // What the dream-balance display shows besides the balance: how many credits were ever given to the account (so "2 of 3" is exact, and several
  // purchases are counted as several), and whether the free dream was used. Read-only, from the existing ledger; if it cannot be
  // read the fields are simply left out and the display shows only what it knows.
  const history = await getCreditHistory(verified.userId);
  if (history) return okResult({ balance, ...(purchasedPackage === undefined ? {} : { purchasedPackage }), ...history });
  return okResult(purchasedPackage === undefined ? { balance } : { balance, purchasedPackage });
}
