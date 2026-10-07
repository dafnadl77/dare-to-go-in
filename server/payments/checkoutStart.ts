import { errorResult, okResult, type HandlerResult } from '../httpResult.js';
import { verifyBearerToken, type RequestHeaders, type VerifyBearerResult } from '../callerIdentity.js';
import { validatePayerDetails, type PayerDetails, type PayerField } from '../../src/payments/payerDetails.js';
import { paidPackage, type PaidPackage } from './checkoutPackages.js';
import { buildMakeCheckoutPayload, parseMakeWebhookUrl, requestPaymentLink, siteUrlFromEnv, type MakeCheckoutPayload, type MakeCheckoutResult } from './makeCheckoutClient.js';
import { createPaymentOrder, markPaymentOrderLink, type CreateOrderOutcome } from './orderStore.js';

/**
 * POST /api/credits: start a purchase (the checkout-initiation half of the Grow-through-Make flow).
 *
 *  - The browser sends ONLY {packageId, fullName, phone}. Any other key (amount, credits, userId, status ...) is rejected.
 *  - fullName and phone are the minimum Grow needs for a payment link. They are validated and normalized here, travel only
 *    in the request to Make, and are never stored, logged, put in a Grow custom field or used as an account identity.
 *  - The account is the verified bearer token's user. Amount and credits come from the server's own price list.
 *  - An internal payment order is created BEFORE Make is called; Make/Grow only ever see its opaque id.
 *  - Make answers synchronously with the Grow payment link, which is validated before the browser is sent there.
 *  - This route NEVER grants credits and never treats any redirect as proof of payment: completion arrives later,
 *    server-to-server, on its own authenticated route.
 *  - Nothing sensitive is logged: only reason codes.
 */

export interface CheckoutDeps {
  verifyBearer: (authorizationHeader: string) => Promise<VerifyBearerResult>;
  /** Whether the server environment is ready (Make webhook URL and public site URL), checked before any order exists. */
  siteUrl: () => string | null;
  makeConfigured: () => boolean;
  createOrder: (ownerId: string, pkg: PaidPackage) => Promise<CreateOrderOutcome | null>;
  markLink: (orderId: string, ownerId: string, status: 'link_created' | 'link_failed') => Promise<boolean>;
  requestLink: (payload: MakeCheckoutPayload) => Promise<MakeCheckoutResult>;
}

const realDeps: CheckoutDeps = {
  verifyBearer: verifyBearerToken,
  siteUrl: () => siteUrlFromEnv(),
  makeConfigured: () => parseMakeWebhookUrl(process.env.MAKE_CHECKOUT_WEBHOOK_URL) !== null,
  createOrder: createPaymentOrder,
  markLink: markPaymentOrderLink,
  requestLink: (payload) => requestPaymentLink(payload),
};

export type CheckoutRequest = { ok: true; pkg: PaidPackage; payer: PayerDetails } | { ok: false; field?: PayerField };

const REQUEST_KEYS = ['fullName', 'packageId', 'phone'];

export function parseCheckoutRequest(raw: unknown): CheckoutRequest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false };
  const keys = Object.keys(raw).sort();
  if (keys.length !== REQUEST_KEYS.length || keys.some((k, i) => k !== REQUEST_KEYS[i])) return { ok: false };
  const body = raw as { packageId?: unknown; fullName?: unknown; phone?: unknown };
  const pkg = paidPackage(body.packageId);
  if (!pkg) return { ok: false };
  const payer = validatePayerDetails(body.fullName, body.phone);
  return payer.ok ? { ok: true, pkg, payer: payer.payer } : { ok: false, field: payer.field };
}

export async function handleStartCheckout(rawBody: unknown, requestHeaders: RequestHeaders, deps: CheckoutDeps = realDeps): Promise<HandlerResult> {
  const authHeader = requestHeaders.authorization;
  if (!authHeader) return errorResult(401, 'not_authenticated', 'Buying credits requires being signed in.');
  const verified = await deps.verifyBearer(authHeader);
  if (!verified.ok) return errorResult(verified.status, verified.reason, verified.message);

  const parsed = parseCheckoutRequest(rawBody);
  if (!parsed.ok) {
    // Which field to fix, never its value.
    if (parsed.field) return { status: 400, body: { reason: 'invalid_payer_details', field: parsed.field, message: 'Please check your name and mobile number.' } };
    return errorResult(400, 'invalid_request', 'Choose one of the available packages.');
  }

  // Not configured is a controlled 503 BEFORE anything is created: no orphan order, no half-started purchase.
  const siteUrl = deps.siteUrl();
  if (!siteUrl || !deps.makeConfigured()) return errorResult(503, 'not_configured', 'Checkout is not available right now.');

  const order = await deps.createOrder(verified.userId, parsed.pkg);
  if (!order) return errorResult(503, 'not_configured', 'Checkout is not available right now.');
  if (order.status === 'rate_limited') return errorResult(429, 'rate_limited', 'Too many checkout attempts. Please wait a few minutes and try again.');

  const payload = buildMakeCheckoutPayload(order.orderId, parsed.pkg, siteUrl, parsed.payer);
  const link = await deps.requestLink(payload);
  if (!link.ok) {
    console.error(`checkout_link_failed reason=${link.reason}`);
    await deps.markLink(order.orderId, verified.userId, 'link_failed');
    return errorResult(502, 'checkout_unavailable', 'We could not start the payment. Please try again in a moment.');
  }
  await deps.markLink(order.orderId, verified.userId, 'link_created');
  return okResult({ orderId: order.orderId, paymentUrl: link.paymentUrl });
}
