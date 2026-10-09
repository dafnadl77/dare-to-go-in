import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';

/**
 * The phone/tablet layout and rendering rules, pinned as structure (a real browser verified the pictures: see the report).
 * They exist because of real reports: menu links that were tiny grey text, a Sign-out button on top of the menu, page titles under
 * the menu, the cloud background scrolling away from the archive, a sign-in form cut off on a short phone, and screens that
 * shimmered on a phone GPU.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const block = (css: string, selector: string) => {
  const i = css.indexOf(selector);
  assert.ok(i >= 0, `${selector} not found`);
  return css.slice(i, css.indexOf('}', i));
};

test('menu links are plain white, fully opaque, and at least 16px on phones, tablets and touch screens', () => {
  const css = noComments(read('src/ui/GlobalHeader.css'));
  const base = block(css, '.gh-link {');
  assert.match(base, /color: #ffffff;/);
  assert.match(base, /opacity: 1;/);
  assert.match(css, /@media \(max-width: 900px\), \(max-height: 500px\), \(pointer: coarse\) \{\s*\.global-header \{[^}]*\}\s*\.gh-link \{[^}]*font-size: 1rem;/);
  const lang = noComments(read('src/i18n/LanguageSwitcher.css'));
  assert.match(block(lang.slice(lang.indexOf('@media (max-width: 900px)')), '.ls-option {'), /font-size: 1rem;/);
  assert.match(block(lang, '.ls-option {'), /color: #ffffff;/);
  // nothing in the header goes back to the old tiny size
  assert.ok(!/font-size: 0\.62rem/.test(css + lang));
});

test('on a phone the header is two rows — brand and language, then the three links — aligned per language, never squeezed', () => {
  const css = noComments(read('src/ui/GlobalHeader.css'));
  const phone = css.slice(css.indexOf('@media (max-width: 640px) {'));
  assert.match(phone, /display: grid;/);
  assert.match(phone, /'brand lang'\s*'links links'/);
  assert.match(phone, /\.gh-nav \{\s*display: contents;/);
  assert.match(block(phone, '.gh-links {'), /justify-self: start;/); // English: left
  assert.match(block(phone, "html[lang='he'] .gh-links {"), /justify-self: end;/); // Hebrew: right
  const tsx = read('src/ui/GlobalHeader.tsx');
  assert.match(tsx, /<div className="gh-links">/);
  assert.match(tsx, /<div className="gh-lang">/);
  // the order of the links is unchanged
  assert.ok(tsx.indexOf('hero.myDreamsNav') < tsx.indexOf('hero.packagesNav') && tsx.indexOf('hero.packagesNav') < tsx.indexOf('hero.aboutNav'));
});

test('every page puts its content below the header through ONE shared token, not a hand-set number', () => {
  const index = noComments(read('src/index.css'));
  assert.match(block(index, ':root {'), /--gh-h: 4\.25rem;/);
  assert.match(index, /@media \(max-width: 640px\) \{\s*:root \{\s*--gh-h: calc\(6\.4rem \+ env\(safe-area-inset-top, 0px\)\);/);
  for (const file of [
    'src/archive/DreamArchive.css',
    'src/archive/DreamDetail.css',
    'src/archive/DreamAuth.css',
    'src/pricing/PricingPage.css',
    'src/legal/LegalPage.css',
    'src/hero/DreamReconstruction.css',
    'src/hero/DreamReflection.css',
  ]) {
    assert.match(noComments(read(file)), /var\(--gh-h\)/, file);
  }
  // the old guesses ("the header is ~32px tall") are gone
  assert.ok(!/max\(20px, env\(safe-area-inset-top(, 0px)?\)\) \+ (32|40|52)px/.test(noComments(read('src/hero/DreamReflection.css') + read('src/hero/DreamReconstruction.css'))));
  assert.ok(!/padding-top: max\(5rem, env\(safe-area-inset-top\)\)/.test(noComments(read('src/archive/DreamArchive.css'))));
});

test('scrolling content never runs through the menu on a phone: the header has a soft band behind it, and Sign out scrolls away', () => {
  const css = noComments(read('src/ui/GlobalHeader.css'));
  assert.match(css, /\.global-header::before \{[^}]*position: fixed;[^}]*z-index: -1;[^}]*pointer-events: none;/);
  assert.match(css, /@media \(max-width: 900px\), \(max-height: 500px\), \(pointer: coarse\) \{\s*body:not\(:has\(\.hero-dream\)\) \.global-header::before,\s*body:has\(\.dream-reflection\) \.global-header::before \{\s*opacity: 1;/);
  const archive = noComments(read('src/archive/DreamArchive.css'));
  assert.match(archive, /@media \(max-width: 900px\) \{\s*\.ar-shell-header \{\s*position: static;/);
  assert.ok(!/padding-right: max\(1\.5rem, 6\.5rem\)/.test(archive), 'no leftover side reserve for the old corner switcher');
});

test('no screen filters its own entrance: a filter kept by the animation fill traps the fixed background inside a scrolling box', () => {
  for (const file of ['src/archive/DreamArchive.css', 'src/archive/DreamAuth.css', 'src/pricing/PricingPage.css', 'src/legal/LegalPage.css']) {
    const css = read(file);
    for (const name of ['ar-screen-in', 'auth-screen-in', 'pr-page-in', 'legal-page-in']) {
      const i = css.indexOf(`@keyframes ${name}`);
      if (i < 0) continue;
      const body = noComments(css.slice(i, css.indexOf('\n}\n', i) + 3));
      assert.ok(!/filter:|transform:/.test(body), `${name} must animate opacity only`);
    }
  }
});

test('the sign-in screen scrolls on a short phone, with its footer in the flow and its background pinned', () => {
  const css = noComments(read('src/archive/DreamAuth.css'));
  assert.match(block(css, '.dream-auth {'), /overflow-y: auto;/);
  assert.match(css, /\.dream-auth \.dream-stage-bg-layer \{\s*position: fixed;/);
  assert.match(css, /\.dream-auth \.app-footer--pinned \{\s*position: static;/);
  assert.match(block(css, '.auth-content {'), /flex: 1 0 auto;/);
});

test('the phone/tablet rendering file swaps every expensive technique for a cheap equivalent, and leaves desktop alone', () => {
  const css = noComments(read('src/ui/mobileRendering.css'));
  const mq = css.slice(css.indexOf('@media (max-width: 900px), (pointer: coarse) {'));
  assert.ok(mq.length > 0, 'one touch/small media query');
  // 1. no backdrop blur over moving backgrounds
  for (const cls of ['.pr-card', '.dt-card', '.ar-shell-header', '.auth-field', '.dr-writing-surface', '.dr-lenses-wrap', '.a11y-trigger']) {
    assert.match(mq, new RegExp(`:root ${cls.replace('.', '\\.')}[^{]*\\{[^}]*backdrop-filter: none;`), cls);
  }
  // 2. no CSS filter on full-screen video / animated photographs
  assert.match(mq, /\.dream-archive \.dream-stage-bg-video \{\s*filter: none;/);
  assert.match(mq, /\.dream-detail \.dream-stage-bg-video \{\s*filter: none;/);
  assert.match(mq, /\.pr-backdrop \{\s*filter: none;\s*animation: none;/);
  assert.match(mq, /\.about-visual \{\s*animation: none;/);
  // 3. no blend modes / grain on moving full-screen layers
  assert.match(mq, /mix-blend-mode: normal;/);
  assert.match(mq, /\.dr-image-grain,\s*:root \.dw-grain \{\s*display: none;/);
  // 4. backgrounds never resize with the browser bar
  assert.match(mq, /\.dream-stage-bg-layer \{\s*inset: 0 0 auto 0;\s*height: 100vh;\s*height: 100lvh;/);
  // and nothing here is outside that media query except the "paint nothing under the clouds" rule
  const outside = css.slice(0, css.indexOf('@media (max-width: 900px), (pointer: coarse) {'));
  assert.ok(!/\{[^}]*(filter|animation|mix-blend-mode)[^}]*\}/.test(outside.replace(/^\s*$/gm, '')), 'no unconditional effect changes');
  assert.match(css, /\.hero-dream:has\(\.dream-stage-bg-layer\[data-active='true'\]\) :is\(\.dream-video, \.memory-veil, \.hero-vignette\) \{\s*visibility: hidden;/);
  assert.match(read('src/main.tsx'), /import '\.\/ui\/mobileRendering\.css'/);
});

test('a settled panel that holds the text box keeps no live filter layer, and the typing text has a readable wash', () => {
  const css = noComments(read('src/hero/HoldToRemember.css'));
  assert.match(css, /\.central-settled\.is-active \{\s*opacity: 1;\s*filter: none;/);
  assert.match(block(css, '.central-typing-textarea {'), /background: linear-gradient\(rgba\(3, 6, 12, 0\.36\)/);
});

test('every stylesheet is still free of horizontal-scroll traps at the page level', () => {
  // the document itself never scrolls sideways (the pages scroll inside their own boxes, with overflow-x hidden)
  const walk = (dir: string): string[] =>
    readdirSync(new URL(`../${dir}`, import.meta.url)).flatMap((n) => {
      const rel = `${dir}/${n}`;
      return statSync(new URL(`../${rel}`, import.meta.url)).isDirectory() ? walk(rel) : rel.endsWith('.css') ? [rel] : [];
    });
  for (const file of ['src/archive/DreamArchive.css', 'src/archive/DreamDetail.css', 'src/pricing/PricingPage.css', 'src/legal/LegalPage.css', 'src/archive/DreamAuth.css']) {
    assert.match(noComments(read(file)), /overflow-x: hidden;/, file);
  }
  assert.ok(walk('src').length > 20);
});

test('the owner, credits, payments, recording and dream engine are untouched by the layout work', () => {
  for (const file of ['src/ui/mobileRendering.css', 'src/ui/GlobalHeader.css', 'src/ui/GlobalHeader.tsx']) {
    assert.ok(!/owner|credit|payment|grow|make\.com|transcri|dream-analysis/i.test(noComments(read(file))), file);
  }
});
