import { getAuthHeader } from '../auth/getAccessToken';

/**
 * The signed-in account's dream-credit balance, as the SERVER reports it
 * (GET /api/credits). Purely advisory for the UI — it lets the app send an
 * account with no credit to Pricing before they record anything. The real
 * enforcement is the server's atomic spend inside /api/dream-analysis; a
 * client can neither set nor spend a balance. null = unknown (signed out, a
 * failed request): callers must treat that as "don't redirect", never as zero.
 */
export async function fetchCreditBalance(): Promise<number | null> {
  try {
    const authHeader = await getAuthHeader();
    if (!authHeader.Authorization) return null;
    const res = await fetch('/api/credits', { headers: authHeader, cache: 'no-store' });
    if (!res.ok) return null;
    const data: unknown = await res.json().catch(() => null);
    const balance = data && typeof data === 'object' ? (data as { balance?: unknown }).balance : undefined;
    return typeof balance === 'number' && Number.isFinite(balance) ? balance : null;
  } catch {
    return null;
  }
}
