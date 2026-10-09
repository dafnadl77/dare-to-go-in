import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { parseCreditSummary } from '../src/credits/creditSummary.ts';
import { en, he } from '../src/i18n/translations.ts';

/**
 * The app-owner role as the server and the UI use it. The role is decided in the database from the VERIFIED account id; nothing the
 * browser sends can create or claim it, and no route or client code writes it.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(new URL(`../${dir}`, import.meta.url))) {
    const rel = `${dir}/${name}`;
    if (statSync(new URL(`../${rel}`, import.meta.url)).isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

test('the role is read only through the verified account id, server-side, and an unknown answer is never "owner"', () => {
  const store = code('server/dreamAttempts.ts');
  assert.match(store, /export async function isAppOwner\(userId: string\): Promise<boolean \| null>/);
  assert.match(store, /client\.rpc\('is_app_owner', \{ p_owner: userId \}\)/);
  assert.match(store, /return error \|\| typeof data !== 'boolean' \? null : data;/);

  const credits = code('server/routes/credits.ts');
  assert.match(credits, /verifyBearerToken\(authHeader\)/);
  assert.match(credits, /const owner = await isAppOwner\(verified\.userId\);\s*if \(owner === true && orderId === undefined\)/, 'only a definite true is the owner');

  const transcription = code('server/routes/dreamTranscription.ts');
  assert.match(transcription, /resolved\.identity\.kind === 'user' && \(await isAppOwner\(resolved\.identity\.userId\)\) !== true/, 'unknown or false keeps the balance check');
});

test('no route, no client code and no API handler can write or change the owner role', () => {
  for (const file of [...sourceFiles('server'), ...sourceFiles('api'), ...sourceFiles('src')]) {
    const text = code(file);
    assert.ok(!/app_owners|app_owner_audit/.test(text), `${file} must not touch the role tables`);
    if (file !== 'server/dreamAttempts.ts') assert.ok(!/is_app_owner/.test(text), `${file} must not call the role function`);
  }
});

test('the browser can neither send nor store a role: nothing in src reads an email, a flag or localStorage to decide ownership', () => {
  for (const file of ['src/credits/credits.ts', 'src/credits/creditSummary.ts', 'src/credits/useAccountPlan.ts', 'src/pricing/PricingPage.tsx']) {
    const text = code(file);
    assert.ok(!/localStorage|sessionStorage|dafnadl77|@gmail/.test(text), file);
  }
  // the server never takes the role (or any owner/user id) from the request body or headers
  for (const file of ['server/routes/credits.ts', 'server/routes/dreamTranscription.ts', 'server/routes/dreamAnalysis.ts']) {
    assert.ok(!/body\.(owner|role|isOwner|userId)|headers\.(x-|owner)/i.test(code(file)), file);
  }
});

test('the migration is the only place the owner is granted, tied to the verified id and email, and it changes no history', () => {
  const sql = read('supabase/migrations/20261009_app_owner.sql');
  assert.match(sql, /7d55396c-3582-4aec-8470-d188fc029829/);
  assert.match(sql, /lower\(email\) = 'dafnadl77@gmail\.com' and email_confirmed_at is not null/);
  assert.match(sql, /revoke all on public\.app_owners from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.is_app_owner\(uuid\) to service_role;/);
  assert.ok(!/update public\.dream_credits|delete from|update public\.credit_ledger|payment_orders|drop table|truncate/i.test(sql.replace(/--.*$/gm, '').replace(/update public\.dream_credits\s+set balance = balance - 1/g, '')));
  assert.ok(!/grant_credits|complete_payment_order|create_payment_order/.test(sql));
});

test('/api/credits tells the owner so, and every other account gets the unchanged answer', () => {
  const route = read('server/routes/credits.ts');
  assert.match(route, /purchasedPackage === undefined \? \{ balance \} : \{ balance, purchasedPackage \}/);
  assert.deepEqual(parseCreditSummary({ balance: 0, owner: true }), { balance: 0, plan: null, owner: true });
  assert.deepEqual(parseCreditSummary({ balance: 0, purchasedPackage: null }), { balance: 0, plan: 'first_dream' });
  for (const notOwner of [false, 'true', 1, null, undefined, {}]) {
    assert.equal(parseCreditSummary({ balance: 0, owner: notOwner })?.owner, undefined, String(notOwner));
  }
});

test('the owner is never sent to Pricing by a zero balance, and the UI shows unlimited dreams without a credit number', () => {
  const credits = code('src/credits/credits.ts');
  assert.match(credits, /return summary && !summary\.owner && !summary\.roleUnknown \? summary\.balance : null;/);
  const plan = code('src/credits/useAccountPlan.ts');
  assert.match(plan, /summary\?\.owner \? \{ status: 'owner' \}/);

  const archive = read('src/archive/DreamArchive.tsx');
  assert.match(archive, /accountPlan\.status === 'owner'/);
  assert.match(archive, /settingsAccountTypeLabel[\s\S]*settingsOwnerValue[\s\S]*settingsDreamsLabel[\s\S]*settingsDreamsUnlimited/);

  const pricing = read('src/pricing/PricingPage.tsx');
  assert.match(pricing, /const isOwner = accountPlan\.status === 'owner'/);
  assert.match(pricing, /\{isOwner && \(\s*<p className="pr-subtitle" role="status">\s*\{t\('pricing\.ownerUnlimitedNotice'\)\}/);
  assert.match(pricing, /\{creditsRequired && !isOwner && \(/);
  assert.match(pricing, /\{!isOwner && \(\s*<div className="pr-grid">/);
});

test('the owner wording, in both languages', () => {
  assert.equal(he.archive.settingsAccountTypeLabel, 'סוג חשבון');
  assert.equal(he.archive.settingsOwnerValue, 'בעלת האפליקציה');
  assert.equal(he.archive.settingsDreamsLabel, 'חלומות');
  assert.equal(he.archive.settingsDreamsUnlimited, 'ללא הגבלה ∞');
  assert.equal(en.archive.settingsOwnerValue, 'App owner');
  assert.equal(en.archive.settingsDreamsUnlimited, 'Unlimited ∞');
  assert.match(he.pricing.ownerUnlimitedNotice, /גישה בלתי מוגבלת/);
  assert.match(en.pricing.ownerUnlimitedNotice, /unlimited access/i);
});

test('the owner is never reported with a zero balance (a tab still running a pre-owner version cannot send her to Pricing)', () => {
  const credits = code('server/routes/credits.ts');
  assert.match(credits, /balance: Math\.max\(\(await getCreditBalance\(verified\.userId\)\) \?\? 0, 1\), owner: true/);
  // the role is decided BEFORE any balance is read or reported
  assert.ok(credits.indexOf('isAppOwner(verified.userId)') < credits.indexOf('getCreditBalance(verified.userId)'));
});

test('an undetermined role is reported as such, and the UI never acts on a zero balance for it (enforcement stays server-side)', () => {
  const credits = code('server/routes/credits.ts');
  assert.match(credits, /if \(owner === null\) \{[\s\S]*owner_check_unavailable[\s\S]*roleUnknown: true/);
  assert.deepEqual(parseCreditSummary({ balance: 0, roleUnknown: true }), { balance: 0, plan: null, roleUnknown: true });
  assert.equal(parseCreditSummary({ balance: 0, roleUnknown: 'yes' })?.roleUnknown, undefined);
  assert.match(code('src/credits/credits.ts'), /summary && !summary\.owner && !summary\.roleUnknown \? summary\.balance : null/);
  // a definite regular account is unchanged: balance 0 is still a definite 0
  assert.deepEqual(parseCreditSummary({ balance: 0, purchasedPackage: 'go_deeper_3' }), { balance: 0, plan: 'go_deeper_3' });
});

test('the entry gate only ever acts on a finished server answer and only for a definite zero', () => {
  const app = code('src/App.tsx');
  assert.match(app, /fetchCreditBalance\(\)\.then\(\(balance\) => \{\s*if \(cancelled \|\| balance !== 0\) return;/);
});

test('payments, Grow, Make, prices and the recording/transcription path are untouched', () => {
  for (const file of ['server/payments/paymentComplete.ts', 'server/payments/orderStore.ts', 'server/payments/checkoutPackages.ts', 'api/payment-complete.ts']) {
    assert.ok(!/isAppOwner|app_owner/.test(read(file)), file);
  }
  const recorder = code('src/hero/dreamRecorderController.ts') + code('src/hero/HoldToRemember.tsx');
  assert.ok(!/isAppOwner|app_owner|owner:/i.test(recorder));
});
