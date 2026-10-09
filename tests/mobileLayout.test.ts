import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { en, he } from '../src/i18n/translations.ts';

/**
 * The phone/tablet layout and rendering rules, pinned as structure (a real browser verified the pictures: see the report).
 * They exist because of real reports: menu links that were tiny grey text, a Sign-out button on top of the menu, page titles under
 * the menu, a black band above the dream screen, the cloud background scrolling away from the archive, a sign-in form cut off on a
 * short phone, animated dots, and screens that shimmered on a phone GPU.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const block = (css: string, selector: string) => {
  const i = css.indexOf(selector);
  assert.ok(i >= 0, `${selector} not found`);
  return css.slice(i, css.indexOf('}', i));
};
const cssFiles = (dir: string): string[] =>
  readdirSync(new URL(`../${dir}`, import.meta.url)).flatMap((n) => {
    const rel = `${dir}/${n}`;
    return statSync(new URL(`../${rel}`, import.meta.url)).isDirectory() ? cssFiles(rel) : rel.endsWith('.css') ? [rel] : [];
  });

test('menu links are plain white, fully opaque, and at least 16px on phones, tablets and touch screens', () => {
  const css = noComments(read('src/ui/GlobalHeader.css'));
  const base = block(css, '.gh-link {');
  assert.match(base, /color: #ffffff;/);
  assert.match(base, /opacity: 1;/);
  assert.match(css, /@media \(max-width: 900px\), \(max-height: 500px\), \(pointer: coarse\) \{\s*\.global-header \{[^}]*\}\s*\.gh-link \{[^}]*font-size: 1rem;/);
  const lang = noComments(read('src/i18n/LanguageSwitcher.css'));
  assert.match(block(lang.slice(lang.indexOf('@media (max-width: 900px)')), '.ls-option {'), /font-size: 1rem;/);
  assert.match(block(lang, '.ls-option {'), /color: #ffffff;/);
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
  ]) {
    assert.match(noComments(read(file)), /var\(--gh-h\)/, file);
  }
  assert.ok(!/max\(20px, env\(safe-area-inset-top(, 0px)?\)\) \+ (32|40|52)px/.test(noComments(read('src/hero/DreamReflection.css') + read('src/hero/DreamReconstruction.css'))));
  assert.ok(!/padding-top: max\(5rem, env\(safe-area-inset-top\)\)/.test(noComments(read('src/archive/DreamArchive.css'))));
});

test('the dream screen: the header space is the container\'s PADDING — no margin that collapses, no negative margin, no hand-set offset', () => {
  const css = noComments(read('src/hero/DreamReconstruction.css'));
  assert.match(css, /\.dream-reconstruction:has\(\.dream-reflection\) \{[^}]*padding-top: var\(--gh-h\);/);
  assert.match(css, /\.dr-image-layer\[data-arrival='true'\] \{[^}]*margin: 0 16px;/);
  // the interpretation's own children no longer add the header height a second time
  const reflection = noComments(read('src/hero/DreamReflection.css'));
  assert.match(reflection, /\.dream-arrival\[data-step='reflecting'\] \.da-content \{\s*margin-top: 8px;/);
  assert.match(reflection, /\.dream-reflection\[data-step='interpreting'\],\s*\.dream-reflection\[data-step='reflection'\] \{\s*padding-top: 12px;/);
  for (const file of ['src/ui/GlobalHeader.css', 'src/ui/mobileRendering.css']) {
    assert.ok(!/margin(-top|-bottom)?: -\d/.test(noComments(read(file))), `${file}: no negative margins`);
  }
});

test('scrolling content never runs through the menu on a phone: a band behind the header appears ONLY while content is under it, and Sign out scrolls away', () => {
  const css = noComments(read('src/ui/GlobalHeader.css'));
  // exactly as tall as the header (it never reaches the content below it), invisible at rest
  assert.match(css, /\.global-header::before \{[^}]*position: fixed;[^}]*height: var\(--gh-h\);[^}]*z-index: -1;[^}]*pointer-events: none;[^}]*opacity: 0;/);
  assert.match(css, /@media \(max-width: 900px\), \(max-height: 500px\), \(pointer: coarse\) \{\s*\.global-header\[data-under='true'\]::before \{\s*opacity: 1;/);
  const tsx = read('src/ui/GlobalHeader.tsx');
  assert.match(tsx, /data-under=\{contentUnder \? 'true' : 'false'\}/);
  assert.match(tsx, /addEventListener\('scroll', onScroll, \{ capture: true, passive: true \}\)/);
  assert.ok(!/body:not\(:has\(\.hero-dream\)\)/.test(css), 'no always-on band over screens that are not scrolled');
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
  for (const cls of ['.pr-card', '.dt-card', '.ar-shell-header', '.auth-field', '.dr-writing-surface', '.dr-lenses-wrap', '.a11y-trigger']) {
    assert.match(mq, new RegExp(`:root ${cls.replace('.', '\\.')}[^{]*\\{[^}]*backdrop-filter: none;`), cls);
  }
  assert.match(mq, /\.dream-archive \.dream-stage-bg-video \{\s*filter: none;/);
  assert.match(mq, /\.dream-detail \.dream-stage-bg-video \{\s*filter: none;/);
  assert.match(mq, /\.pr-backdrop \{\s*filter: none;\s*animation: none;/);
  assert.match(mq, /\.about-visual \{\s*animation: none;/);
  assert.match(mq, /mix-blend-mode: normal;/);
  assert.match(mq, /\.dr-image-grain,\s*:root \.dw-grain \{\s*display: none;/);
  assert.match(mq, /\.dream-stage-bg-layer \{\s*inset: 0 0 auto 0;\s*height: 100vh;\s*height: 100lvh;/);
  const outside = css.slice(0, css.indexOf('@media (max-width: 900px), (pointer: coarse) {'));
  assert.ok(!/\{[^}]*(filter|animation|mix-blend-mode)[^}]*\}/.test(outside.replace(/^\s*$/gm, '')), 'no unconditional effect changes');
  assert.match(css, /\.hero-dream:has\(\.dream-stage-bg-layer\[data-active='true'\]\) :is\(\.dream-video, \.memory-veil, \.hero-vignette\) \{\s*visibility: hidden;/);
  assert.match(read('src/main.tsx'), /import '\.\/ui\/mobileRendering\.css'/);
});

test('no animated dots on a phone or tablet: every star / mote / sparkle / orbiting-dot / particle layer is removed, not slowed', () => {
  const css = noComments(read('src/ui/mobileRendering.css'));
  const mq = css.slice(css.indexOf('@media (max-width: 900px), (pointer: coarse) {'));
  const start = mq.indexOf(':root .dream-stage-stars');
  const group = mq.slice(start, mq.indexOf('display: none;', start));
  const removed = [
    'dream-stage-stars',
    'ar-stars',
    'dw-motes',
    'dr-image-motes',
    'dr-writing-sparks',
    'dr-node-line-spark',
    'da-choice-sparkle',
    'da-choice-trace-particle',
    'dream-portal-particles',
    'dc-portal-particles',
    'dc-saving-particles',
    'dc-breaking-particles',
  ];
  for (const cls of removed) assert.ok(group.includes(`.${cls}`), `${cls} is removed on touch`);
  // Every dot-like class that exists in any stylesheet is either removed above or is the individual dot inside a removed layer:
  // a NEW dot-like animation must be handled deliberately (this fails until it is).
  const insideRemoved = new Set(['dream-stage-star', 'ar-star', 'dw-mote', 'dr-mote', 'dr-writing-spark', 'dc-portal-particle', 'dc-saving-particle', 'dc-breaking-particle']);
  const found = new Set<string>();
  for (const file of cssFiles('src')) {
    for (const m of noComments(read(file)).matchAll(/\.([\w-]*(?:twinkle|sparkle|-stars?\b|-motes?\b|-spark\b|-sparks\b|particles?\b)[\w-]*)\s*[,{:]/g)) found.add(m[1]);
  }
  for (const raw of found) {
    const cls = raw.replace(/--[\w-]+$/, '');
    assert.ok(removed.includes(cls) || insideRemoved.has(cls), `dot-like class .${raw} is not handled for phones`);
  }
  // and none of the removed layers is re-enabled anywhere with a more specific rule
  assert.ok(!/(dream-stage-stars|ar-stars|dc-portal-particles)[^{]*\{[^}]*display: (block|flex|inline)/.test(css));
});

test('the lens formerly called "Jungian" has a clear title and a short explanation that opens only on request, in both languages', () => {
  assert.equal(he.reflection.jungian, 'פרשנות דרך סמלים ומשמעויות');
  assert.equal(he.reflection.jungianInfo, 'גישה בהשראת הפסיכולוג קרל יונג, הבוחנת סמלים ודימויים בחלום ואת המשמעות האישית האפשרית שלהם.');
  assert.equal(en.reflection.jungian, 'INTERPRETATION THROUGH SYMBOLS & MEANINGS');
  assert.match(en.reflection.jungianInfo, /inspired by the psychologist Carl Jung/);
  for (const text of [he.reflection.jungianInfo, en.reflection.jungianInfo]) {
    assert.ok(!/הוכח|מדעי|אבחנ|proof|scientific|diagnos/i.test(text), 'never presented as proof or diagnosis');
  }
  assert.ok(!/יונגיאני|JUNGIAN/.test(he.reflection.jungian + en.reflection.jungian));
  const tsx = read('src/hero/DreamReflection.tsx');
  assert.match(tsx, /aria-expanded=\{lensInfoOpen\}/);
  assert.match(tsx, /\{key === 'jungian' && lensInfoOpen && \(/);
  // the interpretation engine and the stored reflections are untouched: the lens key and the schema are still 'jungian'
  assert.match(read('src/hero/dreamReflectionSchema.ts'), /jungian: string \| null;/);
});

test('a settled panel that holds the text box keeps no live filter layer, and the typing text has a readable wash', () => {
  const css = noComments(read('src/hero/HoldToRemember.css'));
  assert.match(css, /\.central-settled\.is-active \{\s*opacity: 1;\s*filter: none;/);
  assert.match(block(css, '.central-typing-textarea {'), /background: linear-gradient\(rgba\(3, 6, 12, 0\.36\)/);
});

test('every page-level scroll box keeps overflow-x hidden (no horizontal scrolling of the page)', () => {
  for (const file of ['src/archive/DreamArchive.css', 'src/archive/DreamDetail.css', 'src/pricing/PricingPage.css', 'src/legal/LegalPage.css', 'src/archive/DreamAuth.css']) {
    assert.match(noComments(read(file)), /overflow-x: hidden;/, file);
  }
});

test('the owner, credits, payments, recording and dream engine are untouched by the layout work', () => {
  for (const file of ['src/ui/mobileRendering.css', 'src/ui/GlobalHeader.css', 'src/ui/GlobalHeader.tsx']) {
    assert.ok(!/owner|credit|payment|grow|make\.com|transcri|dream-analysis/i.test(noComments(read(file))), file);
  }
});
