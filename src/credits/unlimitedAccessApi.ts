import { getAuthHeader } from '../auth/getAccessToken';
import { parseUnlimitedList, type UnlimitedAccessItem } from './unlimitedAccessParse';

export type { UnlimitedAccessItem };

/**
 * The administrator's unlimited-access area, as the browser calls it. The browser sends only its own bearer token and the TARGET (an email
 * to grant, an account id to revoke): who is calling, and whether they may, is decided by the server and the database, never here.
 */

export type GrantResult =
  | { kind: 'granted' | 'already_granted' | 'already_unlimited'; item: { userId: string; email: string } }
  | { kind: 'not_registered' | 'invalid_email' | 'forbidden' | 'error' };

export type RevokeResult = { kind: 'revoked' | 'not_found' | 'forbidden' | 'error' };

const ENDPOINT = '/api/credits?admin=unlimited';

async function call(method: 'GET' | 'POST', body?: unknown): Promise<{ status: number; json: unknown } | null> {
  try {
    const auth = await getAuthHeader();
    if (!auth.Authorization) return null;
    const res = await fetch(ENDPOINT, {
      method,
      headers: { ...auth, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  } catch {
    return null;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** null = could not be read (the area then says so; it never shows a guessed list). */
export async function fetchUnlimitedList(): Promise<UnlimitedAccessItem[] | null> {
  const r = await call('GET');
  return r && r.status === 200 ? parseUnlimitedList(r.json) : null;
}

export async function grantUnlimited(email: string): Promise<GrantResult> {
  const r = await call('POST', { action: 'grant', email });
  if (!r) return { kind: 'error' };
  const body = isRecord(r.json) ? r.json : {};
  if (r.status === 200 && (body.status === 'granted' || body.status === 'already_granted' || body.status === 'already_unlimited') && isRecord(body.item)) {
    const item = body.item;
    if (typeof item.userId === 'string' && typeof item.email === 'string') return { kind: body.status, item: { userId: item.userId, email: item.email } };
  }
  if (r.status === 404 && body.reason === 'not_registered') return { kind: 'not_registered' };
  if (r.status === 400 && body.reason === 'invalid_email') return { kind: 'invalid_email' };
  if (r.status === 403) return { kind: 'forbidden' };
  return { kind: 'error' };
}

export async function revokeUnlimited(userId: string): Promise<RevokeResult> {
  const r = await call('POST', { action: 'revoke', userId });
  if (!r) return { kind: 'error' };
  if (r.status === 200) return { kind: 'revoked' };
  if (r.status === 404) return { kind: 'not_found' };
  if (r.status === 403) return { kind: 'forbidden' };
  return { kind: 'error' };
}
