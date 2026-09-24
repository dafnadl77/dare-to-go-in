/**
 * A quiet, grounded "Pattern Reflection" on how ONE recurring semantic
 * concept (see ../hero/conceptTaxonomy.ts) actually appears, changes or
 * behaves across a dreamer's own saved dreams — never universal symbolic
 * interpretation, never diagnosis. Deliberately free of any Vite/browser-
 * only code so this module can be imported unchanged by both the frontend
 * and the local Node backend (mirrors dreamReflectionSchema.ts /
 * dreamTranslationSchema.ts).
 */
import type { AppLanguage } from '../hero/appLanguage.js';
import { buildLanguageIntegrityInstruction } from '../hero/languageIntegrity.js';

export interface PatternReflectionResult {
  /** Descriptive, evidence-grounded: how the theme actually appears or
      changes across the specific dreams shown. No interpretation. */
  whatStandsOut: string;
  /** Tentative, exploratory language only — a possibility, never a
      conclusion, and never a fixed meaning assigned to the theme itself. */
  possibleThread: string;
  /** Exactly one open, reflective question grounded in the pattern just
      described — never a generic "what do dreams mean to you". */
  question: string;
}

export type PatternReflectionErrorReason =
  | 'not_configured'
  | 'invalid_response'
  | 'request_failed'
  | 'rate_limited'
  | 'billing_issue'
  | 'not_authenticated'
  | 'invalid_concept'
  | 'insufficient_evidence';

export type PatternReflectionApiResult =
  | { status: 'ok'; reflection: PatternReflectionResult; totalDreamCount: number; synthesizedDreamCount: number }
  | { status: 'error'; reason: PatternReflectionErrorReason; message: string };

/**
 * The exact instruction the Pattern Reflection backend uses. Same register
 * as dreamReflectionSchema.ts's buildDreamReflectionSystemPrompt (grounded
 * possibility language, never a stated fact) plus the rules specific to a
 * CROSS-DREAM pattern: never assign the theme itself a fixed/universal
 * meaning, keep observation and possibility clearly separated, and say
 * less rather than manufacture depth when the evidence is thin.
 */
export function buildPatternReflectionSystemPrompt(language: AppLanguage): string {
  const languageParagraph =
    language === 'he'
      ? 'Language: always write your entire response — every field — in natural, fluent Hebrew, regardless of what language the dreams below were described in. The dreams\' own original text is never translated in storage, only your reflection output is always Hebrew.'
      : 'Language: always write your entire response — every field — in English, regardless of what language the dreams below were described in. The dreams\' own original text is never translated in storage, only your reflection output is always English.';

  return `You are creating ONE quiet "Pattern Reflection" for a dreamer, noticing how a theme that recurs across several of their OWN real saved dreams actually appears, changes or behaves between those dreams.

This is NOT dream-dictionary interpretation. NOT diagnosis. NOT therapy. NOT "this theme symbolizes/represents/means X."

The THEME name you'll be given (see THEME below) is a content category from a closed classification list — it exists only to say what these dreams have in common, and carries NO fixed symbolic meaning. Never assign it one.

FORBIDDEN — never write anything resembling:
- "[Theme] symbolizes / represents / means..."
- "This means you are / feel / want / fear..."
- "Your subconscious is telling you..."
- "Being [X] means [Y]..."
- any generic dream-dictionary or psychological claim not grounded in the specific dreams you were given

ALLOWED — hedged, observational, possibility language such as:
- "[Theme] appears in several of your dreams, but your position toward it changes..."
- "One possible thread to explore is..."
- "It may be worth noticing that..."

The dreamer remains the final authority on meaning. You are noticing a pattern and offering a possibility, never a conclusion.

GROUNDING (hard requirement): every dream you're given includes its own original text, marked CANONICAL — if any summary or other field conflicts with that original text, the original text wins. Never invent an event, emotion, relationship, or detail that is not present in what you were given. Never claim a pattern exists beyond what the dreams shown actually support.

Build EXACTLY three fields, in this order, keeping OBSERVATION and POSSIBILITY clearly separate:

1. whatStandsOut — DESCRIPTIVE and evidence-grounded. State concretely how this theme actually appears across these specific dreams: what recurs, what differs, how the dreamer's own role or position toward it changes from dream to dream. Traceable to the dreams shown. No interpretation yet.
2. possibleThread — TENTATIVE, exploratory language only ("one possible thread to explore is...", "it may be worth noticing..."). A possibility, never a conclusion, and never a fixed meaning for the theme itself.
3. question — exactly ONE open, reflective question, grounded in the specific cross-dream pattern just described in whatStandsOut — never a generic question that could apply to any dream or any theme.

If the evidence across these dreams is thin, repetitive, or doesn't show a real pattern of change, SAY LESS: a short, honest whatStandsOut and a modest possibleThread are far better than manufactured depth. Never pad a field to sound more insightful than the evidence supports — a plain, short question is fine too.

Keep every field SHORT — 1 to 3 sentences each. This is a quiet insight card, not an essay. Plain prose only: no markdown, no lists, no headings, no HTML.

${languageParagraph}

${buildLanguageIntegrityInstruction(language)}

Respond with only the PatternReflectionResult JSON object matching the provided schema — no prose outside it.`;
}

/** Minimal structural validation of an untrusted candidate response —
    shallow (shape/types, not semantic correctness), matching every other
    route's validator in this codebase. */
export function validatePatternReflectionResult(candidate: unknown): PatternReflectionResult | null {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const c = candidate as Record<string, unknown>;
  if (typeof c.whatStandsOut !== 'string' || !c.whatStandsOut.trim()) return null;
  if (typeof c.possibleThread !== 'string' || !c.possibleThread.trim()) return null;
  if (typeof c.question !== 'string' || !c.question.trim()) return null;
  return { whatStandsOut: c.whatStandsOut, possibleThread: c.possibleThread, question: c.question };
}

/** JSON Schema mirroring PatternReflectionResult exactly, for OpenAI
    structured outputs (text.format with type: 'json_schema'). Keep in
    sync with the interface/validator above by hand. */
export const PATTERN_REFLECTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['whatStandsOut', 'possibleThread', 'question'],
  properties: {
    whatStandsOut: { type: 'string' },
    possibleThread: { type: 'string' },
    question: { type: 'string' },
  },
} as const;
