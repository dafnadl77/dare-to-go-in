import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  decideTrialAttempt,
  maxTrialAttempts,
  anonAttemptsPerDay,
  maxTrialTranscriptions,
  readTrialAttemptState,
  readTrialCompletion,
  FREE_DREAM_USED_MESSAGE,
} from '../server/trialAllowance.ts';
import { getSigningSecret, mintTrialCookie, readTrialIdFromCookieHeader } from '../server/trialIdentity.ts';
import { mintTrialIdentity, resolveCallerIdentity, type IdentityDeps } from '../server/callerIdentity.ts';

/**
 * The ONE-completed-free-dream rule per anonymous trial identity. The
 * authoritative enforcement is atomic SQL (create_trial_attempt /
 * complete_trial_attempt / partial unique index — migration
 * trial_lifetime_free_dream_enforcement), verified directly against the
 * database (rolled-back scenario run + a parallel-call concurrency run; see
 * the delivery report). These tests cover the application layer: how the
 * database's answer is mapped, the cookie/secret handling, and the wiring
 * that guarantees where each check runs.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SECRET = 'a'.repeat(48);
const PROD = { VERCEL: '1', NODE_ENV: 'production' };

// ------------------------------------------------------- decision mapping ----

test('first anonymous dream: a created attempt is accepted and carries its id', () => {
  assert.deepEqual(decideTrialAttempt({ status: 'created', attempt_id: 'abc' }), { ok: true, attemptId: 'abc' });
});

test('a consumed free dream is permanently refused with the typed free_dream_used reason (no wait restores it)', () => {
  assert.deepEqual(decideTrialAttempt({ status: 'consumed' }), { ok: false, reason: 'free_dream_used' });
});

test('more than the bounded technical attempts is refused with the same friendly typed reason', () => {
  assert.deepEqual(decideTrialAttempt({ status: 'attempt_limit' }), { ok: false, reason: 'free_dream_used' });
});

test('the global anonymous-spend breaker is a controlled temporary-unavailable, never a quota message', () => {
  assert.deepEqual(decideTrialAttempt({ status: 'unavailable' }), { ok: false, reason: 'temporarily_unavailable' });
});

test('anything unrecognized, malformed, or an unknown trial fails CLOSED', () => {
  for (const bad of [null, undefined, 'created', 42, {}, { status: 'created' }, { status: 'unknown_trial' }, { status: 'whatever' }]) {
    assert.deepEqual(decideTrialAttempt(bad), { ok: false, reason: 'not_configured' }, JSON.stringify(bad));
  }
});

test('state/completion readers only accept the documented values (fail closed otherwise)', () => {
  assert.equal(readTrialAttemptState('open'), 'open');
  assert.equal(readTrialAttemptState('consumed_elsewhere'), 'consumed_elsewhere');
  assert.equal(readTrialAttemptState('nope'), null);
  assert.equal(readTrialCompletion('completed'), 'completed');
  assert.equal(readTrialCompletion('consumed'), 'consumed');
  assert.equal(readTrialCompletion(undefined), null);
});

test('limits: 3 attempts, 150 anonymous attempts/day, 8 transcriptions — env-configurable, invalid values fall back to the defaults', () => {
  assert.equal(maxTrialAttempts({}), 3);
  assert.equal(anonAttemptsPerDay({}), 150);
  assert.equal(maxTrialTranscriptions({}), 8);
  assert.equal(maxTrialAttempts({ DARE_TRIAL_MAX_ATTEMPTS: '2' }), 2);
  assert.equal(anonAttemptsPerDay({ DARE_ANON_MAX_ATTEMPTS_PER_DAY: '500' }), 500);
  assert.equal(maxTrialTranscriptions({ DARE_TRIAL_MAX_TRANSCRIPTIONS: '0' }), 8);
  assert.equal(anonAttemptsPerDay({ DARE_ANON_MAX_ATTEMPTS_PER_DAY: 'lots' }), 150);
});

test('the user-facing message never uses quota vocabulary', () => {
  assert.equal(FREE_DREAM_USED_MESSAGE, 'Your first dream was free. To continue with more dreams, sign in or create an account.');
  assert.ok(!/quota|limit|attempt|credit/i.test(FREE_DREAM_USED_MESSAGE));
});

// ------------------------------------------------------------ cookie secret ----

test('production with no dedicated secret FAILS CLOSED — OPENAI_API_KEY is never used to sign', () => {
  assert.equal(getSigningSecret({ ...PROD, OPENAI_API_KEY: 'sk-real-looking-key-that-is-long-enough-123456' }), null);
  assert.equal(mintTrialCookie({ ...PROD, OPENAI_API_KEY: 'sk-real-looking-key-that-is-long-enough-123456' }), null);
});

test('a too-short dedicated secret is not accepted in production', () => {
  assert.equal(getSigningSecret({ ...PROD, DARE_TRIAL_COOKIE_SECRET: 'short' }), null);
});

test('a valid dedicated secret is used; local development gets a random per-process secret, never a hardcoded string', () => {
  assert.equal(getSigningSecret({ ...PROD, DARE_TRIAL_COOKIE_SECRET: SECRET }), SECRET);
  const dev1 = getSigningSecret({});
  const dev2 = getSigningSecret({});
  assert.ok(dev1 && dev1.length >= 32);
  assert.equal(dev1, dev2, 'stable within one process');
  const src = read('server/trialIdentity.ts');
  assert.ok(!src.includes('fallback-secret'));
  assert.ok(!/process\.env\.OPENAI_API_KEY/.test(src), 'the signing secret is never derived from another credential');
});

test('a forged cookie is rejected; a cookie signed with a different secret is rejected', () => {
  const env = { ...PROD, DARE_TRIAL_COOKIE_SECRET: SECRET };
  const minted = mintTrialCookie(env)!;
  const pair = minted.setCookieHeader.split(';')[0];
  const token = decodeURIComponent(pair.slice(pair.indexOf('=') + 1));
  const [payload, sig] = token.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({ id: 'attacker-chosen-id', iat: Date.now() })).toString('base64url');
  assert.equal(readTrialIdFromCookieHeader(`dare_trial=${encodeURIComponent(`${forgedPayload}.${sig}`)}`, env), null, 'payload swapped, signature kept');
  assert.equal(readTrialIdFromCookieHeader(`dare_trial=${encodeURIComponent(`${payload}.deadbeef`)}`, env), null, 'bad signature');
  assert.equal(readTrialIdFromCookieHeader(pair, { ...PROD, DARE_TRIAL_COOKIE_SECRET: 'b'.repeat(48) }), null, 'different secret');
  assert.equal(readTrialIdFromCookieHeader(pair, PROD), null, 'no secret configured: nothing verifies');
});

test('replaying a valid cookie resolves to the SAME trial identity (same consumed state), never a new one', () => {
  const env = { ...PROD, DARE_TRIAL_COOKIE_SECRET: SECRET };
  const minted = mintTrialCookie(env)!;
  const pair = minted.setCookieHeader.split(';')[0];
  assert.equal(readTrialIdFromCookieHeader(pair, env), minted.trialId);
  assert.equal(readTrialIdFromCookieHeader(pair, env), minted.trialId, 'replayed again: identical');
});

test('a second tab presents the same cookie, so it is the same identity and shares one allowance', async () => {
  const deps = {
    verifyBearer: async () => ({ ok: false as const, status: 401, reason: 'not_authenticated', message: '' }),
    readTrialId: (cookie: string | null | undefined) => (cookie === 'dare_trial=same' ? 'trial-1' : null),
    ensureTrial: async () => true,
    mintCookie: () => null,
    createTrial: async () => true,
  } satisfies IdentityDeps;
  const tabA = await resolveCallerIdentity({ cookie: 'dare_trial=same' }, deps);
  const tabB = await resolveCallerIdentity({ cookie: 'dare_trial=same' }, deps);
  assert.deepEqual(tabA.ok && tabA.identity, { kind: 'trial', trialId: 'trial-1' });
  assert.deepEqual(tabB.ok && tabB.identity, tabA.ok && tabA.identity);
});

test('when no valid secret is configured a trial identity cannot be minted (503, nothing created)', async () => {
  let created = 0;
  const result = await mintTrialIdentity({
    verifyBearer: async () => ({ ok: false, status: 401, reason: 'x', message: 'x' }),
    readTrialId: () => null,
    ensureTrial: async () => true,
    mintCookie: () => null,
    createTrial: async () => {
      created += 1;
      return true;
    },
  });
  assert.equal(result.ok === false && result.status, 503);
  assert.equal(created, 0);
});

// ------------------------------------------------------------------ wiring ----

test('dream-analysis decides the allowance atomically in the database BEFORE any model call, and maps the typed responses', () => {
  const src = read('server/routes/dreamAnalysis.ts');
  assert.ok(src.indexOf('createAttemptForIdentity(') < src.indexOf('client.responses.create'));
  assert.match(src, /errorResult\(403, 'free_dream_used'/);
  assert.match(src, /errorResult\(503, 'temporarily_unavailable'/);
  const attempts = read('server/dreamAttempts.ts');
  assert.ok(attempts.includes("rpc('create_trial_attempt'"), 'the count/decision is never made in application code');
  assert.ok(attempts.includes("rpc('complete_trial_attempt'"));
});

test('the free dream is marked completed ONLY by dream-reflection, server-side, before the reflection is returned; a failed completion delivers nothing', () => {
  const src = read('server/routes/dreamReflection.ts');
  assert.ok(src.includes('completeTrialAttempt('));
  assert.ok(src.indexOf('completeTrialAttempt(') < src.indexOf('return withHeaders(okResult(validated)'));
  assert.match(src, /completion !== 'completed'/);
  for (const other of ['dreamAnalysis', 'dreamImage', 'dreamElementLabels', 'dreamTranscription', 'dreamTranslation', 'patternReflection']) {
    assert.ok(!read(`server/routes/${other}.ts`).includes('completeTrialAttempt('), `${other} must not complete a dream`);
  }
});

test('a failed AI analysis does not consume the free dream (its attempt row is deleted, so it never counts)', () => {
  const src = read('server/routes/dreamAnalysis.ts');
  assert.equal((src.match(/await deleteDreamAttempt\(attemptId\)/g) ?? []).length, 2, 'both failure paths (bad model output, thrown error) free the slot');
});

test('leftover attempts get no further paid image/reflection/label work once the free dream is complete', () => {
  for (const route of ['dreamImage', 'dreamReflection', 'dreamElementLabels']) {
    const src = read(`server/routes/${route}.ts`);
    assert.ok(src.includes('getTrialAttemptState('), route);
    assert.match(src, /consumed_elsewhere/, route);
  }
});

test('element-labels is bound to a real attempt for trials: attemptId required, reserved before the model call, refunded on failure', () => {
  const src = read('server/routes/dreamElementLabels.ts');
  assert.match(src, /identity\.kind === 'trial'/);
  assert.match(src, /attemptId is required/);
  assert.ok(src.indexOf('reserveLabelsAttempt(') < src.indexOf('runWithLanguageIntegrity('));
  assert.ok((src.match(/refundLabelsAttempt\(/g) ?? []).length >= 2, 'refunded on both failure paths');
  // the client actually sends it
  assert.ok(read('src/hero/dreamElementLabels.ts').includes('attemptId'));
  assert.ok(read('src/hero/HeroDream.tsx').includes('analysisResult.attemptId).then('));
});

test('transcription is metered per trial identity (before the model call), closed after the free dream, refunded on failure', () => {
  const src = read('server/routes/dreamTranscription.ts');
  assert.ok(src.indexOf('reserveTrialTranscription(') < src.indexOf('client.audio.transcriptions.create'));
  assert.match(src, /identity\.kind === 'trial'/);
  assert.ok((src.match(/refundTranscription\(\)/g) ?? []).length >= 2);
});

test('signed-in behavior is untouched: every trial rule is gated on identity.kind === trial, the account path is the plain insert', () => {
  const attempts = read('server/dreamAttempts.ts');
  const fn = attempts.slice(attempts.indexOf('export async function createAttemptForIdentity'), attempts.indexOf('export async function getTrialAttemptState'));
  assert.ok(fn.indexOf("identity.kind === 'user'") < fn.indexOf("rpc('create_trial_attempt'"));
  for (const route of ['dreamImage', 'dreamReflection']) {
    assert.match(read(`server/routes/${route}.ts`), /if \(resolved\.identity\.kind === 'trial'\)/);
  }
});

test('the client maps the typed response to the EXISTING sign-in flow with the friendly notice; nothing client-side decides it', () => {
  assert.match(read('src/hero/HeroDream.tsx'), /result\.reason === 'free_dream_used'/);
  assert.match(read('src/App.tsx'), /onFreeDreamUsed=\{\(\) => \{[\s\S]*setView\('auth'\)/);
  assert.match(read('src/archive/DreamAuth.tsx'), /freeDreamNotice \? t\('auth\.freeDreamUsedNotice'\)/);
  const tr = read('src/i18n/translations.ts');
  assert.ok(tr.includes('Your first dream was free. To continue with more dreams, sign in or create an account.'));
  assert.ok(tr.includes('החלום הראשון שלך היה במתנה. כדי להמשיך לחלומות נוספים, יש להתחבר או ליצור חשבון.'));
  // no client-side "free dream used" flag exists anywhere
  for (const f of ['src/hero/HeroDream.tsx', 'src/hero/dreamStorage.ts', 'src/hero/pendingDreamSave.ts']) {
    assert.ok(!/localStorage\.setItem\([^)]*free/i.test(read(f)), f);
  }
});

test('Pattern Reflection and Dream Reflection behavior is unaffected (no trial logic in Pattern Reflection; address preference still resolved)', () => {
  assert.ok(!read('server/routes/patternReflection.ts').includes('trialAllowance'));
  assert.ok(read('server/routes/dreamReflection.ts').includes('resolveAddressPreference('));
});
