import type { AppLanguage } from './appLanguage.js';

/**
 * Language integrity for AI-generated, user-facing text — shared by every
 * generation path (reflection, element labels, dream analysis, archive
 * translation). Two halves that belong together:
 *
 * 1. INSTRUCTIONS appended to each system prompt, telling the model to keep
 *    the whole response in the required language and never switch writing
 *    system mid-sentence.
 * 2. A generic VALIDATOR that detects a clearly accidental writing-system
 *    intrusion in the model's output (e.g. Chinese characters inside a
 *    Hebrew sentence) so the caller can regenerate instead of showing it.
 *
 * The validator never edits text. It only reports. It is script-based, not
 * word-based: it knows nothing about any particular word or language pair.
 *
 * Deliberately free of any Vite/browser-only code so it can be imported
 * unchanged by both the frontend and the Node backend.
 */

/**
 * The mandatory-language block for an output that must be written in the
 * app's active language (Hebrew or English). Appended to a system prompt.
 */
export function buildLanguageIntegrityInstruction(language: AppLanguage): string {
  if (language === 'he') {
    return `LANGUAGE INTEGRITY (mandatory, applies to every string you output): write every word of your response in natural, fluent Hebrew, using only Hebrew letters. Never switch to another language or writing system in the middle of a sentence or a word, and do not insert a foreign-language word even when a concept is hard to phrase. If a word for an ordinary concept comes to mind in another language, translate it into a natural Hebrew expression instead. The only exceptions are: proper names and brand names, established terms that have no natural Hebrew equivalent (which may stay in Latin letters as they are normally written), and the dreamer's own words when you quote them exactly. This applies to every field, including strings inside arrays and nested objects. Before you answer, re-read your output and confirm that no sentence contains a word from another language.`;
  }
  return `LANGUAGE INTEGRITY (mandatory, applies to every string you output): write every word of your response in natural, fluent English. Never switch to another language or writing system in the middle of a sentence or a word, and do not insert a foreign-language word even when a concept is hard to phrase. If a word for an ordinary concept comes to mind in another language, translate it into a natural English expression instead. The only exceptions are: proper names and brand names, established terms that have no natural English equivalent, and the dreamer's own words when you quote them exactly. This applies to every field, including strings inside arrays and nested objects. Before you answer, re-read your output and confirm that no sentence contains a word from another language.`;
}

/**
 * For paths whose output language is the dream's own (dream analysis
 * mirrors whatever language the dreamer used, so there is no single
 * "active language" to name): stay in the dream's language, never mix in
 * words from unrelated writing systems.
 */
export function buildSourceLanguageIntegrityInstruction(): string {
  return `LANGUAGE INTEGRITY (mandatory, applies to every string you output): write every extracted phrase and the summary in the same language as the dream report itself (if it mixes languages, follow the dominant one). Never insert words or letters from any other language or writing system than the report itself uses, and do not add a foreign-language word even when a concept is hard to phrase. Proper names and brand names may stay as written. This applies to every field, including strings inside arrays and nested objects.`;
}

/** Appended to the system prompt when regenerating after a detected intrusion; names what was wrong so the model can avoid it. */
export function buildLanguageIntegrityRetryNote(intrusion: ScriptIntrusion): string {
  const scripts = intrusion.scripts.join(' / ');
  const chars = intrusion.samples.map((c) => JSON.stringify(c)).join(', ');
  return `\n\nCORRECTION: your previous attempt contained characters from the ${scripts} writing system (${chars}), which must not appear here — including inside a word. Regenerate the entire response from scratch, strictly following the LANGUAGE INTEGRITY rule above, using only the required language and script.`;
}

const LETTER_OR_MARK = new RegExp('[\\p{L}\\p{M}]', 'u');
const NEUTRAL = new RegExp('[\\p{Script=Common}\\p{Script=Inherited}]', 'u');

// Named scripts we can tell apart; any other letter is reported as 'Other'.
// Latin and Hebrew are here because they are the scripts the product itself
// uses; the rest are the scripts a model realistically drifts into.
const SCRIPT_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['Latin', new RegExp('\\p{Script=Latin}', 'u')],
  ['Hebrew', new RegExp('\\p{Script=Hebrew}', 'u')],
  ['Han', new RegExp('\\p{Script=Han}', 'u')],
  ['Hiragana', new RegExp('\\p{Script=Hiragana}', 'u')],
  ['Katakana', new RegExp('\\p{Script=Katakana}', 'u')],
  ['Hangul', new RegExp('\\p{Script=Hangul}', 'u')],
  ['Arabic', new RegExp('\\p{Script=Arabic}', 'u')],
  ['Cyrillic', new RegExp('\\p{Script=Cyrillic}', 'u')],
  ['Greek', new RegExp('\\p{Script=Greek}', 'u')],
  ['Thai', new RegExp('\\p{Script=Thai}', 'u')],
  ['Devanagari', new RegExp('\\p{Script=Devanagari}', 'u')],
  ['Bengali', new RegExp('\\p{Script=Bengali}', 'u')],
  ['Tamil', new RegExp('\\p{Script=Tamil}', 'u')],
  ['Georgian', new RegExp('\\p{Script=Georgian}', 'u')],
  ['Armenian', new RegExp('\\p{Script=Armenian}', 'u')],
];

/** The writing system of one character, or null for anything that is not a
    letter/mark of a specific script (digits, punctuation, symbols, emoji,
    whitespace, combining marks that inherit their base's script). */
function scriptOf(ch: string): string | null {
  if (!LETTER_OR_MARK.test(ch) || NEUTRAL.test(ch)) return null;
  for (const [name, pattern] of SCRIPT_PATTERNS) {
    if (pattern.test(ch)) return name;
  }
  return 'Other';
}

export interface ScriptIntrusion {
  /** Which unexpected writing systems appeared. */
  scripts: string[];
  /** How many unexpected characters in total. */
  count: number;
  /** A few of the distinct offending characters (for the regeneration note and logs). */
  samples: string[];
}

/**
 * Detects a clearly accidental writing-system intrusion.
 *
 * Allowed without question: Latin (names, brands, established terminology,
 * URLs) — and Hebrew when the required language is Hebrew. Also allowed:
 * any script the dreamer's OWN text uses (`contextText`), because quoting or
 * referencing what the dreamer wrote is legitimate. Everything else is an
 * intrusion. Reports only — never modifies the text.
 *
 * `language: null` means "the dream's own language" (dream analysis): only
 * Latin plus whatever scripts the dream text itself uses.
 */
export function findScriptIntrusion(texts: readonly string[], language: AppLanguage | null, contextText: string): ScriptIntrusion | null {
  const allowedScripts = new Set<string>(['Latin']);
  if (language === 'he') allowedScripts.add('Hebrew');
  // Letters from scripts outside the named list can't be compared by script,
  // so they're only excused if that exact character appears in the context.
  const allowedOtherChars = new Set<string>();
  for (const ch of contextText) {
    const script = scriptOf(ch);
    if (!script) continue;
    if (script === 'Other') allowedOtherChars.add(ch);
    else allowedScripts.add(script);
  }

  const found = new Set<string>();
  const samples = new Set<string>();
  let count = 0;
  for (const text of texts) {
    for (const ch of text) {
      const script = scriptOf(ch);
      if (!script || allowedScripts.has(script)) continue;
      if (script === 'Other' && allowedOtherChars.has(ch)) continue;
      found.add(script);
      if (samples.size < 3) samples.add(ch);
      count += 1;
    }
  }
  return count > 0 ? { scripts: [...found], count, samples: [...samples] } : null;
}

/** Every string anywhere inside a JSON-like value (arrays, nested objects). */
export function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(collectStrings);
  return [];
}
