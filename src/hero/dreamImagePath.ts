/**
 * The one place the Storage path convention for a dream's generated image is
 * decided (kept free of any Supabase import so it can be unit-tested and
 * shared by upload and delete alike).
 *
 * `{owner_id}/{dream_id}.jpg` makes ownership derivable from the path alone:
 * the first segment is what the `dream-images` bucket's RLS policies compare
 * with `auth.uid()`, and the file name carries the dream's own (unique) id —
 * so a path built from a given user id + dream id can only ever belong to
 * that one dream of that one user.
 */
export function dreamImagePathFor(ownerId: string, dreamId: string): string {
  return `${ownerId}/${dreamId}.jpg`;
}

/**
 * Returns `candidate` only if it is EXACTLY the conventional path for this
 * authenticated user and this dream; otherwise null. Deletion never removes
 * a Storage object whose path merely appears in a payload — a path that does
 * not match this shape (another user's, another dream's, anything else) is
 * ignored, so a tampered or legacy value can never redirect a delete.
 */
export function ownedDreamImagePath(userId: string, dreamId: string, candidate: string | null | undefined): string | null {
  if (!userId || !dreamId || typeof candidate !== 'string') return null;
  return candidate === dreamImagePathFor(userId, dreamId) ? candidate : null;
}
