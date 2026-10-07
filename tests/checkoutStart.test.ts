import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { handleStartCheckout, parseCheckoutRequest, type CheckoutDeps } from '../server/payments/checkoutStart.ts';
import { PAID_PACKAGE_IDS, paidPackage, type PaidPackage } from '../server/payments/checkoutPackages.ts';
import { normalizeFullName, normalizeIsraeliMobile } from '../src/payments/payerDetails.ts';
import {
  buildMakeCheckoutPayload,
  parseMakeWebhookUrl,
  postToMake,
  requestPaymentLink,
  siteUrlFromEnv,
  validatePaymentUrl,
  type MakeCheckoutPayload,
} from '../server/payments/makeCheckoutClient.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const OWNER = '11111111-1111-4111-8111-111111111111';
const ORDER = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const WEBHOOK = 'https://hook.eu2.make.com/abcdefghijklmnop1234567890';
const PAY_URL = 'https://pay.grow.link/ab12cd34ef';
const PAYER = { fullName: 'Dafna Dalmeida', phone: '054-123-4567' };
const PAYER_NORMALIZED = { fullName: 'Dafna Dalmeida', phone: '0541234567' };
const body = (packageId: unknown, extra: Record<string, unknown> = {}) => ({ packageId, ...PAYER, ...extra });

// ------------------------------------------------------------------ server price list ----

test('packages: the server decides amount and credits: 59/3, 149/10, 279/25, and nothing else is purchasable', () => {
  const table = PAID_PACKAGE_IDS.map((id) => {
    const p = paidPackage(id)!;
    return [p.id, p.amountIls, p.credits];
  });
  assert.deepEqual(table, [
    ['go_deeper_3', 59, 3],
    ['explore_10', 149, 10],
    ['dive_in_25', 279, 25],
  ]);
  for (const bad of ['first_dream', 'GO_DEEPER_3', 'go_deeper_3 ', '__proto__', 'constructor', 'toString', '', null, undefined, 3, {}, ['go_deeper_3']]) {
    assert.equal(paidPackage(bad), null, JSON.stringify(bad));
  }
});

test('packages: titles are plain ASCII (Grow rejects special characters in parameters)', () => {
  for (const id of PAID_PACKAGE_IDS) assert.match(paidPackage(id)!.title, /^[A-Za-z0-9 ]+$/, id);
});

// ------------------------------------------------------------------------ the request ----

test('request: ONLY {packageId, fullName, phone} is accepted; amount, credits, user id, status or anything else is rejected', () => {
  assert.ok(parseCheckoutRequest(body('explore_10')).ok);
  const rejected: unknown[] = [
    null, undefined, 'explore_10', 7, [], {}, [body('explore_10')],
    { packageId: 'explore_10' }, // the payer details are required now
    { packageId: 'explore_10', fullName: 'Dafna Dalmeida' }, { packageId: 'explore_10', phone: '0541234567' },
    body('first_dream'), body('nope'), body(10), body(undefined),
    body('explore_10', { amount: 1 }), body('explore_10', { credits: 1000 }), body('explore_10', { owner_id: OWNER }),
    body('explore_10', { userId: OWNER }), body('explore_10', { status: 'paid' }), body('explore_10', { email: 'a@b.co' }),
    { fullName: 'Dafna Dalmeida', phone: '0541234567', amount: 149 }, { credits: 10, ...body('go_deeper_3') },
  ];
  for (const req of rejected) assert.equal(parseCheckoutRequest(req).ok, false, JSON.stringify(req));
});

test('payer: the full name needs at least two names made of letters; punctuation is neutralized; junk is refused', () => {
  const ok: [string, string][] = [
    ['Dafna Dalmeida', 'Dafna Dalmeida'],
    ['  דפנה   דלמדה ', 'דפנה דלמדה'],
    ['בן-דוד כהן', 'בן דוד כהן'],
    ["Anne O'Brien", 'Anne OBrien'],
    ['Jean-Luc Picard', 'Jean Luc Picard'],
    ['‏דפנה דלמדה‏', 'דפנה דלמדה'],
    ['שָׁלוֹם עֲלֵיכֶם', 'שלום עליכם'],
  ];
  for (const [input, expected] of ok) assert.equal(normalizeFullName(input), expected, input);
  const bad: unknown[] = [
    '', ' ', 'Dafna', 'דפנה', 'D D', 'Dafna 3', 'Dafna Dalmeida1', '<b>Dafna</b> Dalmeida', 'Dafna; Dalmeida', 'Dafna\nDalmeida\nX1',
    'a'.repeat(101), 'Dafna ' + 'x'.repeat(40), 'one two three four five six', null, undefined, 5, {}, ['Dafna Dalmeida'],
    'http://evil.example Dalmeida', 'Dafna@Dalmeida', 'Dafna $$$ Dalmeida', '--- ---',
  ];
  for (const input of bad) assert.equal(normalizeFullName(input), null, JSON.stringify(input));
});

test('payer: only an Israeli MOBILE number is accepted, normalized to the local ten-digit form', () => {
  const ok: [string, string][] = [
    ['0541234567', '0541234567'], ['054-123-4567', '0541234567'], ['054 123 4567', '0541234567'], ['(054) 123-4567', '0541234567'],
    ['+972541234567', '0541234567'], ['+972 54 123 4567', '0541234567'], ['972541234567', '0541234567'], ['00972541234567', '0541234567'],
    ['+972 (0)54-123-4567', '0541234567'], ['‎050-0000000', '0500000000'], ['0521234567', '0521234567'], ['0581234567', '0581234567'],
  ];
  for (const [input, expected] of ok) assert.equal(normalizeIsraeliMobile(input), expected, input);
  const bad: unknown[] = [
    '', ' ', '054123456', '05412345678', '0341234567', '021234567', '0721234567', '+442071234567', '+1 415 555 0100', '1800123456',
    '054-123-456a', 'abc', '054123456; drop table', '+972341234567', '9720341234567', '00', '+', null, undefined, 541234567, {}, ['0541234567'],
  ];
  for (const input of bad) assert.equal(normalizeIsraeliMobile(input), null, JSON.stringify(input));
});

test('payer: an invalid name or phone is a 400 that names the FIELD, never echoes the value, and creates nothing', async () => {
  const cases: [Record<string, unknown>, string][] = [
    [body('explore_10', { fullName: 'Dafna' }), 'fullName'],
    [body('explore_10', { fullName: 'Dafna 1 Dalmeida' }), 'fullName'],
    [body('explore_10', { phone: '031234567' }), 'phone'],
    [body('explore_10', { phone: 'not a number' }), 'phone'],
  ];
  for (const [req, field] of cases) {
    const { d, calls } = deps();
    const res = await handleStartCheckout(req, H, d);
    assert.equal(res.status, 400);
    assert.equal((res.body as { reason: string }).reason, 'invalid_payer_details');
    assert.equal((res.body as { field: string }).field, field);
    const text = JSON.stringify(res.body);
    assert.ok(!text.includes(String(req.fullName)) && !text.includes(String(req.phone)), 'no value is echoed back');
    assert.deepEqual(calls.order, [], 'no order, no Make call');
  }
});

// ---------------------------------------------------------------------------- the flow ----

interface Calls {
  order: string[];
  created: { owner: string; pkg: PaidPackage }[];
  marked: { orderId: string; owner: string; status: string }[];
  sent: MakeCheckoutPayload[];
}

function deps(over: Partial<CheckoutDeps> = {}) {
  const calls: Calls = { order: [], created: [], marked: [], sent: [] };
  const d: CheckoutDeps = {
    verifyBearer: async (h) => (h === 'Bearer good' ? { ok: true, userId: OWNER } : { ok: false, status: 401, reason: 'not_authenticated', message: 'bad' }),
    siteUrl: () => 'https://daretogoin.com',
    makeConfigured: () => true,
    createOrder: async (owner, pkg) => (calls.order.push('createOrder'), calls.created.push({ owner, pkg }), { status: 'created', orderId: ORDER }),
    markLink: async (orderId, owner, status) => (calls.order.push(`mark:${status}`), calls.marked.push({ orderId, owner, status }), true),
    requestLink: async (payload) => (calls.order.push('make'), calls.sent.push(payload), { ok: true, paymentUrl: PAY_URL }),
    ...over,
  };
  return { d, calls };
}
const H = { authorization: 'Bearer good' };

test('flow: unauthenticated or invalid-token requests stop first: no order, no Make call', async () => {
  const { d, calls } = deps();
  assert.equal((await handleStartCheckout(body('explore_10'), {}, d)).status, 401);
  assert.equal((await handleStartCheckout(body('explore_10'), { authorization: 'Bearer forged' }, d)).status, 401);
  assert.deepEqual(calls.order, []);
});

test('flow: the order is created for the VERIFIED user BEFORE Make is called, then marked, then the link is returned', async () => {
  const { d, calls } = deps();
  const res = await handleStartCheckout(body('explore_10'), H, d);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { orderId: ORDER, paymentUrl: PAY_URL });
  assert.deepEqual(calls.order, ['createOrder', 'make', 'mark:link_created']);
  assert.equal(calls.created[0].owner, OWNER);
  assert.deepEqual([calls.created[0].pkg.id, calls.created[0].pkg.amountIls, calls.created[0].pkg.credits], ['explore_10', 149, 10]);
  assert.deepEqual(calls.marked, [{ orderId: ORDER, owner: OWNER, status: 'link_created' }]);
});

test('flow: every package reaches Make with its server-side price (59 / 149 / 279), whatever the browser claims', async () => {
  for (const [id, amount] of [['go_deeper_3', 59], ['explore_10', 149], ['dive_in_25', 279]] as const) {
    const { d, calls } = deps();
    await handleStartCheckout(body(id), H, d);
    assert.equal(calls.sent[0].amount, amount);
    assert.equal(calls.sent[0].packageId, id);
  }
});

test('flow: invalid package / extra keys: 400 and nothing is created or sent', async () => {
  const { d, calls } = deps();
  for (const body of [{ packageId: 'first_dream' }, { packageId: 'explore_10', amount: 1 }, {}, null]) {
    assert.equal((await handleStartCheckout(body, H, d)).status, 400);
  }
  assert.deepEqual(calls.order, []);
});

test('flow: not configured (Make URL or site URL) is a controlled 503 BEFORE any order exists', async () => {
  for (const over of [{ makeConfigured: () => false }, { siteUrl: () => null }]) {
    const { d, calls } = deps(over);
    const res = await handleStartCheckout(body('explore_10'), H, d);
    assert.equal(res.status, 503);
    assert.deepEqual(calls.order, []);
  }
  const { d } = deps({ createOrder: async () => null });
  assert.equal((await handleStartCheckout(body('explore_10'), H, d)).status, 503);
});

test('flow: too many recent orders for one account: 429, Make is never called', async () => {
  const { d, calls } = deps({ createOrder: async () => ({ status: 'rate_limited' }) });
  assert.equal((await handleStartCheckout(body('explore_10'), H, d)).status, 429);
  assert.ok(!calls.order.includes('make'));
});

test('flow: when Make fails the order is marked link_failed and the customer gets a generic 502 with no link', async () => {
  for (const reason of ['unavailable', 'bad_response', 'not_configured'] as const) {
    const { d, calls } = deps({ requestLink: async () => ({ ok: false, reason }) });
    const res = await handleStartCheckout(body('explore_10'), H, d);
    assert.equal(res.status, 502);
    assert.deepEqual(Object.keys(res.body as object).sort(), ['message', 'reason']);
    assert.equal((res.body as { reason: string }).reason, 'checkout_unavailable');
    assert.deepEqual(calls.marked.map((m) => m.status), ['link_failed']);
  }
});

test('flow: logs carry reason codes only, never the webhook URL, the payment link, the order id or the account', async () => {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
  try {
    const { d } = deps({ requestLink: async () => ({ ok: false, reason: 'unavailable' }) });
    await handleStartCheckout(body('explore_10'), H, d);
  } finally {
    console.error = original;
  }
  assert.ok(lines.length >= 1);
  assert.ok(lines.every((l) => !l.includes(ORDER) && !l.includes(OWNER) && !l.includes('make.com') && !l.includes('grow')));
});

// ------------------------------------------------------------------- what Make receives ----

test('payload: exactly the agreed fields (incl. the checkout name and phone); an opaque order id; NO account id or email', () => {
  const payload = buildMakeCheckoutPayload(ORDER, paidPackage('explore_10')!, 'https://daretogoin.com', PAYER_NORMALIZED);
  assert.deepEqual(payload, {
    schema: 'dare.checkout.v1',
    orderId: ORDER,
    packageId: 'explore_10',
    amount: 149,
    currency: 'ILS',
    title: 'DARE TO GO IN EXPLORE 10 dreams',
    successUrl: `https://daretogoin.com/?payment=${ORDER}`,
    fullName: 'Dafna Dalmeida',
    phone: '0541234567',
  });
  const text = JSON.stringify(payload).toLowerCase();
  for (const forbidden of [OWNER, 'owner', 'user', 'email', 'credits', 'token', 'secret', 'cfield', 'customfield']) assert.ok(!text.includes(forbidden.toLowerCase()), forbidden);
  // the order id and the success link carry no personal data
  assert.ok(!payload.orderId.includes('0541234567') && !payload.successUrl.includes('Dafna') && !payload.successUrl.includes('0541234567'));
  assert.deepEqual(buildMakeCheckoutPayload(ORDER, paidPackage('explore_10')!, 'https://daretogoin.com', PAYER_NORMALIZED, { sample: true }).sample, true);
  assert.ok(!('sample' in payload));
});

test('payload: the real route never sends the sample flag and the sample script uses the same builder', async () => {
  const { d, calls } = deps();
  await handleStartCheckout(body('dive_in_25'), H, d);
  assert.ok(!('sample' in calls.sent[0]));
  assert.deepEqual(Object.keys(calls.sent[0]), ['schema', 'orderId', 'packageId', 'amount', 'currency', 'title', 'successUrl', 'fullName', 'phone']);
  assert.equal(calls.sent[0].phone, '0541234567', 'the phone reaches Make normalized');
  const script = read('scripts/send-sample-checkout.ts');
  assert.match(script, /buildMakeCheckoutPayload\(/);
  assert.match(script, /--send/);
  assert.ok(!/console\.log\([^)]*MAKE_CHECKOUT_WEBHOOK_URL/.test(script), 'the webhook URL is never printed');
});

// ------------------------------------------------------------------- Make webhook client ----

test('make url: only an https hook.*.make.com address is ever used (the URL is a secret and is validated, not trusted)', () => {
  assert.ok(parseMakeWebhookUrl(WEBHOOK));
  assert.ok(parseMakeWebhookUrl('https://hook.make.com/xyz'));
  assert.ok(parseMakeWebhookUrl('https://hook.us1.make.com/xyz'));
  for (const bad of [undefined, '', 'not a url', 'http://hook.eu2.make.com/x', 'https://evil.example/x', 'https://hook.eu2.make.com.evil.example/x', 'https://make.com/x', 'https://user:pw@hook.eu2.make.com/x', 'https://169.254.169.254/x', 'https://localhost/x', 'ftp://hook.make.com/x']) {
    assert.equal(parseMakeWebhookUrl(bad), null, String(bad));
  }
});

test('site url: https origin only, defaulting to the production domain', () => {
  assert.equal(siteUrlFromEnv({}), 'https://daretogoin.com');
  assert.equal(siteUrlFromEnv({ PUBLIC_SITE_URL: 'https://staging.example.com/anything?x=1' }), 'https://staging.example.com');
  assert.equal(siteUrlFromEnv({ PUBLIC_SITE_URL: 'http://daretogoin.com' }), null);
  assert.equal(siteUrlFromEnv({ PUBLIC_SITE_URL: 'javascript:alert(1)' }), null);
});

test('payment url: https, no credentials, Grow domains only (configurable); everything else is refused', () => {
  assert.ok(validatePaymentUrl(PAY_URL, {}));
  assert.ok(validatePaymentUrl('https://meshulam.co.il/s/abc123', {}));
  assert.ok(validatePaymentUrl('https://pay.example.org/x', { GROW_PAYMENT_URL_HOSTS: 'example.org' }));
  for (const bad of [undefined, null, 5, '', 'http://pay.grow.link/x', 'https://evil.example/x', 'https://grow.link.evil.example/x', 'https://evilgrow.link/x', 'https://user:pw@pay.grow.link/x', 'javascript:alert(1)', 'data:text/html,hi', `https://pay.grow.link/${'a'.repeat(2100)}`]) {
    assert.equal(validatePaymentUrl(bad as unknown, {}), null, String(bad).slice(0, 40));
  }
});

function fakeFetch(status: number, body: string, seen?: { url?: string; init?: RequestInit }): typeof fetch {
  return (async (url: unknown, init?: RequestInit) => {
    if (seen) Object.assign(seen, { url: String(url), init });
    return new Response(body, { status });
  }) as typeof fetch;
}
const SAMPLE_PAYLOAD = buildMakeCheckoutPayload(ORDER, paidPackage('explore_10')!, 'https://daretogoin.com', PAYER_NORMALIZED);
const ENV = { MAKE_CHECKOUT_WEBHOOK_URL: WEBHOOK } as NodeJS.ProcessEnv;

test('make client: posts the JSON payload to the configured webhook (no redirects, optional api key header)', async () => {
  const seen: { url?: string; init?: RequestInit } = {};
  const res = await postToMake(SAMPLE_PAYLOAD, { env: { ...ENV, MAKE_CHECKOUT_WEBHOOK_API_KEY: 'k-123' } as NodeJS.ProcessEnv, fetchImpl: fakeFetch(200, 'Accepted', seen) });
  assert.deepEqual(res, { status: 200, bodyText: 'Accepted' });
  assert.equal(seen.url, WEBHOOK);
  assert.equal(seen.init?.method, 'POST');
  assert.equal(seen.init?.redirect, 'error');
  const headers = seen.init?.headers as Record<string, string>;
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers['x-make-apikey'], 'k-123');
  assert.deepEqual(JSON.parse(String(seen.init?.body)), SAMPLE_PAYLOAD);
  const noKey: { init?: RequestInit } = {};
  await postToMake(SAMPLE_PAYLOAD, { env: ENV, fetchImpl: fakeFetch(200, 'x', noKey) });
  const sentHeaders = (noKey.init?.headers ?? {}) as Record<string, string>;
  assert.ok(!('x-make-apikey' in sentHeaders));
  assert.equal(await postToMake(SAMPLE_PAYLOAD, { env: {} as NodeJS.ProcessEnv, fetchImpl: fakeFetch(200, 'x') }), null, 'unconfigured: nothing is sent');
});

test('make client: only a complete, matching answer yields a payment link', async () => {
  const good = JSON.stringify({ ok: true, orderId: ORDER, paymentUrl: PAY_URL });
  assert.deepEqual(await requestPaymentLink(SAMPLE_PAYLOAD, { env: ENV, fetchImpl: fakeFetch(200, good) }), { ok: true, paymentUrl: PAY_URL });
  const cases: [number, string][] = [
    [200, 'Accepted'], // the scenario has no "Webhook response" module yet
    [200, JSON.stringify({ ok: true, orderId: 'ffffffffffffffffffffffffffffffff', paymentUrl: PAY_URL })], // someone else's order
    [200, JSON.stringify({ ok: false, orderId: ORDER, paymentUrl: PAY_URL })],
    [200, JSON.stringify({ ok: true, orderId: ORDER })],
    [200, JSON.stringify({ ok: true, orderId: ORDER, paymentUrl: 'https://evil.example/pay' })],
    [200, JSON.stringify({ ok: true, orderId: ORDER, paymentUrl: 'http://pay.grow.link/x' })],
    [200, '[1,2,3]'],
    [200, 'null'],
    [500, good],
    [429, good],
    [302, good],
  ];
  for (const [status, body] of cases) {
    const r = await requestPaymentLink(SAMPLE_PAYLOAD, { env: ENV, fetchImpl: fakeFetch(status, body) });
    assert.equal(r.ok, false, `${status} ${body.slice(0, 50)}`);
  }
  const boom = (async () => {
    throw new Error('network down');
  }) as unknown as typeof fetch;
  assert.deepEqual(await requestPaymentLink(SAMPLE_PAYLOAD, { env: ENV, fetchImpl: boom }), { ok: false, reason: 'unavailable' });
  assert.deepEqual(await requestPaymentLink(SAMPLE_PAYLOAD, { env: {} as NodeJS.ProcessEnv, fetchImpl: fakeFetch(200, good) }), { ok: false, reason: 'not_configured' });
});

test('make client: a slow Make is cut off by the timeout instead of hanging the customer', async () => {
  const hang = ((_url: unknown, init?: RequestInit) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as typeof fetch;
  const started = Date.now();
  const r = await requestPaymentLink(SAMPLE_PAYLOAD, { env: ENV, fetchImpl: hang, timeoutMs: 50 });
  assert.deepEqual(r, { ok: false, reason: 'unavailable' });
  assert.ok(Date.now() - started < 2000);
});

// --------------------------------------------------------------------- wiring + secrets ----

test('wiring: checkout lives on the existing /api/credits function (no new Vercel function; the project stays at 11)', () => {
  const files = readdirSync(new URL('../api', import.meta.url)).filter((f) => f.endsWith('.ts'));
  assert.equal(files.length, 12, files.join(', '));
  assert.deepEqual(files.filter((f) => /checkout|payment|grow|make/i.test(f)), ['payment-complete.ts']);
  const api = read('api/credits.ts');
  assert.match(api, /req\.method === 'POST'/);
  assert.match(api, /handleStartCheckout/);
  assert.match(api, /req\.method === 'GET'/);
  assert.match(read('server/index.ts'), /app\.post\('\/api\/credits'/);
});

test('secrets: the Make webhook URL is read only on the server; nothing under src/ or any browser-visible variable mentions it', () => {
  const walk = (dir: string): string[] =>
    readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
  for (const f of walk('src').filter((x) => /\.(ts|tsx)$/.test(x))) {
    const src = read(f);
    assert.ok(!/MAKE_CHECKOUT|make\.com|MAKE_COMPLETION/.test(src), f);
  }
  const example = read('.env.example');
  assert.match(example, /^MAKE_CHECKOUT_WEBHOOK_URL=$/m, 'documented with an EMPTY value');
  assert.ok(!/VITE_MAKE|VITE_GROW/.test(example));
  const client = read('server/payments/makeCheckoutClient.ts');
  assert.ok(!/console\.(log|error|warn|info)/.test(client), 'the Make client never logs');
});

// ------------------------------------------------------------------------- migration ----

test('migration: payment_orders is service-role only, anonymized (not deleted) with the account, and pins the launch prices', () => {
  const sql = read('supabase/migrations/20261007_payment_orders.sql');
  assert.match(sql, /create table if not exists public\.payment_orders/i);
  assert.match(sql, /owner_id\s+uuid references auth\.users \(id\) on delete set null/i);
  assert.match(sql, /alter table public\.payment_orders enable row level security/i);
  assert.ok(!/create policy/i.test(sql), 'no client policy at all');
  assert.match(sql, /revoke all on public\.payment_orders from public, anon, authenticated/i);
  assert.match(sql, /package_id = 'go_deeper_3' and amount_ils = 59\s+and credits = 3/i);
  assert.match(sql, /package_id = 'explore_10'\s+and amount_ils = 149 and credits = 10/i);
  assert.match(sql, /package_id = 'dive_in_25'\s+and amount_ils = 279 and credits = 25/i);
  assert.match(sql, /payment_orders_provider_tx_uidx/);
  assert.match(sql, /grant execute on function public\.create_payment_order\(uuid, text, integer, integer\) to service_role/i);
  assert.match(sql, /grant execute on function public\.set_payment_order_link_status\(text, uuid, text\) to service_role/i);
  assert.ok(!/to (anon|authenticated|public)\s*;/i.test(sql.replace(/revoke[^;]*;/gi, '')));
  const code = sql.replace(/--.*$/gm, '');
  assert.ok(!/(update|insert into|alter table|drop|truncate|delete from)\s+public\.(credit_ledger|dream_credits|dream_attempts|dreams)/i.test(code), 'it never writes credit tables directly: only through the existing grant_credits');
  assert.equal((code.match(/grant_credits\(/g) ?? []).length, 1, 'grant_credits is called in exactly one place (complete_payment_order)');
  assert.ok(!/delete_account_data/.test(sql.replace(/--.*$/gm, '')), 'no change to account deletion needed (FK set null anonymizes)');
});

test('this phase never grants credits: no checkout code calls grant_credits or reads a payment status from the browser', () => {
  for (const f of ['server/payments/checkoutStart.ts', 'server/payments/orderStore.ts', 'server/payments/makeCheckoutClient.ts', 'api/credits.ts']) {
    assert.ok(!/grant_credits|grantCredits|'granted'|"granted"/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')), f);
  }
});

test('privacy: the name and phone go ONLY to Make: not to the order store, the database, the logs, Grow custom fields or the browser response', async () => {
  const lines: string[] = [];
  const original = { error: console.error, log: console.log, warn: console.warn };
  console.error = console.log = console.warn = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
  let res: Awaited<ReturnType<typeof handleStartCheckout>>;
  const seenByStore: unknown[] = [];
  try {
    const { d } = deps({
      createOrder: async (owner, pkg) => (seenByStore.push(owner, pkg), { status: 'created', orderId: ORDER }),
      requestLink: async () => ({ ok: false, reason: 'unavailable' }),
    });
    res = await handleStartCheckout(body('explore_10'), H, d);
  } finally {
    Object.assign(console, original);
  }
  assert.ok(lines.length >= 1);
  assert.ok(lines.every((l) => !l.includes('Dafna') && !l.includes('0541234567') && !l.includes('054-123-4567')));
  assert.ok(!JSON.stringify(seenByStore).includes('Dafna') && !JSON.stringify(seenByStore).includes('0541234567'));
  assert.ok(!JSON.stringify(res.body).includes('Dafna'));
  const store = read('server/payments/orderStore.ts');
  assert.ok(!/fullName|phone|payer/i.test(store), 'the order store never receives the payer details');
  assert.ok(!/fullName|full_name|phone|payer/i.test(read('supabase/migrations/20261007_payment_orders.sql').replace(/--.*$/gm, '')), 'no personal data column in payment_orders');
  const client = read('server/payments/makeCheckoutClient.ts').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/cField|customField/i.test(client), 'DARE fills no Grow custom field with personal data');
});
