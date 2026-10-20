import { parseExploration, type Exploration } from './exploration';

/**
 * AN UNFINISHED DREAM JOURNEY, KEPT IN THIS BROWSER FOR UP TO 7 DAYS (approved 2026-10-20; design in
 * docs/upgrade-2026-10/26-stage3-query-results-and-storage.md, section 12).
 *
 * - Where: IndexedDB (database "dare-open-journey"): the picture is kept as binary, not base64, and there is no 5MB ceiling.
 * - One journey per account. The record's key is a SHA-256 hash of the account id, never the id itself.
 * - Encrypted: AES-GCM 256 with a fresh random IV on every write; the data and the picture are encrypted separately. Every journey has
 *   its OWN key, created non-extractable (page code can use it but never read it out) and stored next to it; deleting the key makes
 *   whatever is left unreadable. Only createdAt / expiresAt / version are in clear text, so an expired record can be deleted
 *   without ever being decrypted.
 * - Never stored: sign-in tokens, keys, e-mail, name, payment details or any other secret (assertNoSecrets refuses such a snapshot).
 * - Deleted: when the dream is saved or let go, when the dreamer discards it, when a new dream replaces it, on sign-out (EVERY journey
 *   in this browser), on account deletion, 7 days after the journey started, and when a record cannot be decrypted or read.
 * - Never an error for the dreamer: if IndexedDB or WebCrypto is unavailable (private browsing, blocked storage, an old browser) or a
 *   write fails, the store is simply off and the journey works exactly as before. Writes are serialized per account, so a late write
 *   never overwrites a newer one, and a failed write leaves the previous record intact (one IndexedDB transaction per write).
 * - What it protects against, honestly: reading the browser's files from disk, backups and storage-scanning tools. It does NOT
 *   protect against someone using this browser while the account is signed in; deletion on sign-out is that protection.
 */

export const OPEN_JOURNEY_DB = 'dare-open-journey';
export const OPEN_JOURNEY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RECORD_VERSION = 1;
const KEY_SALT = 'dare-open-journey:';

/** Where a resumed journey continues from. */
export type OpenJourneyStep = 'question' | 'follow-up' | 'insight' | 'feelings' | 'map';

/** Everything needed to continue an unfinished journey, and nothing more. */
export interface OpenJourneySnapshot {
  attemptId: string;
  language: 'he' | 'en';
  inputMode: 'voice' | 'text';
  /** The dream analysis (it contains the dream's own words). Opaque here; the journey validates it when resuming. */
  analysis: unknown;
  corrections: string[];
  emotions: string[];
  exploration: Exploration;
  step: OpenJourneyStep;
  /** Text typed but not sent yet, so a refresh does not lose it. */
  draft: { momentId: string; field: 'answer' | 'follow-up'; text: string } | null;
}

export interface LoadedOpenJourney {
  snapshot: OpenJourneySnapshot;
  image: Blob | null;
  createdAt: number;
  expiresAt: number;
}

/** What is kept per account: clear-text dates, then ciphertext only. */
export interface StoredRecord {
  version: number;
  createdAt: number;
  expiresAt: number;
  iv: Uint8Array;
  data: ArrayBuffer;
  imageIv: Uint8Array | null;
  image: ArrayBuffer | null;
  imageType: string | null;
}

/** The storage under the store, so the logic is tested without a browser. */
export interface OpenJourneyBackend {
  getKey(userKey: string): Promise<CryptoKey | null>;
  putKey(userKey: string, key: CryptoKey): Promise<void>;
  getRecord(userKey: string): Promise<StoredRecord | null>;
  /** Writes the key (when given) and the record in ONE transaction: both or neither. */
  putRecord(userKey: string, record: StoredRecord, key?: CryptoKey): Promise<void>;
  remove(userKey: string): Promise<void>;
  listExpiry(): Promise<{ userKey: string; expiresAt: number }[]>;
  removeAll(): Promise<void>;
}

/** saved: written. needs-image: nothing written, because this would start a NEW record (none yet, or the old one expired / was
    deleted) and the picture was not passed; call again with it, so a resumed journey can never lose the dream's one picture.
    failed: nothing written (storage error); the previous record, if any, is untouched. */
export type OpenJourneySaveResult = 'saved' | 'needs-image' | 'failed';

export interface OpenJourneyStore {
  readonly available: boolean;
  /** Saves (or replaces) this account's unfinished journey. The picture may be omitted only while a live record already holds it
      (it is kept); null means the dream has no picture. */
  save(userId: string, snapshot: OpenJourneySnapshot, image?: Blob | null): Promise<OpenJourneySaveResult>;
  /** This account's unfinished journey, or null (none, expired, unreadable: the last two are deleted on the way). */
  load(userId: string): Promise<LoadedOpenJourney | null>;
  /** Deletes this account's journey and its key. */
  discard(userId: string): Promise<void>;
  /** Deletes every journey and every key in this browser (sign-out, account deletion). */
  clearAll(): Promise<void>;
  /** Deletes expired journeys without decrypting them. */
  purgeExpired(): Promise<void>;
}

// ------------------------------------------------------------------------------------------------ guards

const FORBIDDEN_KEY = /(^|_)(access|refresh|id)?_?token$|^token$|password|passwd|secret|api_?key|apikey|authorization|bearer|session|cookie|card|cvv|cvc|iban|email/i;
const FORBIDDEN_VALUE = /^(eyJ[\w-]+\.[\w-]+\.[\w-]+|sk-[\w-]{16,}|Bearer\s+\S+)$/;

/** Refuses a snapshot that carries anything looking like a secret (a key name or a token-shaped value). */
export function assertNoSecrets(value: unknown, path = 'snapshot'): void {
  if (typeof value === 'string') {
    if (FORBIDDEN_VALUE.test(value.trim())) throw new Error(`open journey: refusing a token-like value at ${path}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoSecrets(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(k)) throw new Error(`open journey: refusing the field "${k}" at ${path}`);
      assertNoSecrets(v, `${path}.${k}`);
    }
  }
}

function parseSnapshot(raw: unknown): OpenJourneySnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const exploration = parseExploration(r.exploration);
  if (!exploration || typeof r.attemptId !== 'string' || r.attemptId !== exploration.attemptId) return null;
  const steps: OpenJourneyStep[] = ['question', 'follow-up', 'insight', 'feelings', 'map'];
  const draft =
    r.draft && typeof r.draft === 'object'
      ? (() => {
          const d = r.draft as Record<string, unknown>;
          return typeof d.momentId === 'string' && (d.field === 'answer' || d.field === 'follow-up') && typeof d.text === 'string'
            ? { momentId: d.momentId, field: d.field as 'answer' | 'follow-up', text: d.text.slice(0, 2000) }
            : null;
        })()
      : null;
  return {
    attemptId: r.attemptId,
    language: r.language === 'en' ? 'en' : 'he',
    inputMode: r.inputMode === 'voice' ? 'voice' : 'text',
    analysis: r.analysis ?? null,
    corrections: Array.isArray(r.corrections) ? r.corrections.filter((c): c is string => typeof c === 'string') : [],
    emotions: Array.isArray(r.emotions) ? r.emotions.filter((c): c is string => typeof c === 'string') : [],
    exploration,
    step: steps.includes(r.step as OpenJourneyStep) ? (r.step as OpenJourneyStep) : 'map',
    draft,
  };
}

// ------------------------------------------------------------------------------------------------ the store

async function userKeyFor(subtle: SubtleCrypto, userId: string): Promise<string> {
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(KEY_SALT + userId));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function createOpenJourneyStore(deps: { backend: OpenJourneyBackend; subtle: SubtleCrypto; random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>; now?: () => number }): OpenJourneyStore {
  const { backend, subtle, random } = deps;
  const now = deps.now ?? (() => Date.now());
  // One write at a time per account: a late (older) write can never land after a newer one.
  const queues = new Map<string, Promise<unknown>>();
  const serial = <T>(userKey: string, task: () => Promise<T>): Promise<T> => {
    const prev = queues.get(userKey) ?? Promise.resolve();
    const next = prev.then(task, task);
    queues.set(userKey, next.catch(() => undefined));
    return next;
  };

  const encrypt = async (key: CryptoKey, bytes: ArrayBuffer | Uint8Array) => {
    const iv = random(new Uint8Array(12));
    const data = await subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, bytes as BufferSource);
    return { iv, data };
  };

  return {
    available: true,

    async save(userId, snapshot, image) {
      try {
        assertNoSecrets(snapshot);
      } catch {
        return 'failed';
      }
      if (!userId || !parseExploration(snapshot.exploration)) return 'failed';
      const userKey = await userKeyFor(subtle, userId).catch(() => null);
      if (!userKey) return 'failed';
      return serial(userKey, async (): Promise<OpenJourneySaveResult> => {
        try {
          const t = now();
          const existing = await backend.getRecord(userKey);
          let key = existing ? await backend.getKey(userKey) : null;
          const live = existing && key && existing.expiresAt > t ? existing : null;
          if (!live && image === undefined) return 'needs-image';
          // A new journey (or one whose key is missing / that expired) gets a new key; the old record is replaced below.
          let newKey: CryptoKey | undefined;
          if (!live) {
            key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
            newKey = key;
          }
          const { iv, data } = await encrypt(key as CryptoKey, new TextEncoder().encode(JSON.stringify(snapshot)));
          let imageIv: Uint8Array | null = live?.imageIv ?? null;
          let imageData: ArrayBuffer | null = live?.image ?? null;
          let imageType: string | null = live?.imageType ?? null;
          if (image !== undefined) {
            if (image === null) {
              imageIv = null;
              imageData = null;
              imageType = null;
            } else {
              const enc = await encrypt(key as CryptoKey, await image.arrayBuffer());
              imageIv = enc.iv;
              imageData = enc.data;
              imageType = image.type || 'image/jpeg';
            }
          }
          const createdAt = live ? live.createdAt : t;
          await backend.putRecord(
            userKey,
            { version: RECORD_VERSION, createdAt, expiresAt: createdAt + OPEN_JOURNEY_TTL_MS, iv, data, imageIv, image: imageData, imageType },
            newKey,
          );
          return 'saved';
        } catch {
          return 'failed'; // the previous record (if any) is untouched: the write was one transaction
        }
      });
    },

    async load(userId) {
      if (!userId) return null;
      const userKey = await userKeyFor(subtle, userId).catch(() => null);
      if (!userKey) return null;
      return serial(userKey, async () => {
        try {
          const record = await backend.getRecord(userKey);
          if (!record) return null;
          if (record.version !== RECORD_VERSION || record.expiresAt <= now()) {
            await backend.remove(userKey);
            return null;
          }
          const key = await backend.getKey(userKey);
          if (!key) {
            await backend.remove(userKey);
            return null;
          }
          let snapshot: OpenJourneySnapshot | null = null;
          let image: Blob | null = null;
          try {
            const plain = await subtle.decrypt({ name: 'AES-GCM', iv: record.iv as BufferSource }, key, record.data);
            snapshot = parseSnapshot(JSON.parse(new TextDecoder().decode(plain)));
            if (record.image && record.imageIv) {
              const img = await subtle.decrypt({ name: 'AES-GCM', iv: record.imageIv as BufferSource }, key, record.image);
              image = new Blob([img], { type: record.imageType ?? 'image/jpeg' });
            }
          } catch {
            snapshot = null;
          }
          if (!snapshot) {
            await backend.remove(userKey);
            return null;
          }
          return { snapshot, image, createdAt: record.createdAt, expiresAt: record.expiresAt };
        } catch {
          return null;
        }
      });
    },

    async discard(userId) {
      if (!userId) return;
      const userKey = await userKeyFor(subtle, userId).catch(() => null);
      if (!userKey) return;
      await serial(userKey, () => backend.remove(userKey)).catch(() => undefined);
    },

    async clearAll() {
      await backend.removeAll().catch(() => undefined);
      queues.clear();
    },

    async purgeExpired() {
      try {
        const t = now();
        for (const { userKey, expiresAt } of await backend.listExpiry()) {
          if (expiresAt <= t) await backend.remove(userKey);
        }
      } catch {
        /* nothing to do: an expired record is also refused by load() */
      }
    },
  };
}

/** The store when the browser cannot keep it: every call is a quiet no-op, and the journey works as before. */
export const unavailableOpenJourneyStore: OpenJourneyStore = {
  available: false,
  async save() {
    return 'failed';
  },
  async load() {
    return null;
  },
  async discard() {},
  async clearAll() {},
  async purgeExpired() {},
};

// ------------------------------------------------------------------------------------------------ IndexedDB

const KEYS = 'keys';
const JOURNEYS = 'journeys';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('aborted'));
  });
}

export function createIndexedDbBackend(idb: IDBFactory): OpenJourneyBackend {
  let dbPromise: Promise<IDBDatabase> | null = null;
  /** Opens the database. If it exists WITHOUT its two stores (opened elsewhere without a version, an interrupted creation), it is
      upgraded once to create them, so a damaged database never switches the feature off for the rest of the page's life. */
  const openAt = (version: number | undefined, retried: boolean): Promise<IDBDatabase> =>
    new Promise<IDBDatabase>((resolve, reject) => {
      // No version on the first try: a new database is created (with an upgrade that makes the stores), an existing one opens at
      // whatever version it has (a repaired one may be at 2 or more).
      const req = version === undefined ? idb.open(OPEN_JOURNEY_DB) : idb.open(OPEN_JOURNEY_DB, version);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(KEYS)) db.createObjectStore(KEYS);
        if (!db.objectStoreNames.contains(JOURNEYS)) db.createObjectStore(JOURNEYS);
      };
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(KEYS) || !db.objectStoreNames.contains(JOURNEYS)) {
          const next = db.version + 1;
          db.close();
          if (retried) reject(new Error('stores missing'));
          else openAt(next, true).then(resolve, reject);
          return;
        }
        // Another tab deleting the database (sign-out there) must not be blocked by this connection.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    });
  const open = (): Promise<IDBDatabase> => {
    if (!dbPromise) {
      dbPromise = openAt(undefined, false).catch((err) => {
        dbPromise = null;
        throw err;
      });
    }
    return dbPromise;
  };

  return {
    async getKey(userKey) {
      const db = await open();
      return ((await request(db.transaction(KEYS, 'readonly').objectStore(KEYS).get(userKey))) as CryptoKey | undefined) ?? null;
    },
    async putKey(userKey, key) {
      const db = await open();
      const tx = db.transaction(KEYS, 'readwrite');
      tx.objectStore(KEYS).put(key, userKey);
      await done(tx);
    },
    async getRecord(userKey) {
      const db = await open();
      return ((await request(db.transaction(JOURNEYS, 'readonly').objectStore(JOURNEYS).get(userKey))) as StoredRecord | undefined) ?? null;
    },
    async putRecord(userKey, record, key) {
      const db = await open();
      const tx = db.transaction([KEYS, JOURNEYS], 'readwrite');
      if (key) tx.objectStore(KEYS).put(key, userKey);
      tx.objectStore(JOURNEYS).put(record, userKey);
      await done(tx);
    },
    async remove(userKey) {
      const db = await open();
      const tx = db.transaction([KEYS, JOURNEYS], 'readwrite');
      tx.objectStore(KEYS).delete(userKey);
      tx.objectStore(JOURNEYS).delete(userKey);
      await done(tx);
    },
    async listExpiry() {
      const db = await open();
      const store = db.transaction(JOURNEYS, 'readonly').objectStore(JOURNEYS);
      const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
      return keys.map((k, i) => ({ userKey: String(k), expiresAt: Number((values[i] as StoredRecord | undefined)?.expiresAt ?? 0) }));
    },
    async removeAll() {
      if (dbPromise) {
        try {
          (await dbPromise).close();
        } catch {
          /* already closed */
        }
        dbPromise = null;
      }
      await new Promise<void>((resolve) => {
        const req = idb.deleteDatabase(OPEN_JOURNEY_DB);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve(); // completes once the other tabs close their connections (they do, on versionchange)
      });
    },
  };
}

// ------------------------------------------------------------------------------------------------ the browser's store

let browserStore: OpenJourneyStore | null = null;

/** The store for this browser, or the quiet no-op store when IndexedDB / WebCrypto are missing (or not in a secure context). */
export function getOpenJourneyStore(): OpenJourneyStore {
  if (browserStore) return browserStore;
  try {
    const g = globalThis as { indexedDB?: IDBFactory; crypto?: Crypto; isSecureContext?: boolean };
    if (!g.indexedDB || !g.crypto?.subtle || g.isSecureContext === false) {
      browserStore = unavailableOpenJourneyStore;
    } else {
      const c = g.crypto;
      browserStore = createOpenJourneyStore({ backend: createIndexedDbBackend(g.indexedDB), subtle: c.subtle, random: (b) => c.getRandomValues(b) });
    }
  } catch {
    browserStore = unavailableOpenJourneyStore;
  }
  return browserStore;
}

/**
 * Sign-out and account deletion: removes EVERY unfinished journey and key in this browser. Safe to call anywhere, any time: it never
 * throws, does nothing when the browser has no IndexedDB, and does not even open the database first.
 */
export async function clearAllOpenJourneys(): Promise<void> {
  try {
    const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (!idb) return;
    if (browserStore && browserStore.available) {
      await browserStore.clearAll();
      return;
    }
    await createIndexedDbBackend(idb).removeAll();
  } catch {
    /* storage blocked: there is nothing stored either */
  }
}
