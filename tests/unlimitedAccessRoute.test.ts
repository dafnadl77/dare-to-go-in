import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { handleUnlimitedAccess, type AdminUnlimitedDeps } from '../server/routes/adminUnlimitedAccess.ts';
import { parseGrantOutcome, parseRevokeOutcome, parseListOutcome } from '../server/unlimitedAccess.ts';
import { parseCreditSummary } from '../src/credits/creditSummary.ts';
import { parseUnlimitedList } from '../src/credits/unlimitedAccessParse.ts';
import { en, he } from '../src/i18n/translations.ts';

/**
 * The administrator's unlimited-access area as the server exposes it: who is calling is the verified account behind the bearer token
 * and nothing else; a regular account, a granted account, a missing token and an undetermined role are all refused BEFORE anything is
 * read or written; an unregistered email is answered and nothing is created. The database re-checks the admin inside every function
 * (tests/unlimitedAccessSql.test.ts), so this layer is the first of two locks, not the only one.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const ADMIN = '7d55396c-3582-4aec-8470-d188fc029829';
const REGULAR = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';

interface Calls {
  grant: Array<[string, string]>;
  revoke: Array<[string, string]>;
  list: string[];
}

function makeDeps(opts: { who?: string | null; admins?: string[]; adminAnswer?: boolean | null } = {}): { deps: AdminUnlimitedDeps; calls: Calls } {
  const calls: Calls = { grant: [], revoke: [], list: [] };
  const admins = opts.admins ?? [ADMIN];
  const deps: AdminUnlimitedDeps = {
    verify: async (header: string) => {
      if (header === 'Bearer valid-admin') return { ok: true, userId: ADMIN } as never;
      if (header === 'Bearer valid-regular') return { ok: true, userId: REGULAR } as never;
      return { ok: false, status: 401, reason: 'invalid_token', message: 'Your session could not be verified.' } as never;
    },
    isAdmin: async (id) => (opts.adminAnswer !== undefined ? opts.adminAnswer : admins.includes(id)),
    grant: async (actor, email) => {
      calls.grant.push([actor, email]);
      if (email === 'friend@example.com') return { status: 'granted', userId: TARGET, email };
      if (email === 'again@example.com') return { status: 'already_granted', userId: TARGET, email };
      if (email === 'bad') return { status: 'invalid_email' };
      return { status: 'not_registered' };
    },
    revoke: async (actor, target) => {
      calls.revoke.push([actor, target]);
      return target === TARGET ? { status: 'revoked', userId: TARGET, email: 'friend@example.com' } : { status: 'not_found' };
    },
    list: async (actor) => {
      calls.list.push(actor);
      return { status: 'ok', items: [{ userId: TARGET, email: 'friend@example.com', grantedAt: '2026-10-14T10:00:00Z' }] };
    },
  };
  return { deps, calls };
}

const as = (token: string | undefined) => ({ authorization: token });

test('no token, a bad token and a regular account are refused before anything is read or written', async () => {
  const { deps, calls } = makeDeps();
  assert.equal((await handleUnlimitedAccess('GET', undefined, as(undefined), deps)).status, 401);
  assert.equal((await handleUnlimitedAccess('POST', { action: 'grant', email: 'friend@example.com' }, as('Bearer nope'), deps)).status, 401);
  const regularGrant = await handleUnlimitedAccess('POST', { action: 'grant', email: 'friend@example.com' }, as('Bearer valid-regular'), deps);
  assert.equal(regularGrant.status, 403);
  assert.equal((regularGrant.body as { reason: string }).reason, 'forbidden');
  assert.equal((await handleUnlimitedAccess('POST', { action: 'revoke', userId: TARGET }, as('Bearer valid-regular'), deps)).status, 403);
  assert.equal((await handleUnlimitedAccess('GET', undefined, as('Bearer valid-regular'), deps)).status, 403);
  assert.deepEqual(calls, { grant: [], revoke: [], list: [] }, 'nothing was even attempted');
});

test('an undetermined role is never the admin: the area answers 503 and does nothing', async () => {
  const { deps, calls } = makeDeps({ adminAnswer: null });
  for (const method of ['GET', 'POST'] as const) {
    assert.equal((await handleUnlimitedAccess(method, { action: 'grant', email: 'friend@example.com' }, as('Bearer valid-admin'), deps)).status, 503);
  }
  assert.deepEqual(calls, { grant: [], revoke: [], list: [] });
});

test('the admin lists, grants and revokes; the caller is always the verified account, never a body field', async () => {
  const { deps, calls } = makeDeps();
  const listed = await handleUnlimitedAccess('GET', undefined, as('Bearer valid-admin'), deps);
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body, { items: [{ userId: TARGET, email: 'friend@example.com', grantedAt: '2026-10-14T10:00:00Z' }] });
  // a body that tries to name another actor changes nothing: the actor is the token's account
  const granted = await handleUnlimitedAccess('POST', { action: 'grant', email: 'friend@example.com', actor: REGULAR, userId: REGULAR, admin: true }, as('Bearer valid-admin'), deps);
  assert.equal(granted.status, 200);
  assert.deepEqual(granted.body, { status: 'granted', item: { userId: TARGET, email: 'friend@example.com' } });
  assert.deepEqual(calls.grant, [[ADMIN, 'friend@example.com']]);
  assert.equal((await handleUnlimitedAccess('POST', { action: 'grant', email: 'again@example.com' }, as('Bearer valid-admin'), deps)).status, 200);
  const revoked = await handleUnlimitedAccess('POST', { action: 'revoke', userId: TARGET }, as('Bearer valid-admin'), deps);
  assert.equal(revoked.status, 200);
  assert.deepEqual(calls.revoke, [[ADMIN, TARGET]]);
  assert.equal((await handleUnlimitedAccess('POST', { action: 'revoke', userId: '33333333-3333-4333-8333-333333333333' }, as('Bearer valid-admin'), deps)).status, 404);
});

test('an email that is not registered is answered clearly and creates nothing; bad input is rejected', async () => {
  const { deps, calls } = makeDeps();
  const missing = await handleUnlimitedAccess('POST', { action: 'grant', email: 'nobody@example.com' }, as('Bearer valid-admin'), deps);
  assert.equal(missing.status, 404);
  assert.equal((missing.body as { reason: string }).reason, 'not_registered');
  assert.match((missing.body as { message: string }).message, /No account was created/);
  assert.equal((await handleUnlimitedAccess('POST', { action: 'grant', email: 'bad' }, as('Bearer valid-admin'), deps)).status, 400);
  assert.equal((await handleUnlimitedAccess('POST', { action: 'grant', email: 42 }, as('Bearer valid-admin'), deps)).status, 400);
  assert.equal((await handleUnlimitedAccess('POST', { action: 'grant', email: 'x'.repeat(300) + '@example.com' }, as('Bearer valid-admin'), deps)).status, 400);
  assert.equal((await handleUnlimitedAccess('POST', { action: 'revoke', userId: 'not-a-uuid' }, as('Bearer valid-admin'), deps)).status, 400);
  assert.equal((await handleUnlimitedAccess('POST', { action: 'nonsense' }, as('Bearer valid-admin'), deps)).status, 400);
  assert.equal((await handleUnlimitedAccess('POST', null, as('Bearer valid-admin'), deps)).status, 400);
  assert.equal((await handleUnlimitedAccess('DELETE', undefined, as('Bearer valid-admin'), deps)).status, 405);
  assert.equal(calls.revoke.length, 0);
});

test('the database answers are parsed strictly; anything unrecognized fails closed', () => {
  assert.deepEqual(parseGrantOutcome({ status: 'granted', user_id: TARGET, email: 'a@b.co' }), { status: 'granted', userId: TARGET, email: 'a@b.co' });
  assert.deepEqual(parseGrantOutcome({ status: 'not_registered' }), { status: 'not_registered' });
  for (const bad of [null, undefined, 'granted', 5, {}, { status: 'granted' }, { status: 'granted', user_id: 1, email: 'x' }, { status: 'weird' }]) {
    assert.equal(parseGrantOutcome(bad), null);
    assert.equal(parseRevokeOutcome(bad), null);
    assert.equal(parseListOutcome(bad), null);
  }
  assert.deepEqual(parseRevokeOutcome({ status: 'not_found' }), { status: 'not_found' });
  assert.deepEqual(parseListOutcome({ status: 'ok', items: [] }), { status: 'ok', items: [] });
  assert.equal(parseListOutcome({ status: 'ok', items: [{ user_id: TARGET }] }), null);
  assert.deepEqual(parseListOutcome({ status: 'not_authorized' }), { status: 'not_authorized' });
});

test('the credits answer marks the administrator, and only an owner that is also the admin', () => {
  assert.deepEqual(parseCreditSummary({ balance: 1, purchasedPackage: null, owner: true, admin: true }), { balance: 1, plan: 'first_dream', owner: true, admin: true });
  assert.deepEqual(parseCreditSummary({ balance: 1, purchasedPackage: null, owner: true }), { balance: 1, plan: 'first_dream', owner: true }, 'a granted account is an owner, not an admin');
  assert.equal(parseCreditSummary({ balance: 2, purchasedPackage: null, admin: true })?.owner, undefined, 'admin alone means nothing');
  assert.equal((parseCreditSummary({ balance: 2, purchasedPackage: null, admin: true }) as { admin?: true }).admin, undefined);
  assert.deepEqual(parseUnlimitedList({ items: [{ userId: TARGET, email: 'a@b.co', grantedAt: '2026-10-14T10:00:00Z' }] }), [{ userId: TARGET, email: 'a@b.co', grantedAt: '2026-10-14T10:00:00Z' }]);
  assert.equal(parseUnlimitedList({ items: [{ userId: TARGET }] }), null);
  assert.equal(parseUnlimitedList(null), null);
});

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(new URL(`../${dir}`, import.meta.url))) {
    const rel = `${dir}/${name}`;
    if (statSync(new URL(`../${rel}`, import.meta.url)).isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

test('wiring: it rides on the credits function (no new function), is checked first, and the browser never decides who is admin', () => {
  assert.equal(readdirSync(new URL('../api', import.meta.url)).filter((f) => f.endsWith('.ts')).length, 12, 'the project stays at its 12-function limit');
  const api = code('api/credits.ts');
  assert.match(api, /if \(req\.query\.admin === 'unlimited'\) \{\s*const result = await handleUnlimitedAccess\(req\.method, req\.body, headers\);/);
  assert.ok(api.indexOf("req.query.admin === 'unlimited'") < api.indexOf('handleStartCheckout(req.body'), 'the admin branch is checked before checkout');
  const route = code('server/routes/adminUnlimitedAccess.ts');
  assert.ok(route.indexOf('deps.isAdmin(verified.userId)') < route.indexOf('deps.grant('), 'the admin check precedes the grant');
  assert.ok(route.indexOf('deps.isAdmin(verified.userId)') < route.indexOf('deps.revoke('), 'and the revoke');
  assert.ok(!/body\.(actor|admin|role|userId\b.*verified)|headers\.(x-|admin)/i.test(route.replace(/input\.userId/g, '')), 'the actor never comes from the request');
  // the credits answer sends admin only after the owner role was established from the verified account
  assert.match(code('server/routes/credits.ts'), /const admin = await isDreamAdmin\(verified\.userId\);\s*return okResult\(\{[^}]*owner: true, \.\.\.\(admin === true \? \{ admin: true \} : \{\}\) \}\);/);
  for (const file of ['src/credits/unlimitedAccessApi.ts', 'src/archive/UnlimitedAccessPanel.tsx', 'src/credits/creditSummary.ts', 'src/credits/useAccountPlan.ts']) {
    assert.ok(!/localStorage|sessionStorage|dafnadl77|@gmail|SUPABASE|service_role/.test(code(file)), `${file}: no email, flag or key decides the role in the browser`);
  }
  // the panel is mounted only for the verified administrator
  assert.match(code('src/archive/DreamArchive.tsx'), /accountPlan\.status === 'owner' && accountPlan\.admin && <UnlimitedAccessPanel \/>/);
  // the role tables are touched by nothing outside the database
  for (const file of [...sourceFiles('server'), ...sourceFiles('api'), ...sourceFiles('src')]) {
    assert.ok(!/unlimited_dream_access|unlimited_access_audit/.test(code(file)), `${file} must not touch the tables directly`);
  }
});

test('the area is named "גישה ללא הגבלה" / "Unlimited access", in both languages, with every message present', () => {
  assert.equal(he.archive.unlimitedTitle, 'גישה ללא הגבלה');
  assert.equal(en.archive.unlimitedTitle, 'Unlimited access');
  for (const key of Object.keys(en.archive).filter((k) => k.startsWith('unlimited'))) {
    assert.ok((he.archive as Record<string, string>)[key]?.length > 0, `he.archive.${key}`);
    assert.ok((en.archive as Record<string, string>)[key]?.length > 0, `en.archive.${key}`);
  }
  assert.match(he.archive.unlimitedRevoke, /ביטול הרשאה/);
  assert.match(he.archive.unlimitedNotRegistered, /לא נוצר חשבון/);
  assert.match(he.archive.balanceOwner, /חלומות ללא הגבלה/, 'a granted account sees "unlimited dreams" in place of the balance');
});
