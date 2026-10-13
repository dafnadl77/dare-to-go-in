import type { AppLanguage } from './appLanguage.js';
import { buildLanguageIntegrityInstruction } from './languageIntegrity.js';
import { buildHebrewAddressInstruction, type AddressPreference } from './addressPreference.js';

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
  /** Only when the dreamer named feelings: how those REPORTED feelings colour the reading, kept apart from what happened in the dream. Null or absent otherwise (and absent on every dream saved before this existed). */
  emotionReflection?: string | null;
  /** One short, personal sentence that gathers the reading. Absent on dreams saved before this existed. */
  summary?: string | null;
  /** Fixed, non-alarmist grounding line — the server always enforces the exact required wording. */
  groundingStatement: string;
}

export type ReflectionErrorReason =
  | 'not_configured'
  | 'invalid_response'
  | 'request_failed'
  | 'rate_limited'
  | 'billing_issue'
  | 'not_authenticated'
  | 'limit_reached';

export type ReflectionResult =
  | { status: 'ok'; reflection: DreamReflectionResult }
  | { status: 'error'; reason: ReflectionErrorReason; message: string };

/**
 * The exact grounding line the UI must always show, verbatim per language
 * — enforced server-side regardless of what the model returns for that
 * field, so its wording and calm tone can never drift. Hebrew phrasing
 * chosen to read naturally, not as a literal word-for-word translation.
 */
const GROUNDING_STATEMENT_EN = 'This is a reflection, not a diagnosis or a definitive interpretation.';
const GROUNDING_STATEMENT_HE = 'זו השתקפות, לא אבחנה או פרשנות חד-משמעית.';

export function getGroundingStatement(language: AppLanguage): string {
  return language === 'he' ? GROUNDING_STATEMENT_HE : GROUNDING_STATEMENT_EN;
}

/**
 * Hebrew only. A language model's Hebrew reads like a translation unless it is told otherwise: stiff noun chains, calques ("הדימוי כולל",
 * "התקבלה תחושה"), mixed grammatical address, and the odd untranslated English word. This is guidance for the one generation that already
 * happens; the output checks (findScriptIntrusion with strictLatin, findAddressViolation) regenerate when it is not followed.
 */
function buildHebrewStyleInstruction(preference: AddressPreference): string {
  const address =
    preference === 'neutral'
      ? 'When you address the dreamer directly, use the plural voice that the whole product uses ("אתם", "שלכם", "בחרתם לציין"); never the singular "אתה" or "את".'
      : 'Address the dreamer in the singular, exactly as the grammatical-address instruction below requires; do not use the plural "אתם"/"שלכם".';
  const example =
    preference === 'neutral'
      ? '{"observation": "בחלום עליתם במדרגות ארוכות, ובקצה חיכתה דלת סגורה.", "personalAssociation": "אמרתם שהמדרגות מזכירות לכם את הבית של סבא.", "emotionReflection": "בחרתם לציין געגוע ופחד. אפשר לשאול אם הם יושבים זה לצד זה כשמתקרבים לדלת.", "possibleThread": "אולי יש כאן קרבה למשהו מוכר שעדיין לא נפתח.", "continuityQuestion": "האם יש משהו בחיים עכשיו שאתם מתקרבים אליו ועוד לא פותחים?", "summary": "מדרגות, דלת סגורה, וגעגוע שבחרתם לציין."}'
      : '{"observation": "בחלום עלית במדרגות ארוכות, ובקצה חיכתה דלת סגורה.", "personalAssociation": "אמרת שהמדרגות מזכירות לך את הבית של סבא.", "emotionReflection": "בחרת לציין געגוע ופחד. אפשר לשאול אם הם יושבים זה לצד זה כשמתקרבים לדלת.", "possibleThread": "אולי יש כאן קרבה למשהו מוכר שעדיין לא נפתח.", "continuityQuestion": "האם יש משהו בחיים עכשיו שאתה מתקרב אליו ועוד לא פותח?", "summary": "מדרגות, דלת סגורה, וגעגוע שבחרת לציין."}';
  return `HEBREW STYLE (Hebrew output only): write the way a thoughtful Hebrew speaker would say it aloud, never as a translation from English. Use short, plain, active sentences (about 20 words at most, one idea each) and ordinary everyday words; if a phrase does not sound like something a Hebrew speaker would really say, rewrite it simply. Avoid stiff noun chains and calques such as "הדימוי כולל", "התקבלה תחושה", "מה שיכול להוות מקור ל", "להשתף פעולה עם", and do not repeat "במהלך החלום" or "מייצג". Check every verb and noun: use only real Hebrew words with their correct meaning, and never invent an institution, person or event that is not in the dream. ${address} Write the feelings with exactly the Hebrew words given in the input and say who named them ("בחרתם לציין פחד וגעגוע"); in the summary, if you mention the feelings, say that the dreamer named them, never that the dreamer is "experiencing" or "feeling" them now. Use Hebrew letters only: no English word anywhere, not even in parentheses, and no English word written in Hebrew letters either (for example "מיינד"); the only Latin letters allowed are a name taken from the dreamer's own text. Mention only the feelings the dreamer named, never another one.

Example of the TONE and LENGTH only (a different dream; never reuse its content or its sentences): ${example}`;
}

/**
 * The exact instruction the reflection backend uses, as a function of the
 * requested output language rather than a fixed English-only constant —
 * per "don't rewrite prompts unless necessary," only the "Language:"
 * paragraph near the end actually changes between the two; everything
 * else (the core principle: one grounded, hedged reflection — never
 * dream-dictionary meanings, never diagnosis, never therapy, never
 * "symbol X always means Y") is untouched, byte-identical to before this
 * function existed, for the 'en' case.
 *
 * `addressPreference` (see addressPreference.ts) only matters for Hebrew —
 * English second-person address has no grammatical gender. This is the
 * SAME persisted preference and helper Pattern Reflection uses; grammatical-
 * address consistency only, no change to this reflection's own meaning or
 * structure.
 */
export function buildDreamReflectionSystemPrompt(language: AppLanguage, addressPreference: AddressPreference): string {
  const languageParagraph =
    language === 'he'
      ? 'Language: always write your entire response — every field — in natural, fluent Hebrew, regardless of what language the dream was described in, what language the dreamer\'s own words are in, or what language the selected element\'s label is in. The dream itself and the dreamer\'s original words are never translated in storage, only your reflection output is always Hebrew.'
      : 'Language: always write your entire response — every field — in English, regardless of what language the dream was described in, what language the dreamer\'s own words are in, or what language the selected element\'s label is in. The dream itself and the dreamer\'s original words are never translated in storage, only your reflection output is always English.';

  return `You are creating ONE grounded reflection on a real dream, for the dreamer who just described what stood out to them and shared their own association with it.

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

   IMPORTANT — "I don't know" is a completely valid answer, never an error: if the dreamer's response expresses uncertainty or not knowing — in any language, for example "I don't know", "not sure", "nothing", "no idea", "can't explain", or Hebrew equivalents like "לא יודעת", "לא יודע", "לא בטוחה", "אין לי מושג", "לא עולה לי כלום" — do NOT invent a personal association and do NOT pretend the dreamer gave an interpretation. The absence of an association is data, not a gap to fill. In that case, personalAssociation should plainly state that the dreamer wasn't sure what the element brought up — for example: "You weren't sure what the piano brought up for you — so rather than assigning it a meaning, we can look at the role it played in the dream." Then continue normally with a grounded observation, one possible thread based on the dream's own structure, and exactly one useful question. Never fail, refuse, or produce an incomplete response because the dreamer expressed uncertainty.

3. POSSIBLE THREAD — exactly ONE concise thematic possibility connecting the observation and (when available) the dreamer's association, or the dream's own structure when the association is uncertain. A possibility, never a conclusion.
4. CONTINUITY QUESTION — exactly ONE strong question connecting the dream's pattern to the dreamer's waking life. Only one question, never several.
5. LENSES (optional) — up to three OPTIONAL perspectives, each explicitly framed as a lens/perspective, never a fact:
   - cognitive: continuity between waking concerns, memory, emotion, and dream content.
   - jungian: a symbolic/archetypal reading, offered strictly as a theoretical lens.
   - psychodynamic: a cautious relational/conflict-oriented reading.
   If a lens genuinely doesn't apply, set it to null rather than forcing one in. Do not use NLP framing. Do not use CBT as a dream-symbol interpretation framework — CBT belongs to later coping/action work for recurring nightmares, never to "what this dream means."
6. EMOTION REFLECTION — ONLY when the input contains a section named FEELINGS THE DREAMER REPORTED. Those feelings are what the dreamer says they felt, chosen from a fixed list: they are the dreamer's own report, NOT part of what happened in the dream, and NEVER a sign of anyone's mental state. Write one or two sentences in emotionReflection that say plainly these are the dreamer's own reported feelings, keep them clearly separate from the dream's events, and let them shape the reading: which possible thread you choose and the tone of the question. Always attribute the feelings to the dreamer's own report (for example "You named fear and longing" in English, or "בחרתם לציין פחד וגעגוע" in Hebrew, using the exact words listed and always saying who named them: the dreamer; never an impersonal phrasing such as "a feeling of ... was received"). Never infer a state of mind from the feelings: do not use "indicate", "suggest that you are", "point to", "reveal" about the dreamer, nor words such as "conflict", "inner conflict", "coping", "unresolved" (in Hebrew: "להעיד על", "מעיד", "מצביע על", "קונפליקט", "התמודדות עם", "מטריד"). Say only what the dreamer named, and offer with "perhaps" (in Hebrew "אולי") how it might sit beside the chosen moment, and never say the dream "contains", "has", "shows" or "is full of" these feelings or present them as events of the dream. Use possibility language only. Never diagnose, never say what a feeling "indicates", "reveals" or "means about you", and never add a feeling that was not listed. If that section is absent, emotionReflection MUST be null.
7. SUMMARY — one short personal sentence (about 25 words at most) that gathers the chosen moment, the dreamer's association and, if present, the reported feelings. Possibility language, nothing new, never a conclusion or a diagnosis. If the summary mentions the feelings, it must say that the dreamer named them, never that the dream evoked or contained them.

${languageParagraph}

${language === 'he' ? buildHebrewStyleInstruction(addressPreference) : ''}

${language === 'he' ? buildHebrewAddressInstruction(addressPreference) : ''}

${buildLanguageIntegrityInstruction(language)}

Scientific discipline: never use generic internet dream-dictionary meanings (e.g. "water = emotion", "teeth = anxiety", "snake = sexuality"). Ground everything primarily in the dream's own context and the dreamer's own stated words — never a symbol lookup table. Never invent an event, detail, or feeling that is not in the dream or in the dreamer's own response.

Keep every field short: observation and possibleThread are 1-2 sentences; personalAssociation is one short sentence; continuityQuestion is exactly one question; emotionReflection is 1-2 sentences when present; summary is exactly one sentence; each present lens is 1-2 sentences, clearly framed as a possibility.

For groundingStatement, write a short, calm, non-alarmist line making clear this is a reflection, not a diagnosis or definitive interpretation (exact wording is not critical — it will be normalized).

Respond with only the DreamReflectionResult JSON object matching the provided schema — no prose outside it.`;
}

/**
 * A last, deterministic safety net for the two texts that talk about the dreamer's REPORTED feelings. The prompt forbids inferring a
 * state of mind from them, but a language model does not always obey (a Hebrew sample said the feelings "may indicate coping with
 * inner conflicts"). Any of these phrases and that text is dropped, so a diagnostic-sounding line is never shown or saved; the rest of
 * the reflection is untouched.
 */
const DIAGNOSTIC_PATTERNS: RegExp[] = [
  /\b(indicat\w*|diagnos\w*|disorder\w*|symptom\w*|suffer\w*|depress\w*|traumat\w*|inner conflict\w*|unresolved (issues|conflict)\w*|coping with)\b/i,
  /\b(suggest|suggests|suggesting) that you (are|have|may be|might be)\b/i,
  /(להעיד על|מעיד על|מעידים על|עשויים להעיד|עשוי להעיד|מצביע על|מצביעים על|הפרעה|אבחנ|דיכאון|טראומ|קונפליקט|התמודדות עם|סובל)/,
];

export function feelingsTextLooksDiagnostic(text: string | null | undefined): boolean {
  if (typeof text !== 'string' || text.trim() === '') return false;
  return DIAGNOSTIC_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * For the two REQUIRED interpretive fields (the thread and the question) a diagnostic-sounding phrase cannot simply be dropped, so it asks for
 * a regeneration instead (the optional feelings text and summary are dropped by the caller). Returns the correction note, or null.
 */
export function diagnosticWordingNote(result: Pick<DreamReflectionResult, 'possibleThread' | 'continuityQuestion'>): string | null {
  if (!feelingsTextLooksDiagnostic(result.possibleThread) && !feelingsTextLooksDiagnostic(result.continuityQuestion)) return null;
  return '\n\nCORRECTION: your previous attempt used wording that infers a state of mind or a conflict in the dreamer ("indicate", "point to", "conflict", "להעיד על", "קונפליקט" and similar). Regenerate the entire response from scratch, offering only possibilities in plain words ("perhaps", "אולי") and never concluding anything about the dreamer.';
}

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
  // Added later: a reflection saved or returned without them stays valid.
  if (c.emotionReflection !== undefined && c.emotionReflection !== null && typeof c.emotionReflection !== 'string') return null;
  if (c.summary !== undefined && c.summary !== null && typeof c.summary !== 'string') return null;

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
  required: ['observation', 'personalAssociation', 'possibleThread', 'continuityQuestion', 'lenses', 'confidenceNotes', 'emotionReflection', 'summary', 'groundingStatement'],
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
    emotionReflection: { type: ['string', 'null'] },
    summary: { type: ['string', 'null'] },
    groundingStatement: { type: 'string' },
  },
} as const;
