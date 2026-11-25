import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { growNotifyCheck, handleGrowNotify, VERIFIED_LINK_FIELDS, VERIFIED_SHAPES, type GrowNotifyDeps, type GrowShape, type LinkFieldPair } from '../server/payments/growNotify.ts';
import { BOUND_COMPLETION_STATUSES, type BindRequest, type BoundCompletionRequest, type BoundCompletionStatus, type NoticeEntry } from '../server/payments/growLinkBinding.ts';
import { bindCheckoutLink } from '../server/payments/checkoutStart.ts';
import type { GrowApprover } from '../server/payments/growApprove.ts';

/**
 * 2026-11-25. Local only, isolated in-process PostgreSQL (PGlite), fictional values, no network, no Supabase.
 *
 * Pins the notification EXACTLY as the one real Grow Sandbox payment (2026-11-24) showed it in Make's parsed view: fields under
 * `data`, custom fields nested under `customFields`, and the payment-link identifiers in paymentLinkProcessId /
 * paymentLinkProcessToken (the processId / processToken pair beside them identify the TRANSACTION, not the link). Only the shape
 * and field names come from the observation; every value here is invented. The production switches stay empty: the shape and link
 * fields below are injected by the tests only.
 *
 * Also pins what one payment, two payments, a non-paid status and the other order's transaction do.
 */

const sql = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const SECRET = 'q'.repeat(40);
const GROW_IP = '18.156.94.176'; // one of the addresses the Sandbox notifications actually came from (on Grow's published list)
const OBSERVED_SHAPES: readonly GrowShape[] = ['wrapped/nested'];
const OBSERVED_LINK_FIELDS: readonly LinkFieldPair[] = ['paymentLinkProcessId/paymentLinkProcessToken'];
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

async function sqlBind(r: BindRequest) {
  const res = await db.query<{ r: string }>('select public.bind_payment_order_link($1, $2, $3, $4, $5, $6, $7) as r', [r.orderId, r.ownerId, r.environment, r.merchant, r.processId, r.tokenHash, r.tokenInUrl]);
  return res.rows[0].r as Awaited<ReturnType<typeof bindCheckoutLink>> & string;
}
async function sqlCompleteBound(r: BoundCompletionRequest): Promise<BoundCompletionStatus | null> {
  const res = await db.query<{ r: { status: string } }>('select public.complete_bound_payment_order($1, $2, $3, $4, $5, $6, $7, $8, $9) as r', [r.orderId, r.environment, r.merchant, r.processId, r.tokenHash, r.transactionId, r.amount, r.currency, r.providerStatus]);
  const s = res.rows[0].r.status;
  return (BOUND_COMPLETION_STATUSES as readonly string[]).includes(s) ? (s as BoundCompletionStatus) : null;
}
async function sqlLogNotice(e: NoticeEntry) {
  await db.query('select public.log_payment_notice($1, $2, $3, $4, $5, $6, $7)', [e.environment, e.orderId, e.txHash, e.statusCode, e.shape, e.outcome, e.approve]);
}

let seq = 0;
async function newOrder(bind = true) {
  const owner = (await db.query<{ id: string }>('insert into auth.users default values returning id')).rows[0].id;
  const created = await db.query<{ r: { order_id: string } }>('select public.create_payment_order($1, $2, $3, $4) as r', [owner, 'go_deeper_3', 59, 3]);
  const order = created.rows[0].r.order_id;
  await db.query('select public.set_payment_order_link_status($1, $2, $3)', [order, owner, 'link_created']);
  seq += 1;
  // Fictional values in the formats seen: a short numeric link id and a 32-hex link token.
  const ids = { processId: `8${String(seq).padStart(4, '0')}`, processToken: order.split('').reverse().join('') };
  if (bind) assert.equal(await bindCheckoutLink(order, owner, 'https://sandbox.example/pay', ids, ENV, sqlBind), 'bound');
  return { owner, order, ids };
}
const balance = async (owner: string) => (await db.query<{ b: number }>('select public.get_credit_balance($1) as b', [owner])).rows[0].b;
const ledgerRows = async (owner: string) => (await db.query('select * from public.credit_ledger where owner_id = $1', [owner])).rows.length;
const orderRow = async (order: string) => (await db.query<Record<string, unknown>>('select status, provider_tx, review_reason from public.payment_orders where id = $1', [order])).rows[0];
const outcomes = async (order: string) => (await db.query<{ outcome: string }>('select outcome from public.payment_notices where order_id = $1 order by id', [order])).rows.map((r) => r.outcome);

const approver: GrowApprover = { approve: async () => 'approved' };
const deps = (over: Partial<GrowNotifyDeps> = {}): GrowNotifyDeps => ({
  env: ENV,
  complete: sqlCompleteBound,
  verifiedShapes: OBSERVED_SHAPES,
  verifiedLinkFields: OBSERVED_LINK_FIELDS,
  logNotice: sqlLogNotice,
  approver,
  log: () => undefined,
  ...over,
});

type O = { order: string; ids: { processId: string; processToken: string } };
/** The observed layout (values fictional). `withCheck` = the DARE order check in custom field 2, which the Sandbox test did NOT send. */
const observed = (o: O, over: Record<string, unknown> = {}, data: Record<string, unknown> = {}, withCheck = true) => ({
  err: '',
  status: '1',
  data: {
    status: 'שולם',
    statusCode: '2',
    transactionTypeId: '1',
    paymentType: '2',
    sum: '59',
    paymentsNum: '0',
    allPaymentsNum: '1',
    paymentDate: '24/11/26',
    description: 'Sandbox Test',
    transactionId: 'TX' + o.order.slice(0, 10),
    transactionToken: 'ttok-fictional',
    paymentLinkProcessId: o.ids.processId,
    paymentLinkProcessToken: o.ids.processToken,
    asmachta: '100000001',
    processId: '900001', // the TRANSACTION's identifiers: present beside the link's, and never what the binding reads
    processToken: 'transaction-process-token-fictional',
    customFields: { cField1: o.order, ...(withCheck ? { cField2: growNotifyCheck(o.order, SECRET) } : {}) },
    ...data,
  },
  ...over,
});
const send = (body: unknown, d = deps()) =>
  handleGrowNotify({ method: 'POST', vercelForwardedFor: GROW_IP, contentType: 'application/x-www-form-urlencoded', contentLength: undefined, readBody: () => body }, d);

// ---------------------------------------------------------------------------------------------- the observed layout ----

test('observed layout: the notification as Grow sent it in the Sandbox, plus the DARE check, grants once and is approved afterwards', async () => {
  const o = await newOrder();
  assert.equal((await send(observed(o))).status, 200);
  assert.equal(await balance(o.owner), 3);
  assert.equal(await ledgerRows(o.owner), 1);
  assert.deepEqual(await orderRow(o.order), { status: 'granted', provider_tx: 'TX' + o.order.slice(0, 10), review_reason: null });
  assert.deepEqual(await outcomes(o.order), ['granted']);
});

test('observed layout: the Sandbox notification AS RECEIVED (no order check in custom field 2) is refused and grants nothing', async () => {
  const o = await newOrder();
  const r = await send(observed(o, {}, {}, false));
  assert.equal(r.status, 403, 'refused at the order binding: DARE sent no notifyCheck in that test');
  assert.equal(await balance(o.owner), 0);
  assert.deepEqual(await orderRow(o.order), { status: 'link_created', provider_tx: null, review_reason: null });
});

test('observed layout: the transaction\'s own processId/processToken are never used; only the link pair counts', async () => {
  const o = await newOrder();
  // Correct link pair but a different transaction pair: still grants. Correct transaction pair but a wrong link pair: refused.
  assert.equal((await send(observed(o, {}, { processId: '1', processToken: 'x'.repeat(32) }))).status, 200);
  assert.equal(await balance(o.owner), 3);
  const p = await newOrder();
  assert.equal((await send(observed(p, {}, { paymentLinkProcessId: o.ids.processId, paymentLinkProcessToken: o.ids.processToken }))).status, 200);
  assert.equal(await balance(p.owner), 0);
  assert.deepEqual(await outcomes(p.order), ['link_mismatch']);
});

// ---------------------------------------------------------------------------------------------- one or two payments ----

test('one payment: allPaymentsNum 1 with statusCode 2 and the exact sum grants; paymentsNum 0 as Grow reports it is accepted', async () => {
  const o = await newOrder();
  assert.equal((await send(observed(o, {}, { paymentsNum: '0', allPaymentsNum: '1' }))).status, 200);
  assert.equal(await balance(o.owner), 3);
});

test('two payments: every installments layout is refused with nothing granted and nothing written to the order (Grow will resend)', async () => {
  const layouts: [string, Record<string, unknown>][] = [
    ['2 of 2, full sum', { allPaymentsNum: '2', paymentsNum: '2', sum: '59' }],
    ['2 of 2, first installment only', { allPaymentsNum: '2', paymentsNum: '1', sum: '29.50' }],
    ['2 of 2, half sum, count 0', { allPaymentsNum: '2', paymentsNum: '0', sum: '29.5' }],
    ['3 payments', { allPaymentsNum: '3', paymentsNum: '3', sum: '59' }],
    ['count missing', { allPaymentsNum: undefined }],
  ];
  for (const [name, data] of layouts) {
    const o = await newOrder();
    const r = await send(observed(o, {}, data));
    assert.equal(r.status, 400, name);
    assert.equal(await balance(o.owner), 0, name);
    assert.deepEqual(await orderRow(o.order), { status: 'link_created', provider_tx: null, review_reason: null }, name);
    assert.deepEqual(await outcomes(o.order), ['invalid_payments'], name);
  }
});

test('two payments, DOCUMENTED GAP: a real customer who picks 2 installments pays but is never credited by the direct path (Grow keeps resending)', async () => {
  // This test records current behaviour, not a wish. Production creates links with "max 2 payments", so a customer CAN choose two.
  // The answer is a product decision (offer one payment only, or accept an observed installments layout); until Sandbox shows what
  // Grow sends for installments, the safe behaviour is the refusal above.
  const o = await newOrder();
  const first = await send(observed(o, {}, { allPaymentsNum: '2', paymentsNum: '1', sum: '29.50' }));
  assert.equal(first.status, 400);
  assert.equal(await balance(o.owner), 0);
});

// ---------------------------------------------------------------------------------- status and amount before credits ----

test('no credits before a paid status: every other statusCode (and the Hebrew text alone) grants nothing and leaves the order open', async () => {
  for (const code of ['0', '1', '3', '4', '5', '20', '200']) {
    const o = await newOrder();
    assert.equal((await send(observed(o, {}, { statusCode: code }))).status, 200, code);
    assert.equal(await balance(o.owner), 0, code);
    assert.deepEqual(await orderRow(o.order), { status: 'link_created', provider_tx: null, review_reason: null }, code);
    assert.deepEqual(await outcomes(o.order), ['not_paid'], code);
  }
  const t = await newOrder();
  assert.equal((await send(observed(t, {}, { statusCode: '1', status: 'שולם' }))).status, 200);
  assert.equal(await balance(t.owner), 0, 'the text "שולם" never decides; only statusCode 2');
});

test('amount: the sum must equal the order exactly; a lower, higher or fractional sum grants nothing and is kept for review', async () => {
  for (const sum of ['58.99', '59.01', '60', '29.5', '149']) {
    const o = await newOrder();
    assert.equal((await send(observed(o, {}, { sum }))).status, 200, sum);
    assert.equal(await balance(o.owner), 0, sum);
    assert.equal((await orderRow(o.order)).review_reason, 'amount_mismatch', sum);
    assert.equal((await orderRow(o.order)).status, 'link_created', sum);
  }
});

// ------------------------------------------------------------------------------------------------ link identifiers ----

test('link ids: a wrong id with the right token, and a right id with a wrong token, both grant nothing and write nothing to the order', async () => {
  const o = await newOrder();
  assert.equal((await send(observed(o, {}, { paymentLinkProcessId: '99999' }))).status, 200);
  assert.equal((await send(observed(o, {}, { paymentLinkProcessToken: 'a'.repeat(32) }))).status, 200);
  assert.equal((await send(observed(o, {}, { paymentLinkProcessToken: o.ids.processToken.toUpperCase() }))).status, 200, 'case matters');
  assert.equal(await balance(o.owner), 0);
  assert.deepEqual(await orderRow(o.order), { status: 'link_created', provider_tx: null, review_reason: null });
  assert.deepEqual(await outcomes(o.order), ['link_mismatch', 'link_mismatch', 'link_mismatch']);
});

test('link ids: missing, empty or malformed ids are refused before the database (400) and grant nothing', async () => {
  for (const [name, data] of [
    ['id missing', { paymentLinkProcessId: undefined }],
    ['token missing', { paymentLinkProcessToken: undefined }],
    ['both missing', { paymentLinkProcessId: undefined, paymentLinkProcessToken: undefined }],
    ['id empty', { paymentLinkProcessId: '' }],
    ['token with a space', { paymentLinkProcessToken: 'bad token' }],
    ['id with a quote', { paymentLinkProcessId: "1'--" }],
    ['token as an object', { paymentLinkProcessToken: { v: 1 } }],
  ] as [string, Record<string, unknown>][]) {
    const o = await newOrder();
    const r = await send(observed(o, {}, data));
    assert.equal(r.status, 400, name);
    assert.equal(await balance(o.owner), 0, name);
    assert.deepEqual(await orderRow(o.order), { status: 'link_created', provider_tx: null, review_reason: null }, name);
  }
});

test('duplicate notice: the same paid notification five more times adds nothing; a later notice with wrong ids cannot touch the closed order', async () => {
  const o = await newOrder();
  assert.equal((await send(observed(o))).status, 200);
  for (let i = 0; i < 5; i++) assert.equal((await send(observed(o))).status, 200);
  assert.equal(await balance(o.owner), 3);
  assert.equal(await ledgerRows(o.owner), 1);
  assert.equal((await send(observed(o, {}, { paymentLinkProcessToken: 'b'.repeat(32) }))).status, 200);
  assert.equal(await balance(o.owner), 3);
  assert.deepEqual(await outcomes(o.order), ['granted', 'duplicate', 'duplicate', 'duplicate', 'duplicate', 'duplicate', 'link_mismatch']);
});

test('another order\'s transaction: a transaction that already paid order A cannot pay order B, even with B\'s own correct ids and check', async () => {
  const a = await newOrder();
  const b = await newOrder();
  const txA = 'SHARED-TX-0001';
  assert.equal((await send(observed(a, {}, { transactionId: txA }))).status, 200);
  assert.equal(await balance(a.owner), 3);
  assert.equal((await send(observed(b, {}, { transactionId: txA }))).status, 200);
  assert.equal(await balance(b.owner), 0, 'B is not credited by A\'s transaction');
  assert.deepEqual(await orderRow(b.order), { status: 'link_created', provider_tx: null, review_reason: null });
  assert.deepEqual(await outcomes(b.order), ['transaction_used_by_other_order']);
  // B can still be completed by its own, different transaction.
  assert.equal((await send(observed(b))).status, 200);
  assert.equal(await balance(b.owner), 3);
  assert.equal(await ledgerRows(a.owner) + (await ledgerRows(b.owner)), 2, 'one ledger row per order');
});

test('another order\'s identity: B\'s notification carrying A\'s order id, link ids or check never credits B or A twice', async () => {
  const a = await newOrder();
  const b = await newOrder();
  // A's order id with B's check, B's link ids, or both.
  assert.equal((await send(observed(a, { }, { customFields: { cField1: a.order, cField2: growNotifyCheck(b.order, SECRET) } }))).status, 403);
  assert.equal((await send(observed(a, {}, { paymentLinkProcessId: b.ids.processId, paymentLinkProcessToken: b.ids.processToken }))).status, 200);
  assert.equal(await balance(a.owner), 0);
  assert.equal(await balance(b.owner), 0);
  assert.deepEqual(await outcomes(a.order), ['link_mismatch']);
});

// ---------------------------------------------------------------------------------------------------- the switches ----

test('the production switches are still empty: with the real constants, the observed notification grants nothing', async () => {
  assert.deepEqual([VERIFIED_SHAPES, VERIFIED_LINK_FIELDS], [[], []]);
  const o = await newOrder();
  const r = await send(observed(o), deps({ verifiedShapes: VERIFIED_SHAPES, verifiedLinkFields: VERIFIED_LINK_FIELDS }));
  assert.notEqual(r.status, 200);
  assert.equal(await balance(o.owner), 0);
});
