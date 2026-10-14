import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const css = read('src/archive/DreamArchive.css');
const tsx = read('src/archive/DreamArchive.tsx');

/** The rem value a declaration inside one rule block of the Insights typography section sets. */
function sizeOf(selector: string): number {
  const start = css.indexOf('.ar-panel--insights');
  const block = css.slice(start);
  const at = block.indexOf(`${selector} {`);
  assert.ok(at >= 0, `rule for ${selector}`);
  const m = /font-size:\s*([\d.]+)rem/.exec(block.slice(at, at + 400));
  assert.ok(m, `font-size for ${selector}`);
  return Number(m[1]) * 16;
}

test('insights: the upgrade brief\'s typography item (body about 18px, sub-headings about 22px) holds on both Insights views', () => {
  // sub-headings: the pattern names and the reflection labels
  assert.equal(sizeOf('.ar-panel--insights .ar-insights-word'), 22);
  assert.equal(sizeOf('.ar-panel--insights .ar-reflection-label'), 22);
  // body text
  for (const s of ['.ar-insights-count', '.ar-insights-dreams', '.ar-panel-note', '.ar-subtitle', '.ar-reflection-text', '.ar-reflection-loading,\n.ar-panel--insights .ar-reflection-error']) {
    const px = sizeOf(`.ar-panel--insights ${s}`);
    assert.ok(px >= 18, `${s} is ${px}px`);
  }
  // nothing on the page stays below the 17px of the quietest note
  assert.ok(sizeOf('.ar-panel--insights .ar-reflection-note') >= 17);
});

test('insights: the dimmest grey is gone from the Insights page and nothing there is faded below full opacity', () => {
  const start = css.indexOf('INSIGHTS: the upgrade brief');
  const section = css.slice(start);
  assert.doesNotMatch(section, /warm-neutral-dim/);
  assert.doesNotMatch(section, /opacity:\s*0\.\d/);
});

test('insights: the new sizes are scoped to the two Insights views and leave My Dreams, Favorites and Settings alone', () => {
  assert.equal((tsx.match(/className="ar-panel ar-panel--insights"/g) ?? []).length, 2, 'overview and opened pattern');
  assert.match(tsx, /activeSection === 'settings' && \(\n\s+<div className="ar-panel">/);
  const start = css.indexOf('INSIGHTS: the upgrade brief');
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const section = bare.slice(bare.indexOf('.ar-panel--insights {'));
  for (const line of section.split('\n')) {
    if (/^\s*[.\w][^{}]*\{\s*$/.test(line) || /^\s*[.\w][^{}]*,\s*$/.test(line)) {
      assert.match(line, /ar-panel--insights|^html\[lang='he'\] \.ar-panel--insights/, `unscoped selector in the Insights section: ${line.trim()}`);
    }
  }
});
