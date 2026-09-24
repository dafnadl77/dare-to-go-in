import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveCallerIdentity, mintTrialIdentity, type IdentityDeps } from '../server/callerIdentity.ts';
import { handleTrialSession } from '../server/routes/trialSession.ts';
import {
  checkTrialMintBackstop,
  readPositiveIntEnv,
  trialMintBackstopPerHour,
  DEFAULT_TRIAL_MINT_BACKSTOP_PER_HOUR,
  type TrialMintStore,
} from '../server/anonymousSafetyValves.ts';

// ---------------------------------------------------------------- identity ----

function identityDeps(over: Partial<IdentityDeps> = {}) {
  const created: string[] = [];
  const deps: IdentityDeps = {
    verifyBearer: async (h) => (h === 'Bearer good' ? { ok: true, userId: 'user-a' } : { ok: false, status: 401, reason: 'not_authenticated', message: 'bad' }),
    readTrialId: (cookie) => (cookie === 'dare_trial=valid' ? 'trial-a' : cookie === 'dare_trial=other' ? 'trial-b' : null),
    ensureTrial: async () => true,
    mintCookie: () => ({ trialId: `minted-${created.length + 1}`, setCookieHeader: 'dare_trial=new; HttpOnly' }),
    createTrial: async (id) => {
      created.push(id);
      return true;
    },
    ...over,
  };
  return { deps, created };
}

test('a direct anonymous request to a paid route cannot mint a trial — however often it repeats — and fails closed with 401 trial_required', async () => {
  const { deps, created } = identityDeps();
  for (let i = 0; i < 500; i++) {
    const r = await resolveCallerIdentity({}, deps);
    assert.equal(r.ok, false);
    if (!r.ok) assert.deepEqual([r.status, r.reason], [401, 'trial_required']);
  }
  assert.equal(created.length, 0);
});

test('the same trial cookie always resolves to the same trial; different cookies stay different; a signed-in bearer is a user', async () => {
  const { deps } = identityDeps();
  const a1 = await resolveCallerIdentity({ cookie: 'dare_trial=valid' }, deps);
  const a2 = await resolveCallerIdentity({ cookie: 'dare_trial=valid' }, deps);
  const b = await resolveCallerIdentity({ cookie: 'dare_trial=other' }, deps);
  assert.deepEqual(a1.ok && a1.identity, { kind: 'trial', trialId: 'trial-a' });
  assert.deepEqual(a2.ok && a2.identity, { kind: 'trial', trialId: 'trial-a' });
  assert.deepEqual(b.ok && b.identity, { kind: 'trial', trialId: 'trial-b' });
  const user = await resolveCallerIdentity({ authorization: 'Bearer good' }, deps);
  assert.deepEqual(user.ok && user.identity, { kind: 'user', userId: 'user-a' });
});

test('an invalid bearer is never downgraded to a trial; a valid cookie whose row cannot be confirmed fails closed', async () => {
  const { deps, created } = identityDeps();
  const bad = await resolveCallerIdentity({ authorization: 'Bearer nope', cookie: 'dare_trial=valid' }, deps);
  assert.equal(bad.ok === false && bad.status, 401);
  const broken = await resolveCallerIdentity({ cookie: 'dare_trial=valid' }, identityDeps({ ensureTrial: async () => false }).deps);
  assert.equal(broken.ok === false && broken.status, 503);
  assert.equal(created.length, 0);
});

test('/api/trial-session establishes the trial (Set-Cookie) exactly once and is idempotent for a browser that already has a session', async () => {
  const { deps, created } = identityDeps();
  const mintStore: TrialMintStore = { countTrialsSince: async () => 0 };
  const first = await handleTrialSession({}, { identity: deps, mintStore });
  assert.equal(first.status, 200);
  assert.equal(first.headers?.['Set-Cookie'], 'dare_trial=new; HttpOnly');
  assert.equal(created.length, 1);
  const again = await handleTrialSession({ cookie: 'dare_trial=valid' }, { identity: deps, mintStore });
  assert.deepEqual([again.status, again.headers], [200, undefined]);
  const signedIn = await handleTrialSession({ authorization: 'Bearer good' }, { identity: deps, mintStore });
  assert.equal(signedIn.status, 200);
  assert.equal(created.length, 1, 'a browser with a session mints nothing');
  const badBearer = await handleTrialSession({ authorization: 'Bearer nope' }, { identity: deps, mintStore });
  assert.equal(badBearer.status, 401);
  assert.equal(created.length, 1);
});

test('mintTrialIdentity reports a failed insert instead of handing out an identity', async () => {
  const failed = await mintTrialIdentity(identityDeps({ createTrial: async () => false }).deps);
  assert.equal(failed.ok, false);
});

// ------------------------------------------------------- mint emergency backstop ----

test('the mint backstop is an emergency stop: below it minting works, at it minting is refused, an unreadable count fails closed', async () => {
  const now = Date.UTC(2026, 8, 22, 10);
  assert.equal(await checkTrialMintBackstop({ countTrialsSince: async () => 999 }, 1000, now), 'ok');
  assert.equal(await checkTrialMintBackstop({ countTrialsSince: async () => 1000 }, 1000, now), 'backstop_reached');
  assert.equal(await checkTrialMintBackstop({ countTrialsSince: async () => null }, 1000, now), 'unavailable');

  let sinceSeen = '';
  await checkTrialMintBackstop({ countTrialsSince: async (s) => ((sinceSeen = s), 0) }, 1000, now);
  assert.equal(sinceSeen, new Date(now - 60 * 60 * 1000).toISOString(), 'counts the rolling last hour');

  const { deps, created } = identityDeps();
  const full = await handleTrialSession({}, { identity: deps, mintStore: { countTrialsSince: async () => 50 }, mintBackstopPerHour: 50 });
  assert.equal(full.status, 429);
  const down = await handleTrialSession({}, { identity: deps, mintStore: { countTrialsSince: async () => null } });
  assert.equal(down.status, 503);
  assert.equal(created.length, 0, 'nothing was minted in either refused case');
});

test('env: the mint backstop reads a positive integer, with the documented default', () => {
  assert.equal(DEFAULT_TRIAL_MINT_BACKSTOP_PER_HOUR, 1000);
  for (const bad of ['', '0', '-3', 'abc', '2.5', ' ']) assert.equal(readPositiveIntEnv(bad, 10), 10, JSON.stringify(bad));
  assert.equal(trialMintBackstopPerHour({}), 1000);
  assert.equal(trialMintBackstopPerHour({ DARE_TRIAL_MINT_BACKSTOP_PER_HOUR: '200' }), 200);
});

// ------------------------------------------------------------------ wiring ----

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('every AI route requires an identity from resolveCallerIdentity, and none of them can mint one', () => {
  const routes = ['dreamAnalysis', 'dreamTranscription', 'dreamElementLabels', 'dreamTranslation', 'dreamImage', 'dreamReflection'];
  for (const r of routes) {
    const src = read(`server/routes/${r}.ts`);
    assert.ok(src.includes('resolveCallerIdentity('), `${r} resolves the caller`);
    assert.ok(!src.includes('mintTrialIdentity'), `${r} never mints`);
    assert.ok(!src.includes('createNewTrialIdentity'), `${r} never creates a trial row`);
  }
  assert.ok(read('server/routes/trialSession.ts').includes('mintTrialIdentity('), 'only trial-session mints');
  const callerIdentity = read('server/callerIdentity.ts');
  const resolveBody = callerIdentity.slice(callerIdentity.indexOf('export async function resolveCallerIdentity'), callerIdentity.indexOf('export async function mintTrialIdentity'));
  assert.ok(!resolveBody.includes('createTrial') && !resolveBody.includes('mintCookie'), 'resolveCallerIdentity has no minting path');
});

test('the analysis route decides the anonymous allowance before any model call; support routes have no per-route credit accounting beyond their own trial metering', () => {
  const analysis = read('server/routes/dreamAnalysis.ts');
  assert.ok(analysis.indexOf('createAttemptForIdentity(') > 0);
  assert.ok(analysis.indexOf('createAttemptForIdentity(') < analysis.indexOf('client.responses.create'), 'allowance before the model');
  assert.ok(analysis.includes('abandonAttempt(resolved.identity, attemptId)'), 'a failed analysis still releases its attempt');
  assert.ok(read('server/routes/dreamTranslation.ts').includes('resolveCallerIdentity('));
  assert.ok(!read('server/routes/dreamTranslation.ts').includes("kind === 'trial'"));
});

test('image and reflection keep their existing per-attempt protections', () => {
  assert.ok(read('server/routes/dreamImage.ts').includes('reserveImageAttempt('));
  assert.ok(read('server/routes/dreamReflection.ts').includes('reserveReflectionAttempt('));
  assert.ok(read('server/dreamAttempts.ts').includes('const MAX_IMAGE_ATTEMPTS = 3'));
  assert.ok(read('server/dreamAttempts.ts').includes('const MAX_REFLECTION_ATTEMPTS = 3'));
});

test('the rejected ai_usage architecture is absent', () => {
  for (const f of ['server/aiUsage.ts', 'server/paidCallGuard.ts', 'scripts/quota-migration/001_ai_usage.sql']) {
    assert.throws(() => read(f), `${f} must not exist on this branch`);
  }
});
