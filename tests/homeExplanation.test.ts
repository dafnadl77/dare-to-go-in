import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { en, he } from '../src/i18n/translations.ts';

/**
 * The one-line explanation under the opening title ("DARE TO GO IN is a private space...") must be on screen at EVERY size. It used to be switched
 * off with display:none on phones shorter than 790px (870px in English), on windows under 768px tall and under 480px tall, so on most real phones
 * and laptops it never appeared. Now the opening's column makes room for it instead.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const css = read('src/hero/HowItWorks.css').replace(/\/\*[\s\S]*?\*\//g, '');

test('the approved explanation text is unchanged, in both languages', () => {
  assert.equal(he.howItWorks.tagline, 'DARE TO GO IN הוא מרחב פרטי לחזור אל חלומות שנשארים: מספרים אותם, רואים אותם ושואלים אותם שאלות.');
  assert.equal(en.howItWorks.tagline, 'DARE TO GO IN is a private space for returning to the dreams that stay: tell them, see them, and ask them questions.');
});

test('nothing hides the explanation any more: no media query sets display:none on it', () => {
  // every rule block that mentions the tagline, with its selector list
  const blocks = [...css.matchAll(/([^{}]*\.hiw-tagline[^{}]*)\{([^}]*)\}/g)];
  assert.ok(blocks.length > 0);
  for (const [, selector, body] of blocks) {
    assert.doesNotMatch(body, /display:\s*none/, `.hiw-tagline is never switched off: ${selector.trim()}`);
    assert.doesNotMatch(body, /visibility:\s*hidden[^;]*;[\s\S]*is-shown/, 'not hidden once shown');
  }
  // the hold button, its label and the typing link are not styled by this file
  assert.doesNotMatch(css, /\.htr-/, 'the recording controls are untouched');
});

test('short phones, short laptops and landscape phones each make room for it', () => {
  assert.match(css, /@media \(max-width: 640px\) and \(max-height: 789px\)[\s\S]*?\.hero-ui-stack:has\(\.hiw-tagline\)/);
  assert.match(css, /@media \(max-width: 640px\) and \(max-height: 869px\)[\s\S]*?html:not\(\[lang='he'\]\) \.hero-ui-stack:has\(\.hiw-tagline\)/);
  assert.match(css, /@media \(min-width: 641px\) and \(max-height: 767px\)[\s\S]*?\.hero-ui-stack:has\(\.hiw-tagline\)/);
  assert.match(css, /@media \(max-height: 480px\)[\s\S]*?\.hero-ui-stack:has\(\.hiw-tagline\)/);
  // the opening's column stops above the footer, using the footer's measured height
  assert.match(css, /padding-bottom: calc\(var\(--hiw-footer-h, 6rem\) \+ 0\.2rem\)/);
  const tsx = read('src/hero/HowItWorks.tsx');
  assert.match(tsx, /setProperty\('--hiw-footer-h'/);
  assert.match(tsx, /removeProperty\('--hiw-footer-h'\)/);
});

test('the footer compaction applies to the opening only, never to the login page or any other screen', () => {
  const footerRules = [...css.matchAll(/([^{}]*\.app-footer--pinned[^{}]*)\{/g)].map((m) => m[1].trim());
  assert.ok(footerRules.length > 0);
  for (const sel of footerRules) assert.match(sel, /\.hero-dream \.app-footer--pinned/, sel);
  assert.doesNotMatch(read('src/legal/AppFooter.css'), /hiw-footer-h/, 'the shared footer is not changed');
});

test('the smallest windows keep the brand in the page for screen readers while the explanation takes its room', () => {
  const tiny = /@media \(max-width: 640px\) and \(max-height: 639px\) \{([\s\S]*?)\n\}\n/.exec(css);
  assert.ok(tiny, 'the smallest-phone block exists');
  assert.match(tiny[1], /clip-path: inset\(50%\)/, 'visually hidden, not removed');
  assert.doesNotMatch(tiny[1], /display:\s*none/);
});

test('the "how it works" section still scrolls on small screens and holds every step', () => {
  const panel = read('src/hero/HowItWorks.css');
  assert.match(panel, /\.hiw-scroll \{[^}]*overflow-y: auto/);
  assert.equal(he.howItWorks.steps.length, 6);
  assert.equal(en.howItWorks.steps.length, 6);
});
