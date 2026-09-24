/** Every browser-side DARE key that can hold account or dream content. Language and accessibility preferences are device settings, not account data, and are kept. */
export const ACCOUNT_LOCAL_STORAGE_KEYS = ['dare.savedDreams.v1', 'dare.localDreamMigration.v1', 'dare.pendingDreamSave.v1'] as const;
export const ACCOUNT_SESSION_STORAGE_KEYS = ['dare.archiveTranslations.v2'] as const;

export interface KeyValueStore {
  removeItem(key: string): void;
}

/** Clears the pending-save state, locally stored dreams, and cached translations of dream titles. */
export function clearLocalAccountState(
  local: KeyValueStore = window.localStorage,
  session: KeyValueStore = window.sessionStorage,
): void {
  for (const key of ACCOUNT_LOCAL_STORAGE_KEYS) {
    try {
      local.removeItem(key);
    } catch {
      /* storage can be blocked; nothing else to do */
    }
  }
  for (const key of ACCOUNT_SESSION_STORAGE_KEYS) {
    try {
      session.removeItem(key);
    } catch {
      /* storage can be blocked; nothing else to do */
    }
  }
}
