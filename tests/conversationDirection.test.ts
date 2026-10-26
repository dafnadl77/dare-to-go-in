import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as X from '../src/hero/exploration';
import * as C from '../src/hero/conversationTurn';
import * as R from '../server/routes/dreamExploration';
import { typedAnalysis } from '../src/demo/demoRouter';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema';
import { mapFromExploration } from '../src/map/fromExploration';
import { CONVERSATIONS } from '../src/map/conversationScript';

/**
 * DIRECTION OF THE CONVERSATION (doc 117, א–ז; approved 2026-10-25). Written BEFORE the code
 * (docs/upgrade-2026-10/118-direction-tests-before.txt). No network, no AI.
 */

const store = CONVERSATIONS.find((c) => c.key === 'store')!;
const seeds = store.moments.map((m) => ({ label: m.label, excerpt: m.excerpt }));
const T0 = new Date('2026-10-25T10:00:00Z');
const opened = () => X.beginConversation(X.createExploration('d', seeds), 'm1', { role: 'dare', text: 'איך הוא נראה לך?', move: 'offer', offer: 'אולי המוכר הוא העיקר?', anchors: ['המוכר'] } as X.ConversationTurn, T0);

// ------------------------------------------------------------------------------------------------ א. the instructions

test('א. the guiding principle and "do not dig" are in the instructions, as a target and not a limit', () => {
  const p = C.buildTurnSystemPrompt('he', 'feminine');
  assert.match(p, /two kinds of value/i);
  assert.match(p, /not a questionnaire/i);
  assert.match(p, /two to four exchanges/i);
  assert.match(p, /a target, not a limit/i);
  assert.match(p, /going deeper adds one new thing/i);
  assert.match(p, /never restate/i);
  assert.match(p, /when she says it connects/i);
});

// ------------------------------------------------------------------------------------------------ ב. the signals

const sig = (turns: X.ConversationTurn[]) => C.turnSignals({ turns, momentText: 'x' });
const d = (text: string, extra: Partial<X.ConversationTurn> = {}): X.ConversationTurn => ({ role: 'dare', text, ...extra });
const h = (text: string, extra: Partial<X.ConversationTurn> = {}): X.ConversationTurn => ({ role: 'dreamer', text, ...extra });

test('ב. "it connects with me" is heard, for the next turn only; ordinary answers are not', () => {
  for (const t of ['זה מתחבר לי', 'וואו, זה מדויק', 'בדיוק!', 'זה נכון לגביי', 'זה מזכיר לי את אבא שלי', 'זה נוגע בי', 'that resonates', 'yes, exactly']) assert.equal(sig([d('x'), h(t)]).connected, true, t);
  for (const t of ['העץ היה קטן', 'לא יודעת', 'זה לא מדויק', 'זה לא מתחבר לי בכלל']) assert.equal(sig([d('x'), h(t)]).connected, false, t);
});

test('ב. the direction buttons are signals; after several exchanges the model is told, and nothing is blocked', () => {
  assert.equal(sig([d('x'), h('להמשיך בכיוון', { steer: 'deepen' })]).steer, 'deepen');
  assert.equal(sig([d('x'), h('לשנות כיוון', { steer: 'shift' })]).steer, 'shift');
  const many: X.ConversationTurn[] = [];
  for (let i = 0; i < 4; i += 1) many.push(d(`d${i}`), h(`תשובה ${i} ארוכה מספיק`));
  assert.equal(sig(many).severalExchanges, true);
  assert.equal(sig(many.slice(0, 4)).severalExchanges, false);
  // "go deeper" resets the count: she wants to stay
  assert.equal(sig([...many, d('x'), h('להמשיך בכיוון', { steer: 'deepen' })]).severalExchanges, false);
  const input = C.buildTurnInput({ sourceText: 'x', moments: [], moment: { label: 'm', text: 'x' }, earlier: [], turns: [], signals: { ...sig(many), connected: true, steer: 'shift' }, request: 'reply' });
  assert.match(input, /SEVERAL EXCHANGES/);
  assert.match(input, /SHE SAID IT CONNECTS/);
  assert.match(input, /ANOTHER DIRECTION/);
});

// ------------------------------------------------------------------------------------------------ ג–ה. the buttons

test('ג. a direction button adds her bubble once, only after DARE spoke, and never touches the 3 rejection replies', () => {
  const r = X.steerWithReply(opened(), 'm1', 'deepen');
  assert.notEqual(r, null);
  const turns = r!.explored.m1.turns!;
  assert.deepEqual([turns.at(-1)!.role, turns.at(-1)!.text, turns.at(-1)!.steer], ['dreamer', 'להמשיך בכיוון', 'deepen']);
  assert.equal(X.needsTurnCall(r!, 'm1'), true);
  assert.equal(X.steerWithReply(r!, 'm1', 'shift'), null, 'a second click adds nothing');
  assert.equal(X.rejectionRepliesUsed(X.addDareTurn(r!, 'm1', d('בסדר.'))), 0);
  assert.equal(X.steerWithReply(X.createExploration('d', seeds), 'm1', 'deepen'), null, 'nothing to steer');
});

const analysis = () => typedAnalysis(store.dreamText, true) as unknown as DreamAnalysis;
let calls = 0;
const client = (raw: Record<string, unknown>) => ({ responses: { create: async () => ((calls += 1), { model: 'stub', output_text: JSON.stringify({ reply: 'בסדר.', offer: '', anchors: [], facts: [], move: 'reflect', mine: [], ideas: [], ...raw }), usage: { input_tokens: 0, output_tokens: 0 } }) } }) as never;
const deps = (reserved: number[], raw: Record<string, unknown> = {}): R.ExplorationDeps => ({
  ...R.realExplorationDeps,
  resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: 'u' } }) as never,
  openai: () => client(raw),
  rateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }) as never,
  reserveMoment: async (_a, _i, extra) => (reserved.push(extra ?? 0), 'reserved'),
  refundMoment: async () => {},
  reserveWhole: async () => 'reserved',
  refundWhole: async () => {},
  address: async () => 'feminine',
  moderate: async () => ({ status: 'ok' as const, hit: false }),
});
const ask = (mode: 'conversation-turn' | 'conversation-summary', e: X.Exploration, dd: R.ExplorationDeps) => R.handleExploration(mode, { language: 'he', attemptId: e.attemptId, dreamAnalysis: analysis(), exploration: e, momentId: 'm1' }, {}, dd);

test('ד–ה. a button press is one regular turn (out of the 16, never the 3 extra); "change direction" does not bring the last angle back', async () => {
  calls = 0;
  const reserved: number[] = [];
  const deepen = await ask('conversation-turn', X.steerWithReply(opened(), 'm1', 'deepen')!, deps(reserved));
  assert.ok((deepen.body as { turn?: unknown }).turn);
  assert.deepEqual(reserved, [0], 'the regular allowance');
  assert.equal(calls, 1);
  const shift = await ask('conversation-turn', X.steerWithReply(opened(), 'm1', 'shift')!, deps(reserved, { offer: 'אולי המוכר עצמו הוא מה שחשוב?', anchors: [{ quote: 'המוכר', from: 'dream' }], move: 'offer' }));
  assert.equal((shift.body as { turn: X.ConversationTurn }).turn.offer, undefined, 'the same angle, in other words, is not shown');
  const other = await ask('conversation-turn', X.steerWithReply(opened(), 'm1', 'shift')!, deps(reserved, { offer: 'אולי הקופסה מספרת משהו משלה?', anchors: [{ quote: 'קופסה מלאה ברגים', from: 'dream' }], move: 'offer' }));
  assert.ok((other.body as { turn: X.ConversationTurn }).turn.offer, 'a new angle is shown');
});

test('ד. the window shows the two buttons above the writing box, which stays; "זה לא מתאים לי" is unchanged', () => {
  const thread = readFileSync('src/map/ConversationThread.tsx', 'utf8') + readFileSync('src/map/threadWords.ts', 'utf8');
  assert.match(thread, /להמשיך בכיוון/);
  assert.match(thread, /לשנות כיוון/);
  assert.match(thread, /<textarea/);
  assert.match(thread, /notForMe: 'זה לא מתאים לי'/);
  assert.match(readFileSync('src/map/ConversationDemo.tsx', 'utf8'), /X\.steerWithReply\(/);
});

// ------------------------------------------------------------------------------------------------ ו–ז. the summary

test('ו–ז. "what I took from the dream": only her own words as hers; only offers she did not reject as ideas; nothing invented', () => {
  const ctx = { sourceText: store.dreamText, labels: [], herWords: ['זה מזכיר לי את הבית של סבתא', 'העץ היה קטן'], language: 'he' as const, offers: ['אולי הקופסה מספרת משהו משלה?'] };
  const raw = { reply: 'עלה כאן משהו על הבית.', offer: '', anchors: [], facts: [], move: 'summarize' as const };
  const t = C.checkTurn({ ...raw, mine: ['זה מזכיר לי את הבית של סבתא', 'הבנתי שאני צריכה מנוחה'], ideas: ['אולי הקופסה מספרת משהו משלה?', 'אולי המוכר הוא העיקר?'] }, ctx);
  assert.deepEqual(t.mine, ['זה מזכיר לי את הבית של סבתא'], 'an "insight" she never said is not hers');
  assert.deepEqual(t.ideas, ['אולי הקופסה מספרת משהו משלה?'], 'a rejected or unknown idea is not listed');
  const none = C.checkTurn({ ...raw, mine: [], ideas: [] }, ctx);
  assert.deepEqual([none.mine, none.ideas], [[], []]);
  assert.match(C.buildTurnSystemPrompt('he', 'neutral'), /never invent an insight/i);
});

test('ז. the summary carries it to the panel, kept with the journey; the panel shows it apart, only when there is something', async () => {
  let e = X.addDreamerTurn(X.rejectOffer(opened(), 'm1'), 'm1', 'זה מזכיר לי את הבית של סבתא');
  e = X.addDareTurn(e, 'm1', d('ספרי עוד.', { offer: 'אולי הקופסה מספרת משהו משלה?', anchors: ['קופסה מלאה ברגים'] }));
  e = X.addDreamerTurn(e, 'm1', 'כן, אולי');
  e = X.completeConversation(e, 'm1');
  const res = await ask('conversation-summary', e, deps([], { reply: 'עלה כאן משהו על הבית.', move: 'summarize', mine: ['זה מזכיר לי את הבית של סבתא'], ideas: ['אולי הקופסה מספרת משהו משלה?', 'אולי המוכר הוא העיקר?'] }));
  const w = (res.body as { wholeView: { takeaways?: { mine: string[]; ideas: string[] } } }).wholeView;
  assert.deepEqual(w.takeaways, { mine: ['זה מזכיר לי את הבית של סבתא'], ideas: ['אולי הקופסה מספרת משהו משלה?'] }, 'the rejected first offer is not an idea');
  const received = X.receiveWholeView(e, w as never, X.basedOnKey(e), T0);
  const back = X.parseExploration(JSON.parse(JSON.stringify(received)))!;
  assert.deepEqual(back.wholeView?.takeaways, w.takeaways, 'kept with the journey');
  const m = mapFromExploration(back, { key: 'store', language: 'he', date: '2026-10-25', sourceText: store.dreamText, imageSrc: '' });
  assert.deepEqual(m.wholeView?.takeaways, w.takeaways);
  const strings = readFileSync('src/map/mapStrings.ts', 'utf8');
  for (const s of ['מה לקחתי מהחלום', 'מה שהתחבר לי', 'רעיונות ש־DARE הציעה']) assert.ok(strings.includes(s), s);
  const map = readFileSync('src/map/DreamMap.tsx', 'utf8');
  for (const s of ['s.takeaways', 's.takeawaysMine', 's.takeawaysIdeas']) assert.ok(map.includes(s), s);
});
