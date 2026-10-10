import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { parseCreditSummary } from '../src/credits/creditSummary.ts';
import { balanceMessageKey, describeBalance } from '../src/credits/dreamBalance.ts';
import { summarizeGrants } from '../server/creditHistory.ts';
import { en, he } from '../src/i18n/translations.ts';

/**
 * The dream-balance display: every figure is the server's (the existing credits mechanism); the browser only chooses wording.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const lookup = (dict: unknown, path: string): string => path.split('.').reduce((n, k) => (n as Record<string, unknown>)[k], dict) as string;

// ---------------------------------------------------------------- the figures come from the ledger (real SQL)
let db: PGlite;
before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid());
    grant usage on schema public to anon, authenticated, service_role;
    create table public.dream_attempts (id uuid primary key default gen_random_uuid(), owner_id uuid, trial_id uuid, created_at timestamptz not null default now());
  `);
  await db.exec(read('supabase/migrations/20260924_credits_entitlement.sql'));
});
after(async () => {
  await db.close();
});

async function user(): Promise<string> {
  return (await db.query<{ id: string }>('insert into auth.users default values returning id')).rows[0].id;
}
async function ledgerView(owner: string) {
  const balance = (await db.query<{ b: number }>('select public.get_credit_balance($1) as b', [owner])).rows[0].b;
  const rows = (await db.query<{ delta: number }>("select delta from public.credit_ledger where owner_id = $1 and reason in ('purchase', 'backfill', 'admin')", [owner])).rows;
  return { balance, ...summarizeGrants(rows)! };
}

test('one purchase of 3, one dream used: 2 of 3 — from the real ledger', async () => {
  const u = await user();
  await db.query("select public.grant_credits($1, 3, 'purchase', 'grow:T1')", [u]);
  await db.query('select public.start_user_attempt($1)', [u]);
  const v = await ledgerView(u);
  assert.deepEqual(v, { balance: 2, grantedCredits: 3, grantCount: 1 });
  assert.deepEqual(describeBalance({ balance: v.balance, plan: 'go_deeper_3', grantedCredits: v.grantedCredits, grantCount: v.grantCount }), { kind: 'package', remaining: 2, total: 3 });
});

test('a refunded failed dream puts the credit back, and a refund is not a new purchase', async () => {
  const u = await user();
  await db.query("select public.grant_credits($1, 3, 'purchase', 'grow:T2')", [u]);
  const attempt = (await db.query<{ r: { attempt_id: string } }>('select public.start_user_attempt($1) as r', [u])).rows[0].r.attempt_id;
  assert.equal((await ledgerView(u)).balance, 2);
  await db.query('select public.cancel_user_attempt($1, $2)', [attempt, u]);
  assert.deepEqual(await ledgerView(u), { balance: 3, grantedCredits: 3, grantCount: 1 });
});

test('several purchases are counted as several, and shown as ONE overall figure — never as the rest of a single package', async () => {
  const u = await user();
  await db.query("select public.grant_credits($1, 3, 'purchase', 'grow:T3')", [u]);
  await db.query("select public.grant_credits($1, 10, 'purchase', 'grow:T4')", [u]);
  await db.query('select public.start_user_attempt($1)', [u]);
  const v = await ledgerView(u);
  assert.deepEqual(v, { balance: 12, grantedCredits: 13, grantCount: 2 });
  assert.deepEqual(describeBalance({ balance: v.balance, plan: 'explore_10', grantedCredits: v.grantedCredits, grantCount: v.grantCount }), { kind: 'across', remaining: 12, total: 13 });
});

test('a replayed payment notification does not inflate the totals', async () => {
  const u = await user();
  for (let i = 0; i < 3; i += 1) await db.query("select public.grant_credits($1, 3, 'purchase', 'grow:T5')", [u]);
  assert.deepEqual(await ledgerView(u), { balance: 3, grantedCredits: 3, grantCount: 1 });
});

test('a used-up package: zero left, with the purchase still on record', async () => {
  const u = await user();
  await db.query("select public.grant_credits($1, 1, 'purchase', 'grow:T6')", [u]);
  await db.query('select public.start_user_attempt($1)', [u]);
  const v = await ledgerView(u);
  assert.deepEqual(describeBalance({ balance: v.balance, plan: 'go_deeper_3', grantedCredits: v.grantedCredits, grantCount: v.grantCount }), { kind: 'none-purchased', remaining: 0, total: 1 });
});

// ---------------------------------------------------------------- how it is described
test('describeBalance: every kind of account', () => {
  assert.equal(describeBalance({ balance: 0, plan: null, owner: true }).kind, 'owner');
  assert.deepEqual(describeBalance({ balance: 2, plan: 'go_deeper_3', grantedCredits: 3, grantCount: 1 }), { kind: 'package', remaining: 2, total: 3 });
  assert.deepEqual(describeBalance({ balance: 3, plan: 'go_deeper_3', grantedCredits: 3, grantCount: 1 }), { kind: 'package', remaining: 3, total: 3 });
  assert.equal(describeBalance({ balance: 12, plan: 'explore_10', grantedCredits: 13, grantCount: 2 }).kind, 'across');
  assert.equal(describeBalance({ balance: 5, plan: 'go_deeper_3', grantedCredits: 3, grantCount: 1 }).kind, 'across', 'a balance larger than the single grant is not "of a package"');
  assert.equal(describeBalance({ balance: 0, plan: 'go_deeper_3', grantedCredits: 3, grantCount: 1 }).kind, 'none-purchased');
  assert.equal(describeBalance({ balance: 0, plan: 'first_dream', grantedCredits: 0, grantCount: 0, freeDreamUsed: true }).kind, 'free-used');
  assert.equal(describeBalance({ balance: 0, plan: 'first_dream', grantedCredits: 0, grantCount: 0, freeDreamUsed: false }).kind, 'free-none');
  assert.equal(describeBalance({ balance: 0, plan: 'first_dream' }).kind, 'free-none', 'unknown history never claims anything');
  assert.deepEqual(describeBalance({ balance: 4, plan: null }), { kind: 'across', remaining: 4, total: null }, 'history not available: only the balance, no total invented');
  assert.equal(describeBalance({ balance: -2, plan: null, grantedCredits: 3, grantCount: 1 }).remaining, 0, 'never a negative figure');
});

test('the wording: exact sentences in both languages, singular and plural, and the owner', () => {
  const say = (dict: unknown, view: Parameters<typeof balanceMessageKey>[0], variant: 'archive' | 'pricing' = 'archive') =>
    lookup(dict, balanceMessageKey(view, variant)!).replace('{remaining}', String(view.remaining)).replace('{total}', String(view.total ?? ''));
  const two = { kind: 'package' as const, remaining: 2, total: 3 };
  assert.equal(say(he, two), 'נותרו לך 2 מתוך 3 חלומות בחבילה');
  assert.equal(say(en, two), 'You have 2 of 3 dreams left in your package');
  assert.equal(say(he, { ...two, remaining: 1 }), 'נותר לך חלום אחד מתוך 3 חלומות בחבילה');
  assert.equal(say(en, { ...two, remaining: 1 }), 'You have 1 of 3 dreams left in your package');
  assert.equal(say(he, two, 'pricing'), 'החבילה שלך — נותרו 2 חלומות');
  assert.equal(say(en, two, 'pricing'), 'Your package — 2 dreams left');
  assert.equal(say(he, { ...two, remaining: 1 }, 'pricing'), 'החבילה שלך — נותר חלום אחד');
  assert.equal(say(he, { kind: 'across', remaining: 12, total: 13 }), 'נותרו לך 12 חלומות מכל החבילות שרכשת');
  assert.equal(say(en, { kind: 'across', remaining: 12, total: 13 }), 'You have 12 dreams left across your packages');
  assert.equal(say(he, { kind: 'none-purchased', remaining: 0, total: 3 }), 'לא נותרו חלומות בחבילה');
  assert.equal(say(he, { kind: 'owner', remaining: 0, total: null }), 'חלומות ללא הגבלה ∞');
  assert.equal(say(en, { kind: 'owner', remaining: 0, total: null }), 'Unlimited dreams ∞');
  assert.equal(he.archive.balanceFreeUsed, 'החלום החינמי שלך נוצל');
  for (const dict of [he, en]) for (const k of Object.keys(dict.archive).filter((x) => x.startsWith('balance'))) assert.ok(!/undefined|null|NaN/.test((dict.archive as Record<string, string>)[k]), k);
});

test('the summary parser keeps the new fields only when they are sound, and leaves existing summaries exactly as before', () => {
  assert.deepEqual(parseCreditSummary({ balance: 0, purchasedPackage: null }), { balance: 0, plan: 'first_dream' });
  assert.deepEqual(parseCreditSummary({ balance: 2, purchasedPackage: 'go_deeper_3', grantedCredits: 3, grantCount: 1, freeDreamUsed: true }), {
    balance: 2,
    plan: 'go_deeper_3',
    grantedCredits: 3,
    grantCount: 1,
    freeDreamUsed: true,
  });
  assert.equal(parseCreditSummary({ balance: 2, grantedCredits: 'x', grantCount: 1 })?.grantedCredits, undefined);
  assert.equal(parseCreditSummary({ balance: 2, grantedCredits: -1, grantCount: 1 })?.grantedCredits, undefined);
  assert.equal(parseCreditSummary({ balance: 2, grantedCredits: 3 })?.grantedCredits, undefined, 'a total without a count is not used');
  assert.equal(parseCreditSummary({ balance: 2, freeDreamUsed: 'yes' })?.freeDreamUsed, undefined);
});

test('summarizeGrants: only positive deltas of grants count, bad rows make it unknown', () => {
  assert.deepEqual(summarizeGrants([{ delta: 3 }, { delta: 10 }]), { grantedCredits: 13, grantCount: 2 });
  assert.deepEqual(summarizeGrants([]), { grantedCredits: 0, grantCount: 0 });
  assert.equal(summarizeGrants(null), null);
  assert.equal(summarizeGrants([{ delta: 'x' }]), null);
});

// ---------------------------------------------------------------- wiring
test('the server reads the figures from the existing ledger and trial record, read-only, and a failed read leaves the fields out', () => {
  const history = code('server/creditHistory.ts');
  assert.match(history, /from\('credit_ledger'\)\.select\('delta'\)\.eq\('owner_id', userId\)\.in\('reason', GRANT_REASONS\)/);
  assert.ok(!/\.(insert|update|delete|upsert|rpc)\(/.test(history), 'read-only');
  const route = code('server/routes/credits.ts');
  assert.match(route, /const history = await getCreditHistory\(verified\.userId\);\s*if \(history\) return okResult\(\{ balance,/);
  assert.match(route, /purchasedPackage === undefined \? \{ balance \} : \{ balance, purchasedPackage \}/, 'the previous answer is still given when the history cannot be read');
  assert.ok(!/grant_credits|complete_payment_order|start_user_attempt/.test(history + route));
});

test('the screens: archive heading, settings rows and packages screen show the server figure, loading and error states, no browser arithmetic', () => {
  const archive = read('src/archive/DreamArchive.tsx');
  assert.match(archive, /const dreamBalance = useDreamBalance\(user\?\.id\);/);
  assert.match(archive, /<DreamBalanceNote state=\{dreamBalance\.state\} retry=\{dreamBalance\.retry\} onGetPackage=\{onOpenPackages\} variant="archive" \/>/);
  assert.match(archive, /settingsDreamsPurchasedLabel/);
  assert.match(archive, /settingsDreamsRemainingLabel/);
  assert.match(read('src/App.tsx'), /onOpenPackages=\{\(\) => setView\('pricing'\)\}/);
  const pricing = read('src/pricing/PricingPage.tsx');
  assert.match(pricing, /<DreamBalanceNote state=\{dreamsLeft\.state\} retry=\{dreamsLeft\.retry\} variant="pricing" hideFree=\{creditsRequired\} \/>/);
  assert.match(pricing, /className="pr-card-ribbon"/, 'the ribbon is untouched');
  const note = code('src/credits/DreamBalanceNote.tsx');
  assert.match(note, /state\.status === 'loading'/);
  assert.match(note, /state\.status === 'error'/);
  assert.ok(!/[-+*/] ?(summary|view)\.(balance|remaining|total)|(balance|remaining|total) ?[-*/] /.test(note), 'no arithmetic on the figures in the browser');
  const hook = code('src/credits/useDreamBalance.ts');
  assert.match(hook, /fetchCreditSummary\(\)/);
  assert.match(hook, /visibilitychange/);
  // the loading state is never a zero: before the answer there is no figure at all
  assert.match(hook, /return \{ state: \{ status: 'loading' \}, retry \}/);
});

test('billing rules, purchase flow, prices, Owner and design are untouched', () => {
  for (const file of ['server/payments/paymentComplete.ts', 'server/payments/checkoutPackages.ts', 'api/payment-complete.ts', 'src/hero/dreamRecorderController.ts']) {
    assert.ok(!/creditHistory|DreamBalance/.test(read(file)), file);
  }
  assert.ok(!/is_app_owner|app_owners/.test(code('server/creditHistory.ts') + code('src/credits/dreamBalance.ts')));
});
