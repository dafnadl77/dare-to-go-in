/**
 * A dream the dreamer typed (or recorded) that could not be analyzed YET because they must sign in first — their free dream was
 * used, their session expired, or they have no credit — held briefly so that the words survive the trip to the sign-in / packages
 * screen and are back in the typing box when they return home. Text only; never sent anywhere; read ONCE.
 *
 * Its own key, separate from the saved-dream flow (pendingDreamSave.ts), which stores a completed dream.
 */
const DRAFT_KEY = 'dare.dreamDraft.v1';
const DRAFT_TTL_MS = 60 * 60 * 1000;
const DRAFT_MAX_CHARS = 20000;

export function saveDreamDraft(text: string, now: number = Date.now()): void {
  const clean = text.trim();
  if (!clean) return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ text: clean.slice(0, DRAFT_MAX_CHARS), savedAt: now }));
  } catch {
    // Best effort: without storage the words simply are not kept.
  }
}

/** Returns the draft (and forgets it), or null when there is none, it is malformed, or it is older than an hour. */
export function takeDreamDraft(now: number = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    localStorage.removeItem(DRAFT_KEY);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const { text, savedAt } = parsed as { text?: unknown; savedAt?: unknown };
    if (typeof text !== 'string' || !text.trim() || typeof savedAt !== 'number' || now - savedAt > DRAFT_TTL_MS || now < savedAt - 60_000) return null;
    return text;
  } catch {
    return null;
  }
}
