import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { parseCompletionRequest, type CompletionRequest } from '../server/payments/completionRequest.ts';
import { completionCall, legacyOrdersBefore, LINKED_COMPLETION_STATUSES, COMPLETION_STATUSES, type LinkedCompletionStatus } from '../server/payments/completionStore.ts';
import { handlePaymentComplete, type CompletionDeps } from '../server/payments/paymentComplete.ts';
import { checkCompletionAuth } from '../server/payments/completionAuth.ts';
import { handleStartCheckout, bindCheckoutLink, linkBindingRequired, type CheckoutDeps } from '../server/payments/checkoutStart.ts';
import { linkTokenHash, growLinkConfig, type BindRequest } from '../server/payments/growLinkBinding.ts';

/**
 * 2026-11-25. The Make path (POST /api/payment-complete) with the link check: request v2, which database function runs, old orders,
 * installments, and checkout when enforcement is on. Local only: an isolated in-process PostgreSQL (PGlite) running the real SQL
 * (including the two unapplied migrations), fictional values, no network, no Supabase.
 */

const sql = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const SECRET = 'm'.repeat(40);
const BASE_ENV = { VERCEL_ENV: 'production', MAKE_COMPLETION_SECRET: SECRET } as NodeJS.ProcessEnv;
const BIND_ENV = { ...BASE_ENV, GROW_ENVIRONMENT: 'production', GROW_MERCHANT_REF: 'dare-test', GROW_LINK_TOKEN_KEY: 'k'.repeat(40) } as NodeJS.ProcessEnv;
const AUTH = { authorization: `Bearer ${SECRET}` };

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
  await db.exec(sql('20261125_complete_payment_order_with_link.sql'));
});
after(async () => {
  await db.close();
});

/** Runs exactly what the store would send to the database, on the isolated one. */
async function run(request: CompletionRequest, env: NodeJS.ProcessEnv): Promise<LinkedCompletionStatus | null> {
  const call = completionCall(request, env);
  if (!call) return null;
  const a = call.args;
  const res =
    call.rpc === 'complete_payment_order'
      ? await db.query<{ r: { status: string } }>('select public.complete_payment_order($1, $2, $3, $4, $5) as r', [a.p_order, a.p_tx, a.p_amount, a.p_currency, a.p_provider_status])
      : await db.query<{ r: { status: string } }>('select public.complete_payment_order_with_link($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as r', [
          a.p_order, a.p_tx, a.p_amount, a.p_currency, a.p_provider_status, a.p_environment, a.p_merchant, a.p_process_id, a.p_token_hash, a.p_legacy_before,
        ]);
  const s = res.rows[0].r.status;
  assert.ok((LINKED_COMPLETION_STATUSES as readonly string[]).includes(s), `unknown status ${s}`);
  return s as LinkedCompletionStatus;
}

async function sqlBind(r: BindRequest) {
  const res = await db.query<{ r: string }>('select public.bind_payment_order_link($1, $2, $3, $4, $5, $6, $7) as r', [r.orderId, r.ownerId, r.environment, r.merchant, r.processId, r.tokenHash, r.tokenInUrl]);
  return res.rows[0].r as Awaited<ReturnType<typeof bindCheckoutLink>> & string;
}

let seq = 0;
async function newOrder(options: { bind?: boolean; createdAt?: string } = {}) {
  const owner = (await db.query<{ id: string }>('insert into auth.users default values returning id')).rows[0].id;
  const created = await db.query<{ r: { order_id: string } }>('select public.create_payment_order($1, $2, $3, $4) as r', [owner, 'go_deeper_3', 59, 3]);
  const order = created.rows[0].r.order_id;
  await db.query('select public.set_payment_order_link_status($1, $2, $3)', [order, owner, 'link_created']);
  if (options.createdAt) await db.query('update public.payment_orders set created_at = $2 where id = $1', [order, options.createdAt]); // test setup only
  seq += 1;
  const ids = { processId: `7${String(seq).padStart(4, '0')}`, processToken: `tok-${order.slice(0, 20)}` };
  if (options.bind !== false) assert.equal(await bindCheckoutLink(order, owner, 'https://sandbox.example/pay', ids, BIND_ENV, sqlBind), 'bound');
  return { owner, order, ids };
}
const balance = async (owner: string) => (await db.query<{ b: number }>('select public.get_credit_balance($1) as b', [owner])).rows[0].b;
const ledgerRows = async (owner: string) => (await db.query('select * from public.credit_ledger where owner_id = $1', [owner])).rows.length;
const orderRow = async (order: string) => (await db.query<Record<string, unknown>>('select status, provider_tx, review_reason, provider_status from public.payment_orders where id = $1', [order])).rows[0];

type O = { order: string; ids: { processId: string; processToken: string } };
const v1 = (o: O, over: Partial<CompletionRequest> = {}): CompletionRequest => ({ orderId: o.order, transactionId: 'TX' + o.order.slice(0, 10), amount: 59, currency: 'ILS', providerStatus: 'שולם', ...over });
const v2 = (o: O, over: Partial<CompletionRequest> = {}, ids = o.ids): CompletionRequest => ({ ...v1(o, over), link: ids });
const CUTOFF = { ...BIND_ENV, GROW_LEGACY_ORDERS_BEFORE: '2026-12-01T00:00:00Z' } as NodeJS.ProcessEnv;

// ------------------------------------------------------------------------------------------------- the request ----

const GOOD2 = {
  schema: 'dare.payment.v2',
  orderId: 'a'.repeat(32),
  transactionId: 900002,
  status: 'paid',
  amount: '59',
  currency: 'ILS',
  providerStatus: 'שולם',
  allPaymentsNum: '1',
  paymentLinkProcessId: '900003',
  paymentLinkProcessToken: 'tokenvalue1234567890',
};

test('request v2: the v1 keys plus the link identifiers and the number of payments; the link is passed through for the database', () => {
  assert.deepEqual(parseCompletionRequest(GOOD2), {
    ok: true,
    value: { orderId: 'a'.repeat(32), transactionId: '900002', amount: 59, currency: 'ILS', providerStatus: 'שולם', link: { processId: '900003', processToken: 'tokenvalue1234567890' } },
  });
  assert.equal(parseCompletionRequest({ ...GOOD2, allPaymentsNum: 1, paymentLinkProcessId: 900003 }).ok, true, 'Make may send numbers for the counts and the id');
});

test('request v2: strict keys, both identifiers required and well formed; v1 is unchanged', () => {
  const { schema: _s, allPaymentsNum: _n, paymentLinkProcessId: _i, paymentLinkProcessToken: _t, ...v1Keys } = GOOD2;
  assert.equal(parseCompletionRequest({ ...v1Keys, schema: 'dare.payment.v1' }).ok, true, 'v1 with exactly its seven keys still works');
  const invalid = { ok: false, reason: 'invalid_request' };
  for (const [name, body] of Object.entries({
    'v1 plus link keys': { ...GOOD2, schema: 'dare.payment.v1' },
    'v2 without link keys': { ...v1Keys, schema: 'dare.payment.v2' },
    'v2 extra key': { ...GOOD2, owner_id: 'u' },
    'id missing': { ...GOOD2, paymentLinkProcessId: undefined },
    'token missing': { ...GOOD2, paymentLinkProcessToken: undefined },
    'id empty': { ...GOOD2, paymentLinkProcessId: '' },
    'token too short': { ...GOOD2, paymentLinkProcessToken: 'abc' },
    'token with space': { ...GOOD2, paymentLinkProcessToken: 'bad token value' },
    'token object': { ...GOOD2, paymentLinkProcessToken: { v: 1 } },
    'count missing': { ...GOOD2, allPaymentsNum: undefined },
    'count text': { ...GOOD2, allPaymentsNum: 'one' },
  })) {
    assert.deepEqual(parseCompletionRequest(body), invalid, name);
  }
});

test('request v2: a paid report in installments is well formed but unsupported; a non-paid report is still just not paid', () => {
  for (const n of ['2', '3', '12', 2]) {
    assert.deepEqual(parseCompletionRequest({ ...GOOD2, allPaymentsNum: n }), { ok: false, reason: 'installments_not_supported', orderId: 'a'.repeat(32), providerStatus: 'שולם' }, String(n));
  }
  assert.deepEqual(parseCompletionRequest({ ...GOOD2, status: 'pending', allPaymentsNum: '2' }), { ok: false, reason: 'payment_not_successful', orderId: 'a'.repeat(32), providerStatus: 'שולם' });
});

test('handler: installments grant nothing, are remembered for review, and answer 422', async () => {
  const calls: CompletionRequest[] = [];
  const notices: [string, string][] = [];
  const d: CompletionDeps = { auth: (h) => checkCompletionAuth(h, BASE_ENV), complete: async (r) => (calls.push(r), 'granted'), recordNotice: async (o, s) => void notices.push([o, s]) };
  const r = await handlePaymentComplete({ ...GOOD2, allPaymentsNum: '2' }, AUTH, d);
  assert.equal(r.status, 422);
  assert.deepEqual(r.body, { reason: 'installments_not_supported', message: 'Payments in installments are not supported.' });
  assert.deepEqual(calls, []);
  assert.deepEqual(notices, [['a'.repeat(32), 'installments']]);
  const ok = await handlePaymentComplete(GOOD2, AUTH, d);
  assert.equal(ok.status, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].link, { processId: '900003', processToken: 'tokenvalue1234567890' });
});

test('handler: a link refusal is a 409 with a fixed word and nothing else', async () => {
  for (const status of ['link_required', 'link_missing', 'link_mismatch'] as const) {
    const d: CompletionDeps = { auth: (h) => checkCompletionAuth(h, BASE_ENV), complete: async () => status, recordNotice: async () => undefined };
    const r = await handlePaymentComplete(GOOD2, AUTH, d);
    assert.equal(r.status, 409, status);
    assert.equal((r.body as { reason: string }).reason, status);
  }
});

// -------------------------------------------------------------------------------- which database function runs ----

test('call: with nothing configured and no link, exactly the original function runs (deploying this code changes nothing)', () => {
  const call = completionCall(v1({ order: 'b'.repeat(32), ids: { processId: '1', processToken: 'x' } }), BASE_ENV);
  assert.equal(call?.rpc, 'complete_payment_order');
  assert.deepEqual(Object.keys(call!.args).sort(), ['p_amount', 'p_currency', 'p_order', 'p_provider_status', 'p_tx']);
});

test('call: a configured binding (with or without a cutoff) switches to the linked function; the raw token never leaves the server process', () => {
  const o = { order: 'c'.repeat(32), ids: { processId: '5', processToken: 'secret-token-value' } };
  for (const [name, request, env] of [
    ['link', v2(o), BIND_ENV],
    ['cutoff and binding', v1(o), CUTOFF],
    ['binding configured, old-format call', v1(o), BIND_ENV],
  ] as const) {
    const call = completionCall(request, env);
    assert.equal(call?.rpc, 'complete_payment_order_with_link', name);
    assert.ok(!JSON.stringify(call).includes('secret-token-value'), `${name}: only the keyed hash is sent`);
  }
  const withLink = completionCall(v2(o), BIND_ENV)!;
  assert.equal((withLink.args as { p_token_hash: string }).p_token_hash, linkTokenHash(growLinkConfig(BIND_ENV)!, '5', 'secret-token-value'));
  assert.equal((withLink.args as { p_legacy_before: string | null }).p_legacy_before, null);
});

test('call: fail closed: a half or wrong configuration, or an invalid cutoff, builds no call (the caller answers 503); nothing configured ignores the link', () => {
  const o = { order: 'd'.repeat(32), ids: { processId: '5', processToken: 'secret-token-value' } };
  assert.equal(completionCall(v2(o), BASE_ENV)?.rpc, 'complete_payment_order', 'nothing configured: today\'s function, the link is ignored');
  assert.equal(completionCall(v2(o), { ...BIND_ENV, VERCEL_ENV: 'preview' } as NodeJS.ProcessEnv), null, 'production identifiers on a Preview');
  assert.equal(completionCall(v2(o), { ...BASE_ENV, GROW_LINK_TOKEN_KEY: 'k'.repeat(40) } as NodeJS.ProcessEnv), null, 'a key alone');
  assert.equal(completionCall(v2(o), { ...BASE_ENV, GROW_ENVIRONMENT: 'production', GROW_MERCHANT_REF: 'dare-test', GROW_LINK_TOKEN_KEY: 'short' } as NodeJS.ProcessEnv), null, 'a key that is too short');
  assert.equal(completionCall(v1(o), { ...BASE_ENV, GROW_LEGACY_ORDERS_BEFORE: '2026-12-01T00:00:00Z' } as NodeJS.ProcessEnv), null, 'a cutoff without the configuration');
  for (const bad of ['yesterday', '2026-12-01', '2026-13-45T00:00:00Z', '1764547200']) {
    assert.equal(legacyOrdersBefore({ GROW_LEGACY_ORDERS_BEFORE: bad } as NodeJS.ProcessEnv), null, bad);
    assert.equal(completionCall(v1(o), { ...BIND_ENV, GROW_LEGACY_ORDERS_BEFORE: bad } as NodeJS.ProcessEnv), null, bad);
  }
  assert.equal(legacyOrdersBefore(BASE_ENV), undefined);
  assert.equal(legacyOrdersBefore({ GROW_LEGACY_ORDERS_BEFORE: '2026-12-01T00:00:00Z' } as NodeJS.ProcessEnv)?.toISOString(), '2026-12-01T00:00:00.000Z');
});

// ---------------------------------------------------------------------------------------- the database, isolated ----

test('db: a bound order with the right identifiers is granted once; replays and a different transaction add nothing', async () => {
  const o = await newOrder();
  assert.equal(await run(v2(o), BIND_ENV), 'granted');
  for (let i = 0; i < 5; i++) assert.equal(await run(v2(o), BIND_ENV), 'duplicate');
  assert.equal(await run(v2(o, { transactionId: 'OTHER-TX-0001' }), BIND_ENV), 'order_already_completed');
  assert.equal(await balance(o.owner), 3);
  assert.equal(await ledgerRows(o.owner), 1);
  assert.equal((await orderRow(o.order)).status, 'granted');
});

test('db: a wrong id, a wrong token, another order\'s identifiers or an old-format call never complete a bound order and write nothing', async () => {
  const a = await newOrder();
  const b = await newOrder();
  assert.equal(await run(v2(a, {}, { ...a.ids, processId: '99999' }), BIND_ENV), 'link_mismatch');
  assert.equal(await run(v2(a, {}, { ...a.ids, processToken: 'wrong-token-value' }), BIND_ENV), 'link_mismatch');
  assert.equal(await run(v2(a, {}, b.ids), BIND_ENV), 'link_mismatch', 'B\'s identifiers on A\'s order');
  assert.equal(await run(v1(a), BIND_ENV), 'link_required', 'old-format call, binding configured');
  assert.equal(await run(v1(a), CUTOFF), 'link_required', 'old-format call, enforcement on');
  assert.equal(await run(v2(a), { ...BIND_ENV, GROW_ENVIRONMENT: 'sandbox', VERCEL_ENV: 'preview' } as NodeJS.ProcessEnv), 'link_mismatch', 'another environment');
  assert.equal(await run(v2(a), { ...BIND_ENV, GROW_MERCHANT_REF: 'other-shop' } as NodeJS.ProcessEnv), 'link_mismatch', 'another merchant');
  assert.equal(await run(v2(a), { ...BIND_ENV, GROW_LINK_TOKEN_KEY: 'z'.repeat(40) } as NodeJS.ProcessEnv), 'link_mismatch', 'another key');
  assert.equal(await balance(a.owner), 0);
  assert.deepEqual(await orderRow(a.order), { status: 'link_created', provider_tx: null, review_reason: null, provider_status: null });
  // The right identifiers still complete it afterwards.
  assert.equal(await run(v2(a), BIND_ENV), 'granted');
  assert.equal(await balance(a.owner), 3);
});

test('db: the amount and the currency are still checked after the link matches', async () => {
  const o = await newOrder();
  assert.equal(await run(v2(o, { amount: 58.99 }), BIND_ENV), 'amount_mismatch');
  assert.equal(await run(v2(o, { amount: 149 }), BIND_ENV), 'amount_mismatch');
  assert.equal(await run(v2(o, { currency: 'USD' }), BIND_ENV), 'currency_mismatch');
  assert.equal(await balance(o.owner), 0);
  assert.equal((await orderRow(o.order)).status, 'link_created', 'the order stays open');
  assert.equal(await run(v2(o), BIND_ENV), 'granted');
});

test('db: a transaction that paid one order cannot pay another, even with the other order\'s own correct identifiers', async () => {
  const a = await newOrder();
  const b = await newOrder();
  assert.equal(await run(v2(a, { transactionId: 'SHARED-TX-77' }), BIND_ENV), 'granted');
  assert.equal(await run(v2(b, { transactionId: 'SHARED-TX-77' }), BIND_ENV), 'transaction_used_by_other_order');
  assert.equal(await balance(b.owner), 0);
  assert.equal(await run(v2(b), BIND_ENV), 'granted', 'its own transaction works');
  assert.equal((await ledgerRows(a.owner)) + (await ledgerRows(b.owner)), 2);
});

test('old orders: an order without a link completes exactly as before; the identifiers, if sent, are ignored for it', async () => {
  const legacy = await newOrder({ bind: false, createdAt: '2026-11-01T00:00:00Z' });
  assert.equal(await run(v1(legacy), BASE_ENV), 'granted', 'today: original function');
  const legacy2 = await newOrder({ bind: false, createdAt: '2026-11-01T00:00:00Z' });
  assert.equal(await run(v1(legacy2), BIND_ENV), 'granted', 'binding configured, no cutoff yet: every unbound order is legacy');
  const legacy3 = await newOrder({ bind: false, createdAt: '2026-11-30T23:59:59Z' });
  assert.equal(await run(v1(legacy3), CUTOFF), 'granted', 'created before the cutoff');
  const legacy4 = await newOrder({ bind: false, createdAt: '2026-11-01T00:00:00Z' });
  assert.equal(await run(v2(legacy4, {}, { processId: '1', processToken: 'whatever-token-12' }), CUTOFF), 'granted', 'v2 for an old order: identifiers ignored');
  for (const o of [legacy, legacy2, legacy3, legacy4]) assert.equal(await balance(o.owner), 3);
});

test('old orders: after the cutoff an order created later and never bound cannot complete (kept for manual review); duplicates stay duplicates', async () => {
  const late = await newOrder({ bind: false, createdAt: '2026-12-01T00:00:00Z' });
  assert.equal(await run(v1(late), CUTOFF), 'link_missing', 'created exactly at the cutoff');
  assert.equal(await run(v2(late, {}, { processId: '1', processToken: 'whatever-token-12' }), CUTOFF), 'link_missing');
  assert.equal(await balance(late.owner), 0);
  assert.deepEqual(await orderRow(late.order), { status: 'link_created', provider_tx: null, review_reason: null, provider_status: null });
  // A legacy order completed before the cutoff answers duplicate when Grow resends after it.
  const early = await newOrder({ bind: false, createdAt: '2026-11-01T00:00:00Z' });
  assert.equal(await run(v1(early), BASE_ENV), 'granted');
  assert.equal(await run(v1(early), CUTOFF), 'duplicate');
  assert.equal(await balance(early.owner), 3);
});

test('db: the link function only reads and delegates; it never grants by itself and never touches a refused order', async () => {
  const body = readFileSync(new URL('../supabase/migrations/20261125_complete_payment_order_with_link.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '');
  assert.ok(!/grant_credits|\binsert\b|\bupdate\s+public\.|\bdelete\b/i.test(body), 'no write of its own (the only "update" is the row lock)');
  assert.equal([...body.matchAll(/return public\.complete_payment_order\(/g)].length, 2, 'two paths into the one existing completion');
  const priv = await db.query<{ anon: boolean; auth: boolean; svc: boolean }>(
    `select has_function_privilege('anon', 'public.complete_payment_order_with_link(text,text,numeric,text,text,text,text,text,text,timestamptz)', 'execute') as anon,
            has_function_privilege('authenticated', 'public.complete_payment_order_with_link(text,text,numeric,text,text,text,text,text,text,timestamptz)', 'execute') as auth,
            has_function_privilege('service_role', 'public.complete_payment_order_with_link(text,text,numeric,text,text,text,text,text,text,timestamptz)', 'execute') as svc`);
  assert.deepEqual(priv.rows[0], { anon: false, auth: false, svc: true });
});

test('db: malformed arguments are invalid, an unknown order is not found, half a set of identifiers is invalid', async () => {
  const q = async (...args: unknown[]) => (await db.query<{ r: { status: string } }>('select public.complete_payment_order_with_link($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as r', args)).rows[0].r.status;
  const h = 'a'.repeat(64);
  assert.equal(await q('short', 'TX-1', 59, 'ILS', 'ok', null, null, null, null, null), 'invalid');
  assert.equal(await q('e'.repeat(32), 'TX-1', 59, 'ILS', 'ok', null, null, null, null, null), 'order_not_found');
  assert.equal(await q('e'.repeat(32), 'TX-1', 59, 'ILS', 'ok', 'production', 'dare-test', '5', null, null), 'invalid', 'token hash missing');
  assert.equal(await q('e'.repeat(32), 'TX-1', 59, 'ILS', 'ok', 'staging', 'dare-test', '5', h, null), 'invalid', 'unknown environment');
  assert.equal(await q('e'.repeat(32), 'TX-1', 59, 'ILS', 'ok', 'production', 'dare-test', "5'--", h, null), 'invalid', 'odd process id');
});

// ------------------------------------------------------------------------------------------------------ checkout ----

test('checkout: once enforcement is on, a link whose identifiers could not be kept is not handed to the customer; today nothing changes', async () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const link = (ids?: { processId: string; processToken: string }): CheckoutDeps['requestLink'] => async () => ({
    ok: true,
    paymentUrl: 'https://pay.example/x',
    link: ids ? { status: 'present', ids } : { status: 'absent' },
  });
  const make = (over: Partial<CheckoutDeps>): CheckoutDeps => ({
    verifyBearer: async () => ({ ok: true, userId: owner }) as never,
    siteUrl: () => 'https://daretogoin.com',
    makeConfigured: () => true,
    packageStillHeld: async () => false,
    createOrder: async () => ({ status: 'created', orderId: 'f'.repeat(32) }),
    markLink: async () => true,
    requestLink: link(),
    bindLink: async () => 'bound',
    ...over,
  });
  const body = { packageId: 'go_deeper_3', fullName: 'Test Person', phone: '0501234567' };
  const headers = { authorization: 'Bearer x' };
  const pair = { processId: '1', processToken: 'token-token-1' };
  // enforcement off (default): the link is handed out whatever happens to the binding
  assert.equal((await handleStartCheckout(body, headers, make({}))).status, 200, 'no identifiers, not required');
  assert.equal((await handleStartCheckout(body, headers, make({ requestLink: link(pair), bindLink: async () => 'unavailable' }))).status, 200, 'binding failed, not required');
  // enforcement on
  const on = { bindingRequired: () => true };
  assert.equal((await handleStartCheckout(body, headers, make({ ...on, requestLink: link(pair) }))).status, 200, 'bound');
  assert.equal((await handleStartCheckout(body, headers, make({ ...on, requestLink: link(pair), bindLink: async () => 'already_bound' }))).status, 200);
  assert.equal((await handleStartCheckout(body, headers, make({ ...on }))).status, 502, 'Make sent no identifiers');
  for (const outcome of ['unavailable', 'not_configured', 'conflict', 'process_in_use', 'order_not_open', 'invalid'] as const) {
    const r = await handleStartCheckout(body, headers, make({ ...on, requestLink: link(pair), bindLink: async () => outcome }));
    assert.equal(r.status, 502, outcome);
    assert.ok(!JSON.stringify(r.body).includes('pay.example'), 'the link is not in the answer');
  }
});

// ------------------------------------------------------------------------------------------------ the rollout order ----

test('rollout: every phase of the planned order completes every valid payment, and the old format never completes a NEW order once binding is on', async () => {
  const T = 'tok-rollout-0000-token'; // a link token in the formats seen
  const ids = (n: number) => ({ processId: `6${String(n).padStart(4, '0')}`, processToken: `${T}-${n}` });
  const mk = async (bind: boolean, n: number) => {
    const o = await newOrder({ bind: false });
    const pair = ids(n);
    // The binding as checkout would do it, only when the environment has the Grow configuration.
    if (bind) assert.equal(await bindCheckoutLink(o.order, o.owner, 'https://pay.example/x', pair, BIND_ENV, sqlBind), 'bound');
    return { ...o, ids: pair };
  };
  const paid = async (o: O & { owner: string }, request: CompletionRequest, env: NodeJS.ProcessEnv) => {
    assert.equal(await run(request, env), 'granted');
    assert.equal(await balance(o.owner), 3);
  };

  // Phase 0: today. v1, nothing configured, original function.
  const p0 = await mk(false, 10);
  await paid(p0, v1(p0), BASE_ENV);

  // Phase 1: code and migrations deployed, Make still v1, nothing configured: unchanged.
  const p1 = await mk(false, 11);
  await paid(p1, v1(p1), BASE_ENV);

  // Phase 2: Make now sends v2 (its link identifiers are just not kept yet): still no refusal, the link is ignored.
  const p2 = await mk(false, 12);
  await paid(p2, v2(p2), BASE_ENV);
  const p2b = await mk(false, 13);
  await paid(p2b, v2(p2b, {}, { processId: '1', processToken: 'whatever-token-12' }), BASE_ENV);

  // Phase 3: Make's checkout answer carries the identifiers, DARE has no configuration yet: nothing can be bound, nothing is refused.
  assert.equal(await bindCheckoutLink('f'.repeat(32), '11111111-1111-4111-8111-111111111111', 'https://pay.example/x', ids(14), BASE_ENV, sqlBind), 'not_configured');
  const p3 = await mk(false, 14); // an order created in phase 3, still unbound, paid LATER (after the switch below)
  const p3open = await mk(false, 15);

  // Phase 4: the binding is switched on (same redeploy). Orders created before are legacy and complete with v2 or v1.
  await paid(p3, v2(p3), BIND_ENV);
  await paid(p3open, v1(p3open), BIND_ENV);
  // A NEW order is bound at checkout and completes with its own identifiers...
  const n1 = await mk(true, 16);
  await paid(n1, v2(n1), BIND_ENV);
  // ...and the old format can NOT complete it, nor can wrong or borrowed identifiers.
  const n2 = await mk(true, 17);
  assert.equal(await run(v1(n2), BIND_ENV), 'link_required');
  assert.equal(await run(v2(n2, {}, ids(16)), BIND_ENV), 'link_mismatch');
  assert.equal(await balance(n2.owner), 0);
  await paid(n2, v2(n2), BIND_ENV);
  // A new order whose identifiers could not be kept is never handed to the customer (checkout refuses), so it is never payable.
  assert.equal(linkBindingRequired(BIND_ENV), true);
  assert.equal(linkBindingRequired(BASE_ENV), false);
  assert.equal(linkBindingRequired({ ...BASE_ENV, GROW_LEGACY_ORDERS_BEFORE: '2026-12-01T00:00:00Z' } as NodeJS.ProcessEnv), true);

  // Rollback of phase 4: the configuration is removed. Orders bound meanwhile still complete (with v1 or v2); nothing is refused.
  const r1 = await mk(true, 18);
  await paid(r1, v1(r1), BASE_ENV);
  const r2 = await mk(true, 19);
  await paid(r2, v2(r2), BASE_ENV);
});

test('rollout: the wrong order is refused loudly, never silently weakened: v2 sent to code that does not know it, and keys set halfway', async () => {
  // Make switched to v2 BEFORE the code was deployed: the old code rejects the unknown schema (400), nothing is granted.
  const body = { ...GOOD2 };
  assert.deepEqual(parseCompletionRequest({ ...body, schema: 'dare.payment.v3' }), { ok: false, reason: 'invalid_request' });
  // Keys set without Make's checkout answer carrying identifiers: every checkout is refused (502) instead of handing out an unbound link.
  const pair = { processId: '1', processToken: 'token-token-1' };
  const d = (): CheckoutDeps => ({
    verifyBearer: async () => ({ ok: true, userId: '11111111-1111-4111-8111-111111111111' }) as never,
    siteUrl: () => 'https://daretogoin.com',
    makeConfigured: () => true,
    packageStillHeld: async () => false,
    createOrder: async () => ({ status: 'created', orderId: 'f'.repeat(32) }),
    markLink: async () => true,
    requestLink: async () => ({ ok: true, paymentUrl: 'https://pay.example/x', link: { status: 'absent' } }),
    bindLink: async () => 'bound',
    bindingRequired: () => linkBindingRequired(BIND_ENV),
  });
  const r = await handleStartCheckout({ packageId: 'go_deeper_3', fullName: 'Test Person', phone: '0501234567' }, { authorization: 'Bearer x' }, d());
  assert.equal(r.status, 502);
  assert.ok(!JSON.stringify(r.body).includes('pay.example'));
  void pair;
});

test('wiring: the status lists agree, and /api/payment-complete still serves both callers through the same function', () => {
  assert.deepEqual(LINKED_COMPLETION_STATUSES.slice(0, COMPLETION_STATUSES.length), [...COMPLETION_STATUSES]);
  const api = readFileSync(new URL('../api/payment-complete.ts', import.meta.url), 'utf8');
  assert.match(api, /handlePaymentComplete\(req\.body/);
});
