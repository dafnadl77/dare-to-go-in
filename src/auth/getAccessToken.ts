import { supabase, isSupabaseConfigured } from './supabaseClient';

/**
 * The current Supabase session's access token, if any — attached as
 * `Authorization: Bearer <token>` by every OpenAI-backed API call (see
 * server/callerIdentity.ts, which verifies it server-side). Returns null
 * for a genuinely signed-out visitor; that is never an error; those
 * requests simply proceed under the server's anonymous trial-cookie
 * identity instead.
 */
export async function getAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Convenience for building fetch() headers — spreads to nothing when
    signed out, so callers don't need their own conditional. */
export async function getAuthHeader(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
