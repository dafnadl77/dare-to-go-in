import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDemoRouter } from '../src/demo/demoRouter.ts';
import { validateDreamAnalysis } from '../src/hero/dreamAnalysisSchema.ts';
import { validateDreamReflectionResult } from '../src/hero/dreamReflectionSchema.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const ORIGIN = 'https://preview.example';

function setup() {
  const passed: string[] = [];
  const router = createDemoRouter({
    origin: ORIGIN,
    delay: async () => {},
    now: () => Date.parse('2026-10-13T12:00:00Z'),
    realFetch: async (input) => {
      passed.push(String(input));
      return new Response('static', { status: 200 });
    },
  });
  return { router, passed };
}

const post = (router: ReturnType<typeof setup>['router'], path: string, body: unknown) =>
  router.handle(`${ORIGIN}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('demo: every /api request is answered inside the browser and never sent anywhere', async () => {
  const { router, passed } = setup();
  for (const path of ['/api/dream-analysis', '/api/dream-reflection', '/api/dream-element-labels', '/api/dream-transcription', '/api/dream-translation', '/api/pattern-reflection', '/api/credits', '/api/delete-account', '/api/trial-session', '/api/claim-trial']) {
    const res = await post(router, path, { sourceText: 'x', texts: ['a'], emotions: [] });
    assert.ok(res.status < 600, path);
  }
  assert.equal(passed.length, 0, 'no /api request reaches the real fetch');
  assert.equal(router.stats.mocked, 10);
  assert.equal(router.stats.blocked, 0);
});

test('demo: the live Supabase project, any other host and any non-GET to the site are refused, and the real fetch is never called', async () => {
  const { router, passed } = setup();
  const attempts: Array<[string, string]> = [
    ['https://eijfvsktvfplccolqdpp.supabase.co/rest/v1/dreams', 'GET'],
    ['https://eijfvsktvfplccolqdpp.supabase.co/auth/v1/token?grant_type=password', 'POST'],
    ['https://api.openai.com/v1/responses', 'POST'],
    ['https://example.org/x', 'GET'],
    [`${ORIGIN}/some-page`, 'POST'],
    [`${ORIGIN}/some-page`, 'DELETE'],
  ];
  for (const [url, method] of attempts) {
    const res = await router.handle(url, { method });
    assert.equal(res.status, 403, `${method} ${url}`);
  }
  assert.equal(passed.length, 0);
  assert.equal(router.stats.blocked, attempts.length);
});

test('demo: same-site static files (pictures, the video, fonts) still load normally', async () => {
  const { router, passed } = setup();
  const res = await router.handle(`${ORIGIN}/dream-assets/dream-art-alt.jpg`);
  assert.equal(res.status, 200);
  assert.deepEqual(passed, [`${ORIGIN}/dream-assets/dream-art-alt.jpg`]);
  assert.equal(router.stats.passed, 1);
});

test('demo: the invented analysis and reflection pass the product\'s own validators, in Hebrew and English', async () => {
  const { router } = setup();
  for (const language of ['he', 'en']) {
    const a = await (await post(router, '/api/dream-analysis', { sourceText: 'a dream', language })).json();
    assert.ok(validateDreamAnalysis(a), `analysis ${language}`);
    const r = await (await post(router, '/api/dream-reflection', { language, emotions: ['longing', 'calm'], reflectionResponse: 'a note' })).json();
    const checked = validateDreamReflectionResult(r);
    assert.ok(checked, `reflection ${language}`);
    assert.ok(checked.emotionReflection && checked.summary, 'feelings reading and summary present when feelings were named');
    const labels = await (await post(router, '/api/dream-element-labels', { language, elements: ['a', 'b', 'c'] })).json();
    assert.equal(labels.labels.length, 3);
  }
});

test('demo: the feelings reading names the chosen feelings in the dreamer\'s language and disappears when none were chosen', async () => {
  const { router } = setup();
  const he = await (await post(router, '/api/dream-reflection', { language: 'he', emotions: ['fear', 'calm', 'love'] })).json();
  assert.match(he.emotionReflection, /פחד, שלווה ואהבה/);
  assert.doesNotMatch(he.emotionReflection, /[A-Za-z]/);
  const en = await (await post(router, '/api/dream-reflection', { language: 'en', emotions: ['fear', 'calm'] })).json();
  assert.match(en.emotionReflection, /fear and calm/i);
  const none = await (await post(router, '/api/dream-reflection', { language: 'he', emotions: [] })).json();
  assert.equal(none.emotionReflection, null);
  assert.ok(none.summary);
});

test('demo: its own Supabase keeps dreams in memory only (list, save, favourite, delete) and signs in a demo account', async () => {
  const { router } = setup();
  const list = async () => (await router.handle(`${ORIGIN}/__demo/rest/v1/dreams?select=*&order=created_at.desc`)).json();
  const start = await list();
  assert.equal(start.length, 6);
  assert.ok(start.some((r: { payload: { emotions?: string[] } }) => (r.payload.emotions ?? []).length > 0), 'some sample dreams carry feelings');
  assert.ok(start.some((r: { payload: { emotions?: string[] } }) => !r.payload.emotions), 'and some read like older dreams');
  const row = { ...start[0], id: 'b0000001-0000-4000-8000-000000000001' };
  await router.handle(`${ORIGIN}/__demo/rest/v1/dreams`, { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify(row) });
  assert.equal((await list()).length, 7);
  await router.handle(`${ORIGIN}/__demo/rest/v1/dreams?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ favorite: true }) });
  assert.equal((await list()).find((r: { id: string }) => r.id === row.id).favorite, true);
  await router.handle(`${ORIGIN}/__demo/rest/v1/dreams?id=eq.${row.id}`, { method: 'DELETE' });
  assert.equal((await list()).length, 6);
  const user = await (await router.handle(`${ORIGIN}/__demo/auth/v1/user`)).json();
  assert.equal(user.email, 'demo@example.test');
});

test('demo: demo code exists only outside Vercel production and is reachable from exactly one place', () => {
  assert.match(read('vite.config.ts'), /__DARE_DEMO_BUILD__:\s*JSON\.stringify\(process\.env\.VERCEL_ENV !== 'production'\)/);
  const main = read('src/main.tsx');
  assert.ok(main.split('\n')[0].includes('./demo/earlyDemo'), 'the demo fence is the first import');
  assert.match(read('src/demo/earlyDemo.ts'), /DEMO_BUILD && demoRequested\(\)/);
  // No other module may import the demo's router or installer.
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(entry.name) && !rel.startsWith('src/demo/')) {
        if (/demo\/(demoRouter|installDemo)/.test(read(rel))) offenders.push(rel);
      }
    }
  };
  walk('src');
  assert.deepEqual(offenders, []);
});

test('demo: a Vercel production build contains no trace of demo mode, while any other build does', { timeout: 120_000 }, () => {
  const out = (kind: string) => join(tmpdir(), `dare-demo-check-${kind}-${process.pid}`);
  const build = (env: string, dir: string) => {
    execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', dir, '--emptyOutDir'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, VERCEL_ENV: env },
      stdio: 'ignore',
    });
    const assets = join(dir, 'assets');
    return readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
  };
  const markers = ['demo_blocked', '/__demo', 'demo-mode-anon-key', 'dareDemoActive', 'made-up data'];
  try {
    const production = build('production', out('prod'));
    for (const m of markers) assert.ok(!production.includes(m), `production bundle must not contain "${m}"`);
    const preview = build('preview', out('prev'));
    for (const m of markers) assert.ok(preview.includes(m), `preview bundle must contain "${m}"`);
  } finally {
    rmSync(out('prod'), { recursive: true, force: true });
    rmSync(out('prev'), { recursive: true, force: true });
  }
});
