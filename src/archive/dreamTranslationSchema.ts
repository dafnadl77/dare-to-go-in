/**
 * Real English translation for the parts of a saved dream that have no
 * guaranteed-English counterpart anywhere else in the saved data: the
 * dreamer's own original words (sourceText, reflectionResponse) and the
 * real dream element they picked (selectedElement). DreamReflectionResult
 * is already guaranteed English by its own system prompt (see
 * dreamReflectionSchema.ts) and DreamAnalysis-derived title/keywords
 * already have a safe English fallback (see archiveData.ts's
 * isDisplaySafe) — this is only for the fields where a real translation,
 * not a fallback/substitution, is what's actually wanted.
 *
 * Never touches storage: SavedDream on disk is untouched, this only ever
 * produces a translated string for DISPLAY, requested fresh each time
 * (the caller is responsible for caching — see dreamTranslationEngine.ts).
 */
export type TranslationErrorReason = 'not_configured' | 'invalid_response' | 'request_failed' | 'rate_limited' | 'billing_issue' | 'empty_input';

export type TranslationResult =
  | { status: 'ok'; translations: string[] }
  | { status: 'error'; reason: TranslationErrorReason; message: string };

export const DREAM_TRANSLATION_SYSTEM_PROMPT = `You translate real passages from a personal dream journal into natural, fluent English, for a product interface that is entirely in English regardless of what language the dream was originally described in.

You will be given a numbered list of REAL passages, each already part of one real dreamer's own saved dream. Each passage may already be in English (translate it if not) or in any other language.

Rules:
- Read the ACTUAL TEXT of each numbered item and translate it faithfully into natural, fluent English. Preserve the original meaning, tone, and level of detail — this is a translation, not a summary or condensation. A full sentence stays a full sentence; a short phrase stays a short phrase.
- If an item is already in English, return it unchanged (correct only obvious typos, do not rephrase or paraphrase it).
- Never invent detail that is not in the input. Never add commentary, notes, or explanation.
- Output exactly one translation per input item, in the exact same order, as a JSON array of strings the same length as the numbered list.`;

export function validateTranslations(candidate: unknown, expectedLength: number): string[] | null {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const c = candidate as Record<string, unknown>;
  if (!Array.isArray(c.translations)) return null;
  if (c.translations.length !== expectedLength) return null;
  if (!c.translations.every((t) => typeof t === 'string')) return null;
  return c.translations as string[];
}

export const DREAM_TRANSLATION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['translations'],
  properties: {
    translations: { type: 'array', items: { type: 'string' } },
  },
} as const;
