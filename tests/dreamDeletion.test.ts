import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { deleteSavedDream, DreamDeletionError, type DreamDeletionDeps, type DeletedRow } from '../src/hero/dreamDeletion.ts';
import { dreamImagePathFor, ownedDreamImagePath } from '../src/hero/dreamImagePath.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DREAM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWN_PATH = `${USER}/${DREAM}.jpg`;

interface Harness {
  calls: string[];
  deps: DreamDeletionDeps;
}

function harness(opts: {
  userId?: string | null;
  deleted?: DeletedRow[];
  deleteThrows?: boolean;
  stillExists?: boolean;
  imageResults?: boolean[];
}): Harness {
  const calls: string[] = [];
  const imageResults = [...(opts.imageResults ?? [true])];
  const deps: DreamDeletionDeps = {
    async getAuthenticatedUserId() {
      calls.push('auth');
      return opts.userId === undefined ? USER : opts.userId;
    },
    async deleteOwnedRow(dreamId, ownerId) {
      calls.push(`deleteRow:${dreamId}:${ownerId}`);
      if (opts.deleteThrows) throw new Error('db down');
      return opts.deleted ?? [{ id: dreamId, imagePath: OWN_PATH }];
    },
    async ownedRowExists() {
      calls.push('exists');
      return opts.stillExists ?? false;
    },
    removeLocalCopy(id) {
      calls.push(`local:${id}`);
    },
    clearPendingSave(id) {
      calls.push(`pending:${id}`);
    },
    async removeImage(path) {
      calls.push(`image:${path}`);
      return imageResults.length > 1 ? (imageResults.shift() as boolean) : (imageResults[0] ?? true);
    },
    reportImageCleanupFailure() {
      calls.push('report');
    },
  };
  return { calls, deps };
}

test('the delete is constrained by the dream id AND the authenticated user id, and runs in the approved order', async () => {
  const h = harness({});
  const result = await deleteSavedDream(h.deps, DREAM);
  assert.deepEqual(h.calls, ['auth', `deleteRow:${DREAM}:${USER}`, `local:${DREAM}`, `pending:${DREAM}`, `image:${OWN_PATH}`]);
  assert.deepEqual(result, { imageCleanup: 'removed' });
});

test('signed out: nothing is touched', async () => {
  const h = harness({ userId: null });
  await assert.rejects(deleteSavedDream(h.deps, DREAM), (e) => e instanceof DreamDeletionError && e.code === 'not_authenticated');
  assert.deepEqual(h.calls, ['auth']);
});

test('database failure: no local removal, no Storage removal, the error propagates', async () => {
  const h = harness({ deleteThrows: true });
  await assert.rejects(deleteSavedDream(h.deps, DREAM), /db down/);
  assert.deepEqual(h.calls, ['auth', `deleteRow:${DREAM}:${USER}`]);
});

test('0 rows deleted and the dream still exists: not reported as success, nothing else touched', async () => {
  const h = harness({ deleted: [], stillExists: true });
  await assert.rejects(deleteSavedDream(h.deps, DREAM, OWN_PATH), (e) => e instanceof DreamDeletionError && e.code === 'not_deleted');
  assert.deepEqual(h.calls, ['auth', `deleteRow:${DREAM}:${USER}`, 'exists']);
});

test('already deleted (e.g. from a second tab): treated as done, local state cleaned, exact known image path removed', async () => {
  const h = harness({ deleted: [], stillExists: false });
  const result = await deleteSavedDream(h.deps, DREAM, OWN_PATH);
  assert.deepEqual(h.calls, ['auth', `deleteRow:${DREAM}:${USER}`, 'exists', `local:${DREAM}`, `pending:${DREAM}`, `image:${OWN_PATH}`]);
  assert.deepEqual(result, { imageCleanup: 'removed' });
});

test('more than one row deleted is never treated as fine', async () => {
  const h = harness({ deleted: [{ id: DREAM, imagePath: null }, { id: 'x', imagePath: null }] });
  await assert.rejects(deleteSavedDream(h.deps, DREAM), (e) => e instanceof DreamDeletionError && e.code === 'not_deleted');
  assert.equal(h.calls.some((c) => c.startsWith('local:') || c.startsWith('image:')), false);
});

test('a stored image path that is not exactly {user}/{dream}.jpg is never deleted', async () => {
  for (const path of [`${OTHER}/${DREAM}.jpg`, `${USER}/other-dream.jpg`, `${USER}/${DREAM}.png`, `../${OWN_PATH}`, `${OWN_PATH}/extra`, '']) {
    const h = harness({ deleted: [{ id: DREAM, imagePath: path }] });
    const result = await deleteSavedDream(h.deps, DREAM);
    assert.equal(h.calls.some((c) => c.startsWith('image:')), false, path);
    assert.deepEqual(result, { imageCleanup: 'none' });
  }
});

test('if the deleted row returns no path, the UI-known path is used only when it is exactly the owned path', async () => {
  const good = harness({ deleted: [{ id: DREAM, imagePath: null }] });
  assert.deepEqual(await deleteSavedDream(good.deps, DREAM, OWN_PATH), { imageCleanup: 'removed' });
  const bad = harness({ deleted: [{ id: DREAM, imagePath: null }] });
  assert.deepEqual(await deleteSavedDream(bad.deps, DREAM, `${OTHER}/${DREAM}.jpg`), { imageCleanup: 'none' });
  assert.equal(bad.calls.some((c) => c.startsWith('image:')), false);
});

test('a legacy base64 dream (no Storage path) needs no Storage deletion', async () => {
  const h = harness({ deleted: [{ id: DREAM, imagePath: null }] });
  const result = await deleteSavedDream(h.deps, DREAM);
  assert.equal(h.calls.some((c) => c.startsWith('image:')), false);
  assert.deepEqual(result, { imageCleanup: 'none' });
});

test('Storage cleanup is retried once; a second failure is reported but the deletion still succeeds', async () => {
  const flaky = harness({ imageResults: [false, true] });
  assert.deepEqual(await deleteSavedDream(flaky.deps, DREAM), { imageCleanup: 'removed' });
  assert.equal(flaky.calls.filter((c) => c.startsWith('image:')).length, 2);
  assert.equal(flaky.calls.includes('report'), false);

  const broken = harness({ imageResults: [false, false] });
  const result = await deleteSavedDream(broken.deps, DREAM);
  assert.deepEqual(result, { imageCleanup: 'failed' });
  assert.equal(broken.calls.filter((c) => c.startsWith('image:')).length, 2);
  assert.equal(broken.calls.filter((c) => c === 'report').length, 1);
  // The row was deleted and local state cleaned BEFORE the failed cleanup.
  assert.ok(broken.calls.indexOf(`local:${DREAM}`) < broken.calls.indexOf(`image:${OWN_PATH}`));
});

test('ownedDreamImagePath only accepts the exact conventional path of this user and dream', () => {
  assert.equal(dreamImagePathFor(USER, DREAM), OWN_PATH);
  assert.equal(ownedDreamImagePath(USER, DREAM, OWN_PATH), OWN_PATH);
  assert.equal(ownedDreamImagePath(OTHER, DREAM, OWN_PATH), null);
  assert.equal(ownedDreamImagePath(USER, 'x', OWN_PATH), null);
  assert.equal(ownedDreamImagePath(USER, DREAM, null), null);
  assert.equal(ownedDreamImagePath(USER, DREAM, undefined), null);
  assert.equal(ownedDreamImagePath('', DREAM, OWN_PATH), null);
});

// ---- Resurrection: the real local-state helpers, on an in-memory localStorage ----

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

const { getDreams, saveDream, deleteDream } = await import('../src/hero/dreamStorage.ts');
const { getPendingDreamSave, setPendingDreamSave, clearPendingDreamSaveIfId } = await import('../src/hero/pendingDreamSave.ts');

const fakeDream = (id: string) => ({ id, createdAt: '2026-09-21T10:00:00.000Z', sourceText: id, inputMode: 'text', dreamAnalysis: {}, dreamImageDataUrl: null, selectedElement: '', reflectionResponse: '', dreamReflection: {}, corrections: [], appLanguage: 'he' }) as never;

beforeEach(() => store.clear());

test('resurrection: a deleted dream is removed from the local archive by id only, and nothing else local changes', async () => {
  saveDream(fakeDream(DREAM));
  saveDream(fakeDream('keep-me'));
  store.set('dare.localDreamMigration.v1', JSON.stringify({ [USER]: 'imported' }));
  store.set('unrelated-key', 'unrelated');
  const real: DreamDeletionDeps = { ...harness({}).deps, removeLocalCopy: deleteDream, clearPendingSave: clearPendingDreamSaveIfId };
  await deleteSavedDream(real, DREAM);
  // What LocalDreamImportPrompt would (re)import for any account: the local archive.
  assert.deepEqual(getDreams().map((d) => d.id), ['keep-me']);
  assert.equal(store.get('unrelated-key'), 'unrelated');
  assert.equal(store.get('dare.localDreamMigration.v1'), JSON.stringify({ [USER]: 'imported' }));
});

test('resurrection: a pending save of the deleted dream is cleared, so it cannot be saved again', async () => {
  setPendingDreamSave(fakeDream(DREAM));
  assert.equal(getPendingDreamSave()?.id, DREAM);
  const real: DreamDeletionDeps = { ...harness({}).deps, removeLocalCopy: deleteDream, clearPendingSave: clearPendingDreamSaveIfId };
  await deleteSavedDream(real, DREAM);
  assert.equal(getPendingDreamSave(), null);
});

test('a pending save of a DIFFERENT dream is left alone', () => {
  setPendingDreamSave(fakeDream('someone-else'));
  clearPendingDreamSaveIfId(DREAM);
  assert.equal(getPendingDreamSave()?.id, 'someone-else');
});

test('nothing local is touched when the database delete fails (the dream still exists)', async () => {
  saveDream(fakeDream(DREAM));
  setPendingDreamSave(fakeDream(DREAM));
  const real: DreamDeletionDeps = { ...harness({ deleteThrows: true }).deps, removeLocalCopy: deleteDream, clearPendingSave: clearPendingDreamSaveIfId };
  await assert.rejects(deleteSavedDream(real, DREAM), /db down/);
  assert.equal(getDreams().length, 1);
  assert.equal(getPendingDreamSave()?.id, DREAM);
});
