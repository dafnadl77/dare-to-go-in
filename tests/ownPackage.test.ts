import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleStartCheckout, packageHeld, type CheckoutDeps } from '../server/payments/checkoutStart.ts';
import type { PaidPackage } from '../server/payments/checkoutPackages.ts';
import { he, en } from '../src/i18n/translations.ts';

/**
 * "THIS IS YOUR PACKAGE" (approved 2026-10-26). The account's own package — its latest completed purchase (payment_orders, status
 * 'granted') — is marked, and is not bought again, while the account's total balance is above zero; at zero the mark goes and it can be
 * bought again. Only that one package: every other package is bought as before. The server refuses it whatever the page shows; a
 * purchase or a balance that cannot be read never refuses. Prices, credits and the payment flow are unchanged. No network.
 */

const OWNER = '11111111-1111-4111-8111-111111111111';
const PAYER = { fullName: 'Dafna Dalmeida', phone: '054-123-4567' };
const body = (packageId: string) => ({ packageId, ...PAYER });
const H = { authorization: 'Bearer good' };
const read = (p: string) => readFileSync(p, 'utf8');

/** The account: its latest purchased package and its total balance (null = could not be read). */
function account(purchased: string | null | undefined, balance: number | null) {
  const calls = { orders: 0, make: 0 };
  const d: CheckoutDeps = {
    verifyBearer: async () => ({ ok: true, userId: OWNER }),
    siteUrl: () => 'https://daretogoin.com',
    makeConfigured: () => true,
    packageStillHeld: async (_owner: string, pkg: PaidPackage) => packageHeld(purchased as never, balance, pkg.id),
    createOrder: async () => ((calls.orders += 1), { status: 'created', orderId: 'a1b2c3d4e5f60718293a4b5c6d7e8f90' }),
    markLink: async () => true,
    requestLink: async () => ((calls.make += 1), { ok: true, paymentUrl: 'https://pay.grow.link/ab12cd34ef' }),
  };
  return { d, calls };
}

test('the rule: own package and dreams left = held; anything unknown is never held', () => {
  assert.equal(packageHeld('go_deeper_3', 2, 'go_deeper_3'), true);
  assert.equal(packageHeld('go_deeper_3', 0, 'go_deeper_3'), false, 'balance zero: can be bought again');
  assert.equal(packageHeld('go_deeper_3', 2, 'explore_10'), false, 'another package is never held');
  assert.equal(packageHeld(null, 5, 'go_deeper_3'), false, 'no purchase (free credits only): nothing is held');
  assert.equal(packageHeld(undefined, 5, 'go_deeper_3'), false, 'purchase unreadable: no guess');
  assert.equal(packageHeld('go_deeper_3', null, 'go_deeper_3'), false, 'balance unreadable: no guess');
});

test('the server refuses buying the own package again while dreams are left: no order, no Make call', async () => {
  const { d, calls } = account('explore_10', 4);
  const res = await handleStartCheckout(body('explore_10'), H, d);
  assert.equal(res.status, 409);
  assert.equal((res.body as { reason: string }).reason, 'package_still_active');
  assert.deepEqual(calls, { orders: 0, make: 0 });
});

test('at balance zero the own package is bought again as before', async () => {
  const { d, calls } = account('explore_10', 0);
  const res = await handleStartCheckout(body('explore_10'), H, d);
  assert.equal(res.status, 200);
  assert.deepEqual(calls, { orders: 1, make: 1 });
});

test('another package (upgrade or smaller) is bought as before while the own package still has dreams', async () => {
  for (const other of ['go_deeper_3', 'dive_in_25']) {
    const { d, calls } = account('explore_10', 4);
    const res = await handleStartCheckout(body(other), H, d);
    assert.equal(res.status, 200, other);
    assert.deepEqual(calls, { orders: 1, make: 1 }, other);
  }
});

test('free credits alone, or an unreadable purchase or balance, never block a purchase', async () => {
  for (const [purchased, balance] of [[null, 1], [undefined, 3], ['go_deeper_3', null]] as const) {
    const { d } = account(purchased, balance);
    assert.equal((await handleStartCheckout(body('go_deeper_3'), H, d)).status, 200, `${purchased} / ${balance}`);
  }
});

test('repeated or simultaneous calls for the held package are all refused; the rule runs before anything is created', async () => {
  const { d, calls } = account('dive_in_25', 7);
  const results = await Promise.all([1, 2, 3].map(() => handleStartCheckout(body('dive_in_25'), H, d)));
  assert.deepEqual(results.map((r) => r.status), [409, 409, 409]);
  assert.deepEqual(calls, { orders: 0, make: 0 });
  const route = read('server/payments/checkoutStart.ts');
  assert.ok(route.indexOf('packageStillHeld(verified.userId') < route.indexOf('deps.createOrder('), 'checked before an order exists');
});

test('nothing about prices, credits or the payment completion changed', () => {
  const route = read('server/payments/checkoutStart.ts');
  assert.match(route, /buildMakeCheckoutPayload\(order\.orderId, parsed\.pkg, siteUrl, parsed\.payer\)/);
  assert.doesNotMatch(read('server/payments/paymentComplete.ts'), /package_still_active|packageStillHeld/, 'a paid order is always granted');
});

test('the page: the ribbon only on the own package while dreams are left, and its card opens the popup', () => {
  const page = read('src/pricing/PricingPage.tsx');
  assert.match(page, /dreamsLeft\.state\.summary\.balance > 0 \? accountPlan\.plan : null/);
  assert.match(page, /isCurrent=\{heldPackage === pkg\.id\}/, 'one package at most');
  assert.match(page, /if \(id === heldPackage\) \{\s*setHeldOpen\(true\);\s*return;/);
  assert.match(page, /onClick=\{isCurrent \?/, 'clicking the card itself');
  // the server's refusal reaches the customer in the same words, if the page was stale
  assert.match(read('src/payments/checkout.ts'), /res\.status === 409 && body\.reason === 'package_still_active'/);
  assert.match(read('src/payments/CheckoutDialog.tsx'), /package_still_active: 'pricing\.yourPackageHeld'/);
});

test('the popup words, Hebrew and English', () => {
  assert.equal(he.pricing.yourPackageHeld, 'זו החבילה שלך. תוכלי לרכוש אותה שוב לאחר ניצול כל החלומות שנותרו לך.');
  assert.equal(en.pricing.yourPackageHeld, 'This is your package. You can buy it again once you have used all the dreams you have left.');
});
