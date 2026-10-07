import { errorResult, okResult, type HandlerResult } from '../httpResult.js';
import { checkCompletionAuth, type CompletionAuth } from './completionAuth.js';
import { parseCompletionRequest, type CompletionRequest } from './completionRequest.js';
import { completePaymentOrder, recordPaymentNotice, type CompletionStatus } from './completionStore.js';

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
  complete: (request: CompletionRequest) => Promise<CompletionStatus | null>;
  /** Remembers the last non-paid status text for an order (best effort; changes no status, grants nothing). */
  recordNotice: (orderId: string, providerStatus: string) => Promise<void>;
}

const realDeps: CompletionDeps = {
  auth: (header) => checkCompletionAuth(header),
  complete: completePaymentOrder,
  recordNotice: recordPaymentNotice,
};

export interface CompletionHeaders {
  authorization?: string | null;
}

export async function handlePaymentComplete(rawBody: unknown, headers: CompletionHeaders, deps: CompletionDeps = realDeps): Promise<HandlerResult> {
  const auth = deps.auth(headers.authorization);
  if (auth === 'not_configured') return errorResult(503, 'not_configured', 'Payment completion is not configured.');
  if (auth !== 'ok') return errorResult(401, 'not_authenticated', 'Unauthorized.');

  const parsed = parseCompletionRequest(rawBody);
  if (!parsed.ok) {
    if (parsed.reason === 'payment_not_successful') {
      // Not paid: grant nothing and keep the order open (a later paid notification can still complete it).
      await deps.recordNotice(parsed.orderId, parsed.providerStatus).catch(() => undefined);
      return errorResult(422, 'payment_not_successful', 'The payment is not confirmed as paid.');
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
      // transaction_used_by_other_order | order_already_completed | owner_gone
      console.error(`payment_complete_rejected reason=${outcome}`);
      return errorResult(409, outcome, 'The payment cannot be applied to this order.');
  }
}
