/**
 * Pure helpers shared by the checkout UI (no network, no auth imports, so they are easy to test).
 */

/** Must match the server's default allow-list (server/payments/makeCheckoutClient.ts); a test keeps them identical. */
export const GROW_PAYMENT_HOST_SUFFIXES = ['grow.link', 'grow.business', 'meshulam.co.il'] as const;

/** The browser only ever follows a payment link that is https, carries no credentials and sits on a Grow domain. */
export function isSafePaymentUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length < 12 || raw.length > 2000) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return GROW_PAYMENT_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
  } catch {
    return false;
  }
}

/** The order id Grow hands the customer back to us with (?payment=<32 hex>), or null. The caller removes it from the URL. */
export function readPaymentReturnParam(search: string): string | null {
  const value = new URLSearchParams(search).get('payment');
  return value !== null && /^[0-9a-f]{32}$/.test(value) ? value : null;
}
