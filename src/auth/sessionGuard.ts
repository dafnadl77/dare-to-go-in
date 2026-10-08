import { supabase, isSupabaseConfigured } from './supabaseClient';

/**
 * A browser can keep holding a Supabase session that the SERVER no longer has: the session row was deleted (a sign-out
 * somewhere else — Supabase's default sign-out ends the account's sessions everywhere — an admin action, a deleted account), so
 * the access token still LOOKS valid in this tab (it is a signed JWT that has not expired yet) but the auth server refuses it.
 * Every paid call then answers 401 not_authenticated while the UI still believes the dreamer is signed in.
 *
 * Called when an authenticated request was refused with 401. It asks Supabase itself (a server-validated getUser, never a guess
 * from the status code alone) whether this session is really gone; only then does it drop it LOCALLY (this device only), so the
 * app falls back to the honest signed-out state instead of failing every action with a generic error. A valid session, or a
 * failure that is merely a network problem, is left exactly as it is.
 *
 * Returns true when a dead session was dropped.
 */
export async function dropSessionIfRevoked(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const { error } = await supabase.auth.getUser();
    if (!error) return false;
    const status = (error as { status?: number }).status;
    // 401/403 (session_not_found, bad_jwt, user_not_found, ...) = the server says this session is not valid.
    // Anything else (no status = a network failure) says nothing about the session: do not sign anyone out for it.
    if (status !== 401 && status !== 403) return false;
    await supabase.auth.signOut({ scope: 'local' });
    return true;
  } catch {
    return false;
  }
}
