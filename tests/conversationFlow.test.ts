import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as X from '../src/hero/exploration.ts';
import { typedAnalysis } from '../src/demo/demoRouter.ts';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema.ts';
import * as R from '../server/routes/dreamExploration.ts';
import { createExplorationEngine } from '../src/hero/explorationEngineCore.ts';
import { CONVERSATIONS, summaryOf } from '../src/map/conversationScript.ts';

/**
 * THE CONVERSATION ENGINE IN THE FLOW (doc 102, step 2): the journey keeps the turns of each moment (an optional field, older records
 * unchanged, no database change), the route makes ONE call per turn with the existing identity, rate limit and slots and no retry for a
 * quote, "what came up" uses the whole-view slot, the browser side carries the turns, and the development page stays out of the site.
 * Written BEFORE the build (doc 103). The model is a stub: no network, no AI call.
 */

const T0 = new Date('2026-10-24T10:00:00Z');
const X_ = X as unknown as Record<string, any>;
const R_ = R as unknown as Record<string, any>;
const store = CONVERSATIONS.find((c) => c.key === 'store')!;
const analysis = () => ({ ...(typedAnalysis(store.dreamText, true) as unknown as DreamAnalysis), sourceText: store.dreamText });
const seeds = store.moments.map((m) => ({ label: m.label, excerpt: m.excerpt }));
const firstDare = store.moments[0].turns[0];

// ------------------------------------------------------------------------------------------------ the journey's data

test('a moment as a conversation: opened by DARE, her turns and DARE\'s, an offer she rejects, closed when she moves on', () => {
  let e = X.createExploration('conv-store', seeds);
  e = X_.beginConversation(e, 'm1', { role: 'dare', text: 'איך הוא נראה לך?', move: 'ask' }, T0);
  assert.equal(e.explored.m1.status, 'exploring');
  assert.equal(X_.needsTurnCall(e, 'm1'), false, 'DARE spoke last: nothing to ask the model');
  e = X_.addDreamerTurn(e, 'm1', 'פשוט וקליל.');
  assert.equal(e.explored.m1.answer, 'פשוט וקליל.', 'her first words stay the moment\'s answer (the map and older readers use it)');
  assert.equal(X_.needsTurnCall(e, 'm1'), true);
  e = X_.addDareTurn(e, 'm1', { role: 'dare', text: 'פשוט וקליל.', move: 'offer', offer: 'אולי…? זה מתאים לך?' });
  e = X_.rejectOffer(e, 'm1');
  assert.equal(e.explored.m1.turns?.at(-1)?.rejected, true);
  e = X_.addDreamerTurn(e, 'm1', 'לא ממש.');
  e = X_.completeConversation(e, 'm1', T0);
  assert.equal(e.explored.m1.status, 'explored');
  assert.equal(e.explored.m1.order, 1);
  // stored and read back: the turns stay; an older record (no turns) reads as before
  const back = X.parseExploration(JSON.parse(JSON.stringify(e)));
  assert.equal(back?.explored.m1.status, 'explored');
  assert.equal(back?.explored.m1.turns?.length, 4);
  assert.equal(back?.explored.m1.turns?.[2].rejected, true, 'the offer (DARE\'s second turn) she rejected');
});

test('a moment is closed only after she said something; turns are bounded and cleaned on reading', () => {
  let e = X.createExploration('conv-bounds', seeds);
  e = X_.beginConversation(e, 'm1', { role: 'dare', text: 'איך?', move: 'ask' }, T0);
  assert.equal(X_.completeConversation(e, 'm1', T0).explored.m1.status, 'exploring', 'no words of hers yet');
  const bloated = JSON.parse(JSON.stringify(e));
  bloated.explored.m1.turns = Array.from({ length: 200 }, (_, i) => ({ role: i % 2 ? 'dreamer' : 'dare', text: 'x'.repeat(5000), move: 'nope', junk: true }));
  const back = X.parseExploration(bloated)!;
  assert.ok((back.explored.m1.turns?.length ?? 0) <= 60);
  assert.ok((back.explored.m1.turns ?? []).every((t) => t.text.length <= 1500 && (t.move === undefined || ['reflect', 'ask', 'offer', 'deepen', 'summarize'].includes(t.move))));
});

// ------------------------------------------------------------------------------------------------ the route

let calls = 0;
const stub = (json: unknown) => {
  calls = 0;
  return { responses: { create: async () => ((calls += 1), { model: 'stub', output_text: JSON.stringify(json), usage: { input_tokens: 0, output_tokens: 0 } }) } } as never;
};
const deps = (over: Partial<R.ExplorationDeps> = {}) => {
  const log: string[] = [];
  const d: R.ExplorationDeps = {
    ...R.realExplorationDeps,
  moderate: async () => ({ status: 'ok' as const, hit: false }),
    resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: 'u1' } }) as never,
    openai: () => stub((firstDare as { raw: unknown }).raw),
    trialState: async () => 'ok' as never,
    completeTrial: async () => 'completed' as never,
    rateLimit: async () => (log.push('rate'), { allowed: true, retryAfterSeconds: 0 }) as never,
    reserveMoment: async () => (log.push('moment'), 'reserved'),
    refundMoment: async () => void log.push('refund-moment'),
    reserveWhole: async () => (log.push('whole'), 'reserved'),
    refundWhole: async () => void log.push('refund-whole'),
    address: async () => 'masculine',
    ...over,
  };
  return { d, log };
};
const body = (e: X.Exploration, extra: Record<string, unknown> = {}) => ({ language: 'he', attemptId: e.attemptId, dreamAnalysis: analysis(), exploration: e, ...extra });

test('opening a moment: one call, the moment slot and the rate limit as before; the reply is checked', async () => {
  const e = X.createExploration('conv-route', seeds);
  const { d, log } = deps();
  const res = await R.handleExploration('conversation-turn' as never, body(e, { momentId: 'm1' }), {}, d);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(log, ['rate', 'moment']);
  const turn = (res.body as { turn: { role: string; text: string; move: string } }).turn;
  assert.equal(turn.role, 'dare');
  assert.match(turn.text, /עץ זית קטן/);
});

test('a reply turn after her words; a bad quote costs no second call; nothing to ask when DARE spoke last (409)', async () => {
  let e = X.createExploration('conv-route2', seeds);
  e = X_.beginConversation(e, 'm3', { role: 'dare', text: 'מה עבר לך בראש שם?', move: 'ask' }, T0);
  const { d } = deps({ openai: () => stub({ reply: 'אמרת «הרגשתי פחד מהמוכר». ויצאת בלי כלום ביד.', offer: '', anchors: [], facts: [], move: 'reflect' }) });
  assert.equal((await R.handleExploration('conversation-turn' as never, body(e, { momentId: 'm3' }), {}, d)).status, 409);
  e = X_.addDreamerTurn(e, 'm3', 'הבנתי שאני מחפש משהו, אבל בעצם ידעתי כבר מה אני צריך. הרגשתי חוסר ומוזרות.');
  const res = await R.handleExploration('conversation-turn' as never, body(e, { momentId: 'm3' }), {}, d);
  assert.equal(res.status, 200);
  assert.equal(calls, 1, 'no retry for a quote');
  const turn = (res.body as { turn: { text: string } }).turn;
  assert.doesNotMatch(turn.text, /פחד/);
});

test('"what came up" uses the whole-view slot, from the conversations so far', async () => {
  let e = X.createExploration('conv-sum', seeds);
  e = X_.beginConversation(e, 'm1', { role: 'dare', text: 'איך הוא נראה לך?', move: 'ask' }, T0);
  e = X_.addDreamerTurn(e, 'm1', 'עץ הזית הקטן היה פשוט וקליל, עם עלים ירוקים כהים וגזע דק. הוא נתן תחושה של שקט ושלווה.');
  e = X_.completeConversation(e, 'm1', T0);
  const summary = { raw: summaryOf(store, ['המוכר לתוך העץ']) };
  const { d, log } = deps({ openai: () => stub(summary.raw) });
  const res = await R.handleExploration('conversation-summary' as never, body(e), {}, d);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(log, ['rate', 'whole']);
  const w = (res.body as { wholeView: { overview: string; notice: unknown } }).wholeView;
  assert.match(w.overview, /פשוט וקליל/);
  assert.equal(w.notice ?? null, null, 'no technical notice');
});

test('the live dependencies and the reflection endpoint know the conversation', () => {
  assert.equal(R.realExplorationDeps.generateTurn, R_.generateConversationTurn);
  assert.match(readFileSync('server/routes/dreamReflection.ts', 'utf8'), /conversation-turn/);
});

// ------------------------------------------------------------------------------------------------ the browser side

test('the browser side asks for a turn only when she spoke last, and keeps what it receives', async () => {
  const sent: unknown[] = [];
  const engine = createExplorationEngine({ post: async (_u, b) => (sent.push(b), { status: 200, data: { momentId: 'm1', turn: { role: 'dare', text: 'איך הוא נראה לך?', move: 'ask' } } }) }) as unknown as Record<string, any>;
  let e = X.createExploration('conv-engine', seeds);
  const out = await engine.turn(e, analysis(), 'm1', 'he', []);
  assert.equal(out.status, 'ok');
  assert.equal(out.turn.text, 'איך הוא נראה לך?');
  assert.equal((sent[0] as { mode: string }).mode, 'conversation-turn');
  e = X_.beginConversation(e, 'm1', out.turn, T0);
  const again = await engine.turn(e, analysis(), 'm1', 'he', []);
  assert.equal(again.status, 'error', 'DARE spoke last: no request');
  assert.equal(sent.length, 1);
});

// ------------------------------------------------------------------------------------------------ the development page

test('the conversation page is development only and calls nothing', () => {
  assert.ok(existsSync('conversation.html'));
  const config = readFileSync('vite.config.ts', 'utf8');
  assert.ok(!/conversation\.html/.test(config));
  for (const f of ['src/map/ConversationDemo.tsx', 'src/map/conversationMain.tsx', 'src/map/ConversationThread.tsx']) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/fetch\(|supabase|XMLHttpRequest|WebSocket|openai/i.test(src), `${f} reaches out`);
  }
});
