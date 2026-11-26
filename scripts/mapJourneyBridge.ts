/**
 * LOCAL LIVE TEST OF THE DREAM MAP JOURNEY (doc 126, approved 2026-10-26 with a hard cap of $0.50). The app's own screens in demo mode
 * (a stand-in account and archive inside the browser: no live database, no real account, no credits, no payment) send exactly three
 * routes here, on 127.0.0.1:8787: the analysis, the labels (the memory fragments and the map's moment titles) and the reflection route
 * (the conversation and "המבט השלם"). Each is answered by the production code, with the production checks:
 *   - analysis: the dream's safety check (detector + moderation) BEFORE the model, the production model call, the check of what it wrote;
 *   - labels: the production prompt with the moment rules, the code check of every title, the check of what it wrote;
 *   - conversation and whole view: handleExploration itself (her words checked before, DARE's words checked after, 16 + 3 turns and 3
 *     whole views per dream), with a local stand-in only for identity, rate limit and the per-dream slots.
 * The picture is not generated (the demo's sample picture). Every model request is checked BEFORE it is sent against the run's hard
 * cap (MAP_LIVE_CAP) with its worst case, and written to the cost ledger after. Without an approved cap it does not start.
 * It refuses to run on Vercel or with NODE_ENV=production, and listens on the loopback address only.
 * Run: MAP_LIVE_CAP=0.5 npx tsx scripts/mapJourneyBridge.ts
 * A new run with its own cap and the raw log (fictional dreams only):
 *   MAP_LIVE_RUN=map-live-en-1 MAP_LIVE_CAP=0.2 MAP_LIVE_RAW_LOG=1 npx tsx scripts/mapJourneyBridge.ts
 */
import 'dotenv/config';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import express from 'express';
import OpenAI from 'openai';
import { mayCall, priceOf, usdOf } from './lib/liveGuard.ts';

for (const key of Object.keys(process.env)) if (key.startsWith('SUPABASE') || key.startsWith('VITE_SUPABASE')) delete process.env[key];
if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
  console.error('The map journey bridge refuses to run on Vercel or in production.');
  process.exit(1);
}
// A new run gets its own name (MAP_LIVE_RUN), so its cap counts only its own calls: nothing earlier in the ledger is changed or counted against it.
const RUN = /^map-live-[a-z0-9-]{1,30}$/.test(process.env.MAP_LIVE_RUN ?? '') ? String(process.env.MAP_LIVE_RUN) : 'map-live-1';
const RUN_CAP = Number(process.env.MAP_LIVE_CAP ?? '0');
// Optional, local only (MAP_LIVE_RAW_LOG=1, fictional dreams only): what the model wrote for the conversation and the whole view, and what
// the attribution check found in it, written to logs/ (ignored by Git). Never the request, a key, a header or anything of a real account.
const RAW_LOG = process.env.MAP_LIVE_RAW_LOG === '1' ? new URL(`../logs/map-live-raw/${RUN}.jsonl`, import.meta.url) : null;
if (!(RUN_CAP > 0 && RUN_CAP <= 0.5)) {
  console.error('The map journey bridge needs her approved cap (MAP_LIVE_CAP, at most 0.5). Nothing was started, nothing was sent.');
  process.exit(1);
}
// the conversation is tested on the model it was built and checked on
process.env.OPENAI_REFLECTION_MODEL ||= 'gpt-4.1';
process.env.OPENAI_QUESTIONS_MODEL ||= 'gpt-4.1';

const { runAnalysisModel } = await import('../server/routes/dreamAnalysis.ts');
const { handleExploration, realExplorationDeps } = await import('../server/routes/dreamExploration.ts');
const { checkDreamText, dareWordsSafe, safetyBody } = await import('../server/safety/routeSafety.ts');
const { realModerate } = await import('../server/safety/moderation.ts');
const { safetyAckOf } = await import('../src/hero/safety/journeySafety.ts');
const { buildDreamElementLabelSystemPrompt, DREAM_ELEMENT_LABELS_JSON_SCHEMA, validateElementLabels } = await import('../src/hero/dreamElementLabelsSchema.ts');
const { normalizeLabel } = await import('../src/hero/dreamElementLabelQuality.ts');
const { momentLabelRules } = await import('../src/hero/explorationSchema.ts');
const { checkMomentTitle } = await import('../src/hero/momentTitle.ts');
const { unreportedAttribution } = await import('../src/hero/attribution.ts');
const { containsHebrew } = await import('../src/hero/appLanguage.ts');
const { normalizeAddressPreference } = await import('../src/hero/addressPreference.ts');
const { MAX_MOMENT_CALLS, MAX_WHOLE_VIEWS } = await import('../src/hero/exploration.ts');

const address = normalizeAddressPreference(process.env.BRIDGE_ADDRESS ?? 'feminine');
const LEDGER = new URL('../docs/upgrade-2026-10/27-eval-cost-ledger.json', import.meta.url);
type Ledger = { totalUsd: number; stopAtUsd: number; entries: { at: string; run: string; stage: string; model: string; input: number; output: number; usd: number; ms: number }[] };
const readLedger = () => JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger;
const spentRun = (l: Ledger) => l.entries.filter((e) => e.run === RUN).reduce((a, e) => a + e.usd, 0);

/** For the check only (the request itself is sent as the production code builds it): a request with no output bound counts this many. */
const ASSUMED_OUTPUT_BOUND = 4000;
const worstOf = (params: Record<string, unknown>) => {
  const chars = String(params.instructions ?? '').length + (typeof params.input === 'string' ? params.input.length : JSON.stringify(params.input ?? '').length);
  const out = typeof params.max_output_tokens === 'number' ? params.max_output_tokens : ASSUMED_OUTPUT_BOUND;
  const [pin, pout] = priceOf(String(params.model));
  return ((chars / 3) * pin + out * pout) / 1_000_000;
};

let refusedByBudget = false;
/** The worst case of every request sent and not answered yet: requests run side by side, so each is counted before it is sent (never over the cap). */
let inFlightWorst = 0;
/** What the model wrote during the reflection request being answered (only when RAW_LOG is on). */
const rawOf = new AsyncLocalStorage<string[]>();
/** The stage of the request being answered (requests run side by side, so each keeps its own). */
const stageOf = new AsyncLocalStorage<string>();
const currentStage = () => stageOf.getStore() ?? 'unknown';
const real = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
/** The model, behind the guard: checked before every request (this run's cap only), written to the ledger after. */
const guarded = {
  responses: {
    create: async (params: Record<string, unknown>) => {
      const ledger = readLedger();
      const spent = spentRun(ledger);
      const worst = worstOf(params);
      const verdict = mayCall({ worst, spentRun: spent + inFlightWorst, runCap: RUN_CAP, stageSpent: spent + inFlightWorst, stageStop: RUN_CAP });
      if (!verdict.ok) {
        console.log(`[map-bridge] REFUSED before sending (${currentStage()}): ${verdict.why}`);
        refusedByBudget = true;
        throw new Error(`budget: ${verdict.why}`);
      }
      const t0 = Date.now();
      inFlightWorst += worst;
      let res;
      try {
        res = await real.responses.create(params as never);
      } finally {
        inFlightWorst -= worst;
      }
      rawOf.getStore()?.push(res.output_text ?? '');
      const input = res.usage?.input_tokens ?? 0;
      const output = res.usage?.output_tokens ?? 0;
      const usd = usdOf(res.model || String(params.model), input, output);
      const after = readLedger();
      after.entries.push({ at: new Date().toISOString(), run: RUN, stage: currentStage(), model: res.model || String(params.model), input, output, usd, ms: Date.now() - t0 });
      after.totalUsd = Number((after.totalUsd + usd).toFixed(6));
      writeFileSync(LEDGER, JSON.stringify(after, null, 2));
      console.log(`[map-bridge] ${currentStage()} ${res.model} ${input} in, ${output} out, $${usd.toFixed(4)} | run $${spentRun(after).toFixed(4)} of $${RUN_CAP}`);
      return res;
    },
  },
} as unknown as OpenAI;

/**
 * One line per conversation or whole-view request (RAW_LOG only): each attempt the model wrote, the sentences of it the attribution check
 * finds (with the phrase it found), and what was shown. Her words come from the fictional test journey itself. No request, key or header.
 */
function writeRawLog(mode: string, body: Record<string, unknown>, raws: string[], result: { status: number; body: unknown }) {
  if (!RAW_LOG) return;
  type Turn = { role: string; text: string; rejection?: boolean; steer?: string };
  const explored = Object.values(((body.exploration ?? {}) as { explored?: Record<string, { turns?: Turn[]; answer?: string }> }).explored ?? {});
  const herWords = explored.flatMap((x) => [...(x.turns ?? []).filter((t) => t.role === 'dreamer' && !t.rejection && !t.steer).map((t) => t.text), x.answer ?? '']).filter(Boolean);
  const sourceText = String(((body.dreamAnalysis ?? {}) as { sourceText?: unknown }).sourceText ?? '');
  const language = body.language === 'he' ? 'he' : 'en';
  const attempts = raws.map((raw) => {
    let parsed: { reply?: string; offer?: string } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* kept as text */
    }
    const text = [parsed.reply, parsed.offer].filter(Boolean).join(' ') || raw;
    const flagged = text
      .split(/(?<=[.!?…])\s+|\n+/u)
      .map((x) => x.trim())
      .filter(Boolean)
      .flatMap((sentence) => {
        const found = unreportedAttribution(sentence, { herWords, sourceText, language });
        return found ? [{ sentence, found }] : [];
      });
    return { raw, flagged };
  });
  const shown = (result.body as { turn?: { text?: string; offer?: string } })?.turn;
  const line = { at: new Date().toISOString(), run: RUN, mode, status: result.status, attempts, shown: shown ? [shown.text, shown.offer].filter(Boolean).join(' ') : null };
  mkdirSync(new URL('.', RAW_LOG), { recursive: true });
  appendFileSync(RAW_LOG, `${JSON.stringify(line)}\n`);
  console.log(`[map-bridge] raw log: ${mode} attempts=${attempts.length} flagged=${attempts.map((a) => a.flagged.length).join('/')}`);
}

const budgetReply = (res: express.Response) => res.status(402).json({ reason: 'budget_reached', message: 'The live test budget does not allow this request; nothing was sent.' });

// slots per dream, as in production (moment calls and whole views), kept in memory
const slots = new Map<string, { turns: number; wholes: number }>();
const slot = (id: string) => slots.get(id) ?? (slots.set(id, { turns: 0, wholes: 0 }), slots.get(id)!);

const app = express();
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

app.get('/__live/spent', (_req, res) => void res.json({ run: RUN, spent: Number(spentRun(readLedger()).toFixed(6)), cap: RUN_CAP }));

app.post('/api/dream-analysis', async (req, res) => {
  const sourceText = String(req.body?.sourceText ?? '');
  stageOf.enterWith('analysis');
  // her words first, before anything is sent to the model (detector + moderation), as the production route does
  const her = await checkDreamText(sourceText, safetyAckOf(req.body?.safetyAck), realModerate);
  if (!her.allowed) return void res.json(safetyBody(her.level));
  refusedByBudget = false;
  try {
    const outcome = await runAnalysisModel(guarded, sourceText);
    if (outcome.status !== 'ok') return void res.status(502).json({ reason: 'invalid_response', message: 'bridge: analysis failed' });
    if (!(await dareWordsSafe({ ...outcome.value, sourceText: '' }, realModerate, 'retelling'))) return void res.status(502).json({ reason: 'invalid_response', message: 'bridge: analysis held back' });
    res.json({ ...outcome.value, attemptId: randomUUID() });
  } catch {
    if (refusedByBudget) return void budgetReply(res);
    res.status(502).json({ reason: 'request_failed', message: 'bridge: analysis failed' });
  }
});

app.post('/api/dream-element-labels', async (req, res) => {
  const language = req.body?.language === 'he' ? 'he' : 'en';
  const sourceText = String(req.body?.sourceText ?? '');
  const elements: string[] = (Array.isArray(req.body?.elements) ? req.body.elements : []).map(String).filter((e: string) => e.trim());
  const moments = req.body?.purpose === 'moments';
  if (!elements.length) return void res.status(400).json({ reason: 'empty_input', message: 'bridge: no elements' });
  stageOf.enterWith(moments ? 'moment-labels' : 'labels');
  refusedByBudget = false;
  try {
    const response = await guarded.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      store: false,
      max_output_tokens: 400,
      instructions: buildDreamElementLabelSystemPrompt(language) + (moments ? momentLabelRules(language) : ''),
      input: `DREAM CONTEXT (for disambiguation only — do not label this line itself): ${sourceText || '(not provided)'}\n\nELEMENTS TO LABEL, IN ORDER:\n${elements.map((e, i) => `${i + 1}. ${e}`).join('\n')}`,
      text: { format: { type: 'json_schema', name: 'dream_element_labels', schema: DREAM_ELEMENT_LABELS_JSON_SCHEMA as never, strict: true } },
    });
    const raw = validateElementLabels(JSON.parse(response.output_text), elements.length);
    let labels = raw ? raw.map((l, i) => normalizeLabel(l) || elements[i]) : elements;
    // the moment titles: the same code check as the production route (only when the dream and the titles share a language)
    if (moments && containsHebrew(sourceText) === (language === 'he')) {
      const used: string[] = [];
      labels = labels.map((l, i) => {
        const c = checkMomentTitle(l, elements[i], used, sourceText);
        used.push(c);
        return c;
      });
    }
    if (!(await dareWordsSafe(labels, realModerate, 'retelling'))) return void res.status(502).json({ reason: 'invalid_response', message: 'bridge: labels held back' });
    console.log(`[map-bridge] ${currentStage()}: ${labels.join(' | ')}`);
    res.json({ labels });
  } catch {
    if (refusedByBudget) return void budgetReply(res);
    res.status(502).json({ reason: 'request_failed', message: 'bridge: labels failed' });
  }
});

app.post('/api/dream-reflection', async (req, res) => {
  const mode = req.body?.mode;
  if (mode !== 'conversation-turn' && mode !== 'conversation-summary') return void res.status(404).json({ reason: 'request_failed', message: 'map bridge: only the map journey' });
  stageOf.enterWith(mode);
  refusedByBudget = false;
  const raws: string[] = [];
  const result = await rawOf.run(raws, () => handleExploration(mode, req.body, {}, {
    ...realExplorationDeps,
    resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: 'local-test' } }) as never,
    openai: () => guarded,
    rateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }) as never,
    reserveMoment: async (attemptId, _identity, extra = 0) => (slot(attemptId).turns >= MAX_MOMENT_CALLS + extra ? 'rejected' : ((slot(attemptId).turns += 1), 'reserved')),
    refundMoment: async (attemptId) => void (slot(attemptId).turns = Math.max(0, slot(attemptId).turns - 1)),
    reserveWhole: async (attemptId) => (slot(attemptId).wholes >= MAX_WHOLE_VIEWS ? 'rejected' : ((slot(attemptId).wholes += 1), 'reserved')),
    refundWhole: async (attemptId) => void (slot(attemptId).wholes = Math.max(0, slot(attemptId).wholes - 1)),
    address: async () => address,
  }));
  if (RAW_LOG) writeRawLog(mode, req.body, raws, result);
  const budget = refusedByBudget;
  refusedByBudget = false;
  if (budget && result.status >= 500) return void budgetReply(res);
  res.status(result.status).json(result.body);
});

app.use((_req, res) => void res.status(404).json({ reason: 'request_failed', message: 'map bridge: not here' }));

app.listen(8787, '127.0.0.1', () => {
  console.log(`[map-bridge] 127.0.0.1:8787 | run ${RUN} | cap $${RUN_CAP} | spent so far $${spentRun(readLedger()).toFixed(4)} | conversation model ${process.env.OPENAI_REFLECTION_MODEL} | address ${address}`);
});
