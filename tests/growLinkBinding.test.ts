import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { growLinkConfig, linkTokenHash, readLinkIds, transactionHash, MIN_LINK_KEY_LENGTH, type GrowLinkConfig } from '../server/payments/growLinkBinding.ts';
import { disabledApprover, safeApprove, type GrowApprover } from '../server/payments/growApprove.ts';
import { growNotifyCheck, handleGrowNotify, VERIFIED_LINK_FIELDS, VERIFIED_SHAPES, type GrowNotifyDeps } from '../server/payments/growNotify.ts';
import { requestPaymentLink, type MakeCheckoutPayload } from '../server/payments/makeCheckoutClient.ts';
import { bindCheckoutLink, handleStartCheckout, type CheckoutDeps } from '../server/payments/checkoutStart.ts';

/**
 * Grow link binding (2026-11-23): config and environment/merchant separation, the token's keyed hash, Make's optional identifiers,
 * the checkout side (nothing reaches the browser or the logs), the Approve interface, and the new SQL in an isolated PGlite.
 * All values are fictional. None of this is proof of origin; these tests check matching, separation, idempotence and privacy.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const KEY = 'k'.repeat(MIN_LINK_KEY_LENGTH) + '-unit';
const PROD = { VERCEL_ENV: 'production', GROW_ENVIRONMENT: 'production', GROW_MERCHANT_REF: 'dare-main', GROW_LINK_TOKEN_KEY: KEY } as NodeJS.ProcessEnv;
const SBX = { VERCEL_ENV: 'preview', GROW_ENVIRONMENT: 'sandbox', GROW_MERCHANT_REF: 'dare-main', GROW_LINK_TOKEN_KEY: KEY } as NodeJS.ProcessEnv;
const ORDER = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const PID = '88001';
const PTOKEN = 'ptokAbCdEf123456';

// ------------------------------------------------------------------------------- config ----

test('config: complete and well formed, or none at all (fail closed)', () => {
  assert.deepEqual(growLinkConfig(PROD), { environment: 'production', merchant: 'dare-main', key: KEY });
  assert.deepEqual(growLinkConfig(SBX), { environment: 'sandbox', merchant: 'dare-main', key: KEY });
  for (const over of [
    { GROW_ENVIRONMENT: undefined },
    { GROW_ENVIRONMENT: 'Production' },
    { GROW_ENVIRONMENT: 'live' },
    { GROW_MERCHANT_REF: undefined },
    { GROW_MERCHANT_REF: 'DARE' },
    { GROW_MERCHANT_REF: 'a' },
    { GROW_MERCHANT_REF: 'x'.repeat(33) },
    { GROW_MERCHANT_REF: 'dare main' },
    { GROW_LINK_TOKEN_KEY: undefined },
    { GROW_LINK_TOKEN_KEY: 'k'.repeat(MIN_LINK_KEY_LENGTH - 1) },
  ]) {
    assert.equal(growLinkConfig({ ...PROD, ...over } as NodeJS.ProcessEnv), null, JSON.stringify(over));
  }
});

test('config: production identifiers only on the production deployment; everything else can only be a Sandbox', () => {
  for (const vercelEnv of ['preview', 'development', undefined, 'staging']) {
    assert.equal(growLinkConfig({ ...PROD, VERCEL_ENV: vercelEnv } as NodeJS.ProcessEnv), null, `${vercelEnv} + production`);
    assert.ok(growLinkConfig({ ...SBX, VERCEL_ENV: vercelEnv } as NodeJS.ProcessEnv), `${vercelEnv} + sandbox`);
  }
  assert.equal(growLinkConfig({ ...SBX, VERCEL_ENV: 'production' } as NodeJS.ProcessEnv), null, 'the production deployment never accepts Sandbox links');
});

// --------------------------------------------------------------------------------- hash ----

test('token hash: 64 hex, keyed, and bound to environment, merchant and process id; the token is not recoverable from it', () => {
  const c = growLinkConfig(PROD) as GrowLinkConfig;
  const h = linkTokenHash(c, PID, PTOKEN);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(linkTokenHash(c, PID, PTOKEN), h, 'deterministic');
  const variants = [
    linkTokenHash({ ...c, key: KEY + 'x' }, PID, PTOKEN),
    linkTokenHash({ ...c, environment: 'sandbox' }, PID, PTOKEN),
    linkTokenHash({ ...c, merchant: 'other-shop' }, PID, PTOKEN),
    linkTokenHash(c, '88002', PTOKEN),
    linkTokenHash(c, PID, PTOKEN + 'x'),
  ];
  assert.equal(new Set([h, ...variants]).size, 6, 'any change of context or key gives another hash');
  assert.ok(!h.includes(PTOKEN.toLowerCase()));
  assert.match(transactionHash('4097233'), /^[0-9a-f]{64}$/);
  assert.notEqual(transactionHash('4097233'), transactionHash('4097234'));
});

test('link ids: both present and well formed, or refused without telling which value was wrong', () => {
  assert.deepEqual(readLinkIds(undefined, undefined), { status: 'absent' });
  assert.deepEqual(readLinkIds('', null), { status: 'absent' });
  assert.deepEqual(readLinkIds(PID, PTOKEN), { status: 'present', ids: { processId: PID, processToken: PTOKEN } });
  assert.deepEqual(readLinkIds(88001, ` ${PTOKEN} `), { status: 'present', ids: { processId: '88001', processToken: PTOKEN } });
  const bad: [unknown, unknown][] = [
    [PID, undefined],
    [undefined, PTOKEN],
    [PID, 12345678], // a token is text
    [PID, 'short'],
    [PID, 'x'.repeat(257)],
    [PID, `${PTOKEN}'; drop table x;--`],
    [PID, [PTOKEN]],
    [PID, { v: PTOKEN }],
    ["1' or '1'='1", PTOKEN],
    ['x'.repeat(65), PTOKEN],
    [-1, PTOKEN],
    [1.5, PTOKEN],
    [[PID], PTOKEN],
    ['88 001', PTOKEN],
  ];
  for (const [id, token] of bad) assert.deepEqual(readLinkIds(id, token), { status: 'invalid' }, JSON.stringify([id, token]));
});

// ----------------------------------------------------------------------------- Make side ----

const MAKE_ENV = { MAKE_CHECKOUT_WEBHOOK_URL: 'https://hook.eu1.make.com/abc123' } as NodeJS.ProcessEnv;
const PAY_URL = 'https://pay.grow.link/ab12cd34ef';
const PAYLOAD = { orderId: ORDER } as MakeCheckoutPayload;
const fakeFetch = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

test('make answer: identifiers are optional (old format unchanged), validated, and an environment mismatch is refused', async () => {
  const base = { ok: true, orderId: ORDER, paymentUrl: PAY_URL };
  const ask = (body: unknown, env: NodeJS.ProcessEnv = MAKE_ENV) => requestPaymentLink(PAYLOAD, { env, fetchImpl: fakeFetch(body) });
  assert.deepEqual(await ask(base), { ok: true, paymentUrl: PAY_URL, link: { status: 'absent' } });
  assert.deepEqual(await ask({ ...base, processId: PID, processToken: PTOKEN }), { ok: true, paymentUrl: PAY_URL, link: { status: 'present', ids: { processId: PID, processToken: PTOKEN } } });
  assert.deepEqual(await ask({ ...base, processId: PID }), { ok: true, paymentUrl: PAY_URL, link: { status: 'invalid' } }, 'checkout still works; nothing is bound');
  assert.deepEqual(await ask({ ...base, growEnvironment: 'sandbox' }, { ...MAKE_ENV, GROW_ENVIRONMENT: 'production' } as NodeJS.ProcessEnv), { ok: false, reason: 'bad_response' }, 'a Sandbox link never reaches a production customer');
  assert.deepEqual(await ask({ ...base, growEnvironment: 'staging' }), { ok: false, reason: 'bad_response' });
  assert.equal((await ask({ ...base, growEnvironment: 'production' }, { ...MAKE_ENV, GROW_ENVIRONMENT: 'production' } as NodeJS.ProcessEnv)).ok, true);
  assert.equal((await ask({ ...base, growEnvironment: 'sandbox' })).ok, true, 'no Grow environment configured: the echo is only format-checked');
});

// ------------------------------------------------------------------------------ checkout ----

const ORIGINAL_ERROR = console.error;
async function checkout(link: Awaited<ReturnType<CheckoutDeps['requestLink']>>, bindLink: CheckoutDeps['bindLink']) {
  const logs: string[] = [];
  const binds: unknown[][] = [];
  const marks: string[] = [];
  const deps: CheckoutDeps = {
    verifyBearer: async () => ({ ok: true, userId: '00000000-0000-4000-8000-000000000001' }),
    siteUrl: () => 'https://daretogoin.com',
    makeConfigured: () => true,
    packageStillHeld: async () => false,
    createOrder: async () => ({ status: 'created', orderId: ORDER }),
    markLink: async (_o, _u, s) => (marks.push(s), true),
    requestLink: async () => link,
    bindLink: async (...args) => (binds.push(args), bindLink(...args)),
  };
  console.error = (...a: unknown[]) => void logs.push(a.join(' '));
  try {
    const res = await handleStartCheckout({ packageId: 'go_deeper_3', fullName: 'Dana Fictional', phone: '0521234567' }, { authorization: 'Bearer x' }, deps);
    return { res, logs, binds, marks };
  } finally {
    console.error = ORIGINAL_ERROR;
  }
}

test('checkout: identifiers are bound server-side and never reach the browser or the logs; the answer is unchanged', async () => {
  const present = { ok: true as const, paymentUrl: PAY_URL, link: { status: 'present' as const, ids: { processId: PID, processToken: PTOKEN } } };
  for (const outcome of ['bound', 'process_in_use', 'not_configured', 'unavailable'] as const) {
    const r = await checkout(present, async () => outcome);
    assert.deepEqual([r.res.status, r.res.body], [200, { orderId: ORDER, paymentUrl: PAY_URL }], `${outcome}: the browser answer is exactly as before`);
    assert.deepEqual(r.marks, ['link_created'], 'bound only after the order is link_created');
    assert.deepEqual(r.logs, [`checkout_link_binding outcome=${outcome}`]);
    for (const v of [PID, PTOKEN]) assert.ok(!(JSON.stringify(r.res) + r.logs.join()).includes(v), v);
  }
  const thrown = await checkout(present, async () => Promise.reject(new Error(`db ${PTOKEN}`)));
  assert.equal(thrown.res.status, 200);
  assert.deepEqual(thrown.logs, ['checkout_link_binding outcome=unavailable'], 'a failing store never breaks checkout or leaks its message');
  const old = await checkout({ ok: true, paymentUrl: PAY_URL }, async () => 'bound');
  assert.deepEqual([old.res.status, old.binds, old.logs], [200, [], []], 'the old answer format: nothing to bind, nothing logged');
  const invalid = await checkout({ ok: true, paymentUrl: PAY_URL, link: { status: 'invalid' } }, async () => 'bound');
  assert.deepEqual([invalid.res.status, invalid.binds, invalid.logs], [200, [], ['checkout_link_binding outcome=invalid_ids']]);
});

test('checkout binding: needs the full Grow configuration; only the keyed hash reaches the store; a token in the link is flagged', async () => {
  const seen: unknown[] = [];
  const store = async (r: unknown) => (seen.push(r), 'bound' as const);
  assert.equal(await bindCheckoutLink(ORDER, 'u', PAY_URL, { processId: PID, processToken: PTOKEN }, {} as NodeJS.ProcessEnv, store), 'not_configured');
  assert.equal(seen.length, 0);
  assert.equal(await bindCheckoutLink(ORDER, 'u', PAY_URL, { processId: PID, processToken: PTOKEN }, PROD, store), 'bound');
  assert.equal(await bindCheckoutLink(ORDER, 'u', `${PAY_URL}?t=${PTOKEN}`, { processId: PID, processToken: PTOKEN }, PROD, store), 'bound');
  assert.ok(!JSON.stringify(seen).includes(PTOKEN), 'the token itself never reaches the store');
  assert.deepEqual(seen.map((s) => (s as { tokenInUrl: boolean }).tokenInUrl), [false, true]);
  assert.equal((seen[0] as { tokenHash: string }).tokenHash, linkTokenHash(growLinkConfig(PROD) as GrowLinkConfig, PID, PTOKEN));
  assert.equal(await bindCheckoutLink(ORDER, 'u', PAY_URL, { processId: PID, processToken: PTOKEN }, PROD, async () => null), 'unavailable');
});

test('browser code never mentions the link identifiers, the key or the new functions', () => {
  const walk = (dir: string): string[] => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
  for (const f of walk('src').filter((x) => /\.(ts|tsx)$/.test(x))) {
    assert.ok(!/processToken|GROW_LINK_TOKEN_KEY|GROW_MERCHANT_REF|bind_payment_order_link|payment_notices|growLinkBinding/.test(read(f)), f);
  }
  assert.ok(!/VITE_GROW/.test(read('.env.example')));
});

// ------------------------------------------------------------------------------- approve ----

test('approve: an isolated interface; the real one makes no call; failures become "failed" and never throw', async () => {
  const req = { environment: 'sandbox' as const, transactionId: '4097233', transactionToken: 'ttok', sum: 59 };
  assert.equal(await disabledApprover.approve(req), 'not_configured');
  const cases: [GrowApprover, string][] = [
    [{ approve: async () => 'approved' }, 'approved'],
    [{ approve: async () => 'not_configured' }, 'not_configured'],
    [{ approve: async () => 'failed' }, 'failed'],
    [{ approve: async () => 'yes' as never }, 'failed'],
    [{ approve: async () => Promise.reject(new Error('down')) }, 'failed'],
    [{ approve: () => { throw new Error('sync'); } }, 'failed'],
  ];
  for (const [approver, expected] of cases) assert.equal(await safeApprove(approver, req), expected);
  const src = strip(read('server/payments/growApprove.ts'));
  assert.ok(!/fetch\(|https?:\/\/|meshulam|grow\.link|process\.env/.test(src), 'no network, no host, no credentials');
  assert.match(strip(read('server/payments/growNotify.ts')), /approver: disabledApprover/, 'the production dependency is the no-op');
});

// ------------------------------------------------------------------------------ switches ----

const GROW_IP = '3.123.194.128';
const SECRET = 's'.repeat(40);
const notify = (over: Record<string, unknown> = {}) => ({
  transactionId: '4097233',
  statusCode: '2',
  sum: '59',
  allPaymentsNum: '1',
  processId: PID,
  processToken: PTOKEN,
  'customFields[cField1]': ORDER,
  'customFields[cField2]': growNotifyCheck(ORDER, SECRET),
  ...over,
});
function notifyDeps(env: NodeJS.ProcessEnv, over: Partial<GrowNotifyDeps> = {}) {
  const calls = { complete: 0, notices: [] as string[], logs: [] as string[] };
  const d: GrowNotifyDeps = {
    env: { GROW_NOTIFY_MODE: 'on', GROW_NOTIFY_IPS: GROW_IP, GROW_NOTIFY_SECRET: SECRET, ...env } as NodeJS.ProcessEnv,
    complete: async () => ((calls.complete += 1), 'granted'),
    verifiedShapes: ['flat/brackets'],
    verifiedLinkFields: ['processId/processToken'],
    logNotice: async (e) => void calls.notices.push(e.outcome),
    approver: disabledApprover,
    log: (l) => void calls.logs.push(l),
    ...over,
  };
  return { d, calls };
}
const send = (body: unknown, d: GrowNotifyDeps) => handleGrowNotify({ method: 'POST', vercelForwardedFor: GROW_IP, contentType: 'application/x-www-form-urlencoded', contentLength: undefined, readBody: () => body }, d);

test('switches: both production constants are empty; with either one real, nothing reaches the database', async () => {
  assert.deepEqual([VERIFIED_SHAPES, VERIFIED_LINK_FIELDS], [[], []]);
  for (const over of [{ verifiedShapes: VERIFIED_SHAPES }, { verifiedLinkFields: VERIFIED_LINK_FIELDS }]) {
    const { d, calls } = notifyDeps(PROD, over);
    const r = await send(notify(), d);
    assert.ok(r.status === 503 || r.status === 400, String(r.status));
    assert.equal(calls.complete, 0);
  }
});

test('switches: a Preview never grants, even fully configured for the Sandbox with test shapes and link fields', async () => {
  const { d, calls } = notifyDeps(SBX);
  const r = await send(notify(), d);
  assert.equal(r.status, 200, 'capture is acknowledged on a Preview');
  assert.equal(calls.complete, 0);
  assert.deepEqual(calls.notices, [], 'capture writes nothing, not even the notice log');
  assert.match(calls.logs[0], /^grow_notify_capture mode=capture /);
});

test('separation: a deployment whose Grow environment does not match it refuses to process (503), before any database call', async () => {
  for (const env of [{ ...PROD, GROW_ENVIRONMENT: 'sandbox' }, { ...PROD, GROW_LINK_TOKEN_KEY: 'short' }, { ...PROD, GROW_MERCHANT_REF: undefined }]) {
    const { d, calls } = notifyDeps(env as NodeJS.ProcessEnv);
    assert.equal((await send(notify(), d)).status, 503);
    assert.equal(calls.complete, 0);
    assert.deepEqual(calls.notices, ['link_config_missing']);
  }
});

test('hostile link ids: missing, malformed, typed wrong or in an unverified field pair are refused before the database', async () => {
  const bodies = [
    notify({ processId: undefined, processToken: undefined }),
    notify({ processToken: undefined }),
    notify({ processToken: 12345678 }),
    notify({ processToken: [PTOKEN, PTOKEN] }),
    notify({ processId: "1' or '1'='1" }),
    notify({ processToken: 'x'.repeat(300) }),
    notify({ processId: undefined, processToken: undefined, paymentLinkProcessId: PID, paymentLinkProcessToken: PTOKEN }),
  ];
  for (const body of bodies) {
    const { d, calls } = notifyDeps(PROD);
    assert.equal((await send(body, d)).status, 400, JSON.stringify(body).slice(0, 120));
    assert.equal(calls.complete, 0);
    assert.match(calls.notices[0], /^link_ids_(absent|invalid)$/);
    for (const v of [PTOKEN, PID, "1' or"]) assert.ok(!calls.logs.join().includes(v), v);
  }
});

// ---------------------------------------------------------------------------- isolated SQL ----

const migration = (name: string) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
let db: PGlite;
before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid());
    grant usage on schema public to anon, authenticated, service_role;
  `);
  await db.exec(migration('20260924_credits_entitlement.sql'));
  await db.exec(migration('20261007_payment_orders.sql'));
  await db.exec(migration('20261123_payment_order_links.sql'));
});
after(async () => {
  await db.close();
});

const H = (n: number) => n.toString(16).padStart(64, '0');
async function order(status: 'created' | 'link_created' = 'link_created') {
  const owner = (await db.query<{ id: string }>('insert into auth.users default values returning id')).rows[0].id;
  const id = (await db.query<{ r: { order_id: string } }>("select public.create_payment_order($1, 'go_deeper_3', 59, 3) as r", [owner])).rows[0].r.order_id;
  if (status === 'link_created') await db.query("select public.set_payment_order_link_status($1, $2, 'link_created')", [id, owner]);
  return { owner, id };
}
const bind = async (o: { owner: string; id: string }, env: string, merchant: string, pid: string, hash: string) =>
  (await db.query<{ r: string }>('select public.bind_payment_order_link($1, $2, $3, $4, $5, $6, false) as r', [o.id, o.owner, env, merchant, pid, hash])).rows[0].r;
const completeBound = async (id: string, env: string, merchant: string, pid: string, hash: string, tx: string) =>
  (await db.query<{ r: { status: string } }>("select public.complete_bound_payment_order($1, $2, $3, $4, $5, $6, 59, 'ILS', 'grow:2') as r", [id, env, merchant, pid, hash, tx])).rows[0].r.status;

test('SQL bind: every outcome, and the order must be the owner\'s own and link_created', async () => {
  const a = await order();
  assert.equal(await bind(a, 'production', 'dare-main', '5001', H(1)), 'bound');
  assert.equal(await bind(a, 'production', 'dare-main', '5001', H(1)), 'already_bound', 'a retried checkout step changes nothing');
  assert.equal(await bind(a, 'production', 'dare-main', '5002', H(1)), 'conflict');
  assert.equal(await bind(a, 'production', 'dare-main', '5001', H(2)), 'conflict');
  const b = await order();
  assert.equal(await bind(b, 'production', 'dare-main', '5001', H(3)), 'process_in_use', 'one identifier, one order (per environment and merchant)');
  assert.equal(await bind({ owner: a.owner, id: b.id }, 'production', 'dare-main', '5003', H(3)), 'order_not_open', 'another owner\'s order');
  assert.equal(await bind(await order('created'), 'production', 'dare-main', '5004', H(4)), 'order_not_open', 'no link was created for it');
  for (const bad of [['live', 'dare-main', '5005', H(5)], ['production', 'DARE', '5005', H(5)], ['production', 'dare-main', '5 5', H(5)], ['production', 'dare-main', '5005', 'abc'], ['production', 'dare-main', '5005', 'A'.repeat(64)]]) {
    assert.equal(await bind(b, bad[0], bad[1], bad[2], bad[3]), 'invalid', JSON.stringify(bad));
  }
  const row = (await db.query<{ n: number }>('select count(*)::int as n from public.payment_order_links where order_id = $1', [b.id])).rows[0];
  assert.equal(row.n, 0);
});

test('SQL separation: the same process id may exist for another merchant or the Sandbox, and each matches only its own', async () => {
  const prod = await order();
  const otherMerchant = await order();
  const sandbox = await order();
  assert.equal(await bind(prod, 'production', 'dare-main', '7001', H(10)), 'bound');
  assert.equal(await bind(otherMerchant, 'production', 'other-shop', '7001', H(10)), 'bound');
  assert.equal(await bind(sandbox, 'sandbox', 'dare-main', '7001', H(10)), 'bound');
  // A notification matching the Sandbox binding cannot complete the production order, and vice versa; nor another merchant's.
  assert.equal(await completeBound(prod.id, 'sandbox', 'dare-main', '7001', H(10), 'TXsep01'), 'link_mismatch');
  assert.equal(await completeBound(prod.id, 'production', 'other-shop', '7001', H(10), 'TXsep02'), 'link_mismatch');
  assert.equal(await completeBound(sandbox.id, 'production', 'dare-main', '7001', H(10), 'TXsep03'), 'link_mismatch');
  assert.equal(await completeBound(prod.id, 'production', 'dare-main', '7001', H(11), 'TXsep04'), 'link_mismatch', 'wrong token hash');
  assert.equal(await completeBound(prod.id, 'production', 'dare-main', '7002', H(10), 'TXsep05'), 'link_mismatch', 'wrong process id');
  const balance = async (owner: string) => (await db.query<{ b: number }>('select public.get_credit_balance($1) as b', [owner])).rows[0].b;
  assert.deepEqual([await balance(prod.owner), await balance(otherMerchant.owner), await balance(sandbox.owner)], [0, 0, 0]);
  const touched = (await db.query<{ n: number }>('select count(*)::int as n from public.payment_orders where id = any($1) and (provider_status is not null or review_tx is not null)', [[prod.id, otherMerchant.id, sandbox.id]])).rows[0];
  assert.equal(touched.n, 0, 'a mismatch writes nothing to any order');
  assert.equal(await completeBound(prod.id, 'production', 'dare-main', '7001', H(10), 'TXsep06'), 'granted');
  assert.equal(await balance(prod.owner), 3);
});

test('SQL completion: malformed arguments are invalid, an unknown order is not found, an unbound one is link_missing', async () => {
  const o = await order();
  assert.equal(await completeBound(o.id, 'production', 'dare-main', '7100', H(20), 'T1'), 'invalid', 'transaction id too short');
  assert.equal(await completeBound('f'.repeat(32), 'production', 'dare-main', '7100', H(20), 'TXmissing'), 'order_not_found');
  assert.equal(await completeBound(o.id, 'production', 'dare-main', '7100', H(20), 'TXunbound'), 'link_missing');
  assert.equal(await completeBound(o.id, 'qa', 'dare-main', '7100', H(20), 'TXbadenv'), 'invalid');
});

test('SQL notice log: only fixed formats are kept; anything else is dropped, never stored as sent', async () => {
  const log = async (...a: (string | null)[]) => (await db.query<{ r: boolean }>('select public.log_payment_notice($1, $2, $3, $4, $5, $6, $7) as r', a)).rows[0].r;
  assert.equal(await log('production', ORDER, transactionHash('4097233'), '2', 'flat/brackets', 'granted', 'approved'), true);
  assert.equal(await log('weird', 'payer@example.com', 'not-a-hash', 'paid', 'FLAT; drop', 'granted', 'maybe'), true);
  assert.equal(await log('production', ORDER, null, null, null, 'Bad Outcome!', null), false, 'an outcome outside the vocabulary is not written');
  const rows = (await db.query<Record<string, unknown>>('select environment, order_id, tx_hash, status_code, shape, outcome, approve from public.payment_notices order by id desc limit 2')).rows;
  assert.deepEqual(rows[0], { environment: 'unknown', order_id: null, tx_hash: null, status_code: null, shape: null, outcome: 'granted', approve: null });
  assert.equal(rows[1].order_id, ORDER);
  assert.equal(rows[1].tx_hash, transactionHash('4097233'));
});

test('SQL privileges: the new tables have RLS and no client grants; the new functions run for service_role only', async () => {
  for (const t of ['payment_order_links', 'payment_notices']) {
    const rls = (await db.query<{ r: boolean }>('select relrowsecurity as r from pg_class where relname = $1', [t])).rows[0].r;
    assert.equal(rls, true, t);
    for (const role of ['anon', 'authenticated']) {
      const can = (await db.query<{ c: boolean }>("select has_table_privilege($1, $2, 'select') or has_table_privilege($1, $2, 'insert') as c", [role, `public.${t}`])).rows[0].c;
      assert.equal(can, false, `${role} on ${t}`);
    }
  }
  const fns = ['public.bind_payment_order_link(text, uuid, text, text, text, text, boolean)', 'public.complete_bound_payment_order(text, text, text, text, text, text, numeric, text, text)', 'public.log_payment_notice(text, text, text, text, text, text, text)'];
  for (const f of fns) {
    for (const role of ['anon', 'authenticated', 'public']) {
      const can = role === 'public'
        ? (await db.query<{ c: boolean }>("select exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = $1::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') as c", [f])).rows[0].c
        : (await db.query<{ c: boolean }>("select has_function_privilege($1, $2, 'execute') as c", [role, f])).rows[0].c;
      assert.equal(can, false, `${role} may execute ${f}`);
    }
    assert.equal((await db.query<{ c: boolean }>("select has_function_privilege('service_role', $1, 'execute') as c", [f])).rows[0].c, true, f);
    const def = (await db.query<{ d: boolean }>('select prosecdef as d from pg_proc where oid = $1::regprocedure', [f])).rows[0].d;
    assert.equal(def, true, `${f} is SECURITY DEFINER`);
  }
});
