import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as X from '../src/hero/exploration';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema';
import { mapJourneyFrom, savedFieldsFromJourney } from '../src/map/journeyRecord';
import { buildSavedDream } from '../src/hero/dreamStorage';
import { mapStrings } from '../src/map/mapStrings';

/**
 * TWO PAGES, BOTH KEPT (2026-10-28): in the journey, after the map's whole view, the existing "summary and reflection" screen (the
 * reflection) comes too — it does not replace the whole view; and a saved map dream opens on its summary-and-reflection page with its map
 * one click away (and back), read-only, from what was saved. No design changes, no AI, no credits. Dreams without a map are unchanged.
 */

const read = (p: string) => readFileSync(p, 'utf8');
const analysis = { sourceText: 'הייתי בתחנת רכבת ישנה. הרכבת לא הגיעה. פתאום מצאתי מפתח קטן בכיס.', unusualElements: [] } as unknown as DreamAnalysis;

test('the journey: after the whole view, "continue" asks the existing reflection — the screen that always came — then keeping or letting go', () => {
  const hero = read('src/hero/HeroDream.tsx');
  assert.match(hero, /onContinue=\{handleContinueFromMap\}/);
  assert.match(hero, /const handleContinueFromMap = \(\) => \{[\s\S]*?setInsideStep\('interpreting'\);\s*startReflectionEngine\('initial'/);
  // the reflection screen goes on to keeping or letting go as before; the saved dream keeps the reflection it showed
  assert.match(hero, /const handleContinueFromReflection = \(\) => setInsideStep\('closing'\);/);
  assert.match(hero, /reflectionEngineResult\?\.status === 'ok' \? reflectionEngineResult\.reflection : journeyReflection/);
  // the one case where the reflection cannot be asked (the whole view used the dream's three calls): on to keeping, never stuck
  assert.match(hero, /DREAM_MAP_JOURNEY && reflectionEngineResult\.status === 'error' && reflectionEngineResult\.reason === 'limit_reached'\) \{\s*setInsideStep\('closing'\)/);
});

test('the reflection is always asked with her answers: her words, or what the buttons said, or the moments', () => {
  let e = mapJourneyFrom('a', analysis, null);
  const id = e.moments[0].id;
  e = X.beginConversation(e, id, { role: 'dare', text: 'מה עלה?', offer: 'אולי משהו?' });
  e = X.steerWithReply(e, id, 'deepen')!;
  e = X.completeConversation(e, id);
  const f = savedFieldsFromJourney(e);
  assert.equal(f.selectedElement, e.moments[0].label);
  assert.equal(f.reflectionResponse, 'להמשיך בכיוון', 'only buttons: what they said');
  assert.ok(f.reflectionResponse.trim().length > 0);
});

test('a saved dream: the summary-and-reflection page links to the map only when the dream has one; the map links back', () => {
  const detail = read('src/archive/DreamDetail.tsx');
  assert.match(detail, /const \[screen, setScreen\] = useState<'summary' \| 'map'>\('summary'\)/);
  assert.match(detail, /\{journey && \(\s*<button type="button" className="dd-end-link" onClick=\{\(\) => setScreen\('map'\)\}>\s*\{ms\.dreamMapLink\}/);
  assert.match(detail, /if \(journey && savedDream && screen === 'map'\) \{[\s\S]*?<SavedDreamMap[\s\S]*?onShowSummary=\{\(\) => setScreen\('summary'\)\}/);
  assert.match(detail, /e\.key === 'Escape' && screen === 'summary'/, 'Escape on the map closes its own windows, not the page');
  assert.equal(mapStrings('he').dreamMapLink, 'מפת החלום');
  assert.equal(mapStrings('he').summaryLink, 'סיכום והתבוננות');
  assert.equal(mapStrings('en').summaryLink, 'Summary and reflection');
});

test('the saved map is read-only: drawn from the saved journey, nothing asked of DARE, nothing spent', () => {
  const page = read('src/map/SavedDreamMap.tsx');
  assert.doesNotMatch(page, /explorationEngine|paidFetch|fetch\(|\/api\//);
  assert.match(page, /archive=\{\{ summaryLabel: s\.summaryLink, onShowSummary \}\}/);
  const map = read('src/map/DreamMap.tsx');
  assert.match(map, /\{props\.archive && \(\s*<li>\s*<button type="button" className="dm-more-item" onClick=\{props\.archive\.onShowSummary\}>/);
  assert.match(map, /\{!props\.archive && \(\s*<li>\s*<button type="button" className="dm-more-item" onClick=\{\(\) => firstUnexplored/, 'no "explore another moment" in the archive');
  assert.match(map, /if \(!props\.archive\) setNotice\(s\.protoNoop\)/);
});

test('what the map needs is saved with the dream and comes back whole: moments, conversations, whole view', () => {
  let e = mapJourneyFrom('a', analysis, null);
  const id = e.moments[0].id;
  e = X.beginConversation(e, id, { role: 'dare', text: 'מה עלה?', offer: 'אולי משהו?' });
  e = X.addDreamerTurn(e, id, 'מילים שלי');
  e = X.rejectWithReply(X.addDareTurn(e, id, { role: 'dare', text: 'ועוד?', offer: 'אולי?' }), id).e;
  e = X.completeConversation(e, id);
  e = X.receiveWholeView(e, { overview: 'עלה משהו.', recurring: null, contrast: null, readings: [], closingQuestion: '', connections: [], kind: 'whole', notice: null, invite: [], takeaways: { mine: ['מילים שלי'], ideas: [] } }, X.basedOnKey(e));
  const saved = buildSavedDream({ sourceText: analysis.sourceText, inputMode: 'text', dreamAnalysis: analysis, dreamImageDataUrl: null, corrections: [], ...savedFieldsFromJourney(e), dreamReflection: { observation: 'o', personalAssociation: 'p', possibleThread: 't', continuityQuestion: 'q', lenses: { cognitive: null, jungian: null, psychodynamic: null }, confidenceNotes: [], groundingStatement: 'g' }, exploration: e });
  const back = X.parseExploration(JSON.parse(JSON.stringify(saved)).exploration)!;
  assert.equal(back.moments.length, e.moments.length);
  assert.deepEqual(back.explored[id].turns!.map((t) => [t.role, t.text, Boolean(t.rejected), Boolean(t.rejection)]), e.explored[id].turns!.map((t) => [t.role, t.text, Boolean(t.rejected), Boolean(t.rejection)]));
  assert.equal(back.wholeView?.overview, 'עלה משהו.');
  assert.deepEqual(back.wholeView?.takeaways?.mine, ['מילים שלי']);
});
