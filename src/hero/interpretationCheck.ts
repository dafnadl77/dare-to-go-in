import { antecedents, MENTAL_PRESENT, verifyInterpretation, type QuestionFocus, type Sources } from './claimCheck.js';
import { containsVerbatim, quotedAs, contentWords, flat, inWords, isNegation, isUnsureAnswer, norm, overlap, sameWord, withoutQuotes, words } from './hebrewText.js';

/**
 * THE INTERPRETATION LAYER (doc 50 v2, approved 2026-10-22, phase 2). A possibility comes with a SOURCE CARD (never shown): the details
 * it links (anchors, copied exactly from the dream or her answers), the kind of link, the words that show the link, what it says about
 * her and on what words of hers, and what it leaves open. This file decides two separate things (her binding note 3):
 *
 *  - SAFETY: may it be shown at all? Refused only for a claim without basis: an anchor that is not there, a link stated as a fact that
 *    the anchors do not show (a possible link must be offered openly, her note 2), and everything claimCheck.verifyInterpretation
 *    refuses (feelings, wishes, needs, causes, fixed meanings, psychological meaning in any person, claims about her inner world, life).
 *  - QUALITY: how good is it? Level 0 echo / empty, 1 reflection, 2 observation, 3 thought-provoking (doc 50 v2, ד1), and a score that
 *    lowers therapy-like or artificial wording and repetition. Never a reason to refuse, never a reason to manufacture depth (note 1):
 *    an accurate observation is a good result, and a link inside one event counts as much as a distant one (note 5).
 *
 * The level is an ESTIMATE from the card and the wording, used only to choose among candidates; the real judgement of "thought-
 * provoking" stays with the independent reviewer and with her reading (doc 50 v2, ד5).
 */

export type Relation = 'contrast' | 'repeat' | 'similar' | 'want-vs-cannot' | 'change' | 'missing' | 'odd' | 'echo' | 'side-by-side' | 'open-link';
export const RELATIONS: readonly Relation[] = ['contrast', 'repeat', 'similar', 'want-vs-cannot', 'change', 'missing', 'odd', 'echo', 'side-by-side', 'open-link'];
export interface Anchor {
  quote: string;
  from: 'dream' | 'answer';
}
export interface SourceCard {
  anchors: Anchor[];
  relation: Relation;
  /** The words that show the link (for "similar": the shared quality, named in the sentence). */
  basis: string[];
  aboutHer: { claim: string; quote: string }[];
  openEdge: string;
}
export interface Candidate {
  text: string;
  card: SourceCard | null;
  /** Legacy candidates (no card): the ids of the sentences they rest on. */
  basis?: string[];
}
export interface CandidateVerdict {
  safety: { ok: boolean; reasons: string[] };
  quality: { level: 0 | 1 | 2 | 3; score: number; notes: string[] };
}
export interface CandidateOptions {
  exploredCount?: number;
  /** Legacy candidates: the ids of the sentences that passed (a card-less candidate must rest on one). */
  verified?: ReadonlySet<string>;
  /** Insights already shown in this journey (repetition lowers the score). */
  earlier?: readonly string[];
  /** Each question asked about this moment with her answer to it: a sentence that only joins one of them again is an echo. */
  exchanges?: readonly { question: string; answer: string }[];
}

// ------------------------------------------------------------------------------------------------ words that carry a link

const CONTRAST_MARK = /(^|[\s,])(?:ו)?(אבל|אך|ובכל זאת|בכל זאת|בניגוד|ואילו|לעומת)(?=[\s,.]|$)/;
const ANTONYMS: [string, string][] = [['עולה', 'יורד'], ['עלו', 'ירדו'], ['קדימה', 'אחורה'], ['חם', 'קר'], ['מתקרב', 'מתרחק'], ['הכול', 'כלום'], ['חזר', 'הלך'], ['פתח', 'סגר']];
const CHANGE = /(הפך|הפכה|הפכו|הופך|הופכת|נהיה|נהייתה|כבר היה|כבר הייתה|כבר היו|התחיל להיות|התחילה להיות)/;
const MISSING = /(^|[\s,])(?:ו)?(בלי|רק|חוץ מ\S*|אף)(?=[\s,.]|$)/;
const WANT = /(^|[\s,])(?:[ושכ]{0,2})(רציתי|רוצה|רצית|רצתה|ניסיתי|ניסית|ניסה|ניסתה)(?=[\s,.]|$)/;
const CANNOT = /(לא הצלח|לא יצא|לא יכול|לא יכולה|דבוק|נשארות|נשארה|לא הופיע|לא עצר|לא חזר|לא עזר)/;
const FIGURE_SAYS = /(^|\s)(?:ו)?(אמר|אמרה|אמרו|שאל|שאלה|צעק|צעקה)\s+(לי|שאני|לי ש)/;
const ODD_HERS = /(מוזר|משונה|לא הגיוני|מפתיע|הפתיע)/;
/** Words that say there is a link: in a sentence stated as a fact they need a link the anchors show. */
const RELATION_CLAIM = /(אותו דבר|שני צדדים|קשור|קשורים|קשר|מתחבר|מתחברים|דומה|דומים|שייכים|משותף|מדברים על|מקביל|ובכל זאת|בכל זאת|מצד אחד|משלב|משלבת|משלבים|(?<![א-ת])גם\s+.+\s+וגם(?![א-ת]))/;
/** Hedges that open a sentence as an offer. */
const HEDGE = /(^|[\s,])(?:ו)?(אולי|ייתכן|יתכן|אפשר|perhaps|maybe|might|possibly)(?=[\s,.]|$)/;
/** Words that only hold a description together (not an offer of meaning). */
const GLUE = new Set(['בחלום', 'בשני', 'שני', 'שתי', 'דברים', 'שונים', 'שונות', 'אותם', 'אותו', 'אותה', 'באותו', 'באותה', 'המקומות', 'מקומות', 'פעם', 'שוב', 'בכל', 'ובכל', 'כאן', 'עצמה', 'עצמו', 'הזה', 'הזאת'].map(norm));

const sentencesOf = (text: string) => text.split(/(?<=[.!?])\s+/u).map((s) => s.trim()).filter((s) => words(s).length > 0);
const hedged = (sentence: string) => HEDGE.test(words(sentence).slice(0, 6).join(' '));
const usableAnswers = (s: Sources) => s.answers.filter((a) => !isUnsureAnswer(a));
const allowedDreamText = (s: Sources) => s.allowed.map((id) => s.segments[id]?.text ?? '').filter(Boolean);
const ownWords = (s: Sources) => [...usableAnswers(s).flatMap(words), ...allowedDreamText(s).flatMap(words)];
const anchorWords = (a: Anchor) => contentWords(a.quote).filter((w) => norm(w).length >= 3);

/** New words of a sentence: content words in neither the dream (allowed parts) nor her answers, and not hedges or glue. */
function newWords(sentence: string, s: Sources): string[] {
  const own = ownWords(s);
  return contentWords(withoutQuotes(sentence)).filter((w) => !inWords(w, own) && !GLUE.has(norm(w)) && !HEDGE.test(w) && norm(w) !== norm("לראות") && !/^(?:ו|ש)?(אמרת|תיארת|סיפרת|ציינת|הזכרת|רגע|הרגע|ברגע|רגעים|הרגעים|בשני)$/.test(norm(w)));
}

// ------------------------------------------------------------------------------------------------ the card

/** The card with every anchor in the dream's (or her answer's) own words, when the model only turned its person to her. */
export function restoreAnchors(card: SourceCard, s: Sources): SourceCard {
  const dream = allowedDreamText(s);
  const answers = usableAnswers(s);
  const anchors = card.anchors.map((a) => {
    const pool = a.from === 'answer' ? answers : [...dream, dream.join(' ')];
    if (pool.some((x) => containsVerbatim(x, a.quote.trim()))) return a;
    const own = pool.map((x) => quotedAs(a.quote, x)).find((x) => x !== null);
    return own ? { ...a, quote: own } : a;
  });
  return { ...card, anchors };
}

function anchorProblems(card: SourceCard, s: Sources): string[] {
  const reasons: string[] = [];
  const dream = allowedDreamText(s);
  const answers = usableAnswers(s);
  for (const a of card.anchors) {
    const q = a.quote.trim();
    const found = a.from === 'answer' ? answers.some((x) => quotedAs(q, x) !== null) : dream.some((x) => quotedAs(q, x) !== null) || quotedAs(q, dream.join(' ')) !== null;
    if (!q || !found) reasons.push(`an anchor that is not in ${a.from === 'answer' ? 'her answers' : 'the dream'} ("${q.slice(0, 40)}")`);
  }
  const distinct: Anchor[] = [];
  for (const a of card.anchors) if (!distinct.some((d) => flat(d.quote) === flat(a.quote) || (overlap(d.quote, a.quote) >= 0.9 && overlap(a.quote, d.quote) >= 0.9))) distinct.push(a);
  if (distinct.length < 2) reasons.push('links fewer than two different details');
  return reasons;
}

/** Does the card's link show in the anchors themselves (doc 50 v2, א3 stage 2)? */
export function relationBasis(card: SourceCard, s: Sources): { verified: boolean; why: string } {
  const A = card.anchors;
  const texts = A.map((a) => a.quote);
  const hers = usableAnswers(s).join(' ');
  switch (card.relation) {
    case 'repeat': {
      for (let i = 0; i < A.length; i++)
        for (let j = i + 1; j < A.length; j++) if (anchorWords(A[i]).some((w) => inWords(w, anchorWords(A[j])))) return { verified: true, why: 'the same word in two anchors' };
      return { verified: false, why: 'nothing repeats in the anchors' };
    }
    case 'contrast': {
      // as doc 50 v2 defines it (her approved spec): a negation in one anchor and not in the other ("חזר" / "לא יצא"), a pair of
      // opposites, or a word of hers that says a contrast. (A stricter rule was tried in the round of doc 76 and reverted: not hers.)
      const neg = texts.map((t) => words(t).some(isNegation));
      if (neg.some(Boolean) && neg.some((x) => !x)) return { verified: true, why: 'a negation on one side only' };
      if (texts.some((t) => CONTRAST_MARK.test(t)) || CONTRAST_MARK.test(hers)) return { verified: true, why: 'a contrast word in the anchors or in her words' };
      if (ANTONYMS.some(([x, y]) => texts.some((t) => words(t).some((w) => sameWord(w, x))) && texts.some((t) => words(t).some((w) => sameWord(w, y))))) return { verified: true, why: 'opposite words' };
      return { verified: false, why: 'no opposition shows in the anchors' };
    }
    case 'change':
      return A.some((a) => a.from === 'dream' && CHANGE.test(a.quote)) ? { verified: true, why: 'the dream says it changed' } : { verified: false, why: 'the dream does not say anything changed' };
    case 'missing':
      return texts.some((t) => MISSING.test(t) || words(t).some(isNegation)) ? { verified: true, why: 'something is missing in an anchor' } : { verified: false, why: 'nothing is missing in the anchors' };
    case 'want-vs-cannot':
      return (texts.some((t) => WANT.test(t)) || WANT.test(hers)) && texts.some((t) => CANNOT.test(t)) ? { verified: true, why: 'a wish and what could not be done' } : { verified: false, why: 'no wish and inability in the anchors' };
    case 'similar': {
      const basis = card.basis.filter((b) => b.trim());
      if (!basis.length) return { verified: false, why: 'the shared quality is not named' };
      const covered = new Set<number>();
      for (const b of basis) A.forEach((a, i) => (a.quote.includes(b) || words(a.quote).some((w) => sameWord(w, b))) && covered.add(i));
      return covered.size >= 2 ? { verified: true, why: 'the shared quality is in two anchors' } : { verified: false, why: 'the shared quality is not in two anchors' };
    }
    case 'echo': {
      const ans = A.filter((a) => a.from === 'answer');
      for (let i = 0; i < ans.length; i++) for (let j = i + 1; j < ans.length; j++) if (anchorWords(ans[i]).some((w) => inWords(w, anchorWords(ans[j])))) return { verified: true, why: 'her word in two places' };
      return { verified: false, why: 'no word of hers comes back' };
    }
    case 'odd':
      return ODD_HERS.test(hers) ? { verified: true, why: 'she called it strange' } : { verified: false, why: 'she did not say it was strange' };
    case 'side-by-side':
      return { verified: true, why: 'placed side by side, no link claimed' };
    default:
      return { verified: false, why: 'a possible link, to be offered openly' };
  }
}

/** Card sentences: an offer must be hedged, a fact may only state what the anchors show (her note 2). */
function hedgeProblems(text: string, card: SourceCard, verified: boolean, s: Sources): string[] {
  const reasons: string[] = [];
  for (const sentence of sentencesOf(text)) {
    if (hedged(sentence)) continue;
    const claims = RELATION_CLAIM.test(withoutQuotes(sentence));
    if (card.relation === 'side-by-side' && claims) reasons.push('places two details side by side but claims a link between them');
    else if (claims && !verified) reasons.push('states as a fact a link the dream and her words do not show (offer it openly: "אולי…")');
    else if (newWords(sentence, s).length > (verified ? 4 : 2)) reasons.push(`states as a fact what can only be offered ("${newWords(sentence, s).slice(0, 4).join('", "')}"): offer it openly`);
  }
  return reasons;
}

// ------------------------------------------------------------------------------------------------ quality (never a refusal)

/** Therapy-like or artificial wording, and tics (doc 50 v2, ב3): they lower the score. */
const TONE = /(פותח(?:ת|ים)?\s+(?:כאן\s+)?(?:מרחב|מקום)|מרחב ש|מקום למפגש|מקבל(?:ים|ת|ות)? נוכחות|מזמינ(?:ה|ים)? אותך לשים לב|מדבר(?:ת|ים)? אליך|חוויה של|תהליך|להכיל|להתבונן פנימה|שעוד לא נחקרו|מה זה עושה לרגע|מעניין לראות)/;
const TICS = [/מעניין ש/, /שווה לשים לב/, /אולי יש קשר בין/];
const FILLER = /(יש משהו ב\S+ ש|שמדבר(?:ת)? אליך|מדבר(?:ת)? אליך|במיוחד ברגע הזה|משהו שנשאר פתוח)/;
const GENERIC = new Set(['לראות', 'מקום', 'רגע', 'משהו', 'דבר', 'תחושה', 'תחושת', 'מורגשת', 'מורגש', 'מורגשים', 'מדבר', 'במיוחד', 'נוכחות', 'מרחב', 'חוויה', 'פתוח', 'פתור', 'מענה', 'תשובה', 'אפשרות', 'לחשוב'].map(norm));
/** An open edge: a contrast held, a difference named, attention turned, or a link left as a question. */
const OPEN_EDGE = /(ובכל זאת|בכל זאת|שונים|שונה|אחר(?=[\s,.]|$)|שווה לשים לב|אולי יש קשר|אולי מה ש|לא\s+\S+(?:\s+\S+){0,3}\s+אלא|מה ש\S+\s+\S+.*,\s*ו)/;

function estimateQuality(text: string, card: SourceCard | null, verified: boolean, s: Sources, opts: CandidateOptions): CandidateVerdict['quality'] {
  const notes: string[] = [];
  const answers = usableAnswers(s);
  // an echo: nothing of the dream that her answers did not already say (with a card: its dream anchors; without: the wording)
  const dreamAnchors = card ? card.anchors.filter((a) => a.from === 'dream') : [];
  // adds nothing: every word that carries content is already in one question she was asked or in her answer to it
  const carrying = contentWords(withoutQuotes(text)).filter((w) => !GENERIC.has(norm(w)) && !GLUE.has(norm(w)) && !HEDGE.test(w) && !/^(?:ו|ש)?(אמרת|תיארת|שתיארת|סיפרת|ציינת)$/.test(norm(w)));
  const joinsOneExchange = (opts.exchanges ?? []).some((x) => !isUnsureAnswer(x.answer) && carrying.length > 0 && carrying.every((w) => inWords(w, words(`${x.question} ${x.answer}`))));
  // an anchor from her answer that repeats an anchor from the dream is the same detail, not a second one ("לא הבנתי איך…" twice: doc 56)
  const answerAnchors = card ? card.anchors.filter((a) => a.from === 'answer') : [];
  const sameDetail = (a: Anchor, b: Anchor) => overlap(a.quote, b.quote) >= 0.5 || overlap(b.quote, a.quote) >= 0.5;
  const newDreamAnchors = dreamAnchors.filter((d) => !answerAnchors.some((a) => sameDetail(a, d)));
  const echo = card
    ? dreamAnchors.length === 0 ||
      dreamAnchors.every((a) => anchorWords(a).every((w) => inWords(w, answers.flatMap(words)))) ||
      newDreamAnchors.length === 0
    : answers.some((a) => overlap(text, a) >= 0.6) || joinsOneExchange;
  // the "basis" the card names must be in its anchors; a basis made up for the card does not count (doc 56, problem 3)
  const basisInAnchors = !card || card.basis.length === 0 || card.basis.some((b) => card.anchors.some((a) => a.quote.includes(b)) || (contentWords(b).length > 0 && contentWords(b).every((w) => card.anchors.some((a) => inWords(w, words(a.quote)))))) || card.basis.every((b) => contentWords(b).length === 0);
  const repeatsEarlier = (opts.earlier ?? []).some((x) => overlap(text, x) >= 0.6);
  const fresh = sentencesOf(text).flatMap((x) => newWords(x, s));
  let level: 0 | 1 | 2 | 3;
  if (FILLER.test(text)) (level = 0), notes.push('empty: says "there is something" without saying what');
  else if (echo) (level = 0), notes.push(joinsOneExchange ? 'joins again a question she was asked and her answer to it' : 'an echo of her answer');
  else if (repeatsEarlier) (level = 0), notes.push('repeats an insight already shown in this journey');
  else if (!card) {
    level = 2;
    notes.push(fresh.length === 0 || fresh.every((w) => GENERIC.has(norm(w))) ? 'no source card: links the dream and her words, rated an observation at most' : 'no source card: rated an observation at most');
  } else if (card.anchors.every((a) => a.from === 'answer') && card.relation === 'side-by-side') (level = 1), notes.push('gives back her words only');
  else {
    const edge = card.relation !== 'side-by-side' && ((verified && ['contrast', 'want-vs-cannot', 'change'].includes(card.relation)) || OPEN_EDGE.test(withoutQuotes(text)));
    // her words count for THIS moment only when her answer speaks of it: an answer whose words are all of another part of the dream
    // (doc 65, issue 3: asked "what stood out", she spoke of the market, not of the umbrella) links two moments, not her and this one
    const momentWords = [...allowedDreamText(s).flatMap(words), ...antecedents(s.segments, s.allowed)];
    const otherWords = s.segments.filter((x) => !s.allowed.includes(x.id)).flatMap((x) => words(x.text));
    const aboutElsewhere = (answer: string) => s.allowed.length > 0 && !contentWords(answer).some((w) => inWords(w, momentWords)) && contentWords(answer).some((w) => inWords(w, otherWords));
    const herWordsHere = card.anchors.some((a) => a.from === 'answer' && usableAnswers(s).some((x) => containsVerbatim(x, a.quote.trim()) && !aboutElsewhere(x)));
    const herWordsElsewhere = !herWordsHere && card.anchors.some((a) => a.from === 'answer');
    const touches = herWordsHere || card.anchors.some((a) => WANT.test(a.quote) || CANNOT.test(a.quote) || CHANGE.test(a.quote) || FIGURE_SAYS.test(a.quote));
    level = edge && touches && basisInAnchors ? 3 : 2;
    if (herWordsElsewhere) notes.push('her words here are about another part of the dream, not this moment');
    if (!basisInAnchors) notes.push('the basis named in the card is not in its anchors');
    notes.push(level === 3 ? 'links details, touches her words or a charged detail, and leaves something open' : edge ? 'an open edge, but on nothing she said or charged' : 'an accurate observation, nothing left open');
  }
  let score = level * 100;
  if (card?.anchors.some((a) => a.from === 'answer')) score += 5;
  if (words(text).length <= 40) score += 3;
  const tone = text.match(new RegExp(TONE, 'g')) ?? [];
  if (tone.length) (score -= 15 * tone.length), notes.push(`therapy-like or artificial wording: ${tone.join(', ')}`);
  for (const t of TICS) if (t.test(text) && (opts.earlier ?? []).some((x) => t.test(x))) (score -= 10), notes.push(`a tic already used in this journey (${t.source})`);
  const opening = words(text).slice(0, 3).join(' ');
  if ((opts.earlier ?? []).some((x) => words(x).slice(0, 3).join(' ') === opening)) (score -= 10), notes.push('opens like an earlier insight');
  return { level, score, notes };
}

// ------------------------------------------------------------------------------------------------ the verdict and the choice

export function verifyCandidate(candidate: Candidate, s: Sources, opts: CandidateOptions = {}): CandidateVerdict {
  const c = candidate.card ? { ...candidate, card: restoreAnchors(candidate.card, s) } : candidate;
  const reasons: string[] = [];
  let verified = false;
  if (c.card) {
    reasons.push(...anchorProblems(c.card, s));
    const rel = relationBasis(c.card, s);
    verified = rel.verified;
    reasons.push(...hedgeProblems(c.text, c.card, verified, s));
    // a link the card claims but the anchors do not show may only be offered openly: some sentence must offer it
    if (!verified && !['side-by-side', 'open-link'].includes(c.card.relation) && !sentencesOf(c.text).some(hedged)) reasons.push(`claims a link (${c.card.relation}) the anchors do not show, as a fact: ${rel.why}`);
    reasons.push(...verifyInterpretation(c.text, [], new Set(), s, { exploredCount: opts.exploredCount ?? 1, requireBasis: false, everyHedged: false }));
  } else {
    reasons.push(...verifyInterpretation(c.text, c.basis ?? [], opts.verified ?? new Set(), s, { exploredCount: opts.exploredCount ?? 1, requireBasis: opts.verified !== undefined }));
  }
  const unique = [...new Set(reasons)];
  return { safety: { ok: unique.length === 0, reasons: unique }, quality: estimateQuality(c.text, c.card, verified, s, opts) };
}

/** The best safe candidate by quality, never the first that passes; none when the best is only an echo or a reflection (note 1). */
export function selectPossibility(cands: readonly Candidate[], s: Sources, opts: CandidateOptions = {}): { index: number | null; verdicts: CandidateVerdict[] } {
  const verdicts = cands.map((c) => verifyCandidate(c, s, opts));
  let best: number | null = null;
  verdicts.forEach((v, i) => {
    if (!v.safety.ok) return;
    if (best === null || v.quality.score > verdicts[best].quality.score) best = i;
  });
  if (best !== null && verdicts[best].quality.level <= 1) best = null;
  return { index: best, verdicts };
}

// ------------------------------------------------------------------------------------------------ questions

/** A question at or above this score may be asked; below it, another candidate or the safe question written by code. */
export const QUESTION_FLOOR = 0;
const SALIENCE = /^(?:ו)?מה\s+(?:הכי\s+)?(?:הדבר הראשון|התחושה הראשונה|משך|בלט|תפס|בולט|הראשון)|תשומת (?:ה)?ל(?:ב|יבך)|תפס את העין/;
// "אם היית…" is the commonest Hebrew "what if"; the older pattern needed a word between "אם" and "היית" and missed it (doc 65, issue 2)
const HYPOTHETICAL = /(אילו|אם\s+(?:\S+\s+){0,2}?(?:היה|היו|הייתה|היית)(?![א-ת])|(?:היה|היו|הייתה)\s+(?:ממשיכ\S*|אומר\S*|יכול\S*))/;
/** What a "what if" imagines her doing: the words after "אם היית (יכולה / מצליחה)", up to where the clause turns to the moment ("ברגע…"). */
const IMAGINED = /אם\s+(?:את\s+|אתה\s+)?(?:היית|הייתה|היה)\s+(?:(?:יכולה|יכול|מצליחה|מצליח)\s+)?([^,?.]+)/;
/** A feeling she is said to have inside a "when" clause ("כשאת מרגישה את הקריעה"): the question takes it as given. */
const WHEN_YOU_FEEL = /(?:כש|ש|כאשר\s+)(?:את|אתה)\s+(\S+)/g;
/** What the dream itself leaves open: a creative "what if" may test it. */
const OPEN_IN_DREAM = /(אולי|לא בטוח|לא בטוחה|לא יודע|לא יודעת|כאילו)/;
const GENERIC_Q = /(מה עוד עולה|מה עולה בך|מה את מרגישה עכשיו)/;

export function questionQuality(q: string, ctx: { momentText: string; prior: readonly string[]; plannedFocus?: QuestionFocus | null; focus?: QuestionFocus | null; answers?: readonly string[] }): { score: number; notes: string[] } {
  const notes: string[] = [];
  let score = 10;
  const opening = (x: string) => words(x).slice(0, 3).map(norm).join(' ');
  if (SALIENCE.test(q) && ctx.prior.some((p) => SALIENCE.test(p))) (score -= 20), notes.push('"what stood out / the first thing" again: a questionnaire');
  if (ctx.prior.some((p) => opening(p) === opening(q))) (score -= 20), notes.push('opens like an earlier question');
  const hers = (ctx.answers ?? []).filter((a) => !isUnsureAnswer(a)).flatMap(words);
  if (HYPOTHETICAL.test(q)) {
    // what it imagines must be something of the moment (or of her words): "אם היית מצליחה לסגור את המטריה" imagines the moment's own
    // wish; "אם היית יכולה להגיד משהו לעצמך" imagines something the dream does not have: an exercise, not a question about the dream
    const imagined = IMAGINED.exec(q)?.[1].split(/\s+/).filter(Boolean) ?? null;
    const cut = imagined ? imagined.findIndex((w) => /^(?:ו)?(?:ברגע|כש|כאשר|בזמן)/.test(w)) : -1;
    const action = imagined && cut >= 0 ? imagined.slice(0, cut) : imagined;
    const moment = [...words(ctx.momentText), ...hers];
    const ofTheMoment = !action || contentWords(action.join(' ')).some((w) => inWords(w, moment));
    // open in the dream: a doubt ("אולי", "לא בטוחה"), or something wanted and not done ("רציתי… לא יצא", "ניסיתי לסגור… אבל… נקרעה")
    const open = OPEN_IN_DREAM.test(ctx.momentText) || (WANT.test(ctx.momentText) && (CANNOT.test(ctx.momentText) || CONTRAST_MARK.test(ctx.momentText)));
    if (!ofTheMoment) (score -= 20), notes.push('a "what if" about something the dream does not have: an exercise');
    else if (open) (score -= 2), notes.push('a "what if" about what the dream leaves open (ranked below a direct question)');
    else (score -= 20), notes.push('a creative "what if" that tests nothing the dream leaves open');
  }
  for (const m of q.matchAll(WHEN_YOU_FEEL)) {
    const verb = m[1].replace(/[^א-ת]/g, '');
    if (MENTAL_PRESENT.test(verb) && !inWords(verb, hers)) (score -= 20), notes.push(`presupposes what she feels, which she did not say ("${verb}")`);
  }
  if (GENERIC_Q.test(q)) (score -= 5), notes.push('a general question');
  if (ctx.plannedFocus && ctx.focus === ctx.plannedFocus) (score += 3), notes.push('the kind planned for this moment');
  return { score, notes };
}

const SENSITIVE = /(בית חולים|בבית החולים|חולה|מחלה|מת(?=[\s,.]|$)|מתה|מוות|הלוויה|קבר|דם(?=[\s,.]|$)|פצוע|פציעה|נפגע|נפגעה|תאונה)/;

/** The kind of question that fits this moment, not the same kind as the moment before. */
export function planQuestionFocus(momentText: string, priorFoci: readonly (QuestionFocus | null)[]): QuestionFocus {
  const last = priorFoci[priorFoci.length - 1] ?? null;
  const wanted: QuestionFocus[] = [];
  if (/(אולי אני|לא בטוח|לא בטוחה)/.test(momentText)) wanted.push('whatif');
  if (FIGURE_SAYS.test(momentText)) wanted.push('figure');
  if (CHANGE.test(momentText)) wanted.push('change');
  if (WANT.test(momentText) && CANNOT.test(momentText) && !SENSITIVE.test(momentText)) wanted.push('feeling');
  wanted.push('detail', 'surprise', 'connection', 'sense', 'choice');
  return wanted.find((f) => f !== last && (f === 'whatif' || f === 'figure' || f === 'change' || f === 'feeling' || !priorFoci.includes(f))) ?? 'connection';
}

export { SENSITIVE };
