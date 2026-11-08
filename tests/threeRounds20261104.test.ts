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
 * THREE ROUNDS A MOMENT (her rule, 2026-11-04, after the live site still showed "שאלה 2 מתוך 3" in a conversation that went on). The
 * existing limit counted QUESTIONS, so a turn of DARE without one ("נכון" answered with text alone) moved neither the counter nor the
 * limit, and the conversation drifted with no clear next step; and after her third answer the model was still called for a closing
 * line, a fourth turn. Now the same count counts ROUNDS: every turn of DARE is one, each must end with one question, short answers
 * ("נכון", "כן", "לא") are real answers, and her third answer ends the moment with no call at all. No network, no AI.
 */

const read = (p: string) => readFileSync(p, 'utf8');
const store = CONVERSATIONS.find((c) => c.key === 'store')!;
const seeds = store.moments.map((m) => ({ label: m.label, excerpt: m.excerpt }));
const T0 = new Date('2026-11-04T10:00:00Z');
const d = (text: string, offer?: string): X.ConversationTurn => ({ role: 'dare', text, move: 'ask', ...(offer ? { offer, anchors: ['המוכר'] } : {}) });
const rounds = (e: X.Exploration, id = 'm1') => X.questionsAsked(e, id);
const say = (e: X.Exploration, words: string, id = 'm1') => X.addDreamerTurn(e, id, words);
const dare = (e: X.Exploration, turn: X.ConversationTurn, id = 'm1') => X.addDareTurn(e, id, turn);
const requestOf = (e: X.Exploration, id = 'm1') => (R.planCall('conversation-turn', e, id) as { request?: string } | null)?.request ?? null;
/** Her example, in its structure: three turns of DARE, three answers of hers (the last two short). */
const example = () => {
  let e = X.beginConversation(X.createExploration('ex', seeds), 'm1', d('כשאת חושבת על המוכר, מה הכי הפתיע אותך?'), T0);
  e = dare(say(e, 'שהוא נעלם'), d('ההיעלמות נשמעת מרכזית כאן. מה בחלום גרם לך להרגיש שהוא נעלם?'));
  e = dare(say(e, 'לא יודעת, פשוט הרגשתי'), d('לפעמים התחושה עצמה היא מה שנשאר. היא מזכירה לך תחושה שאת מכירה, אם בכלל?'));
  return say(e, 'כן');
};

// ------------------------------------------------------------------------------------------------ the root cause

test('cause: a turn of DARE with no question now counts as a round — the counter can no longer stay behind', () => {
  let e = X.beginConversation(X.createExploration('c', seeds), 'm1', d('מה בלט לך אצל המוכר?'), T0);
  e = dare(say(e, 'נכון'), d('הבנתי, זה היה שקט.'));
  assert.equal(X.questionsIn(d('הבנתי, זה היה שקט.')), 0, 'no question in it');
  assert.equal(rounds(e), 2, 'yet it is the second round (the old count said 1, and the moment never ended)');
});

test('cause: after her third answer the model is no longer called for a closing line (that was a fourth turn)', () => {
  const e = example();
  assert.equal(rounds(e), 3);
  assert.equal(requestOf(e), null, 'no fourth turn and no closing request');
  assert.equal(X.needsTurnCall(e, 'm1'), false);
  assert.equal(X.momentEnded(e, 'm1'), true);
});

// ------------------------------------------------------------------------------------------------ the route

const analysis = () => typedAnalysis(store.dreamText, true) as unknown as DreamAnalysis;
let calls = 0;
let reserved = 0;
let seen: string[] = [];
const deps = (replies: Record<string, unknown>[]): R.ExplorationDeps => ({
  ...R.realExplorationDeps,
  resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: 'u' } }) as never,
  openai: () =>
    ({
      responses: {
        create: async (req: { instructions: string }) => {
          const raw = replies[Math.min(calls, replies.length - 1)];
          calls += 1;
          seen.push(req.instructions);
          return { model: 'stub', output_text: JSON.stringify({ reply: '', offer: '', anchors: [], facts: [], move: 'ask', mine: [], ideas: [], open: [], ...raw }), usage: { input_tokens: 0, output_tokens: 0 } };
        },
      },
    }) as never,
  rateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }) as never,
  reserveMoment: async () => ((reserved += 1), 'reserved'),
  refundMoment: async () => {},
  reserveWhole: async () => 'reserved',
  refundWhole: async () => {},
  address: async () => 'feminine',
  moderate: async () => ({ status: 'ok' as const, hit: false }),
});
const ask = (e: X.Exploration, replies: Record<string, unknown>[], language: 'he' | 'en' = 'he') => {
  calls = 0;
  reserved = 0;
  seen = [];
  return R.handleExploration('conversation-turn', { language, attemptId: e.attemptId, dreamAnalysis: analysis(), exploration: e, momentId: 'm1' }, {}, deps(replies));
};

test('her fourth answer (a stale page, a second tab, a forged request): the route asks the model nothing and takes no slot', async () => {
  for (const e of [example(), say(example(), 'ועוד משהו')]) {
    const res = await ask(e, [{ reply: 'מה עוד?' }]);
    assert.equal(res.status, 409);
    assert.equal(calls, 0);
    assert.equal(reserved, 0, 'no credit, no slot: the business side is untouched');
  }
});

test('every turn ends with one question: a turn with none gets the one retry the turn already has, then the plain question', async () => {
  let e = X.beginConversation(X.createExploration('q', seeds), 'm1', d('מה בלט לך אצל המוכר?'), T0);
  e = say(e, 'נכון');
  const fine = await ask(e, [{ reply: 'נכון, הוא היה שקט. מה הוא עשה אז?' }]);
  assert.equal(calls, 1, 'a turn that asks: one call, as always');
  assert.equal(X.questionsIn((fine.body as { turn: X.ConversationTurn }).turn), 1);
  const retried = await ask(e, [{ reply: 'נכון, הוא היה שקט.' }, { reply: 'הוא היה שקט. מה הוא עשה אז?' }]);
  assert.equal(calls, 2, 'one retry, never more');
  assert.ok(seen[1].includes(R.NO_QUESTION_NOTE.trim()), 'the retry is told why');
  assert.equal((retried.body as { turn: X.ConversationTurn }).turn.text, 'הוא היה שקט. מה הוא עשה אז?');
  const stubborn = await ask(e, [{ reply: 'נכון, הוא היה שקט.' }]);
  assert.equal(calls, 2);
  const t = (stubborn.body as { turn: X.ConversationTurn }).turn;
  assert.equal(t.text, `נכון, הוא היה שקט. ${C.fallbackReply('he')}`, 'still none: the plain question ends it, so she knows what to answer');
  const en = await ask(e, [{ reply: 'Right, he was quiet.' }], 'en');
  assert.match((en.body as { turn: X.ConversationTurn }).turn.text, /What else comes to mind about this moment\?$/);
});

test('the turns of DARE in her example: 1, 2, 3 — each a round of the same counter the route keeps', async () => {
  let e = X.beginConversation(X.createExploration('ex', seeds), 'm1', d('כשאת חושבת על המוכר, מה הכי הפתיע אותך?'), T0);
  assert.equal(rounds(e), 1);
  assert.equal(requestOf(say(e, 'שהוא נעלם')), 'reply');
  e = dare(say(e, 'שהוא נעלם'), d('מה בחלום גרם לך להרגיש שהוא נעלם?'));
  assert.equal(rounds(e), 2);
  assert.equal(requestOf(say(e, 'לא יודעת, פשוט הרגשתי')), 'reply');
  e = dare(say(e, 'לא יודעת, פשוט הרגשתי'), d('היא מזכירה לך תחושה שאת מכירה, אם בכלל?'));
  assert.equal(rounds(e), 3);
  assert.equal(X.needsTurnCall(e, 'm1'), false, 'DARE spoke last: her third answer is still to come');
  assert.equal(X.momentEnded(e, 'm1'), false);
  assert.equal(requestOf(say(e, 'כן')), null, 'her third answer ends the moment');
});

// ------------------------------------------------------------------------------------------------ short answers are answers

test('"נכון", "מדויק", "כן" and "לא" are real answers: told to the model as agreement or disagreement, never as hesitation', () => {
  for (const yes of ['נכון', 'נכון.', 'מדויק', 'בדיוק!', 'כן', 'Yes', 'exactly']) assert.equal(C.briefAnswer(yes), 'agree', yes);
  for (const no of ['לא', 'לא.', 'ממש לא', 'No']) assert.equal(C.briefAnswer(no), 'disagree', no);
  for (const other of ['לא יודעת', 'נכון, אבל הוא חייך', 'השאלה']) assert.equal(C.briefAnswer(other), null, other);
  const sig = (her: string) => C.turnSignals({ turns: [d('מה בלט?'), { role: 'dreamer', text: her }], momentText: '' });
  assert.equal(sig('נכון').shortOrUnsure, false, 'not "short or unsure" any more');
  assert.equal(sig('נכון').brief, 'agree');
  assert.equal(sig('לא יודעת').shortOrUnsure, true, '"I don\'t know" is still met gently');
  const input = (her: string) => C.buildTurnInput({ sourceText: store.dreamText, moments: [], moment: { label: 'מוכר', text: 'x' }, earlier: [], turns: [d('מה בלט?'), { role: 'dreamer', text: her }], signals: sig(her), request: 'reply', asked: 1 });
  assert.match(input('מדויק'), /SHE AGREED IN A WORD: A REAL ANSWER\. BUILD ON WHAT SHE AGREED WITH AND ASK THE NEXT STEP/);
  assert.match(input('לא'), /SHE SAID NO IN A WORD: A REAL ANSWER\. ACCEPT IT AND ASK ABOUT SOMETHING ELSE IN THE MOMENT/);
  assert.doesNotMatch(input('מדויק'), /IS UNSURE|SHORT BUT REAL/);
});

test('the instructions: three rounds, every turn ends with one question, a short answer is a real answer, the third turn is the last', () => {
  for (const lang of ['he', 'en'] as const) {
    const p = C.buildTurnSystemPrompt(lang, 'feminine');
    assert.match(p, /At most three turns of yours in a moment, and EVERY turn ends with exactly ONE clear question or concrete invitation to answer, as its last sentence/);
    assert.match(p, /After her third answer the moment ends: you are not asked again in it/);
    assert.match(p, /A short answer is a real answer\. "נכון", "מדויק", "בדיוק", "כן" agree/);
    assert.doesNotMatch(p, /Not every turn needs a question|with no question at all|two to four exchanges/);
  }
  const at = (asked: number) => C.buildTurnInput({ sourceText: 'x', moments: [], moment: { label: 'm', text: 'x' }, earlier: [], turns: [d('א?'), { role: 'dreamer', text: 'ב' }], signals: C.turnSignals({ turns: [], momentText: '' }), request: 'reply', asked });
  assert.match(at(1), /THIS IS YOUR TURN 2 OF 3; END IT WITH ONE QUESTION/);
  assert.match(at(2), /THIS IS YOUR TURN 3 OF 3: THE LAST ONE\. Her answer to it ends the moment, so ask the question that matters most; END IT WITH ONE QUESTION/);
});

// ------------------------------------------------------------------------------------------------ the buttons

test('"change direction" after the first and the second round: her press is her answer, DARE\'s other direction the next round; none on the last', () => {
  const w = threadWords('feminine');
  let e = X.beginConversation(X.createExploration('s', seeds), 'm1', d('מה בלט לך?'), T0);
  e = dare(X.steerWithReply(e, 'm1', 'shift', w.shift)!, d('ומה עם הקופסה?'));
  assert.equal(rounds(e), 2);
  e = dare(X.steerWithReply(e, 'm1', 'shift', w.shift)!, d('ומה עשית שם?'));
  assert.equal(rounds(e), 3, 'counted, never reset, and no extra uncounted turn');
  assert.equal(requestOf(X.steerWithReply(e, 'm1', 'shift', w.shift)!), null, 'a press on the last round asks nothing');
  assert.match(read('src/map/DreamJourneyMap.tsx'), /onSteer=\{X\.questionsAsked\(e, moment\.id\) >= X\.MAX_QUESTIONS_PER_MOMENT \? undefined : \(\) => \{/, 'on the last round the direction buttons give way to her answer');
});

test('"this doesn\'t fit me" and "keep going this way": counted like any answer, never a way round the three rounds', () => {
  let e = X.beginConversation(X.createExploration('r', seeds), 'm1', d('מעניין.', 'אולי המוכר הוא העיקר?'), T0);
  const r = X.rejectWithReply(e, 'm1', threadWords('feminine').notForMe);
  assert.equal(requestOf(r.e), 'reply');
  e = dare(r.e, d('הבנתי. מה בלט לך שם?'));
  e = dare(say(e, 'הקופסה'), d('מה היה בקופסה?'));
  assert.equal(rounds(e), 3);
  assert.equal(requestOf(X.rejectWithReply(e, 'm1').e), null);
  assert.equal(requestOf(X.steerWithReply(e, 'm1', 'deepen')!), null, 'an older journey that recorded "keep going" as a turn: the same');
  assert.match(read('src/map/ConversationThread.tsx'), /onClick=\{\(\) => setWriting\(true\)\}>\s*\{w\.deepen\}/, '"keep going" only opens the box');
});

// ------------------------------------------------------------------------------------------------ the page

test('the page: her third answer is kept and nothing is asked of DARE; one send at a time; a reopened or older moment stays ended', () => {
  const map = read('src/map/DreamJourneyMap.tsx');
  assert.match(map, /if \(!X\.needsTurnCall\(next, id\)\) \{\s*sending\.current = false;\s*return;\s*\}/, 'her third answer: no call');
  assert.match(map, /if \(!words \|\| pending \|\| sending\.current \|\| stoppedFor\(id\)\) return;/, 'one send at a time');
  assert.match(map, /closed=\{X\.momentEnded\(e, moment\.id\) && !pending\}/);
  assert.match(read('src/hero/explorationEngineCore.ts'), /if \(!opening && !needsTurnCall\(e, momentId\)\) \{/, 'the engine refuses too');
  // an older journey that ended with the model's closing line still reads as ended
  const older = X.addDareTurn(example(), 'm1', { role: 'dare', text: 'תודה ששיתפת.', move: 'summarize', closing: true });
  assert.equal(X.momentEnded(older, 'm1'), true);
  assert.equal(rounds(older), 3, 'the closing line is not a round');
  // the count travels with the journey: leaving and coming back keeps it
  let left = X.beginConversation(X.createExploration('l', seeds), 'm2', d('ומה כאן?'), T0);
  left = X.abandonMoment(left, 'm2');
  assert.equal(rounds(left, 'm2'), 1);
});

register('data:text/javascript,' + encodeURIComponent(`export async function load(url, context, next) { if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true }; return next(url, context); }`));
const React = await import('react');
(globalThis as unknown as { React: typeof React }).React = React;
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: ConversationThread } = await import('../src/map/ConversationThread');
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]).filter(Boolean);
/** The window as the page draws it (the same props DreamJourneyMap passes). */
const windowOf = (e: X.Exploration, language: 'he' | 'en', canMoveOn = true) => {
  const lastRound = rounds(e) >= X.MAX_QUESTIONS_PER_MOMENT;
  return renderToStaticMarkup(
    React.createElement(ConversationThread, {
      title: 'רגע', excerpt: null, turns: e.explored.m1.turns!, address: 'feminine', language, pending: false, draft: 'x', onDraft: () => {}, onSend: () => {}, onReject: () => {}, onSteer: lastRound ? undefined : () => {}, onMoveOn: () => {}, onFinish: () => {}, canFinish: true, canMoveOn,
      questionNumber: Math.min(X.MAX_QUESTIONS_PER_MOMENT, rounds(e)),
      closed: X.momentEnded(e, 'm1'),
      titleId: 't',
    }),
  );
};

test('Hebrew and English: 1 → 2 → 3, the last answer in the box, then only the ways out and no box', () => {
  const ended = example();
  const before = X.addDareTurn(X.addDreamerTurn(X.beginConversation(X.createExploration('w', seeds), 'm1', d('מה בלט?'), T0), 'm1', 'נכון'), 'm1', d('ומה עוד?'));
  assert.match(windowOf(before, 'he'), />שאלה 2 מתוך 3</);
  assert.deepEqual(buttons(windowOf(before, 'he')).slice(0, 2), ['להמשיך בכיוון', 'לשנות כיוון'], 'directions while rounds are left');
  const lastRound = X.addDareTurn(X.addDreamerTurn(before, 'm1', 'כן'), 'm1', d('ומה עשית אז?'));
  const last = windowOf(lastRound, 'he');
  assert.match(last, />שאלה 3 מתוך 3</);
  assert.match(last, /<textarea/, 'her third answer goes straight in the box');
  assert.doesNotMatch(last, />לשנות כיוון<|>להמשיך בכיוון</, 'no direction on the last round');
  for (const [lang, ways, counter] of [['he', ['לרגע אחר', 'לסיים ולראות מה עלה'], 'שאלה 3 מתוך 3'], ['en', ['Another moment', 'Finish and see what came up'], 'Question 3 of 3']] as const) {
    const html = windowOf(ended, lang);
    assert.ok(html.includes(`>${counter}<`), lang);
    assert.doesNotMatch(html, /<textarea|cv-send/, `${lang}: no box and no send button after her third answer`);
    assert.deepEqual(buttons(html), [...ways], lang);
  }
  assert.deepEqual(buttons(windowOf(ended, 'he', false)), ['לסיים ולראות מה עלה'], '"another moment" only when one is left');
  assert.match(windowOf(ended, 'he'), /החקירה של הרגע הזה הסתיימה\. אפשר לעבור לרגע אחר או לראות מה עלה\./);
});

// ------------------------------------------------------------------------------------------------ the check before deploying (2026-11-04)

test('the retry can never loop: a turn that asks nothing gets one retry; with every check failing, the turn stops at three attempts', async () => {
  let e = X.beginConversation(X.createExploration('loop', seeds), 'm1', d('מה בלט לך?'), T0);
  e = say(e, 'נכון');
  await ask(e, [{ reply: 'הוא היה שקט.' }]);
  assert.equal(calls, 2, 'the missing question: one retry, never more');
  const worst = await ask(e, [{ reply: 'אתה צודק, זה היה שקט.' }]);
  assert.ok(calls <= 3, `at most three attempts in all (the older address check included): ${calls}`);
  assert.notEqual(worst.status, 200, 'and then it stops, with no answer shown');
  assert.match(read('server/languageGuard.ts'), /const MAX_ATTEMPTS = 3;/);
  assert.match(read('server/routes/dreamExploration.ts'), /maxQualityRetries: 1,\s*rejectExhaustedQuality: true,/);
});

test('the whole view keeps its own plain line: never the conversation\'s question about "this moment"', async () => {
  let e = X.beginConversation(X.createExploration('wv', seeds), 'm1', d('מה בלט לך?'), T0);
  e = X.completeConversation(say(e, 'נכון'), 'm1', T0);
  calls = 0;
  const res = await R.handleExploration('conversation-summary', { language: 'he', attemptId: e.attemptId, dreamAnalysis: analysis(), exploration: e }, {}, deps([{ reply: 'אמרת «משהו שלא נאמר מעולם».', move: 'summarize' }]));
  const overview = (res.body as { wholeView: { overview: string } }).wholeView.overview;
  // since 2026-11-07 what she said, in her own words, instead of a general line; never the conversation's question
  assert.equal(overview, 'מה שעלה בשיחה, במילים שלך:\n\n«המוכר לתוך העץ»: «נכון»');
  assert.doesNotMatch(overview, /הרגע הזה\?/);
  assert.equal(C.fallbackSummaryLine('en'), 'We can go on from here, or choose another moment.');
});

// ------------------------------------------------------------------------------------------------ when the one fix fails (her rule, 2026-11-08)

test('a turn whose fresh answer still says what she did not tell: never shown as it is, never cut; her words and one question instead', async () => {
  let e = X.beginConversation(X.createExploration('attr', seeds), 'm1', d('ומה עשית כשלא מצאת?'), T0);
  e = say(e, 'המשכתי לחפש');
  const claim = 'לא ויתרת ישר, פשוט המשכת לחפש. מה משך אותך להמשיך?';
  const failed = await ask(e, [{ reply: claim, offer: 'אולי החיפוש עצמו היה העיקר.' }]);
  assert.equal(calls, 2, 'one fresh answer, never a third call');
  assert.match(seen[1], /CORRECTION: part of your previous attempt did not rest on the dreamer's own words/);
  assert.equal(failed.status, 200);
  const t = (failed.body as { turn: X.ConversationTurn }).turn;
  assert.equal(t.text, 'אמרת: «המשכתי לחפש». מה משך אותך להמשיך?', 'her words, and the answer\'s own single question');
  assert.equal(t.offer, undefined, 'the failed answer\'s offer is not shown');
  assert.doesNotMatch(t.text, /ויתרת/, 'the claim is not shown as a fact');
  assert.equal(X.questionsIn(t), 1, 'exactly one question');
  const noQuestion = await ask(e, [{ reply: 'לא ויתרת ישר, פשוט המשכת לחפש.' }]);
  assert.ok(calls <= 2, 'still no third call for wording');
  assert.equal((noQuestion.body as { turn: X.ConversationTurn }).turn.text, `אמרת: «המשכתי לחפש». ${'מה עוד זכור לך מהרגע «המוכר לתוך העץ»?'}`, 'no question of its own: one about the moment, not a general one');
  const better = await ask(e, [{ reply: claim }, { reply: 'המשכת לחפש. מה משך אותך להמשיך?' }]);
  assert.equal(calls, 2);
  assert.equal((better.body as { turn: X.ConversationTurn }).turn.text, 'המשכת לחפש. מה משך אותך להמשיך?', 'a good fresh answer is shown as it is');
  const idea = await ask(e, [{ reply: 'אולי לא ויתרת כי החיפוש עצמו היה חשוב. מה משך אותך להמשיך?' }]);
  assert.equal(calls, 1, 'a possibility needs no fresh answer: curiosity and ideas are untouched');
  assert.match((idea.body as { turn: X.ConversationTurn }).turn.text, /^אולי לא ויתרת/);
  const en = await ask(e, [{ reply: 'You did not give up. What kept you looking?' }], 'en');
  assert.equal((en.body as { turn: X.ConversationTurn }).turn.text, 'You said: “המשכתי לחפש”. What kept you looking?');
});

test('the whole view: what rests on her words is shown whole; a view that still does not is replaced by her own words, moment by moment', async () => {
  let e = X.beginConversation(X.createExploration('wv2', seeds), 'm1', d('ומה עשית כשלא מצאת?'), T0);
  e = X.completeConversation(say(e, 'הלכתי ברגל, לא יודעת לאן'), 'm1', T0);
  const summary = (reply: string) => {
    calls = 0;
    return R.handleExploration('conversation-summary', { language: 'he', attemptId: e.attemptId, dreamAnalysis: analysis(), exploration: e }, {}, deps([{ reply, move: 'summarize' }]));
  };
  const view = 'המשכת ללכת ברגל, בלי לדעת לאן.\n\nאפשר להמשיך מכאן.';
  const good = await summary(view);
  assert.equal(calls, 1, 'nothing to correct');
  assert.equal((good.body as { wholeView: { overview: string } }).wholeView.overview, view, 'her "לא יודעת" supports "בלי לדעת": shown whole');
  const bad = await summary('הלכת ברגל ולא ויתרת, כי פחדת להישאר.\n\nאפשר להמשיך מכאן.');
  assert.equal(calls, 2);
  assert.equal((bad.body as { wholeView: { overview: string } }).wholeView.overview, 'מה שעלה בשיחה, במילים שלך:\n\n«המוכר לתוך העץ»: «הלכתי ברגל, לא יודעת לאן»');
});

test('when the one fix fails: the safety check still decides first, and nothing of hers is logged', async () => {
  const route = read('server/routes/dreamExploration.ts');
  assert.match(route, /const shownTurn: ConversationTurn = odd \|\| unsafe\s*\? \{ role: 'dare', text: plainLine, move: 'reflect' \}\s*: unverified/, 'unsafe wins over the verified turn');
  assert.match(route, /if \(unsafe && p\.kind === 'summary'\) return \{ status: 'unsafe' as const \};/);
  const log = /console\.warn\(`\[\$\{p\.kind[^`]*`\)/.exec(route)?.[0] ?? '';
  assert.match(log, /reason=not-her-words-after-retry/);
  assert.doesNotMatch(log, /herLast|checked|text|sourceText/, 'only the reason');
});

test('a set-aside turn whose own question takes for granted what she never told: a neutral question about the moment instead (2026-11-08)', async () => {
  let e = X.beginConversation(X.createExploration('attr2', seeds), 'm1', d('ומה עשית כשלא מצאת?'), T0);
  e = say(e, 'המשכתי לחפש');
  const res = await ask(e, [{ reply: 'לא ויתרת ישר. מה הרגשת כשאבא שלך כעס?' }]);
  assert.equal(calls, 2, 'one fresh answer, no third call');
  const t = (res.body as { turn: X.ConversationTurn }).turn;
  assert.equal(t.text, 'אמרת: «המשכתי לחפש». מה עוד זכור לך מהרגע «המוכר לתוך העץ»?');
  assert.doesNotMatch(t.text, /אבא|ויתרת/);
  assert.equal(X.questionsIn(t), 1);
});
