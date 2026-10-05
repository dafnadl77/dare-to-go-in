/**
 * The identity of ONE submitted dream analysis, so that sending the same dream again (TRY AGAIN
 * after a timeout, EDIT without changing it, a refresh and re-submit) is recognised by the server as
 * the same paid request instead of a new one. The server is authoritative (it scopes the key to the
 * account, binds it to a hash of the submitted text, and decides atomically); this only supplies a
 * stable key and knows when to keep or drop it.
 *
 * Rules:
 *  - A NEW key for every genuinely new submission (different text, or after a definitive answer).
 *  - The SAME key while no definitive answer has reached the client (timeout, disconnect, platform
 *    error page, "still processing") and the text is unchanged, including across a page refresh
 *    within a short window (sessionStorage).
 *  - The key is dropped as soon as the client receives a definitive answer (success, or a server
 *    error that released the attempt), so the next submission of even identical text is a new dream.
 *  - Only a hash of the text is ever stored client-side, never the text.
 */

/** How long an unanswered submission's key may be reused after a refresh. */
export const SUBMISSION_TTL_MS = 15 * 60 * 1000;

const STORAGE_KEY = 'dare.analysisSubmission.v1';

export interface StoredSubmission {
  key: string;
  textHash: string;
  savedAt: number;
}

export interface SubmissionStore {
  read(): StoredSubmission | null;
  write(value: StoredSubmission): void;
  clear(): void;
}

/** A small non-cryptographic string hash (cyrb53), enough to tell "same text" from "changed text". */
export function hashText(text: string): string {
  const s = text.trim();
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0') + s.length.toString(16);
}

/** A fresh key matching the server's format: 36 characters of [A-Za-z0-9-]. */
export function newIdempotencyKey(random: () => string = defaultRandomUuid): string {
  return random();
}

function defaultRandomUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The key to send for this submission: the stored one when it is the same text still awaiting a
 * definitive answer (and fresh), otherwise a new one (which is stored).
 */
export function keyForSubmission(
  text: string,
  store: SubmissionStore,
  now: number = Date.now(),
  random: () => string = defaultRandomUuid,
): string {
  const textHash = hashText(text);
  const existing = store.read();
  if (existing && existing.textHash === textHash && now - existing.savedAt <= SUBMISSION_TTL_MS) return existing.key;
  const key = newIdempotencyKey(random);
  store.write({ key, textHash, savedAt: now });
  return key;
}

/** Forgets the stored submission: call when a definitive answer has been received. */
export function endSubmission(store: SubmissionStore): void {
  store.clear();
}

/** The real store: sessionStorage (this tab only, gone when it closes), with a silent in-memory fallback. */
export function createSessionSubmissionStore(): SubmissionStore {
  let memory: StoredSubmission | null = null;
  return {
    read() {
      try {
        const raw = globalThis.sessionStorage?.getItem(STORAGE_KEY);
        if (!raw) return memory;
        const parsed = JSON.parse(raw) as Partial<StoredSubmission>;
        return typeof parsed.key === 'string' && typeof parsed.textHash === 'string' && typeof parsed.savedAt === 'number'
          ? (parsed as StoredSubmission)
          : null;
      } catch {
        return memory;
      }
    },
    write(value) {
      memory = value;
      try {
        globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch {
        /* storage blocked: the in-memory copy still covers TRY AGAIN within this page */
      }
    },
    clear() {
      memory = null;
      try {
        globalThis.sessionStorage?.removeItem(STORAGE_KEY);
      } catch {
        /* nothing else to do */
      }
    },
  };
}
