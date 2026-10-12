import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { guestDreamsAllowed, GUEST_DREAMS_ENV, SIGN_IN_REQUIRED_MESSAGE } from '../server/guestPolicy.ts';
import { handleTrialSession } from '../server/routes/trialSession.ts';
import { handleDreamAnalysis, type DreamAnalysisDeps } from '../server/routes/dreamAnalysis.ts';
import type { CallerIdentity, IdentityDeps } from '../server/callerIdentity.ts';
import type { TrialMintStore } from '../server/anonymousSafetyValves.ts';
import { paidFetch } from '../src/auth/paidFetch.ts';
import { en, he } from '../src/i18n/translations.ts';

/**
 * Starting a dream needs an account — on the server too. A visitor who is not signed in cannot begin a NEW dream through any API route:
 * no new guest identity is minted, a guest cookie cannot send a recording or start an analysis. Guest cookies and guest dreams that
 * already exist keep working for what is in progress (image, labels, reflection on their own attempt), without any extra free dream.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// ------------------------------------------------------------------ the policy
test('guests are closed unless DARE_GUEST_DREAMS is explicitly "on"', () => {
  assert.equal(GUEST_DREAMS_ENV, 'DARE_GUEST_DREAMS');
  for (const value of [undefined, '', ' ', 'off', 'false', 'true', '1', 'yes', 'onn']) assert.equal(guestDreamsAllowed({ DARE_GUEST_DREAMS: value }), false, String(value));
  for (const value of ['on', 'ON', ' On ']) assert.equal(guestDreamsAllowed({ DARE_GUEST_DREAMS: value }), true, value);
  assert.equal(guestDreamsAllowed({}), false);
});

// ------------------------------------------------------------------ /api/trial-session
function identityDeps() {
  const created: string[] = [];
  const deps: IdentityDeps = {
    verifyBearer: async (h) => (h === 'Bearer good' ? { ok: true, userId: 'user-a' } : { ok: false, status: 401, reason: 'not_authenticated', message: 'bad' }),
    readTrialId: (cookie) => (cookie === 'dare_trial=valid' ? 'trial-a' : null),
    ensureTrial: async () => true,
    mintCookie: () => ({ trialId: `minted-${created.length + 1}`, setCookieHeader: 'dare_trial=new; HttpOnly' }),
    createTrial: async (id) => {
      created.push(id);
      return true;
    },
  };
  return { deps, created };
}

test('/api/trial-session: no new guest identity is minted — not by any number of calls — and the mint counter is not even consulted', async () => {
  const { deps, created } = identityDeps();
  let counted = 0;
  const mintStore: TrialMintStore = { countTrialsSince: async () => (counted += 1, 0) };
  for (let i = 0; i < 50; i += 1) {
    const r = await handleTrialSession({}, { identity: deps, mintStore, guestsAllowed: false });
    assert.equal(r.status, 403);
    assert.equal((r.body as { reason: string }).reason, 'sign_in_required');
    assert.equal((r.body as { message: string }).message, SIGN_IN_REQUIRED_MESSAGE);
    assert.equal(r.headers, undefined, 'and no cookie is set');
  }
  assert.equal(created.length, 0);
  assert.equal(counted, 0);
});

test('/api/trial-session: the default (no setting at all) is CLOSED', async () => {
  const saved = process.env[GUEST_DREAMS_ENV];
  delete process.env[GUEST_DREAMS_ENV];
  try {
    const { deps, created } = identityDeps();
    const r = await handleTrialSession({}, { identity: deps, mintStore: { countTrialsSince: async () => 0 } });
    assert.equal(r.status, 403);
    assert.equal(created.length, 0);
  } finally {
    if (saved !== undefined) process.env[GUEST_DREAMS_ENV] = saved;
  }
});

test('/api/trial-session: an EXISTING guest cookie and a signed-in account are still answered 200 (compatibility); a bad token is still 401', async () => {
  const { deps, created } = identityDeps();
  const mintStore: TrialMintStore = { countTrialsSince: async () => 0 };
  const cookie = await handleTrialSession({ cookie: 'dare_trial=valid' }, { identity: deps, mintStore, guestsAllowed: false });
  assert.deepEqual([cookie.status, cookie.headers], [200, undefined]);
  const signedIn = await handleTrialSession({ authorization: 'Bearer good' }, { identity: deps, mintStore, guestsAllowed: false });
  assert.equal(signedIn.status, 200);
  const bad = await handleTrialSession({ authorization: 'Bearer nope' }, { identity: deps, mintStore, guestsAllowed: false });
  assert.equal(bad.status, 401);
  assert.equal(created.length, 0);
});

test('/api/trial-session: the explicit lever re-opens minting (emergency use), and nothing else changes', async () => {
  const { deps, created } = identityDeps();
  const open = await handleTrialSession({}, { identity: deps, mintStore: { countTrialsSince: async () => 0 }, guestsAllowed: true });
  assert.equal(open.status, 200);
  assert.equal(open.headers?.['Set-Cookie'], 'dare_trial=new; HttpOnly');
  assert.equal(created.length, 1);
});

// ------------------------------------------------------------------ /api/dream-analysis
const ATTEMPT_KEY = 'guest-closure-key-0001';
function analysisHarness(identity: CallerIdentity, guestsAllowed?: () => boolean) {
  const calls = { startLegacy: 0, startIdempotent: 0, model: 0 };
  const deps: DreamAnalysisDeps = {
    resolveIdentity: (async () => ({ ok: true, identity, setCookieHeader: undefined })) as DreamAnalysisDeps['resolveIdentity'],
    getClient: () => ({}) as never,
    start: {
      startLegacy: async () => ((calls.startLegacy += 1), { ok: true, attemptId: 'guest-attempt' }),
      startIdempotent: async () => ((calls.startIdempotent += 1), { kind: 'created', attemptId: 'user-attempt' }),
      sleep: async () => {},
    },
    abandon: async () => {},
    complete: async () => true,
    runModel: (async () => ((calls.model += 1), { status: 'ok', value: { summary: 'x' } })) as DreamAnalysisDeps['runModel'],
    ...(guestsAllowed ? { guestsAllowed } : {}),
  };
  return { deps, calls };
}
const post = (deps: DreamAnalysisDeps, withKey = true) =>
  handleDreamAnalysis({ sourceText: 'a door by the sea', inputMode: 'text', ...(withKey ? { idempotencyKey: ATTEMPT_KEY } : {}) }, { authorization: undefined, cookie: 'dare_trial=old' }, deps);

test('/api/dream-analysis: a guest cookie cannot start a new dream — refused 401 sign_in_required before an attempt exists and before any model call', async () => {
  const h = analysisHarness({ kind: 'trial', trialId: 'old-trial' });
  for (const withKey of [true, false]) {
    const res = await post(h.deps, withKey);
    assert.equal(res.status, 401);
    assert.equal((res.body as { reason: string }).reason, 'sign_in_required');
  }
  assert.deepEqual(h.calls, { startLegacy: 0, startIdempotent: 0, model: 0 });
});

test('/api/dream-analysis: a signed-in account (owner or not) is NOT affected by the guest policy: it starts and the model runs', async () => {
  for (const userId of ['regular-user', '7d55396c-3582-4aec-8470-d188fc029829']) {
    const h = analysisHarness({ kind: 'user', userId });
    const res = await post(h.deps);
    assert.equal(res.status, 200, userId);
    assert.deepEqual(h.calls, { startLegacy: 0, startIdempotent: 1, model: 1 });
  }
});

test('/api/dream-analysis: the explicit lever lets a guest start again (and nothing changes for them)', async () => {
  const h = analysisHarness({ kind: 'trial', trialId: 'old-trial' }, () => true);
  const res = await post(h.deps, false);
  assert.equal(res.status, 200);
  assert.deepEqual(h.calls, { startLegacy: 1, startIdempotent: 0, model: 1 });
});

// ------------------------------------------------------------------ the routes as written
test('/api/dream-transcription: a guest cookie is refused before the body is read and before any usage is reserved', () => {
  const route = code('server/routes/dreamTranscription.ts');
  const guard = route.indexOf("resolved.identity.kind === 'trial' && !guestDreamsAllowed()");
  assert.ok(guard > 0);
  assert.match(route, /if \(resolved\.identity\.kind === 'trial' && !guestDreamsAllowed\(\)\) \{\s*return withHeaders\(errorResult\(401, SIGN_IN_REQUIRED_REASON, SIGN_IN_REQUIRED_MESSAGE\), cookieHeaders\);\s*\}/);
  assert.ok(guard < route.indexOf('const body = (rawBody'), 'before the body is even read');
  assert.ok(guard < route.indexOf('reserveTrialTranscription('), 'before any guest usage is reserved');
  assert.ok(guard < route.indexOf('client.audio.transcriptions.create'), 'before any model call');
  // a signed-in account is untouched: its path (owner check, credit check, rate limit) still follows
  assert.ok(route.indexOf('isAppOwner(') > guard);
  assert.match(route, /enforceRateLimits\(databaseRateLimitStore, 'transcribe'/);
});

test('/api/dream-analysis as written: the guest guard comes right after the identity and before the body, the attempt and the model', () => {
  const route = code('server/routes/dreamAnalysis.ts');
  const guard = route.indexOf("resolved.identity.kind === 'trial' && !(deps.guestsAllowed ?? guestDreamsAllowed)()");
  assert.ok(guard > 0);
  assert.ok(guard < route.indexOf('const body = (rawBody'));
  assert.ok(guard < route.indexOf('startAnalysisAttempt('));
  assert.ok(guard < route.indexOf('deps.runModel('));
});

test('nothing else can create a guest dream: guest attempts, guest identities and guest transcriptions each have exactly one door, and it is guarded', () => {
  const files = (dir: string): string[] => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []));
  const all = [...files('server'), ...files('api')];
  const users = (needle: RegExp) => all.filter((f) => needle.test(code(f))).sort();
  assert.deepEqual(users(/createAttemptForIdentity\b/), ['server/dreamAttempts.ts', 'server/routes/dreamAnalysis.ts'].sort(), 'guest attempts are created only by the analysis route');
  assert.deepEqual(users(/mintTrialIdentity\(/), ['server/callerIdentity.ts', 'server/routes/trialSession.ts'].sort(), 'guest identities are minted only by trial-session');
  assert.deepEqual(users(/reserveTrialTranscription\(/), ['server/dreamAttempts.ts', 'server/routes/dreamTranscription.ts'].sort());
  assert.deepEqual(users(/rpc\('create_trial_attempt'/), ['server/dreamAttempts.ts']);
  assert.deepEqual(users(/guestDreamsAllowed/), ['server/guestPolicy.ts', 'server/routes/dreamAnalysis.ts', 'server/routes/dreamTranscription.ts', 'server/routes/trialSession.ts'].sort());
});

test('image, labels and reflection work only on an EXISTING attempt that belongs to the caller, so a new guest cannot use them; translation and pattern reflection are accounts only', () => {
  for (const file of ['server/routes/dreamImage.ts', 'server/routes/dreamElementLabels.ts', 'server/routes/dreamReflection.ts']) {
    const route = code(file);
    assert.match(route, /attemptId is required/, file);
    assert.match(route, /reserve(Image|Labels|Reflection)Attempt\(attemptId, resolved\.identity\)/, file);
    assert.ok(route.indexOf('reserve') < route.indexOf('client.'), `${file}: ownership is checked before any model call`);
    // compatibility: guests with a dream in progress finish it, so these routes are NOT behind the new guest guard
    assert.ok(!/guestDreamsAllowed|sign_in_required/.test(route), file);
  }
  for (const file of ['server/routes/dreamTranslation.ts', 'server/routes/patternReflection.ts']) {
    assert.match(code(file), /resolved\.identity\.kind !== 'user'/, file);
  }
  const api = readdirSync(new URL('../api', import.meta.url)).filter((f) => f.endsWith('.ts'));
  assert.equal(api.length, 12, 'no function was added (Hobby limit)');
});

// ------------------------------------------------------------------ the client
type Handler = (url: string) => Response | Promise<Response>;
async function withFetch<T>(handler: Handler, run: (calls: string[]) => Promise<T>): Promise<T> {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string) => (calls.push(String(input)), handler(String(input)))) as typeof fetch;
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('client: when the server will not hand out a guest session, a paid call comes back as 401 sign_in_required (no retry loop, no generic failure)', async () => {
  await withFetch(
    (url) => (url === '/api/trial-session' ? json(403, { reason: 'sign_in_required', message: SIGN_IN_REQUIRED_MESSAGE }) : json(401, { reason: 'trial_required' })),
    async (calls) => {
      const res = await paidFetch('/api/dream-analysis', { method: 'POST', body: '{}' });
      assert.equal(res.status, 401);
      const body = (await res.json()) as { reason: string; message: string };
      assert.deepEqual([body.reason, body.message], ['sign_in_required', SIGN_IN_REQUIRED_MESSAGE]);
      assert.deepEqual(calls, ['/api/dream-analysis', '/api/trial-session'], 'one bootstrap attempt, and the original request is not repeated');
    },
  );
});

test('client: a stale page or a lapsed session lands on sign-up with the words kept (analysis), or a clear message (transcription) — never a dead end', () => {
  const hero = code('src/hero/HeroDream.tsx');
  assert.match(hero, /result\.reason === 'sign_in_required'\) \{\s*saveDreamDraft\(dreamInputSourceText\(input\)\);\s*onStartRequiresSignIn\(\);\s*return;\s*\}/);
  assert.match(code('src/hero/dreamAnalysis.ts'), /'sign_in_required',/);
  assert.match(code('src/hero/dreamAnalysisSchema.ts'), /\| 'sign_in_required'/);
  assert.match(code('src/hero/transcriptionResult.ts'), /'sign_in_required',/);
  const hold = code('src/hero/HoldToRemember.tsx');
  assert.match(hold, /case 'sign_in_required':\s*return t\('hold\.transcriptionSignInRequired'\);/);
  assert.match(hold, /if \(result\.reason === 'sign_in_required'\) onStartAttempt\?\.\(\);/);
  assert.equal(he.hold.transcriptionSignInRequired, 'כדי להתחיל חלום צריך להתחבר או ליצור חשבון. המילים שלך נשארות כאן.');
  assert.match(en.hold.transcriptionSignInRequired, /sign in or create an account/);
});

// ------------------------------------------------------------------ nothing else moved
test('payments, packages, credits, the free-dream decision and the owner are untouched by closing the guest route', () => {
  for (const file of ['server/payments/paymentComplete.ts', 'server/payments/checkoutStart.ts', 'server/payments/checkoutPackages.ts', 'server/payments/completionStore.ts', 'server/freeDream.ts', 'server/routes/credits.ts', 'server/routes/claimTrial.ts', 'server/creditHistory.ts', 'src/pricing/packages.ts']) {
    assert.ok(!/guestPolicy|guestDreamsAllowed|sign_in_required/.test(read(file)), file);
  }
  // the account free-dream decision still links an existing guest cookie to the new account (no double dream): that migration is the one that matters
  assert.match(read('supabase/migrations/20261012_free_dream_ignore_foreign_cookie.sql'), /v_completed := exists \(select 1 from public\.dream_attempts where owner_id = p_owner and completed_at is not null\);/);
});
