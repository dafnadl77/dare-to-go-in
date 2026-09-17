import { supabase } from '../auth/supabaseClient';
import type { SavedDream } from './dreamStorage';
import { uploadDreamImage, deleteDreamImage } from './dreamImageStorage';

/**
 * Supabase-backed dream persistence for AUTHENTICATED users only — the
 * counterpart to dreamStorage.ts's localStorage path, used whenever a
 * real signed-in session exists (see HeroDream.tsx's handleSaveDream and
 * DreamArchive.tsx). Every dream belongs to exactly one Supabase user
 * (the `dreams` table's owner_id column, enforced by Row Level Security
 * — see the `create_dreams_table_with_rls` migration); this module never
 * filters by user itself beyond what it explicitly sends, since RLS is
 * the actual security boundary, not client-side filtering.
 *
 * The `dreams` row shape mirrors SavedDream 1:1 rather than re-modeling
 * it: `id`/`created_at`/`favorite` are real columns (queried, sorted, and
 * updated directly), every other SavedDream field lives together in one
 * `payload` jsonb column, so mapping to/from a row is a straight
 * passthrough — never a re-shaping that could silently drop a field.
 */

type DreamPayload = Omit<SavedDream, 'id' | 'createdAt' | 'favorite'>;

interface DreamRow {
  id: string;
  owner_id: string;
  created_at: string;
  favorite: boolean;
  payload: DreamPayload;
}

function rowToSavedDream(row: DreamRow): SavedDream {
  const { id, created_at, favorite, payload } = row;
  return { id, createdAt: created_at, favorite, ...payload };
}

function savedDreamToRow(dream: SavedDream, ownerId: string): DreamRow {
  const { id, createdAt, favorite, ...payload } = dream;
  return { id, owner_id: ownerId, created_at: createdAt, favorite: favorite === true, payload };
}

/** Every dream owned by this user, newest first — RLS already guarantees
    no other user's rows could ever come back here even if this filter
    were removed; it stays for query efficiency and local clarity, never
    as the actual security boundary. */
export async function getDreamsRemote(ownerId: string): Promise<SavedDream[]> {
  const { data, error } = await supabase
    .from('dreams')
    .select('id, owner_id, created_at, favorite, payload')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToSavedDream);
}

/**
 * One new dream, saved directly to this user's own account. Uses the
 * same upsert+ignoreDuplicates shape as importDreamsRemote below (keyed
 * on the dream's own client-generated id) rather than a plain insert —
 * every caller always passes a genuinely fresh dream/id, so this changes
 * nothing about normal behavior, but it makes a RETRY of the exact same
 * call (e.g. App.tsx's pending-save resume, after a save that may have
 * actually succeeded server-side despite a client-side network error)
 * safely idempotent: a retry can never create a second row for the same
 * dream.
 *
 * Phase 2: if the dream carries a real generated image
 * (`dreamImageDataUrl`), it's uploaded to the private `dream-images`
 * Storage bucket FIRST, using this call's own verified `ownerId` — never
 * anything read off `dream` itself — at the deterministic path
 * `{ownerId}/{dream.id}.jpg`. Only once that upload succeeds is the
 * `public.dreams` row written, with `dreamImagePath` set and
 * `dreamImageDataUrl` explicitly stripped — new rows never carry the
 * base64 copy remotely. If the upload itself fails, this throws before
 * ever touching `public.dreams` (no imageless/inconsistent row is ever
 * created). If the upload succeeds but the row write then fails, the
 * just-uploaded object is immediately deleted (compensating cleanup)
 * before the error is rethrown — a retry re-runs this whole function,
 * safely re-uploading to the same path (upload's own `upsert: true`)
 * rather than ever accumulating a duplicate or an orphan.
 *
 * A dream with no image at all (`dreamImageDataUrl` already null —
 * generation itself failed, see archiveData.ts's own fallback-image
 * note) skips the upload step entirely and saves exactly as before.
 */
export async function saveDreamRemote(dream: SavedDream, ownerId: string): Promise<void> {
  let uploadedPath: string | null = null;

  if (dream.dreamImageDataUrl) {
    uploadedPath = await uploadDreamImage(ownerId, dream.id, dream.dreamImageDataUrl);
  }

  const { id, createdAt, favorite, ...payload } = dream;
  const row: DreamRow = {
    id,
    owner_id: ownerId,
    created_at: createdAt,
    favorite: favorite === true,
    payload: { ...payload, dreamImageDataUrl: null, dreamImagePath: uploadedPath },
  };

  const { error } = await supabase.from('dreams').upsert(row, { onConflict: 'id', ignoreDuplicates: true });
  if (error) {
    if (uploadedPath) await deleteDreamImage(uploadedPath);
    throw error;
  }
}

export async function toggleFavoriteRemote(id: string, ownerId: string, next: boolean): Promise<void> {
  const { error } = await supabase.from('dreams').update({ favorite: next }).eq('id', id).eq('owner_id', ownerId);
  if (error) throw error;
}

/** Imports a batch of previously LOCAL dreams into this user's account —
    the explicit, opt-in migration path (see LocalDreamImportPrompt.tsx),
    never triggered automatically. `upsert` with `ignoreDuplicates` on the
    existing `id` (each dream already carries its own client-generated
    uuid from dreamStorage.ts's randomId()) makes a retried/refreshed
    import safely idempotent — a dream already inserted in an earlier
    attempt is silently skipped rather than duplicated or erroring the
    whole batch out. */
export async function importDreamsRemote(dreams: SavedDream[], ownerId: string): Promise<void> {
  if (dreams.length === 0) return;
  const rows = dreams.map((dream) => savedDreamToRow(dream, ownerId));
  const { error } = await supabase.from('dreams').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
  if (error) throw error;
}
