import { errorResult, okResult, type HandlerResult } from '../httpResult.js';
import { checkCompletionAuth, previousSecretState, type CompletionAuth } from './completionAuth.js';
import { parseCompletionRequest, type CompletionRequest } from './completionRequest.js';
import { completePaymentOrder, recordPaymentNotice, type LinkedCompletionStatus } from './completionStore.js';

/**
 * POST /api/payment-complete: the ONLY way a purchase becomes credits.
 *
 *  - Server-to-server: Make authenticates with `Authorization: Bearer <MAKE_COMPLETION_SECRET>`. No cookie, no browser
 *    session, no user token is read; the success redirect the customer lands on is never involved.
 *  - Authentication comes FIRST (before the body is looked at) and answers a uniform 401.
 *  - The body is the strict contract in completionRequest.ts. Owner, package, expected amount and credits are NOT taken from it:
 *    the database function derives them from the order and refuses any mismatch.
 *  - Only a normalized "paid" report can grant. DARE has not yet observed Grow's non-paid statuses, so a failed/cancelled/pending
 *    report grants nothing and closes nothing: the order stays eligible for a later legitimate paid notification.
 *  - One atomic, idempotent database call (complete_payment_order) validates and grants through the existing grant_credits
 *    with external_ref `grow:<transactionId>`.
 *  - Logs carry reason codes only: no secret, no payment link, no payer data.
 */

export interface CompletionDeps {
  auth: (authorizationHeader: string | undefined | null) => CompletionAuth;
  complete: (request: CompletionRequest) => Promise<LinkedCompletionStatus | null>;
  /** Remembers the last non-paid status text for an order (best effort; changes no status, grants nothing). */
  recordNotice: (orderId: string, providerStatus: string) => Promise<void>;
  /** Whether the rotation slot (MAKE_COMPLETION_SECRET_PREVIOUS) is unset, active or set but not accepted. Absent = unset. */
  previousSecretState?: () => 'unset' | 'active' | 'set_but_unusable';
}

const realDeps: CompletionDeps = {
  auth: (header) => checkCompletionAuth(header),
  previousSecretState: () => previousSecretState(),
  complete: completePaymentOrder,
  recordNotice: recordPaymentNotice,
};

export interface CompletionHeaders {
  authorization?: string | null;
}

export async function handlePaymentComplete(rawBody: unknown, headers: CompletionHeaders, deps: CompletionDeps = realDeps): Promise<HandlerResult> {
  const auth = deps.auth(headers.authorization);
  if (auth === 'not_configured') return errorResult(503, 'not_configured', 'Payment completion is not configured.');
  if (auth !== 'ok' && auth !== 'ok_previous') {
    // Rotation aid: the slot holds a value that is NOT accepted (short or equal to the primary). Fixed words only, never a value.
    if (deps.previousSecretState?.() === 'set_but_unusable') console.error('payment_complete_auth previous_secret=unusable');
    return errorResult(401, 'not_authenticated', 'Unauthorized.');
  }
  // Rotation aid: Make still sends the old secret. Remove MAKE_COMPLETION_SECRET_PREVIOUS only once this line stops appearing.
  if (auth === 'ok_previous') console.error('payment_complete_auth matched=previous');

  const parsed = parseCompletionRequest(rawBody);
  if (!parsed.ok) {
    if (parsed.reason === 'payment_not_successful') {
      // Not paid: grant nothing and keep the order open (a later paid notification can still complete it).
      await deps.recordNotice(parsed.orderId, parsed.providerStatus).catch(() => undefined);
      return errorResult(422, 'payment_not_successful', 'The payment is not confirmed as paid.');
    }
    if (parsed.reason === 'installments_not_supported') {
      // DARE supports one payment only (2026-11-25): grant nothing, close nothing. The status text is remembered for manual review.
      await deps.recordNotice(parsed.orderId, 'installments').catch(() => undefined);
      console.error('payment_complete_rejected reason=installments_not_supported');
      return errorResult(422, 'installments_not_supported', 'Payments in installments are not supported.');
    }
    return errorResult(400, 'invalid_request', 'The completion request is not valid.');
  }

  const outcome = await deps.complete(parsed.value);
  if (outcome === null) {
    console.error('payment_complete_unavailable');
    return errorResult(503, 'not_configured', 'Payment completion is not available right now.');
  }
  const orderId = parsed.value.orderId;
  switch (outcome) {
    case 'granted':
    case 'duplicate':
      return okResult({ ok: true, result: outcome, orderId });
    case 'order_not_found':
      return errorResult(404, 'order_not_found', 'No such order.');
    case 'amount_mismatch':
    case 'currency_mismatch':
      console.error(`payment_complete_rejected reason=${outcome}`);
      return errorResult(422, outcome, 'The paid amount does not match the order.');
    case 'invalid':
      return errorResult(400, 'invalid_request', 'The completion request is not valid.');
    default:
      // transaction_used_by_other_order | order_already_completed | owner_gone | link_required | link_missing | link_mismatch
      // (the last three: the payment link the notification names is not the one DARE bound to the order; nothing was written)
      console.error(`payment_complete_rejected reason=${outcome}`);
      return errorResult(409, outcome, 'The payment cannot be applied to this order.');
  }
}
