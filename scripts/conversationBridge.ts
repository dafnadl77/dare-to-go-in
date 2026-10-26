/**
 * LOCAL CONVERSATION BRIDGE (doc 102, step 3): lets the conversation page talk to the REAL model through the REAL route
 * (handleExploration: the plan, the language and address guard, the wording checks, the check of every turn, the slots per dream),
 * with no database, account, credit or payment. Differences from production, all on the safe side:
 *   - no Supabase (every SUPABASE_* variable is removed); a local stand-in for identity, rate limit and slots (16 turns and 3
 *     summaries per dream, as in production), nothing stored;
 *   - every model request is checked BEFORE it is sent against the run's HARD cap and what is left of stage 3 (scripts/lib/liveGuard.ts),
 *     and written to the cost ledger after; with no approved cap (CONV_LIVE_CAP) it does not start;
 *   - it refuses to run on Vercel or with NODE_ENV=production, and listens on the loopback address only.
 * Run: CONV_LIVE_CAP=<her approved cap> npx tsx scripts/conversationBridge.ts   (port 8788)
 */
import 'dotenv/config';
import { readFileSync, writeFileSync } from 'node:fs';
import express from 'express';
import OpenAI from 'openai';
import { LIVE_RUN, mayCall, requestWorstUsd, usdOf } from './lib/liveGuard.ts';

for (const key of Object.keys(process.env)) if (key.startsWith('SUPABASE') || key.startsWith('VITE_SUPABASE')) delete process.env[key];
if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
  console.error('The conversation bridge refuses to run on Vercel or in production.');
  process.exit(1);
}
const RUN_CAP = Number(process.env.CONV_LIVE_CAP ?? '0');
if (!(RUN_CAP > 0)) {
  console.error('The conversation bridge needs her approved cap (CONV_LIVE_CAP). Nothing was started, nothing was sent.');
  process.exit(1);
}
process.env.OPENAI_REFLECTION_MODEL ||= 'gpt-4.1';

const { handleExploration, realExplorationDeps } = await import('../server/routes/dreamExploration.ts');
const { normalizeAddressPreference } = await import('../src/hero/addressPreference.ts');
const { MAX_MOMENT_CALLS, MAX_WHOLE_VIEWS } = await import('../src/hero/exploration.ts');
// the page sends only the dream's words: the analysis the route checks is built here from them, with no model (as the demo does)
const { typedAnalysis } = await import('../src/demo/demoRouter.ts');

const LEDGER = new URL('../docs/upgrade-2026-10/27-eval-cost-ledger.json', import.meta.url);
type Ledger = { totalUsd: number; stopAtUsd: number; entries: { at: string; run: string; stage: string; model: string; input: number; output: number; usd: number; ms: number }[] };
const readLedger = () => JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger;
const spentRun = (l: Ledger) => l.entries.filter((e) => e.run === LIVE_RUN).reduce((a, e) => a + e.usd, 0);

const real = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
/** The model, behind the guard: checked before every request, written to the ledger after. */
/** Set when the guard refused during the current request: the page is then told it was the budget, not a failure of the service. */
let refusedByBudget = false;
const guarded = {
  responses: {
    create: async (params: Record<string, unknown>) => {
      const ledger = readLedger();
      const verdict = mayCall({ worst: requestWorstUsd(params as never), spentRun: spentRun(ledger), runCap: RUN_CAP, stageSpent: ledger.totalUsd, stageStop: ledger.stopAtUsd });
      if (!verdict.ok) {
        console.log(`[conversation-bridge] REFUSED before sending: ${verdict.why}`);
        refusedByBudget = true;
        throw new Error(`budget: ${verdict.why}`);
      }
      const t0 = Date.now();
      const res = await real.responses.create(params as never);
      const input = res.usage?.input_tokens ?? 0;
      const output = res.usage?.output_tokens ?? 0;
      const usd = usdOf(res.model || String(params.model), input, output);
      const after = readLedger();
      after.entries.push({ at: new Date().toISOString(), run: LIVE_RUN, stage: 'conversation-live', model: res.model || String(params.model), input, output, usd, ms: Date.now() - t0 });
      after.totalUsd = Number((after.totalUsd + usd).toFixed(6));
      writeFileSync(LEDGER, JSON.stringify(after, null, 2));
      console.log(`[conversation-bridge] ${res.model} ${input} in, ${output} out, $${usd.toFixed(4)} | run $${spentRun(after).toFixed(4)} of $${RUN_CAP}`);
      return res;
    },
  },
} as unknown as OpenAI;

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
app.use(express.json({ limit: '2mb' }));

app.get('/__live/spent', (_req, res) => {
  const l = readLedger();
  res.json({ run: LIVE_RUN, spent: Number(spentRun(l).toFixed(6)), cap: RUN_CAP, stageLeft: Number((l.stopAtUsd - l.totalUsd).toFixed(6)) });
});

app.post('/api/dream-reflection', async (req, res) => {
  const mode = req.body?.mode;
  if (mode !== 'conversation-turn' && mode !== 'conversation-summary') return void res.status(404).json({ reason: 'request_failed', message: 'conversation bridge: only the conversation' });
  const address = normalizeAddressPreference(String(req.body?.devAddress ?? 'feminine'));
  const sourceText = String(req.body?.dreamAnalysis?.sourceText ?? '');
  const body = { ...req.body, dreamAnalysis: typedAnalysis(sourceText, true) };
  refusedByBudget = false;
  const result = await handleExploration(mode, body, {}, {
    ...realExplorationDeps,
    resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: 'local-test' } }) as never,
    openai: () => guarded,
    rateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }) as never,
    // 16 moment calls, plus up to 3 replies to "זה לא מתאים לי" (the route passes how many it may use): as in production
    reserveMoment: async (attemptId, _identity, extra = 0) => (slot(attemptId).turns >= MAX_MOMENT_CALLS + extra ? 'rejected' : ((slot(attemptId).turns += 1), 'reserved')),
    refundMoment: async (attemptId) => void (slot(attemptId).turns = Math.max(0, slot(attemptId).turns - 1)),
    reserveWhole: async (attemptId) => (slot(attemptId).wholes >= MAX_WHOLE_VIEWS ? 'rejected' : ((slot(attemptId).wholes += 1), 'reserved')),
    refundWhole: async (attemptId) => void (slot(attemptId).wholes = Math.max(0, slot(attemptId).wholes - 1)),
    address: async () => address,
  });
  const budget = refusedByBudget;
  refusedByBudget = false;
  if (budget && result.status >= 500) return void res.status(402).json({ reason: 'budget_reached', message: 'The live test budget does not allow this request; nothing was sent.' });
  res.status(result.status).json(result.body);
});

app.use((_req, res) => void res.status(404).json({ reason: 'request_failed', message: 'conversation bridge: not here' }));

app.listen(8788, '127.0.0.1', () => {
  const l = readLedger();
  console.log(`[conversation-bridge] 127.0.0.1:8788 | run ${LIVE_RUN} | cap $${RUN_CAP} | spent so far $${spentRun(l).toFixed(4)} | stage 3 left $${(l.stopAtUsd - l.totalUsd).toFixed(4)}`);
});
