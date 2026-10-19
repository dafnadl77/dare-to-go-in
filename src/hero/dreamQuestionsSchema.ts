import type { AppLanguage } from './appLanguage.js';
import type { DreamAnalysis } from './dreamAnalysisSchema.js';
import { buildLanguageIntegrityInstruction } from './languageIntegrity.js';
import { buildHebrewAddressInstruction, type AddressPreference } from './addressPreference.js';
import { buildHebrewNeutralSingularInstruction, feelingsTextLooksDiagnostic } from './dreamReflectionSchema.js';
import { namesBoth, sharesContentWord } from './groundedText.js';
import { garbledTextNote, isGenericQuestion, linkAddsSomethingNew, unsupportedInsertionNote } from './reflectionChecks.js';

/**
 * Questions written for THIS dream. Each of the (up to six) selectable moments gets
 *  - an association question: what that specific moment brings up, asked about a concrete detail of the dream; and
 *  - an optional link question: whether the dreamer sees any link between that moment and one other concrete thing in the dream.
 * A blank string means "no good question for this one": the interface then keeps the fixed question it always had, or skips the
 * optional link step. Nothing here interprets the dream; the questions only ask.
 */
export interface DreamQuestions {
  /** One per selectable moment, in the same order. '' = use the fixed question. */
  associationQuestions: string[];
  /** One per selectable moment, in the same order. '' = no link step. */
  linkQuestions: string[];
}

export type DreamQuestionsResult = { status: 'ok'; questions: DreamQuestions } | { status: 'error' };

export const MAX_QUESTION_WORDS = 24;
const MAX_QUESTION_CHARS = 180;

/** What the client sends besides the moments: the structured facts the analysis already extracted. Bounded; it is only prompt input. */
export interface DreamQuestionFacts {
  summary: string;
  relationships: string[];
  sequence: string[];
  unresolved: string[];
  emotionalTone: string | null;
}

const clip = (text: string, max: number) => text.trim().slice(0, max);

export function factsFromAnalysis(analysis: DreamAnalysis): DreamQuestionFacts {
  return {
    summary: clip(analysis.summary ?? '', 400),
    relationships: (analysis.relationships ?? []).slice(0, 8).map((r) => clip(`${r.from} → ${r.to}: ${r.relationship}`, 160)),
    sequence: [...(analysis.sequence ?? [])]
      .sort((a, b) => a.order - b.order)
      .slice(0, 10)
      .map((s) => clip(s.description, 160)),
    unresolved: (analysis.unresolvedDetails ?? []).slice(0, 6).map((u) => clip(u, 160)),
    emotionalTone: analysis.emotionalTone ? clip(analysis.emotionalTone, 80) : null,
  };
}

export function validateDreamQuestionFacts(candidate: unknown): DreamQuestionFacts {
  const empty: DreamQuestionFacts = { summary: '', relationships: [], sequence: [], unresolved: [], emotionalTone: null };
  if (typeof candidate !== 'object' || candidate === null) return empty;
  const c = candidate as Record<string, unknown>;
  const list = (v: unknown, n: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, n).map((x) => clip(x, 200)) : []);
  return {
    summary: typeof c.summary === 'string' ? clip(c.summary, 400) : '',
    relationships: list(c.relationships, 8),
    sequence: list(c.sequence, 10),
    unresolved: list(c.unresolved, 6),
    emotionalTone: typeof c.emotionalTone === 'string' ? clip(c.emotionalTone, 80) : null,
  };
}

export function buildDreamQuestionsInput(sourceText: string, moments: string[], facts: DreamQuestionFacts): string {
  const lines = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join('\n') : '- none');
  return `DREAM (original text, verbatim): ${sourceText || '(not provided)'}

STRUCTURED FACTS ALREADY EXTRACTED FROM THE DREAM (use only these, never invent beyond them):
- Summary: ${facts.summary || 'unknown'}
- Emotional tone (if known): ${facts.emotionalTone ?? 'unknown'}
- Relationships between people/things:
${lines(facts.relationships)}
- Order of events:
${lines(facts.sequence)}
- Left unresolved or ambiguous in the dream:
${lines(facts.unresolved)}

THE MOMENTS THE DREAMER CAN CHOOSE FROM, IN ORDER (write exactly one pair of questions for each, in this order):
${moments.map((m, i) => `${i + 1}. ${m}`).join('\n')}`;
}

export function buildDreamQuestionsSystemPrompt(language: AppLanguage, addressPreference: AddressPreference): string {
  const languageName = language === 'he' ? 'Hebrew' : 'English';
  const hebrew =
    language === 'he'
      ? `HEBREW: write the way a thoughtful Hebrew speaker would say it aloud, short plain sentences with everyday words, never a translation from English. ${addressPreference === 'neutral' ? buildHebrewNeutralSingularInstruction() : buildHebrewAddressInstruction(addressPreference)} ${addressPreference === 'neutral' ? 'This dreamer\'s gender is unknown: write EVERY question impersonally and never address the dreamer at all, with no "את", no "אתה" and no second-person verb or possessive form of any gender ("מה עולה כשחושבים על...", "איך זה לחשוב על...", "מה ... מזכיר"). ' : ''}Prefer impersonal forms ("מה עולה כשחושבים על...", "אפשר לשאול..."). Use Hebrew letters only, no English word. Copy the dream's own words exactly as they are in the input; never coin or conjugate an unusual word. Use a spoken question pattern ("מה עולה כשחושבים על ...", "איך זה לחשוב על ...", "מה ... מזכיר ..."), at most one subordinate clause, no chains of "שבו/שבה/ש..." and no noun after noun without a connecting word.`
      : '';
  return `You write the questions a thoughtful listener would ask a dreamer about THEIR OWN dream, after the dreamer has chosen which moment stayed with them.

For each numbered moment you write two questions, in ${languageName}:

1. associationQuestion — asks what that specific moment brings up for the dreamer. It must be anchored in a concrete detail of THIS dream near that moment (what happened there, where, with whom, what came before or after, what was left unresolved), so that it could not be pasted into another dream. Open, answerable in a sentence or two.
2. linkQuestion — names that moment AND exactly one other concrete thing that is really in the dream (another moment, an event from the order of events, a relationship, a detail left unresolved) and asks, openly, whether the dreamer sees any link between the two. Never claim there is a link; "no link" must be an easy answer. If the dream holds no second concrete thing worth pairing with that moment (a very short dream), write an empty string "" for linkQuestion. An empty string is better than a forced question.

Rules for every question:
- ONE question, one sentence, at most ${MAX_QUESTION_WORDS} words, ending with a question mark.
- Use the dream's own words for the things you name. Never invent a person, place, object, event, feeling or circumstance, and never assume anything about the dreamer's life, past or relationships.
- Never presuppose a feeling or an answer ("why were you afraid...", "what does your fear tell you..."). Never explain or interpret the dream, never say what anything means, no dream-dictionary meanings, no diagnosis, no advice, no therapy language.
- Plain, simple grammar, preferably 12 to 18 words: no stacked subordinate clauses ("without her who ..."), no awkward or coined verb forms. If a detail is hard to phrase as a clause, name it as a noun phrase and ask about that ("the closed door", "mother in the kitchen").
- The associationQuestion must name the moment AND one more concrete detail of the dream next to it (so it could not be asked about any other dream). The linkQuestion must name a DIFFERENT detail than the one the associationQuestion used: its job is to open something new, not to repeat the first question.
- Do not turn a detail of the dream into an intention, plan or motive that the dream does not state (never "what you were about to take", "what you wanted to do"): repeat what the dream says, and no more.
- Do not conjugate the dreamer's actions in the first person or second person; refer to them as things ("the waiting", "the locked door", "the key being too small") or impersonally.
- In a linkQuestion BOTH things are named inside the question, in the dream's own words ("Is there any link between X and Y?"). A vague "between these things" is not acceptable; if you cannot name two concrete things from the dream, return an empty string.
- Not a yes/no question, and not "why".
- Make the questions differ from each other: do not open two of them with the same words.
- Do not copy the fixed question "what comes up when you think about X now"; ask something more specific.

${hebrew}

${buildLanguageIntegrityInstruction(language)}

Respond with only the JSON object matching the provided schema: "questions" is an array with ONE item for EACH numbered moment (do not skip any, even when its linkQuestion is an empty string). Each item has "moment" (the number of the moment, as listed), "associationQuestion" and "linkQuestion".`;
}

export const DREAM_QUESTIONS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['moment', 'associationQuestion', 'linkQuestion'],
        properties: { moment: { type: 'integer' }, associationQuestion: { type: 'string' }, linkQuestion: { type: 'string' } },
      },
    },
  },
} as const;

/**
 * Reads the model's answer into two lists aligned with the moments. Each item is matched to its moment by number, so a skipped,
 * repeated or out-of-range item only blanks that one moment (the interface then keeps the fixed question) instead of discarding
 * everything. Null only when the answer has no usable shape at all.
 */
export function validateRawDreamQuestions(candidate: unknown, expectedLength: number): DreamQuestions | null {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const items = (candidate as Record<string, unknown>).questions;
  if (!Array.isArray(items)) return null;
  const associationQuestions: string[] = Array(expectedLength).fill('');
  const linkQuestions: string[] = Array(expectedLength).fill('');
  const seen = new Set<number>();
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    const q = item as Record<string, unknown>;
    const at = typeof q.moment === 'number' ? q.moment - 1 : -1;
    if (!Number.isInteger(at) || at < 0 || at >= expectedLength || seen.has(at)) continue;
    seen.add(at);
    if (typeof q.associationQuestion === 'string') associationQuestions[at] = q.associationQuestion;
    if (typeof q.linkQuestion === 'string') linkQuestions[at] = q.linkQuestion;
  }
  return { associationQuestions, linkQuestions };
}

export type QuestionProblem = 'empty' | 'too_long' | 'not_a_question' | 'several_questions' | 'diagnostic' | 'not_grounded';

/** Why a generated question must not be shown (none = it is fine). A blank is "no question", not a problem, and is handled by the caller. */
export function findQuestionProblems(question: string, grounding: (string | null | undefined)[]): QuestionProblem[] {
  const q = question.trim();
  if (!q) return ['empty'];
  const problems: QuestionProblem[] = [];
  if (q.length > MAX_QUESTION_CHARS || q.split(/\s+/).length > MAX_QUESTION_WORDS) problems.push('too_long');
  const marks = (q.match(/[?？]/g) ?? []).length;
  if (marks === 0 || !/[?？]$/.test(q)) problems.push('not_a_question');
  if (marks > 1) problems.push('several_questions');
  if (feelingsTextLooksDiagnostic(q)) problems.push('diagnostic');
  if (!sharesContentWord(q, ...grounding)) problems.push('not_grounded');
  return problems;
}

/**
 * Keeps every question that passes the checks and blanks the rest (blank = the interface's fixed question / no link step). Never
 * rewrites a question. `grounding` is the material each question must touch: the dream text, plus the moment it was written for.
 */
export function sanitizeDreamQuestions(raw: DreamQuestions, moments: string[], sourceText: string, language: AppLanguage | null = null): DreamQuestions {
  const material = [sourceText, ...moments];
  const base = (q: string, i: number) => {
    const text = q.trim();
    if (!text) return '';
    if (findQuestionProblems(text, [sourceText, moments[i]]).length > 0) return '';
    // No circumstance, motive or feeling that the dream does not state ("what you were about to take", "alone"), and no garbled text.
    if (unsupportedInsertionNote([text], material, language) || garbledTextNote([text])) return '';
    return text;
  };
  const association = raw.associationQuestions.map((q, i) => {
    const text = base(q, i);
    // Not a question that could be about any dream: it names the moment AND one more concrete detail of this dream.
    return text && !isGenericQuestion(text, moments[i], sourceText) ? text : '';
  });
  const link = raw.linkQuestions.map((q, i) => {
    const text = base(q, i);
    if (!text) return '';
    // A link question names the chosen moment AND something else from the dream, and that something is NEW: not already in the association question.
    if (!namesBoth(text, moments[i], sourceText)) return '';
    if (association[i] && !linkAddsSomethingNew(text, association[i], moments[i], sourceText)) return '';
    return text;
  });
  return { associationQuestions: association, linkQuestions: link };
}

/** A correction note for a regeneration when too many questions were rejected, or null. */
export function questionsRetryNote(raw: DreamQuestions, sanitized: DreamQuestions): string | null {
  const rejected = raw.associationQuestions.filter((q, i) => q.trim() && !sanitized.associationQuestions[i]).length;
  if (rejected === 0) return null;
  return '\n\nCORRECTION: some of your previous questions were unusable (too long, not a single question, too general, adding something the dream does not say, or worded like a diagnosis). Write every question again: one short question, at most 24 words, that names the moment AND one more concrete detail of the dream, in the dream\'s own words.';
}
