/**
 * The completion contract: what the Make scenario must send to POST /api/payment-complete once Grow reports a payment.
 *
 * These are DARE's own field names. Which Grow fields feed them is decided in Make (we have not yet seen a real Grow
 * notification, so nothing here claims a Grow field name). Make must send EXACTLY these keys:
 *
 *   schema          "dare.payment.v1"
 *   orderId         the 32-hex order id DARE gave Make at checkout (Grow's Custom Field 1 echoed back)
 *   transactionId   Grow's immutable identifier of this payment (3-64 chars: letters, digits, _ or -)
 *   status          "paid" | "failed" | "cancelled" | "pending"   (Make's reading of Grow's status; only "paid" can grant)
 *   amount          the amount actually paid, in ILS (number, or a numeric string with up to 2 decimals)
 *   currency        "ILS"
 *   providerStatus  Grow's status exactly as reported (1-64 printable characters), kept for audit only
 *
 * Nothing about the account, the package, the price or the credits is accepted from Make: DARE derives all of that from its
 * own order record.
 */
import { readLinkIds, type LinkIds } from './growLinkBinding.js';

export interface CompletionRequest {
  orderId: string;
  transactionId: string;
  /** Normalized to at most two decimals. */
  amount: number;
  currency: string;
  providerStatus: string;
  /** Only in a "dare.payment.v2" request: Grow's identifiers of the payment link, to be matched against what DARE kept at checkout. */
  link?: LinkIds;
}

export type CompletionParse =
  | { ok: true; value: CompletionRequest }
  | { ok: false; reason: 'invalid_request' }
  // A well-formed report that is not "paid". Only the order id and the status text are kept (to remember the last notice).
  | { ok: false; reason: 'payment_not_successful'; orderId: string; providerStatus: string }
  // A well-formed PAID v2 report for a payment in installments. DARE supports one payment only (2026-11-25): nothing is granted.
  | { ok: false; reason: 'installments_not_supported'; orderId: string; providerStatus: string };

const KEYS = ['amount', 'currency', 'orderId', 'providerStatus', 'schema', 'status', 'transactionId'];
/**
 * "dare.payment.v2" (2026-11-25): the v1 keys plus Grow's link identifiers and the number of payments, all as Grow reported them.
 * v1 stays accepted unchanged; whether a v1 call may still complete an order is decided by the database (see
 * complete_payment_order_with_link), not here.
 */
const KEYS_V2 = [...KEYS, 'allPaymentsNum', 'paymentLinkProcessId', 'paymentLinkProcessToken'].sort();
const STATUSES = ['paid', 'failed', 'cancelled', 'pending'];
const TRANSACTION_ID = /^[A-Za-z0-9_-]{3,64}$/;

/** Shared with the direct Grow notification (growNotify.ts): one amount rule for every completion path. */
export function parseAmount(raw: unknown): number | null {
  let text: string;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    text = String(raw);
  } else if (typeof raw === 'string') {
    text = raw.trim();
  } else {
    return null;
  }
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(text)) return null;
  const value = Number(text);
  return value > 0 && value <= 100000 ? value : null;
}

export function parseCompletionRequest(raw: unknown): CompletionParse {
  const invalid = { ok: false, reason: 'invalid_request' } as const;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid;
  const keys = Object.keys(raw).sort();
  const body = raw as Record<string, unknown>;
  const v2 = body.schema === 'dare.payment.v2';
  const expected = v2 ? KEYS_V2 : KEYS;
  if (keys.length !== expected.length || keys.some((k, i) => k !== expected[i])) return invalid;

  if (body.schema !== 'dare.payment.v1' && !v2) return invalid;
  if (typeof body.orderId !== 'string' || !/^[0-9a-f]{32}$/.test(body.orderId)) return invalid;
  const tx = typeof body.transactionId === 'number' ? (Number.isSafeInteger(body.transactionId) && body.transactionId > 0 ? String(body.transactionId) : '') : body.transactionId;
  if (typeof tx !== 'string' || !TRANSACTION_ID.test(tx)) return invalid;
  if (typeof body.status !== 'string' || !STATUSES.includes(body.status)) return invalid;
  const amount = parseAmount(body.amount);
  if (amount === null) return invalid;
  if (typeof body.currency !== 'string' || !/^[A-Z]{3}$/.test(body.currency)) return invalid;
  const providerStatus = typeof body.providerStatus === 'string' ? body.providerStatus.trim() : '';
  const hasControlChar = [...providerStatus].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127);
  if (providerStatus.length < 1 || providerStatus.length > 64 || hasControlChar) return invalid;

  // A well-formed report that is not "paid" (failed / cancelled / pending): it can never grant, and it never closes the order,
  // because DARE has not observed what Grow's non-paid statuses mean (a customer may still pay afterwards).
  if (body.status !== 'paid') return { ok: false, reason: 'payment_not_successful', orderId: body.orderId, providerStatus };
  if (!v2) return { ok: true, value: { orderId: body.orderId, transactionId: tx, amount, currency: body.currency, providerStatus } };

  // v2: one payment only, and both link identifiers present and well formed (anything else is refused without saying which).
  const payments = typeof body.allPaymentsNum === 'number' ? String(body.allPaymentsNum) : body.allPaymentsNum;
  if (typeof payments !== 'string' || !/^\d{1,3}$/.test(payments.trim())) return invalid;
  const ids = readLinkIds(body.paymentLinkProcessId, body.paymentLinkProcessToken);
  if (ids.status !== 'present') return invalid;
  if (payments.trim() !== '1') return { ok: false, reason: 'installments_not_supported', orderId: body.orderId, providerStatus };
  return { ok: true, value: { orderId: body.orderId, transactionId: tx, amount, currency: body.currency, providerStatus, link: ids.ids } };
}
