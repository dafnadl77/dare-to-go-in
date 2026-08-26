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
