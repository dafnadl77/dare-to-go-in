import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import * as X from '../src/hero/exploration';
import * as C from '../src/hero/conversationTurn';
import * as R from '../server/routes/dreamExploration';
import { buildReflectionInput, generateDreamReflection } from '../server/routes/dreamReflection';
import { buildDreamReflectionSystemPrompt } from '../src/hero/dreamReflectionSchema';
import { reflectionContextFromJourney } from '../src/map/journeyRecord';
import { typedAnalysis } from '../src/demo/demoRouter';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema';
import { CONVERSATIONS } from '../src/map/conversationScript';

/**
 * TWO THINGS SHE ASKED FOR (2026-10-30), no network and no AI (OpenAI is a stub that records what it was sent):
 *   1. a small send button in the map conversation's writing box, the same as Enter, with the keys written under the box;
 *   2. the model's instructions for the conversation, the whole view and the "summary and reflection" screen, in her terms.
 * What a real model writes with these instructions is NOT tested here: that needs a live run, only with her approval.
 */

const read = (p: string) => readFileSync(p, 'utf8');

// the conversation window is rendered for real (its stylesheet is not needed for that)
register('data:text/javascript,' + encodeURIComponent(`export async function load(url, context, next) { if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true }; return next(url, context); }`));
const React = await import('react');
(globalThis as unknown as { React: typeof React }).React = React;
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: ConversationThread } = await import('../src/map/ConversationThread');
type ThreadProps = Parameters<typeof ConversationThread>[0];
const noop = () => {};
// a box that is open: without the direction buttons it is always open
const thread = (over: Partial<ThreadProps>) =>
  renderToStaticMarkup(
    React.createElement(ConversationThread, {
      title: 'רגע',
      excerpt: null,
      turns: [{ role: 'dare', text: 'מה עלה לך?' }],
      address: 'feminine',
      pending: false,
      draft: '',
      onDraft: noop,
      onSend: noop,
      onReject: noop,
      onMoveOn: noop,
      onFinish: noop,
      canFinish: true,
      canMoveOn: true,
      titleId: 't',
      ...over,
    }),
  );
const sendButton = (html: string) => html.match(/<button[^>]*class="cv-send"[^>]*>/)?.[0] ?? null;

// ------------------------------------------------------------------------------------------------ 1. the send button

test('1. the box has a small send button with an arrow, named for screen readers, inside the same form as Enter', () => {
  const html = thread({ draft: 'מילים שלי' });
  const btn = sendButton(html);
  assert.ok(btn, 'a send button');
  assert.match(btn!, /type="submit"/);
  assert.match(btn!, /aria-label="שליחה"/);
  assert.doesNotMatch(btn!, /disabled/, 'words in the box: it can be pressed');
  assert.match(html, /<button[^>]*class="cv-send"[^>]*><svg[^>]*aria-hidden="true"/, 'the arrow is decoration only');
  // the button sits in the form whose submit is the very path Enter takes: her words, trimmed, to onSend
  const src = read('src/map/ConversationThread.tsx');
  assert.match(src, /onSubmit=\{\(e\) => \{\s*e\.preventDefault\(\);\s*if \(p\.draft\.trim\(\)\) p\.onSend\(\);\s*\}\}/);
  assert.match(src, /if \(e\.key !== 'Enter' \|\| e\.shiftKey \|\| e\.nativeEvent\.isComposing\) return;\s*e\.preventDefault\(\);\s*if \(p\.draft\.trim\(\)\) p\.onSend\(\);/, 'Enter sends, Shift+Enter is a new line, unchanged');
  assert.equal((src.match(/p\.onSend\(\)/g) ?? []).length, 2, 'two ways in (Enter, the button through submit), one way out');
});

test('1. an empty box: the button is there but cannot send', () => {
  assert.match(sendButton(thread({ draft: '' }))!, /disabled=""/);
  assert.match(sendButton(thread({ draft: '   ' }))!, /disabled=""/);
});

test('1. English: "Send", and the keys under the box in plain words', () => {
  const html = thread({ language: 'en', draft: 'my words' });
  assert.match(sendButton(html)!, /aria-label="Send"/);
  assert.match(html, /<p id="t-answer-keys" class="cv-keys">Enter to send · Shift\+Enter for a new line<\/p>/);
  assert.match(html, /aria-describedby="t-answer-keys"/);
});

test('1. Hebrew: the keys are written under the box (visible now, and still what screen readers hear)', () => {
  const html = thread({});
  assert.match(html, /<p id="t-answer-keys" class="cv-keys">Enter לשליחה · Shift\+Enter לשורה חדשה<\/p>/);
  assert.ok(html.indexOf('cv-keys') > html.indexOf('<textarea'), 'under the box');
  assert.doesNotMatch(html, /dm-visually-hidden[^>]*>Enter/);
});

test('1. while DARE writes, nothing can be sent: no box and no button (and the button itself is off when pending)', () => {
  const html = thread({ pending: true, draft: 'מילים' });
  assert.equal(sendButton(html), null);
  assert.doesNotMatch(html, /<textarea/);
  assert.match(read('src/map/ConversationThread.tsx'), /disabled=\{p\.pending \|\| !p\.draft\.trim\(\)\}/);
  // a closed or finished moment has no button either
  assert.equal(sendButton(thread({ closed: true, draft: 'x' })), null);
  assert.equal(sendButton(thread({ explored: true, draft: 'x' })), null);
});

test('1. a second Enter or touch before the screen updates sends nothing more (the map holds one send at a time)', () => {
  const map = read('src/map/DreamJourneyMap.tsx');
  assert.match(map, /const sending = useRef\(false\);/);
  assert.match(map, /if \(!words \|\| pending \|\| sending\.current \|\| stoppedFor\(id\)\) return;/);
  assert.match(map, /sending\.current = true;[\s\S]*?try \{\s*await answer\(next, id\);\s*\} finally \{\s*sending\.current = false;\s*\}/);
});

test('1. on a phone: a touch-sized button (44px), and no keyboard hint where there is no Shift; focus is visible', () => {
  const css = read('src/map/conversation.css');
  assert.match(css, /@media \(hover: none\) and \(pointer: coarse\) \{\s*\.cv-send \{\s*width: 44px;\s*height: 44px;\s*\}\s*\.cv-keys \{\s*display: none;\s*\}/);
  assert.match(css, /\.cv-send:focus-visible \{\s*outline: 3px solid #fff1cf;/);
  assert.match(css, /\.cv-compose textarea \{\s*padding-inline-end: 62px;/, 'the words never run under the button');
});

// ------------------------------------------------------------------------------------------------ 2. what the model is told

test('2. the conversation: her last words first, nothing asked twice, no therapist talk, no empty depth, not every detail a meaning', () => {
  for (const lang of ['he', 'en'] as const) {
    const p = C.buildTurnSystemPrompt(lang, 'feminine');
    assert.match(p, /A REPLY starts from her LAST words/);
    assert.match(p, /never ask what she already answered, not even in other words/);
    assert.match(p, /not every detail needs a meaning/);
    assert.match(p, /No therapist phrasing and no judgement about her state/);
    assert.match(p, /No sentence that sounds deep and says nothing/);
    assert.match(p, /do not open two turns with the same words/);
    // what was approved before stays
    assert.match(p, /AT MOST THREE QUESTIONS A MOMENT, ONE A TURN/);
    assert.match(p, /never attribute to her a feeling, thought, motive or event she did not tell/i);
  }
  assert.doesNotMatch(C.buildTurnSystemPrompt('he', 'masculine'), /את\/אתה/, 'no slash forms taught');
});

test('2. the whole view: a clear order, a link only when it really rests on something, no "no link was found", no system wording', () => {
  const p = C.buildTurnSystemPrompt('he', 'neutral');
  assert.match(p, /moment by moment, what came up in each one she talked about/);
  assert.match(p, /ONLY if a link between moments really rests on details of the dream or on her words/);
  assert.match(p, /do not make one up and do not write about its absence \("לא נמצא קשר"/);
  assert.match(p, /Nothing that sounds like a system message/);
  assert.match(p, /Every sentence adds something new: never say the same thing twice/);
});

test('2. English is asked for as natural English, never a word-for-word translation', () => {
  assert.match(C.buildTurnSystemPrompt('en', 'neutral'), /never a word-for-word translation from Hebrew/);
  assert.match(buildDreamReflectionSystemPrompt('en', 'neutral'), /never a word-for-word translation/);
});

// the stub model: records each request and answers with the given turn
const store = CONVERSATIONS.find((c) => c.key === 'store')!;
const seeds = store.moments.map((m) => ({ label: m.label, excerpt: m.excerpt }));
const analysis = () => typedAnalysis(store.dreamText, true) as unknown as DreamAnalysis;
const sent: { instructions: string; input: string }[] = [];
const stub = (raw: Record<string, unknown>) => ({
  responses: {
    create: async (req: { instructions: string; input: string }) => (
      sent.push({ instructions: req.instructions, input: req.input }),
      { model: 'stub', output_text: JSON.stringify({ reply: 'בסדר.', offer: '', anchors: [], facts: [], move: 'reflect', mine: [], ideas: [], open: [], ...raw }), usage: { input_tokens: 0, output_tokens: 0 } }
    ),
  },
}) as never;
const deps = (raw: Record<string, unknown> = {}): R.ExplorationDeps => ({
  ...R.realExplorationDeps,
  resolveIdentity: async () => ({ ok: true, identity: { kind: 'user', userId: 'u' } }) as never,
  openai: () => stub(raw),
  rateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }) as never,
  reserveMoment: async () => 'reserved',
  refundMoment: async () => {},
  reserveWhole: async () => 'reserved',
  refundWhole: async () => {},
  address: async () => 'feminine',
  moderate: async () => ({ status: 'ok' as const, hit: false }),
});
const T0 = new Date('2026-10-30T09:00:00Z');
const d = (text: string): X.ConversationTurn => ({ role: 'dare', text, move: 'ask' });
const talked = () => {
  let e = X.beginConversation(X.createExploration('q', seeds), 'm1', d('מה תפס אותך אצל המוכר?'), T0);
  e = X.addDreamerTurn(e, 'm1', 'הוא חייך אליי כאילו הכיר אותי');
  return e;
};

test('2. a turn, with the stub: one call, the new rules in what the model reads, and her last words in its input', async () => {
  sent.length = 0;
  const out = await R.handleExploration('conversation-turn', { language: 'he', attemptId: 'q', dreamAnalysis: analysis(), exploration: talked(), momentId: 'm1' }, {}, deps({ reply: 'הוא חייך אלייך כאילו הכיר אותך. מה היה בחיוך הזה?', move: 'ask' }));
  assert.equal(out.status, 200);
  assert.equal(sent.length, 1, 'no extra model call, so no extra cost');
  assert.match(sent[0].instructions, /ANSWER WHAT SHE JUST SAID/);
  assert.match(sent[0].input, /SHE: "הוא חייך אליי כאילו הכיר אותי"/);
  assert.match(sent[0].input, /NOW: REPLY to what she just said/);
});

test('2. the whole view, with the stub: one call, the summary rules, and the view is still built from the reply as before', async () => {
  sent.length = 0;
  let e = X.addDareTurn(talked(), 'm1', d('מה היה בחיוך הזה?'));
  e = X.completeConversation(e, 'm1', T0);
  const reply = 'ברגע של המוכר עלה החיוך שלו, «כאילו הכיר אותי».';
  const out = await R.handleExploration('conversation-summary', { language: 'he', attemptId: 'q', dreamAnalysis: analysis(), exploration: e }, {}, deps({ reply, move: 'summarize' }));
  assert.equal(out.status, 200);
  assert.equal(sent.length, 1);
  assert.match(sent[0].instructions, /do not write about its absence/);
  assert.match(sent[0].input, /NOW: SUMMARY of what came up/);
  const view = (out.body as { wholeView: { overview: string; notice: unknown } }).wholeView;
  assert.equal(view.notice, null);
  assert.match(view.overview, /כאילו הכיר אותי/);
});

// ------------------------------------------------------------------------------------------------ 2. the "summary and reflection" screen

const finished = () => {
  let e = X.addDareTurn(talked(), 'm1', { role: 'dare', text: 'מעניין. מה היה בחיוך הזה?', move: 'ask', offer: 'אולי המוכר יודע משהו שאת לא יודעת?', anchors: ['המוכר'] });
  e = X.addDreamerTurn(e, 'm1', 'הוא היה חם');
  e = X.addDareTurn(e, 'm1', d('מה היה חם בו?'));
  e = X.completeConversation(e, 'm1', T0);
  return X.receiveWholeView(e, { kind: 'whole', notice: null, overview: 'ברגע של המוכר עלה החיוך שלו.', connections: [], recurring: null, contrast: null, readings: [], closingQuestion: '', invite: [] } as never, X.basedOnKey(e), T0);
};

test('2. from the map, the reflection is told what she already read: the whole view and DARE\'s questions (each once)', () => {
  const c = reflectionContextFromJourney(finished());
  assert.equal(c.wholeViewShown, 'ברגע של המוכר עלה החיוך שלו.');
  assert.deepEqual(c.questionsAsked, ['מה תפס אותך אצל המוכר?', 'מה היה בחיוך הזה?', 'אולי המוכר יודע משהו שאת לא יודעת?', 'מה היה חם בו?']);
  assert.deepEqual(reflectionContextFromJourney(X.createExploration('q', seeds)), {}, 'nothing yet: nothing is sent');
});

test('2. the reflection input holds that section only after the map; the older journey reads exactly as before', () => {
  const a = analysis();
  const before = buildReflectionInput(a, 'המוכר', 'הוא היה חם', [], [], 'he');
  assert.doesNotMatch(before, /AFTER THE DREAM MAP/);
  const after = buildReflectionInput(a, 'המוכר', 'הוא היה חם', [], [], 'he', { wholeViewShown: 'ברגע של המוכר עלה החיוך שלו.', questionsAsked: ['מה היה חם בו?'] });
  assert.ok(after.startsWith(before), 'the same input, with one section added at the end');
  assert.match(after, /THE WHOLE VIEW THE DREAMER ALREADY READ ON THE MAP \(never repeat it, not even in other words; add what it did not say\): "ברגע של המוכר עלה החיוך שלו\."/);
  assert.match(after, /QUESTIONS DARE ALREADY ASKED THEM IN THE CONVERSATION \(never ask them again, not even in other words\):\n- "מה היה חם בו\?"/);
});

test('2. the reflection\'s instructions: only what is there, nothing generic, and after the map a new angle instead of the whole view again', () => {
  for (const lang of ['he', 'en'] as const) {
    const p = buildDreamReflectionSystemPrompt(lang, 'feminine');
    assert.match(p, /ONLY WHAT IS THERE/);
    assert.match(p, /not every detail needs a meaning/);
    assert.match(p, /never presumes that a link exists/);
    assert.match(p, /NOTHING GENERIC\. Every line says something about THIS dream/);
    assert.match(p, /The same words or the same idea never appear in two fields/);
    assert.match(p, /AFTER THE DREAM MAP \(only when the input has that section\)/);
    assert.match(p, /The SUMMARY gives the heart of the dream and of what came up, briefly and exactly/);
    assert.match(p, /4\. CONTINUITY QUESTION — exactly ONE strong question/, 'the approved structure stays');
  }
});

test('2. the reflection, with the stub: one call; it reads the new rules and what she already read; the result is delivered as before', async () => {
  const seen: { instructions: string; input: string }[] = [];
  const result = { observation: 'The seller smiled.', personalAssociation: 'You said he was warm.', possibleThread: 'Perhaps the smile matters more than the shop.', continuityQuestion: 'What, if anything, did that warmth bring to mind?', lenses: { cognitive: null, jungian: null, psychodynamic: null }, confidenceNotes: [], emotionReflection: null, summary: 'A warm smile from a stranger stood out to you.', alternativeReadings: [], existentialFit: 'none', existentialLens: null, groundingStatement: 'x' };
  const client = { responses: { create: async (req: { instructions: string; input: string }) => (seen.push(req), { model: 'stub', output_text: JSON.stringify(result), usage: { input_tokens: 0, output_tokens: 0 } }) } } as never;
  const input = buildReflectionInput(analysis(), 'the seller', 'he was warm', [], [], 'en', { wholeViewShown: 'In the seller moment, his smile came up.', questionsAsked: ['What was in that smile?'] });
  const out = await generateDreamReflection(client, { input, language: 'en', addressPreference: 'neutral', dreamerText: 'he was warm' });
  assert.equal(seen.length, 1, 'one call, as before');
  assert.equal(out.status, 'ok');
  assert.match(seen[0].instructions, /AFTER THE DREAM MAP/);
  assert.match(seen[0].input, /In the seller moment, his smile came up\./);
  assert.match(seen[0].input, /- "What was in that smile\?"/);
});

test('2. the route takes the two new fields bounded and optional, and the journey sends them on continue and on retry', () => {
  const route = read('server/routes/dreamReflection.ts');
  assert.match(route, /wholeViewShown: boundedText\(body\.wholeViewShown, 3000\) \|\| undefined,/);
  assert.match(route, /questionsAsked: Array\.isArray\(body\.questionsAsked\) \? body\.questionsAsked\.map\(\(x\) => boundedText\(x, 300\)\)\.filter\(Boolean\)\.slice\(0, 12\) : undefined,/);
  const hero = read('src/hero/HeroDream.tsx');
  assert.match(hero, /\.\.\.\(DREAM_MAP_JOURNEY && exploration \? reflectionContextFromJourney\(exploration\) : \{\}\),/, 'a retry sends it too');
  assert.match(hero, /emotions: selectedEmotions,\s*\.\.\.reflectionContextFromJourney\(exploration\),\s*attemptId/, 'continuing from the map');
});

test('2. nothing else moved: the same model settings, the same schema, three questions a moment, the same token bound', () => {
  assert.equal(X.MAX_QUESTIONS_PER_MOMENT, 3);
  assert.equal(R.TURN_MAX_OUTPUT_TOKENS, 700);
  assert.deepEqual([...C.TURN_JSON_SCHEMA.required], ['reply', 'offer', 'anchors', 'facts', 'move', 'mine', 'ideas', 'open']);
  assert.match(read('server/routes/dreamReflection.ts'), /resolveStageModel\('OPENAI_REFLECTION_MODEL'\)/);
  assert.match(read('server/routes/dreamExploration.ts'), /'OPENAI_REFLECTION_MODEL', instructions \+ note, input, 'conversation_turn'/);
});

// ------------------------------------------------------------------------------------------------ 3. the whole view's paragraphs (2026-10-30, second round)

const cctx = { sourceText: store.dreamText, labels: store.moments.map((m) => m.label), herWords: ['הוא חייך אליי כאילו הכיר אותי'], language: 'he' as const };
const summaryRaw = (reply: string) => ({ reply, offer: '', anchors: [], facts: [], move: 'summarize' as const });

test('3. the check keeps the model\'s paragraphs and line breaks as written', () => {
  const reply = 'ברגע של המוכר עלה החיוך שלו.\n\nברגע השני עלה משהו אחר.\nושורה נוספת באותה פסקה.';
  assert.equal(C.checkTurn(summaryRaw(reply), cctx).reply, reply);
  assert.equal(C.checkTurn(summaryRaw('שורה אחת.\r\n\r\n\r\nשורה שתיים.'), cctx).reply, 'שורה אחת.\n\nשורה שתיים.', 'odd breaks become one clean paragraph break');
});

test('3. the checks still work inside each paragraph: a quote never said goes, the other paragraphs stay; one question in all', () => {
  const r = C.checkTurn(summaryRaw('היא אמרה «משהו שלא נאמר מעולם».\n\nהחיוך שלו, «כאילו הכיר אותי».'), cctx);
  assert.equal(r.reply, 'החיוך שלו, «כאילו הכיר אותי».', 'an emptied paragraph leaves no empty gap');
  assert.equal(C.checkTurn(summaryRaw('מה היה בחיוך?\n\nומה היה בעץ?'), cctx).reply, 'מה היה בחיוך?');
});

test('3. the whole view keeps the paragraphs from the model to the screen', async () => {
  let e = X.addDareTurn(talked(), 'm1', d('מה היה בחיוך הזה?'));
  e = X.completeConversation(e, 'm1', T0);
  const reply = 'ברגע של המוכר עלה החיוך שלו, «כאילו הכיר אותי».\n\nאפשר להמשיך לרגע אחר.';
  const out = await R.handleExploration('conversation-summary', { language: 'he', attemptId: 'q', dreamAnalysis: analysis(), exploration: e }, {}, deps({ reply, move: 'summarize' }));
  const overview = (out.body as { wholeView: { overview: string } }).wholeView.overview;
  assert.equal(overview, reply);
  const kept = X.receiveWholeView(e, { kind: 'whole', notice: null, overview, connections: [], recurring: null, contrast: null, readings: [], closingQuestion: '', invite: [] } as never, X.basedOnKey(e), T0);
  assert.equal(kept.wholeView!.overview, reply, 'kept with the journey as written');
  assert.match(read('src/map/DreamMap.css'), /\.dm-whole-overview \{\s*font-size: 18px;\s*line-height: 1\.75;\s*\/\*[^*]*\*\/\s*white-space: pre-line;\s*\}/, 'shown as written, same font and size');
  assert.match(C.buildTurnSystemPrompt('he', 'feminine'), /short paragraphs separated by an empty line/);
});
