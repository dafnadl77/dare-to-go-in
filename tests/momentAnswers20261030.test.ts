import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as X from '../src/hero/exploration';
import * as C from '../src/hero/conversationTurn';
import * as R from '../server/routes/dreamExploration';
import { buildReflectionInput, generateDreamReflection, parseMomentAnswers } from '../server/routes/dreamReflection';
import { buildDreamReflectionSystemPrompt } from '../src/hero/dreamReflectionSchema';
import { momentAnswersFromJourney, reflectionContextFromJourney } from '../src/map/journeyRecord';
import { threadWords } from '../src/map/threadWords';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema';

/**
 * THE CONTENT ROUND AFTER THE LIVE TEST (2026-10-30). No network and no AI: the library-and-snow dream that was run once against the
 * real model is replayed from what the model really wrote (tests/fixtures/library-snow-live-2026-10-30.json). The live reflection said
 * the book was "יפה ושקט", which she had said about the snow: her answers reached it as one list, without their moments.
 *   1. her answers reach the reflection moment by moment (moment, its words in the dream, what DARE said, her answer), in order;
 *      an older record without that tie is never guessed;
 *   2. the dream, her words and DARE's possibilities are kept apart in every instruction;
 *   3. the conversation: no question asked again in another moment, no "מה זה מעורר בך?", her correction, "change direction", "I don't know";
 *   4. the whole view, the summary and the reflection: no link to her life she did not make.
 * What a real model writes with all this is NOT tested here.
 */

const read = (p: string) => readFileSync(p, 'utf8');
type Step = { step: string; her?: string; dare?: X.ConversationTurn; wholeView?: { overview: string } };
const fx = JSON.parse(read('tests/fixtures/library-snow-live-2026-10-30.json')) as { dream: string; analysis: DreamAnalysis; moments: { id: string; label: string; excerpt: string }[]; steps: Step[] };
const T0 = new Date('2026-10-30T12:00:00Z');
const SNOW_WORDS = 'לא יודעת, זה פשוט היה יפה ושקט';

/** The live journey, replayed turn by turn through the journey's own functions; `until` stops before that step. */
function replay(until?: string): X.Exploration {
  let e = X.createExploration('library', fx.moments.map((m) => ({ label: m.label, excerpt: m.excerpt })));
  for (const s of fx.steps) {
    if (s.step === until) break;
    const id = s.step.split(' ')[1];
    if (s.step.startsWith('open')) e = X.beginConversation(e, id, s.dare!, T0);
    else if (s.step.startsWith('say')) e = X.addDareTurn(X.addDreamerTurn(e, id, s.her!), id, s.dare!);
    else if (s.step.startsWith('steer')) e = X.addDareTurn(X.steerWithReply(e, id, 'shift', threadWords('feminine').shift)!, id, s.dare!);
    else if (s.step.startsWith('leave')) e = X.completeConversation(e, id, T0);
    else if (s.step === 'whole view') {
      while (X.exploringId(e)) e = X.completeConversation(e, X.exploringId(e)!, T0);
      e = X.receiveWholeView(e, { kind: 'whole', notice: null, overview: s.wholeView!.overview, connections: [], recurring: null, contrast: null, readings: [], closingQuestion: '', invite: [] } as never, X.basedOnKey(e), T0);
    }
  }
  return e;
}
const journey = replay();
/** The input's lines of one moment: from its header to the next header. */
const blockOf = (input: string, id: string) => {
  const start = input.indexOf(`[${id}] `);
  if (start < 0) return '';
  const next = input.slice(start + 1).search(/\n\[m\d\] /);
  return next < 0 ? input.slice(start) : input.slice(start, start + 1 + next);
};
const flat = { selectedElement: 'ספר · בחוץ התחיל לרדת שלג', reflectionResponse: 'x' };

// ------------------------------------------------------------------------------------------------ 1. each answer in its own moment

test('1. the replay is the live journey: the book, then the snow, and "יפה ושקט" was said in the snow moment', () => {
  assert.equal(X.exploredCount(journey), 2);
  const snow = journey.explored.m2.turns!.filter((t) => t.role === 'dreamer').map((t) => t.text);
  assert.ok(snow.includes(SNOW_WORDS));
  assert.ok(!journey.explored.m1.turns!.some((t) => t.text.includes('יפה ושקט')));
});

test('1. her answers moment by moment, in the order of the conversation, each with its moment and what DARE said just before', () => {
  const a = momentAnswersFromJourney(journey);
  assert.deepEqual(a.map((x) => x.momentId), ['m1', 'm1', 'm1', 'm2', 'm2', 'm2']);
  const quiet = a.find((x) => x.answer === SNOW_WORDS)!;
  assert.equal(quiet.momentId, 'm2');
  assert.equal(quiet.moment, 'בחוץ התחיל לרדת שלג, למרות שהיה קיץ');
  assert.match(quiet.question, /^השלג שהתחיל לרדת בחוץ/, 'the question it answered');
  assert.ok(a.filter((x) => x.momentId === 'm1').every((x) => !x.answer.includes('יפה ושקט')), '"יפה ושקט" never reaches the book');
  assert.equal(a[0].moment, 'מצאתי ספר עם השם שלי על הכריכה, אבל הדפים היו ריקים');
  assert.deepEqual({ ...a[4], question: '' }, { momentId: 'm2', label: 'בחוץ התחיל לרדת שלג', moment: 'בחוץ התחיל לרדת שלג, למרות שהיה קיץ', question: '', answer: 'לשנות כיוון', kind: 'change-direction' });
});

test('1. the reflection reads "יפה ושקט" under the snow and nowhere under the book; DARE\'s words are marked as DARE\'s', () => {
  const ctx = reflectionContextFromJourney(journey);
  const input = buildReflectionInput(fx.analysis, flat.selectedElement, flat.reflectionResponse, [], ['wonder', 'confusion'], 'he', ctx);
  const book = blockOf(input, 'm1');
  const snow = blockOf(input, 'm2');
  assert.match(book, /^\[m1\] "ספר" — in the dream: "מצאתי ספר עם השם שלי על הכריכה, אבל הדפים היו ריקים"/);
  assert.doesNotMatch(book, /יפה ושקט/);
  assert.match(snow, /^\[m2\] "בחוץ התחיל לרדת שלג" — in the dream: "בחוץ התחיל לרדת שלג, למרות שהיה קיץ"/);
  assert.match(snow, /THE DREAMER answered \(their exact words\): "לא יודעת, זה פשוט היה יפה ושקט"/);
  assert.match(snow, /THE DREAMER pressed "change direction" \(no words of theirs\)/);
  assert.match(snow, /THE DREAMER answered \(their exact words\): "דווקא השלג נראה לי יותר חשוב\. הוא ירד רק בחוץ, ובתוך הספרייה היה חם"/);
  assert.match(book, /DARE said: "הספר שמצאת עם השם שלך/);
  assert.doesNotMatch(input, /THE DREAMER'S OWN ASSOCIATION/, 'no flat list of all her answers any more');
  assert.match(input, /Each answer belongs ONLY to the moment it is listed under/);
  assert.match(input, /The dreamer's answers are listed above, moment by moment\./);
  // the order of the conversation is kept: the book's three answers, then the snow's
  assert.ok(input.indexOf('זה היה מוזר כי זה השם שלי') < input.indexOf('קצת מזכיר תקופות של הגשות') && input.indexOf('קצת מזכיר תקופות של הגשות') < input.indexOf(SNOW_WORDS));
});

test('1. what the journey sends is what the route reads: the same answers, bounded; an item without its moment or her answer is dropped, never guessed', () => {
  const sent = reflectionContextFromJourney(journey).momentAnswers!;
  assert.deepEqual(parseMomentAnswers(JSON.parse(JSON.stringify(sent))), sent);
  assert.equal(parseMomentAnswers('x'), undefined);
  assert.equal(parseMomentAnswers([{ label: 'ספר', moment: 'm', answer: 'בלי מזהה רגע' }, { momentId: 'm1', moment: 'm', answer: '' }]), undefined);
  const long = parseMomentAnswers([{ momentId: 'm1', label: 'l', moment: 'm', question: 'q'.repeat(5000), answer: 'a'.repeat(5000), kind: 'other' }])!;
  assert.deepEqual([long[0].question.length, long[0].answer.length, 'kind' in long[0]], [800, 2000, false]);
  const route = read('server/routes/dreamReflection.ts');
  assert.match(route, /momentAnswers: parseMomentAnswers\(body\.momentAnswers\),/);
  assert.match(read('src/hero/HeroDream.tsx'), /reflectionContextFromJourney\(exploration\)/, 'continuing from the map and a retry send them');
});

test('1. an older dream kept the earlier way: each question and answer stays with its own moment; a moment without an answer gives nothing', () => {
  const base = X.createExploration('old', fx.moments.slice(0, 3).map((m) => ({ label: m.label, excerpt: m.excerpt })));
  const entry = (order: number, extra: Partial<X.ExploredMoment>): X.ExploredMoment => ({ status: 'explored', question: '', questionSource: 'adaptive', answer: null, followUp: null, insight: null, insightFromFollowUp: false, order, startedAt: T0.toISOString(), exploredAt: T0.toISOString(), ...extra }) as X.ExploredMoment;
  const old: X.Exploration = {
    ...base,
    explored: {
      m2: entry(1, { question: 'מה בלט לך בשלג?', answer: 'השקט שלו', followUp: { question: 'ומה היה בשקט?', answer: 'שלא שמעתי כלום', skipped: false } }),
      m1: entry(2, { question: 'מה בלט לך בספר?', answer: null }),
    },
  };
  assert.deepEqual(momentAnswersFromJourney(old).map((a) => [a.momentId, a.question, a.answer]), [
    ['m2', 'מה בלט לך בשלג?', 'השקט שלו'],
    ['m2', 'ומה היה בשקט?', 'שלא שמעתי כלום'],
  ]);
});

test('1. a request that has no moment for each answer (an older page): the model is told never to tie an answer to a moment', () => {
  const input = buildReflectionInput(fx.analysis, flat.selectedElement, 'השקט שלו\nהוא היה חם', [], [], 'he', { wholeViewShown: 'מבט שלם.' });
  assert.match(input, /These answers are listed together, WITHOUT the moment each belongs to: never say which moment or which detail an answer was about/);
  assert.doesNotMatch(input, /\n\[m\d\] /);
  // the journey before the map (one element, her association) reads exactly as it always did
  const legacy = buildReflectionInput(fx.analysis, 'ספר', 'השם שלי', [], [], 'he');
  assert.match(legacy, /THE ELEMENT THE DREAMER CHOSE AS STANDING OUT TO THEM: ספר\n\nTHE DREAMER'S OWN ASSOCIATION WITH THAT ELEMENT \(their exact words\): "השם שלי"$/);
});

// ------------------------------------------------------------------------------------------------ 2. three sources

test('2. every instruction keeps the dream, her words and DARE\'s possibilities apart, and adds nothing she did not tell', () => {
  for (const lang of ['he', 'en'] as const) {
    const turn = C.buildTurnSystemPrompt(lang, 'feminine');
    assert.match(turn, /THREE SOURCES, NEVER MIXED/);
    assert.match(turn, /An offer of yours stays yours: never give it back later as her words or as a fact/);
    assert.match(turn, /Something she said about one moment belongs to that moment only/);
    assert.match(turn, /no visual detail, sound, sensation, feeling, motive or memory that was not written or told/);
    const refl = buildDreamReflectionSystemPrompt(lang, 'feminine');
    assert.match(refl, /THREE SOURCES, NEVER MIXED/);
    assert.match(refl, /A possibility DARE offered in the conversation \("DARE said"\) is never given back as the dreamer's words or as a fact; one they rejected is never used/);
    assert.match(refl, /MOMENT BY MOMENT: .*each answer belongs ONLY to its own moment/);
    assert.match(refl, /When the input says the answers are listed WITHOUT their moments, never tie an answer to a moment or a detail/);
  }
});

// ------------------------------------------------------------------------------------------------ 3. the conversation

const ctxOf = (e: X.Exploration) => ({
  sourceText: fx.dream,
  labels: e.moments.map((m) => m.label),
  herWords: Object.values(e.explored).flatMap((x) => (x.turns ?? []).filter((t) => t.role === 'dreamer' && !t.steer && !t.rejection).map((t) => t.text)),
  language: 'he' as const,
  questions: Object.values(e.explored).flatMap((x) => (x.turns ?? []).filter((t) => t.role === 'dare').flatMap((t) => `${t.text} ${t.offer ?? ''}`.split(/(?<=[.!?…])\s+/u)).filter((q) => q.includes('?'))),
});

test('3. the live repeat is caught: the snow moment\'s "…או שזה נשאר מיוחד רק לחלום?" was already asked about the book', () => {
  const before = replay('say m2');
  const live = fx.steps.find((s) => s.step === 'say m2')!.dare!;
  const r = C.checkTurn({ reply: live.text, offer: live.offer!, anchors: (live.anchors ?? []).map((quote) => ({ quote, from: 'dream' as const })), facts: [], move: 'offer' }, ctxOf(before));
  assert.doesNotMatch(r.offer, /נשאר מיוחד רק לחלום/);
  assert.match(r.offer, /^אולי דווקא השקט של השלג/, 'the possibility itself stays, without the repeated question');
  assert.ok(r.dropped.some((d) => d.startsWith('a question already asked in this journey')));
  // a question of its own, even about the same detail of the dream, stays
  const own = C.checkTurn({ reply: 'מה היה בשלג שבלט לך יותר מכל השאר?', offer: '', anchors: [], facts: [], move: 'ask' }, ctxOf(before));
  assert.equal(own.reply, 'מה היה בשלג שבלט לך יותר מכל השאר?');
});

test('3. "מה זה מעורר בך?" is not shown (the live opening asked it); the rest of the turn stays', () => {
  const open = fx.steps[0].dare!;
  const r = C.checkTurn({ reply: open.text, offer: open.offer!, anchors: (open.anchors ?? []).map((quote) => ({ quote, from: 'dream' as const })), facts: [], move: 'offer' }, ctxOf(X.createExploration('x', fx.moments)));
  assert.doesNotMatch(`${r.reply} ${r.offer}`, /מעורר בך/);
  assert.match(r.offer, /^אולי זה לא מובן מאליו/);
  assert.equal(C.checkTurn({ reply: 'What does the snow stir in you?', offer: '', anchors: [], facts: [], move: 'ask' }, { ...ctxOf(X.createExploration('x', fx.moments)), language: 'en' }).reply, C.fallbackReply('en'));
  assert.match(C.buildTurnSystemPrompt('he', 'feminine'), /not "מה זה מעורר בך\?", "מה זה מעורר אצלך\?"/);
});

const inputAt = (step: string) => {
  const e = replay(step);
  const s = fx.steps.find((x) => x.step === step)!;
  const id = s.step.split(' ')[1];
  const next = s.step.startsWith('steer') ? X.steerWithReply(e, id, 'shift', threadWords('feminine').shift)! : X.addDreamerTurn(e, id, s.her!);
  const turns = next.explored[id].turns!;
  const earlier = X.exploredInOrder(next).filter((x) => x.moment.id !== id).map(({ moment, entry }) => ({ label: moment.label, text: moment.excerpt ?? moment.label, turns: entry.turns ?? [] }));
  const m = next.moments.find((x) => x.id === id)!;
  return C.buildTurnInput({ sourceText: fx.dream, moments: next.moments.map((x) => ({ label: x.label, explored: next.explored[x.id]?.status === 'explored' })), moment: { label: m.label, text: m.excerpt ?? m.label }, earlier, turns, signals: C.turnSignals({ turns, momentText: m.excerpt ?? '' }), request: 'reply', asked: X.questionsAsked(next, id) });
};

test('3. "I don\'t know": no interpretation and no question about her life in the next turn, one easy question about the dream at most', () => {
  const input = inputAt('say m2');
  assert.match(input, /SHE: "לא יודעת, זה פשוט היה יפה ושקט"/);
  assert.match(input, /HER LAST ANSWER IS SHORT OR UNSURE: TAKE THE PRESSURE OFF\. NO INTERPRETATION AND NO QUESTION ABOUT HER LIFE IN THIS TURN/);
});

test('3. the turn input: earlier moments with their words in the dream, and every question already asked in the journey', () => {
  const input = inputAt('say m2');
  assert.match(input, /EARLIER MOMENTS OF THIS CONVERSATION \(each answer of hers belongs to the moment it is listed under\):\n- "ספר" — in the dream: "מצאתי ספר עם השם שלי על הכריכה, אבל הדפים היו ריקים"/);
  assert.match(input, /QUESTIONS YOU ALREADY ASKED IN THIS JOURNEY \(never again, not in other words and not with the same frame\): .*"זה מזכיר לך משהו מהחיים שלך, או שזה נשאר מיוחד רק לחלום\?"/);
});

test('3. "change direction": the signal goes to DARE, her press is kept in its own moment, and the approved buttons are unchanged', () => {
  assert.match(inputAt('steer m2'), /SHE PRESSED "CHANGE DIRECTION": OFFER ANOTHER DIRECTION/);
  assert.equal(momentAnswersFromJourney(journey).filter((a) => a.kind === 'change-direction').map((a) => a.momentId).join(), 'm2');
  const w = threadWords('feminine');
  assert.deepEqual([w.deepen, w.shift, w.notForMe, w.moveOn, w.finish], ['להמשיך בכיוון', 'לשנות כיוון', 'זה לא מתאים לי', 'לרגע אחר', 'לסיים ולראות מה עלה']);
  assert.equal(X.MAX_QUESTIONS_PER_MOMENT, 3);
});

test('3. she corrects DARE: her correction stays in the moment she said it, DARE reads it as her last words, and is told to use her version', () => {
  let e = replay('say m1');
  e = X.addDreamerTurn(e, 'm1', 'לא, את ה"יפה ושקט" אמרתי על השלג, לא על הספר');
  assert.deepEqual(momentAnswersFromJourney(X.completeConversation(e, 'm1', T0)).map((a) => a.momentId), ['m1']);
  const turns = e.explored.m1.turns!;
  const input = C.buildTurnInput({ sourceText: fx.dream, moments: [], moment: { label: 'ספר', text: fx.moments[0].excerpt }, earlier: [], turns, signals: C.turnSignals({ turns, momentText: '' }), request: 'reply', asked: 1 });
  assert.match(input, /SHE: "לא, את ה'יפה ושקט' אמרתי על השלג, לא על הספר"\n\nSIGNALS/);
  assert.match(C.buildTurnSystemPrompt('he', 'feminine'), /If she corrects you \(a detail, what she said, or which moment something belongs to\): take the correction briefly, as it is, and from then on use only her version/);
});

test('3. "this doesn\'t fit me": the reflection is told the possibility was rejected and is never to be used', () => {
  let e = X.beginConversation(X.createExploration('nf', fx.moments), 'm1', { role: 'dare', text: 'מה בלט לך?', move: 'offer', offer: 'אולי הספר מחכה למילים שלך?', anchors: ['ספר'] } as X.ConversationTurn, T0);
  e = X.rejectWithReply(e, 'm1', threadWords('feminine').notForMe).e;
  e = X.completeConversation(e, 'm1', T0);
  const a = momentAnswersFromJourney(e);
  assert.deepEqual(a.map((x) => [x.momentId, x.kind]), [['m1', 'not-for-me']]);
  const input = buildReflectionInput(fx.analysis, 'ספר', 'x', [], [], 'he', { momentAnswers: a });
  assert.match(input, /DARE said: "מה בלט לך\? אולי הספר מחכה למילים שלך\?"\n  THE DREAMER pressed "this doesn't fit me" on what DARE offered just before: that possibility is REJECTED, never use it/);
});

// ------------------------------------------------------------------------------------------------ 4. the whole view, the summary, the reflection

const sent: { instructions: string; input: string }[] = [];
const stubRaw = { reply: 'בסדר.', offer: '', anchors: [], facts: [], move: 'summarize', mine: [], ideas: [], open: [] };
const deps = (): R.ExplorationDeps => ({
  ...R.realExplorationDeps,
  resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: 'u' } }) as never,
  openai: () => ({ responses: { create: async (req: { instructions: string; input: string }) => (sent.push(req), { model: 'stub', output_text: JSON.stringify(stubRaw), usage: { input_tokens: 0, output_tokens: 0 } }) } }) as never,
  rateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }) as never,
  reserveMoment: async () => 'reserved',
  refundMoment: async () => {},
  reserveWhole: async () => 'reserved',
  refundWhole: async () => {},
  address: async () => 'feminine',
  moderate: async () => ({ status: 'ok' as const, hit: false }),
});

test('4. the whole view, with the stub: one call; each moment\'s words in the dream, and "יפה ושקט" under the snow only', async () => {
  sent.length = 0;
  let e = replay('whole view');
  e = X.completeConversation(e, 'm2', T0);
  const out = await R.handleExploration('conversation-summary', { language: 'he', attemptId: e.attemptId, dreamAnalysis: fx.analysis, exploration: e, emotions: ['wonder', 'confusion'] }, {}, deps());
  assert.equal(out.status, 200);
  assert.equal(sent.length, 1);
  const input = sent[0].input;
  const book = input.indexOf('- "ספר" — in the dream: "מצאתי ספר עם השם שלי על הכריכה, אבל הדפים היו ריקים"');
  const snow = input.indexOf('- "בחוץ התחיל לרדת שלג" — in the dream: "בחוץ התחיל לרדת שלג, למרות שהיה קיץ"');
  assert.ok(book > 0 && snow > book);
  assert.ok(input.indexOf('יפה ושקט') > snow, '"יפה ושקט" sits in the snow\'s part of the conversation');
  assert.match(sent[0].instructions, /never a possibility of yours that she did not take up/);
  assert.match(sent[0].instructions, /Do not assume a link to her life unless she made it herself/);
});

test('4. the reflection, with the stub: one call; the moment rule, the three sources and the answers moment by moment reach the model', async () => {
  const seen: { instructions: string; input: string }[] = [];
  const result = { observation: 'x', personalAssociation: 'x', possibleThread: 'אולי x', continuityQuestion: 'מה עוד בלט לך בשלג?', lenses: { cognitive: null, jungian: null, psychodynamic: null }, confidenceNotes: [], emotionReflection: null, summary: 'x', alternativeReadings: [], existentialFit: 'none', existentialLens: null, groundingStatement: 'x' };
  const client = { responses: { create: async (req: { instructions: string; input: string }) => (seen.push(req), { model: 'stub', output_text: JSON.stringify(result), usage: { input_tokens: 0, output_tokens: 0 } }) } } as never;
  const input = buildReflectionInput(fx.analysis, flat.selectedElement, flat.reflectionResponse, [], [], 'he', reflectionContextFromJourney(journey));
  const out = await generateDreamReflection(client, { input, language: 'he', addressPreference: 'feminine', dreamerText: fx.dream });
  assert.equal(out.status, 'ok');
  assert.equal(seen.length, 1);
  assert.match(seen[0].instructions, /MOMENT BY MOMENT/);
  assert.match(seen[0].input, /\[m2\] "בחוץ התחיל לרדת שלג"[\s\S]*לא יודעת, זה פשוט היה יפה ושקט/);
});

test('4. the reflection: the heart of the dream briefly, a new angle, and no link to her life she did not make', () => {
  for (const lang of ['he', 'en'] as const) {
    const p = buildDreamReflectionSystemPrompt(lang, 'neutral');
    assert.match(p, /4\. CONTINUITY QUESTION — exactly ONE strong question connecting the dream's pattern to the dreamer's waking life, only as far as the dreamer made that link/);
    assert.match(p, /never presumes a link \("Where in your life do you…", "איפה בחיים שלך…" presume one\)/);
    assert.match(p, /The SUMMARY gives the heart of the dream and of what came up, briefly and exactly/);
    assert.match(p, /Never repeat the whole view, not even in other words/);
    assert.match(p, /never claiming a concern, memory or circumstance the dreamer did not name/);
  }
});
