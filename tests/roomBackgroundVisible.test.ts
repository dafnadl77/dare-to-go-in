import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * THE ROOM STAYS VISIBLE (2026-10-29). Dafna saw a near-black background on a computer while recording and before the dream's picture.
 * It was not reproduced: in a visible browser (her own Chrome, a real microphone on the live site, and the local journey up to the
 * picture) the room video, its veil canvas and every layer above them were measured, and the room stayed visible at every stage.
 * These checks keep that state: what hides the room, darkens it or covers it is exactly the approved, known set, and nothing new can
 * cover it during recording, typing or the wait. No browser, no network, no cost.
 */

const read = (p: string) => readFileSync(p, 'utf8');
const cssFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : [];
  });
const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const allCss = cssFiles('src').map((p) => ({ p: p.replace(/\\/g, '/'), css: noComments(read(p)) }));
/** Every rule (selector + body) in the app's stylesheets whose selector names the class. */
const rulesFor = (cls: string) =>
  allCss.flatMap(({ p, css }) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].includes(cls)).map((m) => ({ p, selector: m[1].trim(), body: m[2] })));

test('the room\'s own layers (video, veil canvas, vignette) are hidden in one place only: under the dream stage, after the picture', () => {
  for (const cls of ['.dream-video', '.memory-veil', '.hero-vignette']) {
    const hiding = rulesFor(cls).filter((r) => /visibility:\s*hidden|display:\s*none|opacity:\s*0(?![.\d])/.test(r.body));
    assert.deepEqual(
      hiding.map((r) => r.p),
      ['src/ui/mobileRendering.css'],
      `${cls} is hidden only by the dream-stage rule`,
    );
    assert.match(hiding[0].selector, /\.hero-dream:has\(\.dream-stage-bg-layer\[data-active='true'\]\)/);
  }
  // the dream stage (the clouds) exists only once the dreamer goes into the picture, and is active only inside it
  assert.match(read('src/hero/DreamReconstruction.tsx'), /\{\(phase === 'entering' \|\| phase === 'inside'\) && <DreamStageBackground ref=\{bgVideoRef\} active=\{phase === 'inside'\} \/>\}/);
});

test('the opening black layer fades once and nothing brings it back', () => {
  const hero = read('src/hero/HeroDream.tsx');
  assert.match(hero, /blackVeilRef\.current\?\.classList\.add\('is-fading'\)/);
  assert.doesNotMatch(hero, /classList\.(remove|toggle)\('is-fading'\)/);
  assert.equal((hero.match(/blackVeilRef/g) ?? []).length, 3, 'declared, faded, rendered: no other use');
  assert.match(read('src/hero/HeroDream.css'), /\.intro-black-veil\.is-fading \{\s*opacity: 0;\s*\}/);
});

test('the veil canvas draws the room video itself and is never filled black by the app', () => {
  const veil = read('src/hero/MemoryVeil.tsx');
  assert.match(veil, /drawVideoLoopFrame\(ctx2, loopFrame, canvas!\.width, canvas!\.height\)/);
  assert.doesNotMatch(veil, /fillStyle = ['"](#000|black|rgb\(0, ?0, ?0\))['"]/);
  // an invalid momentary size never shrinks (and so blanks) the canvas
  assert.match(veil, /if \(!isValidViewportSize\(newVw, newVh\)\) return;/);
});

test('recording, typing and the transcript sit on no full-screen background', () => {
  for (const cls of ['.central-recording', '.central-transcribing', '.central-typing', '.central-settled', '.hero-ui-layer', '.hero-ui-stack']) {
    for (const r of rulesFor(cls)) {
      if (!r.selector.split(',').some((s) => s.trim().endsWith(cls) || s.includes(`${cls}.`) || s.includes(`${cls}:`))) continue;
      assert.doesNotMatch(r.body, /(^|\s|;)background(-color)?:\s*(?!transparent|none)/, `${cls} in ${r.p} has no background`);
      assert.doesNotMatch(r.body, /backdrop-filter:\s*(?!none)/, `${cls} in ${r.p} has no backdrop filter`);
    }
  }
});

test('the wait for the picture: the room is clear while waiting; only the approved short dissolve dims it, and never to black', () => {
  const css = noComments(read('src/hero/DreamReconstruction.css'));
  // the base veil is invisible; while the picture is being made ("היזכרות…") it lifts again
  assert.match(css, /\.dr-blur-veil \{\s*position: absolute;\s*inset: 0;\s*opacity: 0;/);
  assert.match(css, /\.is-phase-reconstructing \.dr-blur-veil \{\s*opacity: 0;/);
  // the approved dissolve (about 8 seconds): a soft blur and dimming of the live room, not a black fill
  const dissolve = css.match(/\.is-phase-dissolving \.dr-blur-veil,\s*\.is-phase-fragments \.dr-blur-veil,\s*\.is-phase-image-error \.dr-blur-veil \{([^}]*)\}/)?.[1] ?? '';
  assert.match(dissolve, /background: rgba\(4, 5, 4, 0\.24\);/);
  assert.match(dissolve, /backdrop-filter: blur\(18px\) contrast\(0\.78\) brightness\(0\.6\) saturate\(0\.5\);/);
  const hero = read('src/hero/HeroDream.tsx');
  assert.match(hero, /const DISSOLVE_MS = 4200;/);
  assert.match(hero, /const FRAGMENTS_MS = 3600;/);
  // the room's own cycle keeps running during the open-ended wait
  assert.match(hero, /schedulerPausedRef\.current = reconstructionPhase !== 'none' && reconstructionPhase !== 'reconstructing';/);
});

test('no stylesheet puts a new full-screen dark layer over the room during the journey', () => {
  const darkFill = /background(-color)?:\s*(var\(--dream-black\)|#0[0-9a-f]{2,5}\b|rgba?\(\s*\d{1,2},\s*\d{1,2},\s*\d{1,2}(,\s*(0\.[5-9]\d*|1))?\s*\))/;
  const fixedDark = allCss
    .filter(({ p }) => p.startsWith('src/hero/'))
    .flatMap(({ p, css }) =>
      [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((m) => /position:\s*fixed/.test(m[2]) && /inset:\s*0/.test(m[2]) && darkFill.test(m[2]))
        .map((m) => `${p} ${m[1].trim()}`),
    )
    .sort();
  // each is known and approved: two behind the room, the opening layer that fades once, and two that open only on request
  assert.deepEqual(fixedDark, [
    'src/hero/DreamAnalysisDevView.css .dev-view', // the development panel, only with ?debug=1
    'src/hero/DreamVideo.css .dream-video', // the video element itself, behind its own picture
    'src/hero/HeroDream.css .hero-dream', // the screen, behind everything
    'src/hero/HeroDream.css .intro-black-veil', // the opening, faded once (checked above)
    'src/hero/HowItWorks.css .hiw', // "איך זה עובד", only while she opened it
  ]);
  const hero = read('src/hero/HeroDream.tsx');
  assert.match(hero, /\{debugMode && \(\s*<DreamAnalysisDevView/);
  assert.match(hero, /\{howOpen && \(/);
});
