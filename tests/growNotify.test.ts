import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  VERIFIED_SHAPES,
  MAX_BODY_BYTES,
  checkMatches,
  growNotifyCheck,
  growNotifyMode,
  handleGrowNotify,
  parseAllowedIps,
  readNotification,
  trustedSourceIp,
  type GrowNotifyDeps,
  type GrowNotifyRequest,
  type GrowShape,
} from '../server/payments/growNotify.ts';
import { linkTokenHash, type BoundCompletionRequest, type BoundCompletionStatus, type NoticeEntry } from '../server/payments/growLinkBinding.ts';
import { disabledApprover } from '../server/payments/growApprove.ts';
import { buildMakeCheckoutPayload } from '../server/payments/makeCheckoutClient.ts';
import { handleStartCheckout, type CheckoutDeps } from '../server/payments/checkoutStart.ts';
import { paidPackage } from '../server/payments/checkoutPackages.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SECRET = 's'.repeat(32) + '-grow-notify-test-secret';
const GROW_IP = '3.123.194.128';
const OTHER_GROW_IP = '52.59.95.229';
const ATTACKER_IP = '203.0.113.7';
const ORDER = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const OTHER_ORDER = 'ffffffffffffffffffffffffffffffff';
const CHECK = growNotifyCheck(ORDER, SECRET);
const TX = '4097233';
const PAYER = { fullName: 'Noa Fictional', payerPhone: '0521112233', payerEmail: 'payer@example.com', cardSuffix: '4880' };

const LINK_KEY = 'k'.repeat(32) + '-link-token-test-key';
const PID = '70011';
const PTOKEN = 'ptok9f8e7d6c5b4a';
const LINK = { environment: 'production' as const, merchant: 'dare-test', key: LINK_KEY };

const ENV = (over: Record<string, string | undefined> = {}) =>
  ({
    VERCEL_ENV: 'production',
    GROW_NOTIFY_MODE: 'on',
    GROW_NOTIFY_IPS: `${GROW_IP}, ${OTHER_GROW_IP}`,
    GROW_NOTIFY_SECRET: SECRET,
    GROW_ENVIRONMENT: 'production',
    GROW_MERCHANT_REF: 'dare-test',
    GROW_LINK_TOKEN_KEY: LINK_KEY,
    ...over,
  }) as NodeJS.ProcessEnv;

/** What the completion receives for the default notification (the token only as its keyed hash). */
const bound = (over: Partial<BoundCompletionRequest> = {}): BoundCompletionRequest => ({
  orderId: ORDER,
  transactionId: TX,
  amount: 59,
  currency: 'ILS',
  providerStatus: 'grow:2',
  environment: 'production',
  merchant: 'dare-test',
  processId: PID,
  tokenHash: linkTokenHash(LINK, PID, PTOKEN),
  ...over,
});

/** A flat form notification as @vercel/node's url-encoded parser would hand it over (bracket keys stay literal). */
const flat = (over: Record<string, unknown> = {}) => ({
  transactionId: TX,
  transactionToken: 'tok',
  processId: PID,
  processToken: PTOKEN,
  statusCode: '2',
  status: 'שולם',
  sum: '59',
  allPaymentsNum: '1',
  'customFields[cField1]': ORDER,
  'customFields[cField2]': CHECK,
  ...PAYER,
  ...over,
});
/** The wrapped layout of the documented callback sample. */
const wrapped = (over: Record<string, unknown> = {}) => ({
  err: '',
  status: '1',
  data: { transactionId: TX, statusCode: '2', status: 'שולם', sum: '59', allPaymentsNum: '1', processId: PID, processToken: PTOKEN, customFields: { cField1: ORDER, cField2: CHECK }, ...PAYER, ...over },
});

const req = (body: unknown, over: Partial<GrowNotifyRequest> = {}): GrowNotifyRequest => ({
  method: 'POST',
  vercelForwardedFor: GROW_IP,
  contentType: 'application/x-www-form-urlencoded',
  contentLength: undefined,
  readBody: () => body,
  ...over,
});

interface Calls {
  complete: BoundCompletionRequest[];
  /** Rows written to the durable notice log (never to the order itself). */
  notices: NoticeEntry[];
  logs: string[];
}
function deps(over: Partial<GrowNotifyDeps> = {}, outcome: BoundCompletionStatus | null = 'granted') {
  const calls: Calls = { complete: [], notices: [], logs: [] };
  const d: GrowNotifyDeps = {
    env: ENV(),
    complete: async (r) => (calls.complete.push(r), outcome),
    verifiedShapes: ['flat/brackets', 'wrapped/nested'] as GrowShape[], // tests only: production keeps VERIFIED_SHAPES (empty)
    verifiedLinkFields: ['processId/processToken'], // tests only: production keeps VERIFIED_LINK_FIELDS (empty)
    logNotice: async (e) => void calls.notices.push(e),
    approver: disabledApprover,
    log: (l) => void calls.logs.push(l),
    ...over,
  };
  return { d, calls };
}

// ------------------------------------------------------------------------- closed by default ----

test('production: no shape is verified yet, so the grant path is closed in code whatever the mode', async () => {
  assert.deepEqual(VERIFIED_SHAPES, []);
  for (const mode of ['on', 'capture']) {
    for (const body of [flat(), wrapped()]) {
      const { d, calls } = deps({ env: ENV({ GROW_NOTIFY_MODE: mode }), verifiedShapes: VERIFIED_SHAPES });
      const r = await handleGrowNotify(req(body), d);
      assert.equal(r.status, 503, `${mode}: not processed, Grow keeps and retries the notification`);
      assert.deepEqual(calls.complete, [], 'never reaches the completion');
      assert.deepEqual(calls.notices, []);
      assert.match(calls.logs[0], /grow_notify_capture .*verdict=would_complete/);
    }
  }
});

test('mode: unset, empty or unknown is off and the route answers 404 for any method, touching nothing', async () => {
  for (const mode of [undefined, '', 'ON', 'true', 'shadow', ' on x']) {
    assert.equal(growNotifyMode({ GROW_NOTIFY_MODE: mode } as NodeJS.ProcessEnv), 'off', String(mode));
    const { d, calls } = deps({ env: ENV({ GROW_NOTIFY_MODE: mode }) });
    for (const method of ['POST', 'GET']) assert.equal((await handleGrowNotify(req(flat(), { method }), d)).status, 404);
    assert.deepEqual([calls.complete, calls.notices, calls.logs], [[], [], []]);
  }
});

test('capture: logs the shape, the verdict and FIELD NAMES only, never grants', async () => {
  const { d, calls } = deps({ env: ENV({ GROW_NOTIFY_MODE: 'capture' }) });
  const r = await handleGrowNotify(req(flat()), d);
  assert.equal(r.status, 503);
  assert.deepEqual(calls.complete, []);
  assert.match(calls.logs[0], /shape=flat\/brackets shape_verified=true verdict=would_complete type=application\/x-www-form-urlencoded kind=object fields=.*customFields\[cField2\].* other=0$/);
});

// -------------------------------------------------------------------------------- source ----

test('source: only x-vercel-forwarded-for counts; forged forwarding headers cannot pass (they never reach the handler)', async () => {
  const { d, calls } = deps();
  // An attacker can put Grow's address in X-Forwarded-For / X-Real-IP; Vercel's own header still shows the attacker.
  const api = strip(read('api/payment-complete.ts'));
  assert.match(api, /vercelForwardedFor: req\.headers\['x-vercel-forwarded-for'\]/);
  assert.ok(!/x-forwarded-for'|x-real-ip|forwarded'\]|ipAddress\(/i.test(api.replace(/x-vercel-forwarded-for/g, '')), 'no other address header is read');
  const mod = strip(read('server/payments/growNotify.ts'));
  assert.ok(!/x-forwarded-for|x-real-ip|headers\[/i.test(mod.replace(/x-vercel-forwarded-for/g, '')), 'the module reads no header itself');
  for (const ip of [ATTACKER_IP, undefined, null, '', ' ', `${ATTACKER_IP}, ${GROW_IP}`, `${GROW_IP}, ${ATTACKER_IP}`, `${GROW_IP},${GROW_IP}`, [GROW_IP], '::ffff:3.123.194.128', '2001:db8::1', '3.123.194.128.', '03.123.194.128', '3.123.194.1280', 'localhost']) {
    const r = await handleGrowNotify(req(flat(), { vercelForwardedFor: ip as string }), d);
    assert.equal(r.status, 403, JSON.stringify(ip));
  }
  assert.deepEqual(calls.complete, []);
  assert.ok(calls.logs.every((l) => l === 'grow_notify_rejected reason=source'), 'the address itself is not logged');
  assert.equal(trustedSourceIp(` ${GROW_IP} `), GROW_IP);
  assert.equal((await handleGrowNotify(req(flat(), { vercelForwardedFor: OTHER_GROW_IP }), deps().d)).status, 200, 'any listed address');
});

test('source: an empty or malformed allow-list refuses everyone (fail closed)', async () => {
  for (const list of [undefined, '', ' , ', `${GROW_IP}, not-an-ip`, '3.123.194.0/24', `${GROW_IP} 2001:db8::1`]) {
    assert.equal(parseAllowedIps(list), null, String(list));
    const { d, calls } = deps({ env: ENV({ GROW_NOTIFY_IPS: list }) });
    assert.equal((await handleGrowNotify(req(flat()), d)).status, 403);
    assert.deepEqual(calls.complete, []);
    assert.deepEqual(calls.logs, ['grow_notify_rejected reason=ip_list_not_configured']);
  }
});

test('source is checked BEFORE the size, the body and the secret: a stranger learns nothing and causes nothing', async () => {
  const { d, calls } = deps({ env: ENV({ GROW_NOTIFY_SECRET: undefined }) });
  let bodyRead = false;
  const readBody = () => ((bodyRead = true), 'x'.repeat(MAX_BODY_BYTES * 4));
  const r = await handleGrowNotify(req(undefined, { readBody, vercelForwardedFor: ATTACKER_IP, contentLength: String(MAX_BODY_BYTES * 4) }), d);
  assert.equal(bodyRead, false, 'the body is never read for a stranger');
  assert.equal(r.status, 403);
  assert.deepEqual(r.body, { reason: 'forbidden', message: 'Forbidden.' });
  assert.deepEqual(calls.logs, ['grow_notify_rejected reason=source'], 'refused on the address, not on the size or the missing secret');
});

// ---------------------------------------------------------------------------------- size ----

test('size: a declared or actual body above 16 KiB is refused before it is read', async () => {
  const { d, calls } = deps();
  assert.equal((await handleGrowNotify(req(flat(), { contentLength: String(MAX_BODY_BYTES + 1) }), d)).status, 413);
  for (const contentLength of ['abc', '', '-1', '1e3', ['900', '900']] as (string | string[])[]) {
    let bodyRead = false;
    const r = await handleGrowNotify(req(undefined, { contentLength, readBody: () => ((bodyRead = true), flat()) }), d);
    assert.equal(r.status, 413, JSON.stringify(contentLength));
    assert.equal(bodyRead, false, 'a bad declared length stops before the body is read');
  }
  assert.equal((await handleGrowNotify(req(flat({ description: 'x'.repeat(MAX_BODY_BYTES) })), d)).status, 413);
  assert.deepEqual(calls.complete, []);
  assert.equal((await handleGrowNotify(req(flat(), { contentLength: '900' }), d)).status, 200);
});

// ----------------------------------------------------------------------- order binding ----

test('binding: the order check is a 32-hex HMAC of the order id, deterministic and secret-dependent', () => {
  assert.match(CHECK, /^[0-9a-f]{32}$/);
  assert.equal(growNotifyCheck(ORDER, SECRET), CHECK);
  assert.notEqual(growNotifyCheck(OTHER_ORDER, SECRET), CHECK);
  assert.notEqual(growNotifyCheck(ORDER, SECRET + 'x'), CHECK);
  assert.ok(checkMatches(ORDER, CHECK, [SECRET]));
  assert.ok(!checkMatches(ORDER, CHECK.toUpperCase(), [SECRET]));
  assert.ok(!checkMatches(ORDER, CHECK, []));
  assert.match(strip(read('server/payments/growNotify.ts')), /timingSafeEqual/);
});

test('binding: a wrong, missing, swapped or foreign check is refused with 403 and never reaches the database', async () => {
  const { d, calls } = deps();
  const cases: Record<string, unknown>[] = [
    flat({ 'customFields[cField2]': undefined }),
    flat({ 'customFields[cField2]': '' }),
    flat({ 'customFields[cField2]': growNotifyCheck(OTHER_ORDER, SECRET) }), // a valid check for ANOTHER order
    flat({ 'customFields[cField2]': growNotifyCheck(ORDER, 'w'.repeat(40)) }), // made with a guessed secret
    flat({ 'customFields[cField2]': CHECK.toUpperCase() }),
    flat({ 'customFields[cField2]': CHECK + '0' }),
    flat({ 'customFields[cField2]': CHECK.slice(1) }),
    flat({ 'customFields[cField1]': OTHER_ORDER }), // order swapped, check kept
    flat({ 'customFields[cField1]': undefined }),
    flat({ 'customFields[cField1]': ORDER.toUpperCase() }),
    flat({ 'customFields[cField1]': `${ORDER}x` }),
    flat({ 'customFields[cField1]': [ORDER] }),
    flat({ 'customFields[cField2]': { v: CHECK } }),
    wrapped({ customFields: { cField1: ORDER } }),
    wrapped({ customFields: { cField2: CHECK } }),
  ];
  for (const body of cases) assert.equal((await handleGrowNotify(req(body), d)).status, 403, JSON.stringify(body).slice(0, 160));
  assert.deepEqual(calls.complete, []);
  assert.deepEqual(calls.notices, []);
});

test('binding: the HMAC alone is never enough: a correct check from a non-Grow address is refused', async () => {
  const { d, calls } = deps();
  assert.equal((await handleGrowNotify(req(flat(), { vercelForwardedFor: ATTACKER_IP }), d)).status, 403);
  assert.deepEqual(calls.complete, []);
});

test('secret: missing or shorter than 32 characters = nothing is processed (503), the check is never computed with a weak key', async () => {
  for (const s of [undefined, '', 'short', 'x'.repeat(31)]) {
    const { d, calls } = deps({ env: ENV({ GROW_NOTIFY_SECRET: s }) });
    assert.equal((await handleGrowNotify(req(flat()), d)).status, 503);
    assert.deepEqual(calls.complete, []);
  }
});

// ------------------------------------------------------------------------------- content ----

test('content: every required field must be present and well formed, or nothing is granted', async () => {
  const bad: [string, Record<string, unknown>][] = [
    ['statusCode missing', { statusCode: undefined }],
    ['statusCode text', { statusCode: 'paid' }],
    ['statusCode empty', { statusCode: '' }],
    ['transactionId missing', { transactionId: undefined }],
    ['transactionId short', { transactionId: 'ab' }],
    ['transactionId odd chars', { transactionId: '12 34' }],
    ['transactionId injection', { transactionId: "1'; drop table x;--" }],
    ['transactionId array', { transactionId: [TX, TX] }],
    ['sum missing', { sum: undefined }],
    ['sum zero', { sum: '0' }],
    ['sum negative', { sum: '-59' }],
    ['sum three decimals', { sum: '59.001' }],
    ['sum comma', { sum: '59,00' }],
    ['sum text', { sum: 'fifty nine' }],
    ['sum object', { sum: { v: 59 } }],
    ['allPaymentsNum missing', { allPaymentsNum: undefined }],
    ['allPaymentsNum installments', { allPaymentsNum: '3' }],
    ['allPaymentsNum zero', { allPaymentsNum: '0' }],
  ];
  for (const [name, over] of bad) {
    const { d, calls } = deps();
    const r = await handleGrowNotify(req(flat(over)), d);
    assert.equal(r.status, 400, name);
    assert.deepEqual(calls.complete, [], name);
    assert.equal(calls.notices.length, 1, `${name}: one row in the notice log`);
    assert.match(calls.notices[0].outcome, /^invalid_[a-z]+$/, name);
  }
});

test('content: the amount is checked by the DATABASE against the order; a wrong amount is passed through and granted nothing there', async () => {
  const { d, calls } = deps({}, 'amount_mismatch');
  const r = await handleGrowNotify(req(flat({ sum: '149' })), d);
  assert.equal(r.status, 200, 'received (kept for review by the database), so Grow stops retrying');
  assert.deepEqual(calls.complete, [bound({ amount: 149 })]);
  assert.deepEqual(calls.logs, ['grow_notify_result outcome=amount_mismatch'], 'a refused payment is not approved');
});

test('content: an unrecognized layout is refused and only its field names are logged', async () => {
  const { d, calls } = deps();
  for (const body of [undefined, null, '', 'transactionId=1', [flat()], Buffer.from('x'), { hello: 'world' }, { data: [flat()] }]) {
    assert.equal((await handleGrowNotify(req(body), d)).status, 400, String(body));
  }
  assert.deepEqual(calls.complete, []);
  assert.ok(calls.logs.every((l) => l.startsWith('grow_notify_unrecognized mode=on')));
});

test('status: a non-paid notification grants nothing, closes nothing and writes nothing to the order; only the notice log keeps it', async () => {
  const { d, calls } = deps();
  const r = await handleGrowNotify(req(flat({ statusCode: '3', status: 'נכשל' })), d);
  assert.equal(r.status, 200);
  assert.deepEqual(calls.complete, []);
  assert.equal(calls.notices.length, 1);
  assert.deepEqual({ ...calls.notices[0], txHash: null }, { environment: 'production', orderId: ORDER, txHash: null, statusCode: '3', shape: 'flat/brackets', outcome: 'not_paid', approve: null });
  assert.match(calls.notices[0].txHash ?? '', /^[0-9a-f]{64}$/);
  assert.ok(!/recordNotice|recordPaymentNotice/.test(strip(read('server/payments/growNotify.ts'))), 'the direct path never writes an order status');
});

test('status: the Hebrew status text is never what decides; only statusCode "2" is paid', async () => {
  const { d, calls } = deps();
  await handleGrowNotify(req(flat({ statusCode: '4', status: 'שולם' })), d);
  assert.deepEqual(calls.complete, []);
  await handleGrowNotify(req(flat({ statusCode: '2', status: 'anything' })), d);
  assert.equal(calls.complete.length, 1);
});

// ------------------------------------------------------------------------------ completion ----

test('completion: a verified paid notification goes to the bound completion with the ORDER id, tx, sum, constant ILS and the link ids', async () => {
  for (const body of [flat(), wrapped(), flat({ sum: 59, transactionId: 4097233, processId: 70011 }), flat({ sum: '59.00' })]) {
    const { d, calls } = deps();
    const r = await handleGrowNotify(req(body), d);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { received: true }, 'nothing is echoed back');
    assert.deepEqual(calls.complete, [bound()]);
    assert.ok(!JSON.stringify(calls.complete).includes(PTOKEN), 'the token itself never leaves the handler, only its keyed hash');
  }
});

test('completion: shapes are verified one by one; an unverified layout of the same data stays closed', async () => {
  const { d, calls } = deps({ verifiedShapes: ['wrapped/nested'] });
  assert.equal((await handleGrowNotify(req(flat()), d)).status, 503);
  assert.deepEqual(calls.complete, []);
  const shapeOf = (b: unknown) => { const r = readNotification(b); return r.ok ? r.value.shape : r.reason; };
  assert.equal(shapeOf(flat()), 'flat/brackets');
  assert.equal(shapeOf(wrapped()), 'wrapped/nested');
  assert.equal(shapeOf({ transactionId: TX, statusCode: '2', sum: '59', allPaymentsNum: '1', customFields: { cField1: ORDER, cField2: CHECK } }), 'flat/nested');
  assert.equal(shapeOf({ err: '', data: { transactionId: TX, 'customFields[cField1]': ORDER, 'customFields[cField2]': CHECK } }), 'wrapped/brackets');
});

test('replay and duplicates: the same notification six times reaches the idempotent completion, which answers duplicate after the first', async () => {
  let granted = false;
  const { d, calls } = deps({ complete: async (r) => (calls.complete.push(r), granted ? 'duplicate' : ((granted = true), 'granted')) });
  for (let i = 0; i < 6; i++) assert.equal((await handleGrowNotify(req(flat()), d)).status, 200);
  assert.deepEqual(calls.logs, ['grow_notify_result outcome=granted approve=not_configured', ...Array(5).fill('grow_notify_result outcome=duplicate approve=not_configured')], 'a duplicate is acknowledged again, never granted again');
});

test('race: parallel identical notifications grant once (the database lock decides; the handler adds no state of its own)', async () => {
  let granted = 0;
  let lock = Promise.resolve();
  const complete = (r: BoundCompletionRequest) => {
    const run = lock.then(async () => (granted === 0 ? ((granted = 1), 'granted' as const) : ('duplicate' as const)));
    lock = run.then(() => undefined);
    void r;
    return run;
  };
  const { d, calls } = deps({ complete });
  const results = await Promise.all(Array.from({ length: 10 }, () => handleGrowNotify(req(flat()), d)));
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(calls.logs.filter((l) => l.includes('outcome=granted ')).length, 1);
  assert.match(strip(read('server/payments/growNotify.ts')), /complete: completeBoundPaymentOrder/, 'the real store is the bound completion (link check + the existing completion, one transaction)');
});

test('completion outcomes: store down = 503 (Grow retries); refusals are received and granted nothing; invalid = 400', async () => {
  const expect: [BoundCompletionStatus | null, number][] = [
    [null, 503],
    ['link_missing', 200],
    ['link_mismatch', 200],
    ['order_not_open', 200],
    ['granted', 200],
    ['duplicate', 200],
    ['order_not_found', 200],
    ['transaction_used_by_other_order', 200],
    ['order_already_completed', 200],
    ['amount_mismatch', 200],
    ['currency_mismatch', 200],
    ['owner_gone', 200],
    ['invalid', 400],
  ];
  for (const [outcome, status] of expect) {
    const { d } = deps({}, outcome);
    assert.equal((await handleGrowNotify(req(flat()), d)).status, status, String(outcome));
  }
});

test('database failure: a thrown store error is not swallowed into a success', async () => {
  const { d } = deps({ complete: async () => Promise.reject(new Error('db down')) });
  await assert.rejects(handleGrowNotify(req(flat()), d));
});

// ------------------------------------------------------------------------------- privacy ----

test('privacy: no value from the notification, the check or the secret ever appears in a log line or a response', async () => {
  const lines: string[] = [];
  const bodies: unknown[] = [];
  const scenarios: [Partial<GrowNotifyDeps>, Partial<GrowNotifyRequest>, unknown][] = [
    [{}, {}, flat()],
    [{ env: ENV({ GROW_NOTIFY_MODE: 'capture' }) }, {}, wrapped()],
    [{}, {}, flat({ 'customFields[cField2]': growNotifyCheck(OTHER_ORDER, SECRET) })],
    [{}, {}, flat({ statusCode: '3' })],
    [{}, {}, flat({ sum: 'bad' })],
    [{}, {}, { unexpected: PAYER.payerEmail }],
    [{}, { vercelForwardedFor: ATTACKER_IP }, flat()],
  ];
  for (const [over, r, body] of scenarios) {
    const { d, calls } = deps(over);
    const res = await handleGrowNotify(req(body, r), d);
    lines.push(...calls.logs);
    bodies.push(res.body);
  }
  const all = lines.join('\n') + JSON.stringify(bodies);
  for (const v of [SECRET, CHECK, growNotifyCheck(OTHER_ORDER, SECRET), ORDER, TX, '4097233', PID, PTOKEN, LINK_KEY, linkTokenHash(LINK, PID, PTOKEN), PAYER.fullName, PAYER.payerPhone, PAYER.payerEmail, PAYER.cardSuffix, ATTACKER_IP, GROW_IP, 'שולם']) {
    assert.ok(!all.includes(v), v);
  }
  assert.ok(!/console\.log/.test(strip(read('server/payments/growNotify.ts'))));
});

// ----------------------------------------------------------------------- checkout side ----

test('checkout: notifyCheck is sent to Make only when GROW_NOTIFY_SECRET is set; otherwise the payload is exactly as before', () => {
  const pkg = paidPackage('go_deeper_3')!;
  const payer = { fullName: 'Sample Customer', phone: '0500000000' };
  const before = buildMakeCheckoutPayload(ORDER, pkg, 'https://daretogoin.com', payer, { env: {} as NodeJS.ProcessEnv });
  assert.ok(!('notifyCheck' in before));
  const weak = buildMakeCheckoutPayload(ORDER, pkg, 'https://daretogoin.com', payer, { env: { GROW_NOTIFY_SECRET: 'x'.repeat(31) } as NodeJS.ProcessEnv });
  assert.ok(!('notifyCheck' in weak));
  const after = buildMakeCheckoutPayload(ORDER, pkg, 'https://daretogoin.com', payer, { env: { GROW_NOTIFY_SECRET: SECRET } as NodeJS.ProcessEnv });
  assert.equal(after.notifyCheck, CHECK);
  assert.match(after.notifyCheck!, /^[0-9a-f]{32}$/, 'no special characters (Grow forbids them in custom fields)');
  assert.deepEqual({ ...after, notifyCheck: undefined }, { ...before, notifyCheck: undefined });
});

test('checkout: the check never reaches the browser, and a payment link that carries it is refused', async () => {
  const OWNER = '11111111-1111-4111-8111-111111111111';
  const prev = process.env.GROW_NOTIFY_SECRET;
  process.env.GROW_NOTIFY_SECRET = SECRET;
  try {
    const run = async (paymentUrl: string) => {
      const marked: string[] = [];
      const d: CheckoutDeps = {
        verifyBearer: async () => ({ ok: true, userId: OWNER }),
        siteUrl: () => 'https://daretogoin.com',
        makeConfigured: () => true,
        packageStillHeld: async () => false,
        createOrder: async () => ({ status: 'created', orderId: ORDER }),
        markLink: async (_o, _u, s) => (marked.push(s), true),
        requestLink: async (payload) => {
          assert.equal(payload.notifyCheck, CHECK, 'Make receives the check');
          return { ok: true, paymentUrl };
        },
      };
      const res = await handleStartCheckout({ packageId: 'go_deeper_3', fullName: 'Noa Fictional', phone: '0521112233' }, { authorization: 'Bearer x' }, d);
      return { res, marked };
    };
    const good = await run('https://pay.grow.link/ab12cd34ef');
    assert.equal(good.res.status, 200);
    assert.ok(!JSON.stringify(good.res.body).includes(CHECK));
    const leaky = await run(`https://pay.grow.link/ab12cd34ef?c=${CHECK.toUpperCase()}`);
    assert.equal(leaky.res.status, 502);
    assert.deepEqual(leaky.marked, ['link_failed']);
    assert.ok(!JSON.stringify(leaky.res.body).includes(CHECK.toUpperCase()));
  } finally {
    if (prev === undefined) delete process.env.GROW_NOTIFY_SECRET;
    else process.env.GROW_NOTIFY_SECRET = prev;
  }
});

test('the check and the secret are server-only: nothing in the browser code mentions them', () => {
  const walk = (dir: string): string[] => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
  for (const f of walk('src').filter((x) => /\.(ts|tsx)$/.test(x))) assert.ok(!/GROW_NOTIFY|notifyCheck|grow-notify/.test(read(f)), f);
  assert.ok(!/VITE_GROW/.test(read('.env.example')));
});

// ------------------------------------------------------------------------------- wiring ----

test('wiring: /api/grow-notify is a rewrite onto the existing payment function; still 12 functions; the Make path is unchanged', () => {
  const vercel = JSON.parse(read('vercel.json')) as { rewrites?: { source: string; destination: string }[] };
  assert.deepEqual(vercel.rewrites, [{ source: '/api/grow-notify', destination: '/api/payment-complete?via=grow-notify' }]);
  assert.equal(readdirSync(new URL('../api', import.meta.url)).filter((f) => f.endsWith('.ts')).length, 12);
  const api = strip(read('api/payment-complete.ts'));
  assert.match(api, /req\.query\.via === 'grow-notify'/);
  assert.match(api, /handlePaymentComplete\(req\.body, \{ authorization: req\.headers\.authorization \}\)/);
  assert.match(read('server/index.ts'), /app\.all\('\/api\/grow-notify'/);
});

test('wiring: the direct path reaches the database only through the bound completion, which hands over to the existing one', () => {
  const mod = strip(read('server/payments/growNotify.ts'));
  assert.ok(!/grant_credits|complete_payment_order|\.rpc\(|from\('/.test(mod), 'the handler itself never calls the database');
  assert.match(mod, /completeBoundPaymentOrder,/);
  assert.ok(!/completePaymentOrder|recordPaymentNotice/.test(mod), 'no other completion or order write');
  // The one new migration (2026-11-23) is additive: new objects only; nothing existing is altered, dropped or redefined.
  const added = readdirSync(new URL('../supabase/migrations', import.meta.url)).filter((f) => /^2026112[0-9]/.test(f));
  assert.deepEqual(added, ['20261123_payment_order_links.sql']);
  const sql = strip(read(`supabase/migrations/${added[0]}`)).replace(/--.*$/gm, '');
  assert.ok(!/\balter\s+table\s+(?!public\.payment_order_links|public\.payment_notices)/i.test(sql), 'no existing table altered');
  assert.ok(!/\bdrop\b|\btruncate\b|\bdelete\s+from\b|\bupdate\s+public\./i.test(sql), 'nothing dropped, deleted or updated');
  const fns = [...sql.matchAll(/create or replace function public\.([a-z_]+)/g)].map((m) => m[1]).sort();
  assert.deepEqual(fns, ['bind_payment_order_link', 'complete_bound_payment_order', 'log_payment_notice'], 'only new functions');
  assert.match(sql, /return public\.complete_payment_order\(p_order, p_tx, p_amount, p_currency, p_provider_status\)/, 'the existing completion alone grants');
});
