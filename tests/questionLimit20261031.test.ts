import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
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
const closing = (e: X.Exploration, id = 'm1') => X.addDareTurn(e, id, { role: 'dare', text: 'תודה על מה ששיתפת ברגע הזה.', move: 'summarize', closing: true });

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

test('three regular questions: 1, 2, 3, then her answer gets a closing line and nothing more is asked', () => {
  let e = open();
  assert.equal(asked(e), 1);
  e = dare(say(e, 'הוא חייך אליי'), d('מה היה בחיוך?'));
  assert.equal(asked(e), 2);
  assert.equal(requestOf(say(e, 'חום')), 'reply');
  e = dare(say(e, 'חום'), d('ומה עשית אז?'));
  assert.equal(asked(e), 3);
  const answered = say(e, 'הלכתי');
  assert.equal(requestOf(answered), 'close', 'after the third question: the closing line, never a fourth');
  const closed = closing(answered);
  assert.equal(asked(closed), 3);
  assert.equal(X.momentClosed(closed, 'm1'), true);
  assert.equal(R.planCall('conversation-turn', say(closed, 'עוד משהו'), 'm1'), null, 'a forged answer after the closing line asks DARE nothing');
});

test('a reply without a question is not a question: the conversation goes on, and the third real question still closes it', () => {
  let e = open();
  e = dare(say(e, 'א'), d('הבנתי, זה היה שקט.'));
  assert.equal(asked(e), 1);
  e = dare(say(e, 'ב'), d('מה עוד בלט?'));
  e = dare(say(e, 'ג'), d('ומה עשית אז?'));
  assert.equal(asked(e), 3);
  assert.equal(requestOf(say(e, 'ד')), 'close');
});

test('"change direction" after the first and the second question: counted as before, never reset; after the third it only closes', () => {
  const w = threadWords('feminine');
  let e = open();
  let s = X.steerWithReply(e, 'm1', 'shift', w.shift)!;
  assert.equal(asked(s), 1, 'the press itself is not a question and resets nothing');
  assert.equal(requestOf(s), 'reply');
  e = dare(s, d('ומה עם הקופסה?'));
  assert.equal(asked(e), 2);
  s = X.steerWithReply(e, 'm1', 'shift', w.shift)!;
  e = dare(s, d('ומה עשית שם?'));
  assert.equal(asked(e), 3);
  assert.equal(requestOf(X.steerWithReply(e, 'm1', 'shift', w.shift)!), 'close', 'a third press closes, it does not open a fourth question');
  assert.equal(X.steerWithReply(X.steerWithReply(e, 'm1', 'shift', w.shift)!, 'm1', 'shift', w.shift), null, 'a second click adds nothing');
});

test('"this doesn\'t fit me" during the conversation: counted as before, never reset; after the third question it only closes', () => {
  let e = X.beginConversation(X.createExploration('q', seeds), 'm1', d('מעניין.', 'אולי המוכר הוא העיקר?'), T0);
  const r1 = X.rejectWithReply(e, 'm1', threadWords('feminine').notForMe);
  assert.equal(r1.reply, true);
  assert.equal(asked(r1.e), 1);
  e = dare(r1.e, d('הבנתי. מה בלט לך שם?'));
  e = dare(say(e, 'הקופסה'), d('מעניין.', 'אולי הקופסה מספרת משהו?'));
  assert.equal(asked(e), 3);
  const r2 = X.rejectWithReply(e, 'm1', threadWords('feminine').notForMe);
  assert.equal(requestOf(r2.e), 'close');
  assert.deepEqual(X.rejectWithReply(r2.e, 'm1').e, r2.e, 'a second click adds nothing');
});

test('"keep going this way" asks nothing by itself; her words then count as any answer', () => {
  const src = read('src/map/ConversationThread.tsx');
  assert.match(src, /onClick=\{\(\) => setWriting\(true\)\}>\s*\{w\.deepen\}/, 'the button only opens the box');
  let e = open();
  e = dare(say(e, 'ממשיכה'), d('מה עוד?'));
  e = dare(say(e, 'עוד'), d('ואז?'));
  assert.equal(asked(e), 3);
  // an older journey that recorded the press as a turn: the same limit
  assert.equal(requestOf(X.steerWithReply(e, 'm1', 'deepen')!), 'close');
});

const analysis = () => typedAnalysis(store.dreamText, true) as unknown as DreamAnalysis;
const stubDeps = (raw: Record<string, unknown>): R.ExplorationDeps => ({
  ...R.realExplorationDeps,
  resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: 'u' } }) as never,
  openai: () => ({ responses: { create: async () => ({ model: 'stub', output_text: JSON.stringify({ reply: 'בסדר.', offer: '', anchors: [], facts: [], move: 'ask', mine: [], ideas: [], open: [], ...raw }), usage: { input_tokens: 0, output_tokens: 0 } }) } }) as never,
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

test('answering after the third question: her words go, and DARE answers with a short closing line that asks nothing', async () => {
  let e = open();
  e = dare(say(e, 'א'), d('מה עוד?'));
  e = dare(say(e, 'ב'), d('ואז?'));
  const t = await turnFor(say(e, 'ג'), { reply: 'תודה על מה ששיתפת. ומה עוד עלה לך?', offer: 'אולי עוד משהו?', anchors: [{ quote: 'המוכר', from: 'dream' }] });
  assert.equal(t.closing, true);
  assert.equal(X.questionsIn({ ...t, closing: undefined }), 0, 'no question of any kind, no offer');
  assert.equal(t.offer, undefined);
});

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

// ------------------------------------------------------------------------------------------------ the window, in Hebrew and English

register('data:text/javascript,' + encodeURIComponent(`export async function load(url, context, next) { if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true }; return next(url, context); }`));
const React = await import('react');
(globalThis as unknown as { React: typeof React }).React = React;
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: ConversationThread } = await import('../src/map/ConversationThread');
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]).filter(Boolean);
const windowOf = (e: X.Exploration, language: 'he' | 'en', canMoveOn: boolean) => {
  const turns = e.explored.m1.turns!;
  return renderToStaticMarkup(
    React.createElement(ConversationThread, {
      title: 'רגע', excerpt: null, turns, address: 'feminine', language, pending: false, draft: '', onDraft: () => {}, onSend: () => {}, onReject: () => {}, onSteer: () => {}, onMoveOn: () => {}, onFinish: () => {}, canFinish: true, canMoveOn,
      questionNumber: Math.min(X.MAX_QUESTIONS_PER_MOMENT, asked(e)),
      closed: X.momentClosed(e, 'm1') || (asked(e) >= X.MAX_QUESTIONS_PER_MOMENT && turns[turns.length - 1]?.role === 'dreamer'),
      titleId: 't',
    }),
  );
};

test('Hebrew and English: the counter is the real count, and after the closing line only the approved ways out', () => {
  let e = open('מה בלט לך? ומה עוד?');
  assert.equal(asked(e), 2, 'an older turn that showed two questions counts two');
  assert.match(windowOf(e, 'he', true), />שאלה 2 מתוך 3</);
  e = dare(say(e, 'א'), d('Tell me more about the box.'));
  assert.match(windowOf(e, 'en', true), />Question 3 of 3</);
  const done = closing(say(e, 'ב'));
  const he = windowOf(done, 'he', true);
  assert.doesNotMatch(he, /<textarea|cv-send/, 'no box and no send button after the closing line');
  assert.deepEqual(buttons(he), ['לרגע אחר', 'לסיים ולראות מה עלה']);
  assert.deepEqual(buttons(windowOf(done, 'he', false)), ['לסיים ולראות מה עלה'], '"another moment" only when one is left');
  assert.deepEqual(buttons(windowOf(done, 'en', true)), ['Another moment', 'Finish and see what came up']);
  // after the third question and before her answer: she may still answer
  assert.match(windowOf(e, 'he', true), /להמשיך בכיוון/);
});

test('one send at a time: Enter, the button, a direction or "doesn\'t fit" press cannot send twice', () => {
  const map = read('src/map/DreamJourneyMap.tsx');
  assert.match(map, /if \(!words \|\| pending \|\| sending\.current \|\| stoppedFor\(id\)\) return;/);
  assert.match(read('src/hero/explorationEngineCore.ts'), /return once\(`\$\{e\.attemptId\}\|t\|\$\{momentId\}\|\$\{n\}\|/, 'the same turn is asked of DARE once');
  const e = open();
  const once = X.steerWithReply(e, 'm1', 'shift')!;
  assert.equal(X.steerWithReply(once, 'm1', 'shift'), null);
});
