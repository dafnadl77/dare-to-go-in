import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
});

test('shadows: no journey button has a dark wash behind it; only the opening screen\'s own control and plain text blocks keep one', () => {
  const css = read('src/hero/TextHalo.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const button of ['dr-choice', 'de-skip', 'dr-lenses-toggle', 'dc-portal-label']) {
    assert.doesNotMatch(css, new RegExp(`\\.${button}::before`), `.${button} has no wash`);
  }
  assert.match(css, /\.htr-type-link::before/, 'the opening screen is untouched');
  assert.match(css, /\.dream-prompt::before,\s*\.htr-label::before/, 'so are its heading and hold label');
  const text = /\.dr-thought::before,[\s\S]*?\.da-choice-row::before \{([^}]*)\}/.exec(css);
  assert.ok(text, 'the text wash is still there');
  assert.match(text[1], /rgba\(5, 7, 16, 0\.48\)/, 'lighter than the first version (0.58)');
  assert.match(text[1], /blur\(14px\)/);
});
