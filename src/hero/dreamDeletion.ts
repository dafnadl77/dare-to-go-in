import { ownedDreamImagePath } from './dreamImagePath';

/**
 * Permanent deletion of ONE saved dream, as a small pure sequence over
 * injected operations (dreamRemoteStorage.ts wires the real Supabase /
 * localStorage ones). Kept separate so the ordering and failure rules — the
 * whole point of this module — can be tested without a database.
 *
 * Order (each step runs only if the previous succeeded):
 *   1. require the authenticated session user (never a user id from UI state)
 *   2. delete the dream row, constrained by dream id AND that user id
 *   3. confirm the delete really affected the row (RLS returns 0 rows
 *      silently for a row that isn't yours / doesn't exist)
 *   4. remove exactly this dream id from local state (localStorage archive +
 *      the pending-save record) so nothing can save it back
 *   5. remove the Storage image — only when its path is exactly
 *      `{user id}/{dream id}.jpg`; retried once; a failure here is reported
 *      but never fails the deletion (the row is the dream)
 */
export type DreamDeletionErrorCode = 'not_authenticated' | 'not_deleted';

export class DreamDeletionError extends Error {
  readonly code: DreamDeletionErrorCode;
  constructor(code: DreamDeletionErrorCode) {
    super(code);
    this.name = 'DreamDeletionError';
    this.code = code;
  }
}

export interface DeletedRow {
  id: string;
  /** payload.dreamImagePath as stored on the deleted row, if any. */
  imagePath: string | null;
}

export interface DreamDeletionDeps {
  /** The verified authenticated user's id, or null when signed out. */
  getAuthenticatedUserId(): Promise<string | null>;
  /** DELETE ... WHERE id = dreamId AND owner_id = ownerId RETURNING id, image path. Throws on a database error. */
  deleteOwnedRow(dreamId: string, ownerId: string): Promise<DeletedRow[]>;
  /** Whether a row with this id AND owner still exists. Throws on a database error. */
  ownedRowExists(dreamId: string, ownerId: string): Promise<boolean>;
  /** Removes exactly this dream id from the local (localStorage) archive. */
  removeLocalCopy(dreamId: string): void;
  /** Clears the pending-save record only if it holds exactly this dream id. */
  clearPendingSave(dreamId: string): void;
  /** Removes one Storage object; resolves true on success, false (never throws) on failure. */
  removeImage(path: string): Promise<boolean>;
  /** Safe, path-free report that an image cleanup failed after the row was deleted. */
  reportImageCleanupFailure(): void;
}

export type ImageCleanup = 'none' | 'removed' | 'failed';

export async function deleteSavedDream(
  deps: DreamDeletionDeps,
  dreamId: string,
  knownImagePath?: string | null,
): Promise<{ imageCleanup: ImageCleanup }> {
  const userId = await deps.getAuthenticatedUserId();
  if (!userId) throw new DreamDeletionError('not_authenticated');

  const deleted = await deps.deleteOwnedRow(dreamId, userId);
  let storedPath: string | null | undefined;
  if (deleted.length === 1) {
    // Prefer the path stored on the deleted row; the path the UI already knew is
    // only a fallback — either way it must still equal the exact owned path below.
    storedPath = deleted[0].imagePath ?? knownImagePath;
  } else if (deleted.length === 0) {
    // Nothing was deleted: either it is already gone (e.g. deleted from a
    // second tab) or it is not ours. Only "already gone" counts as done.
    if (await deps.ownedRowExists(dreamId, userId)) throw new DreamDeletionError('not_deleted');
    storedPath = knownImagePath;
  } else {
    // The delete is pinned to one primary key; more than one row is impossible
    // unless something is badly wrong — do not carry on as if it were fine.
    throw new DreamDeletionError('not_deleted');
  }

  deps.removeLocalCopy(dreamId);
  deps.clearPendingSave(dreamId);

  const imagePath = ownedDreamImagePath(userId, dreamId, storedPath);
  if (!imagePath) return { imageCleanup: 'none' };
  if ((await deps.removeImage(imagePath)) || (await deps.removeImage(imagePath))) return { imageCleanup: 'removed' };
  deps.reportImageCleanupFailure();
  return { imageCleanup: 'failed' };
}
