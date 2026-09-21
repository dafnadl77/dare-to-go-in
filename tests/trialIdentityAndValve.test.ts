import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveCallerIdentity, mintTrialIdentity, type IdentityDeps } from '../server/callerIdentity.ts';
import { handleTrialSession } from '../server/routes/trialSession.ts';
import {
  createAttemptWithinSafetyValve,
  checkTrialMintBackstop,
  readPositiveIntEnv,
  trialAnalysesPerDay,
  trialMintBackstopPerHour,
  DAY_MS,
  DEFAULT_TRIAL_ANALYSES_PER_DAY,
  DEFAULT_TRIAL_MINT_BACKSTOP_PER_HOUR,
  type AttemptStore,
  type AttemptIdentity,
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

test('env: the safety valves read positive integers, with the documented defaults', () => {
  assert.equal(DEFAULT_TRIAL_ANALYSES_PER_DAY, 10);
  assert.equal(DEFAULT_TRIAL_MINT_BACKSTOP_PER_HOUR, 1000);
  assert.equal(trialAnalysesPerDay({}), 10);
  assert.equal(trialAnalysesPerDay({ DARE_TRIAL_MAX_ANALYSES_PER_DAY: '25' }), 25);
  for (const bad of ['', '0', '-3', 'abc', '2.5', ' ']) assert.equal(readPositiveIntEnv(bad, 10), 10, JSON.stringify(bad));
  assert.equal(trialMintBackstopPerHour({}), 1000);
  assert.equal(trialMintBackstopPerHour({ DARE_TRIAL_MINT_BACKSTOP_PER_HOUR: '200' }), 200);
});

// ----------------------------------------------------- anonymous attempt valve ----

/** In-memory attempt table with real created_at values, modelling the two queries the valve makes. */
function attemptTable(now = Date.UTC(2026, 8, 22, 12)) {
  const rows: { id: string; trialId: string | null; ownerId: string | null; createdAt: number }[] = [];
  let seq = 0;
  let clock = now;
  const calls = { insert: 0, delete: 0, model: 0 };
  const store: AttemptStore & { failCount: boolean } = {
    failCount: false,
    insertAttempt: async (identity: AttemptIdentity) => {
      calls.insert += 1;
      const id = `attempt-${++seq}`;
      rows.push({ id, trialId: identity.kind === 'trial' ? identity.trialId : null, ownerId: identity.kind === 'user' ? identity.userId : null, createdAt: clock });
      return id;
    },
    countTrialAttemptsSince: async (trialId, sinceIso) => {
      if (store.failCount) return null;
      return rows.filter((r) => r.trialId === trialId && r.createdAt >= Date.parse(sinceIso)).length;
    },
    deleteAttempt: async (id) => {
      calls.delete += 1;
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows.splice(i, 1);
    },
  };
  return { store, rows, calls, setClock: (t: number) => (clock = t), get clock() { return clock; } };
}
const TRIAL: AttemptIdentity = { kind: 'trial', trialId: 'trial-a' };

test('a trial may start 10 analyses in a rolling 24h; the 11th is refused, leaves NO extra row, and is refused before any model call', async () => {
  const t = attemptTable();
  for (let i = 1; i <= 10; i++) {
    const r = await createAttemptWithinSafetyValve(t.store, TRIAL, 10, t.clock);
    assert.equal(r.ok, true, `attempt ${i}`);
  }
  assert.equal(t.rows.length, 10);
  const eleventh = await createAttemptWithinSafetyValve(t.store, TRIAL, 10, t.clock);
  assert.deepEqual(eleventh, { ok: false, reason: 'limit_reached' });
  assert.equal(t.rows.length, 10, 'the refused attempt was removed again');
});

test('attempts older than 24 hours no longer count (rolling window)', async () => {
  const t = attemptTable();
  for (let i = 0; i < 10; i++) await createAttemptWithinSafetyValve(t.store, TRIAL, 10, t.clock);
  assert.equal((await createAttemptWithinSafetyValve(t.store, TRIAL, 10, t.clock)).ok, false);
  // 24h + 1s later, the first ten are outside the window.
  const later = t.clock + DAY_MS + 1000;
  t.setClock(later);
  const r = await createAttemptWithinSafetyValve(t.store, TRIAL, 10, later);
  assert.equal(r.ok, true);
});

test('the window is rolling, not a fixed day: attempts spread across the day expire one by one', async () => {
  const t = attemptTable();
  const start = t.clock;
  for (let i = 0; i < 10; i++) {
    t.setClock(start + i * 2 * 60 * 60 * 1000); // one attempt every 2h
    assert.equal((await createAttemptWithinSafetyValve(t.store, TRIAL, 10, t.clock)).ok, true);
  }
  t.setClock(start + 21 * 60 * 60 * 1000);
  assert.equal((await createAttemptWithinSafetyValve(t.store, TRIAL, 10, t.clock)).ok, false, 'still ten inside the last 24h');
  t.setClock(start + 24 * 60 * 60 * 1000 + 1000);
  assert.equal((await createAttemptWithinSafetyValve(t.store, TRIAL, 10, t.clock)).ok, true, 'the oldest has aged out');
});

test('a failed analysis does not permanently consume an attempt (the route deletes it, so it stops counting)', async () => {
  const t = attemptTable();
  for (let i = 0; i < 9; i++) await createAttemptWithinSafetyValve(t.store, TRIAL, 10, t.clock);
  const tenth = await createAttemptWithinSafetyValve(t.store, TRIAL, 10, t.clock);
  assert.equal(tenth.ok, true);
  if (tenth.ok) await t.store.deleteAttempt(tenth.attemptId); // what dreamAnalysis.ts does when the model call fails
  assert.equal((await createAttemptWithinSafetyValve(t.store, TRIAL, 10, t.clock)).ok, true, 'the failed one did not use up the allowance');
});

test('each trial has its own allowance', async () => {
  const t = attemptTable();
  for (let i = 0; i < 10; i++) await createAttemptWithinSafetyValve(t.store, TRIAL, 10, t.clock);
  assert.equal((await createAttemptWithinSafetyValve(t.store, TRIAL, 10, t.clock)).ok, false);
  assert.equal((await createAttemptWithinSafetyValve(t.store, { kind: 'trial', trialId: 'trial-b' }, 10, t.clock)).ok, true);
});

test('signed-in callers are NOT restricted by the anonymous valve (and their attempts never count toward a trial)', async () => {
  const t = attemptTable();
  const user: AttemptIdentity = { kind: 'user', userId: 'user-a' };
  for (let i = 0; i < 50; i++) assert.equal((await createAttemptWithinSafetyValve(t.store, user, 10, t.clock)).ok, true);
  assert.equal(t.rows.length, 50);
  assert.equal(t.calls.delete, 0);
  assert.equal((await createAttemptWithinSafetyValve(t.store, TRIAL, 10, t.clock)).ok, true, 'the trial starts with a clean allowance');
});

test('if the attempt table cannot be read, an anonymous attempt fails closed and leaves no row; if it cannot be written, unavailable', async () => {
  const t = attemptTable();
  t.store.failCount = true;
  assert.deepEqual(await createAttemptWithinSafetyValve(t.store, TRIAL, 10, t.clock), { ok: false, reason: 'unavailable' });
  assert.equal(t.rows.length, 0);
  const broken: AttemptStore = { insertAttempt: async () => null, countTrialAttemptsSince: async () => 0, deleteAttempt: async () => {} };
  assert.deepEqual(await createAttemptWithinSafetyValve(broken, TRIAL, 10), { ok: false, reason: 'unavailable' });
});

test('KNOWN LIMITATION: the valve counts without locking — requests whose transactions overlap cannot see each other, so the limit can be exceeded by at most the number in flight at that instant', async () => {
  // Worst case: every concurrent request sees only the rows committed BEFORE it started plus its own
  // (snapshot-style visibility), i.e. none of the other in-flight requests.
  const t = attemptTable();
  for (let i = 0; i < 9; i++) await createAttemptWithinSafetyValve(t.store, TRIAL, 10, t.clock); // 9 of 10 used
  const existing = t.rows.length;
  const N = 5;
  const blindStore: AttemptStore = {
    insertAttempt: t.store.insertAttempt,
    countTrialAttemptsSince: async () => existing + 1, // 9 already committed + only its own row
    deleteAttempt: t.store.deleteAttempt,
  };
  const results = await Promise.all(Array.from({ length: N }, () => createAttemptWithinSafetyValve(blindStore, TRIAL, 10, t.clock)));
  const accepted = results.filter((r) => r.ok).length;
  assert.equal(accepted, N, 'overlapping requests can each be admitted');
  assert.equal(t.rows.length, existing + N);
  assert.ok(t.rows.length - 10 <= N - 1, 'the excess is bounded by the requests in flight, never unbounded');
  // As soon as the rows are visible, the limit is enforced again (and the refused request leaves nothing behind).
  const before = t.rows.length;
  assert.deepEqual(await createAttemptWithinSafetyValve(t.store, TRIAL, 10, t.clock), { ok: false, reason: 'limit_reached' });
  assert.equal(t.rows.length, before);
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

test('the analysis route applies the valve before any model call; support routes have no per-route credit accounting', () => {
  const analysis = read('server/routes/dreamAnalysis.ts');
  assert.ok(analysis.indexOf('createDreamAttemptWithinValve(') > 0);
  assert.ok(analysis.indexOf('createDreamAttemptWithinValve(') < analysis.indexOf('client.responses.create'), 'valve before the model');
  assert.ok(analysis.includes('deleteDreamAttempt(attemptId)'), 'a failed analysis still deletes its attempt');
  for (const r of ['dreamTranscription', 'dreamElementLabels', 'dreamTranslation']) {
    const src = read(`server/routes/${r}.ts`);
    for (const forbidden of ['reservePaidUsage', 'aiUsage', 'createDreamAttempt', 'reserveImageAttempt', 'reserveReflectionAttempt', 'refundAiUsage']) {
      assert.ok(!src.includes(forbidden), `${r} has no credit accounting (${forbidden})`);
    }
  }
  // Translation stays available to whoever passes its own existing identity check (signed-in) — no trial rule was added.
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
