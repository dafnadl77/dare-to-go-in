import type { PatternReflectionResult } from './patternReflectionSchema.js';

/**
 * Deterministic quality gate for a generated Pattern Reflection — mirrors
 * dreamElementLabelQuality.ts's own shape-only approach exactly: nothing
 * here knows any particular word (no forbidden-word dictionary, no
 * hard-coded typo like "תמות"), it only recognises structurally-detectable
 * corruption. A wrong-but-real word used in the wrong sense (the actual
 * class of bug that motivated this) is NOT something a deterministic rule
 * can safely catch without false-flagging legitimate uncommon words — that
 * class is addressed by prompt quality instead (see
 * buildPatternReflectionSystemPrompt's "natural, idiomatic" requirements).
 * This only catches problems no legitimate reflection could ever exhibit:
 *   - repeated_char   — the same non-space character 4+ times in a row
 *     (a genuine corruption signal in any language, never natural prose).
 *   - placeholder_text — literal meta/placeholder tokens (TODO, N/A, a bare
 *     "...", stray JSON braces) leaking into prose instead of real content.
 *   - duplicate_field — two of the four fields are verbatim-identical text,
 *     which can never be legitimate (each has a distinct, required purpose).
 */
export type ReflectionProblem = 'repeated_char' | 'placeholder_text' | 'duplicate_field';

const REPEATED_CHAR = /(\S)\1{3,}/;
const PLACEHOLDER_TOKEN = /\b(TODO|TBD|N\/A)\b|\.\.\.\s*$|^\s*\.\.\.\s*$|[{}[\]]/i;

const FIELD_ORDER: (keyof PatternReflectionResult)[] = ['whatRepeats', 'possibleConnection', 'directionToExplore', 'question'];

function fieldProblems(text: string): ReflectionProblem[] {
  const problems: ReflectionProblem[] = [];
  if (REPEATED_CHAR.test(text)) problems.push('repeated_char');
  if (PLACEHOLDER_TOKEN.test(text)) problems.push('placeholder_text');
  return problems;
}

/** Every structurally-detectable problem in a candidate result, or an empty
    array when it passes. Never throws, never inspects meaning. */
export function findReflectionProblems(result: PatternReflectionResult): ReflectionProblem[] {
  const problems = new Set<ReflectionProblem>();
  for (const key of FIELD_ORDER) {
    for (const p of fieldProblems(result[key])) problems.add(p);
  }
  for (let i = 0; i < FIELD_ORDER.length; i++) {
    for (let j = i + 1; j < FIELD_ORDER.length; j++) {
      const a = result[FIELD_ORDER[i]].trim();
      const b = result[FIELD_ORDER[j]].trim();
      if (a && a === b) problems.add('duplicate_field');
    }
  }
  return [...problems];
}

/** The instruction appended for the one repair pass — names what was
    structurally wrong, never a specific word, and asks for a clean
    regeneration of the whole response (all four fields have their own
    purpose, so a partial patch risks a new duplicate). */
export function buildReflectionRepairNote(problems: ReflectionProblem[]): string {
  const reason: Record<ReflectionProblem, string> = {
    repeated_char: 'contained a corrupted, garbled run of repeated characters',
    placeholder_text: 'contained placeholder or meta text (like "...", "TODO", or stray brackets) instead of real prose',
    duplicate_field: 'repeated the exact same sentence in two different fields — each of the four fields must say something distinct',
  };
  return `\n\nREWRITE REQUIRED: your previous attempt ${problems.map((p) => reason[p]).join('; and ')}. Regenerate the entire response from scratch as natural, idiomatic, grammatically correct prose, with no corrupted words, no placeholder text, and no duplicated sentences between fields.`;
}
