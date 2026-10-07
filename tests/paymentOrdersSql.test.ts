import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

/**
 * The payment SQL, run for real on an in-process PostgreSQL (PGlite): the credits migration that is already in production,
 * the ledger change from the account-deletion migration, then the (unapplied) payment_orders migration. This exercises the
 * actual completion function: ownership, amounts, idempotency, transaction reuse, deletion and privileges.
 */

const sql = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');

const PACKAGES = {
  go_deeper_3: { amount: 59, credits: 3 },
  explore_10: { amount: 149, credits: 10 },
  dive_in_25: { amount: 279, credits: 25 },
} as const;

let db: PGlite;

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid());
    grant usage on schema public to anon, authenticated, service_role;
  `);
  await db.exec(sql('20260924_credits_entitlement.sql'));
  // the one change the account-deletion migration makes to the ledger (anonymize instead of cascade)
  await db.exec(`
    alter table public.credit_ledger alter column owner_id drop not null;
    alter table public.credit_ledger drop constraint if exists credit_ledger_owner_id_fkey;
    alter table public.credit_ledger add constraint credit_ledger_owner_id_fkey
      foreign key (owner_id) references auth.users (id) on delete set null;
  `);
  await db.exec(sql('20261007_payment_orders.sql'));
});
after(async () => {
  await db.close();
});

async function newUser(): Promise<string> {
  const r = await db.query<{ id: string }>('insert into auth.users default values returning id');
  return r.rows[0].id;
}
async function createOrder(owner: string, pkg: keyof typeof PACKAGES = 'explore_10'): Promise<string> {
  const p = PACKAGES[pkg];
  const r = await db.query<{ r: { status: string; order_id: string } }>('select public.create_payment_order($1, $2, $3, $4) as r', [owner, pkg, p.amount, p.credits]);
  assert.equal(r.rows[0].r.status, 'created');
  return r.rows[0].r.order_id;
}
type Outcome = { status: string; balance?: number };
async function complete(order: string, tx: string, amount: number, currency = 'ILS', providerStatus = 'PAID'): Promise<Outcome> {
  const r = await db.query<{ r: Outcome }>('select public.complete_payment_order($1, $2, $3, $4, $5) as r', [order, tx, amount, currency, providerStatus]);
  return r.rows[0].r;
}
async function balance(owner: string): Promise<number> {
  const r = await db.query<{ b: number }>('select public.get_credit_balance($1) as b', [owner]);
  return r.rows[0].b;
}
async function ledgerRows(owner: string | null, ref?: string) {
  const r = await db.query<{ delta: number; reason: string; external_ref: string }>(
    ref ? 'select delta, reason, external_ref from public.credit_ledger where external_ref = $1' : 'select delta, reason, external_ref from public.credit_ledger where owner_id = $1',
    [ref ?? owner],
  );
  return r.rows;
}
async function order(id: string) {
  const r = await db.query<Record<string, unknown>>('select * from public.payment_orders where id = $1', [id]);
  return r.rows[0];
}

test('a verified payment grants exactly the ORDER\'s credits to the ORDER\'s owner, with an auditable ledger row', async () => {
  const owner = await newUser();
  const id = await createOrder(owner, 'explore_10');
  assert.deepEqual(await complete(id, 'TX-1001', 149), { status: 'granted', balance: 10 });
  assert.equal(await balance(owner), 10);
  assert.deepEqual(await ledgerRows(owner), [{ delta: 10, reason: 'purchase', external_ref: 'grow:TX-1001' }]);
  const o = await order(id);
  assert.equal(o.status, 'granted');
  assert.equal(o.provider_tx, 'TX-1001');
  assert.equal(o.provider_status, 'PAID');
  assert.equal(Number(o.paid_amount_ils), 149);
  assert.equal(o.paid_currency, 'ILS');
  assert.ok(o.paid_at && o.granted_at);
});

test('every package maps price to credits on the server: 59 -> 3, 149 -> 10, 279 -> 25', async () => {
  for (const [pkg, p] of Object.entries(PACKAGES) as [keyof typeof PACKAGES, (typeof PACKAGES)[keyof typeof PACKAGES]][]) {
    const owner = await newUser();
    const id = await createOrder(owner, pkg);
    assert.equal((await complete(id, `TX-${pkg}`, p.amount)).balance, p.credits, pkg);
  }
});

test('a replayed or retried notification for the same transaction is harmless: success, no extra credits, one ledger row', async () => {
  const owner = await newUser();
  const id = await createOrder(owner, 'go_deeper_3');
  assert.equal((await complete(id, 'TX-2001', 59)).status, 'granted');
  for (let i = 0; i < 3; i += 1) assert.deepEqual(await complete(id, 'TX-2001', 59), { status: 'duplicate', balance: 3 });
  assert.equal(await balance(owner), 3);
  assert.equal((await ledgerRows(owner)).length, 1);
});

test('the same transaction can never fund a second order', async () => {
  const owner = await newUser();
  const a = await createOrder(owner, 'go_deeper_3');
  const b = await createOrder(owner, 'go_deeper_3');
  assert.equal((await complete(a, 'TX-3001', 59)).status, 'granted');
  assert.equal((await complete(b, 'TX-3001', 59)).status, 'transaction_used_by_other_order');
  assert.equal(await balance(owner), 3);
  assert.equal((await order(b)).status, 'created', 'the second order is untouched');
});

test('an order completed with one transaction rejects a different transaction', async () => {
  const owner = await newUser();
  const id = await createOrder(owner, 'go_deeper_3');
  assert.equal((await complete(id, 'TX-4001', 59)).status, 'granted');
  assert.equal((await complete(id, 'TX-4002', 59)).status, 'order_already_completed');
  assert.equal(await balance(owner), 3);
});

test('a wrong amount grants nothing, closes the order for review, and the transaction stays attached to it', async () => {
  const owner = await newUser();
  const id = await createOrder(owner, 'dive_in_25');
  assert.equal((await complete(id, 'TX-5001', 59)).status, 'amount_mismatch');
  assert.equal(await balance(owner), 0);
  const o = await order(id);
  assert.equal(o.status, 'rejected');
  assert.equal(o.reject_reason, 'amount_mismatch');
  assert.equal(Number(o.paid_amount_ils), 59);
  // a later "correct" notification cannot reopen it, and a repeat of the bad one stays rejected
  assert.equal((await complete(id, 'TX-5002', 279)).status, 'order_closed');
  assert.equal((await complete(id, 'TX-5001', 59)).status, 'rejected_duplicate');
  assert.equal(await balance(owner), 0);
  // the rejected transaction cannot be used for another order either
  const other = await createOrder(owner, 'go_deeper_3');
  assert.equal((await complete(other, 'TX-5001', 59)).status, 'transaction_used_by_other_order');
  assert.equal(await balance(owner), 0);
});

test('a slightly different or fractional amount is a mismatch too (no rounding in the customer\'s favour)', async () => {
  const owner = await newUser();
  for (const [i, amount] of [58.99, 149.01, 0.01, 1490].entries()) {
    const id = await createOrder(owner, 'explore_10');
    assert.equal((await complete(id, `TX-6${i}01`, amount)).status, 'amount_mismatch', String(amount));
  }
  assert.equal(await balance(owner), 0);
  const ok = await createOrder(owner, 'explore_10');
  assert.equal((await complete(ok, 'TX-6999', 149.0)).status, 'granted');
});

test('a wrong currency grants nothing', async () => {
  const owner = await newUser();
  const id = await createOrder(owner, 'explore_10');
  assert.equal((await complete(id, 'TX-7001', 149, 'USD')).status, 'currency_mismatch');
  assert.equal(await balance(owner), 0);
  assert.equal((await order(id)).reject_reason, 'currency_mismatch');
});

test('an unknown or malformed order / transaction / amount is refused without any effect', async () => {
  assert.equal((await complete('f'.repeat(32), 'TX-8001', 149)).status, 'order_not_found');
  const owner = await newUser();
  const id = await createOrder(owner, 'explore_10');
  for (const [order, tx, amount, cur] of [
    ['not-an-id', 'TX-8002', 149, 'ILS'],
    [id.toUpperCase(), 'TX-8002', 149, 'ILS'],
    [id, 'x', 149, 'ILS'],
    [id, 'bad tx!', 149, 'ILS'],
    [id, 'TX-8003', 0, 'ILS'],
    [id, 'TX-8003', -149, 'ILS'],
    [id, 'TX-8003', 149, 'ils'],
    [id, 'TX-8003', 149, 'ILSX'],
  ] as const) {
    assert.equal((await complete(order, tx, amount, cur)).status, 'invalid', `${order} ${tx} ${amount} ${cur}`);
  }
  assert.equal(await balance(owner), 0);
  assert.equal((await order(id)).status, 'created');
});

test('a payment that arrives after the account was deleted grants nothing and is closed for manual review', async () => {
  const owner = await newUser();
  const id = await createOrder(owner, 'explore_10');
  await db.query('delete from auth.users where id = $1', [owner]);
  assert.equal((await order(id)).owner_id, null, 'the order is anonymized, not deleted');
  assert.equal((await complete(id, 'TX-9001', 149)).status, 'owner_gone');
  assert.equal((await order(id)).reject_reason, 'owner_deleted');
  assert.deepEqual(await ledgerRows(null, 'grow:TX-9001'), []);
});

test('deleting the account AFTER a completed purchase keeps the anonymized record, and a replay still grants nothing', async () => {
  const owner = await newUser();
  const id = await createOrder(owner, 'go_deeper_3');
  assert.equal((await complete(id, 'TX-9101', 59)).status, 'granted');
  await db.query('delete from auth.users where id = $1', [owner]);
  const o = await order(id);
  assert.equal(o.owner_id, null);
  assert.equal(o.status, 'granted');
  assert.equal(o.provider_tx, 'TX-9101');
  assert.equal((await complete(id, 'TX-9101', 59)).status, 'duplicate');
  assert.equal((await ledgerRows(null, 'grow:TX-9101')).length, 1, 'the ledger keeps its (anonymized) purchase row');
});

test('the order row carries no personal data: no name, phone or email column exists', async () => {
  const cols = await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'payment_orders'");
  const names = cols.rows.map((c) => c.column_name);
  assert.ok(names.length > 10);
  assert.ok(!names.some((n) => /name|phone|email|mail|card/i.test(n)), names.join(','));
});

test('create_payment_order: the price list is enforced by the database; 5 orders per account per 10 minutes', async () => {
  const owner = await newUser();
  await assert.rejects(db.query('select public.create_payment_order($1, $2, $3, $4)', [owner, 'explore_10', 1, 10]), /payment_orders_package_price/);
  await assert.rejects(db.query('select public.create_payment_order($1, $2, $3, $4)', [owner, 'explore_10', 149, 1000]), /payment_orders_package_price/);
  await assert.rejects(db.query('select public.create_payment_order($1, $2, $3, $4)', [owner, 'first_dream', 0, 1]), /check/);
  for (let i = 0; i < 5; i += 1) await createOrder(owner, 'go_deeper_3');
  const sixth = await db.query<{ r: { status: string } }>('select public.create_payment_order($1, $2, $3, $4) as r', [owner, 'go_deeper_3', 59, 3]);
  assert.equal(sixth.rows[0].r.status, 'rate_limited');
  const stranger = await newUser();
  await createOrder(stranger, 'go_deeper_3'); // another account is not affected
});

test('set_payment_order_link_status: only the owner, only once, only from created', async () => {
  const owner = await newUser();
  const other = await newUser();
  const id = await createOrder(owner, 'go_deeper_3');
  const call = async (o: string, who: string, status: string) => (await db.query<{ r: boolean }>('select public.set_payment_order_link_status($1, $2, $3) as r', [o, who, status])).rows[0].r;
  assert.equal(await call(id, other, 'link_created'), false);
  assert.equal(await call(id, owner, 'granted'), false);
  assert.equal(await call(id, owner, 'link_created'), true);
  assert.equal(await call(id, owner, 'link_failed'), false);
  assert.equal((await order(id)).status, 'link_created');
});

test('an order whose link step failed (or was never marked) can still be paid and completed', async () => {
  const owner = await newUser();
  const failed = await createOrder(owner, 'go_deeper_3');
  await db.query('select public.set_payment_order_link_status($1, $2, $3)', [failed, owner, 'link_failed']);
  assert.equal((await complete(failed, 'TX-9201', 59)).status, 'granted');
});

test('privileges: only service_role can run the payment functions or read the table; clients and anon cannot', async () => {
  const owner = await newUser();
  const id = await createOrder(owner, 'go_deeper_3');
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(db.query('select public.complete_payment_order($1, $2, $3, $4, $5)', [id, 'TX-9301', 59, 'ILS', 'PAID']), /permission denied/, role);
      await assert.rejects(db.query('select public.create_payment_order($1, $2, $3, $4)', [owner, 'go_deeper_3', 59, 3]), /permission denied/, role);
      await assert.rejects(db.query('select * from public.payment_orders'), /permission denied/, role);
      await assert.rejects(db.query('update public.payment_orders set status = $1', ['granted']), /permission denied/, role);
    } finally {
      await db.exec('reset role');
    }
  }
  await db.exec('set role service_role');
  try {
    const r = await db.query<{ r: Outcome }>('select public.complete_payment_order($1, $2, $3, $4, $5) as r', [id, 'TX-9301', 59, 'ILS', 'PAID']);
    assert.equal(r.rows[0].r.status, 'granted');
  } finally {
    await db.exec('reset role');
  }
});

test('the ledger\'s own unique (reason, external_ref) index is a second, independent guard against a double grant', async () => {
  const owner = await newUser();
  const id = await createOrder(owner, 'go_deeper_3');
  await complete(id, 'TX-9401', 59);
  const again = await db.query<{ r: Outcome }>("select public.grant_credits($1, 3, 'purchase', 'grow:TX-9401') as r", [owner]);
  assert.equal(again.rows[0].r.status, 'duplicate');
  assert.equal(await balance(owner), 3);
});
