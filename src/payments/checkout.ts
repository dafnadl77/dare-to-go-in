import { getAuthHeader } from '../auth/getAccessToken';
import type { PackageId } from '../pricing/packages';
import { isSafePaymentUrl } from './paymentLink';

/**
 * Client side of checkout. Nothing here decides anything: the server derives the account, the price and the credits, validates the
 * payer details again, and only DARE's own server-to-server completion route can ever add credits. This file only
 *   - asks DARE to start a purchase (POST /api/credits with exactly {packageId, fullName, phone}),
 *   - checks that the payment link DARE returns really is a Grow https address before the browser is sent there,
 *   - and asks DARE how the customer's OWN order is doing after they come back (read-only).
 * Coming back from the payment page is never proof of payment.
 */

export type PaidPackageId = Exclude<PackageId, 'first_dream'>;

export type CheckoutError = 'invalid_name' | 'invalid_phone' | 'not_authenticated' | 'rate_limited' | 'unavailable';
export type CheckoutResult = { ok: true; paymentUrl: string } | { ok: false; reason: CheckoutError };

/** The server waits up to 25 s for Make; the browser waits a little longer so the customer is never left spinning. */
export const CHECKOUT_TIMEOUT_MS = 40_000;

export async function startCheckout(packageId: PaidPackageId, fullName: string, phone: string): Promise<CheckoutResult> {
  try {
    const authHeader = await getAuthHeader();
    if (!authHeader.Authorization) return { ok: false, reason: 'not_authenticated' };
    const res = await fetch('/api/credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      // Exactly these three keys: never an amount, a credit count, a user id or a status.
      body: JSON.stringify({ packageId, fullName, phone }),
      cache: 'no-store',
      signal: AbortSignal.timeout(CHECKOUT_TIMEOUT_MS),
    });
    const data: unknown = await res.json().catch(() => null);
    const body = data && typeof data === 'object' ? (data as { paymentUrl?: unknown; reason?: unknown; field?: unknown }) : {};
    if (res.ok) return isSafePaymentUrl(body.paymentUrl) ? { ok: true, paymentUrl: body.paymentUrl } : { ok: false, reason: 'unavailable' };
    if (res.status === 400 && body.reason === 'invalid_payer_details') return { ok: false, reason: body.field === 'phone' ? 'invalid_phone' : 'invalid_name' };
    if (res.status === 401) return { ok: false, reason: 'not_authenticated' };
    if (res.status === 429) return { ok: false, reason: 'rate_limited' };
    return { ok: false, reason: 'unavailable' };
  } catch {
    // Offline, timed out, or the server is down. No payment page was opened, so nothing was charged.
    return { ok: false, reason: 'unavailable' };
  }
}

/** 'confirmed' = credits were added; 'pending'; 'unknown' = not an order of this account; null = could not be checked right now. */
export type OrderState = 'confirmed' | 'pending' | 'unknown';

export async function fetchOrderState(orderId: string): Promise<OrderState | null> {
  if (!/^[0-9a-f]{32}$/.test(orderId)) return 'unknown';
  try {
    const authHeader = await getAuthHeader();
    if (!authHeader.Authorization) return null;
    const res = await fetch(`/api/credits?order=${orderId}`, { headers: authHeader, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const data: unknown = await res.json().catch(() => null);
    const order = data && typeof data === 'object' ? (data as { order?: unknown }).order : undefined;
    return order === 'confirmed' || order === 'pending' || order === 'unknown' ? order : null;
  } catch {
    return null;
  }
}
