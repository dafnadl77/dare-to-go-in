import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkCompletionAuth, previousSecretState } from '../server/payments/completionAuth.ts';
import { handlePaymentComplete, type CompletionDeps } from '../server/payments/paymentComplete.ts';

// Fictional values made up for this file only; they are not and never were a real secret.
const NEW = 'n'.repeat(36) + '-fictional-new';
const OLD = 'o'.repeat(36) + '-fictional-old';
const WRONG = 'w'.repeat(36) + '-fictional-wrong';
const env = (e: Record<string, string>) => e as NodeJS.ProcessEnv;
const ORDER = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const GOOD = { schema: 'dare.payment.v1', orderId: ORDER, transactionId: 'TX-12345', status: 'paid', amount: 59, currency: 'ILS', providerStatus: 'Paid' };

test('rotation: without the transition slot the check is exactly the one-secret check', () => {
  for (const e of [env({ MAKE_COMPLETION_SECRET: NEW }), env({ MAKE_COMPLETION_SECRET: NEW, MAKE_COMPLETION_SECRET_PREVIOUS: '' })]) {
    assert.equal(previousSecretState(e), 'unset');
    assert.equal(checkCompletionAuth(`Bearer ${NEW}`, e), 'ok');
    assert.equal(checkCompletionAuth(`Bearer ${OLD}`, e), 'unauthorized');
    assert.equal(checkCompletionAuth(`Bearer ${WRONG}`, e), 'unauthorized');
    assert.equal(checkCompletionAuth(undefined, e), 'unauthorized');
    assert.equal(checkCompletionAuth('', e), 'unauthorized');
  }
});

test('rotation: during the transition BOTH the new and the old secret pass, a wrong or missing one does not', () => {
  const e = env({ MAKE_COMPLETION_SECRET: NEW, MAKE_COMPLETION_SECRET_PREVIOUS: OLD });
  assert.equal(previousSecretState(e), 'active');
  assert.equal(checkCompletionAuth(`Bearer ${NEW}`, e), 'ok');
  assert.equal(checkCompletionAuth(`Bearer ${OLD}`, e), 'ok_previous');
  for (const h of [`Bearer ${WRONG}`, undefined, null, '', 'Bearer', 'Bearer ', NEW, OLD, `Basic ${OLD}`, `Bearer ${OLD}x`, `Bearer x${NEW}`, `Bearer ${NEW} ${OLD}`, `Bearer ${OLD.toUpperCase()}`]) {
    assert.equal(checkCompletionAuth(h as string | undefined, e), 'unauthorized', String(h));
  }
});

test('rotation: the old secret never stands in for a missing or short primary (fail closed)', () => {
  for (const primary of [undefined, '', 'short', 'x'.repeat(31)]) {
    const e = env(primary === undefined ? { MAKE_COMPLETION_SECRET_PREVIOUS: OLD } : { MAKE_COMPLETION_SECRET: primary, MAKE_COMPLETION_SECRET_PREVIOUS: OLD });
    assert.equal(checkCompletionAuth(`Bearer ${OLD}`, e), 'not_configured', String(primary));
    assert.equal(checkCompletionAuth(`Bearer ${primary ?? ''}`, e), 'not_configured', String(primary));
  }
});

test('rotation: a partial or wrong transition slot is ignored (the check stays the one-secret check) and is reported as unusable', () => {
  for (const previous of ['short', 'x'.repeat(31), NEW]) {
    const e = env({ MAKE_COMPLETION_SECRET: NEW, MAKE_COMPLETION_SECRET_PREVIOUS: previous });
    assert.equal(previousSecretState(e), 'set_but_unusable', previous.length + ' chars');
    assert.equal(checkCompletionAuth(`Bearer ${NEW}`, e), 'ok');
    assert.equal(checkCompletionAuth(`Bearer ${previous}`, e), previous === NEW ? 'ok' : 'unauthorized');
  }
  assert.equal(checkCompletionAuth(`Bearer ${'x'.repeat(32)}`, env({ MAKE_COMPLETION_SECRET: NEW, MAKE_COMPLETION_SECRET_PREVIOUS: 'x'.repeat(32) })), 'ok_previous', 'exactly 32 is enough');
});

const route = async (authResult: ReturnType<typeof checkCompletionAuth>, slot: 'unset' | 'active' | 'set_but_unusable' = 'unset') => {
  const logs: string[] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => void logs.push(a.map(String).join(' '));
  let completed = 0;
  const deps: CompletionDeps = { auth: () => authResult, previousSecretState: () => slot, complete: async () => (completed++, 'granted'), recordNotice: async () => undefined };
  try {
    const r = await handlePaymentComplete(GOOD, { authorization: 'Bearer ignored-by-stub' }, deps);
    return { status: r.status, completed, logs };
  } finally {
    console.error = original;
  }
};

test('route: the old secret completes the payment exactly like the new one, and says so with fixed words only', async () => {
  const viaNew = await route('ok', 'active');
  const viaOld = await route('ok_previous', 'active');
  assert.equal(viaNew.status, 200);
  assert.equal(viaOld.status, 200);
  assert.equal(viaNew.completed, 1);
  assert.equal(viaOld.completed, 1);
  assert.deepEqual(viaNew.logs, []);
  assert.deepEqual(viaOld.logs, ['payment_complete_auth matched=previous']);
});

test('route: refusals are unchanged (401 / 503), complete nothing, and an unusable slot is reported without any value', async () => {
  for (const [auth, slot, status, logs] of [
    ['unauthorized', 'unset', 401, []],
    ['unauthorized', 'active', 401, []],
    ['unauthorized', 'set_but_unusable', 401, ['payment_complete_auth previous_secret=unusable']],
    ['not_configured', 'set_but_unusable', 503, []],
  ] as const) {
    const r = await route(auth, slot);
    assert.equal(r.status, status, `${auth}/${slot}`);
    assert.equal(r.completed, 0);
    assert.deepEqual(r.logs, logs);
  }
});

test('real environment end to end: old, new, wrong and missing secrets through the real check (no database is reached on refusal)', async () => {
  const saved = { p: process.env.MAKE_COMPLETION_SECRET, q: process.env.MAKE_COMPLETION_SECRET_PREVIOUS };
  process.env.MAKE_COMPLETION_SECRET = NEW;
  process.env.MAKE_COMPLETION_SECRET_PREVIOUS = OLD;
  const logs: string[] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => void logs.push(a.map(String).join(' '));
  try {
    let completed = 0;
    const deps: CompletionDeps = {
      auth: (h) => checkCompletionAuth(h),
      previousSecretState: () => previousSecretState(),
      complete: async () => (completed++, 'granted'),
      recordNotice: async () => undefined,
    };
    const call = (h?: string) => handlePaymentComplete(GOOD, { authorization: h }, deps).then((r) => r.status);
    assert.equal(await call(`Bearer ${NEW}`), 200);
    assert.equal(await call(`Bearer ${OLD}`), 200);
    assert.equal(await call(`Bearer ${WRONG}`), 401);
    assert.equal(await call(undefined), 401);
    assert.equal(completed, 2);
    for (const line of logs) for (const s of [NEW, OLD, WRONG]) assert.ok(!line.includes(s), 'no secret in any log line');
  } finally {
    console.error = original;
    if (saved.p === undefined) delete process.env.MAKE_COMPLETION_SECRET; else process.env.MAKE_COMPLETION_SECRET = saved.p;
    if (saved.q === undefined) delete process.env.MAKE_COMPLETION_SECRET_PREVIOUS; else process.env.MAKE_COMPLETION_SECRET_PREVIOUS = saved.q;
  }
});

test('source: both comparisons always run when the slot is active, nothing is logged in the check, the browser never sees either name', () => {
  const src = readFileSync(new URL('../server/payments/completionAuth.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.equal((src.match(/timingSafeEqual\(/g) ?? []).length, 2);
  assert.ok(src.indexOf('const previousOk') < src.indexOf("if (primaryOk) return 'ok'"), 'the previous comparison runs before the early return');
  assert.ok(!/console\./.test(src));
  const route = readFileSync(new URL('../server/payments/paymentComplete.ts', import.meta.url), 'utf8');
  for (const m of route.matchAll(/console\.error\(([^)]*)\)/g)) assert.ok(!/secret\b(?!=)|env\.|header|authorization/i.test(m[1].replace(/previous_secret=unusable/, '')), m[1]);
});
