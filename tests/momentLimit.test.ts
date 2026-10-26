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
 * CLOSING THE EXPLORATION (approved 2026-10-25): at most 3 questions of DARE per moment, one per turn; after her third answer a
 * short closing line with no question, and two ways out; the counter survives leaving and coming back; the summary fixed
 * (a moment answered only with buttons is no longer dropped by the server) and its failures named precisely; open questions kept
 * apart in "מה לקחתי מהחלום". Written BEFORE the code (docs/upgrade-2026-10/120-moment-limit-tests-before.txt). No network, no AI.
 */

const store = CONVERSATIONS.find((c) => c.key === 'store')!;
const seeds = store.moments.map((m) => ({ label: m.label, excerpt: m.excerpt }));
const T0 = new Date('2026-10-25T12:00:00Z');
const q = (text: string, extra: Partial<X.ConversationTurn> = {}): X.ConversationTurn => ({ role: 'dare', text, move: 'ask', ...extra });
const open = () => X.beginConversation(X.createExploration('lim', seeds), 'm1', q('איך הוא נראה לך?'), T0);
/** Three questions asked and answered in m1. */
const threeAsked = () => {
  let e = X.addDreamerTurn(open(), 'm1', 'הוא היה מבוגר');
  e = X.addDareTurn(e, 'm1', q('ומה הוא עשה?'));
  e = X.addDreamerTurn(e, 'm1', 'הוא הושיט קופסה');
  e = X.addDareTurn(e, 'm1', q('ספרי לי עוד על הקופסה'));
  return X.addDreamerTurn(e, 'm1', 'היא הייתה כבדה');
};

// ------------------------------------------------------------------------------------------------ counting questions

test('a question is any turn of DARE that asks her to answer — a question mark or an indirect request; a statement or the closing line is not', () => {
  assert.equal(X.isQuestionTurn(q('איך הוא נראה לך?')), true);
  assert.equal(X.isQuestionTurn(q('ספרי לי עוד על הקופסה')), true, 'indirect');
  assert.equal(X.isQuestionTurn(q('אשמח לשמוע מה הרגשת שם')), true, 'indirect');
  assert.equal(X.isQuestionTurn(q('מעניין.', { offer: 'אולי הקופסה היא העיקר?' })), true, 'a question in the offer');
  assert.equal(X.isQuestionTurn(q('כבדה, כמו משהו שנשאר איתך.')), false);
  assert.equal(X.isQuestionTurn(q('תודה ששיתפת.', { closing: true })), false);
  assert.equal(X.questionsAsked(threeAsked(), 'm1'), 3);
  assert.equal(X.MAX_QUESTIONS_PER_MOMENT, 3);
});

test('one question per turn: a second question in the same turn is not shown', () => {
  const ctx = { sourceText: store.dreamText, labels: [], herWords: [], language: 'he' as const };
  const two = C.checkTurn({ reply: 'מה ראית שם? ומה שמעת?', offer: '', anchors: [], facts: [], move: 'ask' }, ctx);
  assert.equal((two.reply.match(/\?/g) ?? []).length, 1);
  const withOffer = C.checkTurn({ reply: 'כבדה. מה עוד?', offer: 'אולי הקופסה היא העיקר כאן?', anchors: [{ quote: 'קופסה מלאה ברגים', from: 'dream' }], facts: [], move: 'offer' }, ctx);
  assert.equal(((withOffer.reply + withOffer.offer).match(/\?/g) ?? []).length, 1, 'the offer is the one question');
});

// ------------------------------------------------------------------------------------------------ the route

const analysis = () => typedAnalysis(store.dreamText, true) as unknown as DreamAnalysis;
let calls = 0;
let lastInput = '';
const client = (raw: Record<string, unknown>) => ({ responses: { create: async (p: { input: string }) => ((calls += 1), (lastInput = String(p.input)), { model: 'stub', output_text: JSON.stringify({ reply: 'כבדה, כמו משהו שנשאר איתך. ומה עוד?', offer: 'אולי הקופסה היא העיקר?', anchors: [{ quote: 'קופסה מלאה ברגים', from: 'dream' }], facts: [], move: 'reflect', mine: [], ideas: [], open: [], ...raw }), usage: { input_tokens: 0, output_tokens: 0 } }) } }) as never;
const deps = (raw: Record<string, unknown> = {}, over: Partial<R.ExplorationDeps> = {}): R.ExplorationDeps => ({
  ...R.realExplorationDeps,
  resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: 'u' } }) as never,
  openai: () => client(raw),
  rateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }) as never,
  reserveMoment: async () => 'reserved',
  refundMoment: async () => {},
  reserveWhole: async () => 'reserved',
  refundWhole: async () => {},
  address: async () => 'feminine',
  moderate: async () => ({ status: 'ok' as const, hit: false }),
  ...over,
});
const ask = (mode: 'conversation-turn' | 'conversation-summary', e: X.Exploration, d: R.ExplorationDeps, momentId: string | null = 'm1') =>
  R.handleExploration(mode, { language: 'he', attemptId: e.attemptId, dreamAnalysis: analysis(), exploration: e, momentId }, {}, d);

test('after her third answer DARE closes: a short line, no question, no offer — and nothing more is asked in that moment', async () => {
  calls = 0;
  const res = await ask('conversation-turn', threeAsked(), deps());
  const t = (res.body as { turn: X.ConversationTurn }).turn;
  assert.match(lastInput, /CLOSE this moment/);
  assert.equal(t.closing, true);
  assert.ok(!t.text.includes('?') && !t.offer, JSON.stringify(t));
  const closed = X.addDareTurn(threeAsked(), 'm1', t);
  assert.equal(X.momentClosed(closed, 'm1'), true);
  // her words afterwards (a stale page, a forged request): no call
  const after = X.addDreamerTurn(closed, 'm1', 'עוד משהו');
  assert.equal(X.needsTurnCall(after, 'm1'), false);
  assert.equal((await ask('conversation-turn', after, deps())).status, 409);
  assert.equal(calls, 1);
});

test('the direction buttons and "זה לא מתאים לי" do not get round it: after three questions they lead to the closing line', async () => {
  for (const make of [(e: X.Exploration) => X.steerWithReply(e, 'm1', 'deepen'), (e: X.Exploration) => X.steerWithReply(e, 'm1', 'shift'), (e: X.Exploration) => X.rejectWithReply(e, 'm1').e]) {
    let e = X.addDareTurn(threeAsked(), 'm1', q('אולי משהו?', { offer: 'אולי הקופסה היא העיקר?', anchors: ['קופסה מלאה ברגים'] }));
    // that turn was a fourth question only in this setup: the counter says the moment is spent
    e = make(e)!;
    const res = await ask('conversation-turn', e, deps());
    assert.equal((res.body as { turn: X.ConversationTurn }).turn.closing, true);
  }
});

test('the counter is kept per moment: leaving a moment unanswered and opening it again does not start it over; an explored moment cannot be reopened', () => {
  let e = open();
  e = X.abandonMoment(e, 'm1');
  assert.equal(X.questionsAsked(e, 'm1'), 1, 'the unanswered opening still counts');
  e = X.beginConversation(e, 'm1', q('ומה עכשיו?'), T0);
  assert.equal(X.questionsAsked(e, 'm1'), 2);
  const explored = X.completeConversation(threeAsked(), 'm1');
  assert.equal(X.beginConversation(explored, 'm1', q('שוב?'), T0), explored);
  // the counter travels with the journey (the server reads it back)
  assert.equal(X.questionsAsked(X.parseExploration(JSON.parse(JSON.stringify(e)))!, 'm1'), 2);
});

// ------------------------------------------------------------------------------------------------ the summary

test('the summary fix: a moment answered only with buttons is kept by the server, so the summary covers what the page shows', () => {
  let e = X.beginConversation(X.createExploration('fix', seeds), 'm1', q('איך?', { offer: 'אולי המוכר?', anchors: ['המוכר'] }), T0);
  e = X.addDareTurn(X.rejectWithReply(e, 'm1').e, 'm1', q('בסדר.'));
  e = X.completeConversation(e, 'm1');
  e = X.beginConversation(e, 'm2', q('ומה כאן?'), T0);
  e = X.addDareTurn(X.steerWithReply(e, 'm2', 'deepen')!, 'm2', q('כן.'));
  e = X.completeConversation(e, 'm2');
  const back = X.parseExploration(JSON.parse(JSON.stringify(e)))!;
  assert.equal(X.exploredCount(back), X.exploredCount(e));
  assert.equal(X.basedOnKey(back), X.basedOnKey(e));
});

test('a summary is made from one moment and from several', async () => {
  const one = X.completeConversation(threeAsked(), 'm1');
  const r1 = await ask('conversation-summary', one, deps({ reply: 'עלה כאן משהו על קופסה כבדה.', offer: '', move: 'summarize' }), null);
  assert.ok((r1.body as { wholeView?: { overview: string } }).wholeView?.overview, JSON.stringify(r1.body));
  let several = one;
  for (const id of ['m2', 'm3']) several = X.completeConversation(X.addDreamerTurn(X.beginConversation(several, id, q('ומה כאן?'), T0), id, 'תשובה'), id);
  const r3 = await ask('conversation-summary', several, deps({ reply: 'שלושה רגעים, וקופסה כבדה.', offer: '', move: 'summarize' }), null);
  assert.ok((r3.body as { wholeView?: { overview: string } }).wholeView?.overview);
  assert.equal(X.exploredCount(several), 3);
});

test('summary failures are named: held back by the safety check, the AI not available, the test budget — never a summary that was not made', async () => {
  const one = X.completeConversation(threeAsked(), 'm1');
  const held = await ask('conversation-summary', one, deps({ reply: 'אפשר לקחת כמה כדורי שינה כדי להירדם לתמיד.', offer: '', move: 'summarize' }), null);
  assert.equal((held.body as { reason: string }).reason, 'held_back');
  const down = await ask('conversation-summary', one, deps({}, { moderate: async () => ({ status: 'unavailable' as const }) }), null);
  assert.equal((down.body as { reason: string }).reason, 'held_back');
  // the browser keeps the reason
  const engine = createExplorationEngine({ post: async () => ({ status: 502, data: { reason: 'held_back', message: 'x' } }) });
  const out = await engine.wholeView(one, analysis(), 'he', [], 'conversation-summary');
  assert.equal((out as { reason: string }).reason, 'held_back');
  const engine2 = createExplorationEngine({ post: async () => ({ status: 402, data: { reason: 'budget_reached', message: 'x' } }) });
  assert.equal(((await engine2.wholeView(one, analysis(), 'he', [], 'conversation-summary')) as { reason: string }).reason, 'budget_reached');
  // the live test bridge names a refusal of its budget guard
  assert.match(readFileSync('scripts/conversationBridge.ts', 'utf8'), /budget_reached/);
  // the page has a precise sentence for each, and a technical code in the console (no content)
  const page = readFileSync('src/map/ConversationDemo.tsx', 'utf8');
  for (const s of ['לא עבר את בדיקת הבטיחות', 'תקציב בדיקת השיחה נגמר', 'שירות ה־AI לא זמין כרגע', 'צריך קודם לשוחח על רגע אחד לפחות']) assert.ok(page.includes(s), s);
  assert.match(page, /console\.info\(`\[DARE\] summary/);
});

test('"מה לקחתי מהחלום" keeps open questions apart, only questions that really came up', () => {
  const ctx = { sourceText: store.dreamText, labels: [], herWords: ['למה דווקא בורג?'], language: 'he' as const, offers: [], questions: ['ומה הוא עשה?'] };
  const t = C.checkTurn({ reply: 'סיכום.', offer: '', anchors: [], facts: [], move: 'summarize', open: ['למה דווקא בורג?', 'ומה הוא עשה?', 'מה החלום אומר עלייך?'] }, ctx);
  assert.deepEqual(t.open, ['למה דווקא בורג?', 'ומה הוא עשה?'], 'an invented question is not kept');
  for (const s of ['שאלות שנשארו פתוחות']) assert.ok(readFileSync('src/map/mapStrings.ts', 'utf8').includes(s), s);
  assert.match(C.buildTurnSystemPrompt('he', 'feminine'), /never attribute an event or a detail to the wrong moment/i);
});

// ------------------------------------------------------------------------------------------------ the window

test('the window: after the closing line, two clear ways out instead of the writing box; leaving early is always possible; finish closes every open moment', () => {
  const thread = readFileSync('src/map/ConversationThread.tsx', 'utf8') + readFileSync('src/map/threadWords.ts', 'utf8');
  assert.match(thread, /מעבר למפת החלום/);
  assert.match(thread, /closed\?: boolean/);
  const page = readFileSync('src/map/ConversationDemo.tsx', 'utf8');
  assert.match(page, /eRef\.current/);
  assert.match(page, /while \(X\.exploringId\(base\)/);
});
