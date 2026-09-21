import type { AppLanguage } from './appLanguage.js';

/**
 * Deterministic quality gate for the short "angle" labels shown under the
 * generated dream (see dreamElementLabelsSchema.ts for how they are made).
 * The prompt asks for natural, short, plain labels; this catches the
 * failures the model still produces despite that, so a bad label is
 * repaired (or replaced) instead of reaching the screen:
 *   - wrong_script  — a label in the wrong writing system for the UI language
 *     (Latin letters inside a Hebrew label, e.g. "שaman", or Hebrew in an
 *     English one). Never a natural label.
 *   - coined_suffix — a Hebrew word ending in the "-יאני" pattern (יאני /
 *     יאנית / יאנים / יאניות): the shape of an adjective invented by bolting a
 *     Hebrew ending onto a foreign stem — the "יוגיאני" failure.
 *   - too_long      — more than a short label.
 * Nothing here knows any particular word; it only recognises the shapes.
 */
export type LabelProblem = 'wrong_script' | 'coined_suffix' | 'too_long';

const HEBREW_LETTER = /[\u0590-\u05FF]/;
const LATIN_LETTER = /[A-Za-z]/;
const COINED_HEBREW_SUFFIX = /יאנ(?:י|ית|ים|יות)(?![\u0590-\u05FF])/;

export const MAX_LABEL_WORDS = 6;
export const MAX_LABEL_CHARS = 50;

/** Trims, collapses whitespace and drops wrapping quotes / trailing punctuation. */
export function normalizeLabel(label: string): string {
  return label
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, '')
    .replace(/[.,;:!?…]+$/g, '')
    .trim();
}

export function findLabelProblems(label: string, language: AppLanguage): LabelProblem[] {
  const problems: LabelProblem[] = [];
  if (language === 'he' && LATIN_LETTER.test(label)) problems.push('wrong_script');
  if (language === 'en' && HEBREW_LETTER.test(label)) problems.push('wrong_script');
  if (language === 'he' && COINED_HEBREW_SUFFIX.test(label)) problems.push('coined_suffix');
  if (label.split(/\s+/).filter(Boolean).length > MAX_LABEL_WORDS || label.length > MAX_LABEL_CHARS) problems.push('too_long');
  return problems;
}

/**
 * The instruction appended for the one repair pass: names each rejected item
 * and why, and asks for plain wording. Says nothing about any specific word.
 */
export function buildLabelRepairNote(rejected: { position: number; phrase: string; label: string; problems: LabelProblem[] }[], language: AppLanguage): string {
  const targetLanguageName = language === 'he' ? 'Hebrew' : 'English';
  const reason: Record<LabelProblem, string> = {
    wrong_script: `not written in ${targetLanguageName} script`,
    coined_suffix: `an invented-sounding word, not natural ${targetLanguageName}`,
    too_long: 'too long for a short label',
  };
  const lines = rejected.map((r) => `${r.position}. "${r.phrase}" — your label "${r.label}" was rejected: ${r.problems.map((p) => reason[p]).join('; ')}`);
  return `\n\nREWRITE REQUIRED. These labels were not acceptable:\n${lines.join('\n')}\nRewrite them (and keep every other label exactly as it should be) using plain, common ${targetLanguageName} words a native speaker would really say. Do not transliterate, do not coin new word forms; describe the meaning simply instead — but keep the WHOLE meaning of the phrase, do not drop any part of it. Output the full list again, same length and order.`;
}
