/**
 * Lets any authenticated client call report "the server refused my token" without importing the Supabase client at module load
 * (so plain-node tests of those callers keep working). The real work is in sessionGuard.ts and only ever signs this device out
 * when Supabase itself confirms the session is gone.
 */
export async function dropRevokedSession(): Promise<void> {
  try {
    const guard = await import('./sessionGuard');
    await guard.dropSessionIfRevoked();
  } catch {
    // Nothing to drop / could not check: leave the session exactly as it is.
  }
}

/** Does this request carry the account's bearer token? (Only such a request can be refused as a revoked session.) */
export function carriesBearerToken(init: RequestInit | undefined): boolean {
  const headers = init?.headers;
  if (!headers) return false;
  if (typeof Headers !== 'undefined' && headers instanceof Headers) return headers.has('Authorization');
  if (Array.isArray(headers)) return headers.some(([name]) => String(name).toLowerCase() === 'authorization');
  return Object.keys(headers).some((name) => name.toLowerCase() === 'authorization');
}
