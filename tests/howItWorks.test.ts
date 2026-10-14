import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { en, he } from '../src/i18n/translations.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('how it works: six steps in both languages, in the order of the real journey', () => {
  for (const t of [en, he]) {
    assert.equal(t.howItWorks.steps.length, 6);
    for (const s of t.howItWorks.steps) assert.ok(s.title.length > 3 && s.text.length > 8);
  }
  // tell, see, moment, feeling, meaning, save (the feelings step sits between the moment and the reflection)
  assert.match(en.howItWorks.steps[0].title, /Tell/);
  assert.match(en.howItWorks.steps[2].title, /moment/i);
  assert.match(en.howItWorks.steps[3].title, /feeling/i);
  assert.match(en.howItWorks.steps[4].title, /meaning/i);
  assert.match(en.howItWorks.steps[5].title, /Save/);
  assert.match(he.howItWorks.steps[3].title, /תחושה/);
});

test('how it works: nothing promised that the product does not do', () => {
  const all = JSON.stringify([en.howItWorks, he.howItWorks]);
  assert.doesNotMatch(all, /PDF|unlimited|ללא הגבלה|מדעי|clinical|diagnos(is|e)s? you/i);
  // The feelings step says it is optional and capped, exactly like the step itself.
  assert.match(en.howItWorks.steps[3].text, /up to three/);
  assert.match(en.howItWorks.steps[3].text, /skip/);
  assert.match(he.howItWorks.steps[3].text, /שלוש/);
  assert.match(he.howItWorks.steps[3].text, /לדלג/);
});

test('how it works: the Hebrew has no stray Latin words (apart from the brand name) and the English no Hebrew', () => {
  const values = (o: unknown): string[] => (typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(values) : []);
  const heText = values(he.howItWorks).join(' ').replace(/DARE TO GO IN/g, '');
  assert.doesNotMatch(heText, /[A-Za-z]{3,}/);
  assert.doesNotMatch(values(en.howItWorks).join(' '), /[֐-׿]/);
});

test('how it works: shown only on the idle opening screen, never inside the journey, and the opening underneath is made inert while it is open', () => {
  const hero = read('src/hero/HeroDream.tsx');
  assert.match(hero, /centralMode === 'hold' && !isReconstructing && INTERACTION_PHASES\.has\(phase\) && !howOpen && <HowItWorksTeaser/);
  assert.match(hero, /className="hero-ui-layer" inert=\{howOpen\}/);
  assert.match(hero, /setHowOpen\(false\);\n\s+setReconstructionPhase\('none'\)/, 'going home closes the section');
  const panel = read('src/hero/HowItWorks.tsx');
  assert.match(panel, /role="dialog" aria-modal="true"/);
  assert.match(panel, /e\.key === 'Escape'/);
  assert.match(panel, /href=\{language === 'he' \? '\/faq\/' : '\/en\/faq\/'\}/);
});
