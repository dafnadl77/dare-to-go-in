import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performAccountDeletion, STORAGE_RESIDUE_EVENT, DELETION_INCOMPLETE_EVENT, type AccountDeletionDeps } from '../server/accountDeletion.ts';
import { handleDeleteAccount } from '../server/routes/deleteAccount.ts';

const ME = '00000000-0000-4000-8000-00000000cccc';

function deps(over: Partial<Record<keyof AccountDeletionDeps, boolean | 'throw'>> = {}): AccountDeletionDeps {
  const step = (k: keyof AccountDeletionDeps) => async () => {
    if (over[k] === 'throw') throw new Error('boom: SENSITIVE-INTERNAL-DETAIL');
    return over[k] ?? true;
  };
  return {
    deleteDatabaseData: step('deleteDatabaseData'),
    purgeStorage: step('purgeStorage'),
    verifyDatabaseClean: step('verifyDatabaseClean'),
    deleteAuthUser: step('deleteAuthUser'),
    sweepStorage: step('sweepStorage'),
  };
}

test('storage residue after Auth deletion leaves ONE actionable server-side log line with only safe identifiers', async () => {
  const lines: string[] = [];
  const result = await performAccountDeletion(ME, deps({ sweepStorage: false }), (l) => lines.push(l));
  assert.deepEqual(result, { ok: true, storageSweepClean: false });
  assert.equal(lines.length, 1);
  assert.ok(lines[0].startsWith(STORAGE_RESIDUE_EVENT));
  assert.ok(lines[0].includes(`user_id=${ME}`));
  assert.ok(lines[0].includes('bucket=dream-images'));
  assert.ok(lines[0].includes(`folder=${ME}/`));
  assert.ok(lines[0].includes('action=list_and_remove_all_objects_under_folder'));
  // nothing but the opaque id, bucket, folder and the action: no email, no content, no error text
  assert.ok(!/@|dream text|sourceText|email|token|secret|SENSITIVE/i.test(lines[0]));
});

test('a sweep that THROWS also leaves the same signal (and never fails the deletion)', async () => {
  const lines: string[] = [];
  const result = await performAccountDeletion(ME, deps({ sweepStorage: 'throw' }), (l) => lines.push(l));
  assert.deepEqual(result, { ok: true, storageSweepClean: false });
  assert.equal(lines.length, 1);
  assert.ok(lines[0].startsWith(STORAGE_RESIDUE_EVENT));
  assert.ok(!lines[0].includes('SENSITIVE'));
});

test('a clean deletion logs nothing', async () => {
  const lines: string[] = [];
  await performAccountDeletion(ME, deps(), (l) => lines.push(l));
  assert.deepEqual(lines, []);
});

test('an incomplete deletion logs the stage and the id (retryable), and never the Auth-deleted state', async () => {
  for (const [failing, stage] of [
    ['deleteDatabaseData', 'database'],
    ['purgeStorage', 'storage'],
    ['verifyDatabaseClean', 'verification'],
    ['deleteAuthUser', 'auth'],
  ] as const) {
    const lines: string[] = [];
    const result = await performAccountDeletion(ME, deps({ [failing]: false }), (l) => lines.push(l));
    assert.deepEqual(result, { ok: false, stage });
    assert.equal(lines.length, 1);
    assert.ok(lines[0].startsWith(DELETION_INCOMPLETE_EVENT));
    assert.ok(lines[0].includes(`stage=${stage}`) && lines[0].includes(`user_id=${ME}`) && lines[0].includes('auth_user_deleted=no'));
  }
});

test('none of it reaches the client: the response after a residue is a plain success, after a failure a generic 502', async () => {
  const errors: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void errors.push(args);
  try {
    const verifyBearer = async () => ({ ok: true as const, userId: ME });
    const ok = await handleDeleteAccount({ confirmation: 'DELETE' }, { authorization: 'Bearer x' }, { verifyBearer, deletion: deps({ sweepStorage: false }) });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, { deleted: true });
    const bad = await handleDeleteAccount({ confirmation: 'DELETE' }, { authorization: 'Bearer x' }, { verifyBearer, deletion: deps({ purgeStorage: false }) });
    assert.equal(bad.status, 502);
    const clientText = JSON.stringify([ok.body, bad.body]);
    assert.ok(!clientText.includes(ME) && !/residue|folder|bucket|stage/.test(clientText));
    // ...but the operator DID get both signals through the default logger
    assert.equal(errors.length, 2);
    assert.ok(String(errors[0][0]).startsWith(STORAGE_RESIDUE_EVENT));
    assert.ok(String(errors[1][0]).startsWith(DELETION_INCOMPLETE_EVENT));
  } finally {
    console.error = original;
  }
});
