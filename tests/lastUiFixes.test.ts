import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDreamReflectionSystemPrompt } from '../src/hero/dreamReflectionSchema.ts';

/** The four last interface fixes from the phone review: a still "remembering" line, the moment choices as orderly chips, a natural closing question, and the trail on the right side. */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (css: string, selector: string) => {
  const m = new RegExp(`(?:^|\n)${selector.replace(/[.]/g, '\.')} \{([^}]*)\}`).exec(css);
  assert.ok(m, `${selector} exists`);
  return m[1];
};

test('"remembering": completely still (no animation, transition, opacity change or transform), readable on a phone, no keyframes left', () => {
  const css = noComments(read('src/hero/DreamReconstruction.css'));
  const r = rule(css, '.dr-remembering');
  assert.match(r, /animation: none;/);
  assert.match(r, /transition: none;/);
  assert.match(r, /transform: none;/);
  assert.match(r, /opacity: 1;/);
  assert.match(r, /bottom: 9svh;/, 'a stable offset that does not move with the phone address bar');
  const size = /font-size: clamp\(([\d.]+)rem,/.exec(r);
  assert.ok(size && Number(size[1]) >= 1.1, 'at least about 18px');
  assert.doesNotMatch(css, /dr-remembering-pulse/, 'the pulse is gone');
  // the other animations are untouched
  for (const keep of ['dr-fragment', 'dr-image-incoming', 'dr-water-layer']) assert.match(css, new RegExp(keep));
});

test('moment choices: an orderly wrapping row of equal chips like the feelings, no floating, no horizontal scroll, same content and logic', () => {
  const css = noComments(read('src/hero/MomentChoices.css'));
  assert.match(read('src/hero/HeroDream.tsx'), /import '\.\/MomentChoices\.css';/);
  const row = rule(css, '.da-choice-row');
  assert.match(row, /flex-wrap: wrap;/);
  assert.match(row, /justify-content: center;/);
  assert.match(row, /gap: 0\.75rem 0\.8rem;/, 'the same gaps as the feelings');
  assert.match(row, /max-width: 44rem;/);
  const chip = rule(css, '.da-choice');
  assert.match(chip, /border-radius: 999px;/);
  assert.match(chip, /min-height: 2\.75rem;/);
  assert.doesNotMatch(chip, /da-choice-float/, 'no bobbing');
  assert.match(chip, /max-width: 100%;/, 'a long label wraps inside the chip, never past the screen');
  assert.match(rule(css, '.da-choice-text'), /overflow-wrap: anywhere;/);
  assert.match(css, /\.da-choice-aura,\n\.da-choice-trace,\n\.da-choice-sparkle \{\n  display: none;/);
  // the choices and their logic are the same
  const tsx = read('src/hero/DreamReflection.tsx');
  assert.match(tsx, /onClick=\{\(\) => onSelect\(el\)\}/);
  assert.match(tsx, /disabled=\{!!selectedElement\}/);
  assert.match(tsx, /\{elements\.map\(\(el, i\) => \{/);
});

test('the closing question: simple everyday Hebrew, the dreamer\'s own words, never more than the dreamer wrote', () => {
  const he = buildDreamReflectionSystemPrompt('he', 'feminine');
  assert.match(he, /ONE short, plain sentence/);
  assert.match(he, /never write a word that a Hebrew speaker would not recognise/);
  assert.match(he, /Never say the dreamer "described", "said" or "mentioned" more than the dreamer actually wrote/);
  assert.match(he, /single word, quote that word as it is/);
  // English reflections are not touched by the Hebrew-only rule
  assert.doesNotMatch(buildDreamReflectionSystemPrompt('en', 'neutral'), /never write a word that a Hebrew speaker/);
});

test('the page trail of "all dreams" sits above the section menu on the start side, not in the content column', () => {
  const tsx = read('src/archive/DreamArchive.tsx');
  const side = tsx.indexOf('<div className="ar-side">');
  const crumb = tsx.indexOf('<Breadcrumb');
  const nav = tsx.indexOf('<nav className="ar-sidenav"');
  const main = tsx.indexOf('<main className="ar-main">');
  assert.ok(side > 0 && side < crumb && crumb < nav && nav < main, 'trail, then the menu, both before the content');
  assert.equal((tsx.match(/<Breadcrumb/g) ?? []).length, 1, 'one trail');
  const css = noComments(read('src/archive/DreamArchive.css'));
  assert.match(rule(css, '.ar-side .app-breadcrumb'), /direction: inherit;/, 'it follows the page direction (right in Hebrew)');
  // other pages keep their trail as before
  assert.match(read('src/ui/Breadcrumb.tsx'), /dir="ltr"/);
  assert.match(read('src/archive/DreamDetail.tsx'), /<Breadcrumb/);
});
