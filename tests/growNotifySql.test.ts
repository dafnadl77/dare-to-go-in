import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { growNotifyCheck, handleGrowNotify, VERIFIED_SHAPES, type GrowNotifyDeps, type GrowShape } from '../server/payments/growNotify.ts';
import { COMPLETION_STATUSES, type CompletionStatus } from '../server/payments/completionStore.ts';
import type { CompletionRequest } from '../server/payments/completionRequest.ts';

/**
 * The grant path against an ISOLATED in-process PostgreSQL (PGlite) running the real payment SQL: the planned way to test granting
 * without any production key. The verified shape is injected here only; production keeps VERIFIED_SHAPES empty.
 */

const sql = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const SECRET = 'q'.repeat(40);
const GROW_IP = '3.123.194.128';
const TEST_ONLY_SHAPES: readonly GrowShape[] = ['flat/brackets'];

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
  await db.exec(`
    alter table public.credit_ledger alter column owner_id drop not null;
    alter table public.credit_ledger drop constraint if exists credit_ledger_owner_id_fkey;
    alter table public.credit_ledger add constraint credit_ledger_owner_id_fkey foreign key (owner_id) references auth.users (id) on delete set null;
  `);
  await db.exec(sql('20261007_payment_orders.sql'));
});
after(async () => {
  await db.close();
});

async function newOrder(pkg: 'go_deeper_3' | 'explore_10' = 'go_deeper_3') {
  const owner = (await db.query<{ id: string }>('insert into auth.users default values returning id')).rows[0].id;
  const [amount, credits] = pkg === 'go_deeper_3' ? [59, 3] : [149, 10];
  const r = await db.query<{ r: { order_id: string } }>('select public.create_payment_order($1, $2, $3, $4) as r', [owner, pkg, amount, credits]);
  return { owner, order: r.rows[0].r.order_id };
}
const balance = async (owner: string) => (await db.query<{ b: number }>('select public.get_credit_balance($1) as b', [owner])).rows[0].b;
const ledger = async (owner: string) => (await db.query('select * from public.credit_ledger where owner_id = $1', [owner])).rows.length;

/** The real SQL function as the store: exactly what completionStore sends over RPC. */
async function sqlComplete(r: CompletionRequest): Promise<CompletionStatus | null> {
  const res = await db.query<{ r: { status: string } }>('select public.complete_payment_order($1, $2, $3, $4, $5) as r', [r.orderId, r.transactionId, r.amount, r.currency, r.providerStatus]);
  const s = res.rows[0].r.status;
  return (COMPLETION_STATUSES as readonly string[]).includes(s) ? (s as CompletionStatus) : null;
}
const deps = (over: Partial<GrowNotifyDeps> = {}): GrowNotifyDeps => ({
  env: { VERCEL_ENV: 'production', GROW_NOTIFY_MODE: 'on', GROW_NOTIFY_IPS: GROW_IP, GROW_NOTIFY_SECRET: SECRET } as NodeJS.ProcessEnv,
  complete: sqlComplete,
  recordNotice: async (o, s) => void (await db.query('select public.record_payment_notice($1, $2)', [o, s])),
  verifiedShapes: TEST_ONLY_SHAPES,
  log: () => undefined,
  ...over,
});
const notification = (order: string, over: Record<string, unknown> = {}) => ({
  transactionId: 'GT' + order.slice(0, 10),
  statusCode: '2',
  sum: '59',
  allPaymentsNum: '1',
  'customFields[cField1]': order,
  'customFields[cField2]': growNotifyCheck(order, SECRET),
  ...over,
});
const send = (body: unknown, d = deps()) => handleGrowNotify({ method: 'POST', vercelForwardedFor: GROW_IP, contentType: 'application/x-www-form-urlencoded', contentLength: undefined, readBody: () => body }, d);

test('isolated DB: production shapes stay empty; with the real constant nothing is written', async () => {
  assert.deepEqual(VERIFIED_SHAPES, []);
  const { owner, order } = await newOrder();
  assert.equal((await send(notification(order), deps({ verifiedShapes: VERIFIED_SHAPES }))).status, 503);
  assert.equal(await balance(owner), 0);
  assert.equal((await db.query('select status from public.payment_orders where id = $1', [order])).rows[0].status, 'created');
});

test('isolated DB: a verified paid notification grants exactly the order\'s credits, once, through the existing SQL', async () => {
  const { owner, order } = await newOrder();
  assert.equal((await send(notification(order))).status, 200);
  assert.equal(await balance(owner), 3);
  const row = (await db.query<Record<string, unknown>>('select status, provider_tx, provider_status, paid_currency from public.payment_orders where id = $1', [order])).rows[0];
  assert.deepEqual(row, { status: 'granted', provider_tx: 'GT' + order.slice(0, 10), provider_status: 'grow:2', paid_currency: 'ILS' });
});

test('isolated DB: replay x6 and 10 parallel copies grant once (one ledger row)', async () => {
  const { owner, order } = await newOrder();
  for (let i = 0; i < 6; i++) assert.equal((await send(notification(order))).status, 200);
  const results = await Promise.all(Array.from({ length: 10 }, () => send(notification(order))));
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(await balance(owner), 3);
  assert.equal(await ledger(owner), 1);
});

test('isolated DB: a check for another order, a wrong amount, or a second transaction never grant', async () => {
  const a = await newOrder();
  const b = await newOrder();
  // B's notification carrying A's id with B's check
  assert.equal((await send(notification(a.order, { 'customFields[cField2]': growNotifyCheck(b.order, SECRET) }))).status, 403);
  // wrong amount: kept for review, order stays open
  assert.equal((await send(notification(a.order, { sum: '149' }))).status, 200);
  assert.equal(await balance(a.owner), 0);
  const review = (await db.query<Record<string, unknown>>('select status, review_reason from public.payment_orders where id = $1', [a.order])).rows[0];
  assert.deepEqual(review, { status: 'created', review_reason: 'amount_mismatch' });
  // the right payment later completes it; a different transaction afterwards does not add anything
  assert.equal((await send(notification(a.order, { transactionId: 'GTgood0001' }))).status, 200);
  assert.equal((await send(notification(a.order, { transactionId: 'GTother0002' }))).status, 200);
  assert.equal(await balance(a.owner), 3);
  assert.equal(await ledger(a.owner), 1);
  assert.equal(await balance(b.owner), 0);
});

test('isolated DB: Make and Grow reporting the same payment (same or different id) still grant once', async () => {
  const { owner, order } = await newOrder();
  assert.equal((await send(notification(order))).status, 200);
  const sameTx = await sqlComplete({ orderId: order, transactionId: 'GT' + order.slice(0, 10), amount: 59, currency: 'ILS', providerStatus: 'Paid' });
  const otherTx = await sqlComplete({ orderId: order, transactionId: 'MAKE-ASMACHTA-1', amount: 59, currency: 'ILS', providerStatus: 'Paid' });
  assert.deepEqual([sameTx, otherTx], ['duplicate', 'order_already_completed']);
  assert.equal(await balance(owner), 3);
});

test('isolated DB: a non-paid notification grants nothing and keeps the order open', async () => {
  const { owner, order } = await newOrder();
  assert.equal((await send(notification(order, { statusCode: '3' }))).status, 200);
  const row = (await db.query<Record<string, unknown>>('select status, provider_status from public.payment_orders where id = $1', [order])).rows[0];
  assert.deepEqual(row, { status: 'created', provider_status: 'grow:3' });
  assert.equal(await balance(owner), 0);
});
