/**
 * Single source of truth for the application's current interface/content
 * language, for the (many) plain functions and modules in this codebase
 * that are not React components and can't call a hook — dreamTranscription
 * request, dreamReflectionEngine/dreamElementLabels requests,
 * sanitizeAiTextForDisplay, dreamStorage's saved-dream stamp, etc.
 *
 * The REAL source of truth — the one the user actually controls, persists,
 * and that drives document.documentElement.lang/dir and every translated
 * UI string — is `src/i18n/LanguageContext.tsx`'s LanguageProvider. It
 * calls setActiveLanguage() below on mount and on every change, so this
 * module is a synced mirror of that state, not a second independent one:
 * there is exactly one place a language switch originates, this just makes
 * its current value reachable from code that isn't inside the React tree.
 *
 * The dreamer's own original words (DreamAnalysis.sourceText, their typed
 * reflection response, etc.) are NEVER touched by this — appLanguage only
 * governs AI-generated / derived content that gets displayed in the UI
 * (selectable element labels, memory fragments, reflection output).
 */
export type AppLanguage = 'en' | 'he';

let currentAppLanguage: AppLanguage = 'en';

/** Called only by LanguageProvider — see the module comment above. */
export function setActiveLanguage(language: AppLanguage): void {
  currentAppLanguage = language;
}

export function getAppLanguage(): AppLanguage {
  return currentAppLanguage;
}

/** Strict, explicit normalization for the one value that ever reaches the
    transcription API as a language hint (see dreamTranscription.ts). In
    practice getAppLanguage() above is the only source this is ever called
    with, and it's already typed to exactly 'en' | 'he' — this exists as
    real defense-in-depth, not because a leak has been found: if anything
    is ever wired in later that passes a raw browser/Intl locale string
    (he-IL, iw — the old ISO 639-1 code for Hebrew, en-US, en-GB, ...)
    instead of the plain app-language code, it still resolves correctly
    rather than reaching OpenAI as unrecognized data. Anything genuinely
    unexpected falls back to English, deterministically — never to the
    transcription model's free-form language auto-detection, which is
    exactly what once let a real, plain English recording come back
    transcribed in Russian (see server/routes/dreamTranscription.ts's own
    matching resolveLanguage(), the actual re-validated boundary). */
export function normalizeTranscriptionLanguage(value: string | null | undefined): AppLanguage {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'he' || v === 'iw' || v.startsWith('he-') || v.startsWith('he_')) return 'he';
  if (v === 'en' || v.startsWith('en-') || v.startsWith('en_')) return 'en';
  return 'en';
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
 * system prompt already instructs English-only output when appLanguage is
 * 'en', but an LLM can still occasionally slip in an original-language
 * word. Rather than add a network round-trip to re-translate (which would
 * add an API call this stage must not introduce), this strips Hebrew
 * synchronously and deterministically — first whole parenthetical asides,
 * then any remaining stray Hebrew characters — so the English UI is
 * guaranteed to end up with zero Hebrew Unicode characters, no matter what
 * the model returns. A no-op when the app language isn't English, or when
 * the string is already clean — so this is inert, by design, whenever
 * Hebrew is the active UI language (nothing to strip Hebrew out of there).
 */
export function sanitizeAiTextForDisplay(text: string): string {
  if (getAppLanguage() !== 'en' || !containsHebrew(text)) return text;
  const withoutAsides = text.replace(HEBREW_PARENTHETICAL, '');
  const withoutStray = withoutAsides.replace(HEBREW_CHARS_GLOBAL, '');
  return withoutStray.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1').trim();
}
