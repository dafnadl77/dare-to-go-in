import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema';
import { mapJourneyFrom, mapMomentTexts } from '../src/map/journeyRecord';

/**
 * TWO MAP FAULTS (reported 2026-10-26), written BEFORE the fix:
 *  1. a dream came out as ONE long moment with its text repeated: sentences that tell the same thing were merged into one moment and
 *     every copy was pasted into it (" … "), and an English run-on ("and then … later …") was not cut into steps;
 *  2. on the map screen the top of the page could go under the site's fixed header.
 * No network, no AI.
 */

const dream = (sourceText: string) => ({ sourceText, unusualElements: [] }) as unknown as DreamAnalysis;
const read = (p: string) => readFileSync(p, 'utf8');

test('1a. a sentence told again never makes one giant moment with the text pasted again and again', () => {
  const repeated = 'חלמתי שאני עפה מעל ים כחול ועצום, ואור זהוב נשפך מהאופק. '.repeat(8);
  for (const m of mapMomentTexts(dream(repeated))) {
    assert.doesNotMatch(m.text, / … /, 'no copies joined into one moment');
    assert.ok(m.text.length <= 200, `a short moment, got ${m.text.length} characters`);
  }
  const twice = 'הלכתי ברחוב והיה חושך. הלכתי ברחוב והיה קר. פגשתי את אחי בפינה. אחי צעק עליי שאני מאחרת. הלכתי ברחוב והיה חושך מאוד.';
  const texts = mapMomentTexts(dream(twice)).map((m) => m.text);
  assert.ok(texts.every((t) => !t.includes(' … ')));
  assert.ok(texts.length >= 3);
});

test('1b. a dream with several scenes gives several separate moments — also with no full stops, and in English', () => {
  const cases = [
    'הייתי בבית של סבתא שלי והיה שם חושך ואז פתאום נפתחה דלת ויצאתי לגינה והגינה הייתה מלאה בפרחים כחולים ואחר כך הגעתי לים וראיתי את אמא שלי עומדת על החוף',
    "I was in my grandmother's house and it was dark and then a door opened and I walked into a garden full of blue flowers and later I reached the sea and saw my mother on the beach and she did not recognise me",
    'I was on a train at night. Then I was suddenly in my old school and the corridors kept getting longer, and later I found my sister singing a song I did not know.',
  ];
  for (const c of cases) {
    const moments = mapMomentTexts(dream(c));
    assert.ok(moments.length >= 3, `several moments, got ${moments.length}: ${moments.map((m) => m.text).join(' | ')}`);
    for (const m of moments) {
      assert.ok(m.text.length <= 160, `no long block: ${m.text}`);
      assert.doesNotMatch(m.text, /\b(and|ו)$/i, 'a moment does not end on a dangling "and"');
    }
  }
});

test('1c. when the dream will not split by sentences, the fallback still gives 2–4 moments by its scenes and actions', () => {
  const oneLong = 'I was walking along a river, a dog followed me, the water turned red, I tried to call my brother, nobody answered';
  const moments = mapMomentTexts(dream(oneLong));
  assert.ok(moments.length >= 2 && moments.length <= 6, `got ${moments.length}`);
  const e = mapJourneyFrom('a', dream(oneLong), null);
  assert.equal(new Set(e.moments.map((m) => m.excerpt)).size, e.moments.length, 'no two moments with the same text');
});

test('1d. a moment card shows a short summary; the full moment stays in its window', () => {
  const css = read('src/map/DreamMap.css');
  const rule = css.slice(css.indexOf('.dm-card-excerpt {'), css.indexOf('}', css.indexOf('.dm-card-excerpt {')));
  assert.match(rule, /-webkit-line-clamp:\s*3/);
  assert.match(rule, /overflow:\s*hidden/);
  assert.match(read('src/map/ConversationThread.tsx'), /<blockquote>\{p\.excerpt\}<\/blockquote>/, 'the window keeps the whole moment');
});

test('2. the map screen starts below the fixed header, so nothing on it (or scrolled to on it) goes under the header', () => {
  const css = read('src/map/DreamJourneyMap.css');
  const rule = css.slice(css.indexOf('.dj-map {'), css.indexOf('}', css.indexOf('.dj-map {')));
  assert.match(rule, /top:\s*var\(--gh-h\)/, 'the scrolling box itself begins under the header');
  assert.doesNotMatch(rule, /inset:\s*0;/);
});
