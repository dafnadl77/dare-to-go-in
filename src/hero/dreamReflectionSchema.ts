/**
 * A single grounded reflection on one real dream — never dream-dictionary
 * interpretation, never diagnosis, never therapy. Every field is a
 * possibility offered to the dreamer, never a stated fact about them.
 * Deliberately free of any Vite/browser-only code so this module can be
 * imported unchanged by both the frontend and the local Node backend.
 */
export interface DreamReflectionLenses {
  cognitive: string | null;
  jungian: string | null;
  psychodynamic: string | null;
}

export interface DreamReflectionResult {
  /** What actually happened in the dream — factual, traceable to the dream itself. */
  observation: string;
  /** The dreamer's own stated association with the element they chose, reflected back accurately. */
  personalAssociation: string;
  /** Exactly one concise thematic possibility — a possibility, never a conclusion. */
  possibleThread: string;
  /** Exactly one question connecting the dream's pattern to the dreamer's waking life. */
  continuityQuestion: string;
  /** Up to three optional perspectives — never truths. Null when a lens doesn't meaningfully apply. */
  lenses: DreamReflectionLenses;
  confidenceNotes: string[];
  /** Fixed, non-alarmist grounding line — the server always enforces the exact required wording. */
  groundingStatement: string;
}

export type ReflectionErrorReason = 'not_configured' | 'invalid_response' | 'request_failed' | 'rate_limited' | 'billing_issue';

export type ReflectionResult =
  | { status: 'ok'; reflection: DreamReflectionResult }
  | { status: 'error'; reason: ReflectionErrorReason; message: string };

/**
 * The exact grounding line the UI must always show, verbatim — enforced
 * server-side regardless of what the model returns for that field, so its
 * wording and calm tone can never drift.
 */
export const GROUNDING_STATEMENT = 'This is a reflection, not a diagnosis or a definitive interpretation.';

/**
 * The exact instruction the reflection backend uses. Core principle: this
 * is one grounded, hedged reflection — never dream-dictionary meanings,
 * never diagnosis, never therapy, never "symbol X always means Y."
 */
export const DREAM_REFLECTION_SYSTEM_PROMPT = `You are creating ONE grounded reflection on a real dream, for the dreamer who just described what stood out to them and shared their own association with it.

This is NOT dream-dictionary interpretation. NOT diagnosis. NOT therapy. NOT "symbol X always means Y."

NEVER say things like:
- "This dream means..."
- "This symbol means..."
- "Your subconscious is telling you..."
- "You have..."
- "This proves..."

ALWAYS use hedged, possibility language such as:
- "One possible thread is..."
- "What stands out is..."
- "This may connect to..."
- "One way to read this is..."
- "Does this resonate with anything in your life right now?"

The dreamer remains the final authority on meaning. You are offering possibilities, never conclusions.

Build the reflection from exactly these layers:

1. OBSERVATION — state what actually happened in the dream. Factual, traceable to the dream's own content. No interpretation yet.
2. PERSONAL ASSOCIATION — reflect back the dreamer's own stated association with the element they chose, accurately, in one short sentence. Do not overwrite it with a generic meaning of your own.
3. POSSIBLE THREAD — exactly ONE concise thematic possibility connecting the observation and the dreamer's association. A possibility, never a conclusion.
4. CONTINUITY QUESTION — exactly ONE strong question connecting the dream's pattern to the dreamer's waking life. Only one question, never several.
5. LENSES (optional) — up to three OPTIONAL perspectives, each explicitly framed as a lens/perspective, never a fact:
   - cognitive: continuity between waking concerns, memory, emotion, and dream content.
   - jungian: a symbolic/archetypal reading, offered strictly as a theoretical lens.
   - psychodynamic: a cautious relational/conflict-oriented reading.
   If a lens genuinely doesn't apply, set it to null rather than forcing one in. Do not use NLP framing. Do not use CBT as a dream-symbol interpretation framework — CBT belongs to later coping/action work for recurring nightmares, never to "what this dream means."

Scientific discipline: never use generic internet dream-dictionary meanings (e.g. "water = emotion", "teeth = anxiety", "snake = sexuality"). Ground everything primarily in the dream's own context and the dreamer's own stated words — never a symbol lookup table. Never invent an event, detail, or feeling that is not in the dream or in the dreamer's own response.

Keep every field short: observation and possibleThread are 1-2 sentences; personalAssociation is one short sentence; continuityQuestion is exactly one question; each present lens is 1-2 sentences, clearly framed as a possibility.

For groundingStatement, write a short, calm, non-alarmist line making clear this is a reflection, not a diagnosis or definitive interpretation (exact wording is not critical — it will be normalized).

Respond with only the DreamReflectionResult JSON object matching the provided schema — no prose outside it.`;

/**
 * Minimal structural validation of an untrusted candidate response before
 * the UI ever relies on it. Deliberately shallow (checks shape/types, not
 * semantic correctness) — good enough to reject garbage or a malformed
 * response without crashing the experience.
 */
export function validateDreamReflectionResult(candidate: unknown): DreamReflectionResult | null {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const c = candidate as Record<string, unknown>;

  if (typeof c.observation !== 'string') return null;
  if (typeof c.personalAssociation !== 'string') return null;
  if (typeof c.possibleThread !== 'string') return null;
  if (typeof c.continuityQuestion !== 'string') return null;
  if (typeof c.groundingStatement !== 'string') return null;
  if (!Array.isArray(c.confidenceNotes) || !c.confidenceNotes.every((n) => typeof n === 'string')) return null;

  if (typeof c.lenses !== 'object' || c.lenses === null) return null;
  const lenses = c.lenses as Record<string, unknown>;
  const isNullableString = (v: unknown) => v === null || typeof v === 'string';
  if (!isNullableString(lenses.cognitive) || !isNullableString(lenses.jungian) || !isNullableString(lenses.psychodynamic)) {
    return null;
  }

  return candidate as DreamReflectionResult;
}

/**
 * JSON Schema mirroring `DreamReflectionResult` exactly, for OpenAI
 * structured outputs (`text.format` with `type: 'json_schema'`). Keep in
 * sync with the interfaces/validator above by hand.
 */
export const DREAM_REFLECTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['observation', 'personalAssociation', 'possibleThread', 'continuityQuestion', 'lenses', 'confidenceNotes', 'groundingStatement'],
  properties: {
    observation: { type: 'string' },
    personalAssociation: { type: 'string' },
    possibleThread: { type: 'string' },
    continuityQuestion: { type: 'string' },
    lenses: {
      type: 'object',
      additionalProperties: false,
      required: ['cognitive', 'jungian', 'psychodynamic'],
      properties: {
        cognitive: { type: ['string', 'null'] },
        jungian: { type: ['string', 'null'] },
        psychodynamic: { type: ['string', 'null'] },
      },
    },
    confidenceNotes: { type: 'array', items: { type: 'string' } },
    groundingStatement: { type: 'string' },
  },
} as const;
