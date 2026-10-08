import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { paidFetch } from '../src/auth/paidFetch.ts';
import { carriesBearerToken } from '../src/auth/revokedSession.ts';
import { saveDreamDraft, takeDreamDraft } from '../src/hero/dreamDraft.ts';
import { en, he } from '../src/i18n/translations.ts';

/**
 * Production incident: dream creation failed for a signed-in dreamer whose Supabase session had been ENDED ON THE SERVER (the
 * default sign-out ended every device's session) while the browser still held a not-yet-expired token: every paid call answered
 * 401 and the UI showed a generic failure; a signed-out device with its free dream used failed the microphone with a generic
 * message and bounced to the sign-up screen; and a stale ?view=auth / ?view=archive address opened the "keep your dreams" screen
 * instead of the home page. These tests pin the recovery behavior.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// ------------------------------------------------------------ the revoked-session path

test('only a request that carries the bearer token can be a "revoked session"', () => {
  assert.equal(carriesBearerToken(undefined), false);
  assert.equal(carriesBearerToken({ method: 'POST' }), false);
  assert.equal(carriesBearerToken({ headers: { 'Content-Type': 'application/json' } }), false);
  assert.equal(carriesBearerToken({ headers: { Authorization: 'Bearer x' } }), true);
  assert.equal(carriesBearerToken({ headers: { authorization: 'Bearer x' } }), true);
  assert.equal(carriesBearerToken({ headers: new Headers({ Authorization: 'Bearer x' }) }), true);
  assert.equal(carriesBearerToken({ headers: [['Authorization', 'Bearer x']] }), true);
});

test('a 401 not_authenticated on an authenticated call is returned as is: no trial bootstrap, no retry', async () => {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string) => {
    calls.push(String(input));
    return json(401, { reason: 'not_authenticated', message: 'Your session is invalid or has expired.' });
  }) as typeof fetch;
  try {
    const res = await paidFetch('/api/dream-analysis', { method: 'POST', headers: { Authorization: 'Bearer stale' }, body: '{}' });
    assert.equal(res.status, 401);
    assert.deepEqual(calls, ['/api/dream-analysis']);
    assert.equal((await res.json()).reason, 'not_authenticated');
  } finally {
    globalThis.fetch = original;
  }
});

test('the guard drops a session only when Supabase itself says it is gone, and only on this device', () => {
  const guard = read('src/auth/sessionGuard.ts');
  assert.match(guard, /await supabase\.auth\.getUser\(\)/);
  assert.match(guard, /if \(status !== 401 && status !== 403\) return false;/);
  assert.match(guard, /signOut\(\{ scope: 'local' \}\)/);
  // callers that can see a refused token report it
  assert.match(read('src/auth/paidFetch.ts'), /reason === 'not_authenticated' && carriesBearerToken\(init\)/);
  assert.match(read('src/credits/credits.ts'), /res\.status === 401\) await dropRevokedSession\(\)/);
  assert.match(read('src/auth/claimTrial.ts'), /res\.status === 401\) await dropRevokedSession\(\)/);
});

test('signing out ends THIS device only (the default ended every device and left others holding dead tokens)', () => {
  assert.match(read('src/auth/AuthContext.tsx'), /async signOut\(\) \{[\s\S]*?supabase\.auth\.signOut\(\{ scope: 'local' \}\)/);
});

test('an expired session is handled where the dream starts: the words are kept and the dreamer is sent to sign in, only if the session is really gone', () => {
  const hero = read('src/hero/HeroDream.tsx');
  assert.match(hero, /result\.reason === 'not_authenticated'\) \{\s*saveDreamDraft\(dreamInputSourceText\(input\)\);\s*onSessionExpired\(\)\.then\(\(handled\) => \{\s*if \(!handled && seq === analysisSeqRef\.current\) setAnalysisResult\(result\);/);
  const app = read('src/App.tsx');
  assert.match(app, /const handleSessionExpired = async \(\): Promise<boolean> => \{\s*const \{ data \} = await supabase\.auth\.getSession\(\);\s*if \(data\.session\) return false;/);
  assert.match(app, /setAuthMode\('signin'\);\s*setAuthSessionNotice\(true\);/);
  assert.ok(en.auth.sessionExpiredNotice.length > 20 && he.auth.sessionExpiredNotice.length > 20);
});

// ------------------------------------------------------------ what the dreamer wrote is never lost on a redirect

function withStorage<T>(run: () => T): T {
  const store = new Map<string, string>();
  const original = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  try {
    return run();
  } finally {
    (globalThis as { localStorage?: unknown }).localStorage = original;
  }
}

test('a saved draft comes back exactly once, trimmed, and an old or empty one never does', () => {
  withStorage(() => {
    saveDreamDraft('  חלמתי על בית ישן  ', 1_000_000);
    assert.equal(takeDreamDraft(1_000_500), 'חלמתי על בית ישן');
    assert.equal(takeDreamDraft(1_000_600), null, 'read once');
    saveDreamDraft('old dream', 1_000_000);
    assert.equal(takeDreamDraft(1_000_000 + 61 * 60 * 1000), null, 'older than an hour');
    saveDreamDraft('   ', 1_000_000);
    assert.equal(takeDreamDraft(1_000_001), null, 'nothing to keep');
  });
});

test('every redirect that leaves the typing screen saves the words first, and the typing box restores them', () => {
  const hero = read('src/hero/HeroDream.tsx');
  for (const reason of ['free_dream_used', 'credits_required', 'not_authenticated']) {
    assert.match(hero, new RegExp(`result\\.reason === '${reason}'\\) \\{\\s*saveDreamDraft\\(dreamInputSourceText\\(input\\)\\);`));
  }
  const hold = read('src/hero/HoldToRemember.tsx');
  assert.match(hold, /const draft = takeDreamDraft\(\);\s*if \(!draft\) return;\s*setEntry\(draft\);\s*onTypedTranscriptChange\(draft\);\s*setCentralMode\('typing'\);/);
});

// ------------------------------------------------------------ the microphone says what actually happened

test('a refused recording names the real reason and always leaves typing available', () => {
  const client = read('src/hero/transcriptionResult.ts');
  for (const reason of ['free_dream_used', 'credits_required', 'limit_reached']) assert.ok(client.includes(`'${reason}'`), reason);
  const hold = read('src/hero/HoldToRemember.tsx');
  assert.match(hold, /case 'free_dream_used':\s*return t\('hold\.transcriptionFreeDreamUsed'\)/);
  assert.match(hold, /case 'not_authenticated':\s*return t\('hold\.transcriptionSessionExpired'\)/);
  assert.match(hold, /case 'credits_required':\s*return t\('hold\.transcriptionCreditsRequired'\)/);
  // after ANY transcription outcome the dreamer lands in the typing box
  assert.match(hold, /describeTranscriptionFailure\(result\.reason, t\)\);[\s\S]*?\}\s*setCentralMode\('typing'\);/);
  for (const dict of [en, he]) {
    for (const key of ['transcriptionFreeDreamUsed', 'transcriptionSessionExpired', 'transcriptionCreditsRequired'] as const) {
      assert.ok(dict.hold[key].length > 20 && !/undefined|null/.test(dict.hold[key]), key);
    }
  }
});

// ------------------------------------------------------------ entry is the home page

test('arriving at the app never lands on the sign-up screen because of an old address', () => {
  const app = read('src/App.tsx');
  assert.match(app, /if \(value === 'auth'\) return getPendingDreamSave\(\) \? 'auth' : 'dream';/);
  assert.match(app, /if \(view === 'dream' \|\| view === 'auth'\) \{\s*url\.searchParams\.delete\(POST_AUTH_REDIRECT_PARAM\);/);
  assert.match(app, /setView\(viewFromUrlRef\.current \? 'dream' : 'auth'\);/);
  // choosing a screen in this visit clears the "came from the address" flag, so MY DREAMS (signed out) still asks to sign in
  assert.match(app, /viewFromUrlRef\.current = false;/);
  assert.match(app, /const handleMyDreamsNav = \(\) => \{\s*setView\(user \? 'archive' : 'auth'\);/);
});

// ------------------------------------------------------------ diagnostics and untouched money paths

test('the server logs WHY a token was refused (status and code only, never the token)', () => {
  const src = read('server/callerIdentity.ts');
  const line = src.split('\n').find((l) => l.includes('auth_token_rejected')) ?? '';
  assert.match(line, /status=.*code=/);
  assert.ok(!/token\b/.test(line.replace('auth_token_rejected', '')), 'no token in the log line');
});

test('payment, credits and package code are untouched by this fix', () => {
  for (const file of ['src/auth/sessionGuard.ts', 'src/auth/revokedSession.ts', 'src/hero/dreamDraft.ts']) {
    assert.ok(!/payment|grow|make\.com|purchase|grant_credits/i.test(read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), file);
  }
});
