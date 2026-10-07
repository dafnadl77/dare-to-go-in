import { getAuthHeader } from '../auth/getAccessToken';
import { parseCreditSummary, type CreditSummary } from './creditSummary';

/** null = unknown (signed out, a failed request): callers must treat that as "don't redirect / show nothing", never as zero. */
export async function fetchCreditSummary(): Promise<CreditSummary | null> {
  try {
    const authHeader = await getAuthHeader();
    if (!authHeader.Authorization) return null;
    const res = await fetch('/api/credits', { headers: authHeader, cache: 'no-store' });
    if (!res.ok) return null;
    return parseCreditSummary(await res.json().catch(() => null));
  } catch {
    return null;
  }
}

/** The balance alone (the entry gate in App.tsx). null = unknown. */
export async function fetchCreditBalance(): Promise<number | null> {
  return (await fetchCreditSummary())?.balance ?? null;
}
