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

test('phones: the column sits between the header and the footer and shares the height out; laptops and landscape phones make room too', () => {
  const phone = /@media \(max-width: 640px\) \{\s*\.hero-ui-stack:has\(\.hiw-tagline\) \{([\s\S]*?)\n  \}/.exec(css);
  assert.ok(phone, 'the phone block exists');
  assert.match(phone[1], /--hiw-top: calc\(var\(--gh-h, 6\.2rem\) \+ 0\.6rem\)/, 'starts just under the header (the control is at the bottom on a tall phone)');
  assert.match(phone[1], /--hiw-bottom: calc\(var\(--hiw-footer-h, 6rem\) \+ 3\.2rem\)/, 'stops above the control and the footer');
  assert.match(phone[1], /padding-top: var\(--hiw-top\)/);
  assert.match(phone[1], /padding-bottom: var\(--hiw-bottom\)/);
  // the control is under the header on a shorter phone (Hebrew under 760px tall, English under 870px): the column starts below it
  assert.match(css, /@media \(max-width: 640px\) and \(max-height: 759px\) \{\s*\.hero-ui-stack:has\(\.hiw-tagline\) \{\s*--hiw-top: calc\(var\(--gh-h, 6\.2rem\) \+ 2\.6rem\)/);
  assert.match(css, /@media \(max-width: 640px\) and \(max-height: 869px\) \{\s*html:not\(\[lang='he'\]\) \.hero-ui-stack:has\(\.hiw-tagline\) \{\s*--hiw-top: calc/);
  assert.match(css, /@media \(min-width: 641px\) and \(max-height: 767px\)[\s\S]*?\.hero-ui-stack:has\(\.hiw-tagline\)/);
  assert.match(css, /@media \(max-height: 480px\)[\s\S]*?\.hero-ui-stack:has\(\.hiw-tagline\)/);
  const tsx = read('src/hero/HowItWorks.tsx');
  assert.match(tsx, /setProperty\('--hiw-footer-h'/);
  assert.match(tsx, /removeProperty\('--hiw-footer-h'\)/);
});

test('phones: the explanation is at least 15px with a comfortable line height; the question stands clear of the circle; the order and spacing are explicit', () => {
  const tag = /@media \(max-width: 640px\) \{[\s\S]*?\.hiw-tagline \{([^}]*)\}/.exec(css);
  assert.ok(tag);
  assert.match(tag[1], /font-size: clamp\(0\.95rem, 4vw, 1\.1rem\)/, '0.95rem is 15.2px at its smallest');
  assert.match(tag[1], /line-height: 1\.5/);
  assert.match(tag[1], /max-width: 92vw/);
  // the explanation is never made smaller again in any media query
  for (const m of css.matchAll(/\.hiw-tagline \{([^}]*)\}/g)) {
    for (const fs of m[1].matchAll(/font-size: clamp\(([\d.]+)rem/g)) assert.ok(Number(fs[1]) >= 0.85 || /max-height: 480/.test(m[0]), 'no tiny size');
  }
  assert.match(css, /\.dream-prompt \{\s*margin-top: clamp\(1\.4rem, 4\.2vh, 2\.4rem\)/, 'space above the question');
  assert.match(css, /\.hold-to-remember \{\s*margin-top: clamp\(2rem, 6\.2vh, 3\.4rem\)/, 'a clear space between the question and the circle');
  // the title keeps its full size where it fits (it only becomes one line on shorter phones), and is never hidden on a phone
  assert.match(css, /@media \(max-width: 640px\) and \(max-height: 759px\) \{\s*\.hero-ui-stack:has\(\.hiw-tagline\) \.memory-title \{\s*font-size: clamp\(1\.9rem, 9vw, 2\.4rem\)/);
  assert.doesNotMatch(css.slice(0, css.indexOf('@media (max-height: 480px)')), /clip-path/, 'the title is not hidden on a phone in portrait');
});

test('the footer compaction applies to the opening only, never to the login page or any other screen', () => {
  const footerRules = [...css.matchAll(/([^{}]*\.app-footer--pinned[^{}]*)\{/g)].map((m) => m[1].trim());
  assert.ok(footerRules.length > 0);
  for (const sel of footerRules) assert.match(sel, /\.hero-dream \.app-footer--pinned/, sel);
  assert.doesNotMatch(read('src/legal/AppFooter.css'), /hiw-footer-h/, 'the shared footer is not changed');
});

test('landscape phones keep the brand for screen readers while the explanation takes its room', () => {
  const land = /@media \(max-height: 480px\) \{([\s\S]*?)\n\}\n/.exec(css);
  assert.ok(land, 'the landscape block exists');
  assert.match(land[1], /clip-path: inset\(50%\)/, 'visually hidden, not removed');
  assert.doesNotMatch(land[1], /display:\s*none/);
});

test('the "how it works" section still scrolls on small screens and holds every step', () => {
  const panel = read('src/hero/HowItWorks.css');
  assert.match(panel, /\.hiw-scroll \{[^}]*overflow-y: auto/);
  assert.equal(he.howItWorks.steps.length, 6);
  assert.equal(en.howItWorks.steps.length, 6);
});
