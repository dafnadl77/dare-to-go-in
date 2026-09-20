import type { AppLanguage } from '../src/hero/appLanguage.js';
import { buildLanguageIntegrityRetryNote, findScriptIntrusion, type ScriptIntrusion } from '../src/hero/languageIntegrity.js';

// gpt-4o-mini drifts into a foreign script in ~1 of 8 Hebrew reflections regardless of prompt wording; independent attempts make 3 leave ~0.2% falling through to the client retry UI.
const MAX_ATTEMPTS = 3;

export type LanguageGuardOutcome<T> = { status: 'ok'; value: T } | { status: 'invalid' } | { status: 'language_intrusion' };

/**
 * Runs one AI generation and, if the (already schema-valid) result contains
 * a clearly accidental writing-system intrusion, regenerates (up to
 * MAX_ATTEMPTS total) with a correction note. If every attempt fails, the
 * caller uses its existing error path (refund + "couldn't generate" → the client's
 * own retry UI) — nothing intruded is ever returned.
 *
 * - `produce` performs the model call and returns the schema-validated
 *   result, or null if the response was unusable (reported as 'invalid',
 *   never retried here — that stays each route's existing behavior).
 *   Errors it throws (OpenAI API errors) propagate to the route's own catch.
 * - `collect` lists every user-facing string in the result.
 * - Logs only script names and a count — never any dream text.
 */
export async function runWithLanguageIntegrity<T>(
  produce: (retryNote: string) => Promise<T | null>,
  collect: (value: T) => string[],
  policy: { route: string; language: AppLanguage | null; context: string },
): Promise<LanguageGuardOutcome<T>> {
  let previous: ScriptIntrusion | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const value = await produce(previous ? buildLanguageIntegrityRetryNote(previous) : '');
    if (value === null) return { status: 'invalid' };
    const intrusion = findScriptIntrusion(collect(value), policy.language, policy.context);
    if (!intrusion) return { status: 'ok', value };
    previous = intrusion;
    console.warn(
      `[language-integrity] ${policy.route}: attempt ${attempt} contained unexpected script(s) ${intrusion.scripts.join(',')} (${intrusion.count} chars)${attempt < MAX_ATTEMPTS ? ' — regenerating' : ' — giving up'}`,
    );
  }
  return { status: 'language_intrusion' };
}
