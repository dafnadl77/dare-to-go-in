import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isValidConfirmation, performAccountDeletion, type AccountDeletionDeps } from '../server/accountDeletion.ts';
import { handleDeleteAccount, type DeleteAccountDeps } from '../server/routes/deleteAccount.ts';
import { purgeUserFolder, DREAM_IMAGES_BUCKET, type StorageLike } from '../server/accountDeletionStore.ts';
import { clearLocalAccountState, ACCOUNT_LOCAL_STORAGE_KEYS, ACCOUNT_SESSION_STORAGE_KEYS } from '../src/auth/localAccountState.ts';
import { getLegalDocument } from '../src/legal/legalContent.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ----------------------------------------------------------------- fakes ----

function fakeDeps(overrides: Partial<Record<keyof AccountDeletionDeps, boolean>> = {}) {
  const calls: string[] = [];
  const step = (name: keyof AccountDeletionDeps) => async (userId: string) => {
    calls.push(`${name}:${userId}`);
    return overrides[name] ?? true;
  };
  const deps: AccountDeletionDeps = {
    deleteDatabaseData: step('deleteDatabaseData'),
    purgeStorage: step('purgeStorage'),
    verifyDatabaseClean: step('verifyDatabaseClean'),
    deleteAuthUser: step('deleteAuthUser'),
    sweepStorage: step('sweepStorage'),
  };
  return { deps, calls };
}

const ME = '00000000-0000-4000-8000-00000000aaaa';
const OTHER = '00000000-0000-4000-8000-00000000bbbb';

function routeDeps(opts: { verified?: boolean; deletion?: ReturnType<typeof fakeDeps> } = {}) {
  const fake = opts.deletion ?? fakeDeps();
  const verifiedCalls: string[] = [];
  const deps: DeleteAccountDeps = {
    verifyBearer: async (header) => {
      verifiedCalls.push(header);
      return opts.verified === false
        ? { ok: false, status: 401, reason: 'not_authenticated', message: 'invalid' }
        : { ok: true, userId: ME };
    },
    deletion: fake.deps,
  };
  return { deps, fake, verifiedCalls };
}

// -------------------------------------------------- typed confirmation ----

test('only the exact confirmation words are valid (DELETE / מחיקה); anything else is not', () => {
  assert.equal(isValidConfirmation('DELETE'), true);
  assert.equal(isValidConfirmation('מחיקה'), true);
  for (const bad of ['delete', 'Delete', 'DELETE ', ' DELETE', 'DELET', 'מחיקה ', 'מחק', '', null, undefined, 1, {}, ['DELETE']]) {
    assert.equal(isValidConfirmation(bad), false, String(bad));
  }
});

// ---------------------------------------------------------- ordering ----

test('the ORDER is database, storage, verification, Auth user LAST, then the sweep', async () => {
  const { deps, calls } = fakeDeps();
  const result = await performAccountDeletion(ME, deps);
  assert.deepEqual(result, { ok: true, storageSweepClean: true });
  assert.deepEqual(calls, [`deleteDatabaseData:${ME}`, `purgeStorage:${ME}`, `verifyDatabaseClean:${ME}`, `deleteAuthUser:${ME}`, `sweepStorage:${ME}`]);
});

test('a failure at ANY stage before Auth stops there: the Auth user is never deleted and success is never reported', async () => {
  const cases: [keyof AccountDeletionDeps, string, string[]][] = [
    ['deleteDatabaseData', 'database', ['deleteDatabaseData']],
    ['purgeStorage', 'storage', ['deleteDatabaseData', 'purgeStorage']],
    ['verifyDatabaseClean', 'verification', ['deleteDatabaseData', 'purgeStorage', 'verifyDatabaseClean']],
  ];
  for (const [failing, stage, expected] of cases) {
    const { deps, calls } = fakeDeps({ [failing]: false });
    const result = await performAccountDeletion(ME, deps);
    assert.deepEqual(result, { ok: false, stage });
    assert.deepEqual(
      calls.map((c) => c.split(':')[0]),
      expected,
      `${failing}: nothing after the failure may run`,
    );
    assert.ok(!calls.some((c) => c.startsWith('deleteAuthUser')));
  }
});

test('if the Auth deletion itself fails the result is incomplete (and the sweep does not run)', async () => {
  const { deps, calls } = fakeDeps({ deleteAuthUser: false });
  assert.deepEqual(await performAccountDeletion(ME, deps), { ok: false, stage: 'auth' });
  assert.ok(!calls.some((c) => c.startsWith('sweepStorage')));
});

test('the final sweep is best-effort: a failing or throwing sweep never turns a completed deletion into a failure', async () => {
  const failing = fakeDeps({ sweepStorage: false });
  assert.deepEqual(await performAccountDeletion(ME, failing.deps), { ok: true, storageSweepClean: false });
  const throwing = fakeDeps();
  throwing.deps.sweepStorage = async () => {
    throw new Error('boom');
  };
  assert.deepEqual(await performAccountDeletion(ME, throwing.deps), { ok: true, storageSweepClean: false });
});

test('replay: repeating a deletion (idempotent steps) is harmless, and a partial failure can be retried to completion', async () => {
  let storageHealthy = false;
  const calls: string[] = [];
  const deps: AccountDeletionDeps = {
    deleteDatabaseData: async () => (calls.push('db'), true),
    purgeStorage: async () => (calls.push('storage'), storageHealthy),
    verifyDatabaseClean: async () => (calls.push('verify'), true),
    deleteAuthUser: async () => (calls.push('auth'), true),
    sweepStorage: async () => true,
  };
  assert.equal((await performAccountDeletion(ME, deps)).ok, false); // storage flaky: stops, Auth still exists
  assert.ok(!calls.includes('auth'));
  storageHealthy = true;
  assert.equal((await performAccountDeletion(ME, deps)).ok, true); // retry finishes the job
  assert.equal(calls.filter((c) => c === 'auth').length, 1);
});

// --------------------------------------------------------- the route ----

test('unauthenticated deletion is rejected (401) and touches nothing', async () => {
  const { deps, fake } = routeDeps();
  const res = await handleDeleteAccount({ confirmation: 'DELETE' }, {}, deps);
  assert.equal(res.status, 401);
  assert.deepEqual(fake.calls, []);
});

test('an invalid or expired token is rejected and touches nothing', async () => {
  const { deps, fake } = routeDeps({ verified: false });
  const res = await handleDeleteAccount({ confirmation: 'DELETE' }, { authorization: 'Bearer nope' }, deps);
  assert.equal(res.status, 401);
  assert.deepEqual(fake.calls, []);
});

test('a missing or incorrect typed confirmation cannot trigger deletion, even with a valid token', async () => {
  for (const body of [undefined, null, {}, { confirmation: '' }, { confirmation: 'delete' }, { confirmation: 'DELETE ' }, { confirmation: 'yes' }, { confirmation: true }, 'DELETE']) {
    const { deps, fake } = routeDeps();
    const res = await handleDeleteAccount(body, { authorization: 'Bearer ok' }, deps);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.deepEqual(res.body, { reason: 'confirmation_required', message: 'The confirmation text was not entered exactly.' });
    assert.deepEqual(fake.calls, [], JSON.stringify(body));
  }
});

test('a forged client-supplied user id / owner id / email can NEVER target another account: only the verified token holder is deleted', async () => {
  const { deps, fake } = routeDeps();
  const res = await handleDeleteAccount(
    { confirmation: 'DELETE', userId: OTHER, user_id: OTHER, owner_id: OTHER, id: OTHER, email: 'victim@example.com', sub: OTHER },
    { authorization: 'Bearer ok', cookie: `dare_trial=${OTHER}` },
    deps,
  );
  assert.equal(res.status, 200);
  assert.ok(fake.calls.length > 0);
  for (const call of fake.calls) assert.ok(call.endsWith(`:${ME}`), call);
  assert.ok(!fake.calls.some((c) => c.includes(OTHER)));
});

test('success answers 200 { deleted: true } only after the full ordered deletion', async () => {
  const { deps, fake } = routeDeps();
  const res = await handleDeleteAccount({ confirmation: 'מחיקה' }, { authorization: 'Bearer ok' }, deps);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { deleted: true });
  assert.equal(fake.calls[3].split(':')[0], 'deleteAuthUser');
});

test('any partial failure answers 502 deletion_incomplete with no internal detail, never success', async () => {
  for (const failing of ['deleteDatabaseData', 'purgeStorage', 'verifyDatabaseClean', 'deleteAuthUser'] as const) {
    const { deps } = routeDeps({ deletion: fakeDeps({ [failing]: false }) });
    const res = await handleDeleteAccount({ confirmation: 'DELETE' }, { authorization: 'Bearer ok' }, deps);
    assert.equal(res.status, 502);
    assert.equal((res.body as { reason: string }).reason, 'deletion_incomplete');
    assert.ok(!('deleted' in (res.body as object)));
    assert.ok(!JSON.stringify(res.body).includes(failing));
  }
});

test('second delete after success is harmless: the deleted user has no valid token any more (401), nothing runs', async () => {
  const { deps, fake } = routeDeps({ verified: false });
  const res = await handleDeleteAccount({ confirmation: 'DELETE' }, { authorization: 'Bearer stale-token-of-deleted-user' }, deps);
  assert.equal(res.status, 401);
  assert.deepEqual(fake.calls, []);
});

test('route source: the account comes ONLY from the verified token; the body is read for the confirmation and nothing else', () => {
  const route = read('server/routes/deleteAccount.ts');
  assert.match(route, /performAccountDeletion\(verified\.userId, deps\.deletion\)/);
  assert.ok(!/rawBody\s*[.)]?\s*(as\s*\{[^}]*(userId|user_id|owner_id)|\.(userId|user_id|owner_id))/.test(route));
  const bodyReads = route.match(/\(rawBody as \{[^}]*\}\)/g) ?? [];
  assert.deepEqual(bodyReads, ['(rawBody as { confirmation?: unknown })']);
  assert.ok(!/resolveCallerIdentity|readTrialIdFromCookieHeader|cookie/i.test(route.replace(/RequestHeaders/g, '')), 'a trial cookie can never select the account');
});

// ------------------------------------------------- storage purge (real logic) ----

function fakeStorage(files: Record<string, string[]>, opts: { removeError?: boolean; listError?: boolean; ghost?: boolean } = {}) {
  // files: folder path -> entries; an entry ending with '/' is a sub-folder placeholder
  const store = new Map(Object.entries(files).map(([k, v]) => [k, [...v]]));
  const removed: string[] = [];
  const client: StorageLike = {
    storage: {
      from(bucket: string) {
        assert.equal(bucket, DREAM_IMAGES_BUCKET);
        return {
          async list(folder, { limit, offset }) {
            if (opts.listError) return { data: null, error: new Error('list failed') };
            const entries = store.get(folder) ?? [];
            const page = entries.slice(offset, offset + limit);
            return { data: page.map((n) => (n.endsWith('/') ? { id: null, name: n.slice(0, -1) } : { id: `id-${n}`, name: n })), error: null };
          },
          async remove(paths) {
            if (opts.removeError) return { error: new Error('remove failed') };
            for (const p of paths) {
              removed.push(p);
              if (opts.ghost) continue; // reports success but the object survives
              const idx = p.lastIndexOf('/');
              const folder = p.slice(0, idx);
              store.set(folder, (store.get(folder) ?? []).filter((n) => n !== p.slice(idx + 1)));
            }
            return { error: null };
          },
        };
      },
    },
  };
  return { client, removed, store };
}

test('storage purge removes every object in ONLY the user\'s folder, across pages and sub-folders, and verifies it is empty', async () => {
  const many = Array.from({ length: 250 }, (_, i) => `img${i}.jpg`);
  const fake = fakeStorage({ [ME]: [...many, 'nested/'], [`${ME}/nested`]: ['deep.jpg'], [OTHER]: ['keep.jpg'] });
  assert.equal(await purgeUserFolder(fake.client, ME), true);
  assert.equal(fake.removed.length, 251);
  assert.ok(fake.removed.includes(`${ME}/nested/deep.jpg`));
  assert.ok(fake.removed.every((p) => p.startsWith(`${ME}/`)));
  assert.deepEqual(fake.store.get(OTHER), ['keep.jpg'], 'another user\'s images are untouched');
});

test('storage purge on an already-empty folder is a harmless success (replay)', async () => {
  assert.equal(await purgeUserFolder(fakeStorage({ [ME]: [] }).client, ME), true);
});

test('storage purge FAILS when a remove errors, when listing errors, or when an object survives the delete call', async () => {
  assert.equal(await purgeUserFolder(fakeStorage({ [ME]: ['a.jpg'] }, { removeError: true }).client, ME), false);
  assert.equal(await purgeUserFolder(fakeStorage({ [ME]: ['a.jpg'] }, { listError: true }).client, ME), false);
  assert.equal(await purgeUserFolder(fakeStorage({ [ME]: ['a.jpg'] }, { ghost: true }).client, ME), false, 'verification catches a delete that did not happen');
});

// ------------------------------------------------ source-level guarantees ----

test('the Auth user is deleted in exactly one place, only via the ordered flow, and never inside SQL', () => {
  const store = read('server/accountDeletionStore.ts');
  assert.equal((store.match(/auth\.admin\.deleteUser/g) ?? []).length, 1);
  const orchestrator = read('server/accountDeletion.ts');
  const body = orchestrator.slice(orchestrator.indexOf('export async function performAccountDeletion'));
  assert.ok(body.indexOf('deleteDatabaseData') < body.indexOf('purgeStorage'));
  assert.ok(body.indexOf('purgeStorage') < body.indexOf('verifyDatabaseClean'));
  assert.ok(body.indexOf('verifyDatabaseClean') < body.indexOf('deleteAuthUser'));
  assert.ok(body.indexOf('deleteAuthUser') < body.indexOf('sweepStorage'));
  assert.ok(!/delete from auth\.users/i.test(read('supabase/migrations/20260924_account_deletion.sql')));
  assert.ok(!/deleteUser/.test(read('src/auth/deleteAccount.ts')), 'the client can never delete an Auth user');
});

test('migration: trial lifetime protection, ledger and credits handling, privileges', () => {
  const sql = read('supabase/migrations/20260924_account_deletion.sql');
  // consume BEFORE unlink, in the same statement
  assert.match(sql, /set free_dream_completed_at = coalesce\(free_dream_completed_at, now\(\)\),\s*converted_user_id = null,\s*claimed_at = null\s*where converted_user_id = p_user/);
  // payment records are anonymized, everything else in the ledger deleted, balance deleted
  assert.match(sql, /delete from public\.credit_ledger where owner_id = p_user and external_ref is null/);
  assert.match(sql, /update public\.credit_ledger set owner_id = null where owner_id = p_user/);
  assert.match(sql, /delete from public\.dream_credits where owner_id = p_user/);
  assert.match(sql, /foreign key \(owner_id\) references auth\.users \(id\) on delete set null/);
  // every user-owned table is covered
  for (const table of ['pattern_reflections', 'dream_attempts', 'dreams']) assert.match(sql, new RegExp(`delete from public\\.${table} where owner_id = p_user`));
  // service-role only
  for (const fn of ['delete_account_data(uuid)', 'account_data_remaining(uuid)']) {
    assert.ok(sql.includes(`revoke all on function public.${fn} from public, anon, authenticated`));
    assert.ok(sql.includes(`grant execute on function public.${fn} to service_role`));
  }
  assert.equal((sql.match(/security definer/g) ?? []).length, 2);
  // the earlier credit migration's idempotency indexes are not touched
  assert.ok(!/credit_ledger_external_ref_uidx/.test(sql));
  assert.ok(!/drop index|drop table/i.test(sql));
});

// ------------------------------------------------------------- the client ----

test('client cleanup clears pending-save, local dreams, migration marker and cached title translations; tolerates blocked storage', () => {
  const removed: string[] = [];
  const store = { removeItem: (k: string) => void removed.push(k) };
  clearLocalAccountState(store, store);
  assert.deepEqual(removed.sort(), [...ACCOUNT_LOCAL_STORAGE_KEYS, ...ACCOUNT_SESSION_STORAGE_KEYS].sort());
  assert.ok(removed.includes('dare.pendingDreamSave.v1'));
  const blocked = {
    removeItem: () => {
      throw new Error('SecurityError');
    },
  };
  assert.doesNotThrow(() => clearLocalAccountState(blocked, blocked));
});

test('client cleanup keys match the keys the app actually writes', () => {
  assert.ok(read('src/hero/pendingDreamSave.ts').includes("'dare.pendingDreamSave.v1'"));
  assert.ok(read('src/hero/dreamStorage.ts').includes("'dare.savedDreams.v1'"));
  assert.ok(read('src/hero/dreamStorage.ts').includes("'dare.localDreamMigration.v1'"));
  assert.ok(read('src/archive/dreamTitleTranslation.ts').includes("'dare.archiveTranslations.v2'"));
});

test('client: the request carries only the typed confirmation; local sign-out + reload to the public home happen only after server success', () => {
  const client = read('src/auth/deleteAccount.ts');
  assert.match(client, /body: JSON\.stringify\(\{ confirmation \}\)/);
  assert.ok(!/user_?id|owner_?id|email/i.test(client.slice(client.indexOf('body: JSON.stringify'), client.indexOf('body: JSON.stringify') + 60)));
  assert.match(client, /signOut\(\{ scope: 'local' \}\)/);
  assert.match(client, /window\.location\.replace\('\/'\)/);
  const archive = read('src/archive/DreamArchive.tsx');
  const handler = archive.slice(archive.indexOf('const handleConfirmAccountDeletion'), archive.indexOf('const handleRequestDelete'));
  assert.ok(handler.indexOf('requestAccountDeletion(confirmation)') < handler.indexOf('finishAccountDeletionLocally()'));
  assert.match(handler, /if \(!result\.ok\) \{[\s\S]*?return;\s*\}/);
  // a failure never clears local state
  assert.ok(handler.indexOf('return;') < handler.indexOf('finishAccountDeletionLocally()'));
});

test('dialog: real modal, exact typed confirmation, final button really disabled until it matches, no browser confirm()', () => {
  const dialog = read('src/archive/DeleteAccountDialog.tsx');
  assert.match(dialog, /role="alertdialog"/);
  assert.match(dialog, /const matches = typed === word/);
  assert.match(dialog, /disabled=\{!matches \|\| busy\}/);
  assert.match(dialog, /if \(busy \|\| typed !== word\) return;/);
  assert.match(dialog, /DELETE_ACCOUNT_CONFIRMATION\[language === 'he' \? 'he' : 'en'\]/);
  for (const f of ['src/archive/DeleteAccountDialog.tsx', 'src/archive/DreamArchive.tsx', 'src/auth/deleteAccount.ts']) {
    assert.ok(!/\b(window\.)?confirm\(/.test(read(f)), f);
  }
  const words = read('src/auth/deleteAccount.ts');
  assert.match(words, /\{ en: 'DELETE', he: 'מחיקה' \}/);
});

test('Settings has a separated destructive section near the bottom, after Sign out, in both languages', () => {
  const archive = read('src/archive/DreamArchive.tsx');
  const settings = archive.slice(archive.indexOf("activeSection === 'settings'"));
  assert.ok(settings.indexOf("t('auth.signOut')") < settings.indexOf('ar-settings-danger'));
  const tr = read('src/i18n/translations.ts');
  for (const k of ['settingsDeleteHeading', 'settingsDeleteBody', 'settingsDeleteButton', 'deleteAccountTitle', 'deleteAccountBody', 'deleteAccountTypePrompt', 'deleteAccountInputLabel', 'deleteAccountConfirm', 'deleteAccountFailed']) {
    assert.equal(tr.split(`${k}:`).length - 1, 3, k); // interface + en + he
  }
});

// -------------------------------------------------------------- the legal ----

test('legal: the old contact email is gone everywhere; every document uses daretogoin@gmail.com', () => {
  assert.ok(!read('src/legal/legalContent.ts').includes('dafnadl77'));
  for (const lang of ['en', 'he'] as const) {
    for (const key of ['privacy', 'accessibility', 'terms'] as const) {
      const doc = getLegalDocument(lang, key);
      const text = JSON.stringify(doc);
      assert.ok(text.includes('daretogoin@gmail.com'), `${lang}/${key}`);
    }
  }
});

test('privacy policy (EN + HE) explains self-service permanent deletion honestly, incl. the kept non-personal trial record', () => {
  const en = JSON.stringify(getLegalDocument('en', 'privacy'));
  const he = JSON.stringify(getLegalDocument('he', 'privacy'));
  assert.match(en, /permanently delete your account yourself: in Settings/);
  assert.match(en, /free first dream has already been used from a given browser is kept without any link to you/);
  assert.ok(!/does not yet have a fully self-service deletion/.test(en));
  assert.match(he, /למחוק את החשבון בעצמכם לצמיתות: בהגדרות/);
  assert.match(he, /ללא כל קישור אליכם/);
  assert.ok(!/עדיין אין ל-DARE כלי מחיקה/.test(he));
});
