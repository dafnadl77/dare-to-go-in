import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { he, en } from '../src/i18n/translations.ts';
import { collectStrings } from '../src/hero/languageIntegrity.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('post-launch copy: the moment and feelings screens speak to one person', () => {
  assert.equal(he.reflection.momentQuestion, 'איזה רגע בחלום הכי נשאר איתך?');
  assert.equal(he.reflection.emotionsTitle, 'איזו תחושה נשארה איתך מהחלום?');
  assert.equal(he.reflection.emotionsDescription, 'אפשר לבחור עד שלוש תחושות.');
});

test('post-launch copy: the closing screen reads "לא לתת לחלום להיעלם." / "לשמור על החלום" / "לשחרר אותו"', () => {
  assert.equal(he.closing.dontLetItDisappear, 'לא לתת לחלום להיעלם.');
  assert.equal(he.closing.keepThisDream, 'לשמור\nעל החלום');
  assert.equal(he.closing.letItGo, 'לשחרר אותו');
});

test('post-launch copy: no plural second-person wording is left in the dream-journey texts (opening, recording screen, picture, moment, feelings, reflection, closing)', () => {
  const plural = /(^|[^֐-׿])(אתם|שלכם|לכם|איתכם|בכם|שבחרתם|שדיברתם|שלחתם|תעזבו|בחרו|כתבו|ספרו|נסו|קחו|אשרו|לחצו|הקלידו|התחילו|אפשרו|בדקו|שחררו|תתנו|בטוחים)(?![֐-׿])/;
  // The microphone, permission and transcription messages are the recording feature's own text and were deliberately left as they were.
  const recordingMessages = new Set(['micDenied', 'micTimeout', 'liveWordsKept', 'transcriptionRateLimited', 'transcriptionTooLarge', 'transcriptionNetwork', 'retryTranscription', 'transcriptionFailed']);
  const hold = Object.fromEntries(Object.entries(he.hold).filter(([key]) => !recordingMessages.has(key)));
  for (const [name, section] of Object.entries({ hold, leaveDream: he.leaveDream, reconstruction: he.reconstruction, reflection: he.reflection, closing: he.closing })) {
    for (const text of collectStrings(section)) {
      assert.doesNotMatch(text, plural, `${name}: "${text}"`);
    }
  }
});

test('post-launch copy: the English texts of the same screens are unchanged', () => {
  assert.equal(en.reflection.momentQuestion, 'Which moment in the dream stayed with you most?');
  assert.equal(en.reflection.emotionsTitle, 'What feelings stayed with you after the dream?');
  assert.equal(en.closing.keepThisDream, 'KEEP THIS\nDREAM');
});

test('opening: the explanation sits directly under the big title, always mounted, and a short window leaves it out', () => {
  const hero = read('src/hero/HeroDream.tsx');
  assert.match(hero, /<MemoryTitle[\s\S]*?\/>\s*<HowItWorksTagline shown=\{centralMode === 'hold' && !isReconstructing && INTERACTION_PHASES\.has\(phase\) && !howOpen\} \/>\s*<DreamPrompt/);
  const css = read('src/hero/HowItWorks.css');
  assert.match(css, /\.hiw-tagline \{[^}]*position: relative;/, 'in the opening column, not floating at the bottom');
  assert.match(css, /font-size: clamp\(1\.15rem, min\(3\.4vw, 3\.1vh\), 1\.65rem\)/, 'clearly larger than the previous 1rem');
  assert.match(css, /@media \(min-width: 641px\) and \(max-height: 767px\) \{\s*\.hiw-tagline \{\s*display: none;/);
  assert.match(css, /@media \(max-width: 640px\) and \(max-height: 789px\) \{\s*\.hiw-tagline \{\s*display: none;/);
  const teaser = read('src/hero/HowItWorks.tsx');
  assert.doesNotMatch(teaser.slice(teaser.indexOf('export function HowItWorksTeaser')), /hiw-tagline/, 'the teaser keeps only the control');
});

test('recording: the code of the recorder, the microphone and the transcription is not part of this change', () => {
  const touched = ['src/hero/HoldToRemember.tsx', 'src/hero/dreamRecorderController.ts', 'src/hero/dreamTranscription.ts', 'src/hero/micAvailability.ts'];
  for (const file of touched) assert.ok(read(file).length > 0, file);
});

test('home: the Hebrew explanation has no comma before "ושואלים אותם שאלות" and the English is unchanged', () => {
  assert.equal(he.howItWorks.tagline, 'DARE TO GO IN הוא מרחב פרטי לחזור אל חלומות שנשארים: מספרים אותם, רואים אותם ושואלים אותם שאלות.');
  assert.match(en.howItWorks.tagline, /tell them, see them, and ask them questions\.$/);
});

test('home: the opening heading is bold and clearly larger, in a transform so nothing around it moves', () => {
  const css = read('src/hero/DreamPrompt.css');
  assert.match(css, /\.dream-prompt \{[^}]*font-weight: 700;/);
  assert.match(css, /\.dream-prompt\.is-revealed \{[^}]*scale\(2\.3\)/);
  assert.match(css, /\.dream-prompt\.is-revealed \{\s*transform: translateY\(-4px\) scale\(1\.6\)/);
  assert.match(css, /min-width: 641px\) and \(max-width: 1023px\) \{\s*\.dream-prompt\.is-revealed \{\s*transform: translateY\(-4px\) scale\(2\)/, 'a tablet is enlarged less, so the English heading is not cut off');
});

test('no halos: the blurred dark washes behind text, titles, buttons, links and the header are gone for good, and nothing replaces them', () => {
  assert.equal(existsSync(new URL('../src/hero/TextHalo.css', import.meta.url)), false, 'the halo stylesheet is deleted');
  assert.doesNotMatch(read('src/hero/HeroDream.tsx'), /TextHalo/, 'and no longer imported');
  const header = read('src/ui/GlobalHeader.css');
  assert.doesNotMatch(header, /\.gh-(brand|links|lang)::before/, 'no wash behind the header words');
  assert.doesNotMatch(read('src/ui/GlobalHeader.tsx'), /data-halo/);
  const hiw = read('src/hero/HowItWorks.css');
  assert.doesNotMatch(hiw, /\.hiw-(tagline|trigger)::before/, 'no wash behind the explanation or its control');
  // no pseudo-element in the app's styles is a blurred dark smudge (a blur filter on a ::before/::after that has a dark rgba background)
  for (const file of readdirSync(new URL('../src/hero/', import.meta.url)).filter((f) => f.endsWith('.css'))) {
    const css = read(`src/hero/${file}`).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]*::(?:before|after)[^{}]*)\{([^}]*)\}/g)) {
      const dark = /background:\s*rgba\(\s*(?:[0-9]|1[0-9]|2[0-9]|3[0-9])\s*,\s*(?:[0-9]|1[0-9]|2[0-9]|3[0-9])\s*,\s*(?:[0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9])\s*,\s*0?\.[3-9]/.test(m[2]);
      const blur = /(?<!backdrop-)filter:\s*blur\(/.test(m[2]);
      assert.ok(!(dark && blur), `${file}: ${m[1].trim()} is a blurred dark wash`);
    }
  }
});

test('feelings screen: the continue button is made readable from inside by a solid night-tone fill and a clearer border, with no blur, wash or shadow', () => {
  const css = read('src/hero/DreamEmotions.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = /\.de-actions \.dr-choice \{([^}]*)\}/.exec(css);
  assert.ok(rule, 'the button has its own rule');
  assert.match(rule[1], /background: rgba\(6, 8, 18, 0\.7\)/, 'an inner fill');
  assert.match(rule[1], /border-color: rgba\(244, 240, 232, 0\.85\)/, 'a clearer border');
  assert.doesNotMatch(rule[1], /blur|box-shadow|text-shadow|drop-shadow/, 'nothing soft or outside the button');
});
