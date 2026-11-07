import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openingFits, type FitBox } from '../src/hero/useOpeningFit.ts';

/**
 * The opening scrolls only when it does not fit (2026-11-07). The real windows (desktop and phone emulation, Hebrew and English) were run on the
 * built page; these pin the rule and the CSS.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const box = (name: string, top: number, bottom: number, left = 100, right = 300): FitBox => ({ name, top, bottom, left, right });

test('it fits: nothing overlaps, everything is on the screen, nothing is hidden', () => {
  const column = [box('title', 80, 150), box('tagline', 160, 220), box('prompt', 230, 260), box('circle', 250, 430), box('type', 470, 510), box('how', 530, 560), box('footer0', 600, 620)];
  assert.equal(openingFits(column, 700, []), true, 'the round circle touching the question in its square box never counts');
});

test('it does not fit: an overlap, a control out of the window, or a control the layout hides', () => {
  assert.equal(openingFits([box('type', 470, 510), box('footer0', 500, 520)], 700, []), false, 'the footer over the typing button');
  assert.equal(openingFits([box('tagline', 100, 200), box('how', 150, 180)], 700, []), false);
  assert.equal(openingFits([box('type', 690, 730)], 700, []), false, 'below the window');
  assert.equal(openingFits([box('type', 470, 510)], 700, ['how']), false, 'a low window hides "How it works"');
  assert.equal(openingFits([box('footer0', 600, 620), box('footer1', 610, 630)], 700, []), true, 'the footer’s own lines are one block');
});

test('only in scroll mode: below the header, the footer and "How it works" in the page, and a swipe on the circle scrolls', () => {
  const css = read('src/hero/HeroDream.css');
  const block = css.slice(css.indexOf('/* THE OPENING SCROLLS ONLY WHEN IT DOES NOT FIT'));
  assert.ok(block.length > 100);
  const selectors = [...block.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g)].flatMap((m) => m[1].split(',')).map((s) => s.trim()).filter(Boolean);
  assert.ok(selectors.length >= 6);
  for (const s of selectors) assert.match(s, /^\.hero-dream\.is-scroll-fit /, `every rule applies only in scroll mode: ${s}`);
  assert.match(block, /\.hero-ui-layer \{\s*top: var\(--hero-fit-top, 4rem\);\s*overflow-y: auto;/);
  assert.match(block, /\.htr-circle \{\s*touch-action: pan-y;\s*\}/);
  assert.doesNotMatch(block, /footer-credit|display:\s*none/, 'the credit line and the legal links stay');
  const hero = read('src/hero/HeroDream.tsx');
  assert.match(hero, /const fit = useOpeningFit\(openingShown, language\);/);
  assert.match(hero, /\{fit\.scroll && \(\s*<div className="hero-fit-end">\s*\{teaser\}\s*\{footer\}\s*<\/div>\s*\)\}/);
  assert.match(hero, /\{!fit\.scroll && footer\}/);
  assert.match(hero, /\{!fit\.scroll && teaser\}/);
  assert.match(read('src/hero/HoldToRemember.tsx'), /onPointerCancel=\{endHold\}/, 'a swipe the browser takes releases the press');
});

test('a short phone: "How it works" moves down from the header only into free space, and by exactly what is missing', async () => {
  const { teaserDrop, HEADER_GAP_PX } = await import('../src/hero/typeLinkClearance.ts');
  assert.equal(teaserDrop({ headerBottom: 99, howTop: 95, howBottom: 122, nextTop: 139 }), 4 + HEADER_GAP_PX, 'four pixels under the header: down by six');
  assert.equal(teaserDrop({ headerBottom: 90, howTop: 95, howBottom: 122, nextTop: 139 }), 0, 'already clear');
  assert.equal(teaserDrop({ headerBottom: 120, howTop: 95, howBottom: 122, nextTop: 139 }), 0, 'no room for it: it stays, and the opening scrolls instead');
  const css = read('src/hero/HowItWorks.css');
  assert.match(css, /\.hiw-teaser \{[^}]*margin-top: var\(--hiw-teaser-drop, 0px\);/);
});

test('the decision is taken in the browser’s callbacks, before paint, never in an effect body; the column stays centred when it scrolls', () => {
  const hook = read('src/hero/useOpeningFit.ts');
  assert.match(hook, /const observer = new ResizeObserver\(judge\);/);
  assert.match(hook, /flushSync\(\(\) => setFit\(/);
  const block = read('src/hero/HeroDream.css').slice(read('src/hero/HeroDream.css').indexOf('/* THE OPENING SCROLLS ONLY WHEN IT DOES NOT FIT'));
  assert.doesNotMatch(block, /justify-content/, 'the column keeps its own centring');
});
