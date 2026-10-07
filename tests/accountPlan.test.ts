import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fullNameOfUser, firstNameOf, firstNameOfUser, normalizeDisplayName } from '../src/auth/displayName.ts';
import { parseCreditSummary } from '../src/credits/creditSummary.ts';
import { planDisplayName } from '../src/pricing/planName.ts';
import { toPurchasedPackage } from '../server/payments/purchasedPackage.ts';
import { DREAM_PACKAGES } from '../src/pricing/packages.ts';
import { en, he } from '../src/i18n/translations.ts';

/**
 * The account's name and package as the UI shows them. The name comes from the signed-in user's own metadata (never the email
 * address); the package is what the account PURCHASED (server-read from completed orders), never inferred from the balance.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const lookup = (dict: unknown, path: string): string => path.split('.').reduce((n, k) => (n as Record<string, unknown>)[k], dict) as string;
const tFor = (dict: unknown) => (path: string) => lookup(dict, path);
const user = (user_metadata: Record<string, unknown> | undefined) => ({ user_metadata: user_metadata as never });

// ------------------------------------------------------------------ names ----

test('a Google account: the name is the provider-supplied full name; the greeting uses the first word', () => {
  const u = user({ full_name: 'Test Dreamer', name: 'Test Dreamer', email: 'someone@example.com' });
  assert.equal(fullNameOfUser(u), 'Test Dreamer');
  assert.equal(firstNameOfUser(u), 'Test');
});

test('the name the dreamer typed (displayName) wins over the provider name', () => {
  assert.equal(fullNameOfUser(user({ displayName: 'Chosen Name', full_name: 'Provider Name' })), 'Chosen Name');
});

test('Hebrew names work, and extra spaces collapse', () => {
  assert.equal(fullNameOfUser(user({ displayName: '  דנה   כהן ' })), 'דנה כהן');
  assert.equal(firstNameOf('דנה כהן'), 'דנה');
});

test('an account with no name has none: never inferred from the email, never undefined/null/empty text', () => {
  for (const meta of [undefined, {}, { email: 'dreamer.person@example.com' }, { full_name: '' }, { full_name: '   ' }, { name: null }, { name: 42 }, { displayName: {} }]) {
    assert.equal(fullNameOfUser(user(meta)), null);
    assert.equal(firstNameOfUser(user(meta)), null);
  }
  assert.equal(fullNameOfUser(null), null);
  assert.equal(fullNameOfUser(undefined), null);
  assert.equal(firstNameOf(null), null);
});

test('an unusable stored value falls through to the next source instead of showing it', () => {
  assert.equal(fullNameOfUser(user({ displayName: 'a@b.com', full_name: 'Real Name' })), 'Real Name');
  assert.equal(fullNameOfUser(user({ displayName: '1234', name: 'Fallback' })), 'Fallback');
});

test('normalizeDisplayName: length, control characters, email-like text, no letters', () => {
  assert.equal(normalizeDisplayName('x'.repeat(61)), null);
  assert.equal(normalizeDisplayName('x'.repeat(60)), 'x'.repeat(60));
  assert.equal(normalizeDisplayName('bad\u0007name'), null);
  assert.equal(normalizeDisplayName('me@example.com'), null);
  assert.equal(normalizeDisplayName('---'), null);
  assert.equal(normalizeDisplayName(''), null);
  assert.equal(normalizeDisplayName(undefined), null);
});

test('the name is not hardcoded anywhere in the UI sources', () => {
  for (const file of ['src/archive/DreamArchive.tsx', 'src/pricing/PricingPage.tsx', 'src/auth/displayName.ts', 'src/credits/credits.ts', 'src/credits/creditSummary.ts']) {
    const text = read(file);
    assert.ok(!/דפנה|dafna|dalmeda|דלמדה/i.test(text), file);
  }
});

// ---------------------------------------------------------------- package ----

test('a free account (no completed purchase) is the free tier', () => {
  const summary = parseCreditSummary({ balance: 0, purchasedPackage: null });
  assert.deepEqual(summary, { balance: 0, plan: 'first_dream' });
  assert.equal(planDisplayName(summary!.plan!, tFor(en)), 'Free');
  assert.equal(planDisplayName(summary!.plan!, tFor(he)), 'חינמי');
});

test('the package is the PURCHASED one, whatever the balance: 3 dreams bought, 1 used, 2 left -> still "3 dreams"', () => {
  for (const balance of [3, 2, 1, 0]) {
    const summary = parseCreditSummary({ balance, purchasedPackage: 'go_deeper_3' });
    assert.equal(summary?.plan, 'go_deeper_3');
    assert.equal(summary?.balance, balance);
  }
  assert.equal(planDisplayName('go_deeper_3', tFor(he)), '3 חלומות');
  assert.equal(planDisplayName('go_deeper_3', tFor(en)), '3 Dreams');
});

test('the plan never changes with the balance: a 10-dream buyer down to 3 credits is not a 3-dream buyer', () => {
  assert.equal(parseCreditSummary({ balance: 3, purchasedPackage: 'explore_10' })?.plan, 'explore_10');
  assert.equal(parseCreditSummary({ balance: 25, purchasedPackage: 'go_deeper_3' })?.plan, 'go_deeper_3');
});

test('a later purchase replaces the shown package (free -> 3 -> 10)', () => {
  const stages = [null, 'go_deeper_3', 'explore_10'].map((p) => planDisplayName(parseCreditSummary({ balance: 1, purchasedPackage: p })!.plan!, tFor(he)));
  assert.deepEqual(stages, ['חינמי', '3 חלומות', '10 חלומות']);
  assert.equal(planDisplayName('dive_in_25', tFor(he)), '25 חלומות');
});

test('every display name comes from the package list and matches the agreed names', () => {
  assert.deepEqual(DREAM_PACKAGES.map((p) => planDisplayName(p.id, tFor(he))), ['חינמי', '3 חלומות', '10 חלומות', '25 חלומות']);
});

test('an undetermined package is unknown (null), never guessed, and bad payloads are rejected', () => {
  assert.equal(parseCreditSummary({ balance: 5 })?.plan, null);
  assert.equal(parseCreditSummary({ balance: 5, purchasedPackage: 'enterprise' })?.plan, null);
  assert.equal(parseCreditSummary({ balance: 5, purchasedPackage: 3 })?.plan, null);
  assert.equal(parseCreditSummary({ purchasedPackage: 'go_deeper_3' }), null);
  assert.equal(parseCreditSummary({ balance: 'x', purchasedPackage: null }), null);
  assert.equal(parseCreditSummary(null), null);
});

test('the server maps only the known paid ids; anything else is "could not be determined"', () => {
  assert.equal(toPurchasedPackage('go_deeper_3'), 'go_deeper_3');
  assert.equal(toPurchasedPackage('explore_10'), 'explore_10');
  assert.equal(toPurchasedPackage('dive_in_25'), 'dive_in_25');
  for (const bad of ['first_dream', 'x', '', null, undefined, 3]) assert.equal(toPurchasedPackage(bad), undefined);
});

// ----------------------------------------------------------------- wiring ----

test('the purchased package is read from the account\'s completed orders only — never from credits or the balance', () => {
  const src = read('server/payments/purchasedPackage.ts');
  assert.match(src, /from\('payment_orders'\)[\s\S]*\.eq\('owner_id', ownerId\)[\s\S]*\.eq\('status', 'granted'\)[\s\S]*\.order\('granted_at', \{ ascending: false \}\)[\s\S]*\.limit\(1\)/);
  assert.ok(!/dream_credits|credit_ledger|get_credit_balance|balance/.test(src.replace(/\/\*\*[\s\S]*?\*\//g, '')));
});

test('GET /api/credits returns the package for the verified caller only, read-only, without touching the payment mechanism', () => {
  const route = read('server/routes/credits.ts');
  assert.match(route, /getPurchasedPackage\(verified\.userId\)/);
  assert.match(route, /purchasedPackage === undefined \? \{ balance \} : \{ balance, purchasedPackage \}/);
  const api = read('api/credits.ts');
  assert.ok(!/payment-complete|complete_payment_order|grant_credits/.test(route + api));
});

test('the new UI reads the package from the server summary and the name from the user: no balance-based package logic', () => {
  for (const file of ['src/credits/useAccountPlan.ts', 'src/pricing/planName.ts', 'src/pricing/PricingPage.tsx']) {
    assert.ok(!/balance/.test(read(file).replace(/\/\*[\s\S]*?\*\//g, '')), file);
  }
  const archive = read('src/archive/DreamArchive.tsx');
  assert.match(archive, /fullNameOfUser\(user\)/);
  assert.match(archive, /useAccountPlan\(activeSection === 'settings' \? user\?\.id : undefined\)/);
});

test('the Pricing card marks only the held package, and the free fallback never renders undefined/null', () => {
  const pricing = read('src/pricing/PricingPage.tsx');
  assert.match(pricing, /isCurrent=\{accountPlan\.status === 'ready' && accountPlan\.plan === pkg\.id\}/);
  assert.match(pricing, /t\('pricing\.yourPackage'\)/);
  assert.equal(en.pricing.yourPackage, 'This is your package');
  assert.equal(he.pricing.yourPackage, 'זו החבילה שלך');
  assert.equal(he.archive.greeting.replace('{name}', 'דנה'), 'שלום דנה');
  assert.equal(he.archive.greetingNoName, 'שלום');
  assert.ok(!/undefined|null/.test(he.archive.greetingNoName + en.archive.greetingNoName));
});

test('prices, credits and package ids are untouched', () => {
  assert.deepEqual(
    DREAM_PACKAGES.map((p) => [p.id, p.priceIls, p.dreamCount]),
    [['first_dream', null, 1], ['go_deeper_3', 59, 3], ['explore_10', 149, 10], ['dive_in_25', 279, 25]],
  );
});

test('the held package gets a ribbon + card highlight; it replaces "Most Popular" on that card and never shows with it', () => {
  const pricing = read('src/pricing/PricingPage.tsx');
  assert.match(pricing, /\$\{isCurrent \? ' pr-card--current' : ''\}/);
  // one ternary: ribbon when current, otherwise the Most Popular badge — never both
  assert.match(pricing, /\{isCurrent \? \(\s*<div className="pr-card-ribbon">[\s\S]*?\) : \(\s*pkg\.featured && <span className="pr-card-badge">/);
  assert.equal((pricing.match(/className="pr-card-ribbon"/g) ?? []).length, 1);
  const css = read('src/pricing/PricingPage.css');
  assert.match(css, /\.pr-card--current \{/);
  assert.match(css, /\.pr-card-ribbon \{[\s\S]*?position: absolute;[\s\S]*?top: 0;/);
});

test('the ribbon wording is exactly the requested text in both languages', () => {
  assert.equal(he.pricing.yourPackage, 'זו החבילה שלך');
  assert.equal(en.pricing.yourPackage, 'This is your package');
});
