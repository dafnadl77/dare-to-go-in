import type { AddressPreference } from './addressPreference.js';
import type { AppLanguage } from './appLanguage.js';
import type { DreamSegment } from './dreamSegments.js';
import { quoted, reflectBack, type AssembledWhole } from './claimCheck.js';
import { SENSITIVE } from './interpretationCheck.js';
import { containsVerbatim, contentWords, firstPersonForms, isFeelingWord, isNegation, isUnsureAnswer, quotedAs, sameWord, words } from './hebrewText.js';

/**
 * TWO DETAILS AND A QUESTION (doc 90 v3, approved 2026-10-23; step 3, local build). Instead of a finished insight, DARE sometimes sets
 * two details side by side, each in its own exact words, and asks one open question about them. It never says what joins them: the
 * dreamer makes the link, or skips. This file decides, without a model:
 *
 *  - whether a pair may be SHOWN: both details exact (the dream's own words and tense, or hers), both of this moment, each one detail,
 *    not one sentence of the dream, not a link she made herself, and one of three relations the words themselves show — a negation on
 *    one side only, a change the dream states, something wanted and not managed. A repeated word is never a basis (her decision after
 *    doc 91). Two different images are not refused for that (her emphasis, 2026-10-23): with a verified relation they are offered, and
 *    like every pair only as an open question.
 *  - the question: open, leading nowhere, presuming no feeling she did not say; otherwise the plain question written here.
 *  - the pacing: the first moment listens; at most one pair per moment, never in two moments in a row, at most two in a journey; none
 *    after "I don't know", a few words, a sensitive moment, or her answer to a pair.
 *  - what is said around it: one short reflection that does not say the pair first; her answer to the pair given back by code (no call);
 *    a whole view with no technical notice, nothing a pair already showed, and a closing that sounds like a person, not a form.
 *
 * The checkers of the interpretation layer (claimCheck.ts, interpretationCheck.ts) are used, never changed (tests/fix83.test.ts).
 */

export const PAIR_RELATIONS = ['negation', 'change', 'wanted-not-managed'] as const;
export type PairRelation = (typeof PAIR_RELATIONS)[number];
export interface PairSide {
  quote: string;
  from: 'dream' | 'answer';
}
export interface PairCandidate {
  a: PairSide;
  b: PairSide;
  relation: PairRelation;
  question: string;
}
/** What is shown: the two details in their own words and the question. The relation is never shown. */
export interface ShownPair {
  a: PairSide;
  b: PairSide;
  question: string;
  relation: PairRelation;
  /** The two details share no word: offered only as an open question (as every pair is), never as a link. */
  differentImages: boolean;
}
export interface PairSources {
  language: AppLanguage;
  sourceText: string;
  segments: readonly DreamSegment[];
  /** This moment's parts of the dream. */
  allowed: readonly number[];
  /** Her words in this moment (an "I don't know" is never used). */
  answers: readonly string[];
  address: AddressPreference;
}
export interface PairVerdict {
  reasons: string[];
  pair: ShownPair | null;
}

/** At most this many pairs in one journey (each lives in the moment's one follow-up slot). */
export const MAX_PAIRS_PER_JOURNEY = 2;
/** An answer of fewer words is listened to, never paired (doc 90 v3, principle 5). */
export const MIN_ANSWER_WORDS = 5;
/** A detail longer than this is a passage, not a detail. */
const MAX_DETAIL_WORDS = 12;
/** The existing list of sensitive words, as whole words: on its own "מת" also matched inside "באמת" (found in the replay, doc 95). */
export const SENSITIVE_WORD = new RegExp(`(?<![א-ת])(?:${SENSITIVE.source})`);

// ------------------------------------------------------------------------------------------------ words

const bare = (w: string) => w.replace(/[^א-תa-zA-Z']/g, '');
const tokens = (t: string) => t.split(/\s+/).map(bare).filter(Boolean);
const PRONOUN_I = /^(?:ו)?אני$/;
const LEADING_JOIN = /^(?:ו?(?:אבל|אך|אז|ואז|כי|ש|כש))$/;
/** Words that say something is missing: "חוסר X" is her "לא X" (doc 76), "ריק" is "בלי כלום". */
const LACK = /^(?:[ושכ]{0,2})(?:בלי|ללא|חוסר|חסר|חסרה|חסרים|ריק|ריקה|ריקות|ריקים|ריקנות|אין)$/;
const hasNegation = (t: string) => tokens(t).some((w) => isNegation(w) || LACK.test(w));

/** The dream says it changed: "כבר לא X אלא Y", "הפך ל", "נהיה", "התחלף", "השתנה". */
const CHANGE = /(?:^|\s)(?:ו)?(?:הפך|הפכה|הפכו|הופך|הופכת|נהיה|נהייתה|נהיו|התחלף|התחלפה|התחלפו|השתנה|השתנתה|השתנו)(?=\s|$)|כבר\s+לא\s+(?:\S+\s+){1,4}?אלא(?=\s)|כבר\s+(?:היה|הייתה|היו)\s/;
const WANT = /(?:^|\s)(?:[ושכ]{0,2})(?:רציתי|רצית|רצה|רצתה|רוצה|ניסיתי|ניסית|ניסה|ניסתה|ביקשתי|התכוונתי)(?=\s|$)/;
const CANNOT = /(?:לא\s+(?:הצלח\S*|יכול\S*|הצליח\S*|מצא\S*|מוצא\S*|מוצאת|יצא\S*|עלה\S*|הגיע\S*|זז\S*)|אי\s+אפשר|לא\s+היה\s+אפשר)/;

// ------------------------------------------------------------------------------------------------ quotes

/**
 * Where `quote` stands in `text`, in `text`'s own words, or null. Exactly as quotedAs has it (verbatim, or only the dreamer's person
 * changed), or word for word with only the verb's tense or person changed ("יצאת" for "אני יוצא": the best candidate of every run was
 * refused for that, doc 87) — never another word, never a negation cut off. A dropped "אני" before the verb is given back.
 */
export function locateQuote(quote: string, text: string): string | null {
  const exact = quotedAs(quote, text);
  if (exact) return exact;
  const q = tokens(quote);
  const t = text.split(/\s+/).map((w) => w.replace(/[^א-תa-zA-Z']/g, ''));
  if (q.length < 2) return null;
  for (let i = 0; i + q.length <= t.length; i += 1) {
    let same = 0;
    let ok = true;
    for (let k = 0; k < q.length && ok; k += 1) {
      const a = q[k];
      const b = t[i + k];
      if (!b) ok = false;
      else if (a === b || firstPersonForms(a).includes(b)) same += 1;
      else if (isNegation(a) || isNegation(b) || !sameWord(a, b)) ok = false;
    }
    if (!ok || same < Math.ceil(q.length / 2)) continue;
    const start = i > 0 && PRONOUN_I.test(t[i - 1]) ? i - 1 : i;
    const found = t.slice(start, i + q.length).join(' ');
    if (containsVerbatim(text, found)) return found;
  }
  return null;
}

/** A detail without the joining word it was cut with ("אבל בעצם ידעתי…" → "בעצם ידעתי…"); still a piece of the same text. */
function trimJoin(quote: string): string {
  const ws = quote.split(/\s+/);
  while (ws.length > 2 && LEADING_JOIN.test(bare(ws[0]))) ws.shift();
  return ws.join(' ');
}

const sentencesOf = (text: string) => text.split(/(?<=[.!?…])\s+|\n+/u).map((x) => x.trim()).filter(Boolean);

/**
 * Does `text` say `quote` again, in any person, tense or order? A run of three of its words (one of them content), or most of its
 * content words ("שכבר ידעת מה אתה צריך" says again "בעצם ידעתי כבר מה אני צריך": the order and the person changed, the words did not).
 */
export function repeatsQuote(text: string, quote: string): boolean {
  const q = tokens(quote);
  const t = tokens(text);
  const content = [...new Set(contentWords(quote).filter((w) => bare(w).length >= 3))];
  const shared = content.filter((w) => t.some((x) => sameWord(w, x))).length;
  if (content.length >= 2 && shared >= 2 && shared * 2 >= content.length) return true;
  const n = Math.min(3, q.length);
  if (n < 2) return false;
  for (let i = 0; i + n <= q.length; i += 1) {
    const run = q.slice(i, i + n);
    if (!run.some((w) => contentWords(w).length > 0)) continue;
    for (let j = 0; j + n <= t.length; j += 1) if (run.every((w, k) => w === t[j + k] || sameWord(w, t[j + k]))) return true;
  }
  return false;
}

// ------------------------------------------------------------------------------------------------ the pair

function placeOf(side: PairSide, s: PairSources): { quote: string; where: number | null; sentence: string | null; reasons: string[] } {
  if (side.from === 'answer') {
    for (const a of s.answers.filter((x) => !isUnsureAnswer(x))) {
      const found = locateQuote(side.quote, a);
      if (found) return { quote: trimJoin(found), where: null, sentence: sentencesOf(a).find((x) => containsVerbatim(x, found)) ?? a, reasons: [] };
    }
    return { quote: side.quote, where: null, sentence: null, reasons: [`a detail that is not in her answer ("${side.quote.slice(0, 40)}")`] };
  }
  for (const id of s.allowed) {
    const seg = s.segments[id];
    const found = seg ? locateQuote(side.quote, seg.text) : null;
    if (found) return { quote: trimJoin(found), where: id, sentence: null, reasons: [] };
  }
  // one detail may run across two parts of the moment
  const joined = s.allowed.map((id) => s.segments[id]?.text ?? '').join(' ');
  const across = locateQuote(side.quote, joined);
  if (across) return { quote: trimJoin(across), where: s.allowed[0] ?? null, sentence: null, reasons: [] };
  const elsewhere = s.segments.some((x) => locateQuote(side.quote, x.text) !== null);
  return { quote: side.quote, where: null, sentence: null, reasons: [elsewhere ? `a detail of the dream that is not in this moment ("${side.quote.slice(0, 40)}")` : `a detail that is not in the dream ("${side.quote.slice(0, 40)}")`] };
}

/** One sentence of the dream: the dream already says the two together. A dictated run-on (no full stop) counts by its parts. */
function oneDreamSentence(x: number, y: number, s: PairSources): boolean {
  const a = s.segments[x];
  const b = s.segments[y];
  if (!a || !b) return false;
  if (x === y) return true;
  const written = new Set(s.segments.map((g) => g.sentence)).size > 1;
  return written ? a.sentence === b.sentence : Math.abs(x - y) <= 2;
}

function relationProblems(relation: PairRelation, a: string, b: string): string[] {
  if (relation === 'negation') {
    const na = hasNegation(a);
    const nb = hasNegation(b);
    if (na && nb) return ['a negation (or something missing) on both sides: the same thing twice, not one side against the other'];
    if (!na && !nb) return ['no negation on either side'];
    return [];
  }
  if (relation === 'change') return CHANGE.test(` ${a} `) || CHANGE.test(` ${b} `) ? [] : ['the dream does not say anything changed'];
  // wanted and not managed: the wish in one detail, what could not be done in the other
  const ok = (WANT.test(` ${a} `) && CANNOT.test(b)) || (WANT.test(` ${b} `) && CANNOT.test(a));
  return ok ? [] : ['no wish in one detail and what could not be done in the other'];
}

/** A detail is one detail: not a passage, not a run of clauses. */
function detailProblems(quote: string): string[] {
  const ws = tokens(quote);
  // a clause joined on with "ו" ("ואכלה", "ולא"); "וה…" is mostly a noun ("והרגליים"), not a new clause
  const joins = ws.slice(1).filter((w) => /^ו(?!ה)[א-ת]{2,}/.test(w)).length;
  if (ws.length > MAX_DETAIL_WORDS || joins >= 2) return [`not one detail but a run of them ("${quote.slice(0, 40)}")`];
  return [];
}

/** The question: open, leading nowhere, no feeling or surprise she did not say. Empty = it may be asked. */
export function pairQuestionProblems(question: string, ctx: { answers: readonly string[] }): string[] {
  const q = question.trim();
  const reasons: string[] = [];
  const hers = ctx.answers.filter((a) => !isUnsureAnswer(a)).flatMap(words);
  if (!/^(?:מה|איך|what|how)\s/i.test(q)) reasons.push('not an open question ("מה…", "איך…")');
  if (!/\?$/.test(q)) reasons.push('not a question');
  if (words(q).length > 14) reasons.push('too long');
  if (/(?:^|\s)(?:ה?אם\s|האם|ההבדל|הבדל|הקושי|הפחד|הקשר|קשר|מחבר|מתחבר|מתחברים|שניהם\s+קשור|אולי|הניגוד|ניגוד|המתח|הסתירה|הפער|הדמיון|דומה|difference|link|connect)/.test(` ${q}`))
    reasons.push('names what she should find (a difference, a link, a tension) or asks yes / no');
  for (const w of words(q)) {
    if ((isFeelingWord(w) || /^(?:ה)?(?:הפתיע\S*|מפתיע\S*|הרגיש\S*|הרגשת|מרגיש\S*|מפחיד\S*|מעציב\S*|משמח\S*|מכאיב\S*)$/.test(w)) && !hers.some((h) => sameWord(h, w)))
      reasons.push(`presumes something she did not say ("${w}")`);
  }
  if (/(?:^|\s)(?:אם\s+(?:היית|הייתה|היה)|אילו)(?=\s)/.test(` ${q}`)) reasons.push('a "what if"');
  return [...new Set(reasons)];
}

/** The plain question, by address: it asks what she sees, nothing else. */
export function safePairQuestion(language: AppLanguage, address: AddressPreference): string {
  if (language !== 'he') return 'What do you see when the two stand side by side?';
  if (address === 'masculine') return 'מה אתה רואה כשהם עומדים יחד?';
  if (address === 'feminine') return 'מה את רואה כשהם עומדים יחד?';
  return 'מה נראה לך כשהשניים עומדים יחד?';
}

export function verifyPair(c: PairCandidate, s: PairSources): PairVerdict {
  const reasons: string[] = [];
  if (!(PAIR_RELATIONS as readonly string[]).includes(c.relation)) return { reasons: [`"${c.relation}" is not one of the three relations (a repeated word is never a basis)`], pair: null };
  const A = placeOf(c.a, s);
  const B = placeOf(c.b, s);
  reasons.push(...A.reasons, ...B.reasons);
  if (reasons.length) return { reasons, pair: null };
  reasons.push(...detailProblems(A.quote), ...detailProblems(B.quote));
  if (A.quote === B.quote || repeatsQuote(A.quote, B.quote) && repeatsQuote(B.quote, A.quote)) reasons.push('the same detail twice');
  // a link she made herself: two pieces of one sentence of hers, or her sentence that already holds the dream's detail
  if (c.a.from === 'answer' && c.b.from === 'answer' && A.sentence === B.sentence) reasons.push('two pieces of one sentence of hers: a link she already made herself');
  for (const [mine, other] of [[A, B], [B, A]] as const)
    if (mine.sentence && other.where !== null && contentWords(other.quote).filter((w) => w.length >= 3).filter((w) => words(mine.sentence ?? '').some((x) => sameWord(x, w))).length >= 2)
      reasons.push('her own sentence already holds the dream\'s detail: a link she already made herself');
  if (A.where !== null && B.where !== null && oneDreamSentence(A.where, B.where, s)) reasons.push('one sentence of the dream: the dream already says the two together');
  reasons.push(...relationProblems(c.relation, A.quote, B.quote));
  if (reasons.length) return { reasons: [...new Set(reasons)], pair: null };
  const questionReasons = pairQuestionProblems(c.question, { answers: s.answers });
  const question = questionReasons.length ? safePairQuestion(s.language, s.address) : c.question.trim();
  const shared = contentWords(A.quote).some((w) => contentWords(B.quote).some((x) => sameWord(w, x)));
  return {
    reasons: questionReasons.map((r) => `question replaced: ${r}`),
    pair: { a: { quote: A.quote, from: c.a.from }, b: { quote: B.quote, from: c.b.from }, question, relation: c.relation, differentImages: !shared },
  };
}

/**
 * The pair shown, the same way every time: the first that passes, preferring one with her own words (doc 90: the depth comes from her
 * answers), never ranked by an estimate of depth (the level estimator could not see depth, doc 89).
 */
export function choosePair(cands: readonly PairCandidate[], s: PairSources): { index: number | null; pair: ShownPair | null; verdicts: PairVerdict[] } {
  const verdicts = cands.slice(0, 3).map((c) => verifyPair(c, s));
  const passing = verdicts.map((v, i) => ({ v, i })).filter((x) => x.v.pair !== null);
  const best = passing.find((x) => x.v.pair!.a.from === 'answer' || x.v.pair!.b.from === 'answer') ?? passing[0] ?? null;
  return { index: best ? best.i : null, pair: best ? best.v.pair : null, verdicts };
}

// ------------------------------------------------------------------------------------------------ pacing

export interface PacingInput {
  /** For each moment explored before this one, in order: was a pair shown in it? */
  priorPairs: readonly boolean[];
  answer: string;
  momentText: string;
  /** Her answer to a clarification or to a pair is being given back: only a reflection. */
  refreshing: boolean;
}

export function pairAllowedHere(p: PacingInput): { allowed: boolean; why: string } {
  if (p.refreshing) return { allowed: false, why: 'after her answer: only a reflection' };
  if (p.priorPairs.length === 0) return { allowed: false, why: 'the first moment listens' };
  if (p.priorPairs[p.priorPairs.length - 1]) return { allowed: false, why: 'a pair in the moment before' };
  if (p.priorPairs.filter(Boolean).length >= MAX_PAIRS_PER_JOURNEY) return { allowed: false, why: 'the journey had its pairs' };
  if (isUnsureAnswer(p.answer) || /(?:^|\s)לא\s+(?:יודע|יודעת|בטוח|בטוחה|זוכר|זוכרת)(?=[\s.,!?]|$)/.test(p.answer)) return { allowed: false, why: 'after "I don\'t know"' };
  if (words(p.answer).length < MIN_ANSWER_WORDS) return { allowed: false, why: 'a few words: listened to' };
  if (SENSITIVE_WORD.test(`${p.momentText} ${p.answer}`)) return { allowed: false, why: 'a sensitive moment' };
  return { allowed: true, why: '' };
}

// ------------------------------------------------------------------------------------------------ what is said around it

const REFLECTION_SENTENCE = /(?<=[.!?…])\s+(?=ו?אמרת)/u;

/**
 * One short reflection (doc 90 v3, ו): the first "אמרת ש…" sentence of the verified reflection — with a pair, the first that does not
 * already say one of its two details, or none (the pair gives her words back itself).
 */
export function oneReflection(reflection: string, pair: Pick<ShownPair, 'a' | 'b'> | null): string {
  const parts = reflection.split(REFLECTION_SENTENCE).map((x) => x.trim().replace(/^ואמרת/, 'אמרת')).filter(Boolean);
  const fit = pair ? parts.filter((x) => !repeatsQuote(x, pair.a.quote) && !repeatsQuote(x, pair.b.quote)) : parts;
  return fit[0] ?? '';
}

/** The dream line, without what the pair is about to show. */
export function observationBeside(observation: string, pair: Pick<ShownPair, 'a' | 'b'> | null): string {
  if (!pair) return observation;
  return sentencesOf(observation).filter((x) => !repeatsQuote(x, pair.a.quote) && !repeatsQuote(x, pair.b.quote)).join(' ');
}

/** Her answer to a pair, given back by code (no call): one "אמרת", her own words when they cannot be turned without guessing. */
export function pairAnswerReflection(answer: string, address: AddressPreference): string {
  const first = sentencesOf(answer.trim())[0] ?? answer.trim();
  const back = reflectBack(first, address);
  return back.split(REFLECTION_SENTENCE)[0];
}

// ------------------------------------------------------------------------------------------------ the whole view

/** Closings that sound like a form (her note, 2026-10-23), and words that presume a meaning. */
const QUESTIONNAIRE = /(?:אם בכלל|מזכיר|מזכירה|מזכירים|מזכירות|מה עוד עולה|משמעות|מסמל|מייצג|if anything|remind)/;

/** The note added to the whole view's instructions in this mode. */
export const PAIR_WHOLE_NOTE =
  '\n\nTHE CLOSING: one short, plain question, as a person would ask to go on talking: to a moment not explored yet, or to her own words. Never "…מזכיר לך, אם בכלל?", never "מה עוד עולה", never a meaning. No notice about what was or was not found.';

export interface ClosingContext {
  language: AppLanguage;
  address: AddressPreference;
  /** Labels of the moments not explored yet. */
  unexplored: readonly string[];
  /** Her words in the moments explored. */
  answers: readonly string[];
}

/** A closing that goes on talking: to a moment not explored yet, or back to a short phrase of hers. */
export function conversationalClosing(c: ClosingContext): string {
  const he = c.language === 'he';
  if (c.unexplored.length) return he ? `יש עוד רגע בחלום, ${quoted('he', c.unexplored[0])}. נסתכל גם עליו?` : `There is another moment in the dream, ${quoted('en', c.unexplored[0])}. Shall we look at it too?`;
  const phrase = c.answers
    .filter((a) => !isUnsureAnswer(a))
    .flatMap((a) => a.split(/[.,;!?]+/))
    .map((x) => x.trim())
    .filter((x) => {
      const n = x.split(/\s+/).length;
      return n >= 2 && n <= 8;
    })
    .sort((x, y) => x.length - y.length)[0];
  if (phrase) return he ? `אמרת ${quoted('he', phrase)}. איך זה היה לך?` : `You said ${quoted('en', phrase)}. How was that for you?`;
  return he ? 'איך היה לך במסע הזה בחלום?' : 'How was this journey through the dream for you?';
}

/**
 * The whole view in this mode (doc 90 v3, principle 6): it reflects and adds, it does not repeat. No technical notice; nothing a pair
 * already showed (in any person or tense); one closing that goes on talking. Never anything new: only parts of the verified view are
 * kept or dropped, and the closing is one of the plain ones above.
 */
export function listeningWhole(view: AssembledWhole, shown: readonly Pick<ShownPair, 'a' | 'b'>[], c: ClosingContext): AssembledWhole {
  const quotes = shown.flatMap((p) => [p.a.quote, p.b.quote]);
  const repeats = (t: string | null | undefined) => !!t && quotes.some((q) => repeatsQuote(t, q));
  const overview = view.overview
    .split('\n')
    .map((line) => sentencesOf(line).filter((x) => !repeats(x)).join(' '))
    .filter(Boolean)
    .join('\n');
  const closing = view.closingQuestion && !repeats(view.closingQuestion) && !QUESTIONNAIRE.test(view.closingQuestion) && (view.closingQuestion.match(/\?/g) ?? []).length === 1 ? view.closingQuestion : conversationalClosing(c);
  return {
    ...view,
    notice: null,
    overview,
    connections: view.connections.filter((x) => ![x.title, x.basis, x.fromQuote, x.toQuote].some(repeats)),
    recurring: repeats(view.recurring) ? null : view.recurring,
    contrast: repeats(view.contrast) ? null : view.contrast,
    readings: view.readings.filter((r) => !repeats(r.reading) && !repeats(r.basis)),
    closingQuestion: closing,
  };
}
