import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as X from '../src/hero/exploration';
import * as C from '../src/hero/conversationTurn';
import * as R from '../server/routes/dreamExploration';
import { typedAnalysis } from '../src/demo/demoRouter';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema';
import { createExplorationEngine } from '../src/hero/explorationEngineCore';
import { CONVERSATIONS } from '../src/map/conversationScript';

/**
 * THE FOUR CONVERSATION IMPROVEMENTS (docs 113, 114; approved 2026-10-25). Written BEFORE the code
 * (docs/upgrade-2026-10/115-conversation-quality-tests-before.txt). No network, no AI.
 *   1. offers grounded and tentative — never a fact, no list of banned words;
 *   2. a natural change of direction when she doubts a meaning or rejects one — no repeat of the same angle, no fixed state;
 *   3. "זה לא מתאים לי": her bubble, a real AI reply at once, once per rejection, 3 replies per dream beyond the 16;
 *   4. "לסיים ולראות מה עלה": the page goes to "התמונה השלמה", loading and errors shown there.
 */

const store = CONVERSATIONS.find((c) => c.key === 'store')!;
const seeds = store.moments.map((m) => ({ label: m.label, excerpt: m.excerpt }));
const ctx = { sourceText: store.dreamText, labels: store.moments.map((m) => m.label), herWords: ['זה פשוט היה מוזר'], language: 'he' as const };
const raw = (offer: string, anchors: string[] = ['המוכר']) => ({ reply: 'מעניין.', offer, anchors: anchors.map((quote) => ({ quote, from: 'dream' as const })), facts: [], move: 'offer' as const });
const T0 = new Date('2026-10-25T09:00:00Z');

// ------------------------------------------------------------------------------------------------ 1. grounded, tentative offers

test('1. an offer stated as a fact is not shown; the same thought as a possibility is; "מסמל" itself is allowed', () => {
  assert.equal(C.checkTurn(raw('העץ מסמל את מה שצומח בך.'), ctx).offer, '', 'a fact about her');
  assert.notEqual(C.checkTurn(raw('אולי העץ מסמל משהו שצומח לאט?'), ctx).offer, '', 'a possibility');
  assert.notEqual(C.checkTurn(raw('מעניין אם יש משמעות לכך שדווקא המוכר הפך לעץ קטן?'), ctx).offer, '', 'a question about meaning');
  assert.notEqual(C.checkTurn(raw('ייתכן שהמוכר והעץ הם אותו רגע של שקט.'), ctx).offer, '');
  // the existing rule stays: an offer needs an anchor that is really there
  assert.equal(C.checkTurn(raw('אולי זה קשור לסבתא שלך?', ['סבתא שלי']), ctx).offer, '');
});

test('1. every approved prepared conversation still shows its offers', () => {
  let offers = 0;
  for (const c of CONVERSATIONS) {
    const cctx = { sourceText: c.dreamText, labels: c.moments.map((m) => m.label), herWords: c.moments.flatMap((m) => m.turns.filter((t) => t.kind === 'dreamer').map((t) => (t as { text: string }).text)), language: 'he' as const };
    for (const m of c.moments) for (const t of m.turns) if (t.kind === 'dare' && t.raw.offer) {
      offers += 1;
      assert.notEqual(C.checkTurn(t.raw, cctx).offer, '', `${c.key}/${m.label}: ${t.raw.offer}`);
    }
  }
  assert.ok(offers > 0);
});

test('1. the instructions say it in her terms: grounded, a possibility, nothing attributed to her, meaning words allowed', () => {
  const p = C.buildTurnSystemPrompt('he', 'feminine');
  assert.match(p, /never attribute to her a feeling, thought, motive or event she did not tell/i);
  assert.match(p, /a detail of the dream does not necessarily stand for anything in her waking life/i);
  assert.match(p, /words like "symbolize" or "meaning" are fine/i);
});

// ------------------------------------------------------------------------------------------------ 2. a change of direction, never a fixed state

test('2. "not sure there is a meaning" is heard — for the next turn only', () => {
  const sig = (her: string) => C.turnSignals({ turns: [{ role: 'dare', text: 'x' }, { role: 'dreamer', text: her }], momentText: 'x' }).meaningDoubt;
  for (const t of ['אני לא יודעת אם יש לזה משמעות', 'זה פשוט היה מוזר', 'לא נראה לי שיש לזה משמעות', 'סתם מוזר, לא יותר', 'I don\'t know if it means anything', "it was just weird"]) assert.equal(sig(t), true, t);
  for (const t of ['העץ היה קטן וירוק', 'הרגשתי הקלה כשהוא הפך לעץ', 'אולי יש לזה משמעות, מה את חושבת?']) assert.equal(sig(t), false, t);
  const input = C.buildTurnInput({ sourceText: 'x', moments: [], moment: { label: 'm', text: 'x' }, earlier: [], turns: [], signals: { rejectedOffer: false, shortOrUnsure: false, sensitive: false, sheAsked: false, meaningDoubt: true, rejectedNow: false }, request: 'reply' });
  assert.match(input, /SHE IS NOT SURE IT MEANS ANYTHING/);
});

test('2. the same angle in other words is not offered again; she can bring it back herself', () => {
  const avoid = { ...ctx, avoidAnchors: ['המוכר'] };
  assert.equal(C.checkTurn(raw('אולי המוכר עצמו הוא העיקר כאן?'), { ...avoid, herLatest: 'זה פשוט היה מוזר' }).offer, '', 'same anchor after she turned it down');
  assert.notEqual(C.checkTurn(raw('אולי הקופסה מספרת משהו משלה?', ['קופסה מלאה ברגים']), { ...avoid, herLatest: 'זה פשוט היה מוזר' }).offer, '', 'another detail is fine');
  assert.notEqual(C.checkTurn(raw('אולי המוכר עצמו הוא העיקר כאן?'), { ...avoid, herLatest: 'בעצם המוכר מעניין אותי, מה זה יכול להגיד?' }).offer, '', 'she came back to it');
  assert.notEqual(C.checkTurn(raw('אולי המוכר עצמו הוא העיקר כאן?'), { ...ctx, herLatest: 'העץ היה קטן' }).offer, '', 'nothing to avoid: no fixed state');
});

// ------------------------------------------------------------------------------------------------ 3. the reject button

const opened = (offer = 'אולי המוכר הוא העיקר?') => X.beginConversation(X.createExploration('q', seeds), 'm1', { role: 'dare', text: 'איך הוא נראה לך?', move: 'offer', offer, anchors: ['המוכר'] } as X.ConversationTurn, T0);

test('3. a rejection marks the offer, adds her bubble once, and asks DARE for one reply', () => {
  const r = X.rejectWithReply(opened(), 'm1');
  assert.equal(r.reply, true);
  const turns = r.e.explored.m1.turns!;
  assert.equal(turns[0].rejected, true);
  assert.deepEqual([turns[1].role, turns[1].text, turns[1].rejection], ['dreamer', 'זה לא מתאים לי', true]);
  assert.equal(X.needsTurnCall(r.e, 'm1'), true);
  const again = X.rejectWithReply(r.e, 'm1');
  assert.equal(again.reply, false, 'a second click adds nothing');
  assert.equal(again.e.explored.m1.turns!.length, 2);
});

test('3. three replies to rejections per dream, apart from the 16; then the button only marks', () => {
  let e = opened();
  for (let i = 0; i < 3; i += 1) {
    const r = X.rejectWithReply(e, 'm1');
    assert.equal(r.reply, true, `rejection ${i + 1}`);
    e = X.addDareTurn(r.e, 'm1', { role: 'dare', text: 'בסדר.', move: 'offer', offer: `אולי משהו אחר ${i}?`, anchors: ['קופסה מלאה ברגים'] } as X.ConversationTurn);
  }
  assert.equal(X.rejectionRepliesUsed(e), 3);
  const fourth = X.rejectWithReply(e, 'm1');
  assert.equal(fourth.reply, false, 'no more AI replies');
  const last = fourth.e.explored.m1.turns!.at(-1)!;
  assert.equal(last.role, 'dare');
  assert.equal(last.rejected, true, 'still marked');
});

const analysis = () => typedAnalysis(store.dreamText, true) as unknown as DreamAnalysis;
let calls = 0;
const client = () => ({ responses: { create: async () => ((calls += 1), { model: 'stub', output_text: JSON.stringify({ reply: 'בסדר, נעזוב את זה. מה עוד את זוכרת מהקופסה?', offer: '', anchors: [], facts: [], move: 'ask' }), usage: { input_tokens: 0, output_tokens: 0 } }) } }) as never;
const deps = (reserved: number[], over: Partial<R.ExplorationDeps> = {}): R.ExplorationDeps => ({
  ...R.realExplorationDeps,
  resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: 'u' } }) as never,
  openai: () => client(),
  rateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }) as never,
  reserveMoment: async (_a, _i, extra) => (reserved.push(extra ?? 0), 'reserved'),
  refundMoment: async () => {},
  reserveWhole: async () => 'reserved',
  refundWhole: async () => {},
  address: async () => 'feminine',
  moderate: async () => ({ status: 'ok' as const, hit: false }),
  ...over,
});
const turnReq = (e: X.Exploration, d: R.ExplorationDeps) => R.handleExploration('conversation-turn', { language: 'he', attemptId: e.attemptId, dreamAnalysis: analysis(), exploration: e, momentId: 'm1' }, {}, d);

test('3. the route: a rejection is answered once, on its own allowance (the 16 stay whole); never twice; never past 3', async () => {
  calls = 0;
  const reserved: number[] = [];
  const r = X.rejectWithReply(opened(), 'm1');
  const res = await turnReq(r.e, deps(reserved));
  assert.ok((res.body as { turn?: unknown }).turn, JSON.stringify(res.body));
  assert.equal(calls, 1);
  assert.deepEqual(reserved, [1], 'one of the 3 extra replies, above the 16');
  // the same rejection again (a retry after DARE already answered): nothing is sent
  const answered = X.addDareTurn(r.e, 'm1', (res.body as { turn: X.ConversationTurn }).turn);
  assert.equal((await turnReq(answered, deps(reserved))).status, 409);
  assert.equal(calls, 1);
  // her ordinary words afterwards: the regular allowance, with the used rejection reply added back on top
  const herWords = X.addDreamerTurn(answered, 'm1', 'הקופסה הייתה כבדה');
  await turnReq(herWords, deps(reserved));
  assert.deepEqual(reserved, [1, 1], 'regular turns still have all 16');
  assert.equal(R.momentCapExtra(herWords), 1);
  assert.ok(R.momentCapExtra(herWords) <= X.MAX_REJECTION_REPLIES);
});

test('3. a forged fourth rejection bubble is refused by the server; safety still comes first', async () => {
  calls = 0;
  let e = opened();
  for (let i = 0; i < 3; i += 1) e = X.addDareTurn(X.rejectWithReply(e, 'm1').e, 'm1', { role: 'dare', text: 'בסדר.', move: 'offer', offer: `אולי משהו ${i}?` } as X.ConversationTurn);
  // a client that adds the bubble anyway
  const forged = { ...e, explored: { ...e.explored, m1: { ...e.explored.m1, turns: [...e.explored.m1.turns!, { role: 'dreamer' as const, text: 'זה לא מתאים לי', rejection: true as const }] } } };
  const res = await turnReq(forged as X.Exploration, deps([]));
  assert.equal(res.status, 409);
  assert.equal(calls, 0);
  // immediate danger earlier in the journey: the rejection sends nothing
  const danger = X.addDreamerTurn(opened(), 'm1', 'לקחתי הרבה כדורים');
  const withDanger = X.rejectWithReply(X.addDareTurn(danger, 'm1', { role: 'dare', text: 'x', offer: 'אולי?', anchors: ['המוכר'] } as X.ConversationTurn), 'm1');
  const stop = await turnReq(withDanger.e, deps([]));
  assert.equal((stop.body as { safety: { level: string } }).safety.level, 'danger');
  assert.equal(calls, 0);
});

test('3. the browser: two quick clicks send one request', async () => {
  let sent = 0;
  const engine = createExplorationEngine({ post: async () => ((sent += 1), await new Promise((r) => setTimeout(r, 20)), { status: 200, data: { turn: { role: 'dare', text: 'בסדר.' } } }) });
  const r = X.rejectWithReply(opened(), 'm1');
  await Promise.all([engine.turn(r.e, analysis(), 'm1', 'he', []), engine.turn(r.e, analysis(), 'm1', 'he', [])]);
  assert.equal(sent, 1);
});

test('3. the page: the button uses the new rejection; when the 3 are used it only marks, with a short line', () => {
  const page = readFileSync('src/map/ConversationDemo.tsx', 'utf8');
  assert.match(page, /X\.rejectWithReply\(/);
  assert.match(page, /השתמשת בשלוש התגובות לדחייה בחלום הזה/);
});

// ------------------------------------------------------------------------------------------------ 4. what came up

test('4. "finish": the page goes to the whole-view panel and focuses it; loading and errors are shown in the panel', () => {
  const page = readFileSync('src/map/ConversationDemo.tsx', 'utf8');
  const map = readFileSync('src/map/DreamMap.tsx', 'utf8');
  assert.match(page, /scrollIntoView\(/);
  assert.match(page, /prefers-reduced-motion/);
  assert.match(page, /setWholeNote\(/);
  assert.match(map, /wholeViewNote\?: string \| null/);
  assert.match(map, /tabIndex=\{-1\}/);
  // the existing loading words stay, in the panel's own status line
  assert.match(map, /wholeViewNote \?\?/);
});
