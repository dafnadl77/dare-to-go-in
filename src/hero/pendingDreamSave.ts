import type { SavedDream } from './dreamStorage';

/**
 * A single completed dream a signed-OUT dreamer chose to SAVE, held only
 * long enough to survive the trip through the existing DreamAuth screen —
 * including a full page detour for Google OAuth or a sign-up confirmation
 * email — before it's actually written to Supabase under the newly
 * authenticated account. See App.tsx's resume-save effect (the only
 * reader/clearer) and HeroDream.tsx's handleSaveDream (the only writer).
 *
 * Deliberately its own key — never mixed into dare.savedDreams.v1 (the
 * anonymous localStorage archive) or dare.localDreamMigration.v1 (the
 * unrelated legacy import flow) — so this can never be confused with, or
 * accidentally trigger, either of those.
 */
const PENDING_SAVE_KEY = 'dare.pendingDreamSave.v1';

// Bounds how long a pending save is honored after the fact — long enough
// for a real signup confirmation-email delay, short enough that an old,
// abandoned attempt can never silently resurface and attach itself to a
// signed-in session unrelated to it (e.g. a different person using the
// same browser days later).
const PENDING_SAVE_TTL_MS = 2 * 60 * 60 * 1000;

interface PendingSaveRecord {
  dream: SavedDream;
  savedAt: number;
}

export function setPendingDreamSave(dream: SavedDream): void {
  try {
    const record: PendingSaveRecord = { dream, savedAt: Date.now() };
    localStorage.setItem(PENDING_SAVE_KEY, JSON.stringify(record));
  } catch {
    // Best-effort, same posture as every other localStorage write in this
    // app (see dreamStorage.ts) — worst case SAVE simply can't survive a
    // full navigation away (Google/email confirmation) on this browser.
  }
}

/** Reads the pending dream, if any real one still exists — silently
    clears (and returns null for) a malformed or expired entry so a stale
    leftover can never be resumed later. */
export function getPendingDreamSave(): SavedDream | null {
  try {
    const raw = localStorage.getItem(PENDING_SAVE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      clearPendingDreamSave();
      return null;
    }
    const { dream, savedAt } = parsed as Partial<PendingSaveRecord>;
    if (!dream || typeof savedAt !== 'number' || Date.now() - savedAt > PENDING_SAVE_TTL_MS) {
      clearPendingDreamSave();
      return null;
    }
    return dream;
  } catch {
    return null;
  }
}

export function clearPendingDreamSave(): void {
  try {
    localStorage.removeItem(PENDING_SAVE_KEY);
  } catch {
    // Best-effort — see setPendingDreamSave above.
  }
}

/** Clears the pending-save record ONLY if it holds exactly this dream id —
    used when that dream has just been permanently deleted, so a stale pending
    save can never write it back. A pending save of any other dream is left
    untouched. */
export function clearPendingDreamSaveIfId(dreamId: string): void {
  try {
    const raw = localStorage.getItem(PENDING_SAVE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    const pendingId = parsed && typeof parsed === 'object' ? (parsed as Partial<PendingSaveRecord>).dream?.id : undefined;
    if (pendingId === dreamId) clearPendingDreamSave();
  } catch {
    // Best-effort, like every other localStorage access here.
  }
}
