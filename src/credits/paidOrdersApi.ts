import { getAuthHeader } from '../auth/getAccessToken';
import type { DocumentOrder } from '../payments/transactionDocument';
import { parsePaidOrdersResponse } from './paidOrdersParse';

/** The administrator's list of completed purchases (read-only). null = could not be read. The server decides who may ask. */
export async function fetchPaidOrders(): Promise<DocumentOrder[] | null> {
  try {
    const auth = await getAuthHeader();
    if (!auth.Authorization) return null;
    const res = await fetch('/api/credits?admin=orders', { headers: auth, cache: 'no-store' });
    if (res.status !== 200) return null;
    return parsePaidOrdersResponse(await res.json().catch(() => null));
  } catch {
    return null;
  }
}
