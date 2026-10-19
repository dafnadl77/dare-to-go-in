import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { logModelUsed, modelMatches, resolveStageModel } from '../server/stageModel.ts';
import { BRIDGED_PATHS, createDemoRouter } from '../src/demo/demoRouter.ts';
import { validateDreamReflectionResult } from '../src/hero/dreamReflectionSchema.ts';
import { en, he } from '../src/i18n/translations.ts';
import { findAddressViolation } from '../src/hero/languageIntegrity.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ---- which model answers, and no silent fallback ---------------------------------------------------------------------

test('a stage uses its own model when set, otherwise the shared OPENAI_MODEL, otherwise the default; never anything else', () => {
  const saved = { q: process.env.OPENAI_QUESTIONS_MODEL, r: process.env.OPENAI_REFLECTION_MODEL, m: process.env.OPENAI_MODEL };
  try {
    delete process.env.OPENAI_QUESTIONS_MODEL;
    delete process.env.OPENAI_REFLECTION_MODEL;
    delete process.env.OPENAI_MODEL;
    assert.equal(resolveStageModel('OPENAI_QUESTIONS_MODEL'), 'gpt-4o-mini');
    process.env.OPENAI_MODEL = 'gpt-4o-mini';
    assert.equal(resolveStageModel('OPENAI_REFLECTION_MODEL'), 'gpt-4o-mini', 'unset stage = the shared model, exactly as before');
    process.env.OPENAI_QUESTIONS_MODEL = 'gpt-4.1';
    process.env.OPENAI_REFLECTION_MODEL = ' gpt-4.1 ';
    assert.equal(resolveStageModel('OPENAI_QUESTIONS_MODEL'), 'gpt-4.1');
    assert.equal(resolveStageModel('OPENAI_REFLECTION_MODEL'), 'gpt-4.1', 'whitespace is ignored');
    process.env.OPENAI_QUESTIONS_MODEL = '';
    assert.equal(resolveStageModel('OPENAI_QUESTIONS_MODEL'), 'gpt-4o-mini', 'an empty value counts as unset');
  } finally {
    for (const [key, value] of [['OPENAI_QUESTIONS_MODEL', saved.q], ['OPENAI_REFLECTION_MODEL', saved.r], ['OPENAI_MODEL', saved.m]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('the answering model is checked against the requested one: a dated snapshot matches, a sibling model or a missing name is logged as an error', () => {
  assert.equal(modelMatches('gpt-4.1', 'gpt-4.1'), true);
  assert.equal(modelMatches('gpt-4.1', 'gpt-4.1-2025-04-14'), true);
  assert.equal(modelMatches('gpt-4.1', 'gpt-4.1-mini'), false);
  assert.equal(modelMatches('gpt-4.1', 'gpt-4.1-mini-2025-04-14'), false);
  assert.equal(modelMatches('gpt-4o-mini', 'gpt-4o'), false);
  const errors: string[] = [];
  const infos: string[] = [];
  const realError = console.error;
  const realInfo = console.info;
  console.error = (m: string) => void errors.push(m);
  console.info = (m: string) => void infos.push(m);
  try {
    logModelUsed('dream-questions', 'gpt-4.1', 'gpt-4.1-2025-04-14');
    logModelUsed('dream-reflection', 'gpt-4.1', 'gpt-4.1-mini');
    logModelUsed('dream-reflection', 'gpt-4.1', undefined);
  } finally {
    console.error = realError;
    console.info = realInfo;
  }
  assert.deepEqual(infos, ['[ai-model] dream-questions: gpt-4.1-2025-04-14']);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /MISMATCH requested gpt-4\.1, answered by gpt-4\.1-mini/);
  assert.match(errors[1], /did not name its model/);
});

test('no code path tries another model after a failure: each stage has one model call site, the model comes only from resolveStageModel, and no model name is hard-coded in the routes', () => {
  for (const f of ['server/routes/dreamQuestions.ts', 'server/routes/dreamReflection.ts']) {
    const src = read(f);
    assert.equal((src.match(/responses\.create\(/g) ?? []).length, 1, `${f}: exactly one model call site`);
    assert.match(src, /resolveStageModel\('OPENAI_(QUESTIONS|REFLECTION)_MODEL'\)/);
    assert.match(src, /logModelUsed\(/);
    assert.ok(!/gpt-/.test(src), `${f}: no model name hard-coded here`);
  }
});

// ---- demo mode and the archive ------------------------------------------------------------------------------------------

test('demo mode answers the questions request and the reflection in the same shapes as the real ones, labelled as demo text, with no real request', async () => {
  const passed: string[] = [];
  const router = createDemoRouter({
    origin: 'https://preview.example',
    delay: async () => {},
    now: () => Date.parse('2026-10-13T12:00:00Z'),
    realFetch: async (i) => {
      passed.push(String(i));
      return new Response('x');
    },
  });
  const post = (path: string, body: unknown) =>
    router.handle(`https://preview.example${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const moments = ['אמא במטבח', 'חדר לא מוכר', 'כוס מים'];
  const q = await (await post('/api/dream-element-labels', { mode: 'questions', elements: moments, language: 'he', sourceText: 'x', attemptId: 'a' })).json();
  assert.equal(q.associationQuestions.length, 3);
  assert.equal(q.linkQuestions.length, 3);
  assert.ok(q.associationQuestions.every((s: string) => /הדגמה/.test(s)), 'every demo question says it is a demo');
  assert.ok(q.linkQuestions.some((s: string) => s === '') && q.linkQuestions.some((s: string) => s !== ''), 'some moments have no link question, like the real ones');
  const labels = await (await post('/api/dream-element-labels', { elements: moments, language: 'he', sourceText: 'x', attemptId: 'a' })).json();
  assert.deepEqual(labels.labels, moments, 'the labels request is untouched');
  const reflection = await (await post('/api/dream-reflection', { dreamAnalysis: { sourceText: 'חלום' }, selectedElement: 'חדר לא מוכר', reflectionResponse: 'מפחיד', linkResponse: 'אולי', language: 'he' })).json();
  assert.ok(validateDreamReflectionResult(reflection), 'valid reflection');
  assert.equal(reflection.alternativeReadings.length, 1);
  assert.match(reflection.alternativeReadings[0].reading, /הדגמה/);
  assert.match(reflection.alternativeReadings[0].reading, /“אולי”/, "the visitor's own answer is only quoted");
  assert.match(reflection.existentialLens.text, /הדגמה/);
  assert.equal(passed.length, 0);
});

test('the archive shows the optional second question with its answer (only when answered), the other readings and the existential angle, and follows the interface language like the rest', () => {
  const src = read('src/archive/DreamDetail.tsx');
  assert.match(src, /linkQuestionRaw && linkAnswerRaw &&/);
  assert.match(src, /savedDream\?\.linkQuestion && savedDream\.linkResponse/);
  for (const key of ['dreamDetail.theOtherQuestion', 'dreamDetail.otherPerspectives', 'dreamDetail.existentialAngle']) assert.ok(src.includes(key), key);
  // the answer is the dreamer's own words (translated only like the association); the question and readings are AI text (follow the interface language)
  assert.match(src, /resolve\('linkAnswer', linkAnswerRaw\)/);
  assert.match(src, /resolveAi\('linkQuestion', linkQuestionRaw\)/);
  assert.match(src, /resolveAi\(i === 0 \? 'reading0' : 'reading1', reading\)/);
  for (const [name, table] of [['he', he], ['en', en]] as const) {
    for (const key of ['theOtherQuestion', 'otherPerspectives', 'existentialAngle']) assert.ok((table.dreamDetail as unknown as Record<string, string>)[key]?.trim(), `${name}.${key}`);
  }
});

test('the local test bridge cannot reach any database or run in production, and the test servers use their own ports', () => {
  const bridge = read('scripts/localModelBridge.ts');
  assert.match(bridge, /startsWith\('SUPABASE'\)/);
  assert.match(bridge, /process\.env\.VERCEL \|\| process\.env\.NODE_ENV === 'production'/);
  assert.match(bridge, /listen\(8787, '127\.0\.0\.1'/);
  assert.ok(!/from '.*supabase/i.test(bridge), 'the bridge imports nothing from Supabase');
  const devEnv = read('scripts/devEnv.mjs');
  assert.match(devEnv, /VITE_SUPABASE_URL = 'http:\/\/127\.0\.0\.1:9'/);
});

// ---- grammatical address -----------------------------------------------------------------------------------------------

test("a Hebrew line that addresses a dreamer of unknown gender as a woman or as a man is caught (prefixed forms and a feminine verb included); object markers and quotes are not", () => {
  const check = (text: string, preference: 'neutral' | 'feminine' | 'masculine') => findAddressViolation([text], 'he', preference);
  // found in real model output: "שאתה ממשיך" (masculine, with a prefix) and "את מזהה" (feminine verb) for a dreamer whose gender was never given
  assert.ok(check('היכן בימים האחרונים הרגשת שאתה ממשיך בדרך מסוימת?', 'neutral'));
  assert.ok(check('היכן בימים האחרונים הרגשת שאתה ממשיך בדרך מסוימת?', 'feminine'));
  assert.ok(check('האם יש עכשיו רגעים שבהם את מזהה בעצמך המתנה?', 'neutral'));
  assert.ok(check('אפשר לשאול מה שאת פוגשת בימים אלה', 'neutral'));
  assert.equal(check('האם יש עכשיו רגעים שבהם את מזהה בעצמך המתנה?', 'feminine'), null, 'a dreamer who asked for feminine is addressed as one');
  assert.equal(check('היכן בימים האחרונים הרגשת שאתה ממשיך?', 'masculine'), null, 'a dreamer who asked for masculine is addressed as one');
  // not addressing anyone: object marker, relative "מה", quotation
  assert.equal(check('ציינת את הדלת הסגורה ואת מה שקרה בחדר', 'neutral'), null);
  assert.equal(check('אמרת: "את מזהה את זה" ואולי יש כאן המתנה', 'neutral'), null);
  assert.equal(check('כשחושבים על התחנה הריקה, מה עולה?', 'neutral'), null);
});

// ---- the local test journey ---------------------------------------------------------------------------------------------

test('the local test journey sends exactly three routes to the local bridge and keeps everything else (credits, trial, the picture, the account) inside the browser', async () => {
  const bridgeCalls: { url: string; body: unknown }[] = [];
  const passed: string[] = [];
  const router = createDemoRouter({
    origin: 'http://localhost:5393',
    delay: async () => {},
    realFetch: async (i) => (passed.push(String(i)), new Response('x')),
    bridge: {
      url: 'http://127.0.0.1:8787',
      fetch: async (input, init) => {
        bridgeCalls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    },
  });
  const post = (path: string, body: unknown) => router.handle(`http://localhost:5393${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  for (const path of ['/api/dream-analysis', '/api/dream-element-labels', '/api/dream-reflection']) assert.equal((await post(path, { sourceText: 'חלום', path })).status, 200);
  assert.deepEqual(bridgeCalls.map((c) => c.url), ['http://127.0.0.1:8787/api/dream-analysis', 'http://127.0.0.1:8787/api/dream-element-labels', 'http://127.0.0.1:8787/api/dream-reflection']);
  assert.equal((bridgeCalls[0].body as { sourceText: string }).sourceText, 'חלום', 'the request body is passed on unchanged');
  for (const path of ['/api/credits', '/api/trial-session', '/api/claim-trial', '/api/delete-account', '/api/dream-translation', '/api/pattern-reflection', '/api/dream-transcription']) await post(path, {});
  // (the picture route needs a real browser to draw its sample picture; it is simply not one of the bridged routes)
  assert.equal(BRIDGED_PATHS.has('/api/dream-image'), false);
  assert.equal(bridgeCalls.length, 3, 'nothing else is forwarded: no credits, no payments, no picture, no account');
  assert.equal(passed.filter((u) => !u.includes('/dream-assets/')).length, 0, 'no other real request');
  // a GET of the same route, and a bridge that is not running
  await router.handle('http://localhost:5393/api/dream-reflection', { method: 'GET' });
  assert.equal(bridgeCalls.length, 3);
  const down = createDemoRouter({ origin: 'http://localhost:5393', delay: async () => {}, realFetch: async () => new Response('x'), bridge: { url: 'http://127.0.0.1:8787', fetch: async () => Promise.reject(new Error('refused')) } });
  const res = await down.handle('http://localhost:5393/api/dream-reflection', { method: 'POST', body: '{}' });
  assert.equal(res.status, 503, 'a missing bridge is an honest error, never made-up text');
  assert.equal((await res.json()).reason, 'request_failed');
});

test('without a bridge nothing is ever forwarded, and the bridge is only created for the exact local address on a page served from this computer', () => {
  const install = read('src/demo/installDemo.ts');
  assert.match(install, /bridgeUrl === 'http:\/\/127\.0\.0\.1:8787' && onThisComputer/);
  assert.match(install, /window\.location\.hostname === 'localhost' \|\| window\.location\.hostname === '127\.0\.0\.1'/);
  const router = read('src/demo/demoRouter.ts');
  assert.match(router, /if \(deps\.bridge && method === 'POST' && BRIDGED_PATHS\.has\(path\)\)/);
  assert.equal([...read('src/demo/demoRouter.ts').matchAll(/new Set\(\['\/api\/dream-analysis', '\/api\/dream-element-labels', '\/api\/dream-reflection'\]\)/g)].length, 1);
  const devEnv = read('scripts/devEnv.mjs');
  assert.match(devEnv, /mode === 'journey'[\s\S]*VITE_DEMO_BRIDGE_URL = 'http:\/\/127\.0\.0\.1:8787'/);
  // the label in the corner never claims made-up data in the local test journey
  assert.match(read('src/demo/demoPanel.ts'), /short: 'בדיקה מקומית · מודל אמיתי'/);
  // production builds do not contain the demo at all, and the Vercel project has no such variable
  assert.match(read('vite.config.ts'), /VERCEL_ENV !== 'production'/);
});
