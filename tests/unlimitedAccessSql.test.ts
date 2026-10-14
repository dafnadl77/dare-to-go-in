import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

/**
 * Unlimited dream access, run for real on an in-process PostgreSQL (PGlite): the credits, idempotent-analysis and app-owner
 * migrations that are already in production, then the unlimited-access migration. The admin (the app owner) grants an existing
 * account; the account creates dreams without being charged and without its balance moving; revoking returns it to the regular
 * credit rules with the balance it still holds; nobody but the admin can grant or revoke; an unregistered email creates nothing.
 */

const sql = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');

const ADMIN_ID = '7d55396c-3582-4aec-8470-d188fc029829';
const ADMIN_EMAIL = 'dafnadl77@gmail.com';

async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz, created_at timestamptz not null default now());
    grant usage on schema public to anon, authenticated, service_role;
    create table public.dream_attempts (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid references auth.users (id) on delete cascade,
      trial_id uuid,
      image_count integer not null default 0 constraint dream_attempts_image_count_bounds check (image_count >= 0 and image_count <= 3),
      reflection_count integer not null default 0 constraint dream_attempts_reflection_count_bounds check (reflection_count >= 0 and reflection_count <= 3),
      label_count integer not null default 0,
      created_at timestamptz not null default now(),
      saved_dream_id uuid,
      completed_at timestamptz
    );
  `);
  await db.query('insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())', [ADMIN_ID, ADMIN_EMAIL]);
  for (const m of ['20260924_credits_entitlement.sql', '20260925_idempotent_analysis.sql', '20261009_app_owner.sql', '20261009_app_owner_cap_saturation.sql', '20261014_unlimited_access.sql', '20261015_unlimited_access_keep_limits.sql']) {
    await db.exec(sql(m));
  }
  return db;
}

let db: PGlite;
before(async () => {
  db = await freshDb();
});
after(async () => {
  await db.close();
});

let n = 0;
async function newUser(opts: { email?: string; confirmed?: boolean } = {}): Promise<{ id: string; email: string }> {
  n += 1;
  const email = opts.email ?? `user${n}@example.com`;
  const r = await db.query<{ id: string }>('insert into auth.users (email, email_confirmed_at) values ($1, $2) returning id', [email, opts.confirmed === false ? null : new Date().toISOString()]);
  return { id: r.rows[0].id, email };
}
const key = (i: number) => `idem-key-${String(i).padStart(12, '0')}`;
const hash = (c: string) => c.repeat(64);
const hx = (i: number) => hash((i % 16).toString(16));

type Status = { status: string; [k: string]: unknown };
const one = async (q: string, params: unknown[] = []): Promise<Status> => (await db.query<{ r: Status }>(q, params)).rows[0].r;
const grantTo = (actor: string, email: string) => one('select public.admin_grant_unlimited($1, $2) as r', [actor, email]);
const revoke = (actor: string, user: string) => one('select public.admin_revoke_unlimited($1, $2) as r', [actor, user]);
const list = (actor: string) => one('select public.admin_list_unlimited($1) as r', [actor]);
const isUnlimited = async (id: string) => (await db.query<{ r: boolean }>('select public.is_app_owner($1) as r', [id])).rows[0].r;
const startIdem = (owner: string, i: number, h = hash('a')) => one('select public.start_user_attempt_idem($1, $2, $3) as r', [owner, key(i), h]);
const addCredits = (owner: string, amount: number, ref: string) => db.query("select public.grant_credits($1, $2, 'purchase', $3)", [owner, amount, ref]);
const balance = async (owner: string) => (await db.query<{ b: number }>('select public.get_credit_balance($1) as b', [owner])).rows[0].b;
const ledgerCount = async (owner: string) => Number((await db.query<{ c: string }>('select count(*) as c from public.credit_ledger where owner_id = $1', [owner])).rows[0].c);
const count = async (table: string) => Number((await db.query<{ c: string }>(`select count(*) as c from ${table}`)).rows[0].c);

test('the admin grants an existing account: a row, an audit row, and the list shows its email and the date', async () => {
  const u = await newUser({ email: 'Friend@Example.com' });
  assert.equal(await isUnlimited(u.id), false, 'not unlimited before');
  const r = await grantTo(ADMIN_ID, '  friend@example.COM ');
  assert.equal(r.status, 'granted');
  assert.equal(r.user_id, u.id);
  assert.equal(await isUnlimited(u.id), true);
  const listed = await list(ADMIN_ID);
  assert.equal(listed.status, 'ok');
  const items = listed.items as Array<{ user_id: string; email: string; granted_at: string }>;
  const mine = items.find((i) => i.user_id === u.id);
  assert.ok(mine);
  assert.equal(mine.email, 'Friend@Example.com');
  assert.ok(!Number.isNaN(Date.parse(mine.granted_at)));
  const audit = (await db.query<{ action: string; actor_id: string; user_id: string }>("select action, actor_id, user_id from public.unlimited_access_audit where user_id = $1", [u.id])).rows;
  assert.deepEqual(audit, [{ action: 'grant', actor_id: ADMIN_ID, user_id: u.id }]);
  // granting again changes nothing and writes no second audit row
  assert.equal((await grantTo(ADMIN_ID, 'friend@example.com')).status, 'already_granted');
  assert.equal(Number((await db.query<{ c: string }>("select count(*) as c from public.unlimited_access_audit where user_id = $1", [u.id])).rows[0].c), 1);
});

test('a granted account creates dreams without limit and without being charged: balance, ledger and credits untouched', async () => {
  for (const startBalance of [0, 3]) {
    const u = await newUser();
    if (startBalance) await addCredits(u.id, startBalance, `purchase-${u.id}`);
    const ledgerBefore = await ledgerCount(u.id);
    assert.equal((await grantTo(ADMIN_ID, u.email)).status, 'granted');
    for (let i = 0; i < 7; i += 1) {
      const s = await startIdem(u.id, 100 + i, hx(i));
      assert.equal(s.status, 'created', `dream ${i + 1} is created (balance ${startBalance})`);
    }
    // the other creation route (start_user_attempt) is free too; the per-dream technical caps still apply to it (see the next test)
    const direct = await one('select public.start_user_attempt($1) as r', [u.id]);
    assert.equal(direct.status, 'created');
    assert.equal(await balance(u.id), startBalance, 'the balance never moved');
    assert.equal(await ledgerCount(u.id), ledgerBefore, 'no ledger row was written');
  }
});

test('revoking returns the account to the regular credit rules with the balance it kept', async () => {
  const u = await newUser();
  await addCredits(u.id, 3, `purchase-${u.id}`);
  assert.equal((await grantTo(ADMIN_ID, u.email)).status, 'granted');
  for (let i = 0; i < 4; i += 1) await startIdem(u.id, 200 + i, hx(i));
  assert.equal(await balance(u.id), 3);
  const r = await revoke(ADMIN_ID, u.id);
  assert.equal(r.status, 'revoked');
  assert.equal(await isUnlimited(u.id), false);
  assert.equal((await list(ADMIN_ID)).items && ((await list(ADMIN_ID)).items as Array<{ user_id: string }>).some((i) => i.user_id === u.id), false);
  // regular rules again: one credit per dream, the original three are all still there
  assert.equal((await startIdem(u.id, 300, hx(1))).status, 'created');
  assert.equal(await balance(u.id), 2);
  assert.equal((await startIdem(u.id, 301, hx(2))).status, 'created');
  assert.equal((await startIdem(u.id, 302, hx(3))).status, 'created');
  assert.equal(await balance(u.id), 0);
  assert.equal((await startIdem(u.id, 303, hx(4))).status, 'credits_required', 'and at zero the regular refusal returns');
  const audit = (await db.query<{ action: string }>('select action from public.unlimited_access_audit where user_id = $1 order by id', [u.id])).rows.map((a) => a.action);
  assert.deepEqual(audit, ['grant', 'revoke']);
  assert.equal((await revoke(ADMIN_ID, u.id)).status, 'not_found', 'revoking twice changes nothing');
});

test('only the admin can grant, revoke or list: a regular account, a granted account and a stranger are all refused', async () => {
  const regular = await newUser();
  const target = await newUser();
  const granted = await newUser();
  await grantTo(ADMIN_ID, granted.email);
  const before = await count('public.unlimited_dream_access');
  for (const actor of [regular.id, granted.id, target.id, '00000000-0000-0000-0000-000000000000']) {
    assert.equal((await grantTo(actor, target.email)).status, 'not_authorized', 'grant refused');
    assert.equal((await grantTo(actor, regular.email)).status, 'not_authorized', 'self-grant refused');
    assert.equal((await revoke(actor, granted.id)).status, 'not_authorized', 'revoke refused');
    const l = await list(actor);
    assert.equal(l.status, 'not_authorized');
    assert.equal(l.items, undefined, 'a refusal carries no data');
  }
  assert.equal(await count('public.unlimited_dream_access'), before, 'nothing changed');
  assert.equal(await isUnlimited(target.id), false);
  assert.equal(await isUnlimited(granted.id), true, 'the refused revoke left the grant in place');
  // a null actor is refused too
  assert.equal((await one('select public.admin_grant_unlimited(null, $1) as r', [target.email])).status, 'not_authorized');
});

test('an email that is not a registered, confirmed account creates nothing: no grant and no account', async () => {
  const unconfirmed = await newUser({ confirmed: false });
  const usersBefore = await count('auth.users');
  const grantsBefore = await count('public.unlimited_dream_access');
  assert.equal((await grantTo(ADMIN_ID, 'nobody-here@example.com')).status, 'not_registered');
  assert.equal((await grantTo(ADMIN_ID, unconfirmed.email)).status, 'not_registered');
  for (const bad of ['', '   ', 'not-an-email', 'a@b', '@example.com', 'a b@example.com', 'x'.repeat(250) + '@example.com']) {
    assert.equal((await grantTo(ADMIN_ID, bad)).status, 'invalid_email', JSON.stringify(bad));
  }
  assert.equal((await one('select public.admin_grant_unlimited($1, null) as r', [ADMIN_ID])).status, 'invalid_email');
  assert.equal(await count('auth.users'), usersBefore, 'no account was created');
  assert.equal(await count('public.unlimited_dream_access'), grantsBefore);
});

test('the admin account itself is already unlimited and is not written into the granted list', async () => {
  assert.equal((await grantTo(ADMIN_ID, ADMIN_EMAIL)).status, 'already_unlimited');
  const items = (await list(ADMIN_ID)).items as Array<{ user_id: string }>;
  assert.equal(items.some((i) => i.user_id === ADMIN_ID), false);
  assert.equal(await isUnlimited(ADMIN_ID), true);
});

test('a regular account is unaffected: it is not unlimited, spends one credit per dream and is refused at zero', async () => {
  const u = await newUser();
  assert.equal(await isUnlimited(u.id), false);
  assert.equal((await startIdem(u.id, 400, hx(5))).status, 'credits_required');
  await addCredits(u.id, 1, `purchase-${u.id}`);
  assert.equal((await startIdem(u.id, 401, hx(6))).status, 'created');
  assert.equal(await balance(u.id), 0);
  assert.equal(await ledgerCount(u.id), 2, 'purchase and spend');
});

test('the role tables and functions belong to the service role alone', async () => {
  for (const role of ['anon', 'authenticated']) {
    for (const table of ['public.unlimited_dream_access', 'public.unlimited_access_audit']) {
      for (const priv of ['select', 'insert', 'update', 'delete']) {
        const r = await db.query<{ ok: boolean }>('select has_table_privilege($1, $2, $3) as ok', [role, table, priv]);
        assert.equal(r.rows[0].ok, false, `${role} has no ${priv} on ${table}`);
      }
    }
    for (const fn of ['is_dream_admin(uuid)', 'is_app_owner(uuid)', 'admin_grant_unlimited(uuid, text)', 'admin_revoke_unlimited(uuid, uuid)', 'admin_list_unlimited(uuid)']) {
      const r = await db.query<{ ok: boolean }>('select has_function_privilege($1, $2, \'execute\') as ok', [role, `public.${fn}`]);
      assert.equal(r.rows[0].ok, false, `${role} cannot execute ${fn}`);
    }
  }
  const sr = await db.query<{ ok: boolean }>("select has_function_privilege('service_role', 'public.admin_grant_unlimited(uuid, text)', 'execute') as ok");
  assert.equal(sr.rows[0].ok, true);
  const rls = await db.query<{ relname: string; relrowsecurity: boolean }>("select relname, relrowsecurity from pg_class where relname in ('unlimited_dream_access', 'unlimited_access_audit') order by relname");
  assert.deepEqual(rls.rows.map((r) => r.relrowsecurity), [true, true]);
});

test('deleting an account removes its grant, and the audit trail stays', async () => {
  const u = await newUser();
  await grantTo(ADMIN_ID, u.email);
  await db.query('delete from auth.users where id = $1', [u.id]);
  assert.equal(Number((await db.query<{ c: string }>('select count(*) as c from public.unlimited_dream_access where user_id = $1', [u.id])).rows[0].c), 0);
  assert.equal(Number((await db.query<{ c: string }>('select count(*) as c from public.unlimited_access_audit where user_id = $1', [u.id])).rows[0].c), 1);
});

test('the migration is additive and safe to run twice; it writes no credit, ledger or payment data', async () => {
  const text = sql('20261014_unlimited_access.sql');
  assert.doesNotMatch(text, /\b(update|delete from|insert into|truncate|drop)\s+(table\s+)?public\.(dream_credits|credit_ledger|payment_orders)/i);
  const grantsBefore = await count('public.unlimited_dream_access');
  await db.exec(text);
  assert.equal(await count('public.unlimited_dream_access'), grantsBefore);
  assert.equal(await isUnlimited(ADMIN_ID), true);
});

test('the rollback script returns every granted account to the regular rules, keeps the owner unlimited and keeps the balances and the audit trail', async () => {
  const db2 = await freshDb();
  try {
    const mk = async (email: string) => (await db2.query<{ id: string }>('insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id', [email])).rows[0].id;
    const friend = await mk('rollback-friend@example.com');
    await db2.query("select public.grant_credits($1, 2, 'purchase', 'rb-1')", [friend]);
    assert.equal(((await db2.query<{ r: { status: string } }>('select public.admin_grant_unlimited($1, $2) as r', [ADMIN_ID, 'rollback-friend@example.com'])).rows[0].r).status, 'granted');
    assert.equal((await db2.query<{ r: boolean }>('select public.is_app_owner($1) as r', [friend])).rows[0].r, true);
    await db2.exec(readFileSync(new URL('../supabase/rollbacks/20261014_unlimited_access_rollback.sql', import.meta.url), 'utf8'));
    assert.equal((await db2.query<{ r: boolean }>('select public.is_app_owner($1) as r', [friend])).rows[0].r, false, 'the granted account is regular again');
    assert.equal((await db2.query<{ r: boolean }>('select public.is_app_owner($1) as r', [ADMIN_ID])).rows[0].r, true, 'the owner is unchanged');
    assert.equal((await db2.query<{ b: number }>('select public.get_credit_balance($1) as b', [friend])).rows[0].b, 2, 'the balance it kept is intact');
    const s = (await db2.query<{ r: { status: string } }>('select public.start_user_attempt_idem($1, $2, $3) as r', [friend, 'idem-key-000000000001', 'a'.repeat(64)])).rows[0].r;
    assert.equal(s.status, 'created');
    assert.equal((await db2.query<{ b: number }>('select public.get_credit_balance($1) as b', [friend])).rows[0].b, 1, 'and it is charged again');
    assert.equal(Number((await db2.query<{ c: string }>('select count(*) as c from public.unlimited_access_audit')).rows[0].c), 1, 'the audit trail stays');
    assert.equal((await db2.query<{ t: string | null }>("select to_regclass('public.unlimited_dream_access')::text as t")).rows[0].t, null);
  } finally {
    await db2.close();
  }
});

test('a granted account stays under the per-dream technical caps like a regular account; only the app owner has them lifted', async () => {
  const capped = async (who: string) => {
    const started = await one('select public.start_user_attempt($1) as r', [who]);
    const attempt = String(started.attempt_id);
    const seen: Record<string, Array<number | null>> = { image: [], reflection: [], labels: [] };
    for (let i = 0; i < 6; i += 1) {
      seen.image.push((await db.query<{ v: number | null }>('select public.reserve_image_attempt($1, $2, null) as v', [attempt, who])).rows[0].v);
      seen.reflection.push((await db.query<{ v: number | null }>('select public.reserve_reflection_attempt($1, $2, null) as v', [attempt, who])).rows[0].v);
      seen.labels.push((await db.query<{ v: number | null }>('select public.reserve_labels_attempt($1, $2, null, 3) as v', [attempt, who])).rows[0].v);
    }
    return seen;
  };
  const regular = await newUser();
  await addCredits(regular.id, 1, `purchase-${regular.id}`);
  const granted = await newUser();
  await grantTo(ADMIN_ID, granted.email);

  const regularSeen = await capped(regular.id);
  const grantedSeen = await capped(granted.id);
  const ownerSeen = await capped(ADMIN_ID);

  // regular: 1, 2, 3 and then refused (null) — and the granted account behaves exactly the same
  assert.deepEqual(regularSeen.image, [1, 2, 3, null, null, null]);
  assert.deepEqual(regularSeen.reflection, [1, 2, 3, null, null, null]);
  assert.deepEqual(regularSeen.labels, [1, 2, 3, null, null, null]);
  assert.deepEqual(grantedSeen, regularSeen, 'a granted account is capped exactly like a regular one');
  // the owner keeps proceeding past the caps
  for (const list of Object.values(ownerSeen)) assert.ok(list.every((v) => v !== null), 'the app owner is never stopped by a per-dream cap');
});

test('is_dream_admin is true for the app owner only, and is_app_owner (no charge) is true for both', async () => {
  const granted = await newUser();
  await grantTo(ADMIN_ID, granted.email);
  const admin = async (id: string) => (await db.query<{ r: boolean }>('select public.is_dream_admin($1) as r', [id])).rows[0].r;
  assert.equal(await admin(ADMIN_ID), true);
  assert.equal(await admin(granted.id), false);
  assert.equal(await isUnlimited(granted.id), true);
  assert.equal(await isUnlimited(ADMIN_ID), true);
});

test('after the rollback the per-dream caps work again with the previous definitions: capped for a regular account, lifted for the owner', async () => {
  const db3 = await freshDb();
  try {
    await db3.exec(readFileSync(new URL('../supabase/rollbacks/20261014_unlimited_access_rollback.sql', import.meta.url), 'utf8'));
    const mk = async (email: string) => (await db3.query<{ id: string }>('insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id', [email])).rows[0].id;
    const regular = await mk('after-rollback@example.com');
    const seen = async (who: string) => {
      const attempt = String(((await db3.query<{ r: { attempt_id: string } }>('select public.start_user_attempt($1) as r', [who])).rows[0].r).attempt_id);
      const out: Array<number | null> = [];
      for (let i = 0; i < 5; i += 1) out.push((await db3.query<{ v: number | null }>('select public.reserve_image_attempt($1, $2, null) as v', [attempt, who])).rows[0].v);
      return out;
    };
    await db3.query("select public.grant_credits($1, 1, 'purchase', 'rb-caps')", [regular]);
    assert.deepEqual(await seen(regular), [1, 2, 3, null, null]);
    assert.ok((await seen(ADMIN_ID)).every((v) => v !== null), 'the owner is still not stopped by the caps');
  } finally {
    await db3.close();
  }
});
