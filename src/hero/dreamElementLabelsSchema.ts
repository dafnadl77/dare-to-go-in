/**
 * Short English display labels for the real dream elements a user can
 * choose from — the DARE product UI is English-only, but a dream (and its
 * extracted DreamAnalysis fields) may be in any language. This never
 * touches the original dream text or DreamAnalysis; it only produces a
 * concise English label for each already-derived candidate string.
 */
export type ElementLabelErrorReason = 'not_configured' | 'invalid_response' | 'request_failed' | 'rate_limited' | 'billing_issue';

export type ElementLabelsResult = { status: 'ok'; labels: string[] } | { status: 'error'; reason: ElementLabelErrorReason; message: string };

export const DREAM_ELEMENT_LABEL_SYSTEM_PROMPT = `You translate real, concrete phrases from a dream into short English display labels for a product interface that is entirely in English regardless of what language the dream was described in.

You will be given a numbered list of REAL phrases (each already extracted from one real dream). Each phrase may be in any language, and may be a full sentence, a fragment, or a short phrase. You must actually read and understand each phrase's real meaning, then translate/condense it into English.

Rules:
- Read the ACTUAL TEXT of each numbered item. Never output a generic placeholder like "first element", "second item", or "the element" — always output a real label describing what that specific phrase actually says.
- Always output English, regardless of the input language.
- Keep each label SHORT — a concept label, not a full sentence. Prefer 2-5 words.
- Preserve the actual meaning faithfully. Do not invent detail that is not in the input phrase, and do not add commentary or interpretation.
- No trailing punctuation.
- Output exactly one label per input item, in the exact same order, as a JSON array of strings the same length as the numbered list.

Worked example — if given this numbered list:
1. אני התקרבתי אל הפסנתר הלבן
2. אור כחול מתחת למים
3. החתול הישן שלי

The correct output is exactly:
{"labels": ["THE WHITE PIANO", "BLUE LIGHT UNDERWATER", "MY OLD CAT"]}

Notice each label is a real translation of that specific numbered item's actual content — never a placeholder, never unrelated to the input.`;

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
