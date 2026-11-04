import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as X from '../src/hero/exploration';
import * as C from '../src/hero/conversationTurn';
import * as R from '../server/routes/dreamExploration';
import { typedAnalysis } from '../src/demo/demoRouter';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema';
import { CONVERSATIONS } from '../src/map/conversationScript';
import { threadWords } from '../src/map/threadWords';

/**
 * THE THREE-QUESTION LIMIT (bug found on the live site, 2026-10-31): "שאלה 2 מתוך 3" while DARE went on asking, and more than three.
 * The cause: the counter and the route's limit counted DARE's TURNS that held a question mark or one of a few request words, not the
 * questions she saw. A turn with two questions counted once (the one-question rule trimmed only the reply's question marks, never a
 * second question in the offer or a request without a mark); a question without its mark ("מה עלה לך כשראית את זה.", "אפשר לספר לי
 * עוד…", "שתפי…") was not counted at all; and the word "ספר" (a book) counted as a request. Now every question she sees is counted one
 * by one, a turn never shows more than one, and the counter and the limit are the same number. No network, no AI.
 */

const read = (p: string) => readFileSync(p, 'utf8');
const store = CONVERSATIONS.find((c) => c.key === 'store')!;
const seeds = store.moments.map((m) => ({ label: m.label, excerpt: m.excerpt }));
const T0 = new Date('2026-10-31T10:00:00Z');
const d = (text: string, offer?: string): X.ConversationTurn => ({ role: 'dare', text, move: 'ask', ...(offer ? { offer, anchors: ['המוכר'] } : {}) });
const asked = (e: X.Exploration, id = 'm1') => X.questionsAsked(e, id);
const requestOf = (e: X.Exploration, id = 'm1') => (R.planCall('conversation-turn', e, id) as { request?: string } | null)?.request ?? null;
const open = (q = 'מה בלט לך אצל המוכר?') => X.beginConversation(X.createExploration('q', seeds), 'm1', d(q), T0);
const say = (e: X.Exploration, words: string, id = 'm1') => X.addDreamerTurn(e, id, words);
const dare = (e: X.Exploration, turn: X.ConversationTurn, id = 'm1') => X.addDareTurn(e, id, turn);

// ------------------------------------------------------------------------------------------------ the root cause: what is a question

test('cause: every question she sees counts once — two in a turn are two, one without its mark is one, a book is not a request', () => {
  const q = (text: string, offer?: string) => X.questionsIn(d(text, offer));
  assert.equal(q('מה בלט לך?'), 1);
  assert.equal(q('מעניין.', 'אולי המוכר הוא העיקר? זה נשמע לך נכון?'), 2, 'two questions in one turn were counted as one');
  assert.equal(q('ספרי לי עוד על החלון.'), 1);
  assert.equal(q('אפשר לספר לי עוד על החלון.'), 1, 'a request without a mark was not counted');
  assert.equal(q('שתפי מה עלה לך שם.'), 1);
  assert.equal(q('מה עלה לך כשראית את זה.'), 1, 'a question that lost its mark was not counted');
  assert.equal(q('ואיך זה הרגיש.'), 1);
  assert.equal(q('מצאת ספר עם השם שלך על הכריכה.'), 0, '"ספר" is a book here: it counted as a request');
  assert.equal(q('מה שבלט לך הוא החלון. מהחלום עולה תמונה שקטה.'), 0);
  assert.equal(q('בחלום נכתב «מי שם?» על הדלת.'), 0, 'a question mark inside a quote of the dream is not hers to answer');
  assert.equal(X.questionsIn({ role: 'dare', text: 'מה עוד?', move: 'summarize', closing: true }), 0, 'the closing line never counts');
  assert.equal(q('Tell me more about the window.'), 1);
  assert.equal(q('What stood out to you? And why there?'), 2);
  assert.equal(q('What you described sounds quiet.'), 0);
});

test('cause: a turn never shows a second question (reply and offer together, with or without a mark), so the count is exact', () => {
  const ctx = { sourceText: store.dreamText, labels: seeds.map((s) => s.label), herWords: ['הוא חייך'], language: 'he' as const };
  const raw = (reply: string, offer = '') => ({ reply, offer, anchors: offer ? [{ quote: 'המוכר', from: 'dream' as const }] : [], facts: [], move: 'ask' as const });
  const shown = (r: { reply: string; offer: string }) => X.questionsIn({ role: 'dare', text: r.reply, offer: r.offer });
  assert.equal(shown(C.checkTurn(raw('מה בלט לך? ומה עוד היה שם?'), ctx)), 1);
  assert.equal(shown(C.checkTurn(raw('ספרי לי על החיוך.', 'אולי המוכר הוא העיקר כאן?'), ctx)), 1, 'a request in the reply beside the offer\'s question');
  const two = C.checkTurn(raw('מעניין.', 'אולי המוכר הוא העיקר כאן? זה נשמע לך נכון?'), ctx);
  assert.equal(two.offer, 'אולי המוכר הוא העיקר כאן?');
  assert.ok(two.dropped.includes('a second question in the same turn'));
  assert.equal(shown(C.checkTurn(raw('מה עלה לך כשראית אותו. ספרי לי עוד.'), ctx)), 1);
});

// ------------------------------------------------------------------------------------------------ the scenarios she listed

// The scenarios of 2026-10-31 that ended a moment with the model's closing line, or counted question sentences, gave way to her rule of
// 2026-11-04 (three rounds, no fourth turn): they are tests/threeRounds20261104.test.ts.





const analysis = () => typedAnalysis(store.dreamText, true) as unknown as DreamAnalysis;
const stubDeps = (raw: Record<string, unknown>): R.ExplorationDeps => ({
  ...R.realExplorationDeps,
  resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: 'u' } }) as never,
  openai: () => ({ responses: { create: async () => ({ model: 'stub', output_text: JSON.stringify({ reply: 'בסדר. מה עוד בלט לך שם?', offer: '', anchors: [], facts: [], move: 'ask', mine: [], ideas: [], open: [], ...raw }), usage: { input_tokens: 0, output_tokens: 0 } }) } }) as never,
  rateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }) as never,
  reserveMoment: async () => 'reserved',
  refundMoment: async () => {},
  reserveWhole: async () => 'reserved',
  refundWhole: async () => {},
  address: async () => 'feminine',
  moderate: async () => ({ status: 'ok' as const, hit: false }),
});
const turnFor = async (e: X.Exploration, raw: Record<string, unknown>, language: 'he' | 'en' = 'he') => {
  const out = await R.handleExploration('conversation-turn', { language, attemptId: e.attemptId, dreamAnalysis: analysis(), exploration: e, momentId: 'm1' }, {}, stubDeps(raw));
  assert.equal(out.status, 200);
  return (out.body as { turn: X.ConversationTurn }).turn;
};


test('the route keeps the limit even when the model writes two questions at the second: the count goes to 3, never 4', async () => {
  let e = open();
  e = dare(say(e, 'א'), d('מה עוד?'));
  const next = say(e, 'ב');
  const t = await turnFor(next, { reply: 'מה היה שם? ומה עשית?' });
  assert.equal(X.questionsIn(t), 1);
  assert.equal(asked(dare(next, t)), 3);
  const t2 = await turnFor(next, { reply: 'מעניין.', offer: 'אולי המוכר הוא העיקר? זה נשמע לך נכון?', anchors: [{ quote: 'המוכר', from: 'dream' }] });
  assert.equal(X.questionsIn(t2), 1);
});

test('closing and reopening the window: nothing is asked again and the counter reads the same; an unanswered visit keeps its questions', () => {
  assert.match(read('src/map/DreamJourneyMap.tsx'), /<MomentWindow key=\{moment\.id\} shouldOpen=\{!entry\}/, 'a moment already open is not opened again');
  let e = open();
  assert.equal(asked(e), 1);
  e = X.abandonMoment(e, 'm1');
  assert.equal(asked(e), 1, 'the question of the unanswered visit stays counted');
  assert.equal(requestOf(e), 'open');
  e = X.beginConversation(e, 'm1', d('ומה עם הקופסה?'), T0);
  assert.equal(asked(e), 2);
  e = X.abandonMoment(e, 'm1');
  e = X.beginConversation(e, 'm1', d('ומה עשית שם?'), T0);
  e = X.abandonMoment(e, 'm1');
  assert.equal(asked(e), 3);
  assert.equal(R.planCall('conversation-turn', e, 'm1'), null, 'three questions spent over visits: not opened again');
  assert.equal(X.anotherMomentLeft(e, 'm2'), seeds.length > 2, 'and it is not offered as "another moment"');
  // the count kept across visits survives saving and loading, never above three
  assert.equal(X.questionsAsked(X.parseExploration(JSON.parse(JSON.stringify({ ...e, asked: { m1: 9 } })))!, 'm1'), 3);
});

test('moving between two moments and back: each keeps its own count; a moment she talked in is not reopened for more', () => {
  let e = open();
  e = dare(say(e, 'א'), d('מה עוד?'));
  e = X.completeConversation(e, 'm1', T0);
  e = X.beginConversation(e, 'm2', d('מה בלט לך בקופסה?'), T0);
  assert.equal(asked(e, 'm1'), 2);
  assert.equal(asked(e, 'm2'), 1);
  e = X.completeConversation(dare(say(e, 'ברגים', 'm2'), d('ומה עשית בהם?'), 'm2'), 'm2', T0);
  assert.equal(asked(e, 'm2'), 2);
  assert.equal(R.planCall('conversation-turn', e, 'm1'), null, 'back to the first: nothing more is asked there');
  assert.equal(asked(e, 'm1'), 2);
});

test('one send at a time: Enter, the button, a direction or "doesn\'t fit" press cannot send twice', () => {
  const map = read('src/map/DreamJourneyMap.tsx');
  assert.match(map, /if \(!words \|\| pending \|\| sending\.current \|\| stoppedFor\(id\)\) return;/);
  assert.match(read('src/hero/explorationEngineCore.ts'), /return once\(`\$\{e\.attemptId\}\|t\|\$\{momentId\}\|\$\{n\}\|/, 'the same turn is asked of DARE once');
  const e = open();
  const once = X.steerWithReply(e, 'm1', 'shift')!;
  assert.equal(X.steerWithReply(once, 'm1', 'shift'), null);
});
