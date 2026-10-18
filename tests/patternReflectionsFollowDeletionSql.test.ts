import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

/**
 * Deleting a saved dream also deletes the pattern reflections drawn from it, and ONLY those: reflections built from other dreams and
 * reflections of other accounts stay. Run for real on an in-process PostgreSQL (PGlite) with the shape production has for these tables.
 */

const migration = readFileSync(new URL('../supabase/migrations/20261018_pattern_reflections_follow_dream_deletion.sql', import.meta.url), 'utf8');
const rollback = readFileSync(new URL('../supabase/rollbacks/20261018_pattern_reflections_follow_dream_deletion_rollback.sql', import.meta.url), 'utf8');

let db: PGlite;
before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create table public.dreams (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users (id) on delete cascade, payload jsonb not null default '{}');
    create table public.pattern_reflections (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid not null references auth.users (id) on delete cascade,
      dream_ids text[] not null,
      reflection jsonb not null default '{}'
    );
  `);
  await db.exec(migration);
});
after(async () => {
  await db.close();
});

async function user(): Promise<string> {
  return (await db.query<{ id: string }>("insert into auth.users (email) values ('u@example.com') returning id")).rows[0].id;
}
async function dream(owner: string): Promise<string> {
  return (await db.query<{ id: string }>('insert into public.dreams (owner_id) values ($1) returning id', [owner])).rows[0].id;
}
async function reflection(owner: string, ids: string[]): Promise<string> {
  return (await db.query<{ id: string }>('insert into public.pattern_reflections (owner_id, dream_ids) values ($1, $2) returning id', [owner, ids])).rows[0].id;
}
async function remaining(owner: string): Promise<string[]> {
  return (await db.query<{ id: string }>('select id from public.pattern_reflections where owner_id = $1 order by id', [owner])).rows.map((r) => r.id).sort();
}

test('deleting one dream removes exactly the reflections that include it and keeps the others', async () => {
  const o = await user();
  const [a, b, c, d] = [await dream(o), await dream(o), await dream(o), await dream(o)];
  await reflection(o, [a, b]);
  await reflection(o, [b, c]);
  const cd = await reflection(o, [c, d]);
  await reflection(o, [a, b, c]);
  await db.query('delete from public.dreams where id = $1', [b]);
  assert.deepEqual(await remaining(o), [cd].sort(), 'only the reflection without that dream remains');
  // the other dreams are untouched
  const left = (await db.query<{ id: string }>('select id from public.dreams where owner_id = $1', [o])).rows.map((r) => r.id).sort();
  assert.deepEqual(left, [a, c, d].sort());
});

test('another account is never touched, even if its reflection lists the same id', async () => {
  const mine = await user();
  const other = await user();
  const d1 = await dream(mine);
  const d2 = await dream(mine);
  const mineR = await reflection(mine, [d1, d2]);
  const otherR = await reflection(other, [d1, d2]); // same ids on purpose: ownership decides, not the id
  await db.query('delete from public.dreams where id = $1', [d1]);
  assert.deepEqual(await remaining(mine), []);
  assert.deepEqual(await remaining(other), [otherR]);
  assert.notEqual(mineR, otherR);
});

test('deleting a dream that no reflection uses is a no-op, and so is deleting the same id twice', async () => {
  const o = await user();
  const [x, y, z] = [await dream(o), await dream(o), await dream(o)];
  const yz = await reflection(o, [y, z]);
  await db.query('delete from public.dreams where id = $1', [x]);
  await db.query('delete from public.dreams where id = $1', [x]);
  assert.deepEqual(await remaining(o), [yz]);
});

test('deleting the account (cascade) removes the dreams and the reflections without error', async () => {
  const o = await user();
  const [p, q] = [await dream(o), await dream(o)];
  await reflection(o, [p, q]);
  await db.query('delete from auth.users where id = $1', [o]);
  assert.equal((await db.query('select 1 from public.dreams where owner_id = $1', [o])).rows.length, 0);
  assert.equal((await remaining(o)).length, 0);
});

test('the browser roles cannot call the trigger function; only the table owner runs it', async () => {
  for (const role of ['anon', 'authenticated', 'public']) {
    const r = await db.query<{ ok: boolean }>("select has_function_privilege($1, 'public.delete_pattern_reflections_of_deleted_dream()', 'execute') as ok", [role]);
    assert.equal(r.rows[0].ok, false, `${role} must not execute it`);
  }
});

test('the migration is safe to run twice, and the rollback removes the behaviour without deleting data', async () => {
  await db.exec(migration);
  const o = await user();
  const [m, n] = [await dream(o), await dream(o)];
  await reflection(o, [m, n]);
  await db.exec(rollback);
  await db.exec(rollback);
  await db.query('delete from public.dreams where id = $1', [m]);
  assert.equal((await remaining(o)).length, 1, 'after the rollback the reflection stays, as before this change');
  await db.exec(migration);
  await db.query('delete from public.dreams where id = $1', [n]);
  assert.equal((await remaining(o)).length, 0, 'applying it again restores the behaviour');
});
