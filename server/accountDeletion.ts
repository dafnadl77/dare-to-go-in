/**
 * Permanent account deletion: the orchestration, kept free of any Supabase
 * import so its ORDER and failure handling can be tested exactly (see
 * tests/accountDeletion.test.ts). The real collaborators live in
 * accountDeletionStore.ts.
 *
 * ORDER (the Auth user is deleted LAST, and only after everything that
 * depends on it is verifiably gone):
 *   1. deleteDatabaseData: ONE database transaction (delete_account_data):
 *        consumes + unlinks any claimed trial, deletes every owned row, anonymizes
 *        payment records, deletes the credit balance.
 *   2. purgeStorage: removes every object under the user's Storage folder
 *        and verifies the folder is empty.
 *   3. verifyDatabaseClean: nothing user-owned remains (fails closed if unknown).
 *   4. deleteAuthUser: LAST.
 *   5. sweepStorage: a final best-effort pass for an object uploaded by a
 *        concurrent session in the tiny window before step 4.
 *
 * Any failure before step 4 stops there: the Auth user still exists, the caller
 * is told the deletion is INCOMPLETE (never success), and repeating the request
 * is safe. Every step is idempotent (Storage is found by folder prefix, not by
 * database rows). A caller is only ever told "deleted" after step 4 succeeds.
 */

/** The exact words a dreamer must type. The server checks them too, not just the UI. */
export const DELETE_CONFIRMATION_WORDS = ['DELETE', 'מחיקה'] as const;

export function isValidConfirmation(value: unknown): boolean {
  return typeof value === 'string' && (DELETE_CONFIRMATION_WORDS as readonly string[]).includes(value);
}

export interface AccountDeletionDeps {
  deleteDatabaseData(userId: string): Promise<boolean>;
  purgeStorage(userId: string): Promise<boolean>;
  verifyDatabaseClean(userId: string): Promise<boolean>;
  deleteAuthUser(userId: string): Promise<boolean>;
  sweepStorage(userId: string): Promise<boolean>;
}

export type AccountDeletionStage = 'database' | 'storage' | 'verification' | 'auth';
export type AccountDeletionResult = { ok: true; storageSweepClean: boolean } | { ok: false; stage: AccountDeletionStage };

/**
 * Server-side operational signal for a deletion that needs follow-up. It carries
 * ONLY the (already deleted) account's opaque id, the bucket and the stage: enough
 * to find and remove leftovers, nothing about the person or their content. It is
 * never sent to the client.
 */
export type DeletionLogger = (line: string) => void;

export const STORAGE_RESIDUE_EVENT = 'account_deletion_storage_residue';
export const DELETION_INCOMPLETE_EVENT = 'account_deletion_incomplete';

export async function performAccountDeletion(
  userId: string,
  deps: AccountDeletionDeps,
  log: DeletionLogger = (line) => console.error(line),
): Promise<AccountDeletionResult> {
  const fail = (stage: AccountDeletionStage): AccountDeletionResult => {
    log(`${DELETION_INCOMPLETE_EVENT} stage=${stage} user_id=${userId} auth_user_deleted=no retryable=yes`);
    return { ok: false, stage };
  };
  if (!(await deps.deleteDatabaseData(userId))) return fail('database');
  if (!(await deps.purgeStorage(userId))) return fail('storage');
  if (!(await deps.verifyDatabaseClean(userId))) return fail('verification');
  if (!(await deps.deleteAuthUser(userId))) return fail('auth');
  // Best-effort: the account no longer exists, so a failure here cannot be retried by the user.
  const storageSweepClean = await deps.sweepStorage(userId).catch(() => false);
  if (!storageSweepClean) {
    // The user was told "deleted", so this is the ONLY trace of leftover objects: make it actionable.
    log(
      `${STORAGE_RESIDUE_EVENT} user_id=${userId} bucket=dream-images folder=${userId}/ action=list_and_remove_all_objects_under_folder auth_user_deleted=yes`,
    );
  }
  return { ok: true, storageSweepClean };
}
