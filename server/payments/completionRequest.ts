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
export interface CompletionRequest {
  orderId: string;
  transactionId: string;
  /** Normalized to at most two decimals. */
  amount: number;
  currency: string;
  providerStatus: string;
}

export type CompletionParse =
  | { ok: true; value: CompletionRequest }
  | { ok: false; reason: 'invalid_request' | 'payment_not_successful' };

const KEYS = ['amount', 'currency', 'orderId', 'providerStatus', 'schema', 'status', 'transactionId'];
const STATUSES = ['paid', 'failed', 'cancelled', 'pending'];
const TRANSACTION_ID = /^[A-Za-z0-9_-]{3,64}$/;

function parseAmount(raw: unknown): number | null {
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
  if (keys.length !== KEYS.length || keys.some((k, i) => k !== KEYS[i])) return invalid;
  const body = raw as Record<string, unknown>;

  if (body.schema !== 'dare.payment.v1') return invalid;
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

  // A well-formed report of a payment that did not succeed: refused without touching the order (a customer may retry).
  if (body.status !== 'paid') return { ok: false, reason: 'payment_not_successful' };
  return { ok: true, value: { orderId: body.orderId, transactionId: tx, amount, currency: body.currency, providerStatus } };
}
