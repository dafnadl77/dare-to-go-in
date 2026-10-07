import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { checkCompletionAuth } from '../server/payments/completionAuth.ts';
import { parseCompletionRequest, type CompletionRequest } from '../server/payments/completionRequest.ts';
import { handlePaymentComplete, type CompletionDeps } from '../server/payments/paymentComplete.ts';
import type { CompletionStatus } from '../server/payments/completionStore.ts';
import { buildMakeCheckoutPayload } from '../server/payments/makeCheckoutClient.ts';
import { paidPackage } from '../server/payments/checkoutPackages.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SECRET = 'k'.repeat(40) + 'SECRET-VALUE-0123456789';
const ENV = { MAKE_COMPLETION_SECRET: SECRET } as NodeJS.ProcessEnv;
const ORDER = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const GOOD = { schema: 'dare.payment.v1', orderId: ORDER, transactionId: 'TX-12345', status: 'paid', amount: 59, currency: 'ILS', providerStatus: 'Paid' };

// ------------------------------------------------------------------------ authentication ----

test('auth: only the exact bearer secret passes; anything else is unauthorized', () => {
  assert.equal(checkCompletionAuth(`Bearer ${SECRET}`, ENV), 'ok');
  assert.equal(checkCompletionAuth(`bearer ${SECRET}`, ENV), 'ok', 'scheme is case-insensitive, the secret is not');
  for (const header of [undefined, null, '', 'Bearer', 'Bearer ', SECRET, `Basic ${SECRET}`, `Bearer ${SECRET}x`, `Bearer x${SECRET}`, `Bearer ${SECRET.toLowerCase()}`, `Bearer ${SECRET} extra`, 'Bearer wrong-secret', `Token ${SECRET}`]) {
    assert.equal(checkCompletionAuth(header as string | undefined, ENV), 'unauthorized', String(header));
  }
});

test('auth: with no secret configured (or a short one) the route fails closed, even for a caller who guesses the empty/short value', () => {
  for (const env of [{}, { MAKE_COMPLETION_SECRET: '' }, { MAKE_COMPLETION_SECRET: 'short' }, { MAKE_COMPLETION_SECRET: 'x'.repeat(31) }] as NodeJS.ProcessEnv[]) {
    assert.equal(checkCompletionAuth('Bearer ', env), 'not_configured');
    assert.equal(checkCompletionAuth(`Bearer ${env.MAKE_COMPLETION_SECRET ?? ''}`, env), 'not_configured');
  }
  assert.equal(checkCompletionAuth(`Bearer ${'x'.repeat(32)}`, { MAKE_COMPLETION_SECRET: 'x'.repeat(32) } as NodeJS.ProcessEnv), 'ok');
});

test('auth: the comparison is constant-time and the secret is never logged, returned or readable by the browser', () => {
  const auth = strip(read('server/payments/completionAuth.ts'));
  assert.match(auth, /timingSafeEqual/);
  assert.match(auth, /createHash\('sha256'\)/);
  assert.ok(!/console\./.test(auth));
  assert.ok(!/===\s*secret|secret\s*===|==\s*secret/.test(auth), 'no plain string comparison with the secret');
  const walk = (dir: string): string[] => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
  for (const f of walk('src').filter((x) => /\.(ts|tsx)$/.test(x))) assert.ok(!/MAKE_COMPLETION|payment-complete/.test(read(f)), f);
  assert.match(read('.env.example'), /^MAKE_COMPLETION_SECRET=$/m, 'documented with an EMPTY value');
  assert.ok(!/VITE_MAKE/.test(read('.env.example')));
});

// ------------------------------------------------------------------------------ request ----

test('request: the exact contract is accepted and normalized', () => {
  const ok = parseCompletionRequest(GOOD);
  assert.deepEqual(ok, { ok: true, value: { orderId: ORDER, transactionId: 'TX-12345', amount: 59, currency: 'ILS', providerStatus: 'Paid' } });
  // numeric transaction id and numeric-string amounts are normal in form-built JSON
  assert.deepEqual(parseCompletionRequest({ ...GOOD, transactionId: 4097233, amount: '149.00', providerStatus: '  שולם ' }), {
    ok: true,
    value: { orderId: ORDER, transactionId: '4097233', amount: 149, currency: 'ILS', providerStatus: 'שולם' },
  });
});

test('request: malformed bodies are rejected (strict keys: no owner, credits, package or price can ride along)', () => {
  const rejected: unknown[] = [
    null, undefined, 'x', 7, [], {}, [GOOD],
    { ...GOOD, extra: 1 }, { ...GOOD, owner_id: 'u' }, { ...GOOD, credits: 1000 }, { ...GOOD, packageId: 'dive_in_25' }, { ...GOOD, userId: 'u' },
    { ...GOOD, schema: 'dare.payment.v2' }, { ...GOOD, schema: undefined },
    { ...GOOD, orderId: 'short' }, { ...GOOD, orderId: ORDER.toUpperCase() }, { ...GOOD, orderId: `${ORDER}0` }, { ...GOOD, orderId: 5 },
    { ...GOOD, transactionId: '' }, { ...GOOD, transactionId: 'ab' }, { ...GOOD, transactionId: 'has space' }, { ...GOOD, transactionId: 'x'.repeat(65) },
    { ...GOOD, transactionId: -5 }, { ...GOOD, transactionId: 1.5 }, { ...GOOD, transactionId: { a: 1 } }, { ...GOOD, transactionId: 'a;drop' },
    { ...GOOD, status: 'PAID' }, { ...GOOD, status: 'success' }, { ...GOOD, status: undefined },
    { ...GOOD, amount: 0 }, { ...GOOD, amount: -59 }, { ...GOOD, amount: '59.999' }, { ...GOOD, amount: 'abc' }, { ...GOOD, amount: '1e3' }, { ...GOOD, amount: null }, { ...GOOD, amount: Infinity }, { ...GOOD, amount: 1e9 },
    { ...GOOD, currency: 'ils' }, { ...GOOD, currency: 'ILSX' }, { ...GOOD, currency: 5 },
    { ...GOOD, providerStatus: '' }, { ...GOOD, providerStatus: '   ' }, { ...GOOD, providerStatus: 'x'.repeat(65) }, { ...GOOD, providerStatus: 'a\nb' }, { ...GOOD, providerStatus: 7 },
  ];
  for (const body of rejected) assert.deepEqual(parseCompletionRequest(body), { ok: false, reason: 'invalid_request' }, JSON.stringify(body));
});

test('request: failed, cancelled and pending payments are well-formed but can never grant', () => {
  for (const status of ['failed', 'cancelled', 'pending']) assert.deepEqual(parseCompletionRequest({ ...GOOD, status }), { ok: false, reason: 'payment_not_successful', orderId: ORDER, providerStatus: 'Paid' }, status);
});

// ------------------------------------------------------------------------------ handler ----

function deps(over: Partial<CompletionDeps> = {}) {
  const calls: CompletionRequest[] = [];
  const notices: [string, string][] = [];
  const d: CompletionDeps = {
    auth: (h) => checkCompletionAuth(h, ENV),
    complete: async (r) => (calls.push(r), 'granted' as CompletionStatus),
    recordNotice: async (orderId, providerStatus) => void notices.push([orderId, providerStatus]),
    ...over,
  };
  return { d, calls, notices };
}
const AUTH = { authorization: `Bearer ${SECRET}` };

test('route: unauthenticated callers (no header, wrong secret, a user token, a cookie) never reach the order logic', async () => {
  const { d, calls } = deps();
  for (const headers of [{}, { authorization: 'Bearer nope' }, { authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.x' }, { authorization: undefined }]) {
    const res = await handlePaymentComplete(GOOD, headers, d);
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { reason: 'not_authenticated', message: 'Unauthorized.' }, 'one uniform answer');
  }
  assert.deepEqual(calls, []);
  assert.ok(!/cookie|req\.headers\.cookie/i.test(strip(read('api/payment-complete.ts') + read('server/payments/paymentComplete.ts'))), 'no cookie or browser session is read');
});

test('route: auth is checked BEFORE the body (a malformed body from an unauthenticated caller is still just 401)', async () => {
  const { d, calls } = deps();
  assert.equal((await handlePaymentComplete({ garbage: true }, {}, d)).status, 401);
  assert.equal((await handlePaymentComplete(null, { authorization: 'Bearer wrong' }, d)).status, 401);
  assert.deepEqual(calls, []);
});

test('route: not configured is a controlled 503 and nothing is processed', async () => {
  const { d, calls } = deps({ auth: () => 'not_configured' });
  assert.equal((await handlePaymentComplete(GOOD, AUTH, d)).status, 503);
  assert.deepEqual(calls, []);
});

test('route: a valid, authenticated paid completion reaches the database call with only the contract fields', async () => {
  const { d, calls } = deps();
  const res = await handlePaymentComplete(GOOD, AUTH, d);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, result: 'granted', orderId: ORDER });
  assert.deepEqual(calls, [{ orderId: ORDER, transactionId: 'TX-12345', amount: 59, currency: 'ILS', providerStatus: 'Paid' }]);
  assert.deepEqual(Object.keys(calls[0]).sort(), ['amount', 'currency', 'orderId', 'providerStatus', 'transactionId']);
});

test('route: malformed bodies are 400; failed/cancelled/pending are 422 and can never grant', async () => {
  const { d, calls } = deps();
  assert.equal((await handlePaymentComplete({ ...GOOD, amount: 'abc' }, AUTH, d)).status, 400);
  assert.equal((await handlePaymentComplete({ ...GOOD, owner_id: 'u' }, AUTH, d)).status, 400);
  for (const status of ['failed', 'cancelled', 'pending']) {
    const res = await handlePaymentComplete({ ...GOOD, status }, AUTH, d);
    assert.equal(res.status, 422);
    assert.equal((res.body as { reason: string }).reason, 'payment_not_successful');
  }
  assert.deepEqual(calls, [], 'the grant path is never reached');
});

test('route: a non-paid notice only REMEMBERS the last status; it closes nothing, and an unauthenticated or malformed one is not even remembered', async () => {
  const { d, calls, notices } = deps();
  for (const status of ['failed', 'cancelled', 'pending']) await handlePaymentComplete({ ...GOOD, status, providerStatus: `Seen-${status}` }, AUTH, d);
  assert.deepEqual(notices, [[ORDER, 'Seen-failed'], [ORDER, 'Seen-cancelled'], [ORDER, 'Seen-pending']]);
  assert.deepEqual(calls, []);
  await handlePaymentComplete({ ...GOOD, status: 'failed' }, { authorization: 'Bearer wrong' }, d);
  await handlePaymentComplete({ ...GOOD, status: 'failed', owner_id: 'u' }, AUTH, d);
  assert.equal(notices.length, 3);
  // even if remembering fails, the answer is the same refusal (nothing to retry, nothing granted)
  const failing = deps({ recordNotice: async () => { throw new Error('db down'); } });
  assert.equal((await handlePaymentComplete({ ...GOOD, status: 'pending' }, AUTH, failing.d)).status, 422);
  // and a LATER paid notification for the same order still reaches the completion step
  assert.equal((await handlePaymentComplete(GOOD, AUTH, d)).status, 200);
  assert.equal(calls.length, 1);
});

test('route: every database outcome maps to a safe HTTP answer; duplicates are success, conflicts are 409, mismatches are 422', async () => {
  const expected: Record<CompletionStatus, [number, string?]> = {
    granted: [200], duplicate: [200], order_not_found: [404, 'order_not_found'],
    transaction_used_by_other_order: [409, 'transaction_used_by_other_order'], order_already_completed: [409, 'order_already_completed'],
    owner_gone: [409, 'owner_gone'],
    amount_mismatch: [422, 'amount_mismatch'], currency_mismatch: [422, 'currency_mismatch'], invalid: [400, 'invalid_request'],
  };
  for (const [outcome, [status, reason]] of Object.entries(expected) as [CompletionStatus, [number, string?]][]) {
    const { d } = deps({ complete: async () => outcome });
    const res = await handlePaymentComplete(GOOD, AUTH, d);
    assert.equal(res.status, status, outcome);
    if (reason) assert.equal((res.body as { reason: string }).reason, reason, outcome);
    if (status === 200) assert.equal((res.body as { result: string }).result, outcome);
  }
});

test('route: a database outage is 503 (Make can retry); the duplicate success is what makes that retry safe', async () => {
  const { d } = deps({ complete: async () => null });
  assert.equal((await handlePaymentComplete(GOOD, AUTH, d)).status, 503);
});

test('route: logs carry reason codes only: no secret, order id, transaction id, amount or payer data', async () => {
  const lines: string[] = [];
  const original = { error: console.error, log: console.log, warn: console.warn };
  console.error = console.log = console.warn = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
  try {
    for (const outcome of ['amount_mismatch', 'transaction_used_by_other_order', 'owner_gone'] as CompletionStatus[]) {
      await handlePaymentComplete(GOOD, AUTH, deps({ complete: async () => outcome }).d);
    }
    await handlePaymentComplete(GOOD, AUTH, deps({ complete: async () => null }).d);
    await handlePaymentComplete(GOOD, { authorization: 'Bearer wrong' }, deps().d);
  } finally {
    Object.assign(console, original);
  }
  assert.ok(lines.length >= 3);
  for (const line of lines) {
    for (const secretish of [SECRET, 'wrong', ORDER, 'TX-12345', '59']) assert.ok(!line.includes(secretish), `${secretish} in: ${line}`);
  }
});

// ------------------------------------------------------------------------- consistency ----

test('consistency: the completion contract matches what checkout sends Make (currency, order id shape) and the DB price list', () => {
  const payload = buildMakeCheckoutPayload(ORDER, paidPackage('go_deeper_3')!, 'https://daretogoin.com', { fullName: 'Sample Customer', phone: '0500000000' });
  assert.equal(payload.currency, GOOD.currency);
  assert.equal(payload.amount, GOOD.amount);
  assert.match(payload.orderId, /^[0-9a-f]{32}$/);
  assert.equal(parseCompletionRequest({ ...GOOD, orderId: payload.orderId }).ok, true);
  const sql = read('supabase/migrations/20261007_payment_orders.sql');
  assert.match(sql, /grant_credits\(o\.owner_id, o\.credits, 'purchase', 'grow:' \|\| p_tx\)/, 'credits come from the ORDER row, through the existing grant_credits, ref grow:<tx>');
  assert.match(sql, /grant execute on function public\.complete_payment_order\(text, text, numeric, text, text\) to service_role/);
  assert.ok(!/to (anon|authenticated|public)\s*;/i.test(sql.replace(/revoke[^;]*;/gi, '')));
});

test('consistency: only completionStore calls the grant path, and the checkout side still never grants', () => {
  const walk = (dir: string): string[] => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
  const callers = [...walk('server'), ...walk('api')]
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => /grant_credits|complete_payment_order/.test(strip(read(f))));
  assert.deepEqual(callers, ['server/payments/completionStore.ts']);
  for (const f of ['server/payments/checkoutStart.ts', 'server/payments/orderStore.ts', 'api/credits.ts']) assert.ok(!/complete_payment_order|grant_credits/.test(strip(read(f))), f);
});

test('functions: the completion route is the 12th and last Hobby function; the client can reach nothing new', () => {
  const files = readdirSync(new URL('../api', import.meta.url)).filter((f) => f.endsWith('.ts')).sort();
  assert.equal(files.length, 12, files.join(', '));
  assert.ok(files.includes('payment-complete.ts'));
  assert.equal(files.filter((f) => /payment|checkout|grow|make|webhook/i.test(f)).length, 1, 'exactly one payment route');
  const api = read('api/payment-complete.ts');
  assert.match(api, /req\.method !== 'POST'/);
  assert.match(api, /no-store/);
  assert.match(read('server/index.ts'), /app\.post\('\/api\/payment-complete'/);
});

test('retention: the order stays after account deletion (owner set null, no personal data), deletion code is untouched', () => {
  const sql = read('supabase/migrations/20261007_payment_orders.sql');
  assert.match(sql, /owner_id\s+uuid references auth\.users \(id\) on delete set null/i);
  assert.ok(!/delete_account_data/.test(sql.replace(/--.*$/gm, '')));
  assert.ok(!/fullName|full_name|phone|email|payer_/i.test(sql.replace(/--.*$/gm, '')), 'no payer data columns or parameters');
});
