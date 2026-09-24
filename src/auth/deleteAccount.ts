import { getAuthHeader } from './getAccessToken';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { clearLocalAccountState } from './localAccountState';

/** The exact words a dreamer must type to confirm, per app language. The server checks them again. */
export const DELETE_ACCOUNT_CONFIRMATION = { en: 'DELETE', he: 'מחיקה' } as const;

export type DeleteAccountResult = { ok: true } | { ok: false; reason: 'confirmation_required' | 'not_authenticated' | 'incomplete' };

/**
 * Asks the server to permanently delete THE SIGNED-IN account. The request
 * carries only the typed confirmation: no user id, owner id or email is ever
 * sent, because the server derives the account from the verified bearer token
 * and ignores anything else. Success is whatever the server reports after its
 * whole ordered deletion (Auth user last); any other outcome, including a
 * network failure, is "incomplete" and safe to retry.
 */
export async function requestAccountDeletion(confirmation: string): Promise<DeleteAccountResult> {
  try {
    const authHeader = await getAuthHeader();
    if (!authHeader.Authorization) return { ok: false, reason: 'not_authenticated' };
    const res = await fetch('/api/delete-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ confirmation }),
    });
    if (res.ok) return { ok: true };
    const data: unknown = await res.json().catch(() => null);
    const reason = data && typeof data === 'object' ? (data as { reason?: unknown }).reason : undefined;
    if (reason === 'confirmation_required') return { ok: false, reason: 'confirmation_required' };
    if (reason === 'not_authenticated') return { ok: false, reason: 'not_authenticated' };
    return { ok: false, reason: 'incomplete' };
  } catch {
    return { ok: false, reason: 'incomplete' };
  }
}

/**
 * After the server confirmed the deletion: clear local DARE state, drop the
 * local Supabase session (scope 'local': the server-side session no longer
 * exists), and reload onto the public home screen. The full reload is
 * deliberate: it also discards every in-memory cache, so nothing of the
 * deleted account can remain visible.
 */
export async function finishAccountDeletionLocally(): Promise<void> {
  clearLocalAccountState();
  try {
    if (isSupabaseConfigured) await supabase.auth.signOut({ scope: 'local' });
  } catch {
    /* the session is already invalid server-side */
  }
  window.location.replace('/');
}
