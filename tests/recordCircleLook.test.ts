import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The recording circle's NEW LOOK (a thin bright round frame with a pearl-grey round button in its centre) and the new reading style of the explanation under
 * the title. Both are CSS only: nothing about how the recording works may change, so this also pins that the look is drawn in a style sheet that holds
 * no behaviour and that the recording component keeps the very same structure and event wiring.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const plates = strip(read('src/hero/ReadablePlates.css'));
const rule = (css: string, selector: string) => {
  const start = css.indexOf(`\n${selector} {`);
  const m = start < 0 ? null : /\{([^}]*)\}/.exec(css.slice(start));
  assert.ok(m, `${selector} exists`);
  return m[1];
};

test('the ring is a thin, bright, perfectly round frame; the circle is a round shape with a translucent inside', () => {
  assert.match(rule(plates, '.htr-circle .htr-ring-track'), /stroke: rgba\(244, 240, 232, 0\.62\)/);
  assert.match(rule(plates, '.htr-circle:hover .htr-ring-track'), /stroke: rgba\(244, 240, 232, 0\.9\)/, 'brighter, never dimmer, on hover');
  const own = strip(read('src/hero/HoldToRemember.css'));
  const circle = /\n\.htr-circle \{([^}]*)\}/.exec(own);
  assert.ok(circle);
  assert.match(circle[1], /width: 128px;\s*height: 128px;/, 'same width and height');
  assert.match(circle[1], /border-radius: 50%/);
  assert.match(circle[1], /background: radial-gradient\(circle, rgba\(244, 240, 232, 0\.07\) 0%, transparent 72%\)/, 'translucent inside');
});

test('the centre is a light pearl-grey, perfectly round disc behind the existing words, in the same proportion at every size, and it cannot catch a tap', () => {
  const disc = rule(plates, '.htr-label::before');
  assert.match(disc, /border-radius: 50%/);
  assert.match(disc, /width: 81px;\s*height: 81px;/, 'a square box with a 50% radius is a circle');
  assert.match(disc, /background: rgba\(205, 209, 211, 0\.65\)/, 'light neutral pearl grey, no blue or violet');
  assert.ok(Math.max(205, 209, 211) - Math.min(205, 209, 211) < 10, 'a neutral grey');
  // the words on it are a dark neutral grey with no glow; worst case (pearl at 65% over pure black = about #858889) the contrast is still above 4.5:1
  const label = rule(plates, '.htr-circle .htr-label');
  assert.match(label, /color: #121416/);
  assert.match(label, /text-shadow: none/);
  const lum = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = (r: number, g: number, b: number) => 0.2126 * lum(r) + 0.7152 * lum(g) + 0.0722 * lum(b);
  const worst = L(205 * 0.65, 209 * 0.65, 211 * 0.65);
  assert.ok((worst + 0.05) / (L(0x12, 0x14, 0x16) + 0.05) >= 4.5, 'readable over the darkest video frame');
  assert.match(disc, /pointer-events: none/);
  assert.match(disc, /z-index: -1/, 'behind the words');
  assert.doesNotMatch(disc, /box-shadow|filter|blur/, 'flat, no glow');
  // 81px x 1.11 (the label's own scale) = 90px = 4/5 of the 112px ring
  assert.ok(Math.abs((81 * 1.11) / 112 - 0.8) < 0.01);
  // while the microphone is being requested the label also has the privacy note: the plate hugs it instead
  assert.match(plates, /\.htr-label:has\(\.htr-privacy-note\)::before \{[^}]*border-radius: 18px/);
  // no new element, icon or text
  assert.doesNotMatch(plates, /content: '[^']+'/, 'no text or icon added through CSS');
});

test('the recording component and its style sheet are not part of this change: same structure, same events, same files', () => {
  const tsx = read('src/hero/HoldToRemember.tsx');
  assert.match(tsx, /onPointerDown=\{\(e\) => \{\s*e\.preventDefault\(\);\s*beginHold\(\);\s*\}\}/);
  assert.match(tsx, /onPointerUp=\{endHold\}/);
  assert.match(tsx, /onPointerLeave=\{endHold\}/);
  assert.match(tsx, /onPointerCancel=\{endHold\}/);
  assert.match(tsx, /<span className="htr-label">/);
  assert.match(tsx, /<svg className="htr-ring"/);
  // the disc is only in ReadablePlates.css (imported by HeroDream.tsx before this change too)
  assert.doesNotMatch(read('src/hero/HoldToRemember.css'), /htr-label::before/);
  assert.match(read('src/hero/HeroDream.tsx'), /import '\.\/ReadablePlates\.css';/);
});

test('the explanation: bold, white, a very light tight shadow; 18px on phones; desktop and tablet keep their size', () => {
  const css = strip(read('src/hero/HowItWorks.css'));
  const base = /\n\.hiw-tagline \{([^}]*)\}/.exec(css);
  assert.ok(base);
  assert.match(base[1], /font-size: clamp\(1\.15rem, min\(3\.4vw, 3\.1vh\), 1\.65rem\)/, 'the size on desktop and tablet is unchanged');
  assert.match(base[1], /font-weight: 600/);
  assert.match(base[1], /color: #fff/);
  assert.match(base[1], /text-shadow: 0 1px 2px rgba\(2, 8, 28, 0\.55\)/, 'tight, no blur cloud');
  const phone = /@media \(max-width: 640px\) \{[\s\S]*?\.hiw-tagline \{([^}]*)\}/.exec(css);
  assert.match(phone![1], /font-size: 1\.125rem/);
  assert.match(phone![1], /font-weight: 700/);
});
