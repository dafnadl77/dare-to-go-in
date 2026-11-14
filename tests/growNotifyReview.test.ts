import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'node:querystring';
import {
  VERIFIED_SHAPES,
  MAX_BODY_BYTES,
  acceptedSecrets,
  captureAcknowledges,
  describeBody,
  effectiveMode,
  growNotifyCheck,
  handleGrowNotify,
  readNotification,
  type GrowNotifyDeps,
  type GrowNotifyRequest,
  type GrowShape,
} from '../server/payments/growNotify.ts';
import type { CompletionRequest } from '../server/payments/completionRequest.ts';
import type { CompletionStatus } from '../server/payments/completionStore.ts';
import { buildMakeCheckoutPayload } from '../server/payments/makeCheckoutClient.ts';
import { paidPackage } from '../server/payments/checkoutPackages.ts';
import { handlePaymentComplete } from '../server/payments/paymentComplete.ts';
import paymentCompleteApi from '../api/payment-complete.ts';

/**
 * Fixes from the security review of 2026-11-14 (M1-M4, L1-L5): log content, mode x environment, the real Vercel entry point,
 * the unchanged Make path, secret rotation and contradictory layouts. All values below are fictional.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SECRET = 'r'.repeat(32) + '-review-test-secret';
const GROW_IP = '3.123.194.128';
const ATTACKER_IP = '203.0.113.7';
const ORDER = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const OTHER_ORDER = 'ffffffffffffffffffffffffffffffff';
const CHECK = growNotifyCheck(ORDER, SECRET);
const TX = '4097233';
const FAKE = { name: 'Yael Fictional', phone: '0529876543', email: 'yael.fictional@example.org', card: '4580123412341234' };
const FAKE_CHECK = growNotifyCheck('0123456789abcdef0123456789abcdef', 'f'.repeat(40));

const ENV = (over: Record<string, string | undefined> = {}) =>
  ({ VERCEL_ENV: 'production', GROW_NOTIFY_MODE: 'on', GROW_NOTIFY_IPS: GROW_IP, GROW_NOTIFY_SECRET: SECRET, ...over }) as NodeJS.ProcessEnv;

const flat = (over: Record<string, unknown> = {}) => ({
  transactionId: TX,
  statusCode: '2',
  status: 'שולם',
  sum: '59',
  allPaymentsNum: '1',
  fullName: FAKE.name,
  payerPhone: FAKE.phone,
  payerEmail: FAKE.email,
  'customFields[cField1]': ORDER,
  'customFields[cField2]': CHECK,
  ...over,
});
const wrapped = () => ({ err: '', status: '1', data: { transactionId: TX, statusCode: '2', sum: '59', allPaymentsNum: '1', payerPhone: FAKE.phone, customFields: { cField1: ORDER, cField2: CHECK } } });

const req = (body: unknown, over: Partial<GrowNotifyRequest> = {}): GrowNotifyRequest => ({
  method: 'POST',
  vercelForwardedFor: GROW_IP,
  contentType: 'application/x-www-form-urlencoded',
  contentLength: undefined,
  readBody: () => body,
  ...over,
});

function deps(over: Partial<GrowNotifyDeps> = {}, outcome: CompletionStatus | null = 'granted') {
  const calls = { complete: [] as CompletionRequest[], notices: [] as string[], logs: [] as string[] };
  const d: GrowNotifyDeps = {
    env: ENV(),
    complete: async (r) => (calls.complete.push(r), outcome),
    recordNotice: async (o) => void calls.notices.push(o),
    verifiedShapes: ['flat/brackets', 'wrapped/nested'] as GrowShape[], // tests only: production keeps VERIFIED_SHAPES (empty)
    log: (l) => void calls.logs.push(l),
    ...over,
  };
  return { d, calls };
}

// ------------------------------------------------------------------------------------- M1 ----

test('M1: undocumented field names are only counted, so a value a parser turned into a key never reaches the log', async () => {
  const hostile: unknown[] = [
    parse(JSON.stringify({ data: { fullName: `${FAKE.name}&${FAKE.phone}`, customFields: { cField2: FAKE_CHECK } } })), // JSON sent as a form
    parse(`payerPhone${FAKE.phone}&cField2${FAKE_CHECK}&${FAKE.email}&sum=59`), // keys without '='
    { [FAKE.email]: '1', [FAKE.phone]: '2', [FAKE_CHECK]: '3', [`customFields[${FAKE.name}]`]: '4', data: { [FAKE.card]: 'x' } },
    flat({ [`x${FAKE_CHECK}`]: '1', [`payerPhone${FAKE.phone}`]: '1' }),
    wrapped(),
  ];
  for (const vercelEnv of ['production', 'preview']) {
    for (const mode of ['capture', 'on']) {
      for (const body of hostile) {
        const { d, calls } = deps({ env: ENV({ VERCEL_ENV: vercelEnv, GROW_NOTIFY_MODE: mode }), verifiedShapes: VERIFIED_SHAPES });
        const r = await handleGrowNotify(req(body), d);
        const all = calls.logs.join('\n') + JSON.stringify(r.body);
        for (const v of [FAKE.name, 'Yael', FAKE.phone, FAKE.phone.slice(2), FAKE.email, 'fictional', FAKE.card, FAKE_CHECK, FAKE_CHECK.slice(0, 10), CHECK, CHECK.slice(0, 10), ORDER, TX, SECRET, 'שולם']) {
          assert.ok(!all.includes(v), `${vercelEnv}/${mode}: "${v}" leaked: ${all}`);
        }
      }
    }
  }
  assert.equal(describeBody(hostile[2]), 'kind=object fields=data other=5');
  assert.equal(describeBody(flat()), 'kind=object fields=allPaymentsNum,customFields[cField1],customFields[cField2],fullName,payerEmail,payerPhone,status,statusCode,sum,transactionId other=0');
  assert.equal(describeBody(wrapped()), 'kind=object fields=data,data.allPaymentsNum,data.customFields,data.payerPhone,data.statusCode,data.sum,data.transactionId,err,status other=0');
  assert.deepEqual(['raw', Buffer.from('raw'), [1], undefined, 5].map(describeBody), ['kind=text', 'kind=bytes', 'kind=array', 'kind=none', 'kind=other']);
});

test('M1: content type is logged as one of four fixed words or "other"/"none", never as sent', async () => {
  const { d, calls } = deps({ env: ENV({ GROW_NOTIFY_MODE: 'capture' }) });
  await handleGrowNotify(req({ x: 1 }, { contentType: `text/${FAKE.email}` }), d);
  await handleGrowNotify(req({ x: 1 }, { contentType: ['application/json', 'x'] }), d);
  await handleGrowNotify(req({ x: 1 }, { contentType: 'Multipart/Form-Data; boundary=abc' }), d);
  assert.match(calls.logs[0], / type=other /);
  assert.match(calls.logs[1], / type=none /);
  assert.match(calls.logs[2], / type=multipart\/form-data /);
  assert.ok(!calls.logs.join('').includes(FAKE.email));
});

test('M1: every log line is a fixed event name followed only by key=value pairs from fixed vocabularies', async () => {
  const lines: string[] = [];
  const bodies = [flat(), wrapped(), flat({ statusCode: '3' }), flat({ sum: 'x' }), flat({ 'customFields[cField2]': FAKE_CHECK }), { data: { a: FAKE.email } }, parse(`${FAKE.email}&${FAKE.phone}`)];
  for (const mode of ['capture', 'on']) {
    for (const body of bodies) {
      for (const outcome of ['granted', 'duplicate', 'amount_mismatch', null] as (CompletionStatus | null)[]) {
        const { d, calls } = deps({ env: ENV({ GROW_NOTIFY_MODE: mode }) }, outcome);
        await handleGrowNotify(req(body), d);
        lines.push(...calls.logs);
      }
    }
  }
  const FIELD = /^[A-Za-z]+(\[cField[1-9]\])?$|^(data|customFields)\.[A-Za-z]+(\[cField[1-9]\])?$/;
  for (const line of lines) {
    const [event, ...pairs] = line.split(' ');
    assert.match(event, /^grow_notify_(capture|unrecognized|rejected|result)$/, line);
    for (const pair of pairs) {
      const [k, v] = pair.split('=');
      assert.match(k, /^(mode|reason|shape|shape_verified|verdict|type|kind|fields|other|outcome)$/, line);
      if (k === 'fields') for (const f of v.split(',')) assert.ok(f === '-' || FIELD.test(f), `${f} in ${line}`);
      else assert.match(v, /^[a-z0-9_/.-]+$/, line);
    }
  }
});

// ------------------------------------------------------------------------------------- M3 ----

test('M3: mode x environment: a Preview never grants and acknowledges captures; production capture stays fail-closed (503)', async () => {
  for (const vercelEnv of ['production', 'preview', 'development', undefined, 'staging']) {
    for (const mode of [undefined, 'off', 'capture', 'on', 'bogus']) {
      const { d, calls } = deps({ env: ENV({ VERCEL_ENV: vercelEnv, GROW_NOTIFY_MODE: mode }) });
      const r = await handleGrowNotify(req(flat()), d);
      const label = `${vercelEnv}/${mode}`;
      const expected = mode === 'capture' || mode === 'on' ? (mode === 'on' && vercelEnv === 'preview' ? 'capture' : mode) : 'off';
      assert.equal(effectiveMode(ENV({ VERCEL_ENV: vercelEnv, GROW_NOTIFY_MODE: mode })), expected, label);
      if (expected === 'off') {
        assert.equal(r.status, 404, label);
        assert.deepEqual(calls.logs, [], label);
      } else if (expected === 'capture') {
        assert.equal(r.status, vercelEnv === 'preview' || vercelEnv === 'development' ? 200 : 503, label);
        assert.deepEqual([calls.complete, calls.notices], [[], []], `${label}: capture never writes`);
        assert.match(calls.logs[0], /^grow_notify_capture /, label);
      } else {
        assert.equal(r.status, 200, label);
        assert.equal(calls.complete.length, 1, `${label}: only a non-Preview "on" with a verified shape reaches the completion`);
      }
    }
  }
  assert.equal(captureAcknowledges({} as NodeJS.ProcessEnv), false, 'unknown environment = fail closed');
  assert.equal(captureAcknowledges({ VERCEL_ENV: 'production' } as NodeJS.ProcessEnv), false);
});

test('M3: a capture is acknowledged only after its line was written; a refused notification is never acknowledged, even on Preview', async () => {
  const order: string[] = [];
  const { d } = deps({ env: ENV({ VERCEL_ENV: 'preview', GROW_NOTIFY_MODE: 'capture' }), log: () => void order.push('log') });
  const r = await handleGrowNotify(req(flat()), d);
  order.push(`status:${r.status}`);
  assert.deepEqual(order, ['log', 'status:200']);
  assert.equal((await handleGrowNotify(req(flat({ 'customFields[cField2]': FAKE_CHECK })), d)).status, 403);
  assert.equal((await handleGrowNotify(req(flat(), { vercelForwardedFor: ATTACKER_IP }), d)).status, 403);
  assert.equal((await handleGrowNotify(req(flat(), { contentLength: String(MAX_BODY_BYTES + 1) }), d)).status, 413);
});

test('M3: with the real (empty) VERIFIED_SHAPES nothing can grant or write, in any mode and any environment', async () => {
  assert.deepEqual(VERIFIED_SHAPES, []);
  for (const vercelEnv of ['production', 'preview', 'development', undefined]) {
    for (const mode of ['capture', 'on']) {
      for (const body of [flat(), wrapped(), flat({ statusCode: '3' })]) {
        const { d, calls } = deps({ env: ENV({ VERCEL_ENV: vercelEnv, GROW_NOTIFY_MODE: mode }), verifiedShapes: VERIFIED_SHAPES });
        await handleGrowNotify(req(body), d);
        assert.deepEqual([calls.complete, calls.notices], [[], []], `${vercelEnv}/${mode}`);
      }
    }
  }
});

// ------------------------------------------------------------------------------------- L3 ----

test('L3: GROW_NOTIFY_SECRET_PREVIOUS is accepted for checks only during a rotation; every new check uses the current secret', async () => {
  const OLD = 'o'.repeat(40);
  const oldCheck = growNotifyCheck(ORDER, OLD);
  assert.deepEqual(acceptedSecrets(ENV({ GROW_NOTIFY_SECRET_PREVIOUS: OLD })), [SECRET, OLD]);
  assert.deepEqual(acceptedSecrets(ENV({ GROW_NOTIFY_SECRET_PREVIOUS: 'short' })), [SECRET], 'a weak previous secret is ignored');
  assert.deepEqual(acceptedSecrets(ENV({ GROW_NOTIFY_SECRET_PREVIOUS: SECRET })), [SECRET]);
  assert.deepEqual(acceptedSecrets(ENV({ GROW_NOTIFY_SECRET: undefined, GROW_NOTIFY_SECRET_PREVIOUS: OLD })), [], 'never the previous one alone');
  const rotating = deps({ env: ENV({ GROW_NOTIFY_SECRET_PREVIOUS: OLD }) });
  assert.equal((await handleGrowNotify(req(flat({ 'customFields[cField2]': oldCheck })), rotating.d)).status, 200);
  assert.equal((await handleGrowNotify(req(flat()), rotating.d)).status, 200);
  const after = deps();
  assert.equal((await handleGrowNotify(req(flat({ 'customFields[cField2]': oldCheck })), after.d)).status, 403, 'after the rotation ends');
  const payload = buildMakeCheckoutPayload(ORDER, paidPackage('go_deeper_3')!, 'https://daretogoin.com', { fullName: 'A B', phone: '0500000000' }, { env: ENV({ GROW_NOTIFY_SECRET_PREVIOUS: OLD }) });
  assert.equal(payload.notifyCheck, CHECK, 'new links always use the current secret');
  const logs = [...rotating.calls.logs, ...after.calls.logs].join('\n');
  for (const v of [OLD, SECRET, oldCheck, CHECK]) assert.ok(!logs.includes(v));
});

// ------------------------------------------------------------------------------------- L4 ----

test('L4: contradictory layouts are refused, never resolved silently', async () => {
  const conflicts: unknown[] = [
    { ...flat(), customFields: { cField1: OTHER_ORDER, cField2: growNotifyCheck(OTHER_ORDER, SECRET) } }, // nested AND brackets
    { ...flat(), data: { transactionId: '999', customFields: { cField1: ORDER, cField2: CHECK } } }, // flat AND wrapped
    { data: { transactionId: TX, statusCode: '2', sum: '59', allPaymentsNum: '1', customFields: { cField1: ORDER, cField2: CHECK }, 'customFields[cField1]': OTHER_ORDER } },
    { 'customFields[cField1]': ORDER, 'customFields[cField2]': CHECK, data: { transactionId: TX } },
  ];
  for (const body of conflicts) {
    assert.deepEqual(readNotification(body), { ok: false, reason: 'conflicting_layout' }, JSON.stringify(body).slice(0, 120));
    const { d, calls } = deps();
    assert.equal((await handleGrowNotify(req(body), d)).status, 400);
    assert.deepEqual(calls.complete, []);
    assert.match(calls.logs[0], /^grow_notify_unrecognized mode=on reason=conflicting_layout /);
  }
  assert.equal(readNotification(Object.create({ transactionId: TX, sum: '59' })).ok, false, 'inherited properties are never fields');
});

// ------------------------------------------------------------------ M4: the real Vercel entry point ----

type MockRes = { statusCode: number; body: unknown; headers: Record<string, string>; status(c: number): MockRes; json(b: unknown): MockRes; setHeader(k: string, v: string): void };
function mockRes(): MockRes {
  const res: MockRes = {
    statusCode: 0,
    body: undefined,
    headers: {},
    status(c) {
      res.statusCode = c;
      return res;
    },
    json(b) {
      res.body = b;
      return res;
    },
    setHeader(k, v) {
      res.headers[k.toLowerCase()] = v;
    },
  };
  return res;
}
interface MockReqInput { method?: string; query?: Record<string, unknown>; headers?: Record<string, unknown>; body?: unknown; bodyThrows?: boolean }
function mockReq(o: MockReqInput, counter: { reads: number }) {
  return {
    method: o.method ?? 'POST',
    query: o.query ?? {},
    headers: o.headers ?? {},
    get body() {
      counter.reads += 1;
      if (o.bodyThrows) throw new Error(`Invalid JSON near ${FAKE.phone}`);
      return o.body;
    },
  };
}
const ENV_KEYS = ['VERCEL_ENV', 'GROW_NOTIFY_MODE', 'GROW_NOTIFY_IPS', 'GROW_NOTIFY_SECRET', 'GROW_NOTIFY_SECRET_PREVIOUS', 'MAKE_COMPLETION_SECRET', 'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
/** Runs with exactly these variables (the database is never configured here) and collects console.error lines. */
async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<{ value: T; errors: string[] }> {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v;
  const errors: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => void errors.push(a.map(String).join(' '));
  try {
    return { value: await fn(), errors };
  } finally {
    console.error = orig;
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}
type Handler = (req: unknown, res: unknown) => Promise<void>;
const handler = paymentCompleteApi as unknown as Handler;
const GROW_ENV = { VERCEL_ENV: 'production', GROW_NOTIFY_MODE: 'on', GROW_NOTIFY_IPS: GROW_IP, GROW_NOTIFY_SECRET: SECRET };
const MAKE_SECRET = 'm'.repeat(48);
async function call(env: Record<string, string | undefined>, input: MockReqInput) {
  const counter = { reads: 0 };
  const res = mockRes();
  const { errors } = await withEnv(env, () => handler(mockReq(input, counter), res));
  return { res, reads: counter.reads, errors };
}
const VIA = { via: 'grow-notify' };

test('M4 entry: off by default — the rewrite target answers 404 without reading the body', async () => {
  const r = await call({}, { query: VIA, headers: { 'x-vercel-forwarded-for': GROW_IP }, body: flat() });
  assert.deepEqual([r.res.statusCode, r.reads, r.res.headers['cache-control']], [404, 0, 'no-store']);
});

test('M4 entry: a stranger with forged forwarding headers is refused before the body is read', async () => {
  const r = await call(GROW_ENV, { query: VIA, headers: { 'x-vercel-forwarded-for': ATTACKER_IP, 'x-forwarded-for': GROW_IP, 'x-real-ip': GROW_IP, forwarded: `for=${GROW_IP}` }, body: flat() });
  assert.deepEqual([r.res.statusCode, r.reads, r.errors], [403, 0, ['grow_notify_rejected reason=source']]);
  const none = await call(GROW_ENV, { query: VIA, headers: { 'x-forwarded-for': GROW_IP }, body: flat() });
  assert.deepEqual([none.res.statusCode, none.reads], [403, 0], 'no Vercel header at all');
});

test('M4 entry: headers that arrive as arrays are refused (address) or treated as absent (type)', async () => {
  const ip = await call(GROW_ENV, { query: VIA, headers: { 'x-vercel-forwarded-for': [GROW_IP, GROW_IP] }, body: flat() });
  assert.deepEqual([ip.res.statusCode, ip.reads], [403, 0]);
  const len = await call(GROW_ENV, { query: VIA, headers: { 'x-vercel-forwarded-for': GROW_IP, 'content-length': ['10', '10'] }, body: flat() });
  assert.deepEqual([len.res.statusCode, len.reads], [413, 0]);
});

test('M4 entry: a body above 16 KiB is refused — by declared length before reading, by actual size after', async () => {
  const declared = await call(GROW_ENV, { query: VIA, headers: { 'x-vercel-forwarded-for': GROW_IP, 'content-length': String(MAX_BODY_BYTES + 1) }, body: flat() });
  assert.deepEqual([declared.res.statusCode, declared.reads], [413, 0]);
  const actual = await call(GROW_ENV, { query: VIA, headers: { 'x-vercel-forwarded-for': GROW_IP }, body: flat({ description: 'x'.repeat(MAX_BODY_BYTES) }) });
  assert.equal(actual.res.statusCode, 413);
});

test('M4 entry: a malformed body (throwing getter) is unrecognized and the parser message never reaches the log', async () => {
  const r = await call(GROW_ENV, { query: VIA, headers: { 'x-vercel-forwarded-for': GROW_IP, 'content-type': 'application/json' }, bodyThrows: true });
  assert.equal(r.res.statusCode, 400);
  assert.deepEqual(r.errors, ['grow_notify_unrecognized mode=on reason=unrecognized type=application/json kind=none']);
  const multipart = await call({ ...GROW_ENV, GROW_NOTIFY_MODE: 'capture' }, { query: VIA, headers: { 'x-vercel-forwarded-for': GROW_IP, 'content-type': 'multipart/form-data; boundary=x' }, body: undefined });
  assert.deepEqual([multipart.res.statusCode, multipart.errors], [503, ['grow_notify_unrecognized mode=capture reason=unrecognized type=multipart/form-data kind=none']]);
});

test('M4 entry: a perfect notification from Grow, with the real dependencies, cannot grant (production 503, Preview 200)', async () => {
  const prod = await call(GROW_ENV, { query: VIA, headers: { 'x-vercel-forwarded-for': GROW_IP, 'content-type': 'application/x-www-form-urlencoded' }, body: flat() });
  assert.equal(prod.res.statusCode, 503);
  assert.equal(prod.errors.length, 1);
  assert.match(prod.errors[0], /^grow_notify_capture mode=on shape=flat\/brackets shape_verified=false verdict=would_complete /);
  const preview = await call({ ...GROW_ENV, VERCEL_ENV: 'preview' }, { query: VIA, headers: { 'x-vercel-forwarded-for': GROW_IP }, body: wrapped() });
  assert.deepEqual([preview.res.statusCode, preview.res.body], [200, { received: true }]);
  assert.match(preview.errors[0], /^grow_notify_capture mode=capture shape=wrapped\/nested shape_verified=false /);
  for (const r of [prod, preview]) for (const v of [FAKE.phone, FAKE.email, CHECK, ORDER, TX, SECRET]) assert.ok(!(r.errors.join() + JSON.stringify(r.res.body)).includes(v));
});

test('M4 entry: an unexpected error inside the Grow path answers a fixed 503 and logs a fixed code', async () => {
  const counter = { reads: 0 };
  const res = mockRes();
  const exploding = { method: 'POST', query: VIA, get headers(): Record<string, unknown> { throw new Error(`boom ${FAKE.email}`); } };
  const { errors } = await withEnv(GROW_ENV, () => handler(exploding, res));
  assert.deepEqual([res.statusCode, res.body, errors, counter.reads], [503, { reason: 'not_configured', message: 'Not available right now.' }, ['grow_notify_failed'], 0]);
});

test('M4 entry: a wrong, repeated or differently-cased via never reaches the Grow path; it is the Make path with its secret', async () => {
  for (const via of [['grow-notify', 'grow-notify'], ['grow-notify', 'x'], 'GROW-NOTIFY', 'grow-notify ', 'grow', '', undefined]) {
    const r = await call({ ...GROW_ENV, MAKE_COMPLETION_SECRET: MAKE_SECRET }, { query: via === undefined ? {} : { via }, headers: { 'x-vercel-forwarded-for': GROW_IP }, body: flat() });
    assert.equal(r.res.statusCode, 401, `${JSON.stringify(via)}: the Make path, no bearer => refused`);
    assert.ok(!r.errors.some((l) => l.startsWith('grow_notify')), 'the Grow handler was not involved');
  }
});

test('M4 entry: the Make path is unchanged — the API answers exactly what handlePaymentComplete answers, Grow settings or not', async () => {
  const good = { schema: 'dare.payment.v1', orderId: ORDER, transactionId: 'TX-12345', status: 'paid', amount: 59, currency: 'ILS', providerStatus: 'Paid' };
  const cases: { label: string; env: Record<string, string>; method: string; auth?: string; body: unknown; expect: number }[] = [
    { label: 'GET', env: { MAKE_COMPLETION_SECRET: MAKE_SECRET }, method: 'GET', body: undefined, expect: 405 },
    { label: 'no secret configured', env: {}, method: 'POST', auth: `Bearer ${MAKE_SECRET}`, body: good, expect: 503 },
    { label: 'wrong bearer', env: { MAKE_COMPLETION_SECRET: MAKE_SECRET }, method: 'POST', auth: 'Bearer nope', body: good, expect: 401 },
    { label: 'bad body', env: { MAKE_COMPLETION_SECRET: MAKE_SECRET }, method: 'POST', auth: `Bearer ${MAKE_SECRET}`, body: { ...good, extra: 1 }, expect: 400 },
    { label: 'not paid', env: { MAKE_COMPLETION_SECRET: MAKE_SECRET }, method: 'POST', auth: `Bearer ${MAKE_SECRET}`, body: { ...good, status: 'failed' }, expect: 422 },
    { label: 'valid, no database here', env: { MAKE_COMPLETION_SECRET: MAKE_SECRET }, method: 'POST', auth: `Bearer ${MAKE_SECRET}`, body: good, expect: 503 },
  ];
  for (const c of cases) {
    for (const grow of [{}, GROW_ENV]) {
      const r = await call({ ...c.env, ...grow }, { method: c.method, headers: c.auth ? { authorization: c.auth } : {}, body: c.body });
      assert.equal(r.res.statusCode, c.expect, c.label);
      assert.equal(r.res.headers['cache-control'], 'no-store');
      if (c.method === 'POST') {
        const { value: direct } = await withEnv(c.env, () => handlePaymentComplete(c.body, { authorization: c.auth }));
        assert.deepEqual([r.res.statusCode, r.res.body], [direct.status, direct.body], `${c.label}: identical to the unchanged handler`);
      }
    }
  }
});

// ------------------------------------------------------------------------------------- L5 ----

test('L5: no other way in — the Grow handler is called only by the rewrite branch and the local mirror; no entry point passes its own shapes', () => {
  const walk = (dir: string): string[] => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
  const files = [...walk('server'), ...walk('api')].filter((f) => f.endsWith('.ts'));
  assert.deepEqual(files.filter((f) => f !== 'server/payments/growNotify.ts' && /handleGrowNotify\(/.test(strip(read(f)))).sort(), ['api/payment-complete.ts', 'server/index.ts']);
  assert.deepEqual(files.filter((f) => /completePaymentOrder/.test(strip(read(f)))).sort(), ['server/payments/completionStore.ts', 'server/payments/growNotify.ts', 'server/payments/paymentComplete.ts']);
  assert.match(strip(read('server/payments/growNotify.ts')), /verifiedShapes: VERIFIED_SHAPES/);
  for (const f of ['api/payment-complete.ts', 'server/index.ts']) assert.ok(!/verifiedShapes|GrowNotifyDeps/.test(strip(read(f))), f);
  assert.match(strip(read('api/payment-complete.ts')), /readBody: \(\) => req\.body/, 'the body is handed over lazily');
});
