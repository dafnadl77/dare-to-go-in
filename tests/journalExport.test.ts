import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  buildJournalDocument,
  parseJournalRequest,
  type DreamRow,
  type ExportDeps,
  type JournalRequest,
  type PatternRow,
} from '../server/pdf/journalExport.ts';
import { handleDreamJournal, type DreamJournalDeps } from '../server/routes/dreamJournal.ts';
import { JOURNAL_LIMITS } from '../server/pdf/journalTypes.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const id = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const foreignId = (n: number) => `bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12, '0')}`;

/** A byte string that is a valid-enough JPEG header for size detection (never decoded in these tests). */
function fakeJpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9]);
}

function payload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sourceText: 'I stood at a door by the sea.',
    inputMode: 'text',
    dreamAnalysis: { summary: 'A door by the sea', reconstruction: { primarySetting: 'a house by the sea' } },
    selectedElement: 'the door',
    reflectionResponse: 'It feels like home.',
    dreamReflection: { observation: 'A door by the sea', possibleThread: 'A threshold.', continuityQuestion: 'What waits behind it?' },
    corrections: [],
    appLanguage: 'en',
    ...over,
  };
}

function row(n: number, over: { owner?: string; createdAt?: string; payload?: Record<string, unknown> } = {}): DreamRow {
  return { id: id(n), owner_id: over.owner ?? ME, created_at: over.createdAt ?? `2025-0${(n % 9) + 1}-10T10:00:00Z`, payload: over.payload ?? payload() };
}

interface Calls {
  entitlement: number;
  loadDreams: { ids: string[] | null }[];
  downloads: string[];
}

function deps(over: Partial<ExportDeps> & { rows?: DreamRow[]; entitled?: boolean | null; patterns?: PatternRow[] | null; images?: Record<string, Uint8Array> } = {}) {
  const calls: Calls = { entitlement: 0, loadDreams: [], downloads: [] };
  const rows = over.rows ?? [row(1), row(2), row(3)];
  const d: ExportDeps = {
    hasEntitlement: over.hasEntitlement ?? (async () => (calls.entitlement++, over.entitled === undefined ? true : over.entitled)),
    loadDreams:
      over.loadDreams ??
      (async (_user, ids) => {
        calls.loadDreams.push({ ids });
        return ids ? rows.filter((r) => ids.includes(r.id)) : rows;
      }),
    downloadImage:
      over.downloadImage ??
      (async (path) => {
        calls.downloads.push(path);
        return over.images?.[path] ?? null;
      }),
    loadPatterns: over.loadPatterns ?? (async () => (over.patterns === undefined ? [] : over.patterns)),
  };
  return { d, calls };
}

const ALL: JournalRequest = { all: true, dreamIds: [], language: 'en', timeZone: 'UTC' };
const pick = (...ids: string[]): JournalRequest => ({ all: false, dreamIds: ids, language: 'en', timeZone: 'UTC' });

// ============================================================ request parsing ====

test('request: exactly one of {all:true} or {dreamIds} is accepted, with a known language', () => {
  assert.equal(parseJournalRequest({ all: true, language: 'en' }).ok, true);
  assert.equal(parseJournalRequest({ dreamIds: [id(1)], language: 'he' }).ok, true);
  for (const bad of [null, undefined, 'x', 7, [], {}, { language: 'en' }, { all: true, dreamIds: [id(1)], language: 'en' }, { all: false, language: 'en' }, { all: true }, { all: true, language: 'fr' }, { dreamIds: [], language: 'en' }, { dreamIds: 'abc', language: 'en' }]) {
    assert.equal(parseJournalRequest(bad).ok, false, JSON.stringify(bad));
  }
});

test('request: malformed ids fail (no SQL-ish, traversal or non-uuid strings), duplicates collapse, oversized selections are export_too_large', () => {
  for (const bad of [['not-a-uuid'], ["' or 1=1 --"], ['../../etc/passwd'], [id(1), 5], [id(1), null], [`${id(1)}x`]]) {
    assert.deepEqual(parseJournalRequest({ dreamIds: bad, language: 'en' }), { ok: false, reason: 'invalid_request' }, JSON.stringify(bad));
  }
  const dup = parseJournalRequest({ dreamIds: [id(1), id(1).toUpperCase(), id(2)], language: 'en' });
  assert.equal(dup.ok && dup.value.dreamIds.length, 2);
  const tooMany = Array.from({ length: JOURNAL_LIMITS.maxDreams + 1 }, (_, i) => id(i + 1));
  assert.deepEqual(parseJournalRequest({ dreamIds: tooMany, language: 'en' }), { ok: false, reason: 'export_too_large' });
});

test('request: an owner / user id in the body is never read, and a bad time zone falls back to UTC', () => {
  const parsed = parseJournalRequest({ all: true, language: 'en', owner_id: OTHER, userId: OTHER, user_id: OTHER, timeZone: 'Not/AZone' });
  assert.ok(parsed.ok);
  assert.deepEqual(Object.keys(parsed.value).sort(), ['all', 'dreamIds', 'language', 'timeZone']);
  assert.equal(parsed.value.timeZone, 'UTC');
  assert.equal(parseJournalRequest({ all: true, language: 'en', timeZone: 'Asia/Jerusalem' }).ok && (parseJournalRequest({ all: true, language: 'en', timeZone: 'Asia/Jerusalem' }) as { value: JournalRequest }).value.timeZone, 'Asia/Jerusalem');
});

// ============================================================ entitlement ====

test('a non-entitled account cannot export: nothing is loaded, nothing is rendered', async () => {
  const { d, calls } = deps({ entitled: false });
  assert.deepEqual(await buildJournalDocument(ME, ALL, d), { ok: false, reason: 'entitlement_required' });
  assert.equal(calls.loadDreams.length, 0);
  assert.equal(calls.downloads.length, 0);
});

test('an entitled account can export all of its dreams', async () => {
  const { d } = deps({ entitled: true });
  const built = await buildJournalDocument(ME, ALL, d);
  assert.ok(built.ok);
  assert.equal(built.document.dreams.length, 3);
});

test('an unknown entitlement status fails closed (never exports on a database error)', async () => {
  const { d, calls } = deps({ entitled: null });
  assert.deepEqual(await buildJournalDocument(ME, ALL, d), { ok: false, reason: 'not_configured' });
  assert.equal(calls.loadDreams.length, 0);
});

test('eligibility never depends on credits, balance, dream count or usage: the export code has no such input at all', () => {
  const sources = ['server/pdf/journalExport.ts', 'server/routes/dreamJournal.ts', 'server/entitlements.ts']
    .map((f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''))
    .join('\n');
  assert.ok(!/get_credit_balance|getCreditBalance|dream_credits|credit_ledger|\bbalance\b|dream_attempts/.test(sources));
  // the only gate is the durable entitlement
  assert.match(read('server/pdf/journalExport.ts'), /deps\.hasEntitlement\(userId\)/);
  assert.match(read('server/entitlements.ts'), /rpc\('has_entitlement'/);
});

test('an entitlement granted at purchase persists at ZERO credits: the same decision is made whatever the credit state', async () => {
  // The decision function receives only the entitlement answer; a zero balance cannot change it.
  const { d } = deps({ entitled: true });
  const first = await buildJournalDocument(ME, ALL, d);
  const afterSpendingEverything = await buildJournalDocument(ME, ALL, d);
  assert.ok(first.ok && afterSpendingEverything.ok);
});

// ============================================================ ownership ====

test('selected export: only the chosen dreams, in date order', async () => {
  const { d } = deps({ rows: [row(1, { createdAt: '2025-03-01T00:00:00Z' }), row(2, { createdAt: '2025-01-01T00:00:00Z' }), row(3)] });
  const built = await buildJournalDocument(ME, pick(id(1), id(2)), d);
  assert.ok(built.ok);
  assert.deepEqual(built.document.dreams.map((x) => x.id), [id(2), id(1)]);
});

test('a user cannot export another user\'s dream: a foreign id fails the request, identically to a nonexistent one', async () => {
  const foreignRow: DreamRow = { id: foreignId(1), owner_id: OTHER, created_at: '2025-02-01T00:00:00Z', payload: payload({ sourceText: 'SECRET OF SOMEONE ELSE' }) };
  const { d } = deps({ rows: [row(1), foreignRow] }); // even if row-level security failed and returned it
  const foreign = await buildJournalDocument(ME, pick(foreignId(1)), d);
  const missing = await buildJournalDocument(ME, pick('cccccccc-cccc-4ccc-8ccc-000000000009'), deps({ rows: [row(1)] }).d);
  assert.deepEqual(foreign, { ok: false, reason: 'dreams_not_found' });
  assert.deepEqual(missing, foreign, 'the answer reveals nothing about whether the id exists');
});

test('a MIXED selection (own + foreign ids) fails safely as a whole: no partial journal, no foreign content', async () => {
  const foreignRow: DreamRow = { id: foreignId(2), owner_id: OTHER, created_at: '2025-02-01T00:00:00Z', payload: payload({ sourceText: 'SECRET OF SOMEONE ELSE' }) };
  const { d } = deps({ rows: [row(1), row(2), foreignRow] });
  const built = await buildJournalDocument(ME, pick(id(1), id(2), foreignId(2)), d);
  assert.deepEqual(built, { ok: false, reason: 'dreams_not_found' });
  assert.ok(!JSON.stringify(built).includes('SECRET'));
});

test('an all-dream export includes only rows owned by the caller, even if a foreign row slipped into the query result', async () => {
  const foreignRow: DreamRow = { id: foreignId(3), owner_id: OTHER, created_at: '2025-02-01T00:00:00Z', payload: payload({ sourceText: 'SECRET OF SOMEONE ELSE' }) };
  const { d } = deps({ rows: [row(1), foreignRow] });
  const built = await buildJournalDocument(ME, ALL, d);
  assert.ok(built.ok);
  assert.deepEqual(built.document.dreams.map((x) => x.id), [id(1)]);
  assert.ok(!JSON.stringify(built.document).includes('SECRET'));
});

test('an empty archive says so instead of producing an empty journal', async () => {
  assert.deepEqual(await buildJournalDocument(ME, ALL, deps({ rows: [] }).d), { ok: false, reason: 'nothing_to_export' });
});

test('the dreams are read with the caller\'s own session (RLS), never the service role, and the owner filter is explicit', () => {
  const route = read('server/routes/dreamJournal.ts');
  assert.match(route, /getSupabaseUserScopedClient\(accessToken\)/);
  assert.match(route, /\.eq\('owner_id', id\)/);
  assert.ok(!/getSupabaseServiceClient/.test(route), 'no service-role client in the export route');
  assert.ok(!/SERVICE_ROLE/.test(read('server/pdf/journalExport.ts') + read('server/pdf/journalRender.ts')));
});

// ============================================================ images / SSRF ====

const OWN_IMAGE = (n: number) => `${ME}/${id(n)}.jpg`;

test('an image is read ONLY from the caller\'s own storage folder, through the validated path', async () => {
  const path = OWN_IMAGE(1);
  const { d, calls } = deps({ rows: [row(1, { payload: payload({ dreamImagePath: path }) })], images: { [path]: fakeJpeg(1536, 1024) } });
  const built = await buildJournalDocument(ME, ALL, d);
  assert.ok(built.ok);
  assert.deepEqual(calls.downloads, [path]);
  assert.deepEqual([built.document.dreams[0].image?.width, built.document.dreams[0].image?.height], [1536, 1024]);
  assert.match(built.document.dreams[0].image!.dataUri, /^data:image\/jpeg;base64,/);
});

test('a dreamImagePath pointing at ANOTHER user\'s folder, a traversal, or a URL is never fetched (payload JSON is user-writable)', async () => {
  const hostile = [`${OTHER}/${id(1)}.jpg`, `${ME}/../${OTHER}/${id(1)}.jpg`, `../${OTHER}/x.jpg`, `${ME}/${id(1)}.png`, `${ME}/sub/${id(1)}.jpg`, 'https://evil.example/a.jpg', 'http://169.254.169.254/latest/meta-data', '//evil.example/x', `${ME}/${id(1)}.jpg/../../x`, ''];
  for (const path of hostile) {
    const { d, calls } = deps({ rows: [row(1, { payload: payload({ dreamImagePath: path }) })], images: { [path]: fakeJpeg(10, 10) } });
    const built = await buildJournalDocument(ME, ALL, d);
    assert.ok(built.ok, path);
    assert.deepEqual(calls.downloads, [], `must not fetch ${path}`);
    assert.equal(built.document.dreams[0].image, null, path);
  }
});

test('an arbitrary remote image URL is rejected in the legacy field too: only a base64 data URI of a REAL image is accepted', async () => {
  const good = `data:image/jpeg;base64,${Buffer.from(fakeJpeg(800, 600)).toString('base64')}`;
  const cases: [string, boolean][] = [
    [good, true],
    ['https://evil.example/x.jpg', false],
    ['http://127.0.0.1:8787/api/secret', false],
    ['file:///etc/passwd', false],
    ['data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==', false],
    [`data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>').toString('base64')}`, false],
    [`data:image/jpeg;base64,${Buffer.from('this is not an image at all').toString('base64')}`, false],
    ['javascript:alert(1)', false],
  ];
  for (const [value, accepted] of cases) {
    const { d, calls } = deps({ rows: [row(1, { payload: payload({ dreamImageDataUrl: value }) })] });
    const built = await buildJournalDocument(ME, ALL, d);
    assert.ok(built.ok);
    assert.equal(!!built.document.dreams[0].image, accepted, value.slice(0, 40));
    assert.deepEqual(calls.downloads, []);
  }
});

test('bytes at the right path that are not an image are dropped (no mislabeled content is embedded)', async () => {
  const path = OWN_IMAGE(1);
  const { d } = deps({ rows: [row(1, { payload: payload({ dreamImagePath: path }) })], images: { [path]: new TextEncoder().encode('<html>not an image</html>') } });
  const built = await buildJournalDocument(ME, ALL, d);
  assert.ok(built.ok);
  assert.equal(built.document.dreams[0].image, null);
});

test('the PDF pipeline never fetches by URL: no fetch/http/axios anywhere in the journal modules, no AI client, no remote image support', () => {
  for (const f of readdirSync(new URL('../server/pdf', import.meta.url)).filter((x) => x.endsWith('.ts'))) {
    const src = read(`server/pdf/${f}`).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/\bfetch\(|node:https?|axios|openai|responses\.create/i.test(src), f);
  }
  const route = read('server/routes/dreamJournal.ts');
  assert.ok(!/openai|responses\.create|getOpenAIClient/i.test(route), 'no AI call can happen during an export');
});

// ============================================================ limits ====

test('an archive over the dream limit is refused for "all" (export_too_large), never truncated silently', async () => {
  const rows = Array.from({ length: JOURNAL_LIMITS.maxDreams + 1 }, (_, i) => row(i + 1));
  assert.deepEqual(await buildJournalDocument(ME, ALL, deps({ rows }).d), { ok: false, reason: 'export_too_large' });
});

test('an oversized export fails safely: total image bytes and total text are bounded', async () => {
  const big = fakeJpeg(1536, 1024);
  const huge = new Uint8Array(JOURNAL_LIMITS.maxSingleImageBytes - 10);
  huge.set(big);
  const rows: DreamRow[] = [];
  const images: Record<string, Uint8Array> = {};
  for (let i = 1; i <= 9; i += 1) {
    rows.push(row(i, { payload: payload({ dreamImagePath: OWN_IMAGE(i) }) }));
    images[OWN_IMAGE(i)] = huge;
  }
  assert.deepEqual(await buildJournalDocument(ME, ALL, deps({ rows, images }).d), { ok: false, reason: 'export_too_large' });
  const longText = 'x'.repeat(JOURNAL_LIMITS.maxTotalTextChars + 1);
  assert.deepEqual(await buildJournalDocument(ME, ALL, deps({ rows: [row(1, { payload: payload({ sourceText: longText }) })] }).d), { ok: false, reason: 'export_too_large' });
});

// ============================================================ fields ====

test('only fields that actually exist are used: missing optional fields become null, never invented', async () => {
  const sparse = row(1, { payload: { sourceText: 'Just the words.', dreamAnalysis: { summary: '', reconstruction: {} } } });
  const garbage = row(2, { payload: 'not even an object' as never });
  const built = await buildJournalDocument(ME, ALL, deps({ rows: [sparse, garbage] }).d);
  assert.ok(built.ok);
  const [a, b] = built.document.dreams;
  assert.deepEqual([a.selectedElement, a.association, a.thread, a.question, a.image], [null, null, null, null, null]);
  assert.equal(a.sourceText, 'Just the words.');
  assert.equal(b.sourceText, '');
  assert.ok(a.title.length > 0 && b.title.length > 0, 'a title always exists (the archive\'s own derivation or its localized fallback)');
});

test('each dream keeps the language it is written in (a mixed archive stays mixed; nothing is translated)', async () => {
  const he = row(1, { payload: payload({ sourceText: 'חלמתי על בית ליד הים', dreamAnalysis: { summary: 'בית ליד הים', reconstruction: { primarySetting: 'בית ליד הים' } }, appLanguage: 'he' }) });
  const en = row(2, { payload: payload({ appLanguage: 'en' }) });
  const built = await buildJournalDocument(ME, { ...ALL, language: 'en' }, deps({ rows: [he, en] }).d);
  assert.ok(built.ok);
  assert.deepEqual(built.document.dreams.map((x) => x.language), ['he', 'en']);
  assert.equal(built.document.dreams[0].sourceText, 'חלמתי על בית ליד הים');
});

// ============================================================ patterns ====

const REFLECTION = { whatRepeats: 'Water returns.', possibleConnection: 'It may connect.', directionToExplore: 'Notice when.', question: 'When?' };
const pattern = (over: Partial<PatternRow> = {}): PatternRow => ({
  concept_id: 'water',
  language: 'en',
  dream_ids: [id(1), id(2)],
  reflection: REFLECTION,
  created_at: '2025-05-01T00:00:00Z',
  ...over,
});

test('Patterns Across My Dreams appears ONLY when suitable stored Pattern Reflection data exists', async () => {
  const withImages = [row(1, { payload: payload({ dreamImagePath: OWN_IMAGE(1) }) }), row(2)];
  const images = { [OWN_IMAGE(1)]: fakeJpeg(900, 600) };
  const none = await buildJournalDocument(ME, ALL, deps({ rows: withImages, images, patterns: [] }).d);
  assert.ok(none.ok && none.document.patterns.length === 0);
  const nullPatterns = await buildJournalDocument(ME, ALL, deps({ rows: withImages, images, patterns: null }).d);
  assert.ok(nullPatterns.ok && nullPatterns.document.patterns.length === 0);

  const some = await buildJournalDocument(ME, ALL, deps({ rows: withImages, images, patterns: [pattern()] }).d);
  assert.ok(some.ok);
  assert.equal(some.document.patterns.length, 1);
  assert.equal(some.document.patterns[0].whatRepeats, 'Water returns.');
  assert.ok(some.document.patterns[0].thumbnail, 'a real image from one of the pattern\'s own dreams');
});

test('a pattern is excluded when it concerns a dream that is not in the export, when its stored reflection is malformed, or its concept is unknown', async () => {
  const rows = [row(1), row(2)];
  const built = await buildJournalDocument(
    ME,
    ALL,
    deps({
      rows,
      patterns: [
        pattern({ dream_ids: [id(1), foreignId(1)] }),
        pattern({ concept_id: 'family', reflection: { whatRepeats: 'only one field' } }),
        pattern({ concept_id: 'not_a_concept' }),
        pattern({ concept_id: 'flying', dream_ids: [] }),
      ],
    }).d,
  );
  assert.ok(built.ok);
  assert.equal(built.document.patterns.length, 0);
});

test('per concept the newest stored row wins, preferring the export language; the section is never generated', async () => {
  const rows = [row(1), row(2)];
  const built = await buildJournalDocument(
    ME,
    { ...ALL, language: 'he' },
    deps({
      rows,
      patterns: [
        pattern({ language: 'en', created_at: '2025-09-01T00:00:00Z', reflection: { ...REFLECTION, whatRepeats: 'EN newest' } }),
        pattern({ language: 'he', created_at: '2025-05-01T00:00:00Z', reflection: { ...REFLECTION, whatRepeats: 'HE older' } }),
      ],
    }).d,
  );
  assert.ok(built.ok);
  assert.equal(built.document.patterns.length, 1);
  assert.equal(built.document.patterns[0].whatRepeats, 'HE older');
  assert.equal(built.document.patterns[0].language, 'he');
});

// ============================================================ the route ====

function routeDeps(over: { verified?: boolean; entitled?: boolean; renderDelay?: Promise<void> } = {}) {
  const log = { exportDepsCalledWith: [] as string[], rendered: 0, builtFor: [] as string[] };
  const exp = deps({ entitled: over.entitled ?? true }).d;
  const wrapped: ExportDeps = {
    ...exp,
    loadDreams: async (user, ids) => {
      log.builtFor.push(user);
      return exp.loadDreams(user, ids);
    },
  };
  const r: DreamJournalDeps = {
    verifyBearer: async () => (over.verified === false ? { ok: false, status: 401, reason: 'not_authenticated', message: 'bad' } : { ok: true, userId: ME }),
    exportDeps: (userId) => (log.exportDepsCalledWith.push(userId), wrapped),
    render: async () => {
      log.rendered += 1;
      if (over.renderDelay) await over.renderDelay;
      return { pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46]) };
    },
  };
  return { r, log };
}

test('route: unauthenticated and invalid-token requests fail before anything else', async () => {
  const { r, log } = routeDeps();
  assert.equal((await handleDreamJournal({ all: true, language: 'en' }, {}, r)).status, 401);
  const bad = routeDeps({ verified: false });
  assert.equal((await handleDreamJournal({ all: true, language: 'en' }, { authorization: 'Bearer nope' }, bad.r)).status, 401);
  assert.equal(log.exportDepsCalledWith.length + bad.log.exportDepsCalledWith.length, 0);
});

test('route: malformed requests are 400, an oversized selection is 413, and nothing is rendered', async () => {
  const { r, log } = routeDeps();
  for (const body of [null, {}, { all: true }, { dreamIds: ['x'], language: 'en' }, { all: true, dreamIds: [id(1)], language: 'en' }]) {
    assert.equal((await handleDreamJournal(body, { authorization: 'Bearer ok' }, r)).status, 400, JSON.stringify(body));
  }
  const many = Array.from({ length: JOURNAL_LIMITS.maxDreams + 1 }, (_, i) => id(i + 1));
  assert.equal((await handleDreamJournal({ dreamIds: many, language: 'en' }, { authorization: 'Bearer ok' }, r)).status, 413);
  assert.equal(log.rendered, 0);
});

test('route: a non-entitled account gets 403 entitlement_required and no PDF is rendered', async () => {
  const { r, log } = routeDeps({ entitled: false });
  const res = await handleDreamJournal({ all: true, language: 'en' }, { authorization: 'Bearer ok' }, r);
  assert.equal(res.status, 403);
  assert.equal((res as { body: { reason: string } }).body.reason, 'entitlement_required');
  assert.equal(log.rendered, 0);
});

test('route: an entitled account receives the PDF bytes, rendered once, for the VERIFIED user (a forged owner id in the body is ignored)', async () => {
  const { r, log } = routeDeps();
  const res = await handleDreamJournal({ all: true, language: 'en', owner_id: OTHER, userId: OTHER }, { authorization: 'Bearer ok' }, r);
  assert.equal(res.status, 200);
  assert.ok('pdf' in res && res.pdf.length > 0);
  assert.equal(log.rendered, 1);
  assert.deepEqual(log.exportDepsCalledWith, [ME]);
  assert.deepEqual(log.builtFor, [ME]);
});

test('route: a second export while one is running answers 429 (each export launches a browser)', async () => {
  let release!: () => void;
  const gate = new Promise<void>((res) => (release = res));
  const { r } = routeDeps({ renderDelay: gate });
  const first = handleDreamJournal({ all: true, language: 'en' }, { authorization: 'Bearer ok' }, r);
  await new Promise((res) => setTimeout(res, 20));
  const second = await handleDreamJournal({ all: true, language: 'en' }, { authorization: 'Bearer ok' }, r);
  assert.equal(second.status, 429);
  release();
  assert.equal((await first).status, 200);
  assert.equal((await handleDreamJournal({ all: true, language: 'en' }, { authorization: 'Bearer ok' }, r)).status, 200, 'the lock is released afterwards');
});

test('route: a render failure is a generic 500 and the log never contains dream content', async () => {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void lines.push(args.map(String).join(' '));
  try {
    const { r } = routeDeps();
    r.render = async () => {
      throw new Error('boom with I stood at a door by the sea.');
    };
    const res = await handleDreamJournal({ all: true, language: 'en' }, { authorization: 'Bearer ok' }, r);
    assert.equal(res.status, 500);
    assert.ok(!JSON.stringify((res as { body: unknown }).body).includes('boom'));
    assert.ok(lines.length >= 1 && lines.every((l) => !l.includes('door by the sea') && !l.includes('boom')));
  } finally {
    console.error = original;
  }
});

test('privacy: nothing is stored or shared: no upload, no signed/public URL, no file write; the PDF is streamed back', () => {
  const sources = [...readdirSync(new URL('../server/pdf', import.meta.url)).filter((x) => x.endsWith('.ts')).map((f) => read(`server/pdf/${f}`)), read('server/routes/dreamJournal.ts'), read('api/dream-journal.ts')].join('\n');
  assert.ok(!/\.upload\(|createSignedUrl|getPublicUrl|writeFile|writeFileSync|createWriteStream|\.from\('journal/.test(sources));
  const api = read('api/dream-journal.ts');
  assert.match(api, /Cache-Control', 'no-store'/);
  assert.match(api, /application\/pdf/);
  assert.match(api, /res\.write\(/);
});
