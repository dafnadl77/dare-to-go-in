import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as G from '../scripts/lib/liveGuard';
import { threadState } from '../src/map/threadState';
import * as R from '../server/routes/dreamExploration';
import * as X from '../src/hero/exploration';
import { typedAnalysis } from '../src/demo/demoRouter';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema';
import { CONVERSATIONS } from '../src/map/conversationScript';

/**
 * Step 3, prepared with NO call: the live conversation goes through the real route and its safety (the language guard with its
 * attempts, the address and wording checks, the check of every turn, the slots), every model request is bounded and checked against
 * the hard cap BEFORE it is sent, the bridge does not start without her approved cap, and the window says plainly where she stands.
 */

const ledgerText = () => readFileSync('docs/upgrade-2026-10/27-eval-cost-ledger.json', 'utf8');

test('every model request is checked before it is sent: no output bound, no cap, over the run\'s cap or the stage — refused', () => {
  const params = { model: 'gpt-4.1', instructions: 'x'.repeat(6000), input: 'y'.repeat(3000), max_output_tokens: 700 };
  const worst = G.requestWorstUsd(params)!;
  assert.ok(worst > 0.01 && worst < 0.02, String(worst));
  assert.equal(G.requestWorstUsd({ ...params, max_output_tokens: undefined }), null);
  const ok = { worst, spentRun: 0, runCap: 0.25, stageSpent: 3.14, stageStop: 3.39 };
  assert.equal(G.mayCall(ok).ok, true);
  assert.equal(G.mayCall({ ...ok, worst: null }).ok, false);
  assert.equal(G.mayCall({ ...ok, runCap: 0 }).ok, false);
  assert.equal(G.mayCall({ ...ok, spentRun: 0.245 }).ok, false, 'the hard cap holds');
  assert.equal(G.mayCall({ ...ok, stageStop: 3.145 }).ok, false, 'what is left of the stage holds');
});

test('a turn asks the model for a bounded answer (its worst cost is known), through the language guard — at most 3 responses a turn', async () => {
  const seen: Record<string, unknown>[] = [];
  const store = CONVERSATIONS.find((c) => c.key === 'store')!;
  const client = { responses: { create: async (p: Record<string, unknown>) => (seen.push(p), { model: 'stub', output_text: JSON.stringify({ reply: 'You walked out with nothing.', offer: '', anchors: [], facts: [], move: 'reflect' }), usage: { input_tokens: 0, output_tokens: 0 } }) } } as never;
  const e = X.createExploration('live-guard', store.moments.map((m) => ({ label: m.label, excerpt: m.excerpt })));
  const res = await R.handleExploration('conversation-turn', { language: 'he', attemptId: e.attemptId, dreamAnalysis: { ...(typedAnalysis(store.dreamText, true) as unknown as DreamAnalysis) }, exploration: e, momentId: 'm1' }, {}, {
    ...R.realExplorationDeps,
  moderate: async () => ({ status: 'ok' as const, hit: false }),
    resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: 'u' } }) as never,
    openai: () => client,
    rateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }) as never,
    reserveMoment: async () => 'reserved',
    refundMoment: async () => {},
    address: async () => 'masculine',
  });
  // English text in a Hebrew journey is refused by the existing language guard: it retries, then gives up — never more than 3
  assert.ok(seen.length >= 1 && seen.length <= 3, String(seen.length));
  assert.ok(seen.every((p) => p.max_output_tokens === R.TURN_MAX_OUTPUT_TOKENS && p.store === false));
  assert.notEqual(res.status, 200, 'what fails the language guard is not shown');
});

test('the conversation bridge does not start without her approved cap, and spends nothing', () => {
  const before = ledgerText();
  const out = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/conversationBridge.ts'], { encoding: 'utf8', env: { ...process.env, CONV_LIVE_CAP: '', OPENAI_API_KEY: '' }, timeout: 60000 });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /needs her approved cap/);
  assert.equal(ledgerText(), before);
});

test('the page reaches out only to the local bridge on this computer, and only in live mode', () => {
  const bridge = readFileSync('src/devTools/conversationLive.ts', 'utf8');
  for (const m of bridge.matchAll(/https?:\/\/[^\s'"`]+/g)) assert.match(m[0], /^http:\/\/127\.0\.0\.1:8788/);
  const page = readFileSync('src/map/ConversationDemo.tsx', 'utf8');
  assert.doesNotMatch(page, /fetch\(|supabase|XMLHttpRequest|WebSocket|openai/i);
  assert.match(page, /mode === 'live'/);
  const server = readFileSync('scripts/conversationBridge.ts', 'utf8');
  assert.match(server, /listen\(8788, '127\.0\.0\.1'/);
  assert.match(server, /SUPABASE/);
});

test('the window says where she stands: DARE writing, waiting for her answer, or open — and when the moment is done', () => {
  const d = (text: string, offer?: string): X.ConversationTurn => ({ role: 'dare', text, ...(offer ? { offer } : {}) });
  assert.equal(threadState([d('איך הוא נראה לך?')], true, false), 'writing');
  assert.equal(threadState([d('איך הוא נראה לך?')], false, false), 'waiting');
  assert.equal(threadState([d('פשוט וקליל.', 'אולי… זה מתאים לך?')], false, false), 'waiting');
  assert.equal(threadState([d('פשוט וקליל, ושקט.')], false, false), 'open');
  assert.equal(threadState([d('x')], false, true), 'done');
});
