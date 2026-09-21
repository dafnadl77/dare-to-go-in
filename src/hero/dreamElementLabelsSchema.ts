import type { AppLanguage } from './appLanguage.js';
import { buildLanguageIntegrityInstruction } from './languageIntegrity.js';

/**
 * Short display labels for the real dream elements a user can choose
 * from, in whichever language the DARE interface is currently in — a
 * dream (and its extracted DreamAnalysis fields) may be in any language,
 * independent of the display language requested here. This never touches
 * the original dream text or DreamAnalysis; it only produces a concise
 * label, in the requested language, for each already-derived candidate
 * string.
 */
export type ElementLabelErrorReason =
  | 'not_configured'
  | 'invalid_response'
  | 'request_failed'
  | 'rate_limited'
  | 'billing_issue'
  | 'not_authenticated';

export type ElementLabelsResult = { status: 'ok'; labels: string[] } | { status: 'error'; reason: ElementLabelErrorReason; message: string };

/**
 * These labels are shown as selectable "angles" under the generated dream,
 * so each one has to be understood at a glance by a native speaker. The
 * model's failure mode (seen live: a Hebrew label that was a made-up
 * "-יאני" adjective) is to keep a foreign or unusual word and bend it into
 * the target language's grammar. These rules close that off in general —
 * no per-word replacements — while leaving established loanwords and real
 * names alone.
 */
function buildNaturalLabelRules(targetLanguageName: string): string {
  return `- Every label must read as natural, everyday ${targetLanguageName} that a native speaker would recognise instantly and could say aloud — a short noun phrase, not a coined word.
- NEVER transliterate a foreign or unusual word into ${targetLanguageName}, and NEVER invent an adjective, noun or verb form by attaching ${targetLanguageName} endings or prefixes to a foreign stem. If a word has no common ${targetLanguageName} equivalent that people really use, say what it means with plain, common words instead (a noun plus "of"/"in the style of"/"related to" in ${targetLanguageName}, or a short description).
- Established loanwords that ${targetLanguageName} speakers really use, and the names of real people, places and brands, may be written in their normal ${targetLanguageName} spelling. Everything else must be plain ${targetLanguageName}.
- Prefer the simple, common word over the rare or academic one. If you are not sure a word is genuinely used in ${targetLanguageName}, choose a plainer phrasing.
- A label is a perspective the dreamer can pick: keep it neutral and concrete (what it is), never a judgement, diagnosis or interpretation.`;
}

/**
 * A function of the requested display language rather than a fixed
 * English-only constant — kept as close as possible to the original
 * English prompt (per "don't rewrite prompts unless necessary"): only the
 * language name and the worked example's target language/output change.
 */
export function buildDreamElementLabelSystemPrompt(language: AppLanguage): string {
  const targetLanguageName = language === 'he' ? 'Hebrew' : 'English';
  const workedExampleOutput =
    language === 'he'
      ? '{"labels": ["הפסנתר הלבן", "אור כחול מתחת למים", "החתול הישן שלי"]}'
      : '{"labels": ["THE WHITE PIANO", "BLUE LIGHT UNDERWATER", "MY OLD CAT"]}';

  return `You translate real, concrete phrases from a dream into short ${targetLanguageName} display labels for a product interface currently displayed in ${targetLanguageName}, regardless of what language the dream was described in.

You will be given a numbered list of REAL phrases (each already extracted from one real dream). Each phrase may be in any language, and may be a full sentence, a fragment, or a short phrase. You must actually read and understand each phrase's real meaning, then translate/condense it into ${targetLanguageName}.

Rules:
- Read the ACTUAL TEXT of each numbered item. Never output a generic placeholder like "first element", "second item", or "the element" — always output a real label describing what that specific phrase actually says.
- Always output ${targetLanguageName}, regardless of the input language.
- Keep each label SHORT — a concept label, not a full sentence. Prefer 2-5 words.
${buildNaturalLabelRules(targetLanguageName)}
- Preserve the actual meaning faithfully. Do not invent detail that is not in the input phrase, and do not add commentary or interpretation.
- No trailing punctuation.
- Output exactly one label per input item, in the exact same order, as a JSON array of strings the same length as the numbered list.

Worked example — if given this numbered list:
1. אני התקרבתי אל הפסנתר הלבן
2. אור כחול מתחת למים
3. החתול הישן שלי

The correct output is exactly:
${workedExampleOutput}

Notice each label is a real translation of that specific numbered item's actual content — never a placeholder, never unrelated to the input.

${buildLanguageIntegrityInstruction(language)}`;
}

export function validateElementLabels(candidate: unknown, expectedLength: number): string[] | null {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const c = candidate as Record<string, unknown>;
  if (!Array.isArray(c.labels)) return null;
  if (c.labels.length !== expectedLength) return null;
  if (!c.labels.every((l) => typeof l === 'string' && l.trim().length > 0)) return null;
  return c.labels as string[];
}

export const DREAM_ELEMENT_LABELS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['labels'],
  properties: {
    labels: { type: 'array', items: { type: 'string' } },
  },
} as const;
