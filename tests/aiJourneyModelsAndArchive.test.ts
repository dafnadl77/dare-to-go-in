import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { logModelUsed, modelMatches, resolveStageModel } from '../server/stageModel.ts';
import { createDemoRouter } from '../src/demo/demoRouter.ts';
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
