import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as X from '../src/hero/exploration';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema';
import { buildSavedDream } from '../src/hero/dreamStorage';
import { herWordsByMoment, mapJourneyComplete, mapJourneyFrom, mapMomentTexts, reflectionFromJourney, savedFieldsFromJourney } from '../src/map/journeyRecord';
import { demoConversation } from '../src/demo/demoRouter';
import { threadWords } from '../src/map/threadWords';
import { DREAM_MAP_JOURNEY } from '../src/hero/journeyMode';

/**
 * THE DREAM MAP IN THE REAL JOURNEY (approved 2026-10-26: the map replaces the single "what stands out" choice; both languages). The
 * moments come from the dream's own events, the conversation and the whole view run through the existing engine and routes, and a
 * finished map journey is saved in the same SavedDream shape as every other dream. No network, no AI.
 */

const DREAM = 'הייתי בתחנת רכבת ישנה. הרכבת לא הגיעה. פתאום מצאתי מפתח קטן בכיס.';
const analysis = { sourceText: DREAM, unusualElements: [] } as unknown as DreamAnalysis;
const read = (p: string) => readFileSync(p, 'utf8');

/** A journey with one moment talked about (her words, a button bubble, DARE's turns) and its whole view. */
function talkedJourney(withWhole = true) {
  let e = mapJourneyFrom('attempt-1', analysis, null);
  const id = e.moments[0].id;
  e = X.beginConversation(e, id, { role: 'dare', text: 'מה עלה לך ברגע הזה?' });
  e = X.addDreamerTurn(e, id, 'זה מזכיר לי את הבית של סבתא');
  e = X.addDareTurn(e, id, { role: 'dare', text: 'הבית של סבתא.', offer: 'אולי יש כאן משהו על חיכיון?' });
  e = X.steerWithReply(e, id, 'deepen')!;
  e = X.completeConversation(e, id);
  if (withWhole)
    e = X.receiveWholeView(
      e,
      { overview: 'עלה הבית של סבתא.', recurring: null, contrast: null, readings: [], closingQuestion: '', connections: [], kind: 'whole', notice: null, invite: [], takeaways: { mine: ['זה מזכיר לי את הבית של סבתא'], ideas: ['אולי יש כאן משהו על חיכיון?'], open: ['מה עוד מחכה?'] } },
      X.basedOnKey(e),
    );
  return e;
}

test('the journey mode is on: the map replaces the single choice, and the earlier path stays in the code', () => {
  assert.equal(DREAM_MAP_JOURNEY, true);
  const hero = read('src/hero/HeroDream.tsx');
  assert.match(hero, /setInsideStep\(DREAM_MAP_JOURNEY \? 'emotions' : 'prompt'\)/, 'after the picture: the feelings step');
  assert.match(hero, /if \(DREAM_MAP_JOURNEY\) \{\s*setInsideStep\('map'\)/, 'after the feelings step: the map');
  assert.match(hero, /<DreamJourneyMap/);
  assert.match(hero, /startReflectionEngine\('initial'/, 'the earlier reflection path is still there');
});

test('the moments are the dream\'s own events, at most six, each with a title; a failed labels call never blocks', () => {
  const texts = mapMomentTexts(analysis);
  assert.ok(texts.length >= 2 && texts.length <= X.MAX_MOMENTS);
  for (const t of texts) assert.ok(DREAM.includes(t.text.replace(/[.,]$/, '').trim().split(' ')[0]));
  const fallback = mapJourneyFrom('attempt-1', analysis, null);
  assert.equal(fallback.moments.length, texts.length);
  assert.ok(fallback.moments.every((m) => m.label.trim().length > 0), 'titles built from the moments\' own words');
  const labelled = mapJourneyFrom('attempt-1', analysis, texts.map((_, i) => `כותרת ${i + 1}`));
  assert.deepEqual(labelled.moments.map((m) => m.label), texts.map((_, i) => `כותרת ${i + 1}`));
  assert.equal(labelled.attemptId, 'attempt-1', 'the journey belongs to the dream\'s own attempt (the server checks it)');
  const empty = mapMomentTexts({ sourceText: '   ', unusualElements: [] } as unknown as DreamAnalysis);
  assert.deepEqual(empty, []);
});

test('the moment titles ride on the existing labels route (no new function), with the moment rules and the code check', () => {
  const route = read('server/routes/dreamElementLabels.ts');
  assert.match(route, /body\.purpose === 'moments'/);
  assert.match(route, /momentLabelRules\(language\)/);
  assert.match(route, /checkLabel\(/);
  assert.match(route, /dareWordsSafe\(labels/, 'the checked titles are what the safety check reads');
  assert.match(read('src/hero/dreamElementLabels.ts'), /getMomentLabels[\s\S]*'moments'/);
  assert.equal(readFileSync('vercel.json', 'utf8').includes('dream-exploration'), false);
});

test('a finished map journey is saved in the same shape as every dream; nothing is invented', () => {
  assert.equal(reflectionFromJourney(talkedJourney(false), 'he'), null, 'no whole view yet: nothing to save');
  assert.equal(mapJourneyComplete(talkedJourney(false)), false);
  const e = talkedJourney();
  assert.ok(mapJourneyComplete(e));
  const r = reflectionFromJourney(e, 'he')!;
  assert.equal(r.observation, 'עלה הבית של סבתא.');
  assert.equal(r.continuityQuestion, 'מה עוד מחכה?', 'no closing question: the first question left open');
  assert.equal(r.possibleThread, 'אולי יש כאן משהו על חיכיון?');
  assert.equal(r.groundingStatement, 'זו השתקפות, לא אבחנה או פרשנות חד-משמעית.');
  // her own words only: not the bubble a direction button wrote
  assert.deepEqual(herWordsByMoment(e)[0].words, ['זה מזכיר לי את הבית של סבתא']);
  const fields = savedFieldsFromJourney(e);
  assert.equal(fields.selectedElement, e.moments[0].label);
  assert.equal(fields.reflectionResponse, 'זה מזכיר לי את הבית של סבתא');
  const saved = buildSavedDream({ sourceText: DREAM, inputMode: 'text', dreamAnalysis: analysis, dreamImageDataUrl: null, corrections: [], ...fields, dreamReflection: r, exploration: e });
  assert.ok(saved.exploration, 'the journey rides along with the dream');
  assert.equal(X.parseExploration(saved.exploration)?.wholeView?.overview, 'עלה הבית של סבתא.');
});

test('the map inside the journey: no way back to the archive or favourite yet, and the way on once the whole view is shown', () => {
  const map = read('src/map/DreamMap.tsx');
  assert.match(map, /\{!props\.journey && \(\s*<button\s+type="button"\s+className="dm-back"/);
  assert.match(map, /\{!props\.journey && \(\s*<li>\s*<button type="button" className="dm-more-item" aria-pressed=\{favorite\}/);
  assert.match(map, /props\.journey\.onContinue/);
  const jm = read('src/map/DreamJourneyMap.tsx');
  assert.match(jm, /explorationEngine/, 'the real engine (paidFetch, the account token)');
  assert.match(jm, /'conversation-summary'/, '"what came up" of the conversation');
  assert.match(jm, /stopForSession\(level\)/, 'after danger or a threat the session stops, as everywhere');
  assert.doesNotMatch(jm, /conversationLive|livePost|CONVERSATIONS/, 'nothing of the development page');
});

test('the window speaks the journey\'s language; the buttons\' words are what her bubble says', () => {
  const en = threadWords('neutral', 'en');
  assert.equal(en.notForMe, "This doesn't fit me");
  assert.equal(en.progress(2), 'Question 2 of 3');
  assert.equal(threadWords('feminine').notForMe, 'זה לא מתאים לי', 'Hebrew unchanged');
  let e = mapJourneyFrom('attempt-1', analysis, null);
  const id = e.moments[0].id;
  e = X.beginConversation(e, id, { role: 'dare', text: 'What came up?', offer: 'Maybe the key?' });
  const r = X.rejectWithReply(e, id, en.notForMe);
  assert.equal(r.reply, true);
  const turns = r.e.explored[id].turns!;
  assert.equal(turns[turns.length - 1].text, "This doesn't fit me");
});

test('the saved dream page shows a map dream in its own blocks, and every other dream as before', () => {
  const detail = read('src/archive/DreamDetail.tsx');
  assert.match(detail, /reflection && journeyView \?/);
  assert.match(detail, /\) : reflection \? \(/, 'the earlier blocks are unchanged for every other dream');
  assert.match(read('src/hero/DreamClosing.tsx'), /reflectionResult\.continuityQuestion\.trim\(\) &&/);
});

test('the demo answers the map\'s conversation with tagged placeholders that keep the journey\'s rules', () => {
  let e = mapJourneyFrom('attempt-1', analysis, null);
  const id = e.moments[0].id;
  const first = demoConversation(true, { mode: 'conversation-turn', momentId: id, exploration: e }) as { turn: X.ConversationTurn };
  assert.match(first.turn.text, /דוגמת הדגמה/);
  e = X.beginConversation(e, id, first.turn);
  for (let i = 0; i < 2; i++) {
    e = X.addDreamerTurn(e, id, `תשובה ${i}`);
    e = X.addDareTurn(e, id, (demoConversation(true, { mode: 'conversation-turn', momentId: id, exploration: e }) as { turn: X.ConversationTurn }).turn);
  }
  assert.equal(X.questionsAsked(e, id), 3);
  e = X.addDreamerTurn(e, id, 'תשובה אחרונה');
  const closing = demoConversation(true, { mode: 'conversation-turn', momentId: id, exploration: e }) as { turn: X.ConversationTurn };
  assert.equal(closing.turn.closing, true, 'after the third question: the closing line');
  assert.doesNotMatch(closing.turn.text, /\?/);
  e = X.completeConversation(X.addDareTurn(e, id, closing.turn), id);
  const summary = demoConversation(true, { mode: 'conversation-summary', exploration: e }) as { basedOn: string; wholeView: { overview: string } };
  assert.equal(summary.basedOn, X.basedOnKey(e));
  assert.match(summary.wholeView.overview, /דוגמת הדגמה/);
});

test('the earlier path\'s own steps never run in the map journey (found in the live test: its "nothing to choose" step raced the feelings step)', () => {
  const hero = read('src/hero/HeroDream.tsx');
  assert.match(hero, /if \(reconstructionPhase !== 'inside' \|\| DREAM_MAP_JOURNEY\) return;\s*\/\/ 'prompt' holds alone briefly/);
});
