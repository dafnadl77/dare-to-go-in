import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import {
  assertNoSecrets,
  createOpenJourneyStore,
  unavailableOpenJourneyStore,
  OPEN_JOURNEY_TTL_MS,
  type OpenJourneyBackend,
  type OpenJourneySnapshot,
  type StoredRecord,
} from '../src/hero/openJourneyStore.ts';
import { answerMoment, beginMoment, createExploration } from '../src/hero/exploration.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const random = (b: Uint8Array<ArrayBuffer>) => webcrypto.getRandomValues(b);
const DAY = 24 * 60 * 60 * 1000;

/** An in-memory stand-in for IndexedDB with the same guarantee the real one gives: putRecord is all-or-nothing. */
function memoryBackend() {
  const keys = new Map<string, CryptoKey>();
  const records = new Map<string, StoredRecord>();
  const control = { failNextPut: false, writes: 0 };
  const backend: OpenJourneyBackend = {
    async getKey(k) {
      return keys.get(k) ?? null;
    },
    async putKey(k, key) {
      keys.set(k, key);
    },
    async getRecord(k) {
      return records.get(k) ?? null;
    },
    async putRecord(k, record, key) {
      if (control.failNextPut) {
        control.failNextPut = false;
        throw new Error('QuotaExceededError'); // nothing is written: one transaction
      }
      if (key) keys.set(k, key);
      records.set(k, record);
      control.writes += 1;
    },
    async remove(k) {
      keys.delete(k);
      records.delete(k);
    },
    async listExpiry() {
      return [...records.entries()].map(([userKey, r]) => ({ userKey, expiresAt: r.expiresAt }));
    },
    async removeAll() {
      keys.clear();
      records.clear();
    },
  };
  return { backend, keys, records, control };
}

function snapshot(answer = 'the sea was calm'): OpenJourneySnapshot {
  let e = createExploration('attempt-1', [{ label: 'the sea' }, { label: 'the door' }]);
  e = beginMoment(e, 'm1', 'What comes up?', 'pregenerated');
  e = answerMoment(e, 'm1', answer);
  return {
    attemptId: 'attempt-1',
    language: 'he',
    inputMode: 'text',
    analysis: { sourceText: 'I was by a calm sea.' },
    corrections: [],
    emotions: [],
    exploration: e,
    step: 'insight',
    draft: { momentId: 'm2', field: 'answer', text: 'half typed' },
  };
}

function setup(start = Date.UTC(2026, 9, 20)) {
  const mem = memoryBackend();
  const clock = { t: start };
  const store = createOpenJourneyStore({ backend: mem.backend, subtle, random, now: () => clock.t });
  return { store, mem, clock };
}

// ------------------------------------------------------------------------------------------------ save, refresh, return

test('save then load (as after a refresh): the same answers, the typed draft and the one picture come back', async () => {
  const { store } = setup();
  const picture = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/jpeg' });
  assert.equal(await store.save('user-A', snapshot(), picture), 'saved');
  const loaded = await store.load('user-A');
  assert.ok(loaded);
  assert.equal(loaded!.snapshot.exploration.explored.m1.answer, 'the sea was calm');
  assert.deepEqual(loaded!.snapshot.draft, { momentId: 'm2', field: 'answer', text: 'half typed' });
  assert.deepEqual([...new Uint8Array(await loaded!.image!.arrayBuffer())], [1, 2, 3, 4, 5]);
  assert.equal(loaded!.image!.type, 'image/jpeg');
});

test('later saves keep the picture without re-sending it, and the 7 days count from the START of the journey', async () => {
  const { store, clock } = setup();
  await store.save('user-A', snapshot('first'), new Blob([new Uint8Array([9])]));
  const first = await store.load('user-A');
  clock.t += 3 * DAY;
  await store.save('user-A', snapshot('second')); // no picture passed
  const second = await store.load('user-A');
  assert.equal(second!.snapshot.exploration.explored.m1.answer, 'second');
  assert.deepEqual([...new Uint8Array(await second!.image!.arrayBuffer())], [9]);
  assert.equal(second!.createdAt, first!.createdAt);
  assert.equal(second!.expiresAt, first!.createdAt + OPEN_JOURNEY_TTL_MS);
});

test('what is stored is ciphertext: the dream words and the answers never appear in clear, and the key is not extractable', async () => {
  const { store, mem } = setup();
  await store.save('user-A', snapshot('a very private answer'), new Blob([new TextEncoder().encode('PICTURE-BYTES')]));
  const [userKey, record] = [...mem.records.entries()][0];
  assert.match(userKey, /^[0-9a-f]{64}$/, 'the record key is a hash, never the account id');
  assert.ok(!userKey.includes('user-A'));
  const clear = new TextDecoder().decode(new Uint8Array(record.data)) + new TextDecoder().decode(new Uint8Array(record.image!));
  for (const secret of ['a very private answer', 'calm sea', 'half typed', 'PICTURE-BYTES']) assert.ok(!clear.includes(secret), secret);
  assert.deepEqual(Object.keys(record).sort(), ['createdAt', 'data', 'expiresAt', 'image', 'imageIv', 'imageType', 'iv', 'version']);
  const key = mem.keys.get(userKey)!;
  assert.equal(key.extractable, false);
  await assert.rejects(subtle.exportKey('raw', key));
});

test('a NEW record never starts without the picture: after expiry or deletion, a save without it asks for it and writes nothing', async () => {
  const { store, mem, clock } = setup();
  assert.equal(await store.save('user-A', snapshot()), 'needs-image', 'first save, no picture passed');
  assert.equal(mem.records.size, 0);
  assert.equal(await store.save('user-A', snapshot(), new Blob([new Uint8Array([7])])), 'saved');
  assert.equal(await store.save('user-A', snapshot('later')), 'saved', 'a live record keeps its picture');
  clock.t += 8 * DAY;
  assert.equal(await store.save('user-A', snapshot('after expiry')), 'needs-image');
  await store.discard('user-A');
  assert.equal(await store.save('user-A', snapshot('after discard')), 'needs-image');
  assert.equal(await store.save('user-A', snapshot('again'), new Blob([new Uint8Array([8])])), 'saved');
  const loaded = await store.load('user-A');
  assert.deepEqual([...new Uint8Array(await loaded!.image!.arrayBuffer())], [8]);
});

// ------------------------------------------------------------------------------------------------ accounts in the same browser

test('another account in the same browser never sees, opens or replaces this journey', async () => {
  const { store } = setup();
  await store.save('user-A', snapshot('A only'), null);
  assert.equal(await store.load('user-B'), null);
  await store.save('user-B', snapshot('B only'), null);
  assert.equal((await store.load('user-A'))!.snapshot.exploration.explored.m1.answer, 'A only');
  assert.equal((await store.load('user-B'))!.snapshot.exploration.explored.m1.answer, 'B only');
  await store.discard('user-B');
  assert.ok(await store.load('user-A'), 'discarding B leaves A untouched');
});

test('a record copied under another account cannot be read (each journey has its own key)', async () => {
  const { store, mem } = setup();
  await store.save('user-A', snapshot(), null);
  await store.save('user-B', snapshot('B'), null);
  const keysByUser = [...mem.records.keys()];
  // swap A's ciphertext into B's slot
  mem.records.set(keysByUser[1], mem.records.get(keysByUser[0])!);
  assert.equal(await store.load('user-B'), null, 'undecryptable with B\'s key');
  assert.equal(mem.records.has(keysByUser[1]), false, 'and the unreadable record is deleted');
});

// ------------------------------------------------------------------------------------------------ deletion

test('expiry: after 7 days the journey is gone, deleted without being decrypted', async () => {
  const { store, mem, clock } = setup();
  await store.save('user-A', snapshot(), null);
  clock.t += 7 * DAY - 1;
  assert.ok(await store.load('user-A'));
  clock.t += 2;
  assert.equal(await store.load('user-A'), null);
  assert.equal(mem.records.size, 0);
  assert.equal(mem.keys.size, 0);
});

test('purgeExpired removes only expired journeys', async () => {
  const { store, mem, clock } = setup();
  await store.save('user-A', snapshot(), null);
  clock.t += 5 * DAY;
  await store.save('user-B', snapshot(), null);
  clock.t += 3 * DAY; // A is 8 days old, B 3 days
  await store.purgeExpired();
  assert.equal(mem.records.size, 1);
  assert.ok(await store.load('user-B'));
});

test('discard (save, let go, "delete" at the prompt) and clearAll (sign-out, account deletion) remove records AND keys', async () => {
  const { store, mem } = setup();
  await store.save('user-A', snapshot(), null);
  await store.save('user-B', snapshot(), null);
  await store.discard('user-A');
  assert.equal(await store.load('user-A'), null);
  assert.equal(mem.keys.size, 1);
  await store.clearAll();
  assert.equal(mem.records.size, 0);
  assert.equal(mem.keys.size, 0);
});

// ------------------------------------------------------------------------------------------------ failures are never the dreamer's problem

test('a write that fails midway leaves the previous journey intact and reports false (no throw)', async () => {
  const { store, mem } = setup();
  await store.save('user-A', snapshot('kept'), null);
  mem.control.failNextPut = true;
  assert.equal(await store.save('user-A', snapshot('lost write')), 'failed');
  assert.equal((await store.load('user-A'))!.snapshot.exploration.explored.m1.answer, 'kept');
});

test('writes are applied in order: a slow older save can never overwrite a newer one', async () => {
  const { store } = setup();
  const saves = [store.save('user-A', snapshot('1'), null), store.save('user-A', snapshot('2')), store.save('user-A', snapshot('3'))];
  await Promise.all(saves);
  assert.equal((await store.load('user-A'))!.snapshot.exploration.explored.m1.answer, '3');
});

test('storage unavailable (private browsing, blocked, old browser): every call is a quiet no-op', async () => {
  assert.equal(unavailableOpenJourneyStore.available, false);
  assert.equal(await unavailableOpenJourneyStore.save('u', snapshot()), 'failed');
  assert.equal(await unavailableOpenJourneyStore.load('u'), null);
  await unavailableOpenJourneyStore.discard('u');
  await unavailableOpenJourneyStore.clearAll();
  // a backend that throws on everything never surfaces an error either
  const broken: OpenJourneyBackend = new Proxy({} as OpenJourneyBackend, { get: () => async () => { throw new Error('InvalidStateError'); } });
  const store = createOpenJourneyStore({ backend: broken, subtle, random });
  assert.equal(await store.save('u', snapshot(), null), 'failed');
  assert.equal(await store.load('u'), null);
  await store.discard('u');
  await store.clearAll();
  await store.purgeExpired();
});

test('a corrupt or foreign record is deleted, never shown', async () => {
  const { store, mem } = setup();
  await store.save('user-A', snapshot(), null);
  const [k, r] = [...mem.records.entries()][0];
  const bytes = new Uint8Array(r.data.slice(0));
  bytes[0] ^= 0xff;
  mem.records.set(k, { ...r, data: bytes.buffer });
  assert.equal(await store.load('user-A'), null);
  assert.equal(mem.records.size, 0);
});

// ------------------------------------------------------------------------------------------------ no tokens, secrets or payment details

test('a snapshot carrying a token, secret, e-mail or card field is refused, and nothing is written', async () => {
  const { store, mem } = setup();
  for (const extra of [
    { access_token: 'x' },
    { refreshToken: 'x' },
    { session: {} },
    { apiKey: 'x' },
    { password: 'x' },
    { email: 'a@b.c' },
    { card: '4111' },
    { note: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc' },
    { note: 'Bearer abcdef' },
  ]) {
    assert.equal(await store.save('user-A', { ...snapshot(), analysis: extra }, null), 'failed', JSON.stringify(extra));
  }
  assert.equal(mem.control.writes, 0);
  assert.doesNotThrow(() => assertNoSecrets(snapshot()), 'a real journey snapshot passes');
});

test('the snapshot type itself has no field for tokens, sessions, e-mail or payment', () => {
  const src = read('src/hero/openJourneyStore.ts');
  const iface = src.slice(src.indexOf('export interface OpenJourneySnapshot'), src.indexOf('export interface LoadedOpenJourney'));
  assert.doesNotMatch(iface, /token|session|email|password|card|payment|secret/i);
});

// ------------------------------------------------------------------------------------------------ wired to sign-out and account deletion

test('sign-out (any kind) and account deletion delete every unfinished journey in the browser', () => {
  const auth = read('src/auth/AuthContext.tsx');
  assert.match(auth, /event === 'SIGNED_OUT'\)\s*\{\s*void clearAllOpenJourneys\(\);/);
  assert.match(auth, /await clearAllOpenJourneys\(\);\s*await supabase\.auth\.signOut\(\{ scope: 'local' \}\);/);
  const del = read('src/auth/deleteAccount.ts');
  assert.match(del, /clearLocalAccountState\(\);\s*\/\/[^\n]*\n\s*await clearAllOpenJourneys\(\);/);
});
