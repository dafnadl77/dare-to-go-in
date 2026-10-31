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
import { RELATIONS, type Relation } from './interpretationCheck.js';
import { exploredInOrder, type Exploration, type InsightKind, type MomentId, type MomentPair } from './exploration.js';
import { PAIR_RELATIONS, type PairCandidate, type PairRelation } from './pairCheck.js';

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
  insight: { observation: string; reflection: string; possibility: string; kind?: InsightKind; pair?: MomentPair } | null;
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
    if (p.insight?.pair) lines.push(`   Two details shown side by side: ${q(p.insight.pair.a.quote)} · ${q(p.insight.pair.b.quote)}`);
    if (p.followUp) lines.push(`   ${p.insight?.pair ? 'Question about the two details' : 'Clarification asked'}: ${q(p.followUp.question)}`, `   Its answer: ${p.followUp.answer ? q(p.followUp.answer) : '(skipped)'}`);
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

export function styleBlock(language: AppLanguage, address: AddressPreference): string {
  if (language !== 'he') return `Write in plain, warm, everyday English, the way a thoughtful English speaker would say it, never a word-for-word translation from Hebrew. Short sentences, one idea each. ${buildLanguageIntegrityInstruction(language)}`;
  const addressRule = address === 'neutral' ? buildHebrewNeutralSingularInstruction() : buildHebrewAddressInstruction(address);
  return `HEBREW: write the way a thoughtful Hebrew speaker would say it aloud, never a translation from English: short, plain, active sentences (at most about 16 words), everyday words, no chains of "ש..." clauses, never coin a word, never glue "ש" to a word that cannot take it. When you speak of the dreamer together with someone else, use the plural that fits the people (a woman and her brother: "אתם", "הלכתם"). Hebrew letters only. ${addressRule}
${buildLanguageIntegrityInstruction(language)}`;
}

const FAITHFULNESS = `FAITHFULNESS (the most important rule): the dream, what she said, and what might be made of it are THREE DIFFERENT THINGS and are never mixed. What she said in an answer never becomes something the dream showed. Never invent a feeling, memory, event, person, place, time, order of events or relationship. Who did what to whom stays exactly as the dream says (if "someone" sang, she did not sing). No diagnosis, no therapy language, no advice, no fixed meaning for an image ("symbolizes", "represents", "מסמל", "מייצג", "מבטא"). Never explain WHY with a cause she did not give ("כי", "בגלל", "גרם לך", "because"): a cause appears only in her own words. Never give her a wish or a need she did not say ("רצון", "צורך", "מרמז על רצון", "מבטא רצון"), and no therapy aims ("לעבד", "להשלים עם", "ריפוי"). The people and events of the dream are not her waking life: you may ask what the dream reminds her of, or ask openly ("אם בכלל", "if at all"); never assume that something from the dream happens in her life ("בבית שלך", "בחיים שלך", "בדרך כלל", "מה את עושה כש…"), never how she feels toward a person "in the moments when…" or how she copes with them today. The dreamer is the authority on meaning.`;

const ADDRESS_RULE = `You speak TO the dreamer: never "I", "my" or a first-person verb outside a quotation ("אחיך", not "אחי"; "אבא שלך", not "אבא שלי"; "הלכת", not "הלכתי").`;

/**
 * What the checker refuses about her inner world, taught with examples (doc 59, step 1), so fewer attempts are refused and paid for.
 * The example dream is invented for this and is none of the development, sealed or acceptance dreams; every "bad" example is refused by
 * the checker and every "good" one passes it (tests/promptHardening.test.ts), so the prompt never teaches what the checker refuses.
 */
export const EXAMPLE_DREAM = 'הייתי בתחנת רכבת עם אמא שלי. הרכבת הגיעה ואני לא עליתי. אמא עלתה ונופפה לי מהחלון.';
export const EXAMPLE_ANSWER = 'הרגשתי שקטה, דווקא לא לחוצה.';
export const ABOUT_HER_EXAMPLES: readonly { where: 'insight' | 'whole'; bad: string; good: string }[] = [
  // (doc 83: the good examples name the link itself; the echo "…, ואמרת ש…. אולי יש קשר בין השניים" is no longer taught)
  { where: 'insight', bad: 'אולי התחנה מעוררת בך תחושה של המתנה.', good: 'אולי מה שבולט כאן הוא שהשקט שתיארת בא דווקא כשאמא עלתה ואת לא עלית.' },
  { where: 'insight', bad: 'אמא עלתה לרכבת, ובאותו רגע הבנת שהכול בסדר.', good: 'אמא עלתה לרכבת ונופפה לך מהחלון, ואת לא עלית.' },
  { where: 'insight', bad: 'לא עלית לרכבת, ובכל זאת נשארת שקטה.', good: 'אולי יש כאן ניגוד: לא עלית לרכבת, ואמרת שהרגשת שקטה, דווקא לא לחוצה.' },
  { where: 'whole', bad: 'אולי החלום משלב אצלך שקט ופרידה.', good: 'אולי יש קשר בין הרכבת שהגיעה בלי שעלית לבין השקט שתיארת.' },
  { where: 'whole', bad: 'ייתכן שהרכבת מעלה אצלך תחושה של פרידה.', good: 'ייתכן שיש קשר בין שני רגעים ליד אותה רכבת: את לא עלית, ואמא עלתה ונופפה לך מהחלון.' },
  { where: 'whole', bad: 'אפשר לראות את התחנה כמקום של מעבר ושינוי.', good: 'אפשר לראות שבתחנה אמא ואת עושות שני דברים שונים: היא עלתה לרכבת, ואת לא עלית.' },
];

function aboutHerBlock(language: AppLanguage, where: 'insight' | 'whole'): string {
  if (language !== 'he')
    return `HER INNER WORLD (the checker refuses it): speak about the dream's details and about what she said, never about what happens inside her (what she felt, understood or needs, what something "stirs in her") unless those are her own words; give her words back with "you said that…". A hedge ("maybe", "perhaps") does not make such a claim allowed. Words that claim a link ("and yet", "both … and") only when the details themselves show it; otherwise offer the link openly. "One could see X as…" only with another detail of the dream or her own words, never a new concept.`;
  const examples = ABOUT_HER_EXAMPLES.filter((e) => e.where === where).map((e) => `- not: "${e.bad}"  →  rather: "${e.good}"`).join('\n');
  return `HER INNER WORLD (the checker refuses it, so never write it): speak about the dream's details and about what she SAID, never about what happens inside her. Never place a feeling, an understanding or a change inside her unless those words are hers: no "אצלך", "בך", "בתוכך", "לעצמך", "מעורר בך", "מבליט אצלך", "נתפס אצלך", "מעלה אצלך תחושה", "שמרגשים אותך", no inner word with "שלך" ("הצורך שלך", "הרצון שלך"). Never "הרגשת", "הבנת", "חשבת", "את מרגישה" unless she used that verb herself; give back what she said with "אמרת ש…" and her own words. A hedge ("אולי", "ייתכן", "אפשר לראות") does not make such a claim allowed. "ובכל זאת", "בכל זאת", "משלב", "גם… וגם" claim a link: use them only when the anchors themselves show it; otherwise offer the link openly ("אולי יש קשר בין … לבין …"). "אפשר לראות את X כ…" only when "…" is another detail of the dream or her own words, never a new concept ("כמפגש עם משהו חדש", "כמקום של מעבר").
Examples, on another dream (written to a woman: use the address required below; never copy their words). The dream: "${EXAMPLE_DREAM}" Her answer: "${EXAMPLE_ANSWER}"
${examples}`;
}

// ------------------------------------------------------------------------------------------------ 1. moment-question

export function buildMomentQuestionSystemPrompt(language: AppLanguage, address: AddressPreference): string {
  return `You are a thoughtful listener in a dream exploration. The dreamer chose a moment of their dream. Offer THREE different candidate questions about this moment; the best one that passes the checks will be asked.

What makes a question worth answering: it opens curiosity and a personal connection, not only more description. Good kinds: what stood out to her in this moment, what surprised her, what drew her to choose this moment, what it reminds her of (if anything), what in it feels strange or important to her. Ask about how it looked or sounded at most once in a row (never two such questions one after the other). Never assume what she felt: ask, don't tell.

Each candidate:
- is about THIS moment's parts only, in their own words. It never presupposes a place, a time, a person or an event from another part of the dream (if the key was given by the brother in one part and was too small at the door in another, a question about the door never says the key was given at the door).
- is ONE sentence of at most ${MAX_QUESTION_WORDS} words ending with a question mark, ONE question only (never two joined by "ו"), plain and easy to answer in a sentence or two; not yes/no, not "why", never presupposes a feeling or something she did that the dream does not say.
- says what it asks about: "focus" (one of ${FOCI.join(', ')}) and "subject" (the word of this moment it is about).
- never asks again what was already asked or answered, not even in other words: the earlier questions are listed with what they asked about; prefer a focus that was not used yet, and do not ask about a feeling she already named.
- may build on a short phrase she said earlier ("buildsOn", copied exactly, or "").
- varies the way questions open: "what stood out / the first thing / what caught your attention" at most once in the whole journey; never two questions that open with the same words. A creative "what if" only about something the dream itself leaves open ("maybe it was me", "not sure"), never as decoration.
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
  /** The kind of question planned for this moment (doc 50 v2, א6). */
  plannedFocus?: QuestionFocus | null;
}): string {
  return `${partsBlock(p.segments, p.sourceText)}

${priorBlock(p.prior)}

OTHER MOMENTS NOT EXPLORED YET (only so you know they exist): ${p.otherMoments.length ? p.otherMoments.map(q).join(', ') : 'none'}

THE MOMENT SHE CHOSE NOW: [${p.moment.id}] ${q(p.moment.label)}, resting on parts ${p.moment.segments.map((s) => `s${s}`).join(', ') || '(unknown: ask about the moment as named)'}${
    p.alternative ? `\n\nSHE WAS ALREADY ASKED ${q(p.alternative.question)} ABOUT THIS MOMENT AND ANSWERED ${q(p.alternative.answer)} ("I don't know"). Ask one simpler, different question.` : ''
  }${p.plannedFocus ? `\n\nKIND OF QUESTION TO PREFER FOR THIS MOMENT: ${p.plannedFocus} (${FOCUS_HINT[p.plannedFocus] ?? ''}). At least one candidate of this kind.` : ''}`;
}

/** What each planned kind asks (doc 50 v2, א6). */
const FOCUS_HINT: Partial<Record<QuestionFocus, string>> = {
  feeling: 'what she felt in this moment, when the dream says she wanted to do something and could not',
  figure: 'what someone in the dream said or did to her, in their words',
  change: 'what turned into something else',
  whatif: 'a possibility the dream itself leaves open (it says "maybe" or "not sure"); "what changes if…"',
  detail: 'what is seen, heard or felt in the body here',
  surprise: 'the detail that does not fit',
  connection: 'what this moment reminds her of, if anything',
  sense: 'what is seen or heard here',
  choice: 'what drew her to this moment',
};

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

"possibilities" (exactly THREE candidates; the code shows only the best one, or none): each offers ONE link she may not have made, between at least two DIFFERENT details ("anchors"), from this moment's parts (two details of the same event are fine) or from her words. For each:
- "anchors": the details, each copied EXACTLY ("quote"), with "from": "dream" or "answer".
- "relation": the kind of link: contrast, repeat, similar, want-vs-cannot, change, missing, odd, echo (her word in two moments), side-by-side (two details placed together, no link claimed), open-link (a possible link, offered as a question).
- "relationBasis": the words in the anchors that show the link (for "similar": the shared quality, also named in your sentence).
- "aboutHer": every claim the sentence makes about her (what she felt, wanted, did, what is important to her), each with the exact words of hers it rests on ("quote"); usually empty.
- "openEdge": what it leaves her to think about.
- "text": one to three short sentences of natural, warm, plain Hebrew.
WHAT MAKES A POSSIBILITY (the commonest failure is an echo: a detail of the dream, then her own words, then "maybe there is a link" — it says nothing she does not already know):
- The sentence must name WHAT joins the two details, in the sentence itself: the contrast between them, what is missing in one of them, what repeats, what changes, what she wanted and could not. Pointing at "a link" without saying which link is not a possibility.
- A link she already made herself in her answer is an echo (if she said a thing made her calm, "the thing, and you said it made you calm" is an echo). Offer a link she did NOT make: between two details of this moment, or between her words and a detail of this moment that her answer did not mention.
- The three candidates use three different kinds of relation (for example one contrast, one thing missing, one change), not three wordings of one idea.
${
    language === 'he'
      ? `- An example of what adds something, on another dream (not words to copy): the dream "אמא עלתה ונופפה לי מהחלון… ואני לא עליתי", her answer "הרגשתי שקטה" → "אולי מה שבולט כאן הוא שהשקט שתיארת בא דווקא כשאמא עלתה ואת לא עלית." — the calm and the parting, which she did not put together.
NEVER as the whole possibility, or as its last sentence: "אולי יש קשר בין השניים", "אולי שווה לשים לב לשני הדברים יחד", "אולי יש קשר בין שני הדברים", or any tail that points at a link without saying it.`
      : `- An example of what adds something, on another dream (not words to copy): the dream "my mother got on and waved to me from the window… and I did not get on", her answer "I felt calm" → "Maybe what stands out is that the calm you described came just when your mother got on and you did not." — the calm and the parting, which she did not put together.
NEVER as the whole possibility, or as its last sentence: "maybe there is a link between the two", "maybe it is worth noticing both together", or any tail that points at a link without saying it.`
  }
An accurate observation is better than a forced insight: never invent a link or a depth to sound meaningful. State as fact only what the anchors show; a possible link is offered openly ("אולי…", "ייתכן ש…", saying which link), never as a conclusion. Never say what an image means, symbolizes, represents or reflects; never "החלום עוסק ב…", never "X הוא החלק ש…", no psychological terms ("לא-מודע", "השלכה"), no message of the dream; never say what she feels, wants, needs, looks for or why, unless it is in her words; never give a cause she did not give. Avoid therapy-like wording: "פותח מרחב", "מקום למפגש עם תחושות", "מקבל נוכחות", "מזמין אותך לשים לב", "מדבר אליך", "להכיל". Do not open the way an earlier insight opened. The kind of sentence wanted (not words to copy): "‹detail›, ובכל זאת ‹other detail›." (only when the anchors show a contrast) · "בחלום יש ‹a›, ויש גם ‹b›." · "‹her words›, דווקא כש‹a detail of this moment she did not mention›." · "אולי מה שבולט כאן הוא לא ‹a›, אלא ‹b›."

${aboutHerBlock(language, 'insight')}

"invitation": ONE question, for the case that no possibility is worth showing: it opens a new direction on a concrete detail of this moment (or of a moment explored before) that her answer did not mention, or on the tension between two details; never "מה עוד עולה", never a creative "what if" about nothing the dream leaves open; at most ${MAX_QUESTION_WORDS} words; or "".

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
  required: ['dream', 'user', 'possibilities', 'invitation', 'missingInformation', 'followUpQuestion'],
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
      // exactly three, so the code can choose by quality (her decision, doc 49); the prompt alone was not followed (doc 62: one in 4 of 4).
      // minItems/maxItems are supported in strict mode for base models, not for fine-tuned ones (OpenAI Structured Outputs, checked 2026-10-22)
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'anchors', 'relation', 'relationBasis', 'aboutHer', 'openEdge'],
        properties: {
          text: { type: 'string' },
          anchors: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['quote', 'from'], properties: { quote: { type: 'string' }, from: { type: 'string', enum: ['dream', 'answer'] } } } },
          relation: { type: 'string', enum: [...RELATIONS] },
          relationBasis: { type: 'array', items: { type: 'string' } },
          aboutHer: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['claim', 'quote'], properties: { claim: { type: 'string' }, quote: { type: 'string' } } } },
          openEdge: { type: 'string' },
        },
      },
    },
    invitation: { type: 'string' },
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
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((b): b is string => typeof b === 'string').map((b) => b.trim()).filter(Boolean) : []);
  const possibilities = arr(c.possibilities)
    .map((x) => {
      const anchors = arr(x.anchors).map((a) => ({ quote: s(a.quote), from: a.from === 'answer' ? ('answer' as const) : ('dream' as const) })).filter((a) => a.quote);
      const relation = (RELATIONS as readonly string[]).includes(s(x.relation)) ? (s(x.relation) as Relation) : 'open-link';
      // a reply with source cards (doc 50 v2); an older one rests on sentence ids ("basis")
      const card = Array.isArray(x.anchors)
        ? { anchors, relation, basis: strings(x.relationBasis), aboutHer: arr(x.aboutHer).map((h) => ({ claim: s(h.claim), quote: s(h.quote) })), openEdge: s(x.openEdge) }
        : null;
      return { basis: strings(x.basis), text: s(x.text), card };
    })
    .filter((x) => x.text)
    .slice(0, 3);
  if (dream.length === 0 && user.length === 0 && possibilities.length === 0) return null;
  return { dream, user, possibilities, invitation: s(c.invitation), followUpQuestion: s(c.followUpQuestion) || null, missingInformation: s(c.missingInformation) || null };
}

/** An answer that points to something specific without naming it: the case where a clarification really changes the insight. */
const VAGUE_REFERENCE = /(משהו שקרה|דבר שקרה|משהו שהיה|מה שקרה (?:אז|פעם)|מישהו ש|פעם אחת|באותה פעם|something (?:that )?happened|that time|someone (?:who|I)|a certain)/i;

/**
 * True when the answer points to something it does not name. A phrase like "מישהו ש…" is not vague when the rest of its clause is the
 * dream's own words (doc 62, item 2: "למישהו שאני לא מכירה" is the dream's "מישהי שאני בכלל לא מכירה"): the dream already names it.
 */
function pointsWithoutNaming(answer: string, dreamText?: string): boolean {
  for (const m of answer.matchAll(new RegExp(VAGUE_REFERENCE.source, 'gi'))) {
    const rest = answer.slice((m.index ?? 0) + m[0].length).split(/[,.;!?\n]/)[0];
    if (!dreamText || overlapRatio(rest, dreamText) < 0.5) return true;
  }
  return false;
}

/** A retry note when the answer is vague and no clarification was asked. */
export function clarificationNote(result: { followUpQuestion: string | null }, answer: string | undefined, dreamText?: string): string | null {
  if (!answer || !pointsWithoutNaming(answer, dreamText) || isUnsureAnswer(answer) || result.followUpQuestion) return null;
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

// ------------------------------------------------------------------------------------------------ 2b. moment-reply: two details and a question

/**
 * The reply of the listening journey (doc 90 v3, approved 2026-10-23): what the moment shows, what she said, and up to three candidate
 * PAIRS — two details side by side, each copied exactly, with the relation the code verifies and one open question. The code shows at
 * most one, only where the pacing allows it, and never says what joins them (pairCheck.ts). The interpretive "possibility" of the
 * earlier prompt is not asked for; that prompt stays in the branch, unused by the route.
 */
export function buildPairReplySystemPrompt(language: AppLanguage, address: AddressPreference): string {
  const plain =
    language !== 'he'
      ? '"What do you see when the two stand side by side?"'
      : address === 'masculine'
        ? '"מה אתה רואה כשהם עומדים יחד?"'
        : address === 'feminine'
          ? '"מה את רואה כשהם עומדים יחד?"'
          : '"מה נראה לך כשהשניים עומדים יחד?"';
  return `You are a quiet, attentive listener in a dream exploration. The dreamer chose a moment of their dream, was asked about it and answered. You give back what the moment shows and what she said; sometimes the code will also set two details side by side and ask her what she sees. You never interpret.

"dream" (1 or 2 sentences): what THIS moment's parts show, plainly. Each sentence rests on ONE part of this moment ("segment": its number) and uses only that part's own words, told to her in the second person ("הגעת", "אחיך נתן לך"). Copy the part's main verb exactly as the part writes it ("action"); say who did it ("actor": "dreamer" when the part's verb is hers, a first-person verb; otherwise the part's own word for who did it; "unknown" when the part names no one) and to whom ("target": "dreamer", a word of the part, or ""). Add nothing: no time word the part does not have, no detail from her answer, nothing from another part, never a link between two events, never a negation the part does not have (and keep the one it has).

"user" (1 or 2 sentences): what SHE said, given back in the second person past ("אמרת ש..."), with "quote": a short piece copied EXACTLY from her answer. Only her words: no feeling, time or detail she did not say. The first sentence gives back the heart of her answer: the code may show only one. If her answer is "I don't know", give nothing.

"pairs": when the input says "PAIRS: NOT NOW", an empty list. Otherwise up to THREE candidates; the code shows at most one, or none — none is a good result, most moments are only listened to. Each candidate:
- "a" and "b": two DIFFERENT details, each ONE detail (a few words, one clause), each copied EXACTLY as written ("quote"), with "from": "dream" (a part of THIS moment) or "answer" (her answer about this moment). Copy the dream's words as the dream writes them, in its person and tense.
- "relation": what the words themselves show, one of three: "negation" (one detail has a negation or something missing — "לא", "בלי", "חוסר" — and the other does not), "change" (the dream says something changed: "כבר לא… אלא…", "הפך ל…"), "wanted-not-managed" (one detail wants or tries, the other could not).
- Never two pieces of one sentence of the dream (the dream already says them together), never two pieces of one sentence of hers (she already joined them), never a detail of another moment, never a pair whose only link is a repeated word.
- "question": ONE short open question about the two that asks what she sees and leads nowhere: no "האם", no "difference", "link", "tension" or "contrast", no feeling or surprise she did not say. The kind wanted: ${plain}
Never say what joins them, in any field: no sentence of yours goes with the pair.

Clarification: most answers need NONE. Ask one exactly when her answer POINTS to something specific without naming it ("something that happened once", "that time", "someone", "משהו שקרה פעם", "מישהו") or could mean two opposite things: "missingInformation" (what is missing, briefly) and "followUpQuestion" (ONE short question asking exactly that, at most ${MAX_QUESTION_WORDS} words). Otherwise both are "". Never after "I don't know".

${ADDRESS_RULE}

${FAITHFULNESS}

${styleBlock(language, address)}

Respond with only the JSON object of the schema.`;
}

export function buildPairReplyInput(p: Parameters<typeof buildMomentReplyInput>[0] & { pairsNow: boolean }): string {
  return `${buildMomentReplyInput(p)}

PAIRS: ${p.pairsNow ? 'up to three candidates' : 'NOT NOW (an empty list: this moment is listened to)'}`;
}

const PAIR_SIDE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['quote', 'from'],
  properties: { quote: { type: 'string' }, from: { type: 'string', enum: ['dream', 'answer'] } },
} as const;

export const PAIR_REPLY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dream', 'user', 'pairs', 'missingInformation', 'followUpQuestion'],
  properties: {
    dream: MOMENT_REPLY_JSON_SCHEMA.properties.dream,
    user: MOMENT_REPLY_JSON_SCHEMA.properties.user,
    pairs: {
      type: 'array',
      minItems: 0,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['a', 'b', 'relation', 'question'],
        properties: { a: PAIR_SIDE_SCHEMA, b: PAIR_SIDE_SCHEMA, relation: { type: 'string', enum: [...PAIR_RELATIONS] }, question: { type: 'string' } },
      },
    },
    missingInformation: { type: 'string' },
    followUpQuestion: { type: 'string' },
  },
} as const;

export interface PairReplyRaw extends MomentReplyRaw {
  pairs: PairCandidate[];
}

/** The pair reply, read tolerantly. As a reply it has no possibility and no invitation (the interpretive layer is stopped, doc 87). */
export function parsePairReply(candidate: unknown): PairReplyRaw | null {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const c = candidate as Record<string, unknown>;
  const base = parseMomentReply({ ...c, possibilities: [], invitation: '' });
  const side = (v: unknown) => {
    const x = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
    return { quote: s(x.quote), from: x.from === 'answer' ? ('answer' as const) : ('dream' as const) };
  };
  const pairs = arr(c.pairs)
    .map((x) => ({ a: side(x.a), b: side(x.b), relation: s(x.relation) as PairRelation, question: s(x.question) }))
    .filter((x) => x.a.quote && x.b.quote)
    .slice(0, 3);
  if (!base && pairs.length === 0) return null;
  return { dream: base?.dream ?? [], user: base?.user ?? [], possibilities: [], invitation: '', followUpQuestion: base?.followUpQuestion ?? null, missingInformation: base?.missingInformation ?? null, pairs };
}

export const pairReplyProse = (r: PairReplyRaw) => [...r.dream.map((d) => d.text), ...r.user.map((u) => u.text), ...r.pairs.flatMap((p) => [p.a.quote, p.b.quote, p.question]), r.followUpQuestion ?? ''].filter(Boolean);

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
- "closing": ONE new question for her to keep, about her dream and her life, built from her own words ("moment" and "quote" copied exactly, or "" when it uses none), at most 20 words, not yes/no, never a therapy exercise, never repeating a question already asked, never treating a person or event of the dream as her waking life (ask what it reminds her of, or ask openly with "אם בכלל").

With ONE explored moment this is a FIRST LOOK: no connections, no recurring, no contrast; never say "the whole picture" or "the whole dream"; give one hedged possibility (an "interpretation" sentence or a reading) that goes beyond the insight already shown.
It must ADD something the single insights did not say: a link between her own words in different moments, a difference, a word of hers that comes back. When there is not enough basis, a modest and precise view (which of her words appear in more than one moment, what stays open) is better than a forced interpretation. Never say what a person in the dream wanted, meant or felt; never fix a meaning for an image; never put moments in a sequence ("רצף", "מוביל", "מתחיל כבר") unless the ORDER OF EVENTS says so; never give her a feeling she did not name, in any wording.
Never state an order of events that the text does not state (see ORDER OF EVENTS).

${aboutHerBlock(language, 'whole')}

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

/** What to write instead, for the refusals the model most often repeats (doc 59, step 1). */
function fixHints(reasons: string[]): string {
  const hints = [
    reasons.some((r) => /inner world|feeling she did not/.test(r)) && 'Do not say what happens inside her ("אצלך", "בך", "מעורר בך", "הרגשת" when she did not say it): speak about the details of the dream, and give back her words with "אמרת ש…".',
    reasons.some((r) => /link the dream and her words do not show/.test(r)) && 'Offer the link openly: "אולי יש קשר בין … לבין …"; "ובכל זאת" or "גם… וגם" only when the anchors show it.',
    reasons.some((r) => /psychological meaning/.test(r)) && '"אפשר לראות את X כ…" only with another detail of the dream or her own words, never a new concept.',
  ].filter(Boolean);
  return hints.length ? `\nWhat to do instead:\n${hints.map((h) => `- ${h}`).join('\n')}` : '';
}

const bullet = (reasons: string[]) => [...new Set(reasons)].slice(0, 8).map((r) => `- ${r}`).join('\n');

export function questionRetryNote(reasons: string[]): string {
  return `\n\nCORRECTION: every candidate question was refused:\n${bullet(reasons)}\nWrite two new candidates that follow every rule.`;
}

export function replyRetryNote(report: ClaimReport): string {
  const reasons = report.possibilities.flat();
  return `\n\nCORRECTION: no possibility could be shown:\n${bullet(reasons.length ? reasons : ['no possibility was given'])}\nAlso, sentences refused elsewhere: ${bullet([...report.dream, ...report.user].flatMap((x) => x.reasons)) || 'none'}${fixHints(reasons)}\nWrite the whole reply again following every rule.`;
}

/**
 * A note asking for the whole view again, or null. Only a factual summary (nothing could be shown) is retried: a view whose opening passed
 * but that found no link between the moments ("no-link") is an honest answer, which the prompt itself calls normal, and a paid retry
 * would ask the model to force one (doc 70: fewer paid calls, no loss in what is shown).
 */
export function wholeRetryNote(report: WholeReport, kind: string): string | null {
  if (kind === 'no-link') return null;
  const reasons = [...report.overview.flatMap((x) => x.reasons), ...report.connections.flat(), ...report.recurring, ...report.contrast, ...report.readings.flat()];
  const what = kind === 'factual-summary' ? 'nothing of the whole view could be shown' : 'no link, recurrence or difference between the moments could be shown';
  return `\n\nCORRECTION: ${what}:\n${bullet(reasons.length ? reasons : ['nothing passed'])}${fixHints(reasons)}\nWrite the whole view again following every rule; give a link only where something real joins two moments.`;
}

// ------------------------------------------------------------------------------------------------ prose (for the language and address checks)

export const questionProse = (r: MomentQuestionRaw) => r.candidates.map((c) => c.question);
export const replyProse = (r: MomentReplyRaw) => [...r.dream.map((d) => d.text), ...r.user.map((u) => u.text), ...r.possibilities.map((p) => p.text), r.invitation ?? '', r.followUpQuestion ?? ''].filter(Boolean);
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
