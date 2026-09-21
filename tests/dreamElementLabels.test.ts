import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDreamElementLabelSystemPrompt, validateElementLabels } from '../src/hero/dreamElementLabelsSchema.ts';
import { buildLabelRepairNote, findLabelProblems, normalizeLabel } from '../src/hero/dreamElementLabelQuality.ts';

test('the label prompt forbids transliteration/coined forms in both UI languages', () => {
  for (const [lang, name] of [['he', 'Hebrew'], ['en', 'English']] as const) {
    const prompt = buildDreamElementLabelSystemPrompt(lang);
    assert.match(prompt, new RegExp(`natural, everyday ${name}`));
    assert.match(prompt, /NEVER transliterate/);
    assert.match(prompt, /NEVER invent an adjective/);
    assert.match(prompt, /plain, common words|plain \w+\./);
    assert.match(prompt, /Keep each label SHORT/);
  }
});

test('the label prompt targets the requested language and keeps the meaning rule', () => {
  assert.match(buildDreamElementLabelSystemPrompt('he'), /Always output Hebrew/);
  assert.match(buildDreamElementLabelSystemPrompt('en'), /Always output English/);
  assert.match(buildDreamElementLabelSystemPrompt('he'), /Preserve the actual meaning faithfully/);
});

test('a Hebrew label built with a coined -יאני ending is flagged (the live "יוגיאני" failure)', () => {
  assert.deepEqual(findLabelProblems('יוגיאני', 'he'), ['coined_suffix']);
  assert.deepEqual(findLabelProblems('דמות יוגיאנית', 'he'), ['coined_suffix']);
  assert.deepEqual(findLabelProblems('מסכים אורווליאנים', 'he'), ['coined_suffix']);
});

test('natural Hebrew labels pass', () => {
  for (const label of ['מדברת עם בעלי החיים', 'ג׳ונגל באפריקה', 'תנוחת יוגה', 'מורה ליוגה', 'דלת כחולה', 'אמא עם אקדח', 'יוגי', 'ארמון עם חצר']) {
    assert.deepEqual(findLabelProblems(label, 'he'), [], label);
  }
});

test('wrong script is flagged in either language (mixed-script labels never reach the screen)', () => {
  assert.deepEqual(findLabelProblems('שaman', 'he'), ['wrong_script']);
  assert.deepEqual(findLabelProblems('ע stance יוגי', 'he'), ['wrong_script']);
  assert.deepEqual(findLabelProblems('YOGA מורה', 'en'), ['wrong_script']);
  assert.deepEqual(findLabelProblems('TALKING TO THE ANIMALS', 'en'), []);
  assert.deepEqual(findLabelProblems('Blue door', 'en'), []);
});

test('an over-long label is flagged', () => {
  assert.deepEqual(findLabelProblems('a very long label that keeps going on and on', 'en'), ['too_long']);
});

test('normalizeLabel trims, collapses whitespace and strips wrapping quotes / trailing punctuation', () => {
  assert.equal(normalizeLabel('  "דלת   כחולה." '), 'דלת כחולה');
  assert.equal(normalizeLabel('BLUE DOOR!'), 'BLUE DOOR');
  assert.equal(normalizeLabel('…'), '');
});

test('the repair note names each rejected item and asks for plain wording without naming any word', () => {
  const note = buildLabelRepairNote([{ position: 2, phrase: 'a yogic figure', label: 'דמות יוגיאנית', problems: ['coined_suffix'] }], 'he');
  assert.match(note, /2\. "a yogic figure"/);
  assert.match(note, /rejected/);
  assert.match(note, /plain, common Hebrew words/);
  assert.match(note, /Do not transliterate/);
});

test('validateElementLabels still requires exactly one non-empty string label per element', () => {
  assert.deepEqual(validateElementLabels({ labels: ['a', 'b'] }, 2), ['a', 'b']);
  assert.equal(validateElementLabels({ labels: ['a'] }, 2), null);
  assert.equal(validateElementLabels({ labels: ['a', ' '] }, 2), null);
  assert.equal(validateElementLabels(null, 1), null);
});
