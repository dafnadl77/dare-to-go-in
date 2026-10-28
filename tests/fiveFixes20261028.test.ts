import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import * as X from '../src/hero/exploration';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema';
import { mapJourneyFrom, mapMomentTexts, momentFoci } from '../src/map/journeyRecord';
import { threadWords } from '../src/map/threadWords';
import { closingLine } from '../server/routes/dreamExploration';
import { demoConversation } from '../src/demo/demoRouter';

/**
 * FIVE FIXES AFTER A REAL DREAM ON THE LIVE SITE (2026-10-28): the moments of a one-sentence dream, the direction buttons and the hidden
 * writing box, a clear end after three questions, "other angles" in the page flow, and both buttons of "the dream is saved" at once.
 * No network, no AI.
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
const thread = (over: Partial<ThreadProps>) =>
  renderToStaticMarkup(
    React.createElement(ConversationThread, {
      title: 'רגע',
      excerpt: null,
      turns: [{ role: 'dare', text: 'מה עלה לך?', offer: 'אולי יש כאן משהו?' }],
      address: 'feminine',
      pending: false,
      draft: '',
      onDraft: noop,
      onSend: noop,
      onReject: noop,
      onSteer: noop,
      onMoveOn: noop,
      onFinish: noop,
      canFinish: true,
      canMoveOn: true,
      titleId: 't',
      ...over,
    }),
  );
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);

// ------------------------------------------------------------------------------------------------ 1. the moments of one sentence

const BUNKER = 'חלמתי שיש מלחמת טילים ואני מתחבאת בבונקר עם כל האנשים שאני הכי אוהבת בעולם';
/** The shape the dream analysis gives (its own words, in the dream's language; "explicit" for what the dream says). */
const bunkerAnalysis = {
  sourceText: BUNKER,
  unusualElements: [],
  people: [
    { nameOrRole: 'אני', explicit: true },
    { nameOrRole: 'האנשים שאני הכי אוהבת בעולם', explicit: true },
  ],
  objects: [{ name: 'טילים', explicit: true }],
  places: [{ name: 'בונקר', explicit: true }],
  actions: [
    { subject: null, action: 'מלחמת טילים', target: null, explicit: true },
    { subject: 'אני', action: 'מתחבאת', target: 'בבונקר', explicit: true },
  ],
} as unknown as DreamAnalysis;

test('the cause: a short sentence is one scene (nothing to split), so the map offered the whole sentence as one moment', () => {
  const sceneOnly = mapMomentTexts({ sourceText: BUNKER, unusualElements: [] } as unknown as DreamAnalysis);
  assert.equal(sceneOnly.length, 1, 'no elements to go on: still one moment, nothing invented');
});

test('one scene with several foci: the war, hiding in the bunker, the people she loves most — each in the dream\'s own words', () => {
  const texts = mapMomentTexts(bunkerAnalysis).map((m) => m.text);
  assert.deepEqual(texts, ['מלחמת טילים', 'מתחבאת בבונקר', 'האנשים שאני הכי אוהבת בעולם']);
  for (const t of texts) assert.ok(BUNKER.includes(t), 'every moment is words the dream says');
  const e = mapJourneyFrom('a', bunkerAnalysis, null);
  assert.equal(e.moments.length, 3);
  assert.deepEqual(e.moments.map((m) => m.excerpt), texts);
});

test('foci are never invented: an element the dream does not say is left out, and the dreamer alone is never a focus', () => {
  const foci = momentFoci({ ...bunkerAnalysis, places: [{ name: 'מקלט תת-קרקעי', explicit: true }], objects: [{ name: 'אזעקה', explicit: true }] } as unknown as DreamAnalysis, BUNKER);
  for (const f of foci) assert.ok(BUNKER.includes(f));
  assert.ok(!foci.some((f) => /מקלט|אזעקה/.test(f)));
  assert.ok(!foci.includes('אני'));
  // an element that is inferred, not said, is not a focus
  assert.deepEqual(momentFoci({ sourceText: BUNKER, unusualElements: [], people: [], objects: [], places: [{ name: 'בונקר', explicit: false }], actions: [] } as unknown as DreamAnalysis, BUNKER), []);
});

test('a dream that is really one moment stays one moment (no forced split)', () => {
  const one = 'חלמתי שאני עפה מעל הים';
  const texts = mapMomentTexts({ sourceText: one, unusualElements: [], people: [], objects: [], places: [{ name: 'הים', explicit: true }], actions: [{ subject: 'אני', action: 'עפה', target: 'מעל הים', explicit: true }] } as unknown as DreamAnalysis);
  assert.deepEqual(texts.map((m) => m.text), [one]);
});

test('a dream of several scenes keeps its scenes, as before', () => {
  const DREAM = 'הייתי בתחנת רכבת ישנה. הרכבת לא הגיעה. פתאום מצאתי מפתח קטן בכיס.';
  const texts = mapMomentTexts({ ...bunkerAnalysis, sourceText: DREAM } as unknown as DreamAnalysis).map((m) => m.text);
  assert.ok(texts.length >= 2);
  assert.ok(texts.every((t) => DREAM.includes(t.replace(/[.,]$/, '').trim())));
});

test('English: the same rule, with the dream\'s own words', () => {
  const D = 'I dreamed there was a missile war and I was hiding in a bunker with all the people I love most';
  const texts = momentFoci({ sourceText: D, unusualElements: [], people: [{ nameOrRole: 'the people I love most', explicit: true }], objects: [], places: [{ name: 'bunker', explicit: true }], actions: [{ subject: null, action: 'missile war', target: null, explicit: true }, { subject: 'I', action: 'hiding', target: 'in a bunker', explicit: true }] } as unknown as DreamAnalysis, D);
  assert.deepEqual(texts, ['missile war', 'hiding in a bunker', 'people I love most']);
});

// ------------------------------------------------------------------------------------------------ 2. the direction buttons and the box

test('after DARE\'s turn: "להמשיך בכיוון" and "לשנות כיוון", "זה לא מתאים לי" only with an offer; the writing box is closed and there is no send button', () => {
  const html = thread({});
  assert.deepEqual(buttons(html).slice(0, 3), ['להמשיך בכיוון', 'לשנות כיוון', 'זה לא מתאים לי']);
  assert.doesNotMatch(html, /<textarea/, 'the box is hidden until she chooses to go on');
  assert.doesNotMatch(html, /type="submit"|>שליחה</, 'no separate send button');
  const noOffer = thread({ turns: [{ role: 'dare', text: 'מה עלה לך?' }] });
  assert.ok(!buttons(noOffer).includes('זה לא מתאים לי'));
  const rejected = thread({ turns: [{ role: 'dare', text: 'מה עלה?', offer: 'אולי?', rejected: true }] });
  assert.ok(!buttons(rejected).includes('זה לא מתאים לי'));
});

test('"להמשיך בכיוון" only opens the box (nothing is asked of DARE); "לשנות כיוון" asks DARE for another direction', () => {
  const src = read('src/map/ConversationThread.tsx');
  assert.match(src, /onClick=\{\(\) => setWriting\(true\)\}>\s*\{w\.deepen\}/);
  assert.match(src, /onClick=\{\(\) => p\.onSteer\?\.\('shift'\)\}>\s*\{w\.shift\}/);
  assert.doesNotMatch(src, /onSteer\?\.\('deepen'\)/);
  const map = read('src/map/DreamJourneyMap.tsx');
  assert.match(map, /X\.steerWithReply\(eRef\.current!, moment\.id, 'shift', w\.shift\)/);
  assert.doesNotMatch(map, /'deepen'/, 'the map never sends a "deepen" turn now');
});

test('the box: Enter sends, Shift+Enter is a new line, a word being composed is never sent; the keys are told to screen readers', () => {
  const src = read('src/map/ConversationThread.tsx');
  assert.match(src, /if \(e\.key !== 'Enter' \|\| e\.shiftKey \|\| e\.nativeEvent\.isComposing\) return;\s*e\.preventDefault\(\);\s*if \(p\.draft\.trim\(\)\) p\.onSend\(\);/);
  assert.match(src, /enterKeyHint="send"/);
  assert.match(src, /aria-describedby=\{`\$\{answerId\}-keys`\}/);
  assert.equal(threadWords('feminine').keys, 'Enter לשליחה, Shift+Enter לשורה חדשה.');
  assert.equal(threadWords('neutral', 'en').keys, 'Enter sends. Shift+Enter starts a new line.');
});

test('the box is never out of reach: without direction buttons, or when her last words wait for DARE, it stays open', () => {
  assert.match(thread({ onSteer: undefined }), /<textarea/);
  assert.match(thread({ turns: [{ role: 'dare', text: 'מה עלה?' }, { role: 'dreamer', text: 'מילים שלי' }] }), /<textarea/);
});

// ------------------------------------------------------------------------------------------------ 3. a clear end after three questions

test('after the third answer: DARE\'s closing line alone, no box and no direction buttons; "לרגע אחר" only when another moment is left', () => {
  const closedTurns = [
    { role: 'dare' as const, text: 'שאלה?' },
    { role: 'dreamer' as const, text: 'תשובה' },
    { role: 'dare' as const, text: 'תודה על מה ששיתפת.', closing: true },
  ];
  const withOther = thread({ turns: closedTurns, closed: true });
  assert.doesNotMatch(withOther, /<textarea/);
  assert.deepEqual(buttons(withOther), ['לרגע אחר', 'לסיים ולראות מה עלה']);
  assert.match(withOther, /אפשר לעבור לרגע אחר או לראות מה עלה\./);
  const last = thread({ turns: closedTurns, closed: true, canMoveOn: false });
  assert.deepEqual(buttons(last), ['לסיים ולראות מה עלה'], 'no meaningless move button');
  assert.match(last, /החקירה של הרגע הזה הסתיימה\. אפשר לראות מה עלה\./);
  assert.doesNotMatch(last, /לרגע אחר/);
});

test('in the conversation too, "לרגע אחר" appears only when there is another moment; finishing early stays', () => {
  const html = thread({ canMoveOn: false });
  assert.ok(!buttons(html).includes('לרגע אחר'));
  assert.ok(buttons(html).includes('לסיים ולראות מה עלה'));
  assert.doesNotMatch(html, /לרגע אחר/, 'the status line does not offer it either');
});

test('another moment is left only when one is not talked about yet and has questions left; one moment means none', () => {
  const one = mapJourneyFrom('a', { sourceText: 'חלמתי שאני עפה מעל הים', unusualElements: [] } as unknown as DreamAnalysis, null);
  assert.equal(one.moments.length, 1);
  assert.equal(X.anotherMomentLeft(one, one.moments[0].id), false);
  let e = mapJourneyFrom('a', bunkerAnalysis, null);
  const [a, b, c] = e.moments.map((m) => m.id);
  assert.equal(X.anotherMomentLeft(e, a), true);
  for (const id of [b, c]) {
    e = X.beginConversation(e, id, { role: 'dare', text: 'מה עלה?' });
    e = X.completeConversation(X.addDreamerTurn(e, id, 'מילים'), id);
  }
  assert.equal(X.anotherMomentLeft(e, a), false, 'the others were talked about');
  assert.match(read('src/map/DreamJourneyMap.tsx'), /canMoveOn=\{X\.anotherMomentLeft\(e, moment\.id\)\}/);
});

test('a moment that was talked about is not opened again (its three questions do not start over)', () => {
  const map = read('src/map/DreamJourneyMap.tsx');
  assert.match(map, /if \(cur\.explored\[id\] \|\| pending \|\| stoppedFor\(id\)\) return;/);
  assert.match(read('server/routes/dreamExploration.ts'), /questionsAsked\(e, m\.id\) < MAX_QUESTIONS_PER_MOMENT \? \{ kind: 'turn', request: 'open'/);
});

test('the plain closing line (when the model\'s is not usable) speaks of another moment only when there is one; the demo follows', () => {
  assert.match(closingLine('he', true), /לרגע אחר/);
  assert.doesNotMatch(closingLine('he', false), /רגע אחר|\?/);
  assert.doesNotMatch(closingLine('en', false), /another moment|\?/);
  let e = mapJourneyFrom('a', { sourceText: 'חלמתי שאני עפה מעל הים', unusualElements: [] } as unknown as DreamAnalysis, null);
  const id = e.moments[0].id;
  e = X.beginConversation(e, id, { role: 'dare', text: 'שאלה 1?' });
  for (let i = 2; i <= 3; i++) e = X.addDareTurn(X.addDreamerTurn(e, id, `תשובה ${i}`), id, { role: 'dare', text: `שאלה ${i}?` });
  e = X.addDreamerTurn(e, id, 'תשובה אחרונה');
  const out = demoConversation(true, { mode: 'conversation-turn', momentId: id, exploration: e }) as { turn: X.ConversationTurn };
  assert.equal(out.turn.closing, true);
  assert.doesNotMatch(out.turn.text, /רגע אחר/);
});

// ------------------------------------------------------------------------------------------------ 4. other angles, in the page flow

test('the cause: the open angles were drawn in a corner over the reflection (absolute); now, open, the screen flows and the box is in it', () => {
  const src = read('src/hero/DreamReflection.tsx');
  assert.match(src, /data-flow=\{step === 'reflection' && \(flowLayout \|\| lensesVisible\) \? 'true' : undefined\}/);
  assert.match(src, /<div className="dr-lenses-wrap" data-open=\{lensesVisible \? 'true' : undefined\}>/);
  assert.match(src, /aria-expanded=\{lensesVisible\}/);
  // the flowing layout (desktop and tablet) puts the box after the thoughts, then the grounding line and "continue"
  const flow = read('src/hero/DreamEmotions.css');
  assert.match(flow, /\[data-flow='true'\] \.dr-lenses-wrap \{\s*position: relative;/);
  assert.match(flow, /\[data-flow='true'\] \.dr-grounding \{\s*position: relative;/);
  assert.match(flow, /\[data-flow='true'\] \.dr-continue-wrap \{\s*position: relative;/);
  // on opening, only the screen scrolls to the box, never the page around it
  assert.match(src, /getComputedStyle\(screen\)\.overflowY === 'auto'/);
});

test('the open angles sit in a soft box in the dream map card\'s language; wording unchanged', () => {
  const css = read('src/hero/DreamReflection.css');
  const box = css.match(/\.dr-lenses \{\s*pointer-events: auto;[^}]*\}/)?.[0] ?? '';
  assert.match(box, /background: rgba\(11, 12, 27, 0\.9\)/, 'the map card plate (--dm-plate)');
  assert.match(box, /border: 1px solid rgba\(233, 199, 135, 0\.45\)/, 'the map card hairline');
  assert.match(box, /border-radius: 22px/);
  assert.match(read('src/map/DreamMap.css'), /--dm-plate: rgba\(11, 12, 27, 0\.9\)/);
  assert.match(css, /:root \.dr-lenses-wrap\[data-open='true'\] \{\s*background: none;/, 'on a phone, no box inside a box');
});

// ------------------------------------------------------------------------------------------------ 5. "the dream is saved": both at once

test('the cause: the archive button had its own fade 2.4s later; now it appears with the saved block, as "return to the room" does', () => {
  const css = read('src/hero/DreamClosing.css');
  const rule = css.match(/\.dc-archive-invite \{[^}]*\}/)?.[0] ?? '';
  assert.ok(rule, 'the rule is there');
  assert.doesNotMatch(rule, /animation|opacity: 0/);
  const tsx = read('src/hero/DreamClosing.tsx');
  assert.match(tsx, /<div className="dc-block dc-block--enter" style=\{accentVars\}>[\s\S]*?onClick=\{onReturnToRoom\}[\s\S]*?className="dc-archive-invite"[\s\S]*?onClick=\{onGoToArchive\}/);
});
