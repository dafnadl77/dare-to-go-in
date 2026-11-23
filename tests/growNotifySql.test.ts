import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { growNotifyCheck, handleGrowNotify, VERIFIED_LINK_FIELDS, VERIFIED_SHAPES, type GrowNotifyDeps, type GrowShape, type LinkFieldPair } from '../server/payments/growNotify.ts';
import { COMPLETION_STATUSES, type CompletionStatus } from '../server/payments/completionStore.ts';
import type { CompletionRequest } from '../server/payments/completionRequest.ts';
import { BOUND_COMPLETION_STATUSES, transactionHash, type BindRequest, type BoundCompletionRequest, type BoundCompletionStatus, type NoticeEntry } from '../server/payments/growLinkBinding.ts';
import { bindCheckoutLink } from '../server/payments/checkoutStart.ts';
import type { ApproveRequest, GrowApprover } from '../server/payments/growApprove.ts';

/**
 * The grant path against an ISOLATED in-process PostgreSQL (PGlite) running the real payment SQL plus the new, unapplied
 * 20261123_payment_order_links.sql: the planned way to test granting without any production key. The verified shape and link
 * fields are injected here only; production keeps VERIFIED_SHAPES and VERIFIED_LINK_FIELDS empty. All values are fictional.
 */

const sql = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const SECRET = 'q'.repeat(40);
const GROW_IP = '3.123.194.128';
const TEST_ONLY_SHAPES: readonly GrowShape[] = ['flat/brackets'];
const TEST_ONLY_LINK_FIELDS: readonly LinkFieldPair[] = ['processId/processToken'];
const ENV = { VERCEL_ENV: 'production', GROW_NOTIFY_MODE: 'on', GROW_NOTIFY_IPS: GROW_IP, GROW_NOTIFY_SECRET: SECRET, GROW_ENVIRONMENT: 'production', GROW_MERCHANT_REF: 'dare-test', GROW_LINK_TOKEN_KEY: 'k'.repeat(40) } as NodeJS.ProcessEnv;

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
  await db.exec(sql('20261123_payment_order_links.sql'));
});
after(async () => {
  await db.close();
});

/** The real SQL binding as the store: exactly what growLinkBinding sends over RPC. */
async function sqlBind(r: BindRequest) {
  const res = await db.query<{ r: string }>('select public.bind_payment_order_link($1, $2, $3, $4, $5, $6, $7) as r', [r.orderId, r.ownerId, r.environment, r.merchant, r.processId, r.tokenHash, r.tokenInUrl]);
  return res.rows[0].r as Awaited<ReturnType<typeof bindCheckoutLink>> & string;
}

let seq = 0;
/** An order as checkout leaves it: created, link_created, and bound through the real checkout binding code. */
async function newOrder(pkg: 'go_deeper_3' | 'explore_10' = 'go_deeper_3', options: { bind?: boolean } = {}) {
  const owner = (await db.query<{ id: string }>('insert into auth.users default values returning id')).rows[0].id;
  const [amount, credits] = pkg === 'go_deeper_3' ? [59, 3] : [149, 10];
  const r = await db.query<{ r: { order_id: string } }>('select public.create_payment_order($1, $2, $3, $4) as r', [owner, pkg, amount, credits]);
  const order = r.rows[0].r.order_id;
  await db.query('select public.set_payment_order_link_status($1, $2, $3)', [order, owner, 'link_created']);
  seq += 1;
  const ids = { processId: `9100${seq}`, processToken: `tok${order.slice(0, 16)}` };
  if (options.bind !== false) assert.equal(await bindCheckoutLink(order, owner, 'https://pay.grow.link/x', ids, ENV, sqlBind), 'bound');
  return { owner, order, ids };
}
const balance = async (owner: string) => (await db.query<{ b: number }>('select public.get_credit_balance($1) as b', [owner])).rows[0].b;
const ledger = async (owner: string) => (await db.query('select * from public.credit_ledger where owner_id = $1', [owner])).rows.length;
const orderRow = async (order: string) => (await db.query<Record<string, unknown>>('select status, provider_tx, provider_status, review_reason from public.payment_orders where id = $1', [order])).rows[0];

async function sqlCompleteBound(r: BoundCompletionRequest): Promise<BoundCompletionStatus | null> {
  const res = await db.query<{ r: { status: string } }>('select public.complete_bound_payment_order($1, $2, $3, $4, $5, $6, $7, $8, $9) as r', [r.orderId, r.environment, r.merchant, r.processId, r.tokenHash, r.transactionId, r.amount, r.currency, r.providerStatus]);
  const s = res.rows[0].r.status;
  return (BOUND_COMPLETION_STATUSES as readonly string[]).includes(s) ? (s as BoundCompletionStatus) : null;
}
/** The existing completion, as the Make path calls it. */
async function sqlComplete(r: CompletionRequest): Promise<CompletionStatus | null> {
  const res = await db.query<{ r: { status: string } }>('select public.complete_payment_order($1, $2, $3, $4, $5) as r', [r.orderId, r.transactionId, r.amount, r.currency, r.providerStatus]);
  const s = res.rows[0].r.status;
  return (COMPLETION_STATUSES as readonly string[]).includes(s) ? (s as CompletionStatus) : null;
}
async function sqlLogNotice(e: NoticeEntry) {
  await db.query('select public.log_payment_notice($1, $2, $3, $4, $5, $6, $7)', [e.environment, e.orderId, e.txHash, e.statusCode, e.shape, e.outcome, e.approve]);
}

const approvals: ApproveRequest[] = [];
const recordingApprover: GrowApprover = { approve: async (r) => (approvals.push(r), 'approved') };

const deps = (over: Partial<GrowNotifyDeps> = {}): GrowNotifyDeps => ({
  env: ENV,
  complete: sqlCompleteBound,
  verifiedShapes: TEST_ONLY_SHAPES,
  verifiedLinkFields: TEST_ONLY_LINK_FIELDS,
  logNotice: sqlLogNotice,
  approver: recordingApprover,
  log: () => undefined,
  ...over,
});
const notification = (o: { order: string; ids: { processId: string; processToken: string } }, over: Record<string, unknown> = {}) => ({
  transactionId: 'GT' + o.order.slice(0, 10),
  transactionToken: 'ttok-fictional',
  statusCode: '2',
  sum: '59',
  allPaymentsNum: '1',
  processId: o.ids.processId,
  processToken: o.ids.processToken,
  'customFields[cField1]': o.order,
  'customFields[cField2]': growNotifyCheck(o.order, SECRET),
  ...over,
});
const send = (body: unknown, d = deps()) => handleGrowNotify({ method: 'POST', vercelForwardedFor: GROW_IP, contentType: 'application/x-www-form-urlencoded', contentLength: undefined, readBody: () => body }, d);

test('isolated DB: production switches stay empty; with the real constants nothing is written', async () => {
  assert.deepEqual([VERIFIED_SHAPES, VERIFIED_LINK_FIELDS], [[], []]);
  const o = await newOrder();
  assert.equal((await send(notification(o), deps({ verifiedShapes: VERIFIED_SHAPES }))).status, 503);
  assert.equal((await send(notification(o), deps({ verifiedLinkFields: VERIFIED_LINK_FIELDS }))).status, 400, 'link fields not verified: refused');
  assert.equal(await balance(o.owner), 0);
  assert.equal((await orderRow(o.order)).status, 'link_created');
});

test('isolated DB: a verified, bound, paid notification grants exactly the order\'s credits, once, through the existing SQL', async () => {
  const o = await newOrder();
  approvals.length = 0;
  assert.equal((await send(notification(o))).status, 200);
  assert.equal(await balance(o.owner), 3);
  assert.deepEqual(await orderRow(o.order), { status: 'granted', provider_tx: 'GT' + o.order.slice(0, 10), provider_status: 'grow:2', review_reason: null });
  assert.equal(approvals.length, 1, 'approved after the grant');
  const notices = (await db.query<Record<string, unknown>>('select environment, order_id, tx_hash, status_code, outcome, approve from public.payment_notices where order_id = $1', [o.order])).rows;
  assert.deepEqual(notices, [{ environment: 'production', order_id: o.order, tx_hash: transactionHash('GT' + o.order.slice(0, 10)), status_code: '2', outcome: 'granted', approve: 'approved' }]);
});

test('isolated DB: replay x6 and 10 parallel copies grant once (one ledger row), each acknowledged again', async () => {
  const o = await newOrder();
  approvals.length = 0;
  for (let i = 0; i < 6; i++) assert.equal((await send(notification(o))).status, 200);
  const results = await Promise.all(Array.from({ length: 10 }, () => send(notification(o))));
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(await balance(o.owner), 3);
  assert.equal(await ledger(o.owner), 1);
  assert.equal(approvals.length, 16, 'every copy (granted or duplicate) is approved; none grants twice');
  const outcomes = (await db.query<{ outcome: string; n: number }>('select outcome, count(*)::int as n from public.payment_notices where order_id = $1 group by outcome order by outcome', [o.order])).rows;
  assert.deepEqual(outcomes, [{ outcome: 'duplicate', n: 15 }, { outcome: 'granted', n: 1 }]);
});

test('isolated DB: a temporary failure is retried safely: 503 first (nothing written), then exactly one grant', async () => {
  const o = await newOrder();
  let down = true;
  const flaky = deps({ complete: async (r) => (down ? null : sqlCompleteBound(r)) });
  assert.equal((await send(notification(o), flaky)).status, 503, 'Grow keeps the notification and retries');
  assert.equal(await balance(o.owner), 0);
  assert.equal((await orderRow(o.order)).status, 'link_created');
  down = false;
  assert.equal((await send(notification(o), flaky)).status, 200);
  assert.equal((await send(notification(o), flaky)).status, 200);
  assert.equal(await balance(o.owner), 3);
  assert.equal(await ledger(o.owner), 1);
});

test('isolated DB: an Approve that fails or throws never undoes the grant; the retry is a duplicate and is approved again', async () => {
  const o = await newOrder();
  let calls = 0;
  const brokenThenOk: GrowApprover = { approve: async () => ((calls += 1), calls === 1 ? Promise.reject(new Error('grow down')) : 'approved') };
  assert.equal((await send(notification(o), deps({ approver: brokenThenOk }))).status, 200);
  assert.equal(await balance(o.owner), 3);
  assert.equal((await send(notification(o), deps({ approver: brokenThenOk }))).status, 200);
  assert.equal(await balance(o.owner), 3);
  assert.equal(await ledger(o.owner), 1);
  const rows = (await db.query<{ outcome: string; approve: string }>('select outcome, approve from public.payment_notices where order_id = $1 order by id', [o.order])).rows;
  assert.deepEqual(rows, [{ outcome: 'granted', approve: 'failed' }, { outcome: 'duplicate', approve: 'approved' }]);
});

test('isolated DB: wrong link ids, an unbound order, a check for another order, a wrong amount or a second transaction never grant', async () => {
  const a = await newOrder();
  const b = await newOrder();
  // B's notification carrying A's id with B's check
  assert.equal((await send(notification(a, { 'customFields[cField2]': growNotifyCheck(b.order, SECRET) }))).status, 403);
  // A's order with B's link ids, or with a guessed token, or a swapped process id
  assert.equal((await send(notification(a, { processId: b.ids.processId, processToken: b.ids.processToken }))).status, 200);
  assert.equal((await send(notification(a, { processToken: 'tokguessed0000000' }))).status, 200);
  assert.equal((await send(notification(a, { processId: b.ids.processId }))).status, 200);
  assert.equal(await balance(a.owner), 0);
  assert.deepEqual(await orderRow(a.order), { status: 'link_created', provider_tx: null, provider_status: null, review_reason: null }, 'a mismatch writes nothing to the order');
  // An order that was never bound cannot be completed by the direct path at all.
  const c = await newOrder('go_deeper_3', { bind: false });
  assert.equal((await send(notification(c))).status, 200);
  assert.equal(await balance(c.owner), 0);
  // wrong amount: kept for review by the existing function, order stays open
  assert.equal((await send(notification(a, { sum: '149' }))).status, 200);
  assert.equal(await balance(a.owner), 0);
  assert.equal((await orderRow(a.order)).review_reason, 'amount_mismatch');
  // the right payment later completes it; a different transaction afterwards does not add anything
  assert.equal((await send(notification(a, { transactionId: 'GTgood0001' }))).status, 200);
  assert.equal((await send(notification(a, { transactionId: 'GTother0002' }))).status, 200);
  assert.equal(await balance(a.owner), 3);
  assert.equal(await ledger(a.owner), 1);
  assert.equal(await balance(b.owner), 0);
  const outcomes = (await db.query<{ outcome: string }>('select outcome from public.payment_notices where order_id in ($1, $2) order by id', [a.order, c.order])).rows.map((r) => r.outcome);
  assert.deepEqual(outcomes, ['link_mismatch', 'link_mismatch', 'link_mismatch', 'link_missing', 'amount_mismatch', 'granted', 'order_already_completed']);
});

test('isolated DB: the order must be open: a link_failed order or a created order is refused even with matching ids', async () => {
  const o = await newOrder();
  await db.query("update public.payment_orders set status = 'link_failed' where id = $1", [o.order]); // test setup only
  assert.equal((await send(notification(o))).status, 200);
  assert.equal(await balance(o.owner), 0);
  const last = (await db.query<{ outcome: string }>('select outcome from public.payment_notices where order_id = $1 order by id desc limit 1', [o.order])).rows[0];
  assert.equal(last.outcome, 'order_not_open');
});

test('isolated DB: Make and Grow reporting the same payment (same or different id) still grant once', async () => {
  const o = await newOrder();
  assert.equal((await send(notification(o))).status, 200);
  const sameTx = await sqlComplete({ orderId: o.order, transactionId: 'GT' + o.order.slice(0, 10), amount: 59, currency: 'ILS', providerStatus: 'Paid' });
  const otherTx = await sqlComplete({ orderId: o.order, transactionId: 'MAKE-ASMACHTA-1', amount: 59, currency: 'ILS', providerStatus: 'Paid' });
  assert.deepEqual([sameTx, otherTx], ['duplicate', 'order_already_completed']);
  assert.equal(await balance(o.owner), 3);
  // and the other way round: Make first, then the direct notification
  const p = await newOrder();
  assert.equal(await sqlComplete({ orderId: p.order, transactionId: 'GT' + p.order.slice(0, 10), amount: 59, currency: 'ILS', providerStatus: 'Paid' }), 'granted');
  assert.equal((await send(notification(p))).status, 200);
  assert.equal(await balance(p.owner), 3);
  assert.equal(await ledger(p.owner), 1);
});

test('isolated DB: a non-paid notification grants nothing, writes nothing to the order, and is kept in the notice log', async () => {
  const o = await newOrder();
  assert.equal((await send(notification(o, { statusCode: '3' }))).status, 200);
  assert.deepEqual(await orderRow(o.order), { status: 'link_created', provider_tx: null, provider_status: null, review_reason: null });
  assert.equal(await balance(o.owner), 0);
  const n = (await db.query<{ outcome: string; status_code: string }>('select outcome, status_code from public.payment_notices where order_id = $1', [o.order])).rows;
  assert.deepEqual(n, [{ outcome: 'not_paid', status_code: '3' }]);
});
