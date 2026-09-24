import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { decideUserAttempt, decideTrialAttempt, CREDITS_REQUIRED_MESSAGE } from '../server/trialAllowance.ts';

/**
 * Credit entitlement for signed-in accounts. The authoritative enforcement is atomic SQL
 * (supabase/migrations/20260924_credits_entitlement.sql), exercised directly against the
 * database in a rolled-back scenario run (zero balance, grant + replay, spend, refund exactly
 * once, wrong-owner cancel, legacy attempt, privileges). These tests cover the application
 * layer: how the database's answer is mapped, and the wiring that guarantees where each check
 * runs and that nothing client-side can set, spend or refund a credit.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const migration = read('supabase/migrations/20260924_credits_entitlement.sql');

// ------------------------------------------------------- decision mapping ----

test('a created attempt is accepted and carries its id', () => {
  assert.deepEqual(decideUserAttempt({ status: 'created', attempt_id: 'abc' }), { ok: true, attemptId: 'abc' });
});

test('a zero balance maps to the stable machine-readable reason credits_required', () => {
  assert.deepEqual(decideUserAttempt({ status: 'credits_required' }), { ok: false, reason: 'credits_required' });
  assert.match(CREDITS_REQUIRED_MESSAGE, /credit/i);
});

test('anything unrecognized, malformed or missing fails closed (never creates an attempt)', () => {
  for (const bad of [null, undefined, 'created', 42, {}, { status: 'created' }, { status: 'created', attempt_id: 7 }, { status: 'weird' }]) {
    assert.deepEqual(decideUserAttempt(bad), { ok: false, reason: 'not_configured' });
  }
});

test('the anonymous trial decision is unchanged and independent of credits', () => {
  assert.deepEqual(decideTrialAttempt({ status: 'consumed' }), { ok: false, reason: 'free_dream_used' });
  assert.deepEqual(decideTrialAttempt({ status: 'created', attempt_id: 'x' }), { ok: true, attemptId: 'x' });
  assert.deepEqual(decideTrialAttempt({ status: 'credits_required' }), { ok: false, reason: 'not_configured' });
});

// ------------------------------------------------------ server enforcement ----

const attempts = read('server/dreamAttempts.ts');

test('a signed-in attempt can ONLY be created through the atomic spend; the plain-insert helper is gone', () => {
  const create = attempts.slice(attempts.indexOf('export async function createAttemptForIdentity'), attempts.indexOf('/** For a trial'));
  assert.match(create, /identity\.kind === 'user'[\s\S]*rpc\('start_user_attempt', \{ p_owner: identity\.userId \}\)/);
  assert.ok(!attempts.includes('createDreamAttempt'));
  assert.ok(!/from\('dream_attempts'\)\s*\.insert/.test(attempts));
  // the trial path still goes through create_trial_attempt
  assert.match(create, /rpc\('create_trial_attempt'/);
});

test('the analysis route refuses at zero credits BEFORE any model call, with 402 credits_required', () => {
  const route = read('server/routes/dreamAnalysis.ts');
  assert.ok(route.indexOf('createAttemptForIdentity(') < route.indexOf('client.responses.create'));
  assert.match(route, /created\.reason === 'credits_required'[\s\S]{0,120}errorResult\(402, 'credits_required', CREDITS_REQUIRED_MESSAGE\)/);
});

test('a genuinely failed analysis releases the attempt through the server-side refund, on both failure paths', () => {
  const route = read('server/routes/dreamAnalysis.ts');
  assert.equal((route.match(/await abandonAttempt\(resolved\.identity, attemptId\)/g) ?? []).length, 2);
  assert.ok(!route.includes('deleteDreamAttempt'));
  // signed-in: refund via cancel_user_attempt (idempotent in SQL); anonymous: delete
  assert.match(attempts, /rpc\('cancel_user_attempt', \{ p_attempt: attemptId, p_owner: identity\.userId \}\)/);
  assert.match(attempts, /identity\.kind === 'trial'\) return deleteDreamAttempt\(attemptId\)/);
});

test('element labels now require an attempt the caller OWNS for signed-in accounts too (no free AI at zero credits)', () => {
  const route = read('server/routes/dreamElementLabels.ts');
  const gate = route.slice(route.indexOf("const attemptId = typeof body.attemptId"), route.indexOf('const input ='));
  assert.match(gate, /if \(!attemptId\) \{[\s\S]*400/);
  assert.ok(!/if \(resolved\.identity\.kind === 'trial'\) \{\s*if \(!attemptId\)/.test(gate), 'attemptId is not trial-only any more');
  assert.match(gate, /await reserveLabelsAttempt\(attemptId, resolved\.identity\)/);
  // the reservation sits outside the trial-only branch
  assert.ok(gate.indexOf('reserveLabelsAttempt') > gate.indexOf("getTrialAttemptState(attemptId, resolved.identity.trialId)"));
  assert.match(gate, /\}\n  \}\n  const reservation = await reserveLabelsAttempt/);
});

test('transcription: a signed-in account with no credit is refused (read-only balance check, fail closed when unknown)', () => {
  const route = read('server/routes/dreamTranscription.ts');
  const gate = route.slice(route.indexOf("resolved.identity.kind === 'user'"), route.indexOf('let reservedTranscription'));
  assert.match(gate, /getCreditBalance\(resolved\.identity\.userId\)/);
  assert.match(gate, /balance === null[\s\S]*503/);
  assert.match(gate, /balance < 1[\s\S]*402, 'credits_required'/);
  // it is a read, never a spend
  assert.ok(!/start_user_attempt|cancel_user_attempt|grant_credits/.test(route));
  // and it runs before any OpenAI call
  assert.ok(route.indexOf("kind === 'user'") < route.indexOf('client.audio'));
});

test('image and reflection stay attempt-bound and unchanged (the attempt already carries the spent credit)', () => {
  assert.ok(read('server/routes/dreamImage.ts').includes('reserveImageAttempt('));
  assert.ok(read('server/routes/dreamReflection.ts').includes('reserveReflectionAttempt('));
  assert.ok(!/credit/i.test(read('server/routes/dreamImage.ts').replace(/billing\|quota\|credit/g, '')));
});

test('GET /api/credits: verified bearer only, returns only the token holder\'s own balance, read-only', () => {
  const route = read('server/routes/credits.ts');
  assert.match(route, /if \(!authHeader\)[\s\S]*401/);
  assert.match(route, /verifyBearerToken\(authHeader\)/);
  assert.match(route, /getCreditBalance\(verified\.userId\)/);
  assert.ok(!/body|req\.|rawBody|spend|grant|cancel|start_user_attempt/.test(route.replace(/\/\*[\s\S]*?\*\//g, '')));
  const api = read('api/credits.ts');
  assert.match(api, /req\.method !== 'GET'[\s\S]*405/);
  assert.match(api, /no-store/);
  assert.ok(read('server/index.ts').includes("app.get('/api/credits'"));
});

test('no client code can read or write credit tables, spend, refund or grant', () => {
  const walk = (dir: string): string[] =>
    readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
    );
  for (const f of walk('src').filter((p) => /\.(ts|tsx)$/.test(p))) {
    const src = read(f);
    assert.ok(!/dream_credits|credit_ledger|grant_credits|start_user_attempt|cancel_user_attempt|get_credit_balance/.test(src), f);
  }
  // the only client credit code is the read-only balance fetch
  const client = read('src/credits/credits.ts');
  assert.match(client, /fetch\('\/api\/credits', \{ headers: authHeader/);
  assert.ok(!/method:\s*'(POST|PUT|PATCH|DELETE)'/.test(client));
});

test('server code that can add credits exists only as the service-only SQL function (no HTTP route grants them; Grow is not implemented)', () => {
  for (const f of readdirSync(new URL('../server/routes', import.meta.url))) {
    assert.ok(!/grant_credits/.test(read(`server/routes/${f}`)), f);
  }
  assert.ok(!/grant_credits/.test(attempts));
  assert.deepEqual(readdirSync(new URL('../api', import.meta.url)).filter((f) => /grow|webhook|payment/i.test(f)), []);
});

// ---------------------------------------------------------- the migration ----

test('migration: RLS on, no policies, no anon/authenticated privileges, service_role-only functions', () => {
  assert.match(migration, /alter table public\.dream_credits enable row level security/);
  assert.match(migration, /alter table public\.credit_ledger enable row level security/);
  assert.ok(!/create policy/i.test(migration));
  assert.match(migration, /revoke all on public\.dream_credits from public, anon, authenticated/);
  assert.match(migration, /revoke all on public\.credit_ledger from public, anon, authenticated/);
  for (const fn of ['start_user_attempt(uuid)', 'cancel_user_attempt(uuid, uuid)', 'grant_credits(uuid, integer, text, text)', 'get_credit_balance(uuid)']) {
    assert.ok(migration.includes(`revoke all on function public.${fn} from public, anon, authenticated`), fn);
    assert.ok(migration.includes(`grant execute on function public.${fn} to service_role`), fn);
  }
  assert.equal((migration.match(/security definer/g) ?? []).length, 4);
  assert.equal((migration.match(/set search_path = public/g) ?? []).length, 4);
});

test('migration: the balance cannot go negative, a spend is one atomic conditional UPDATE, and the ledger is idempotent', () => {
  assert.match(migration, /balance\s+integer not null default 0 check \(balance >= 0\)/);
  assert.match(migration, /update public\.dream_credits\s+set balance = balance - 1[\s\S]*where owner_id = p_owner and balance >= 1/);
  assert.match(migration, /credit_ledger \(reason, external_ref\) where external_ref is not null/);
  assert.match(migration, /credit_ledger \(attempt_id\) where reason = 'spend'/);
  assert.match(migration, /credit_ledger \(attempt_id\) where reason = 'refund'/);
});

test('migration: a refund happens once, only for a recorded spend by the same owner; a purchase needs the provider ref', () => {
  const cancel = migration.slice(migration.indexOf('function public.cancel_user_attempt'), migration.indexOf('function public.grant_credits'));
  assert.match(cancel, /s\.reason = 'spend' and s\.owner_id = p_owner/);
  assert.match(cancel, /on conflict do nothing/);
  assert.match(cancel, /if v_inserted = 1 then/);
  assert.match(migration, /p_reason = 'purchase' and coalesce\(p_external_ref, ''\) = ''/);
});

test('migration is purely additive: no existing table or function is altered, dropped or replaced', () => {
  assert.ok(!/drop (table|function)/i.test(migration));
  assert.ok(!/alter table public\.(dream_attempts|trial_identities|dreams)/i.test(migration));
  assert.ok(!/create or replace function public\.(create_trial_attempt|complete_trial_attempt|reserve_|refund_)/.test(migration));
});

// ---------------------------------------------------------- client mapping ----

test('the client maps credits_required to the Pricing page (analysis reason, HeroDream callback, App wiring)', () => {
  assert.match(read('src/hero/dreamAnalysisSchema.ts'), /\| 'credits_required'/);
  assert.match(read('src/hero/dreamAnalysis.ts'), /'credits_required',/);
  const hero = read('src/hero/HeroDream.tsx');
  assert.match(hero, /result\.reason === 'credits_required'\) \{\s*onCreditsRequired\(\);\s*return;/);
  const app = read('src/App.tsx');
  assert.match(app, /onCreditsRequired=\{\(\) => \{\s*setCreditsNotice\(true\);\s*setView\('pricing'\);/);
});

test('entry gate: signed-in + definite zero balance on the dream view redirects to Pricing; unknown balance never blocks', () => {
  const app = read('src/App.tsx');
  const gate = app.slice(app.indexOf('ENTRY GATE'), app.indexOf('let screen: ReactNode'));
  assert.match(gate, /view !== 'dream' \|\| !user/);
  assert.match(gate, /balance !== 0\) return/);
  assert.match(gate, /setView\('pricing'\)/);
  const client = read('src/credits/credits.ts');
  assert.match(client, /return null;/); // signed out / failed request => unknown, not 0
});

test('Pricing: a signed-in account is not offered a free dream, and sees why it was sent there', () => {
  const page = read('src/pricing/PricingPage.tsx');
  assert.match(page, /\{!signedIn && \(\s*<div className="pr-free-note">/);
  assert.match(page, /creditsRequired && \(/);
  const tr = read('src/i18n/translations.ts');
  assert.equal(tr.split('creditsRequiredNotice:').length - 1, 3); // interface + en + he
  const app = read('src/App.tsx');
  assert.match(app, /onBack=\{\(\) => setView\(user \? 'archive' : 'dream'\)\}/); // no redirect loop back into the gate
});
