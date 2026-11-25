import { test, before, after, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

/**
 * 2026-11-25. Duplicates and row locks with SEPARATE PostgreSQL connections: a real PostgreSQL 17 server (the `embedded-postgres`
 * dev dependency, pinned) started on a random local port in a temporary folder, running the real payment SQL including the two
 * unapplied migrations. PGlite is one connection, so it can only simulate concurrency; this proves it.
 *
 * Local only: it binds 127.0.0.1, uses throwaway credentials and a temp directory, and is deleted afterwards. It never reads a
 * database URL or key from the environment and cannot reach Supabase. If the PostgreSQL binary is not available on the machine
 * (another platform, a skipped install) the tests are skipped, never failed.
 */

const sql = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const USER = 'dare_test';
const PASSWORD = 'dare_test_pw_' + Math.random().toString(36).slice(2);
const DB = 'dare_test';

type Client = import('pg').Client;
let available = false;
let skipReason = '';
let port = 0;
let server: { stop(): Promise<void> } | null = null;
let dir = '';
let pgModule: typeof import('pg');
const open: Client[] = [];
const serverLog: string[] = [];

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => resolve(p));
    });
    s.on('error', reject);
  });
}

/** Ends a short-lived session (the server's default limit is 100 connections) and forgets it. */
async function closeClient(c: Client) {
  const i = open.indexOf(c);
  if (i >= 0) open.splice(i, 1);
  await c.end().catch(() => undefined);
}

async function connect(): Promise<Client> {
  const c = new pgModule.Client({ host: '127.0.0.1', port, user: USER, password: PASSWORD, database: DB });
  await c.connect();
  open.push(c);
  return c;
}

before(async () => {
  try {
    const mod = await import('embedded-postgres');
    const EmbeddedPostgres = (mod.default ?? mod) as new (o: Record<string, unknown>) => {
      initialise(): Promise<void>;
      start(): Promise<void>;
      stop(): Promise<void>;
      createDatabase(name: string): Promise<void>;
    };
    pgModule = (await import('pg')).default as unknown as typeof import('pg');
    port = await freePort();
    dir = mkdtempSync(join(tmpdir(), 'dare-pg-'));
    const pg = new EmbeddedPostgres({ databaseDir: join(dir, 'data'), user: USER, password: PASSWORD, port, persistent: false, onLog: (m: unknown) => serverLog.push(String(m).trim()), onError: (m: unknown) => serverLog.push('ERR ' + String(m).trim()) });
    await pg.initialise();
    await pg.start();
    server = pg;
    await pg.createDatabase(DB);
    const admin = await connect();
    await admin.query(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users (id uuid primary key default gen_random_uuid());
      grant usage on schema public to anon, authenticated, service_role;
    `);
    await admin.query(sql('20260924_credits_entitlement.sql'));
    await admin.query(`
      alter table public.credit_ledger alter column owner_id drop not null;
      alter table public.credit_ledger drop constraint if exists credit_ledger_owner_id_fkey;
      alter table public.credit_ledger add constraint credit_ledger_owner_id_fkey foreign key (owner_id) references auth.users (id) on delete set null;
    `);
    await admin.query(sql('20261007_payment_orders.sql'));
    await admin.query(sql('20261123_payment_order_links.sql'));
    await admin.query(sql('20261125_complete_payment_order_with_link.sql'));
    available = true;
  } catch (e) {
    skipReason = e instanceof Error ? e.message.slice(0, 120) : 'unavailable';
  }
});

after(async () => {
  if (process.env.DEBUG_PG) console.log(serverLog.slice(-25).join('\n'));
  for (const c of open) await c.end().catch(() => undefined);
  await server?.stop().catch(() => undefined);
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const skip = (t: TestContext) => {
  if (!available) t.skip(`embedded PostgreSQL not available: ${skipReason}`);
  return !available;
};

// ------------------------------------------------------------------------------------------------------ helpers ----

let admin: Client;
async function adminClient() {
  admin ??= await connect();
  return admin;
}
async function newOrder(bindIds?: { processId: string; tokenHash: string }) {
  const a = await adminClient();
  const owner = (await a.query<{ id: string }>('insert into auth.users default values returning id')).rows[0].id;
  const order = (await a.query<{ r: { order_id: string } }>('select public.create_payment_order($1, $2, $3, $4) as r', [owner, 'go_deeper_3', 59, 3])).rows[0].r.order_id;
  await a.query('select public.set_payment_order_link_status($1, $2, $3)', [order, owner, 'link_created']);
  if (bindIds) {
    const r = await a.query<{ r: string }>('select public.bind_payment_order_link($1, $2, $3, $4, $5, $6, $7) as r', [order, owner, 'production', 'dare-test', bindIds.processId, bindIds.tokenHash, false]);
    assert.equal(r.rows[0].r, 'bound');
  }
  return { owner, order };
}
const balance = async (owner: string) => (await (await adminClient()).query<{ b: number }>('select public.get_credit_balance($1) as b', [owner])).rows[0].b;
const ledger = async (owner: string) => (await (await adminClient()).query('select 1 from public.credit_ledger where owner_id = $1', [owner])).rows.length;

/** One call on its OWN connection, so N calls are N concurrent sessions. Returns the status word, or the SQLSTATE if it raised. */
async function complete(order: string, tx: string, amount = 59): Promise<string> {
  const c = await connect();
  try {
    const r = await c.query<{ r: { status: string } }>('select public.complete_payment_order($1, $2, $3, $4, $5) as r', [order, tx, amount, 'ILS', 'paid']);
    return r.rows[0].r.status;
  } catch (e) {
    return `error:${(e as { code?: string }).code ?? 'unknown'}`;
  } finally {
    await closeClient(c);
  }
}
async function completeLinked(order: string, tx: string, processId: string, tokenHash: string): Promise<string> {
  const c = await connect();
  try {
    const r = await c.query<{ r: { status: string } }>('select public.complete_payment_order_with_link($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as r', [order, tx, 59, 'ILS', 'paid', 'production', 'dare-test', processId, tokenHash, null]);
    return r.rows[0].r.status;
  } catch (e) {
    return `error:${(e as { code?: string }).code ?? 'unknown'}`;
  } finally {
    await closeClient(c);
  }
}
const count = (words: string[], w: string) => words.filter((x) => x === w).length;
const H = (n: number) => String(n).padStart(2, '0').repeat(32);

// ---------------------------------------------------------------------------------------------------------- tests ----

test('real server: it is PostgreSQL 17, matching Supabase, and each call really is its own session', async (t) => {
  if (skip(t)) return;
  const a = await adminClient();
  const v = (await a.query<{ v: string }>("select current_setting('server_version') as v")).rows[0].v;
  assert.match(v, /^17\./);
  const [x, y] = await Promise.all([connect(), connect()]);
  const pids = (await Promise.all([x.query('select pg_backend_pid() as p'), y.query('select pg_backend_pid() as p')])).map((r) => r.rows[0].p);
  assert.notEqual(pids[0], pids[1]);
});

test('same order, same transaction, 16 sessions at once: exactly one grant, the rest duplicate, one ledger row', async (t) => {
  if (skip(t)) return;
  for (let round = 0; round < 5; round++) {
    const o = await newOrder();
    const results = await Promise.all(Array.from({ length: 16 }, () => complete(o.order, 'TX-SAME-' + o.order.slice(0, 8))));
    assert.equal(count(results, 'granted'), 1, `round ${round}: ${results.join(',')}`);
    assert.equal(count(results, 'duplicate'), 15, `round ${round}`);
    assert.equal(await balance(o.owner), 3);
    assert.equal(await ledger(o.owner), 1);
  }
});

test('same order, two different transactions at once: one wins, the other is refused, never two grants', async (t) => {
  if (skip(t)) return;
  for (let round = 0; round < 10; round++) {
    const o = await newOrder();
    const results = await Promise.all([complete(o.order, 'TX-A-' + o.order.slice(0, 8)), complete(o.order, 'TX-B-' + o.order.slice(0, 8)), complete(o.order, 'TX-C-' + o.order.slice(0, 8))]);
    assert.equal(count(results, 'granted'), 1, results.join(','));
    assert.equal(count(results, 'order_already_completed'), 2, results.join(','));
    assert.equal(await ledger(o.owner), 1);
    assert.equal(await balance(o.owner), 3);
  }
});

test('two orders, the SAME transaction, at once: at most one is credited, the other is refused or rolled back whole', async (t) => {
  if (skip(t)) return;
  for (let round = 0; round < 20; round++) {
    const a = await newOrder();
    const b = await newOrder();
    const tx = `TX-SHARED-${round}-${a.order.slice(0, 6)}`;
    const results = await Promise.all([complete(a.order, tx), complete(b.order, tx), complete(a.order, tx), complete(b.order, tx)]);
    const total = (await ledger(a.owner)) + (await ledger(b.owner));
    assert.equal(total, 1, `round ${round}: ${results.join(',')}`);
    assert.equal((await balance(a.owner)) + (await balance(b.owner)), 3, 'exactly one order was credited');
    // FINDING (real concurrency, not visible in PGlite): when both orders pass the "transaction already used" check before either has
    // committed, the second session's grant finds the ledger entry and the function raises (P0001, "grant did not apply"). The whole
    // transaction rolls back, so nothing is double-credited; the caller sees a database error (the API answers 503 and Make retries).
    for (const r of results) assert.ok(['granted', 'duplicate', 'transaction_used_by_other_order', 'error:P0001', 'error:23505'].includes(r), `unexpected ${r}`);
    const loser = (await balance(a.owner)) === 0 ? a : b;
    // The retry (what Make does after a 503) is answered cleanly, and the loser is still completable by its own transaction.
    assert.equal(await complete(loser.order, tx), 'transaction_used_by_other_order', 'the retry of the losing order');
    assert.equal(await complete(loser.order, `TX-OWN-${round}-${loser.order.slice(0, 6)}`), 'granted');
  }
});

test('the order row lock really blocks: a call waits for a session holding the row, then proceeds once', async (t) => {
  if (skip(t)) return;
  const o = await newOrder();
  const holder = await connect();
  await holder.query('begin');
  await holder.query('select 1 from public.payment_orders where id = $1 for update', [o.order]);
  let settled = false;
  const blocked = complete(o.order, 'TX-LOCK-' + o.order.slice(0, 8)).then((r) => ((settled = true), r));
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(settled, false, 'the completion is waiting on the row lock');
  const waiting = await (await adminClient()).query<{ n: number }>("select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock' and query like '%complete_payment_order%'");
  assert.ok(waiting.rows[0].n >= 1, 'pg_stat_activity shows a session waiting on a lock');
  await holder.query('commit');
  assert.equal(await blocked, 'granted');
  assert.equal(await ledger(o.owner), 1);
});

test('linked completion at once: only the right identifiers grant; wrong ones never do, even racing the right one', async (t) => {
  if (skip(t)) return;
  for (let round = 0; round < 5; round++) {
    const good = { processId: `9${round}001`, tokenHash: H(round + 1) };
    const o = await newOrder(good);
    const tx = 'TX-LINK-' + o.order.slice(0, 8);
    const attempts = [
      ...Array.from({ length: 6 }, () => completeLinked(o.order, tx, good.processId, good.tokenHash)),
      ...Array.from({ length: 6 }, (_, i) => completeLinked(o.order, 'TX-BAD-' + i + o.order.slice(0, 6), good.processId, H(50 + i))),
      ...Array.from({ length: 3 }, () => completeLinked(o.order, 'TX-BADID-' + o.order.slice(0, 6), '12345', good.tokenHash)),
    ];
    const results = await Promise.all(attempts);
    assert.equal(count(results, 'granted'), 1, results.join(','));
    assert.equal(count(results, 'duplicate'), 5, results.join(','));
    assert.equal(count(results, 'link_mismatch'), 9, results.join(','));
    assert.equal(await ledger(o.owner), 1);
    assert.equal((await (await adminClient()).query('select provider_tx from public.payment_orders where id = $1', [o.order])).rows[0].provider_tx, tx, 'the grant is the right transaction');
  }
});

test('Make path and the linked function racing on one order and transaction: one grant', async (t) => {
  if (skip(t)) return;
  const good = { processId: '88801', tokenHash: H(70) };
  const o = await newOrder(good);
  const tx = 'TX-BOTH-' + o.order.slice(0, 8);
  const results = await Promise.all([
    ...Array.from({ length: 5 }, () => completeLinked(o.order, tx, good.processId, good.tokenHash)),
    ...Array.from({ length: 5 }, () => complete(o.order, tx)), // the original function (an old-format caller)
  ]);
  assert.equal(count(results, 'granted'), 1, results.join(','));
  assert.equal(await ledger(o.owner), 1);
  assert.equal(await balance(o.owner), 3);
});

test('binding at once: one link identifier belongs to one order; the same order bound twice is idempotent', async (t) => {
  if (skip(t)) return;
  const a = await adminClient();
  const bindCall = async (order: string, owner: string, processId: string, hash: string) => {
    const c = await connect();
    try {
      return (await c.query<{ r: string }>('select public.bind_payment_order_link($1, $2, $3, $4, $5, $6, $7) as r', [order, owner, 'production', 'dare-test', processId, hash, false])).rows[0].r;
    } finally {
      await closeClient(c);
    }
  };
  const o1 = await newOrder();
  const o2 = await newOrder();
  const same = await Promise.all([bindCall(o1.order, o1.owner, '77701', H(80)), bindCall(o2.order, o2.owner, '77701', H(81))]);
  assert.deepEqual([...same].sort(), ['bound', 'process_in_use']);
  const o3 = await newOrder();
  const twice = await Promise.all(Array.from({ length: 6 }, () => bindCall(o3.order, o3.owner, '77703', H(82))));
  assert.equal(count(twice, 'bound'), 1, twice.join(','));
  assert.equal(count(twice, 'already_bound'), 5, twice.join(','));
  const rows = (await a.query('select 1 from public.payment_order_links where process_id = $1', ['77703'])).rows.length;
  assert.equal(rows, 1);
});

test('creating orders at once: the per-account limit of 5 in 10 minutes holds under 12 simultaneous sessions', async (t) => {
  if (skip(t)) return;
  const a = await adminClient();
  const owner = (await a.query<{ id: string }>('insert into auth.users default values returning id')).rows[0].id;
  const make = async () => {
    const c = await connect();
    try {
      return (await c.query<{ r: { status: string } }>('select public.create_payment_order($1, $2, $3, $4) as r', [owner, 'go_deeper_3', 59, 3])).rows[0].r.status;
    } finally {
      await closeClient(c);
    }
  };
  const results = await Promise.all(Array.from({ length: 12 }, () => make()));
  assert.equal(count(results, 'created'), 5, results.join(','));
  assert.equal(count(results, 'rate_limited'), 7, results.join(','));
});
