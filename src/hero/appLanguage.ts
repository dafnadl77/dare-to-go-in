/**
 * Single source of truth for the application's current interface/content
 * language — not user-configurable yet. A future language switcher writes
 * to this same abstraction instead of scattering language checks (or,
 * worse, hardcoded per-word translations) throughout the app.
 *
 * The dreamer's own original words (DreamAnalysis.sourceText, their typed
 * reflection response, etc.) are NEVER touched by this — appLanguage only
 * governs AI-generated / derived content that gets displayed in the UI
 * (selectable element labels, memory fragments, reflection output).
 */
export type AppLanguage = 'en' | 'he';

export const APP_LANGUAGE: AppLanguage = 'en';

export function getAppLanguage(): AppLanguage {
  return APP_LANGUAGE;
}

const HEBREW_CHARS = new RegExp('[\\u0590-\\u05FF]');
const HEBREW_CHARS_GLOBAL = new RegExp('[\\u0590-\\u05FF]', 'g');
// A parenthetical aside that contains Hebrew — the observed failure mode is
// the model occasionally echoing the original-language word for authenticity,
// e.g. "...feelings of longing (געגוע)." Dropping the whole aside reads far
// more naturally than leaving a hole where a single word used to be.
const HEBREW_PARENTHETICAL = new RegExp('\\s*\\([^()]*[\\u0590-\\u05FF][^()]*\\)', 'g');

export function containsHebrew(text: string): boolean {
  return HEBREW_CHARS.test(text);
}

/**
 * Last-line-of-defense guard for the English UI: the reflection engine's
 * system prompt already instructs English-only output, but an LLM can still
 * occasionally slip in an original-language word. Rather than add a network
 * round-trip to re-translate (which would add an API call this stage must
 * not introduce), this strips Hebrew synchronously and deterministically —
 * first whole parenthetical asides, then any remaining stray Hebrew
 * characters — so the English UI is guaranteed to end up with zero Hebrew
 * Unicode characters, no matter what the model returns. A no-op when the
 * app language isn't English, or when the string is already clean.
 */
export function sanitizeAiTextForDisplay(text: string): string {
  if (getAppLanguage() !== 'en' || !containsHebrew(text)) return text;
  const withoutAsides = text.replace(HEBREW_PARENTHETICAL, '');
  const withoutStray = withoutAsides.replace(HEBREW_CHARS_GLOBAL, '');
  return withoutStray.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1').trim();
}
