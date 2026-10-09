import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

/**
 * The app-owner role, run for real on an in-process PostgreSQL (PGlite): the credits and idempotent-analysis migrations that are
 * already in production, then the owner migration. The owner is never charged and never blocked; everyone else behaves exactly as
 * before; and nobody but the service role can read or write the role.
 */

const sql = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');

const OWNER_ID = '7d55396c-3582-4aec-8470-d188fc029829';
const OWNER_EMAIL = 'dafnadl77@gmail.com';

async function freshDb(users: Array<{ id: string; email: string; confirmed: boolean }>): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz);
    grant usage on schema public to anon, authenticated, service_role;
    -- the part of dream_attempts that earlier (already-applied) migrations created
    create table public.dream_attempts (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid references auth.users (id) on delete cascade,
      trial_id uuid,
      -- the CHECK bounds production has on these counters (not part of the repo's migrations)
      image_count integer not null default 0 constraint dream_attempts_image_count_bounds check (image_count >= 0 and image_count <= 3),
      reflection_count integer not null default 0 constraint dream_attempts_reflection_count_bounds check (reflection_count >= 0 and reflection_count <= 3),
      label_count integer not null default 0,
      created_at timestamptz not null default now(),
      saved_dream_id uuid,
      completed_at timestamptz
    );
  `);
  for (const u of users) {
    await db.query('insert into auth.users (id, email, email_confirmed_at) values ($1, $2, $3)', [u.id, u.email, u.confirmed ? new Date().toISOString() : null]);
  }
  await db.exec(sql('20260924_credits_entitlement.sql'));
  await db.exec(sql('20260925_idempotent_analysis.sql'));
  await db.exec(sql('20261009_app_owner.sql'));
  await db.exec(sql('20261009_app_owner_cap_saturation.sql'));
  return db;
}

let db: PGlite;
before(async () => {
  db = await freshDb([{ id: OWNER_ID, email: OWNER_EMAIL, confirmed: true }]);
});
after(async () => {
  await db.close();
});

let n = 0;
async function newUser(): Promise<string> {
  n += 1;
  const r = await db.query<{ id: string }>('insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id', [`user${n}@example.com`]);
  return r.rows[0].id;
}
const key = (i: number) => `idem-key-${String(i).padStart(12, '0')}`;
const hash = (c: string) => c.repeat(64);

type Started = { status: string; attempt_id?: string };
async function start(owner: string): Promise<Started> {
  return (await db.query<{ r: Started }>('select public.start_user_attempt($1) as r', [owner])).rows[0].r;
}
async function startIdem(owner: string, k: string, h = hash('a')): Promise<Started> {
  return (await db.query<{ r: Started }>('select public.start_user_attempt_idem($1, $2, $3) as r', [owner, k, h])).rows[0].r;
}
async function grant(owner: string, amount: number, ref: string) {
  await db.query("select public.grant_credits($1, $2, 'purchase', $3)", [owner, amount, ref]);
}
async function balance(owner: string): Promise<number> {
  return (await db.query<{ b: number }>('select public.get_credit_balance($1) as b', [owner])).rows[0].b;
}
async function ledger(owner: string) {
  return (await db.query<{ delta: number; reason: string }>('select delta, reason from public.credit_ledger where owner_id = $1 order by id', [owner])).rows;
}

test('the owner migration grants the verified account, once, with an audit row', async () => {
  const owners = (await db.query<{ owner_id: string }>('select owner_id from public.app_owners')).rows;
  assert.deepEqual(owners.map((o) => o.owner_id), [OWNER_ID]);
  const audit = (await db.query<{ owner_id: string; action: string }>('select owner_id, action from public.app_owner_audit')).rows;
  assert.deepEqual(audit, [{ owner_id: OWNER_ID, action: 'grant' }]);
  assert.equal((await db.query<{ r: boolean }>('select public.is_app_owner($1) as r', [OWNER_ID])).rows[0].r, true);
  // re-running the migrations (in order) changes nothing
  await db.exec(sql('20261009_app_owner.sql'));
  await db.exec(sql('20261009_app_owner_cap_saturation.sql'));
  assert.equal((await db.query('select 1 from public.app_owners')).rows.length, 1);
  assert.equal((await db.query('select 1 from public.app_owner_audit')).rows.length, 1);
});

test('the grant is conditional on the verified account: a different id, an unconfirmed email or a missing user gets nothing', async () => {
  for (const users of [
    [{ id: '11111111-1111-4111-8111-111111111111', email: OWNER_EMAIL, confirmed: true }], // same email, different id
    [{ id: OWNER_ID, email: OWNER_EMAIL, confirmed: false }], // right id, email not confirmed
    [{ id: OWNER_ID, email: 'someone.else@example.com', confirmed: true }], // right id, different email
    [], // the account does not exist
  ]) {
    const other = await freshDb(users);
    assert.equal((await other.query('select 1 from public.app_owners')).rows.length, 0, JSON.stringify(users));
    await other.close();
  }
});

test('the owner can create dreams without limit with a zero balance, and nothing is ever charged', async () => {
  for (let i = 0; i < 6; i += 1) assert.equal((await start(OWNER_ID)).status, 'created');
  for (let i = 0; i < 6; i += 1) assert.equal((await startIdem(OWNER_ID, key(i))).status, 'created');
  assert.equal(await balance(OWNER_ID), 0);
  assert.deepEqual(await ledger(OWNER_ID), []);
});

test('the owner\'s existing credits and ledger are left exactly as they were (no spend, no reset)', async () => {
  await grant(OWNER_ID, 3, 'grow:TEST-OWNER-1');
  const before = await ledger(OWNER_ID);
  for (let i = 0; i < 4; i += 1) assert.equal((await startIdem(OWNER_ID, key(100 + i), hash('b'))).status, 'created');
  assert.equal(await balance(OWNER_ID), 3);
  assert.deepEqual(await ledger(OWNER_ID), before);
  assert.deepEqual(before, [{ delta: 3, reason: 'purchase' }]);
});

test('an owner\'s retry of the same dream still replays instead of running twice, and a failed attempt is cancelled with no refund row', async () => {
  const first = await startIdem(OWNER_ID, key(200), hash('c'));
  const again = await startIdem(OWNER_ID, key(200), hash('c'));
  assert.equal(again.status, 'processing');
  assert.equal(again.attempt_id, first.attempt_id);
  assert.equal((await startIdem(OWNER_ID, key(200), hash('d'))).status, 'conflict');
  const before = await ledger(OWNER_ID);
  const cancelled = await db.query<{ r: string }>('select public.cancel_user_attempt($1, $2) as r', [first.attempt_id, OWNER_ID]);
  assert.equal(cancelled.rows[0].r, 'not_refunded');
  assert.deepEqual(await ledger(OWNER_ID), before);
  assert.equal((await db.query('select 1 from public.dream_attempts where id = $1', [first.attempt_id])).rows.length, 0);
});

test('a regular account is charged and refused exactly as before', async () => {
  const user = await newUser();
  assert.equal((await start(user)).status, 'credits_required');
  assert.equal((await startIdem(user, key(300))).status, 'credits_required');
  await grant(user, 1, 'grow:TEST-USER-1');
  assert.equal((await startIdem(user, key(301))).status, 'created');
  assert.equal(await balance(user), 0);
  assert.deepEqual(await ledger(user), [
    { delta: 1, reason: 'purchase' },
    { delta: -1, reason: 'spend' },
  ]);
  assert.equal((await startIdem(user, key(302))).status, 'credits_required');
  assert.equal((await start(user)).status, 'credits_required');
});

test('a regular account\'s failed dream still refunds its credit exactly once', async () => {
  const user = await newUser();
  await grant(user, 2, 'grow:TEST-USER-2');
  const a = await startIdem(user, key(310));
  assert.equal(await balance(user), 1);
  assert.equal((await db.query<{ r: string }>('select public.cancel_user_attempt($1, $2) as r', [a.attempt_id, user])).rows[0].r, 'refunded');
  assert.equal(await balance(user), 2);
  assert.equal((await db.query<{ r: string }>('select public.cancel_user_attempt($1, $2) as r', [a.attempt_id, user])).rows[0].r, 'not_refunded');
  assert.equal(await balance(user), 2);
});

async function reserve(fn: 'image' | 'reflection', attempt: string, owner: string): Promise<number | null> {
  const r = await db.query<{ r: number | null }>(`select public.reserve_${fn}_attempt($1, $2, null) as r`, [attempt, owner]);
  return r.rows[0].r;
}

test('per-dream image and reflection caps: the owner is not stopped at 3, a regular account is, and ownership of the attempt is still checked', async () => {
  const ownerAttempt = (await startIdem(OWNER_ID, key(400), hash('e'))).attempt_id as string;
  // production bounds the counters at 3: the owner's saturates there, and every reservation still succeeds
  for (let i = 1; i <= 6; i += 1) assert.equal(await reserve('image', ownerAttempt, OWNER_ID), Math.min(i, 3));
  for (let i = 1; i <= 5; i += 1) assert.equal(await reserve('reflection', ownerAttempt, OWNER_ID), Math.min(i, 3));

  const user = await newUser();
  await grant(user, 1, 'grow:TEST-USER-3');
  const userAttempt = (await startIdem(user, key(401), hash('f'))).attempt_id as string;
  for (let i = 1; i <= 3; i += 1) assert.equal(await reserve('image', userAttempt, user), i);
  assert.equal(await reserve('image', userAttempt, user), null);
  for (let i = 1; i <= 3; i += 1) assert.equal(await reserve('reflection', userAttempt, user), i);
  assert.equal(await reserve('reflection', userAttempt, user), null);

  // a regular account cannot use the owner's attempt, and being "owner" is not a property of the attempt row
  assert.equal(await reserve('image', ownerAttempt, user), null);
  const labels = await db.query<{ r: number | null }>('select public.reserve_labels_attempt($1, $2, null, 2) as r', [userAttempt, user]);
  assert.equal(labels.rows[0].r, 1);
});

test('nobody but the service role can read or write the role, or ask who the owner is', async () => {
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query<{ r: boolean }>(`select has_function_privilege('${role}', 'public.is_app_owner(uuid)', 'execute') as r`)).rows[0].r, false, role);
    for (const table of ['public.app_owners', 'public.app_owner_audit']) {
      for (const priv of ['select', 'insert', 'update', 'delete']) {
        assert.equal((await db.query<{ r: boolean }>(`select has_table_privilege('${role}', '${table}', '${priv}') as r`)).rows[0].r, false, `${role} ${priv} ${table}`);
      }
    }
  }
  assert.equal((await db.query<{ r: boolean }>("select has_function_privilege('service_role', 'public.is_app_owner(uuid)', 'execute') as r")).rows[0].r, true);

  // and a signed-in account really cannot grant itself the role
  const user = await newUser();
  await db.exec('set role authenticated');
  await assert.rejects(db.query('insert into public.app_owners (owner_id) values ($1)', [user]), /permission denied/);
  await assert.rejects(db.query('select public.is_app_owner($1)', [user]), /permission denied/);
  await db.exec('reset role');
  assert.equal((await db.query<{ r: boolean }>('select public.is_app_owner($1) as r', [user])).rows[0].r, false);
});

test('the role is dropped with the account (a re-registered email is NOT the owner)', async () => {
  const other = await freshDb([{ id: OWNER_ID, email: OWNER_EMAIL, confirmed: true }]);
  await other.query('delete from auth.users where id = $1', [OWNER_ID]);
  assert.equal((await other.query('select 1 from public.app_owners')).rows.length, 0);
  await other.close();
});
