import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { linkPath, mapModeFor, orbitColumns, rimPoint, spokePath } from '../src/map/mapLayout.ts';
import { SYNTHETIC_DREAMS } from '../src/map/syntheticDreams.ts';
import { mapStrings } from '../src/map/mapStrings.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ---------------------------------------------------------------- layout: the number of cards comes from the dream, never a fixed four

test('orbit columns: every count from 1 to 8 places each moment exactly once, start side first and never smaller', () => {
  for (let n = 1; n <= 8; n++) {
    const { start, end } = orbitColumns(n);
    assert.deepEqual([...start, ...end], Array.from({ length: n }, (_, i) => i), `count ${n}`);
    assert.ok(start.length >= end.length && start.length - end.length <= 1, `count ${n} is balanced`);
  }
  assert.deepEqual(orbitColumns(1), { start: [0], end: [] });
  assert.deepEqual(orbitColumns(2), { start: [0], end: [1] });
  assert.deepEqual(orbitColumns(4), { start: [0, 1], end: [2, 3] });
  assert.deepEqual(orbitColumns(6), { start: [0, 1, 2], end: [3, 4, 5] });
  assert.deepEqual(orbitColumns(0), { start: [], end: [] });
});

test('a dedicated vertical path below 1024px, the orbit from 1024px', () => {
  for (const w of [360, 375, 390, 768, 1023]) assert.equal(mapModeFor(w), 'path', `${w}`);
  for (const w of [1024, 1280, 1440, 1920]) assert.equal(mapModeFor(w), 'orbit', `${w}`);
});

test('lines start on the picture rim and end exactly at the card edge (they never enter a card)', () => {
  const center = { x: 500, y: 400 };
  const rim = rimPoint(center, 200, { x: 900, y: 400 });
  assert.deepEqual(rim, { x: 700, y: 400 });
  const d = spokePath(rim, { x: 860, y: 300 });
  assert.match(d, /^M 700 400 C /);
  assert.match(d, /860 300$/);
});

test('a link between two moments goes round the picture by the shorter way, and ends at both cards', () => {
  const center = { x: 0, y: 0 };
  const d = linkPath(center, 100, { x: 300, y: -50 }, { x: 300, y: 50 });
  assert.match(d, /^M 300 -50 L /);
  assert.match(d, / A 100 100 0 0 1 /, 'a small arc, clockwise from the upper card to the lower one');
  assert.match(d, / L 300 50$/);
  const back = linkPath(center, 100, { x: 300, y: 50 }, { x: 300, y: -50 });
  assert.match(back, / A 100 100 0 0 0 /);
});

// ---------------------------------------------------------------- the synthetic data the prototype shows

test('synthetic dreams: 1, 2, 3, 5 and 6 moments, Hebrew and English, one of them charged', () => {
  const counts = SYNTHETIC_DREAMS.map((d) => d.moments.length).sort((a, b) => a - b);
  assert.deepEqual(counts, [1, 2, 3, 5, 6]);
  assert.ok(SYNTHETIC_DREAMS.some((d) => d.language === 'en'));
  assert.ok(SYNTHETIC_DREAMS.some((d) => d.sensitive));
});

test('synthetic dreams are internally consistent: every link joins two explored moments of the view that found it', () => {
  for (const dream of SYNTHETIC_DREAMS) {
    const ids = new Set(dream.moments.map((m) => m.id));
    assert.equal(ids.size, dream.moments.length, `${dream.key}: moment ids are unique`);
    assert.ok(dream.initiallyExplored.length >= 1, `${dream.key}: the map opens after at least one explored moment`);
    assert.ok(dream.initiallyExplored.every((id) => ids.has(id)));
    const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
    assert.ok(dream.wholeViews.some((v) => sameSet(v.basedOn, dream.initiallyExplored)), `${dream.key}: a whole view exists for the opening state`);
    for (const view of dream.wholeViews) {
      const based = new Set(view.basedOn);
      for (const c of view.connections) {
        assert.ok(based.has(c.from) && based.has(c.to), `${dream.key}/${c.id}: both ends explored`);
        assert.notEqual(c.from, c.to);
        assert.ok(c.basis.trim().length > 0, `${dream.key}/${c.id}: every link says what it rests on`);
      }
      assert.ok(view.readings.length <= 2, `${dream.key}: at most two readings`);
    }
    // An excerpt is a sentence taken from the dream itself, never written for the card.
    for (const m of dream.moments) {
      if (m.excerpt) assert.ok(dream.sourceText.includes(m.excerpt.replace(/\.$/, '')), `${dream.key}/${m.id}: excerpt comes from the dream text`);
    }
  }
});

test('the prototype never words a whole view or a link as a fixed symbol meaning or a diagnosis', () => {
  const banned = /מסמל|מייצג|כסמל|symboli[sz]e|represents|diagnos|אבחנ/i;
  for (const dream of SYNTHETIC_DREAMS) {
    const texts = [
      ...dream.moments.flatMap((m) => [m.insight.headline, m.insight.full]),
      ...dream.wholeViews.flatMap((v) => [v.overview, v.recurring ?? '', v.contrast ?? '', v.closingQuestion, ...v.readings.map((r) => r.reading), ...v.connections.map((c) => c.title)]),
    ];
    for (const t of texts) assert.doesNotMatch(t, banned, `${dream.key}: ${t}`);
  }
});

// ---------------------------------------------------------------- one AI picture per dream, text-only cards, no network

test('one picture per dream: every synthetic dream uses the single existing sample, and only the centre and its dialog show it', () => {
  assert.equal(new Set(SYNTHETIC_DREAMS.map((d) => d.imageSrc)).size, 1);
  const sources = readdirSync(new URL('../src/map/', import.meta.url)).filter((f) => f.endsWith('.tsx'));
  let imgCount = 0;
  for (const f of sources) imgCount += (read(`src/map/${f}`).match(/<img\b/g) ?? []).length;
  assert.equal(imgCount, 2, 'the centre picture and the enlarged view of the same picture');
  assert.doesNotMatch(read('src/map/MomentCard.tsx'), /<img\b|imageSrc|background-image/);
});

test('the prototype makes no request: no fetch, no Supabase, no image generation, no app entry', () => {
  for (const f of readdirSync(new URL('../src/map/', import.meta.url))) {
    // Code only: the comments are allowed to say what the page does NOT do.
    const code = read(`src/map/${f}`).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\bfetch\(|supabase|paidFetch|generateDreamImage|\/api\//i, f);
  }
});

test('the prototype page is not part of the production build (vite builds index.html alone)', () => {
  const config = read('vite.config.ts');
  assert.doesNotMatch(config, /dream-map-prototype|rollupOptions/);
  assert.match(read('dream-map-prototype.html'), /src\/map\/prototypeMain\.tsx/);
  assert.doesNotMatch(read('index.html'), /dream-map/);
});

test('map wording exists in both languages, and the grounding line matches the reflection one', () => {
  const he = mapStrings('he');
  const en = mapStrings('en');
  assert.deepEqual(Object.keys(he).sort(), Object.keys(en).sort());
  assert.equal(he.grounding, 'זו השתקפות, לא אבחנה או פרשנות חד-משמעית.');
  assert.equal(en.grounding, 'This is a reflection, not a diagnosis or a definitive interpretation.');
});

test('map styles: no text under 15px, and reduced motion is honoured', () => {
  const css = read('src/map/DreamMap.css');
  for (const m of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 15, `font-size ${m[1]}px`);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\[data-motion='reduced'\]/);
});
