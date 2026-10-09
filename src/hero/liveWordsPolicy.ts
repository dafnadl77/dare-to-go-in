/**
 * When the live words may run, and what to do when they turn out to compete with the recording for the microphone.
 *
 * The live words (browser SpeechRecognition) are cosmetic; the authoritative text always comes from the recording itself
 * (MediaRecorder -> server transcription). On some phones the browser lets only one consumer hold the microphone, so running both
 * can silence the recording. That cannot be known in advance from a feature test, so it is watched while it happens:
 *
 *   - the recording's microphone stream being MUTED or ENDED while the live words run (and the page is in the foreground) means
 *     the two collided: the live words are switched off at once and this device is remembered, so the next recording does not
 *     start them again and says plainly that the transcript will appear when the dreamer finishes;
 *   - a page that merely went to the background (phones mute capture then) is NOT a collision and is never remembered.
 *
 * Pure functions with the storage injected, so the rules are tested without a browser.
 */

export const LIVE_WORDS_OFF_KEY = 'dare.liveWordsOff.v1';
/** A device that collided is left alone for this long, then given another chance (a browser update may have fixed it). */
export const LIVE_WORDS_OFF_MS = 14 * 24 * 60 * 60 * 1000;
/** Capture muted this soon after the page was hidden/shown is the phone's own background handling, not a collision. */
export const BACKGROUND_GRACE_MS = 2500;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function isLiveWordsDisabled(store: KeyValueStore | null, now: number): boolean {
  if (!store) return false;
  try {
    const raw = store.getItem(LIVE_WORDS_OFF_KEY);
    if (!raw) return false;
    const at = Number((JSON.parse(raw) as { at?: unknown }).at);
    if (!Number.isFinite(at)) return false;
    if (now - at < LIVE_WORDS_OFF_MS) return true;
    store.removeItem(LIVE_WORDS_OFF_KEY);
    return false;
  } catch {
    return false;
  }
}

export function disableLiveWords(store: KeyValueStore | null, now: number, reason: string): void {
  if (!store) return;
  try {
    store.setItem(LIVE_WORDS_OFF_KEY, JSON.stringify({ at: now, reason }));
  } catch {
    // storage unavailable: the live words are still switched off for this recording
  }
}

/** Whether a stream interruption is a genuine collision with the live words (rather than the page going to the background). */
export function isCollision(input: { now: number; lastVisibilityChangeAt: number; pageHidden: boolean }): boolean {
  if (input.pageHidden) return false;
  return input.now - input.lastVisibilityChangeAt > BACKGROUND_GRACE_MS;
}

/** Stalled = the dreamer has been audibly speaking for a while and the live words have produced nothing. */
export const STALL_SPEECH_MS = 4500;
export const SPEECH_LEVEL = 0.12;

export function nextStallSpeechMs(spokenMs: number, level: number, elapsedMs: number, hasWords: boolean): number {
  if (hasWords) return 0;
  return level >= SPEECH_LEVEL ? spokenMs + elapsedMs : spokenMs;
}

export function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
