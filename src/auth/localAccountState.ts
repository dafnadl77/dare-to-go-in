/** Every browser-side DARE key that can hold account or dream content. Language and accessibility preferences are device settings, not account data, and are kept. */
export const ACCOUNT_LOCAL_STORAGE_KEYS = ['dare.savedDreams.v1', 'dare.localDreamMigration.v1', 'dare.pendingDreamSave.v1', 'dare.dreamDraft.v1'] as const;
export const ACCOUNT_SESSION_STORAGE_KEYS = ['dare.archiveTranslations.v2', 'dare.analysisSubmission.v1'] as const;

/**
 * What SIGNING OUT removes from this browser (2026-10-29): the temporary dream and journey data only — the unfinished dream draft, a
 * dream waiting to be saved, the record of the last dream sent for analysis, and the translations of this account's dream texts.
 * (The unfinished journeys in IndexedDB are cleared beside it, see AuthContext.signOut.) Kept: everything that lives in the account
 * (saved dreams, conversations, credits, purchases — all on the server, never touched here), device settings (language,
 * accessibility, live words), and the dreams kept on this device from before accounts existed with their import markers, which are
 * not temporary data. Deleting the account removes all of it (ACCOUNT_* above).
 */
export const SIGN_OUT_LOCAL_STORAGE_KEYS = ['dare.pendingDreamSave.v1', 'dare.dreamDraft.v1'] as const;
export const SIGN_OUT_SESSION_STORAGE_KEYS = ACCOUNT_SESSION_STORAGE_KEYS;

export interface KeyValueStore {
  removeItem(key: string): void;
}

function removeAll(store: KeyValueStore, keys: readonly string[]): void {
  for (const key of keys) {
    try {
      store.removeItem(key);
    } catch {
      /* storage can be blocked; nothing else to do */
    }
  }
}

/** Clears the pending-save state, locally stored dreams, and cached translations of dream titles. */
export function clearLocalAccountState(
  local: KeyValueStore = window.localStorage,
  session: KeyValueStore = window.sessionStorage,
): void {
  removeAll(local, ACCOUNT_LOCAL_STORAGE_KEYS);
  removeAll(session, ACCOUNT_SESSION_STORAGE_KEYS);
}

/** Clears the temporary dream data of the account that signs out (see SIGN_OUT_* above). */
export function clearSignOutState(
  local: KeyValueStore = window.localStorage,
  session: KeyValueStore = window.sessionStorage,
): void {
  removeAll(local, SIGN_OUT_LOCAL_STORAGE_KEYS);
  removeAll(session, SIGN_OUT_SESSION_STORAGE_KEYS);
}
