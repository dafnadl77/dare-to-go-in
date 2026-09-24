/**
 * A quiet, grounded "Pattern Reflection" on how ONE recurring semantic
 * concept (see ../hero/conceptTaxonomy.ts) actually appears, changes or
 * behaves across a dreamer's own saved dreams — never universal symbolic
 * interpretation, never diagnosis. Deliberately free of any Vite/browser-
 * only code so this module can be imported unchanged by both the frontend
 * and the local Node backend (mirrors dreamReflectionSchema.ts /
 * dreamTranslationSchema.ts).
 *
 * PATTERN_REFLECTION_PROMPT_VERSION 2 (round 2): the reflection's own JSON
 * shape changed (3 fields → 4, see PatternReflectionResult) and the prompt
 * was substantially strengthened (grounding discipline, natural/idiomatic
 * Hebrew, gender-aware address). A cached row from version 1 is a
 * DIFFERENT, incompatible shape — this version is part of the cache
 * identity (see server/patternReflectionCore.ts) specifically so old rows
 * are never misread as the new shape; they're simply never looked up
 * again, not deleted (see this round's own report for why).
 */
import type { AppLanguage } from '../hero/appLanguage.js';
import { buildLanguageIntegrityInstruction } from '../hero/languageIntegrity.js';
import { buildHebrewAddressInstruction, type AddressPreference } from '../hero/addressPreference.js';

export const PATTERN_REFLECTION_PROMPT_VERSION = 2;

export interface PatternReflectionResult {
  /** A. WHAT REPEATS — factual synthesis of what actually recurs across
      the matching dreams shown. No interpretation yet. */
  whatRepeats: string;
  /** B. WHAT MAY CONNECT THEM — a cautious possible connection, in
      uncertainty language. Never stated as fact. */
  possibleConnection: string;
  /** C. A DIRECTION WORTH EXPLORING — one useful, modest direction the
      dreamer may consider in waking life. Not a conclusion or advice. */
  directionToExplore: string;
  /** D. A QUESTION WORTH KEEPING — exactly one specific, thoughtful
      question grounded in this particular recurring pattern. */
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
 * meaning, keep fact/possibility clearly separated, synthesize what is
 * ACTUALLY recurring rather than explaining what the concept generally
 * means, and say less rather than manufacture depth when the evidence is
 * thin. `addressPreference` only matters for Hebrew (English second-person
 * address has no grammatical gender) — see addressPreference.ts.
 */
export function buildPatternReflectionSystemPrompt(language: AppLanguage, addressPreference: AddressPreference): string {
  const languageParagraph =
    language === 'he'
      ? 'Language: always write your entire response — every field — in natural, fluent, idiomatic Hebrew, regardless of what language the dreams below were described in. The dreams\' own original text is never translated in storage, only your reflection output is always Hebrew.'
      : 'Language: always write your entire response — every field — in English, regardless of what language the dreams below were described in. The dreams\' own original text is never translated in storage, only your reflection output is always English.';

  return `You are creating ONE quiet "Pattern Reflection" for a dreamer, synthesizing what ACTUALLY RECURS across several of their OWN real saved dreams that share one classified theme.

This is NOT dream-dictionary interpretation. NOT diagnosis. NOT therapy. NOT "this theme symbolizes/represents/means X." It is also NOT a generic explanation of what a theme like "animals", "water", or "public figures" usually means to people in general — that would be worthless to this specific dreamer. Your entire job is to notice what is specific to THESE dreams.

The THEME name you'll be given (see THEME below) is a content category from a closed classification list, assigned because each dream below happens to contain it — it carries NO fixed symbolic meaning, and sharing a Concept ID does NOT by itself mean the dreams share anything else. Do not manufacture a commonality (a feeling, a motive, a life circumstance) that the dream material does not actually support. If three dreams share a theme but otherwise have nothing meaningfully in common, say that plainly and briefly rather than inventing a connection.

FORBIDDEN — never write anything resembling:
- "[Theme] symbolizes / represents / means..."
- "This means you are / feel / want / fear..."
- "Your subconscious is telling you..."
- "Being [X] means [Y]..."
- a generic explanation of what the theme usually means to people, detached from these specific dreams
- any claim of a shared feeling, motive, relationship, or life circumstance that the dreams themselves do not state

ALLOWED — hedged, observational, possibility language such as:
- "[Theme] appears in several of your dreams, but your position toward it changes..."
- "ייתכן ש...", "אולי...", "אפשר לשים לב ש...", "עשוי..." (Hebrew uncertainty markers — vary them, do not repeat the same one in every field)
- "One possible connection worth naming is..."

The dreamer remains the final authority on meaning. You are noticing a pattern and offering a possibility, never a conclusion.

GROUNDING (hard requirement): every dream you're given includes its own original text, marked CANONICAL — if any summary or other field conflicts with that original text, the original text wins. Clearly keep FACT (what the dreams literally contain) separate from POSSIBILITY (what you're tentatively offering) — never state the second as if it were the first. Never invent an event, emotion, relationship, motive, or life circumstance that is not present in what you were given. Never claim a pattern exists beyond what the dreams shown actually support.

Build EXACTLY four fields, in this order:

A. whatRepeats — FACTUAL synthesis. State concretely what actually recurs across these specific dreams (situations, the dreamer's own role or position, what stays the same vs. what differs) and what does NOT — traceable to the dreams shown, no interpretation yet.
B. possibleConnection — a CAUTIOUS possible connection between the recurrences just named, in uncertainty language. Never a fixed meaning for the theme itself, never stated as fact.
C. directionToExplore — ONE modest, useful direction the dreamer might consider in waking life, grounded in A and B. Not advice, not a conclusion — an invitation, not an instruction.
D. question — exactly ONE specific, thoughtful question grounded in THIS particular recurring pattern — never a generic question that could apply to any dream or any theme.

If the evidence across these dreams is thin, repetitive, or doesn't show a real pattern of change, SAY LESS: short, honest fields are far better than manufactured depth. Never pad a field to sound more insightful than the evidence supports.

Write natural, idiomatic, grammatically correct, concise prose, as a fluent native speaker would actually write — never a literal translation of an English idiom into another language, never an invented or awkward compound phrase. Before responding, mentally re-read every field for typos, unnatural word choice, and broken sentences. Keep every field SHORT — 1 to 3 sentences each. This is a quiet insight card, not an essay. Plain prose only: no markdown, no lists, no headings, no HTML. Use uncertainty language naturally where it belongs, but vary the phrasing — do not repeat the exact same hedge word in every field.

${languageParagraph}

${language === 'he' ? buildHebrewAddressInstruction(addressPreference) : ''}

${buildLanguageIntegrityInstruction(language)}

Respond with only the PatternReflectionResult JSON object matching the provided schema — no prose outside it.`;
}

/** Minimal structural validation of an untrusted candidate response —
    shallow (shape/types, not semantic correctness), matching every other
    route's validator in this codebase. */
export function validatePatternReflectionResult(candidate: unknown): PatternReflectionResult | null {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const c = candidate as Record<string, unknown>;
  if (typeof c.whatRepeats !== 'string' || !c.whatRepeats.trim()) return null;
  if (typeof c.possibleConnection !== 'string' || !c.possibleConnection.trim()) return null;
  if (typeof c.directionToExplore !== 'string' || !c.directionToExplore.trim()) return null;
  if (typeof c.question !== 'string' || !c.question.trim()) return null;
  return { whatRepeats: c.whatRepeats, possibleConnection: c.possibleConnection, directionToExplore: c.directionToExplore, question: c.question };
}

/** JSON Schema mirroring PatternReflectionResult exactly, for OpenAI
    structured outputs (text.format with type: 'json_schema'). Keep in
    sync with the interface/validator above by hand. */
export const PATTERN_REFLECTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['whatRepeats', 'possibleConnection', 'directionToExplore', 'question'],
  properties: {
    whatRepeats: { type: 'string' },
    possibleConnection: { type: 'string' },
    directionToExplore: { type: 'string' },
    question: { type: 'string' },
  },
} as const;
