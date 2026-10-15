import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { handleAdminPaidOrders, type AdminPaidOrdersDeps } from '../server/routes/adminPaidOrders.ts';
import { parsePaidOrders } from '../server/paidOrders.ts';
import { parsePaidOrdersResponse } from '../src/credits/paidOrdersParse.ts';
import { buildTransactionDocument, orderReference, transactionDocumentMailto, type DocumentOrder } from '../src/payments/transactionDocument.ts';
import { BUSINESS } from '../src/legal/businessDetails.ts';

/**
 * The manual delivery of the transaction-details document: the administrator's list of completed purchases (real PostgreSQL via PGlite for
 * the SQL, injected collaborators for the route), and the document builder. The list is admin-only, read-only, shows only paid and credited
 * orders, identifies the account's email, and holds no customer name or phone (those exist only at Grow).
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const sql = (name: string) => read(`supabase/migrations/${name}`);

const ADMIN_ID = '7d55396c-3582-4aec-8470-d188fc029829';

let db: PGlite;
before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz, created_at timestamptz not null default now());
    grant usage on schema public to anon, authenticated, service_role;
    create table public.dream_attempts (id uuid primary key default gen_random_uuid(), owner_id uuid references auth.users (id) on delete cascade, trial_id uuid,
      image_count integer not null default 0, reflection_count integer not null default 0, label_count integer not null default 0, created_at timestamptz not null default now(), saved_dream_id uuid, completed_at timestamptz);
  `);
  await db.query('insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())', [ADMIN_ID, 'dafnadl77@gmail.com']);
  await db.exec(sql('20260924_credits_entitlement.sql'));
  await db.exec(`
    alter table public.credit_ledger alter column owner_id drop not null;
    alter table public.credit_ledger drop constraint if exists credit_ledger_owner_id_fkey;
    alter table public.credit_ledger add constraint credit_ledger_owner_id_fkey foreign key (owner_id) references auth.users (id) on delete set null;
  `);
  await db.exec(sql('20260925_idempotent_analysis.sql'));
  await db.exec(sql('20261007_payment_orders.sql'));
  await db.exec(sql('20261009_app_owner.sql'));
  await db.exec(sql('20261009_app_owner_cap_saturation.sql'));
  await db.exec(sql('20261014_unlimited_access.sql'));
  await db.exec(sql('20261016_admin_paid_orders.sql'));
});
after(async () => {
  await db.close();
});

let n = 0;
async function newUser(email?: string): Promise<{ id: string; email: string }> {
  n += 1;
  const e = email ?? `buyer${n}@example.com`;
  const r = await db.query<{ id: string }>('insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id', [e]);
  return { id: r.rows[0].id, email: e };
}
async function paidOrder(owner: string, pkg: 'go_deeper_3' | 'explore_10' | 'dive_in_25', tx: string): Promise<string> {
  const p = { go_deeper_3: [59, 3], explore_10: [149, 10], dive_in_25: [279, 25] }[pkg];
  const created = await db.query<{ r: { order_id: string } }>('select public.create_payment_order($1, $2, $3, $4) as r', [owner, pkg, p[0], p[1]]);
  const id = created.rows[0].r.order_id;
  await db.query("select public.complete_payment_order($1, $2, $3, 'ILS', 'PAID')", [id, tx, p[0]]);
  return id;
}
const list = async (actor: string | null, limit?: number) =>
  (await db.query<{ r: { status: string; items?: Array<Record<string, unknown>> } }>('select public.admin_list_paid_orders($1, $2) as r', [actor, limit ?? 50])).rows[0].r;

test('the admin sees each paid and credited order with the reference, package, credits, amount, date and the account email', async () => {
  const a = await newUser('first.buyer@example.com');
  const o1 = await paidOrder(a.id, 'go_deeper_3', 'tx-sql-1');
  const o2 = await paidOrder(a.id, 'dive_in_25', 'tx-sql-2');
  const r = await list(ADMIN_ID);
  assert.equal(r.status, 'ok');
  const mine = r.items!.filter((i) => i.account_email === 'first.buyer@example.com');
  assert.equal(mine.length, 2);
  const byId = new Map(mine.map((i) => [i.order_id as string, i]));
  assert.deepEqual(
    { pkg: byId.get(o1)!.package_id, credits: byId.get(o1)!.credits, amount: byId.get(o1)!.amount_ils },
    { pkg: 'go_deeper_3', credits: 3, amount: 59 },
  );
  assert.deepEqual(
    { pkg: byId.get(o2)!.package_id, credits: byId.get(o2)!.credits, amount: byId.get(o2)!.amount_ils },
    { pkg: 'dive_in_25', credits: 25, amount: 279 },
  );
  assert.ok(!Number.isNaN(Date.parse(String(byId.get(o1)!.paid_at))));
});

test('unpaid orders never appear, and the list carries no customer name or phone (those are not in this database)', async () => {
  const b = await newUser();
  const created = await db.query<{ r: { order_id: string } }>("select public.create_payment_order($1, 'explore_10', 149, 10) as r", [b.id]);
  const unpaid = created.rows[0].r.order_id;
  const r = await list(ADMIN_ID);
  assert.ok(!r.items!.some((i) => i.order_id === unpaid), 'an order that was only created is not listed');
  for (const item of r.items!) assert.deepEqual(Object.keys(item).sort(), ['account_email', 'amount_ils', 'credits', 'order_id', 'package_id', 'paid_at']);
  const cols = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'payment_orders'")).rows.map((c) => c.column_name);
  assert.ok(!cols.some((c) => /name|phone|email|address/i.test(c)), 'payment_orders holds no personal contact data');
});

test('only the admin can read it: a regular account, a granted-unlimited account, a stranger and null are refused with no data', async () => {
  const buyer = await newUser();
  await paidOrder(buyer.id, 'explore_10', 'tx-sql-3');
  await db.query('select public.admin_grant_unlimited($1, $2)', [ADMIN_ID, buyer.email]);
  for (const actor of [buyer.id, (await newUser()).id, '00000000-0000-0000-0000-000000000000', null]) {
    const r = await list(actor);
    assert.equal(r.status, 'not_authorized');
    assert.equal(r.items, undefined);
  }
});

test('a deleted account has no email in the list (the order is kept without a link); the limit is clamped; the function belongs to the service role only', async () => {
  const gone = await newUser();
  const o = await paidOrder(gone.id, 'go_deeper_3', 'tx-sql-4');
  await db.query('delete from auth.users where id = $1', [gone.id]);
  const row = (await list(ADMIN_ID)).items!.find((i) => i.order_id === o);
  assert.ok(row, 'the paid order is still there');
  assert.equal(row.account_email, null);
  assert.ok((await list(ADMIN_ID, 1)).items!.length <= 1);
  assert.ok((await list(ADMIN_ID, 100000)).items!.length <= 200);
  for (const role of ['anon', 'authenticated']) {
    const p = await db.query<{ ok: boolean }>("select has_function_privilege($1, 'public.admin_list_paid_orders(uuid, integer)', 'execute') as ok", [role]);
    assert.equal(p.rows[0].ok, false, role);
  }
  const sr = await db.query<{ ok: boolean }>("select has_function_privilege('service_role', 'public.admin_list_paid_orders(uuid, integer)', 'execute') as ok");
  assert.equal(sr.rows[0].ok, true);
  assert.doesNotMatch(sql('20261016_admin_paid_orders.sql').replace(/--.*$/gm, ''), /\b(insert|update|delete|truncate|drop)\b/i, 'it only reads');
});

// ------------------------------------------------------------------------------- route ----

const ADMIN = '7d55396c-3582-4aec-8470-d188fc029829';
const REGULAR = '11111111-1111-4111-8111-111111111111';
const ORDER = 'abcdef0123456789abcdef0123456789';
function deps(adminAnswer: boolean | null, called: string[] = []): AdminPaidOrdersDeps {
  return {
    verify: (async (h: string) => (h === 'Bearer admin' ? { ok: true, userId: ADMIN } : h === 'Bearer regular' ? { ok: true, userId: REGULAR } : { ok: false, status: 401, reason: 'invalid_token', message: 'Your session could not be verified.' })) as never,
    isAdmin: async (id) => (adminAnswer === null ? null : adminAnswer && id === ADMIN),
    list: async (actor) => {
      called.push(actor);
      return { status: 'ok', items: [{ orderId: ORDER, accountEmail: 'buyer@example.com', packageId: 'explore_10', credits: 10, amountIls: 149, paidAt: '2026-10-15T09:00:00Z' }] };
    },
  };
}

test('route: no token, a bad token, a regular account and an undetermined role are refused before anything is read; the admin gets the list', async () => {
  const called: string[] = [];
  assert.equal((await handleAdminPaidOrders('GET', {}, deps(true, called))).status, 401);
  assert.equal((await handleAdminPaidOrders('GET', { authorization: 'Bearer nope' }, deps(true, called))).status, 401);
  assert.equal((await handleAdminPaidOrders('GET', { authorization: 'Bearer regular' }, deps(true, called))).status, 403);
  assert.equal((await handleAdminPaidOrders('GET', { authorization: 'Bearer admin' }, deps(null, called))).status, 503);
  assert.equal((await handleAdminPaidOrders('POST', { authorization: 'Bearer admin' }, deps(true, called))).status, 405);
  assert.deepEqual(called, [], 'nothing was read');
  const ok = await handleAdminPaidOrders('GET', { authorization: 'Bearer admin' }, deps(true, called));
  assert.equal(ok.status, 200);
  assert.deepEqual(called, [ADMIN], 'the actor is the verified account');
  assert.deepEqual(Object.keys((ok.body as { items: Array<Record<string, unknown>> }).items[0]).sort(), ['accountEmail', 'amountIls', 'credits', 'orderId', 'packageId', 'paidAt']);
});

test('parsing is strict on both sides: anything unexpected is "could not be read", never a guess', () => {
  const good = { status: 'ok', items: [{ order_id: ORDER, account_email: null, package_id: 'go_deeper_3', credits: 3, amount_ils: 59, paid_at: null }] };
  assert.deepEqual(parsePaidOrders(good), { status: 'ok', items: [{ orderId: ORDER, accountEmail: null, packageId: 'go_deeper_3', credits: 3, amountIls: 59, paidAt: null }] });
  assert.deepEqual(parsePaidOrders({ status: 'not_authorized' }), { status: 'not_authorized' });
  for (const bad of [null, 'x', {}, { status: 'ok' }, { status: 'ok', items: [{ order_id: 'not hex!', account_email: null, package_id: 'go_deeper_3', credits: 3, amount_ils: 59, paid_at: null }] }, { status: 'ok', items: [{ ...good.items[0], package_id: 'first_dream' }] }, { status: 'ok', items: [{ ...good.items[0], credits: '3' }] }]) {
    assert.equal(parsePaidOrders(bad), null);
  }
  assert.equal(parsePaidOrdersResponse({ items: [{ orderId: ORDER, accountEmail: 'a@b.co', packageId: 'explore_10', credits: 10, amountIls: 149, paidAt: null }] })?.length, 1);
  assert.equal(parsePaidOrdersResponse({ items: [{ orderId: 'zz', accountEmail: null, packageId: 'explore_10', credits: 10, amountIls: 149, paidAt: null }] }), null);
  assert.equal(parsePaidOrdersResponse(null), null);
});

// ------------------------------------------------------------------------------ document ----

const order: DocumentOrder = { orderId: ORDER, accountEmail: 'buyer@example.com', packageId: 'explore_10', credits: 10, amountIls: 149, paidAt: '2026-10-15T09:00:00Z' };

test('the document has the seller, what was bought, the price incl. VAT, delivery to the account email, the offer validity and how to cancel; no customer name or phone', () => {
  for (const lang of ['he', 'en'] as const) {
    const { subject, body } = buildTransactionDocument(order, lang);
    const all = `${subject}\n${body}`;
    assert.ok(all.includes(orderReference(ORDER)) && orderReference(ORDER) === 'ABCDEF01');
    for (const needle of [BUSINESS.brand, BUSINESS.dealerNumber, BUSINESS.email, 'buyer@example.com', '149', '10', 'Grow']) assert.ok(all.includes(needle), `${lang}: ${needle}`);
    assert.match(all, lang === 'he' ? /כולל מע"מ/ : /including VAT/);
    assert.match(all, lang === 'he' ? /אין מנוי ואין חיוב חוזר/ : /No subscription and no recurring charge/);
    assert.match(all, lang === 'he' ? /אינם פגי תוקף/ : /do not expire/);
    assert.match(all, lang === 'he' ? /חוק הגנת הצרכן/ : /Consumer Protection Law/);
    assert.match(all, lang === 'he' ? /המחיר הנקוב היה תקף ליום הרכישה/ : /the stated price applied on the day of purchase/);
    assert.ok(!/phone|טלפון|full name|שם מלא/i.test(body.replace(/Warranty[^\n]*/g, '')), `${lang}: no personal contact fields in the body`);
  }
});

test('the address stays an open item: the business details quote the city only, no invented address, and the open status is recorded in code', () => {
  assert.equal(BUSINESS.fullAddress, null);
  assert.equal(BUSINESS.addressStatus, 'open');
  assert.equal(BUSINESS.locationHe, 'קריית אונו, ישראל');
  const text = buildTransactionDocument(order, 'he').body;
  assert.ok(text.includes('קריית אונו, ישראל'));
  assert.ok(!/רחוב|רח'|street/i.test(text));
});

test('mailto: addressed to the account email with subject and body; none for a deleted account or an unsafe address', () => {
  const m = transactionDocumentMailto(order, 'he')!;
  assert.ok(m.startsWith('mailto:buyer@example.com?subject='));
  assert.ok(decodeURIComponent(m).includes('ABCDEF01'));
  assert.equal(transactionDocumentMailto({ ...order, accountEmail: null }, 'he'), null);
  assert.equal(transactionDocumentMailto({ ...order, accountEmail: 'a@b.co\r\nbcc:x@y.z' }, 'en'), null);
  assert.ok(buildTransactionDocument({ ...order, accountEmail: null }, 'en').body.includes('[account deleted]'));
});

test('wiring: it rides on the credits function, is checked before checkout, adds no function, and only the administrator sees the panel', () => {
  const api = read('api/credits.ts').replace(/\/\/.*$/gm, '');
  assert.ok(api.indexOf("req.query.admin === 'orders'") > -1 && api.indexOf("req.query.admin === 'orders'") < api.indexOf('handleStartCheckout(req.body'));
  assert.match(api, /handleAdminPaidOrders\(req\.method, headers\)/);
  assert.equal(readdirSync(new URL('../api', import.meta.url)).filter((x) => x.endsWith('.ts')).length, 12, 'the project stays at its 12-function limit');
  assert.match(read('src/archive/DreamArchive.tsx'), /accountPlan\.status === 'owner' && accountPlan\.admin && <TransactionDocumentsPanel \/>/);
  assert.match(read('server/routes/adminPaidOrders.ts'), /const admin = await deps\.isAdmin\(verified\.userId\);[\s\S]*const result = await deps\.list\(verified\.userId\)/);
});

test('the rollback removes the function and nothing else; the migration can be applied again afterwards', async () => {
  const before = await db.query<{ n: number }>('select count(*)::int as n from public.payment_orders');
  await db.exec(sql('../rollbacks/20261016_admin_paid_orders_rollback.sql'));
  const gone = await db.query<{ n: number }>("select count(*)::int as n from pg_proc where proname = 'admin_list_paid_orders'");
  assert.equal(gone.rows[0].n, 0);
  const after = await db.query<{ n: number }>('select count(*)::int as n from public.payment_orders');
  assert.equal(after.rows[0].n, before.rows[0].n, 'no order was touched');
  const alive = await db.query<{ n: number }>("select count(*)::int as n from pg_proc where proname = 'is_dream_admin'");
  assert.equal(alive.rows[0].n, 1, 'the unlimited-access functions are untouched');
  await db.exec(sql('20261016_admin_paid_orders.sql'));
  assert.equal((await list(ADMIN_ID)).status, 'ok');
});
