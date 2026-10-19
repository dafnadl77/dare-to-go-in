/**
 * LOCAL TEST BRIDGE: lets the real DARE screens run against the REAL models without any database, account, credit or payment.
 *
 * It answers the /api routes of the dream journey on 127.0.0.1:8787 (where the Vite dev server proxies /api) by calling the very same
 * functions the production routes call (analysis, questions, reflection and the checks around them). Differences from production, all
 * of them deliberate and all of them on the safe side:
 *   - no Supabase at all (every SUPABASE_* variable is removed from this process on start): no identity, no credits, no allowance, nothing stored;
 *   - the picture is NOT generated: a bundled sample image is returned, so no image spend;
 *   - it refuses to run on Vercel or with NODE_ENV=production, and listens on the loopback address only.
 * Controls for failure tests: POST /__bridge/fail {"questions":true,"reflectionTimes":1}; call log: GET /__bridge/log.
 * The address preference (feminine/masculine/neutral) comes from BRIDGE_ADDRESS (default feminine) for the Hebrew grammar checks.
 * Run: npx tsx scripts/localModelBridge.ts   (needs OPENAI_API_KEY in .env; spends small real model usage)
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import express from 'express';
import OpenAI from 'openai';

for (const key of Object.keys(process.env)) if (key.startsWith('SUPABASE') || key.startsWith('VITE_SUPABASE')) delete process.env[key];
if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
  console.error('The local test bridge refuses to run on Vercel or in production.');
  process.exit(1);
}

const { runAnalysisModel } = await import('../server/routes/dreamAnalysis.ts');
const { generateDreamReflection, buildReflectionInput, finalizeDeliveredReflection } = await import('../server/routes/dreamReflection.ts');
const { generateDreamQuestions } = await import('../server/routes/dreamQuestions.ts');
const { validateDreamAnalysis } = await import('../src/hero/dreamAnalysisSchema.ts');
const { validateDreamQuestionFacts } = await import('../src/hero/dreamQuestionsSchema.ts');
const { computeDreamDepth } = await import('../src/hero/dreamDepth.ts');
const { normalizeEmotions } = await import('../src/hero/dreamEmotions.ts');
const { buildDreamElementLabelSystemPrompt, DREAM_ELEMENT_LABELS_JSON_SCHEMA, validateElementLabels } = await import('../src/hero/dreamElementLabelsSchema.ts');
const { normalizeLabel } = await import('../src/hero/dreamElementLabelQuality.ts');
const { normalizeAddressPreference } = await import('../src/hero/addressPreference.ts');
const { resolveStageModel } = await import('../server/stageModel.ts');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const address = normalizeAddressPreference(process.env.BRIDGE_ADDRESS ?? 'feminine');
const sampleImage = `data:image/jpeg;base64,${readFileSync(new URL('../public/dream-assets/dream-art-alt.jpg', import.meta.url)).toString('base64')}`;

interface CallLog {
  at: string;
  stage: string;
  model?: string;
  input?: number;
  output?: number;
  ms: number;
  note?: string;
}
const log: CallLog[] = [];
const failures = { questions: false, reflectionTimes: 0 };
const record = (entry: CallLog) => {
  log.push(entry);
  console.log(`[bridge] ${entry.stage} ${entry.model ?? ''} ${entry.ms}ms ${entry.note ?? ''}`);
};

const app = express();
// The demo screens (a different local port) reach the bridge from the browser, so loopback origins are allowed. Nothing else is.
app.use((req, res, next) => {
  const origin = req.headers.origin ?? '';
  if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }
  if (req.method === 'OPTIONS') return void res.status(204).end();
  next();
});
app.use(express.json({ limit: '10mb' }));

app.get('/__bridge/log', (_req, res) => void res.json(log));
app.post('/__bridge/fail', (req, res) => {
  failures.questions = req.body?.questions === true;
  failures.reflectionTimes = Number(req.body?.reflectionTimes) || 0;
  res.json(failures);
});
app.post('/__bridge/reset', (_req, res) => {
  log.length = 0;
  res.json({ ok: true });
});

app.get('/api/credits', (_req, res) => void res.json({ balance: 3, purchasedPackage: null, grantedCredits: 0, grantCount: 0, freeDreamUsed: false, freeGranted: 1, freeDream: 'available' }));
app.post('/api/trial-session', (_req, res) => void res.json({ ok: true }));
app.post('/api/claim-trial', (_req, res) => void res.json({ ok: true }));

app.post('/api/dream-analysis', async (req, res) => {
  const t0 = Date.now();
  const outcome = await runAnalysisModel(client, String(req.body?.sourceText ?? ''));
  record({ at: new Date().toISOString(), stage: 'analysis', ms: Date.now() - t0, note: outcome.status });
  if (outcome.status !== 'ok') return void res.status(502).json({ reason: 'invalid_response', message: 'bridge: analysis failed' });
  res.json({ ...outcome.value, attemptId: randomUUID() });
});

app.post('/api/dream-image', async (_req, res) => {
  await new Promise((r) => setTimeout(r, 1200));
  record({ at: new Date().toISOString(), stage: 'image (sample picture, not generated)', ms: 1200 });
  res.json({ imageDataUrl: sampleImage });
});

async function labels(language: 'he' | 'en', sourceText: string, elements: string[]): Promise<string[]> {
  const input = `DREAM CONTEXT (for disambiguation only — do not label this line itself): ${sourceText || '(not provided)'}\n\nELEMENTS TO LABEL, IN ORDER:\n${elements.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    store: false,
    instructions: buildDreamElementLabelSystemPrompt(language),
    input,
    text: { format: { type: 'json_schema', name: 'dream_element_labels', schema: DREAM_ELEMENT_LABELS_JSON_SCHEMA as never, strict: true } },
  });
  const out = validateElementLabels(JSON.parse(response.output_text), elements.length);
  return out ? out.map((l, i) => normalizeLabel(l) || elements[i]) : elements;
}

app.post('/api/dream-element-labels', async (req, res) => {
  const language = req.body?.language === 'he' ? 'he' : 'en';
  const sourceText = String(req.body?.sourceText ?? '');
  const elements: string[] = (Array.isArray(req.body?.elements) ? req.body.elements : []).map(String);
  const t0 = Date.now();
  if (req.body?.mode === 'questions') {
    if (failures.questions) {
      record({ at: new Date().toISOString(), stage: 'questions', ms: 0, note: 'FORCED FAILURE (test)' });
      return void res.status(502).json({ reason: 'request_failed', message: 'bridge: forced failure' });
    }
    let usedModel: string | undefined;
    let input = 0;
    let output = 0;
    const outcome = await generateDreamQuestions(client, {
      sourceText,
      moments: elements.slice(0, 6),
      facts: validateDreamQuestionFacts(req.body?.facts),
      language,
      addressPreference: address,
      onUsage: (u) => {
        usedModel = u.model;
        input += u.input;
        output += u.output;
      },
    });
    record({ at: new Date().toISOString(), stage: 'questions', model: usedModel, input, output, ms: Date.now() - t0, note: outcome.status });
    if (outcome.status !== 'ok') return void res.status(502).json({ reason: 'invalid_response', message: 'bridge: questions unusable' });
    return void res.json(outcome.value.kept);
  }
  const out = await labels(language, sourceText, elements);
  record({ at: new Date().toISOString(), stage: 'labels', ms: Date.now() - t0 });
  res.json({ labels: out });
});

app.post('/api/dream-reflection', async (req, res) => {
  const language = req.body?.language === 'he' ? 'he' : 'en';
  const analysis = validateDreamAnalysis(req.body?.dreamAnalysis);
  const selectedElement = String(req.body?.selectedElement ?? '').trim();
  const reflectionResponse = String(req.body?.reflectionResponse ?? '').trim();
  if (!analysis || !selectedElement || !reflectionResponse) return void res.status(400).json({ reason: 'empty_input', message: 'bridge: bad request' });
  const t0 = Date.now();
  if (failures.reflectionTimes > 0) {
    failures.reflectionTimes -= 1;
    record({ at: new Date().toISOString(), stage: 'reflection', ms: 0, note: 'FORCED FAILURE (test)' });
    return void res.status(502).json({ reason: 'invalid_response', message: 'bridge: forced failure' });
  }
  const emotions = normalizeEmotions(req.body?.emotions);
  const linkResponse = typeof req.body?.linkResponse === 'string' ? req.body.linkResponse.trim().slice(0, 2000) : '';
  const linkQuestion = typeof req.body?.linkQuestion === 'string' ? req.body.linkQuestion.trim().slice(0, 300) : '';
  const extras = {
    associationQuestion: typeof req.body?.associationQuestion === 'string' ? req.body.associationQuestion.slice(0, 300) : undefined,
    ...(linkResponse && linkQuestion ? { linkQuestion, linkResponse } : {}),
  };
  const corrections: string[] = Array.isArray(req.body?.reconstructionCorrections) ? req.body.reconstructionCorrections.map(String) : [];
  const input = buildReflectionInput(analysis, selectedElement, reflectionResponse, corrections, emotions, language, extras);
  const dreamerText = [analysis.sourceText, selectedElement, reflectionResponse, extras.linkResponse ?? '', ...corrections].join('\n');
  let usedModel: string | undefined;
  let inTok = 0;
  let outTok = 0;
  const outcome = await generateDreamReflection(client, {
    input,
    language,
    addressPreference: address,
    dreamerText,
    emotions,
    onUsage: (u) => {
      usedModel = u.model;
      inTok += u.input;
      outTok += u.output;
    },
  });
  record({ at: new Date().toISOString(), stage: 'reflection', model: usedModel, input: inTok, output: outTok, ms: Date.now() - t0, note: outcome.status });
  if (outcome.status !== 'ok') return void res.status(502).json({ reason: 'invalid_response', message: 'bridge: reflection rejected by the checks' });
  res.json(finalizeDeliveredReflection(outcome.value, { emotions, language, depth: computeDreamDepth(analysis), dreamerText, summary: analysis.summary }));
});

app.use('/api', (_req, res) => void res.status(404).json({ reason: 'request_failed', message: 'bridge: not part of the local bridge' }));

app.listen(8787, '127.0.0.1', () => {
  console.log(
    `[bridge] listening on 127.0.0.1:8787 | questions model: ${resolveStageModel('OPENAI_QUESTIONS_MODEL')} | reflection model: ${resolveStageModel('OPENAI_REFLECTION_MODEL')} | address: ${address}`,
  );
});
