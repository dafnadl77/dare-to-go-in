import { supabase } from '../auth/supabaseClient';
import { dreamImagePathFor } from './dreamImagePath';

/**
 * Phase 2 — Supabase Storage-backed dream images. Every call here goes
 * through the browser's own authenticated Supabase client (RLS-enforced,
 * same client AuthContext/dreamRemoteStorage.ts already use), never the
 * server-side service-role client — ownership is enforced by Storage's
 * own RLS policies on `storage.objects` (see the `dream-images` bucket
 * migration), which check the *path itself* against the caller's real
 * `auth.uid()`. Nothing here trusts a client-supplied owner id for
 * anything; the path this module builds always uses the id the caller
 * passes in, and Storage independently re-verifies that id is genuinely
 * the requester's own before allowing the operation.
 */

const BUCKET = 'dream-images';

/** Matches saveDreamRemote's own object-path convention exactly — the
    one place this shape is decided. `{owner_id}/{dream_id}.jpg` makes
    ownership derivable from the path alone (the first segment), which is
    what the bucket's RLS policies check via storage.foldername(name)[1]. */
export { dreamImagePathFor };

interface DecodedDataUrl {
  bytes: Uint8Array;
  contentType: string;
}

/** Decodes a `data:<mime>;base64,<...>` string (exactly what
    dream-image's OpenAI response produces, see server/routes/dreamImage.ts)
    into raw bytes — no dependency needed, atob is a standard browser API. */
function decodeDataUrl(dataUrl: string): DecodedDataUrl | null {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const [, contentType, base64] = match;
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { bytes, contentType };
  } catch {
    return null;
  }
}

/**
 * Uploads a dream's generated image (a base64 data URL, exactly what
 * dreamImageDataUrl already holds) to the private `dream-images` bucket
 * at `{ownerId}/{dreamId}.jpg`. `upsert: true` makes this safely
 * idempotent — a retry of the same save (e.g. after a DB-write failure,
 * see saveDreamRemote) re-uploads to the identical deterministic path
 * rather than creating a duplicate object.
 *
 * Throws on failure (malformed data URL, or a real Storage/RLS error) —
 * the caller (saveDreamRemote) treats that as "upload failed, do not
 * create the dream row," per the approved architecture.
 */
export async function uploadDreamImage(ownerId: string, dreamId: string, dataUrl: string): Promise<string> {
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) throw new Error('Dream image data URL could not be decoded.');
  const path = dreamImagePathFor(ownerId, dreamId);
  const { error } = await supabase.storage.from(BUCKET).upload(path, decoded.bytes, {
    contentType: decoded.contentType,
    upsert: true,
  });
  if (error) throw error;
  return path;
}

/** Best-effort compensating delete — used only when an upload just
    succeeded but the following public.dreams write then failed (see
    saveDreamRemote), so a dream row that will never exist doesn't leave
    an orphaned private image behind. Never throws: a failed compensation
    here is not worth turning into a second error on top of the real one
    the caller is already surfacing, and a retry's own upsert (above)
    would silently overwrite/clean up the same path anyway. */
export async function deleteDreamImage(path: string): Promise<void> {
  try {
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    // Best-effort — see doc comment above.
  }
}

/**
 * Mints a short-lived signed URL for a private dream image — the only
 * way to read from this bucket (it has no public/anon access at all).
 * Never cache this beyond the current view/session and never persist it
 * anywhere (not in public.dreams, not in localStorage) — see
 * archive/useDreamImageSrc.ts, the one caller, which keeps it only in
 * React state for as long as the component showing it is mounted.
 */
/** Removes one dream image and reports whether it worked — for permanent dream
    deletion (see dreamDeletion.ts), which retries once and reports a failure
    safely. The caller must only pass a path proven to be the conventional
    `{user id}/{dream id}.jpg` of the dream being deleted (ownedDreamImagePath);
    Storage's own RLS independently re-checks the owner folder. Never throws. */
export async function removeDreamImage(path: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    return !error;
  } catch {
    return false;
  }
}

export async function getSignedDreamImageUrl(path: string, ttlSeconds = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, ttlSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}
