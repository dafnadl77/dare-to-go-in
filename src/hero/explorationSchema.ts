import type { AppLanguage } from './appLanguage.js';
import type { DreamDepth } from './dreamDepth.js';
import { maxAlternativeReadings } from './dreamDepth.js';
import { findQuestionProblems } from './dreamQuestionsSchema.js';
import { buildLanguageIntegrityInstruction } from './languageIntegrity.js';
import { buildHebrewAddressInstruction, type AddressPreference } from './addressPreference.js';
import { buildHebrewNeutralSingularInstruction } from './dreamReflectionSchema.js';
import { mostlyGrounded, overlapRatio } from './groundedText.js';
import { eventOrder, type DreamSegment } from './dreamSegments.js';
import { isUnsureAnswer, FOCI, MAX_QUESTION_WORDS, type ClaimReport, type QuestionFocus, type ReplyRaw, type WholeRaw, type WholeReport } from './claimCheck.js';
import { exploredInOrder, type Exploration, type MomentId } from './exploration.js';

/**
 * THE THREE CALLS OF THE MULTI-MOMENT JOURNEY (stage 3b, reworked in the fix round, doc 30): prompts, JSON schemas and parsing. The
 * model never returns free paragraphs any more: every sentence comes with its SOURCE (a numbered part of the dream, a verbatim piece
 * of what the dreamer said, or a hedged possibility resting on those), and claimCheck.ts decides what of it may be shown. No network.
 *
 *  1. moment-question: two candidate questions about the moment the dreamer chose (the first moment too), each saying what it asks
 *     about; the first that passes is asked.
 *  2. moment-reply: dream sentences / her sentences / two possibilities, and at most one clarification when something is missing.
 *  3. whole-view: sentences with sources, links whose two ends rest on their own moments, what recurs, one difference, readings on
 *     explored parts, a closing question. With one moment: a first look, never "the whole picture".
 */

export { MAX_QUESTION_WORDS };
/** Above this share of shared content words, a new line is considered a repeat of an earlier one. */
export const REPEAT_RATIO = 0.6;

// ------------------------------------------------------------------------------------------------ the context every call receives

export interface PriorMoment {
  id: MomentId;
  label: string;
  /** The parts of the dream the moment rests on (resolved by the server against this dream's parts). */
  segments: number[];
  question: string;
  answer: string;
  followUp: { question: string; answer: string | null } | null;
  insight: { observation: string; reflection: string; possibility: string } | null;
  focus: QuestionFocus | null;
  subject: string | null;
  /** The first question and its "I don't know", when a different question followed. */
  firstTry: { question: string; answer: string } | null;
}

/** What already happened in this journey, in exploration order, built only from the stored Exploration (never from free client text). */
export function priorMoments(e: Exploration, except?: MomentId, segmentsOf: (id: MomentId) => number[] = () => []): PriorMoment[] {
  return exploredInOrder(e)
    .filter(({ moment }) => moment.id !== except)
    .map(({ moment, entry }) => ({
      id: moment.id,
      label: moment.label,
      segments: segmentsOf(moment.id),
      question: entry.question,
      answer: entry.answer ?? '',
      followUp: entry.followUp ? { question: entry.followUp.question, answer: entry.followUp.skipped ? null : entry.followUp.answer } : null,
      insight: entry.insight,
      focus: entry.focus ?? null,
      subject: entry.subject ?? null,
      firstTry: entry.firstTry ?? null,
    }));
}

/** Her usable words in a moment: answer and clarification, never an "I don't know". */
export const usableAnswers = (p: { answer: string; followUp: { answer: string | null } | null }) => [p.answer, p.followUp?.answer ?? ''].filter((a) => a && !isUnsureAnswer(a));

const q = (t: string) => `"${t.replace(/"/g, "'")}"`;

function partsBlock(segments: readonly DreamSegment[], sourceText: string): string {
  const known: string[] = [];
  for (let i = 0; i < segments.length && known.length < 10; i++)
    for (let j = i + 1; j < segments.length && known.length < 10; j++) {
      const o = eventOrder(segments, i, j);
      if (o === 'before') known.push(`s${i} before s${j}`);
      if (o === 'after') known.push(`s${j} before s${i}`);
    }
  return `THE DREAM, IN THE DREAMER'S OWN WORDS: ${sourceText}

THE DREAM'S PARTS (numbered; every sentence about the dream rests on ONE of them, by its number):
${segments.map((s) => `[s${s.id}] ${q(s.text)}`).join('\n')}

ORDER OF EVENTS THAT THE TEXT ITSELF STATES: ${known.length ? known.join('; ') : 'none'}. The order of the telling is NOT the order of events: for any other pair nobody knows which came first, so never write "before", "after", "then", "at the end" or "first" about them.`;
}

function priorBlock(prior: PriorMoment[]): string {
  if (prior.length === 0) return 'MOMENTS ALREADY EXPLORED: none yet.';
  return `MOMENTS ALREADY EXPLORED, IN ORDER (everything here was already asked, answered and shown to the dreamer):
${prior
  .map((p, i) => {
    const lines = [`${i + 1}. [${p.id}] Moment: ${q(p.label)} (parts ${p.segments.map((s) => `s${s}`).join(', ') || 'unknown'})`];
    if (p.firstTry) lines.push(`   First question: ${q(p.firstTry.question)} — she answered ${q(p.firstTry.answer)} (that is "I don't know": not content)`);
    lines.push(`   Question asked: ${q(p.question)}${p.focus ? ` [asked about: ${p.focus}${p.subject ? `, ${q(p.subject)}` : ''}]` : ''}`);
    lines.push(`   Her answer (exact words): ${q(p.answer)}${isUnsureAnswer(p.answer) ? ' (that is "I don\'t know": not content, never evidence)' : ''}`);
    if (p.followUp) lines.push(`   Clarification asked: ${q(p.followUp.question)}`, `   Its answer: ${p.followUp.answer ? q(p.followUp.answer) : '(skipped)'}`);
    if (p.insight) lines.push(`   Insight already shown: ${q([p.insight.observation, p.insight.reflection, p.insight.possibility].filter(Boolean).join(' '))}`);
    return lines.join('\n');
  })
  .join('\n')}`;
}

function feelingsBlock(feelings: string): string {
  return feelings
    ? `\n\nFEELINGS SHE REPORTED AFTER THE DREAM (chosen from a fixed list; NOT events of the dream, never a sign of a state of mind): ${feelings}`
    : '';
}

// ------------------------------------------------------------------------------------------------ shared style

function styleBlock(language: AppLanguage, address: AddressPreference): string {
  if (language !== 'he') return `Write in plain, warm, everyday English. Short sentences, one idea each. ${buildLanguageIntegrityInstruction(language)}`;
  const addressRule = address === 'neutral' ? buildHebrewNeutralSingularInstruction() : buildHebrewAddressInstruction(address);
  return `HEBREW: write the way a thoughtful Hebrew speaker would say it aloud, never a translation from English: short, plain, active sentences (at most about 16 words), everyday words, no chains of "ש..." clauses, never coin a word, never glue "ש" to a word that cannot take it. When you speak of the dreamer together with someone else, use the plural that fits the people (a woman and her brother: "אתם", "הלכתם"). Hebrew letters only. ${addressRule}
${buildLanguageIntegrityInstruction(language)}`;
}

const FAITHFULNESS = `FAITHFULNESS (the most important rule): the dream, what she said, and what might be made of it are THREE DIFFERENT THINGS and are never mixed. What she said in an answer never becomes something the dream showed. Never invent a feeling, memory, event, person, place, time, order of events or relationship. Who did what to whom stays exactly as the dream says (if "someone" sang, she did not sing). No diagnosis, no therapy language, no advice, no fixed meaning for an image ("symbolizes", "represents", "מסמל", "מייצג"). The dreamer is the authority on meaning.`;

const ADDRESS_RULE = `You speak TO the dreamer: never "I", "my" or a first-person verb outside a quotation ("אחיך", not "אחי"; "אבא שלך", not "אבא שלי"; "הלכת", not "הלכתי").`;

// ------------------------------------------------------------------------------------------------ 1. moment-question

export function buildMomentQuestionSystemPrompt(language: AppLanguage, address: AddressPreference): string {
  return `You are a thoughtful listener in a dream exploration. The dreamer chose a moment of their dream. Offer TWO different candidate questions about this moment; the first that passes the checks will be asked.

What makes a question worth answering: it opens curiosity and a personal connection, not only more description. Good kinds: what stood out to her in this moment, what surprised her, what drew her to choose this moment, what it reminds her of (if anything), what in it feels strange or important to her. Ask about how it looked or sounded at most once in a row (never two such questions one after the other). Never assume what she felt: ask, don't tell.

Each candidate:
- is about THIS moment's parts only, in their own words. It never presupposes a place, a time, a person or an event from another part of the dream (if the key was given by the brother in one part and was too small at the door in another, a question about the door never says the key was given at the door).
- is ONE sentence of at most ${MAX_QUESTION_WORDS} words ending with a question mark, ONE question only (never two joined by "ו"), plain and easy to answer in a sentence or two; not yes/no, not "why", never presupposes a feeling or something she did that the dream does not say.
- says what it asks about: "focus" (one of ${FOCI.join(', ')}) and "subject" (the word of this moment it is about).
- never asks again what was already asked or answered, not even in other words: the earlier questions are listed with what they asked about; prefer a focus that was not used yet, and do not ask about a feeling she already named.
- may build on a short phrase she said earlier ("buildsOn", copied exactly, or "").
${ADDRESS_RULE}

If the input says she answered "I don't know" to this moment's first question: ask ONE simpler, concrete question from a different focus (for example what she sees or hears there), gently, never pressing, never about what she did not know.

${FAITHFULNESS}

${styleBlock(language, address)}

Respond with only the JSON object of the schema.`;
}

export function buildMomentQuestionInput(p: {
  sourceText: string;
  segments: readonly DreamSegment[];
  prior: PriorMoment[];
  moment: { id: MomentId; label: string; segments: number[] };
  otherMoments: string[];
  alternative: { question: string; answer: string } | null;
}): string {
  return `${partsBlock(p.segments, p.sourceText)}

${priorBlock(p.prior)}

OTHER MOMENTS NOT EXPLORED YET (only so you know they exist): ${p.otherMoments.length ? p.otherMoments.map(q).join(', ') : 'none'}

THE MOMENT SHE CHOSE NOW: [${p.moment.id}] ${q(p.moment.label)}, resting on parts ${p.moment.segments.map((s) => `s${s}`).join(', ') || '(unknown: ask about the moment as named)'}${
    p.alternative ? `\n\nSHE WAS ALREADY ASKED ${q(p.alternative.question)} ABOUT THIS MOMENT AND ANSWERED ${q(p.alternative.answer)} ("I don't know"). Ask one simpler, different question.` : ''
  }`;
}

export const MOMENT_QUESTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'focus', 'subject', 'buildsOn'],
        properties: { question: { type: 'string' }, focus: { type: 'string', enum: [...FOCI] }, subject: { type: 'string' }, buildsOn: { type: 'string' } },
      },
    },
  },
} as const;

export interface QuestionCandidate {
  question: string;
  focus: string;
  subject: string;
  buildsOn: string;
}
export interface MomentQuestionRaw {
  candidates: QuestionCandidate[];
}

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : []);
const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : typeof v === 'string' && /^s?\d+$/.test(v.trim()) ? Number(v.trim().replace(/^s/, '')) : -1);

export function parseMomentQuestion(candidate: unknown): MomentQuestionRaw | null {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const candidates = arr((candidate as Record<string, unknown>).candidates)
    .map((c) => ({ question: s(c.question), focus: s(c.focus), subject: s(c.subject), buildsOn: s(c.buildsOn) }))
    .filter((c) => c.question)
    .slice(0, 3);
  return candidates.length ? { candidates } : null;
}

// ------------------------------------------------------------------------------------------------ 2. moment-reply

export function buildMomentReplySystemPrompt(language: AppLanguage, address: AddressPreference): string {
  return `You are a thoughtful listener in a dream exploration. The dreamer chose a moment of their dream, was asked about it and answered. Give back a short insight on THIS moment as separate sentences, each with its source.

"dream" (1 or 2 sentences): what THIS moment's parts show, plainly. Each sentence rests on ONE part of this moment ("segment": its number) and uses only that part's own words, told to her in the second person ("הגעת", "אחיך נתן לך"). Copy the part's main verb exactly as the part writes it ("action"); say who did it ("actor": "dreamer" when the part's verb is hers, a first-person verb; otherwise the part's own word for who did it; "unknown" when the part names no one) and to whom ("target": "dreamer", a word of the part, or ""). Add nothing: no time word ("after", "then", "at the end") the part does not have, no detail from her answer, nothing from another part, never a link between two events, never a negation the part does not have (and keep the one it has).

"user" (1 or 2 sentences): what SHE said, given back in the second person past ("אמרת ש..."), with "quote": a short piece copied EXACTLY from her answer. Only her words: no feeling, time or detail she did not say; a short answer stays short. If her answer is "I don't know", give nothing.

"possibilities" (exactly TWO different ones): what she might take from it. Every sentence of each starts with a hedge ("אולי", "ייתכן", "אפשר לראות"; "perhaps"). Each rests on the sentences above ("basis": ids like "d0", "u1"). It may give an image a possible sense, as an open possibility she can take or leave; it never gives her a feeling she did not name (in any wording), never says what another person in the dream wanted, meant or felt, never fixes a meaning ("מסמן", "מסמל", "דימוי ל"), never says something "מצביע על" or "מעיד על" anything, never puts events in an order the dream does not state, never states a fact, never repeats an insight already shown. Make it specific to her words and this moment, not a general statement about life.

Clarification: most answers need NONE. Ask one exactly when her answer POINTS to something specific without naming it ("something that happened once", "that time", "someone", "משהו שקרה פעם", "מישהו") or could mean two opposite things: "missingInformation" (what is missing, briefly) and "followUpQuestion" (ONE short question asking exactly that, at most ${MAX_QUESTION_WORDS} words). Otherwise both are "". Never after "I don't know".
If the input says the CLARIFICATION WAS ANSWERED, write the insight again using that answer too, and set both to "".

${ADDRESS_RULE}

${FAITHFULNESS}

${styleBlock(language, address)}

Respond with only the JSON object of the schema.`;
}

export function buildMomentReplyInput(p: {
  sourceText: string;
  segments: readonly DreamSegment[];
  prior: PriorMoment[];
  moment: { id: MomentId; label: string; segments: number[] };
  question: string;
  answer: string;
  followUp: { question: string; answer: string } | null;
  feelings: string;
}): string {
  return `${partsBlock(p.segments, p.sourceText)}

${priorBlock(p.prior)}${feelingsBlock(p.feelings)}

THE MOMENT NOW: [${p.moment.id}] ${q(p.moment.label)}, resting on parts ${p.moment.segments.map((x) => `s${x}`).join(', ') || '(unknown)'} — "dream" sentences may use ONLY these parts.
THE QUESTION ASKED ABOUT IT: ${q(p.question)}
HER ANSWER (exact words): ${q(p.answer)}${
    p.followUp
      ? `
THE CLARIFICATION WAS ANSWERED. Clarification asked: ${q(p.followUp.question)}
Its answer (exact words): ${q(p.followUp.answer)}`
      : ''
  }`;
}

export const MOMENT_REPLY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dream', 'user', 'possibilities', 'missingInformation', 'followUpQuestion'],
  properties: {
    dream: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['segment', 'action', 'actor', 'target', 'text'],
        properties: { segment: { type: 'integer' }, action: { type: 'string' }, actor: { type: 'string' }, target: { type: 'string' }, text: { type: 'string' } },
      },
    },
    user: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['quote', 'text'], properties: { quote: { type: 'string' }, text: { type: 'string' } } },
    },
    possibilities: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['basis', 'text'], properties: { basis: { type: 'array', items: { type: 'string' } }, text: { type: 'string' } } },
    },
    missingInformation: { type: 'string' },
    followUpQuestion: { type: 'string' },
  },
} as const;

export interface MomentReplyRaw extends ReplyRaw {
  followUpQuestion: string | null;
  missingInformation: string | null;
}

export function parseMomentReply(candidate: unknown): MomentReplyRaw | null {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const c = candidate as Record<string, unknown>;
  const dream = arr(c.dream).map((x) => ({ segment: int(x.segment), action: s(x.action), actor: s(x.actor), target: s(x.target), text: s(x.text) })).filter((x) => x.text).slice(0, 4);
  const user = arr(c.user).map((x) => ({ quote: s(x.quote), text: s(x.text) })).filter((x) => x.text).slice(0, 4);
  const possibilities = arr(c.possibilities)
    .map((x) => ({ basis: Array.isArray(x.basis) ? x.basis.filter((b): b is string => typeof b === 'string').map((b) => b.trim()) : [], text: s(x.text) }))
    .filter((x) => x.text)
    .slice(0, 3);
  if (dream.length === 0 && user.length === 0 && possibilities.length === 0) return null;
  return { dream, user, possibilities, followUpQuestion: s(c.followUpQuestion) || null, missingInformation: s(c.missingInformation) || null };
}

/** An answer that points to something specific without naming it: the case where a clarification really changes the insight. */
const VAGUE_REFERENCE = /(משהו שקרה|דבר שקרה|משהו שהיה|מה שקרה (?:אז|פעם)|מישהו ש|פעם אחת|באותה פעם|something (?:that )?happened|that time|someone (?:who|I)|a certain)/i;

/** A retry note when the answer is vague and no clarification was asked. */
export function clarificationNote(result: { followUpQuestion: string | null }, answer: string | undefined): string | null {
  if (!answer || !VAGUE_REFERENCE.test(answer) || isUnsureAnswer(answer) || result.followUpQuestion) return null;
  return '\n\nCORRECTION: her answer points to something specific without naming it ("something that happened", "that time", "someone"): ask ONE clarification question about exactly that, and fill "missingInformation". Write the whole reply again.';
}

/**
 * Decides, deterministically, whether the clarification the model proposed may be shown. It is dropped (never rewritten) when no missing
 * piece was named, when the dreamer said they do not know, when it asks for what the answer already says, when it repeats an earlier
 * question, or when it is not a usable single question about this dream. Returns the question or null.
 */
export function keepFollowUp(result: { followUpQuestion: string | null; missingInformation: string | null }, p: { sourceText: string; momentLabel: string; answer: string; prior: { question: string; followUp: { question: string } | null }[]; refreshing: boolean }): string | null {
  const fq = result.followUpQuestion;
  if (!fq || p.refreshing || !result.missingInformation) return null;
  if (isUnsureAnswer(p.answer) || /(^|\s)(לא יודעת?|לא בטוחה?|don'?t know|not sure)/i.test(p.answer)) return null;
  if (findQuestionProblems(fq, [p.sourceText, p.momentLabel, p.answer]).length > 0) return null;
  if (overlapRatio(fq, p.answer) >= 0.75) return null;
  const earlier = p.prior.flatMap((m) => [m.question, m.followUp?.question ?? '']).filter(Boolean);
  if (earlier.some((x) => overlapRatio(fq, x) >= REPEAT_RATIO)) return null;
  return fq;
}

// ------------------------------------------------------------------------------------------------ 3. whole-view

export function buildWholeViewSystemPrompt(language: AppLanguage, address: AddressPreference): string {
  return `You are a thoughtful listener in a dream exploration. The dreamer explored one or more moments of their dream (listed with their parts, questions, her answers and the insights already shown). Write THE WHOLE VIEW: what becomes visible only when the explored moments are seen together. Never a recap of the insights.

Every piece says its source:
- "overview" (1 to 3 sentences): what becomes visible only when the explored moments are seen TOGETHER. Mostly "interpretation" sentences resting on the moments ("basis": their ids, e.g. "m1", "m3"); a "dream" or "user" sentence only when it brings something no insight already showed. Never retell the insights. Each sentence has "source":
  - "dream": about ONE explored part ("segment"), with its verb copied ("action", never empty), "actor" and "target" exactly as for a moment's insight; only the part's words; no time word the part does not have; never a link between two events. Never "אמרת" in a dream sentence: what she said is a "user" sentence.
  - "user": what she said in ONE explored moment ("moment": its id; "quote": a short piece copied EXACTLY from her answer there), second person past, only her words. A feeling she named in one moment is never moved to another.
  - "interpretation": a possibility; EVERY sentence starts with a hedge ("אולי", "ייתכן", "אפשר לראות"); "basis": the explored moments it rests on ("m1", "m3") or overview sentences ("o0"). No feeling she did not name.
- "connections": links between TWO DIFFERENT explored moments ("from", "to": their ids), only where something real joins them. "fromQuote" is copied EXACTLY from the first moment's part or her answer there, "toQuote" likewise from the second; never her "I don't know". "link" is one hedged sentence; "title" a short name (at most 5 words) made of the two moments' own words. None is the normal answer when nothing real joins them; never with one moment.
- "recurring": "element" is the word or feeling that truly comes back (only one she or the dream named), "quotes" show it in EACH moment where it recurs (copied exactly, at least two moments), "text" one sentence in those moments' words. Empty ("" and []) when nothing truly recurs: never force one.
- "contrast": one real difference between exactly TWO explored moments, "quotes" one from each, "text" in their words. Empty when there is none.
- "readings": other ways to see it, each on ONE explored part ("segment"), every sentence hedged, never a fixed meaning. At most as READINGS ALLOWED says; none rather than a forced one.
- "closing": ONE new question for her to keep, about her dream and her life, built from her own words ("moment" and "quote" copied exactly, or "" when it uses none), at most 20 words, not yes/no, never a therapy exercise, never repeating a question already asked.

With ONE explored moment this is a FIRST LOOK: no connections, no recurring, no contrast; never say "the whole picture" or "the whole dream"; give one hedged possibility (an "interpretation" sentence or a reading) that goes beyond the insight already shown.
It must ADD something the single insights did not say: a link between her own words in different moments, a difference, a word of hers that comes back. When there is not enough basis, a modest and precise view (which of her words appear in more than one moment, what stays open) is better than a forced interpretation. Never say what a person in the dream wanted, meant or felt; never fix a meaning for an image; never put moments in a sequence ("רצף", "מוביל", "מתחיל כבר") unless the ORDER OF EVENTS says so; never give her a feeling she did not name, in any wording.
Never state an order of events that the text does not state (see ORDER OF EVENTS).

${ADDRESS_RULE}

${FAITHFULNESS}

${styleBlock(language, address)}

Respond with only the JSON object of the schema.`;
}

export function buildWholeViewInput(p: {
  sourceText: string;
  segments: readonly DreamSegment[];
  depth: DreamDepth;
  explored: PriorMoment[];
  unexplored: { id: MomentId; label: string }[];
  feelings: string;
  previous?: { overview: string; closingQuestion: string } | null;
}): string {
  return `${partsBlock(p.segments, p.sourceText)}

${priorBlock(p.explored).replace('MOMENTS ALREADY EXPLORED, IN ORDER', 'THE EXPLORED MOMENTS, IN ORDER')}

EXPLORED MOMENT IDS (connections, quotes and readings use only these): ${p.explored.map((m) => m.id).join(', ')}
MOMENTS NOT EXPLORED (no link, no reading, no meaning for them): ${p.unexplored.length ? p.unexplored.map((m) => `[${m.id}] ${q(m.label)}`).join(', ') : 'none'}${feelingsBlock(p.feelings)}${
    p.previous
      ? `

THIS IS AN UPDATE. The whole view already shown before the latest moments (do not repeat its sentences or its closing question; say what the new moments add or change):
Overview shown: ${q(p.previous.overview)}
Closing question asked: ${q(p.previous.closingQuestion)}`
      : ''
  }

READINGS ALLOWED: at most ${maxAlternativeReadings(p.depth)}`;
}

const quotesSchema = { type: 'array', items: { type: 'object', additionalProperties: false, required: ['moment', 'quote'], properties: { moment: { type: 'string' }, quote: { type: 'string' } } } } as const;

export const WHOLE_VIEW_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['overview', 'connections', 'recurring', 'contrast', 'readings', 'closing'],
  properties: {
    overview: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['source', 'segment', 'action', 'actor', 'target', 'moment', 'quote', 'basis', 'text'],
        properties: {
          source: { type: 'string', enum: ['dream', 'user', 'interpretation'] },
          segment: { type: 'integer' },
          action: { type: 'string' },
          actor: { type: 'string' },
          target: { type: 'string' },
          moment: { type: 'string' },
          quote: { type: 'string' },
          basis: { type: 'array', items: { type: 'string' } },
          text: { type: 'string' },
        },
      },
    },
    connections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to', 'title', 'fromQuote', 'toQuote', 'link'],
        properties: { from: { type: 'string' }, to: { type: 'string' }, title: { type: 'string' }, fromQuote: { type: 'string' }, toQuote: { type: 'string' }, link: { type: 'string' } },
      },
    },
    recurring: { type: 'object', additionalProperties: false, required: ['element', 'text', 'quotes'], properties: { element: { type: 'string' }, text: { type: 'string' }, quotes: quotesSchema } },
    contrast: { type: 'object', additionalProperties: false, required: ['text', 'quotes'], properties: { text: { type: 'string' }, quotes: quotesSchema } },
    readings: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['segment', 'text'], properties: { segment: { type: 'integer' }, text: { type: 'string' } } } },
    closing: { type: 'object', additionalProperties: false, required: ['text', 'moment', 'quote'], properties: { text: { type: 'string' }, moment: { type: 'string' }, quote: { type: 'string' } } },
  },
} as const;

const quotesOf = (v: unknown) => arr(v).map((x) => ({ moment: s(x.moment), quote: s(x.quote) })).filter((x) => x.moment && x.quote);

export function parseWholeView(candidate: unknown): WholeRaw | null {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const c = candidate as Record<string, unknown>;
  const rec = (typeof c.recurring === 'object' && c.recurring ? c.recurring : {}) as Record<string, unknown>;
  const con = (typeof c.contrast === 'object' && c.contrast ? c.contrast : {}) as Record<string, unknown>;
  const clo = (typeof c.closing === 'object' && c.closing ? c.closing : {}) as Record<string, unknown>;
  const overview = arr(c.overview)
    .map((x) => ({
      source: s(x.source),
      segment: int(x.segment),
      action: s(x.action),
      actor: s(x.actor),
      target: s(x.target),
      moment: s(x.moment),
      quote: s(x.quote),
      basis: Array.isArray(x.basis) ? x.basis.filter((b): b is string => typeof b === 'string').map((b) => b.trim()) : [],
      text: s(x.text),
    }))
    .filter((x) => x.text)
    .slice(0, 6);
  if (overview.length === 0) return null;
  return {
    overview,
    connections: arr(c.connections).map((x) => ({ from: s(x.from), to: s(x.to), title: s(x.title), fromQuote: s(x.fromQuote), toQuote: s(x.toQuote), link: s(x.link) })).slice(0, 6),
    recurring: { element: s(rec.element), text: s(rec.text), quotes: quotesOf(rec.quotes) },
    contrast: { text: s(con.text), quotes: quotesOf(con.quotes) },
    readings: arr(c.readings).map((x) => ({ segment: int(x.segment), text: s(x.text) })).filter((x) => x.text).slice(0, 4),
    closing: { text: s(clo.text), moment: s(clo.moment), quote: s(clo.quote) },
  };
}

// ------------------------------------------------------------------------------------------------ moment labels

/**
 * What a MOMENT label adds to the existing labels prompt (whose own example keeps a first-person "שלי"): a moment is an event of the
 * dream, named to the dreamer, never in the first person. The label is checked by code afterwards (claimCheck.checkLabel).
 */
export function momentLabelRules(language: AppLanguage): string {
  return language === 'he'
    ? `\n\nTHESE ITEMS ARE MOMENTS OF THE DREAM (whole events), not single objects. For each: a short label of 2 to 5 words that names the EVENT, from the item's own words, never in the first person (no "אני", "שלי", "אחי", no verb like "הלכתי" / "חיכיתי"; "אחי" becomes "האח", "אבא שלי" becomes "אבא"). Good: "הרכבת שלא הגיעה", "המפתח הקטן מדי", "השיר הלא מוכר". Two items never get the same label.`
    : `\n\nTHESE ITEMS ARE MOMENTS OF THE DREAM (whole events), not single objects. For each: a short label of 2 to 5 words that names the EVENT, from the item's own words, never in the first person (no "I", "my", "me"). Good: "THE TRAIN THAT NEVER CAME". Two items never get the same label.`;
}

// ------------------------------------------------------------------------------------------------ retry notes (fixed instruction text, never dream text)

const bullet = (reasons: string[]) => [...new Set(reasons)].slice(0, 8).map((r) => `- ${r}`).join('\n');

export function questionRetryNote(reasons: string[]): string {
  return `\n\nCORRECTION: every candidate question was refused:\n${bullet(reasons)}\nWrite two new candidates that follow every rule.`;
}

export function replyRetryNote(report: ClaimReport): string {
  const reasons = report.possibilities.flat();
  return `\n\nCORRECTION: no possibility could be shown:\n${bullet(reasons.length ? reasons : ['no possibility was given'])}\nAlso, sentences refused elsewhere: ${bullet([...report.dream, ...report.user].flatMap((x) => x.reasons)) || 'none'}\nWrite the whole reply again following every rule.`;
}

export function wholeRetryNote(report: WholeReport, kind: string): string {
  const reasons = [...report.overview.flatMap((x) => x.reasons), ...report.connections.flat(), ...report.recurring, ...report.contrast, ...report.readings.flat()];
  const what = kind === 'factual-summary' ? 'nothing of the whole view could be shown' : 'no link, recurrence or difference between the moments could be shown';
  return `\n\nCORRECTION: ${what}:\n${bullet(reasons.length ? reasons : ['nothing passed'])}\nWrite the whole view again following every rule; give a link only where something real joins two moments.`;
}

// ------------------------------------------------------------------------------------------------ prose (for the language and address checks)

export const questionProse = (r: MomentQuestionRaw) => r.candidates.map((c) => c.question);
export const replyProse = (r: MomentReplyRaw) => [...r.dream.map((d) => d.text), ...r.user.map((u) => u.text), ...r.possibilities.map((p) => p.text), r.followUpQuestion ?? ''].filter(Boolean);
export const wholeViewProse = (w: WholeRaw) =>
  [...w.overview.map((o) => o.text), ...w.connections.flatMap((c) => [c.title, c.link]), w.recurring.text, w.contrast.text, ...w.readings.map((r) => r.text), w.closing.text].filter(Boolean);

/** Feminine-plural forms for "you two" / "they": wrong when the other person is a man (real samples: "הלכתן", "ביניכן" for a woman and her brother). */
const FEMININE_PLURAL = /(?<![א-ת])(?:הלכתן|הייתן|חוויתן|הצלחתן|הגעתן|הרגשתן|ראיתן|ביניכן|אתכן|שלכן|עליכן|איתכן|הולכות)(?![א-ת])/;
const MAN_IN_DREAM = /(?<![א-ת])[ובלמשה]?(?:אח|אחי|אחיך|אחיה|אבא|אבי|אביך|בעלי|בעל|סבא)(?![א-ת])/;

/** A note when the text speaks of the dreamer and a man in the feminine plural. */
export function mixedPluralNote(texts: readonly string[], dreamerText: string): string | null {
  if (!MAN_IN_DREAM.test(dreamerText) || !texts.some((t) => FEMININE_PLURAL.test(t))) return null;
  return '\n\nCORRECTION: your previous attempt used a feminine plural ("הלכתן", "ביניכן", "הולכות") for the dreamer together with a man. Use the plural that fits a mixed pair ("הלכתם", "ביניכם", "הולכים"). Write the whole response again.';
}

/** Words inside quotation marks are presented as the dreamer's own: they must really be in the dream or in what the dreamer said. */
const QUOTE = /["“”'«»]([^"“”'«»]{4,140})["“”'«»]/g;

export function quotedWordsNote(texts: readonly string[], sources: readonly string[]): string | null {
  for (const text of texts) {
    for (const m of text.matchAll(QUOTE)) {
      const span = m[1].trim();
      if (span.split(/\s+/).length >= 2 && !mostlyGrounded(span, ...sources)) {
        return "\n\nCORRECTION: your previous attempt put in quotation marks words that the dreamer did not say and the dream does not contain. Quote only words that are really in the dream or in the dreamer's answers, exactly; otherwise do not use quotation marks. Write the whole response again.";
      }
    }
  }
  return null;
}
