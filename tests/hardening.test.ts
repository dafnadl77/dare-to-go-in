import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { enforceRateLimits, transcriptionRules, type RateLimitStore, type RateOutcome } from '../server/rateLimit.ts';
import { en, he } from '../src/i18n/translations.ts';

/**
 * The pre-launch security / stability round: transcription rate limit (shared across instances, in the database), image upload limits,
 * security headers with a CSP, and the inactive record circle when no microphone exists.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// ------------------------------------------------------------ the counter, as real SQL
let db: PGlite;
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; grant usage on schema public to anon, authenticated, service_role;`);
  await db.exec(read('supabase/migrations/20261010_rate_limits.sql'));
});
after(async () => {
  await db.close();
});

type Taken = { status: string; hits?: number; retry_after?: number };
const take = async (bucket: string, limit: number, seconds: number): Promise<Taken> => (await db.query<{ r: Taken }>('select public.take_rate_limit($1, $2, $3) as r', [bucket, limit, seconds])).rows[0].r;

test('the counter allows exactly `limit` hits in a window, then says limited with a wait of 1..window seconds', async () => {
  for (let i = 1; i <= 6; i += 1) assert.deepEqual(await take('t:a', 6, 60), { status: 'ok', hits: i });
  const over = await take('t:a', 6, 60);
  assert.equal(over.status, 'limited');
  assert.ok(over.retry_after! >= 1 && over.retry_after! <= 60, `retry_after ${over.retry_after}`);
  assert.equal((await take('t:a', 6, 60)).status, 'limited', 'it stays limited for the rest of the window');
});

test('buckets are independent: one account\'s limit never affects another\'s', async () => {
  for (let i = 0; i < 7; i += 1) await take('t:user-1', 6, 60);
  assert.equal((await take('t:user-1', 6, 60)).status, 'limited');
  assert.deepEqual(await take('t:user-2', 6, 60), { status: 'ok', hits: 1 });
});

test('simultaneous requests cannot both take the last slot (the increment is one atomic statement)', async () => {
  const results = await Promise.all(Array.from({ length: 30 }, () => take('t:burst', 10, 60)));
  assert.equal(results.filter((r) => r.status === 'ok').length, 10);
  assert.equal(results.filter((r) => r.status === 'limited').length, 20);
});

test('a new window starts from zero, and old windows are not counted', async () => {
  await db.exec("insert into public.rate_limits (bucket, window_start, hits) values ('t:old', now() - interval '3 hours', 999)");
  assert.deepEqual(await take('t:old', 5, 60), { status: 'ok', hits: 1 });
});

test('nonsense arguments are "invalid", never "ok" by accident', async () => {
  for (const [b, l, w] of [['', 5, 60], ['x', 0, 60], ['x', 5, 0], ['x', 5, 86401], ['x', 100001, 60]] as const) assert.equal((await take(b, l, w)).status, 'invalid');
  assert.equal((await db.query<{ r: Taken }>("select public.take_rate_limit(null, 5, 60) as r")).rows[0].r.status, 'invalid');
});

test('only the service role can use the counter: the browser can neither read nor write it', async () => {
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query<{ r: boolean }>(`select has_function_privilege('${role}', 'public.take_rate_limit(text, integer, integer)', 'execute') as r`)).rows[0].r, false, role);
    for (const priv of ['select', 'insert', 'update', 'delete']) {
      assert.equal((await db.query<{ r: boolean }>(`select has_table_privilege('${role}', 'public.rate_limits', '${priv}') as r`)).rows[0].r, false, `${role} ${priv}`);
    }
  }
  assert.equal((await db.query<{ r: boolean }>("select has_function_privilege('service_role', 'public.take_rate_limit(text, integer, integer)', 'execute') as r")).rows[0].r, true);
  assert.equal((await db.query<{ r: boolean }>("select relrowsecurity as r from pg_class where oid = 'public.rate_limits'::regclass")).rows[0].r, true);
});

// ------------------------------------------------------------ the policy around it
function fakeStore(script: (bucket: string) => RateOutcome) {
  const taken: string[] = [];
  const store: RateLimitStore = { take: async (bucket) => (taken.push(bucket), script(bucket)) };
  return { store, taken };
}

test('enforceRateLimits: allows within limits, stops at the first exceeded window, keys are per account and per rule', async () => {
  const ok = fakeStore(() => ({ status: 'ok' }));
  assert.deepEqual(await enforceRateLimits(ok.store, 'transcribe', 'user-1', transcriptionRules({})), { allowed: true });
  assert.deepEqual(ok.taken, ['transcribe:m:user-1', 'transcribe:h:user-1']);

  const limited = fakeStore((b) => (b.includes(':m:') ? { status: 'limited', retryAfterSeconds: 17 } : { status: 'ok' }));
  assert.deepEqual(await enforceRateLimits(limited.store, 'transcribe', 'user-1', transcriptionRules({})), { allowed: false, retryAfterSeconds: 17 });
  assert.deepEqual(limited.taken, ['transcribe:m:user-1'], 'the hourly counter is not touched once the minute limit already refused');
});

test('a counter that cannot be read NEVER locks out a customer (it is logged, and the other protections still apply)', async () => {
  const down = fakeStore(() => ({ status: 'unknown' }));
  const warnings: string[] = [];
  assert.deepEqual(await enforceRateLimits(down.store, 'transcribe', 'u', transcriptionRules({}), (m) => warnings.push(m)), { allowed: true });
  assert.ok(warnings.length > 0 && warnings.every((w) => w.startsWith('rate_limit_unavailable')));
});

test('the limits: 6 a minute and 40 an hour by default (generous for real use), overridable, never below 1', () => {
  assert.deepEqual(transcriptionRules({}).map((r) => [r.name, r.limit, r.windowSeconds]), [['m', 6, 60], ['h', 40, 3600]]);
  assert.deepEqual(transcriptionRules({ DARE_TRANSCRIBE_PER_MINUTE: '3', DARE_TRANSCRIBE_PER_HOUR: '10' }).map((r) => r.limit), [3, 10]);
  assert.deepEqual(transcriptionRules({ DARE_TRANSCRIBE_PER_MINUTE: '0', DARE_TRANSCRIBE_PER_HOUR: 'abc' }).map((r) => r.limit), [6, 40]);
});

test('the transcription route applies it to signed-in, paying accounts after the credit check, never to the owner, and answers 429 with Retry-After', () => {
  const route = code('server/routes/dreamTranscription.ts');
  const credit = route.indexOf('credits_required');
  const limit = route.indexOf('enforceRateLimits(');
  const model = route.indexOf('client.audio.transcriptions.create');
  assert.ok(credit > 0 && limit > credit && model > limit, 'credit check, then rate limit, then the model call');
  assert.match(route, /ownerCheck !== true\) \{[\s\S]*enforceRateLimits\(databaseRateLimitStore, 'transcribe', resolved\.identity\.userId, transcriptionRules\(\), console\.warn\)/);
  assert.match(route, /errorResult\(429, 'rate_limited'/);
  assert.match(route, /'Retry-After': String\(decision\.retryAfterSeconds\)/);
  // the real store uses the database function, with the service role only
  const store = code('server/rateLimit.ts');
  assert.match(store, /client\.rpc\('take_rate_limit'/);
  assert.ok(!/new Map|Map<|let \w+ = \{\}|globalThis/.test(store), 'no in-memory counter');
});

test('a rate-limited recording gets its own kind message (both languages) and can be retried or typed instead', () => {
  assert.match(en.hold.transcriptionRateLimited, /wait a minute/i);
  assert.match(he.hold.transcriptionRateLimited, /להמתין דקה/);
  const hold = read('src/hero/HoldToRemember.tsx');
  assert.match(hold, /case 'rate_limited':\s*return t\('hold\.transcriptionRateLimited'\);/);
  assert.match(hold, /RETRYABLE_TRANSCRIPTION_FAILURES = new Set<TranscriptionErrorReason>\(\[[^\]]*'rate_limited'/);
});

// ------------------------------------------------------------ image uploads
test('the image bucket accepts only approved image types up to 5 MB, and the migration touches nothing that is already stored', () => {
  const sql = read('supabase/migrations/20261010_dream_images_bucket_limits.sql').replace(/--.*$/gm, '');
  assert.match(sql, /file_size_limit = 5242880/);
  assert.match(sql, /allowed_mime_types = array\['image\/jpeg', 'image\/png', 'image\/webp'\]/);
  assert.match(sql, /where id = 'dream-images'/);
  assert.ok(!/storage\.objects|delete|drop|truncate/i.test(sql), 'no stored object is touched');
});

test('what the app uploads fits those limits: one jpeg per dream, content type taken from the generated data URL', () => {
  const image = read('server/routes/dreamImage.ts');
  assert.match(image, /output_format: 'jpeg'/);
  assert.match(image, /data:image\/jpeg;base64,/);
  const storage = read('src/hero/dreamImageStorage.ts');
  assert.match(storage, /contentType: decoded\.contentType/);
  assert.match(read('src/hero/dreamImagePath.ts'), /\.jpg/);
});

// ------------------------------------------------------------ security headers
test('vercel.json sends the security headers, and the CSP covers exactly the services the app uses', () => {
  const cfg = JSON.parse(read('vercel.json')) as { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };
  const rule = cfg.headers.find((h) => h.source === '/(.*)')!;
  const header = (k: string) => rule.headers.find((h) => h.key === k)?.value ?? '';
  assert.equal(header('X-Frame-Options'), 'DENY');
  assert.equal(header('X-Content-Type-Options'), 'nosniff');
  assert.equal(header('Referrer-Policy'), 'strict-origin-when-cross-origin');
  assert.match(header('Permissions-Policy'), /microphone=\(self\)/, 'recording keeps working');
  const csp = header('Content-Security-Policy');
  const dir = (name: string) => csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name} `)) ?? '';
  assert.equal(dir('script-src'), "script-src 'self'", 'no inline or eval script');
  assert.ok(!/unsafe-eval|unsafe-inline/.test(dir('script-src')));
  assert.match(dir('frame-ancestors'), /'none'/);
  assert.match(dir('object-src'), /'none'/);
  assert.match(dir('base-uri'), /'self'/);
  assert.match(dir('connect-src'), /'self' https:\/\/eijfvsktvfplccolqdpp\.supabase\.co/);
  assert.match(dir('img-src'), /data: blob: https:\/\/eijfvsktvfplccolqdpp\.supabase\.co/, 'generated images are data URLs, saved ones signed Storage URLs');
  assert.match(dir('media-src'), /'self' blob:/);
  assert.match(dir('font-src'), /https:\/\/fonts\.gstatic\.com/);
  assert.match(dir('style-src'), /https:\/\/fonts\.googleapis\.com/);
  // every external origin the page itself references is allowed
  const html = read('index.html');
  for (const origin of new Set(html.match(/https:\/\/[a-z.]+(?=[/"'])/g) ?? [])) {
    if (/w3\.org/.test(origin)) continue;
    assert.ok(csp.includes(origin), `${origin} (index.html) must be in the CSP`);
  }
  assert.ok(!/<script(?![^>]*src=)[^>]*>/.test(html), 'index.html has no inline script (the CSP forbids it)');
});

// ------------------------------------------------------------ the record circle without a microphone
test('no microphone: the circle stays visible but inactive, with the explanation, a prominent "write your dream", and a re-check', () => {
  const hold = code('src/hero/HoldToRemember.tsx');
  assert.match(hold, /const beginHold = useCallback\(\(\) => \{\s*if \(noMicrophone\) return;/);
  assert.match(hold, /aria-disabled=\{noMicrophone \? true : undefined\}/);
  assert.match(hold, /\{noMicrophone && \(\s*<button type="button" className="htr-recheck"[^>]*onClick=\{recheckMic\}/);
  assert.match(hold, /noMicrophone \? t\('hold\.writeYourDream'\)/);
  const css = code('src/hero/HoldToRemember.css');
  assert.match(css, /\.htr-circle\.is-no-mic \{\s*cursor: not-allowed;/);
  assert.equal(he.hold.micRecheck, 'חיברתי מיקרופון — לבדיקה חוזרת');
  assert.equal(en.hold.micRecheck, 'I connected a microphone — check again');
});

test('recording is decided by what the device can do, never by "desktop" or "mobile": no device sniffing in the recording path', () => {
  for (const file of ['src/hero/micAvailability.ts', 'src/hero/HoldToRemember.tsx', 'src/hero/dreamRecorderController.ts', 'src/hero/liveWordsPolicy.ts']) {
    const text = code(file);
    assert.ok(!/userAgent\b|isMobile|isTouch|matchMedia\('\(hover|pointer: coarse|navigator\.platform/.test(text), file);
  }
  // the one family check (Chromium lists devices before permission, so an empty list is trustworthy there) is about the BROWSER's behaviour
  assert.match(code('src/hero/micAvailability.ts'), /export function isChromiumFamily/);
  const mic = code('src/hero/micAvailability.ts');
  assert.match(mic, /md\?\.addEventListener\?\.\('devicechange', recheck\)/, 'plugging a microphone in is picked up without a reload');
});

test('billing, credits, Owner, payments and the design are untouched by this round', () => {
  for (const file of ['server/payments/paymentComplete.ts', 'server/payments/checkoutStart.ts', 'server/payments/checkoutPackages.ts', 'api/payment-complete.ts']) {
    assert.ok(!/rateLimit\.js|take_rate_limit|enforceRateLimits/.test(read(file)), `${file} must not use the new transcription counter`);
  }
  const rl = code('server/rateLimit.ts') + read('supabase/migrations/20261010_rate_limits.sql').replace(/--.*$/gm, '');
  assert.ok(!/dream_credits|credit_ledger|grant_credits|start_user_attempt|app_owners/.test(rl));
});
