import type { AddressPreference } from './addressPreference.js';
import type { AppLanguage } from './appLanguage.js';
import { feelingsTextLooksDiagnostic } from './dreamReflectionSchema.js';
import { dreamerIsTarget, eventOrder, negatedIn, textOfSegments, whoActs, type DreamSegment } from './dreamSegments.js';
import { QUESTION_FLOOR, questionQuality, restoreAnchors, selectPossibility, type CandidateVerdict, type SourceCard } from './interpretationCheck.js';
import {
  containsVerbatim,
  nonTemporal,
  quotedAs,
  contentWords,
  everySentenceTentative,
  firstPersonOutsideQuotes,
  inWords,
  inWordsLong,
  flat,
  isFeelingWord,
  isFirstPersonVerb,
  isFirstPersonWord,
  isNegation,
  isSecondPersonForm,
  isTimeWord,
  isUnsureAnswer,
  neutralizeFirstPerson,
  norm,
  overlap,
  sameWord,
  withoutQuotes,
  words,
} from './hebrewText.js';

/**
 * WHERE EVERY SENTENCE COMES FROM, CHECKED (stage 3b fix round, doc 30 and its four binding amendments). The journey's model calls
 * return sentences that each say their source; this file decides, without a model, what of it may be shown:
 *
 *  - DREAM: a sentence about ONE part of the dream, with the verb copied from it and who acted on whom. Shown as written only when
 *    every word is the part's own, no time word is added, the negation is the same, and the doer and the one acted on match the
 *    part's grammar. Otherwise the part itself is shown as an exact quote (or, outside the moment, dropped). Never a link between
 *    two events: that is an interpretation, or nothing.
 *  - USER: a sentence giving back what the dreamer said, with a verbatim piece of her answer. Shown as written only when it uses her
 *    words (and the moment's), adds no feeling, time or negation; otherwise her own words are quoted. "I don't know" is never a source.
 *  - INTERPRETATION: shown only when every sentence is a hedged possibility, it rests on a sentence that passed, and it gives her no
 *    feeling she did not name; otherwise it is not shown at all.
 *
 * Passing here is LEXICAL AND GRAMMATICAL SUPPORT, not proof that a sentence is true; the reports and the code say so.
 */

export type Status = 'checked' | 'quote' | 'drop';
export interface Verdict {
  status: Status;
  reasons: string[];
}

export interface DreamClaim {
  segment: number;
  action: string;
  actor: string;
  target: string;
  text: string;
}
export interface UserClaim {
  quote: string;
  text: string;
}
export interface Possibility {
  basis: string[];
  text: string;
  /** Its source card (doc 50 v2): what it links and on what. Older replies have none. */
  card?: SourceCard | null;
}

export interface Sources {
  language: AppLanguage;
  sourceText: string;
  segments: DreamSegment[];
  /** The parts that may be stated as facts here (the moment's, or the explored moments'). */
  allowed: number[];
  /** The dreamer's usable words here (never an "I don't know"). */
  answers: string[];
  /** How she asked to be addressed (her own sentence is given back in the second person only when it fits). */
  address?: AddressPreference;
  /** The parts of the moment itself (when "allowed" is wider), parts explored earlier, and questions asked earlier: for the invitation. */
  momentSegments?: number[];
  explored?: number[];
  priorQuestions?: string[];
  /** The questions asked about this moment, each with her answer to it. */
  exchanges?: { question: string; answer: string }[];
}

const segWords = (s: Sources, ids: readonly number[]) => ids.flatMap((id) => (s.segments[id] ? words(s.segments[id].text) : []));
const answerWords = (s: Sources) => s.answers.flatMap(words);
const otherSegWords = (s: Sources) => segWords(s, s.segments.map((x) => x.id).filter((id) => !s.allowed.includes(id)));

const OBJECT_PRONOUN = { f: /^(?:ו|ש|וש|כש|וכש)?אותה$/, m: /^(?:ו|ש|וש|כש|וכש)?אותו$/ } as const;
const SUBJECT_PRONOUN = /^(?:ו|ש|וש|כש|וכש)?(?:היא|הוא)$/;
const bareWord = (w: string) => w.replace(/[^א-ת]/g, '');

/** The positions of a gender's object pronoun in `ws`: "אותה" followed by a noun is "the same" ("אותה מעטפה"), not a pronoun. */
const objectPronouns = (ws: readonly string[], g: 'f' | 'm') =>
  ws.flatMap((w, i) => {
    if (!OBJECT_PRONOUN[g].test(bareWord(w))) return [];
    const next = ws[i + 1] ? bareWord(ws[i + 1]) : '';
    // "אותה מעטפה" is a noun phrase; "אותה וחוזר" ends the pronoun's clause (a word opening with "ו" starts the next one)
    return next && !next.startsWith('ו') && !SUBJECT_PRONOUN.test(next) && contentWords(next).length > 0 ? [] : [i];
  });

/**
 * What a moment's pronoun refers to, when the moment names it only that way (doc 62, item 1): "ניסיתי לסגור אותה אבל היא נקרעה לי
 * בידיים" is about the umbrella of "ואז קניתי מטריה". Grammar, not a list:
 *  - only an OBJECT pronoun ("אותה", "אותו"): a subject pronoun ("היא", "הוא") is mostly a person, whose gender a word's ending does
 *    not show ("אמא"), so it is not resolved (doc 64, part C: "והיא ארזה" is the mother, not "בדירה");
 *  - with no noun of that gender before it in the moment itself;
 *  - it refers to a singular noun of that gender (feminine: ending in ה/ת) in the nearest part before it, at most two parts back, skipping a
 *    part that itself only refers back; the definite noun, or the one after "את", first, otherwise the first one (an adjective follows
 *    its noun: "צעיף צמר אדום").
 * Only that one word becomes the moment's own; the rest of that part stays another part. When nothing fits, nothing is added, and the
 * moment keeps the older, stricter behaviour.
 */
export function antecedents(segments: readonly DreamSegment[], ids: readonly number[]): string[] {
  if (!ids.length) return [];
  const first = Math.min(...ids);
  const own = ids.flatMap((id) => (segments[id] ? words(segments[id].text) : []));
  const out: string[] = [];
  for (const g of ['f', 'm'] as const) {
    const at = objectPronouns(own, g)[0];
    if (at === undefined) continue;
    const fits = (w: string) => {
      const b = bareWord(w);
      return b.length >= 2 && contentWords(w).length > 0 && !isFirstPersonWord(w) && !OBJECT_PRONOUN.f.test(b) && !OBJECT_PRONOUN.m.test(b) && !SUBJECT_PRONOUN.test(b) && !/(?:ים|ות)$/.test(b) && (g === 'f') === /[הת]$/.test(b);
    };
    if (own.slice(0, at).some(fits)) continue; // the moment names it itself
    for (let id = first - 1; id >= Math.max(0, first - 2); id -= 1) {
      const seg = segments[id];
      if (!seg) break;
      const ws = words(seg.text);
      if (objectPronouns(ws, g).length) continue; // that part refers back too
      const nouns = ws.map((w, i) => ({ w, definite: /^(?:ו)?ה/.test(bareWord(w)) || bareWord(ws[i - 1] ?? '') === 'את' })).filter((x) => fits(x.w));
      const noun = (nouns.find((x) => x.definite) ?? nouns[0])?.w;
      if (noun) out.push(noun.replace(/[^א-ת]/g, ''));
      break;
    }
  }
  return out;
}

const DREAM_META = ['חלום', 'בחלום', 'רגע', 'ברגע', 'הרגע', 'רגעים', 'הרגעים', 'dream', 'moment', 'moments'].map(norm);
const ATTRIBUTION = ['אמרת', 'סיפרת', 'תיארת', 'שתיארת', 'ציינת', 'כתבת', 'שיתפת', 'הזכרת', 'ענית', 'said', 'told', 'described', 'mentioned', 'wrote', 'shared'].map(norm);
const isMeta = (w: string, list: readonly string[]) => list.some((m) => norm(w) === m || norm(w).endsWith(m) && norm(w).length <= m.length + 1);

export { UNSURE, isUnsureAnswer } from './hebrewText.js';

const quoteMarks = (language: AppLanguage) => (language === 'he' ? ['«', '»'] : ['“', '”']);
export const quoted = (language: AppLanguage, text: string) => {
  const [o, c] = quoteMarks(language);
  return `${o}${text.trim()}${c}`;
};

// ------------------------------------------------------------------------------------------------ DREAM

export function verifyDreamClaim(claim: DreamClaim, s: Sources): Verdict {
  if (!s.allowed.includes(claim.segment) || !s.segments[claim.segment]) return { status: 'drop', reasons: ['rests on a part of the dream outside this moment'] };
  const seg = s.segments[claim.segment];
  const own = [...words(seg.text), ...antecedents(s.segments, [seg.id])];
  const context = s.segments.filter((x) => x.id !== seg.id && x.sentence === seg.sentence && s.allowed.includes(x.id)).flatMap((x) => words(x.text));
  const reasons: string[] = [];
  const outside = withoutQuotes(claim.text);
  const ws = words(outside);
  if (firstPersonOutsideQuotes(claim.text).length) reasons.push('first person in a sentence addressed to the dreamer');
  for (const w of contentWords(outside)) {
    if (inWords(w, own) || isMeta(w, DREAM_META) || (!isTimeWord(w) && inWords(w, context))) continue;
    if (isTimeWord(w)) reasons.push(`adds a time word the part does not have ("${w}")`);
    else if (inWords(w, answerWords(s))) reasons.push(`states the dreamer's own detail as the dream's ("${w}")`);
    else if (inWords(w, otherSegWords(s))) reasons.push(`brings in another part of the dream ("${w}")`);
    else reasons.push(`a word the dream does not have ("${w}")`);
  }
  if (ws.filter(isNegation).length > own.filter(isNegation).length) reasons.push('adds a negation');
  // the event itself: the verb, its negation, who did it, to whom
  const rawActor = norm(claim.actor.trim());
  const declared = /dreamer|^(את|אתה|אתם|אני|אנחנו|we|you|i|she|her|החולמת|החולם)$/.test(rawActor) ? 'dreamer' : rawActor;
  const candidates = [...claim.action.trim().split(/\s+/), ...ws].filter((v) => v && whoActs(seg.text, v) !== null && ws.some((x) => sameWord(x, v)));
  const consistent = candidates.find((v) => (whoActs(seg.text, v)?.kind === 'dreamer') === (declared === 'dreamer'));
  const verb = consistent ?? candidates[0] ?? claim.action.trim();
  const actor = verb ? whoActs(seg.text, verb) : null;
  const existential = ['יש', 'אין', 'היה', 'הייתה', 'היתה', 'היו', 'there'].includes(norm(verb).replace(/^[ושכ]+(?=יש|אין|היה|היו)/, ''));
  if (!verb || !actor) reasons.push('no verb of the part to check the event against');
  else {
    const inClaim = ws.findIndex((w) => sameWord(w, verb));
    if (inClaim < 0) reasons.push('the sentence does not say the part\'s verb');
    else {
      if (negatedIn(seg.text, verb) !== negatedIn(outside, verb)) reasons.push('the negation of the verb is flipped');
      const inDream = own.find((w) => sameWord(w, verb)) ?? verb;
      const second = isSecondPersonForm(ws[inClaim], ws.slice(0, inClaim), actor.kind === 'dreamer' ? '' : inDream);
      if (existential) {
        // "יש את אותה מעטפה": no one acts; only the words and the negation count
      } else if (actor.kind === 'dreamer') {
        if (declared !== 'dreamer') reasons.push('the dreamer did this, the sentence says someone else did');
        if (!second) reasons.push('the dreamer did this, the sentence does not say "you" did');
      } else {
        if (declared === 'dreamer') reasons.push('someone else did this, the sentence says the dreamer did');
        if (second) reasons.push('someone else did this, the sentence says "you" did');
        if (actor.kind === 'figure') {
          if (declared && declared !== 'unknown' && !actor.words.some((w) => sameWord(w, declared))) reasons.push('names a different doer');
          if (!actor.words.some((w) => inWords(w, ws) || inWords(neutralizeFirstPerson(w), ws))) reasons.push('does not name who did it');
        }
      }
      const rawTarget = norm(claim.target.trim());
      const target = /dreamer|^(את|אתה|אותך|לך|אני|אותי|לי|you|me|her|החולמת|החולם)$/.test(rawTarget) ? 'dreamer' : rawTarget;
      const reflexive = target === 'dreamer' && declared === 'dreamer'; // "you did not know": no one else is acted on
      if (!existential && !reflexive && target === 'dreamer' && !dreamerIsTarget(seg.text)) reasons.push('says it was done to the dreamer; the part does not');
      if (!existential && target && target !== 'dreamer' && target !== 'unknown' && dreamerIsTarget(seg.text) && !rawTarget.split(/\s+/).every((t) => inWords(t, [...own, ...context]))) reasons.push('says it was done to someone else; the part says to the dreamer');
    }
  }
  return { status: reasons.length ? 'quote' : 'checked', reasons };
}

// ------------------------------------------------------------------------------------------------ USER

export function verifyUserClaim(claim: UserClaim, s: Sources): Verdict {
  const usable = s.answers.filter((a) => !isUnsureAnswer(a));
  if (!claim.quote.trim() || !usable.some((a) => containsVerbatim(a, claim.quote))) return { status: 'drop', reasons: ['the quote is not in what the dreamer said'] };
  if (isUnsureAnswer(claim.quote)) return { status: 'drop', reasons: ['"I don\'t know" is not something to give back as content'] };
  const reasons: string[] = [];
  const outside = withoutQuotes(claim.text);
  const own = usable.flatMap(words);
  const moment = segWords(s, s.allowed);
  if (firstPersonOutsideQuotes(claim.text).length) reasons.push('the dreamer\'s sentence copied in the first person');
  for (const w of contentWords(outside)) {
    if (inWords(w, own) || isMeta(w, ATTRIBUTION) || isMeta(w, DREAM_META)) continue;
    if (inWords(w, moment) && !isFeelingWord(w) && !isTimeWord(w)) continue;
    reasons.push(isFeelingWord(w) ? `gives her a feeling she did not name ("${w}")` : isTimeWord(w) ? `adds a time word ("${w}")` : `words she did not say ("${w}")`);
  }
  if (words(outside).some(isNegation) && !usable.some((a) => words(a).some(isNegation))) reasons.push('adds a negation she did not say');
  return { status: reasons.length ? 'quote' : 'checked', reasons };
}

// ------------------------------------------------------------------------------------------------ INTERPRETATION

const DIAGNOSTIC = /(טראומ|דיכאון|דיכאוני|הפרעה|פוסט[\s-]?טראומ|חרדתי|נוירוז|trauma|depress|disorder|ptsd|neuros)/i;
/** Reading an image as a sign of something ("מצביע על", "מרמז על", "סימן ל"). Allowed only as her own words given back. */
const POINTS_TO = /((?:ל)?הצביע על|מצביע(?:ה|ים|ות)? על|(?:ל)?העיד על|מעיד(?:ה|ים|ות)? על|סימן ל|indicates?|points? to|is a sign)/i;
/**
 * The careful form ("אולי … מרמז על", "hints at"): shown only in context, when what it hints at rests on what she said (the clause
 * after it is hers: see mostlyHers) and every other rule holds (hedged, no fixed meaning, no feeling, wish, need or cause she did not say).
 */
const HINTS_AT = /((?:ל)?רמוז (?:על|ל)|(?:מ)?רמז(?:ת|ים|ות)? (?:על|ל)|רומז(?:ת|ים|ות)? (?:על|ל)|hints? at|suggests?)/i;
const FIXED_MEANING = /(מסמל|מסמלת|מייצג|מייצגת|ייצג|סימל|סמל של|סמל ל|מסמן|מסמנת|מסמנים|דימוי ל|מטאפורה|מבטא|מבטאת|מבטאים|מבטאות|symboli[sz]e|represent|stands for|a symbol|a metaphor|expresses)/i;
/** The same by root, every form (ס-מ-ל, ס-מ-ן, י-צ-ג, "משמעותו", "פירושו"): "מסמנות" no longer slips through (doc 50 v2, א3 stage 5). */
const FIXED_ROOT = /(?<![א-ת])(?:ו)?(?:(?:מ|ל)ס(?:י)?מ(?:ל|ן|נ)(?:ת|ים|ות|ה|ו)?|סימל(?:ה|ו)?|סמל(?:ים)?|(?:מ|ל)?י{1,2}צ(?:ג|וג)(?:ת|ים|ות|ה|ו)?|משמעותו|משמעותה|משמעותם|פירושו|פירושה)(?![א-ת])/;
/** A cause for what happened or what she felt ("כי", "בגלל", "גרם לך"): shown only when the cause is in her own words. */
const CAUSE_AFTER = /(^|[\s,])(כי|בגלל|מפני ש|משום ש|because|since)(?=[\s,]|$)/gi;
const CAUSE_BEFORE = /(^|[\s,])(גרם|גרמה|גרמו|גורם|גורמת|גורמים|הוביל|הובילה|הובילו)\s+(לך|אותך)(?=[\s,]|$)|(^|[\s,])(תרם|תרמה|תרמו|תורם|תורמת|תורמים)\s+ל\S*|\b(made you|caused you|led you|contributed to)\b/gi;
/** She gave a cause herself (a causal word in her answers): only then may a possibility give one, in her words. */
const HER_CAUSE = /(^|[\s,])(?:ו)?(כי|בגלל|מפני|משום|גרם|גרמה|גרמו|גורם|גורמת|הוביל|הובילה|לכן|ולכן|בעקבות|כתוצאה|because|so that|made me)(?=[\s,.]|$)/i;

/**
 * PSYCHOLOGICAL MEANING IN ANY PERSON (doc 50 v2, א3 stage 4): refused even when the sentence does not address her, and "אולי" does not
 * make it acceptable. Five families; a family's key words that are hers ("געגוע" she said) pass.
 */
const PSY_EQUATION = /(?<![א-ת])(?:ו)?(?:הוא|היא|הם|הן)\s+(?:אולי\s+)?(?:ה)?(?:חלק|צד|קול|ייצוג|ביטוי|השתקפות|תזכורת|גילום|גלגול|סמל|דימוי)(?![א-ת])|(?<![א-ת])(?:ו)?(?:משקף|משקפת|משקפים|משקפות|מגלם|מגלמת|מגלמים|מגלמות)(?![א-ת])|החלק\s+(?:ש)?בך|הצד\s+(?:ש)?בך/;
const PSY_ABOUT = /(?<![א-ת])(?:ו)?(?:ה)?חלום(?:\s+(?:הזה|הזו|כולו))?\s+(?:כולו\s+)?(?:עוסק|מדבר|נוגע|סובב|מספר)\s*(?:ב|על|סביב)?|זה חלום על|(?<![א-ת])החלום הוא (?:על|חלום)/;
const PSY_JARGON = /(לא[-\s]מודע|תת[-\s]מודע|תת[-\s]ההכרה|(?<![א-ת])העצמי(?![א-ת])|(?<![א-ת])האגו(?![א-ת])|הילד(?:ה)? הפנימי(?:ת)?|ארכיטיפ|השלכה|הדחקה|מודחק|קונפליקט|התקשרות|(?<![א-ת])דפוס(?:ים)?(?![א-ת]))/;
const PSY_MESSAGE = /(?<![א-ת])(?:ו)?(?:בעומק|בעצם החלום|המסר של החלום|החלום (?:מנסה|רוצה|בא) ל|מה שהחלום (?:אומר|רוצה|מנסה)|ברובד (?:העמוק|הפנימי)|במהותו)/;
/** Concepts of an inner world (beyond the feelings list): only in her words, whoever the sentence is about. */
const INNER_CONCEPTS = ['אובדן', 'פרידה', 'נטישה', 'זהות', 'קרבה', 'קירבה', 'צורך', 'משאלה', 'כמיהה', 'שאיפה', 'השתוקקות', 'תקיעות', 'תקועה', 'תקוע', 'חופש', 'עצמאות', 'פספוס', 'החמצה', 'שחרור', 'לשחרר', 'להרפות', 'להיאחז', 'היאחזות', 'חסך', 'ריקנות', 'נסיגה', 'מצפון'].map(norm);

/**
 * CLAIMS ABOUT HER INNER WORLD (doc 50 v2, א3 stage 3): where a sentence speaks of her inside ("עורר בך", "פתח אצלך", "את מחפשת",
 * "חשוב לך", "התחושה שלך ש…"), what it says must be in her words (her answers or the dream she wrote). "אמרת ש…" gives back only what
 * she said. Grammatical markers, not a list of feelings that can be forgotten.
 */
// the prepositions that place something in her as its experiencer, with the second-person ending ("עבורך" and "בשבילך": doc 65, issue 4)
const INNER_LOCUS = /^(?:ו)?(בך|אצלך|בתוכך|לעצמך|בעצמך|עבורך|בשבילך)$/;
/** A mental verb said of her: a past "you" form ("הרגשת", "חיפשת") always; a present form ("מרגישה", "מחפשת") only after "את" / "אתה". */
const MENTAL_PAST_YOU = /^(?:[ושכ]{0,2})(הרגשת|חשבת|ידעת|הבנת|חיפשת|פגשת|חווית|התמודדת|קיווית|פחדת|התגעגעת|זכרת)$/;
export const MENTAL_PRESENT = /^(?:[ושכ]{0,2})(מרגישה|מרגיש|חושבת|חושב|יודעת|יודע|מבינה|מבין|מחפשת|מחפש|פוגשת|פוגש|חווה|מתמודדת|מתמודד|משתוקקת|משתוקק|מקווה|מפחדת|מפחד|מתגעגעת|מתגעגע|זוכרת|זוכר)$/;
const YOU_PRONOUN = /^(?:[ושכ]{0,2})(את|אתה)$/;
/** A verb that says what moves her, with "אותך" ("שמרגשים אותך", "מבלבל אותך"): what it says must be hers. */
const EMOTIVE_YOU = /^(?:[ושכ]{0,2})(מרגש|מרגשת|מרגשים|מרגשות|מפחיד|מפחידה|מפחידים|מעציב|מעציבה|משמח|משמחת|מבלבל|מבלבלת|מטריד|מטרידה|מעסיק|מעסיקה|מושך|מושכת|מעורר|מעוררת|מלווה|מלווים)$/;
const EVALUATIVE = /^(?:[ושכ]{0,2})(חשוב|חשובה|קשה|נעים|נעימה|קל|קלה|ברור|ברורה|כואב|כואבת|טוב|רע|מוכר|מוכרת|מפחיד|מרגיע)$/;
// "מקום" as one's place among others ("מקומך בין אנשים", doc 70) is a noun of the same class
const INNER_NOUN = /^(?:ו)?ה?(תחושה|רגש|רצון|צורך|פחד|חשש|געגוע|כאב|עולם|נפש|לב|מקום)$/;
/** The same nouns with the second-person ending: "מקומך", "רצונך", "ליבך" are "המקום שלך", "הרצון שלך", "הלב שלך". */
const INNER_NOUN_YOURS = /^(?:[ובלמה]{0,2})(תחושת|רגש|רצונ|צורכ|פחד|חשש|געגוע|כאב|עולמ|נפש|ליב|לב|מקומ)ך$/;
const ATTRIBUTION_VERB = /^(?:ו)?(אמרת|תיארת|סיפרת|ציינת|כתבת|הזכרת|ענית)$/;
/** A wish or a need given to her ("מרמז על רצון", "צורך", "היית רוצה"): shown only when she said she wanted something. */
const DESIRE = /(^|[\s,])(?:[ושכלב]{0,2})(רצון|רצונך|רצונות|כמיהה|משאלה|השתוקקות|רצית|רוצה|תרצי|wish|desire|yearning)(?=[\s,.?!]|$)/i;
const NEED = /(^|[\s,])(?:[ושכלבה]{0,2})(צורך|צרכים|צרכייך|צריכה|זקוקה|זקוק|need|needs|a need)(?=[\s,.?!]|$)/i;
const SHE_NEEDED = /(^|[\s,])(?:[ושכ]{0,2})(צריכה|צריך|הייתי צריכה|זקוקה|זקוק|צורך|need|needed)(?=[\s,.?!]|$)/i;
const SHE_WANTED = /(^|[\s,])(?:[ושכ]{0,2})(רוצה|רציתי|רצית|רצתה|רצון|ארצה|צריכה|צריך|want|wanted|wish|need)(?=[\s,.?!]|$)/i;
/** Therapy language: a process or an aim she did not name ("לעבד תחושות", "להשלים עם", "ריפוי"). */
/**
 * Therapy wording by its form, not by a list of phrases (doc 76, item ב; R14 of the golden set): a verb of opening or inviting whose
 * object is her attention ("מזמין לשים לב", "הזמינה אותך להרגיש"); a "space", "place" or "presence" for a feeling she did not name
 * ("פותח מקום לתחושות נוספות", R14) — for a feeling she named it is her own ("נותן מקום לחסר ולגעגוע שתיארת", approved in the
 * quality round); and a feeling that "receives presence".
 */
const OPENS_TO = /(?<![א-ת])(?:ו|ש)?(?:פותח|פותחת|פותחים|פותחות|פתח|פתחה|פתחו|מזמין|מזמינה|מזמינים|מזמינות|הזמין|הזמינה|הזמינו)\s+(?:(?:לך|אותך|אצלך|בך)\s+)?ל(?:שים|הרגיש|פגוש|הבחין|התבונן|התחבר|הקשיב|חשוב|גלות|הכיל)(?![א-ת])/;
const SPACE_OF = /(?<![א-ת])(?:ו|ה|ב|ל)?(?:מקום|מרחב|נוכחות)\s+(?:של\s+)?(\S+)/g;
const RECEIVES_PRESENCE = /(?<![א-ת])(?:ש)?(?:מקבל|מקבלת|מקבלים|מקבלות|קיבל|קיבלה|קיבלו)\s+נוכחות/;
const INNER_EXPERIENCE = /^(?:[ולהב]{0,2})(?:תחוש|רגש|חווי|מפגש|בדידות|געגוע|כאב|פחד|זיכרונ|זיכרון)/;
function therapyForm(text: string, hers: readonly string[]): RegExpMatchArray | null {
  const open = text.match(OPENS_TO) ?? text.match(RECEIVES_PRESENCE);
  if (open) return open;
  for (const m of text.matchAll(SPACE_OF)) {
    const w = m[1].replace(/[^א-ת]/g, '');
    const bare = w.replace(/^(?:[ולב]?ה|[ולב])/, '');
    if (!isFeelingWord(w) && !INNER_EXPERIENCE.test(w)) continue;
    // a general word of experience ("תחושות", "רגשות", "חוויה", "מפגש") names no feeling: hers only with a feeling of hers right after
    // it ("תחושות של בדידות"); "מקום לתחושות נוספות שאולי עוד לא נחקרו" (R14) names none
    if (GENERAL_EXPERIENCE.test(w)) {
      const after = words(text.slice((m.index ?? 0) + m[0].length)).slice(0, 4);
      if (!after.some((x) => isFeelingWord(x) && inWords(x, hers))) return m;
    } else if (!inWords(w, hers) && !inWords(bare, hers)) return m;
  }
  return null;
}
const GENERAL_EXPERIENCE = /^(?:[ולהב]{0,2})(?:תחושה|תחושות|תחושת|רגש|רגשות|חוויה|חוויות|חווית|מפגש)$/;

const THERAPY = /(לעבד|לעבוד על|עיבוד|מעבדת|מעבד את|תהליך פנימי|עבודה פנימית|עבודה רגשית|להשלים עם|השלמה עם|לשחרר את|שחרור רגשי|ריפוי|להירפא|להחלים|מנגנון הגנה|מנגנון התמודדות|process(?:ing)? (?:feelings|emotions)|heal|healing|come to terms|inner work|coping mechanism|defen[cs]e mechanism)/i;
/** The part of the sentence before and after a position. */
const sentenceAt = (text: string, index: number) => {
  const from = Math.max(text.lastIndexOf('.', index - 1), text.lastIndexOf('?', index - 1), text.lastIndexOf('!', index - 1)) + 1;
  const ends = ['.', '?', '!'].map((p) => text.indexOf(p, index)).filter((i) => i >= 0);
  return { before: text.slice(from, index), after: text.slice(index, ends.length ? Math.min(...ends) : text.length) };
};
/** The hedge that opens a possibility is not part of what it says ("ייתכן ש…", "אולי"). */
const HEDGE_WORDS = ['אולי', 'ייתכן', 'יתכן', 'אפשר', 'לראות', 'perhaps', 'maybe', 'possibly', 'might'].map(norm);
/**
 * A cause is hers when at least half of its content words are from her answers (a dream event is not a cause she gave) and at most
 * one word is in neither her answers nor the moment (her words said a little otherwise: "לתפוס" for her "לה抓").
 */
const mostlyHers = (clause: string, hers: readonly string[], moment: readonly string[]) => {
  const ws = contentWords(withoutQuotes(clause)).filter((w) => !isMeta(w, ATTRIBUTION) && !HEDGE_WORDS.includes(norm(w).replace(/^ו/, '')));
  if (ws.length === 0) return true;
  const fromHer = ws.filter((w) => inWords(w, hers)).length;
  const outside = ws.filter((w) => !inWords(w, hers) && !inWords(w, moment)).length;
  return fromHer / ws.length >= 0.5 && outside <= 1;
};
/** A wish the dream itself states ("ולא הצלחתי לבכות למרות שרציתי") may be named only for the same thing (wanting to cry). */
const WANT_FORM = /^(?:[ושכ]{0,2})(רוצה|רוצימ|רציתי|רצית|רצתה|רצה|רצו|ארצה)$/;
const DESIRE_WORD = /^(?:[ושכלבה]{0,2})(רצונ|רצונכ|רצונות|צורכ|צרכימ|כמיהה|משאלה|השתוקקות|רצית|רוצה|תרצי)$/;
function dreamWish(sentence: string, s: Sources): boolean {
  const own = contentWords(withoutQuotes(sentence));
  return s.allowed.some((id) => {
    const seg = s.segments[id];
    if (!seg || !words(seg.text).some((w) => WANT_FORM.test(norm(w)))) return false;
    const about = contentWords(seg.text).filter((w) => !WANT_FORM.test(norm(w)));
    return own.some((w) => !DESIRE_WORD.test(norm(w)) && inWords(w, about));
  });
}
/** Her own phrase, given back: the matched words appear in what she said. */
const herPhrase = (m: RegExpMatchArray | null, answers: readonly string[]) => !!m && answers.some((a) => flat(a).includes(flat(m[0])));
/** Words that give someone an intention, a wish or an inner stance. */
const INTENT = /(^|[\s,])(?:[ושכ]{0,2})(רוצה|רצה|רצתה|רצו|מתכוון|מתכוונת|התכוון|התכוונה|כוונה|כוונתו|כוונתה|מנסה להראות|ניסה להראות|ניסתה להראות|מבקש|מבקשת|ביקש|ביקשה|אמון|סומך|סומכת|דואג|דואגת|אכפת|מאמין|מאמינה|wants?|wanted|intends?|intended|meant to|trusts?|cares?)(?=[\s,.?!]|$)/i;
/** Someone else in the sentence: a pronoun or a person word ("אחיך", "אבא שלך", "השכנה"). */
const FIGURE = /(^|[\s,])(?:[ושכלב]{0,2})(הוא|היא|הם|הן|שלו|שלה|ממנו|ממנה|אחיך|אחותך|אבא|אמא|סבתא|סבא|השכנה|השכן|חברה|חבר|מישהו|מישהי|הילד|הילדה|he|she|they|his|her)(?=[\s,.?!]|$)/i;
/** Words that put events in a sequence or a chain without a time word ("רצף", "מוביל", "מתחילה כבר"). */
const SEQUENCE = /(רצף|מוביל|מובילה|מובילים|הוביל|הובילה|בעקבות|בהמשך|מתחיל(?:ה|ים|ות)? כבר|הולכ(?:ת|ים|ות)? ומת|מתפתח|התפתחות|leads? to|then|a sequence|gradually)/i;
/** "ש" glued to a word that cannot open a clause on its own ("התחושה שלך שלבד"). */
const BROKEN = /(^|\s)ש(לבד|ביחד|מאוד|תמיד|עכשיו|פתאום)(?=[\s,.?!]|$)/;
const WHOLE_PICTURE = /(התמונה השלמה|תמונה שלמה|המבט השלם|החלום כולו|כל החלום|the whole picture|the whole dream|the full picture)/i;
export const MAX_INTERPRETATION_WORDS = 45;

/** A concept word, with up to two prefixes and a plural or feminine ending off ("בפרידה", "והפספוס", "נסיגות"). */
function innerConcept(word: string): boolean {
  let w = norm(word);
  const forms = [w];
  for (let i = 0; i < 2 && w.length > 3 && /^[ובלמשהכ]/.test(w); i++) forms.push((w = w.slice(1)));
  return forms.some((f) => INNER_CONCEPTS.includes(f) || INNER_CONCEPTS.includes(f.replace(/(ות|ימ|ה)$/, '')) || INNER_CONCEPTS.includes(`${f.replace(/(ות|ימ)$/, '')}ה`));
}

/** Where a sentence speaks of her inside, what it says must be her words (see INNER_LOCUS above). */
function claimsAboutHer(text: string, s: Sources): string[] {
  const reasons: string[] = [];
  const answers = s.answers.filter((a) => !isUnsureAnswer(a)).flatMap(words);
  const hers = [...answers, ...segWords(s, s.allowed)];
  const content = (ws: readonly string[]) => contentWords(ws.join(' ')).filter((w) => !HEDGE_WORDS.includes(norm(w)) && !isMeta(w, DREAM_META) && !isMeta(w, ATTRIBUTION));
  const off = (ws: readonly string[]) => ws.filter((w) => !inWords(w, hers));
  const tooFar = (window: readonly string[]) => off(window).length > (window.length >= 3 ? 1 : 0);
  for (const sentence of withoutQuotes(text).split(/(?<=[.!?])\s+/u)) {
    const sw = words(sentence);
    const at = sw.findIndex((w) => ATTRIBUTION_VERB.test(norm(w)));
    if (at >= 0) {
      const said = content(sw.slice(at + 1));
      if (off(said).length > 1) reasons.push(`says she said what she did not ("${off(said).slice(0, 3).join('", "')}")`);
    }
    // a feeling with its content ("הרגיש לך כמו…", "התחושה ש…"): the content is what she felt, so it must be her own words, not ours
    // and not the dream's facts turned into a feeling (doc 76, item ג)
    for (const m of sentence.matchAll(/(?:(?:ש|ו)?(?:הרגיש|הרגישה|הרגישו|מרגיש|מרגישה|מרגישים)\s+(?:לך|לכם)\s+כמו|(?:ה)?(?:תחושה|חוויה)\s+ש(?!ל(?:ך|כם)(?![א-ת])))\s*([^,.;!?—–]+)/g)) {
      const felt = content(words(m[1]));
      const notHers = felt.filter((x) => !inWords(x, answers));
      if (felt.length && notHers.length / felt.length > 0.5) reasons.push(`says something about her inner world she did not say ("${notHers.slice(0, 3).join('", "')}")`);
    }
    for (const clause of sentence.split(/[,;:—–]/)) {
      const ws = words(clause);
      ws.forEach((w, i) => {
        // the patterns are written with final letters ("אצלך", "רצון"): test the word as written, never its norm() (doc 56, problem 1)
        const raw = w.replace(/[^א-תa-zA-Z']/g, '');
        const next = (k: number) => (ws[i + k] ?? '').replace(/[^א-תa-zA-Z']/g, '');
        const inGivenBack = at >= 0 && sw.indexOf(w) > at; // "אמרת ש…": her words given back, checked above
        let window: string[] | null = null;
        /** The word that carries the claim itself: it must be hers, not the one free word of the window (doc 56, problem 2). */
        let core: string | null = null;
        if (INNER_LOCUS.test(raw)) {
          window = content(ws);
          const before = ws[i - 1];
          if (before && content([before]).length) core = before; // "מבליט אצלך", "מעורר בך"
        } else if ((MENTAL_PAST_YOU.test(raw) || (MENTAL_PRESENT.test(raw) && YOU_PRONOUN.test((ws[i - 1] ?? '').replace(/[^א-ת]/g, '')))) && !inGivenBack) {
          window = [w, ...content(ws.slice(i + 1)).slice(0, 3)];
          core = w;
        } else if (EMOTIVE_YOU.test(raw) && /^(אותך|אתכם)$/.test(next(1)) && !inGivenBack) {
          window = [w, ...content(ws.slice(i + 2)).slice(0, 3)];
          core = w;
        } else if (/^(אותך|אתכם)$/.test(next(1)) && content([w]).length > 0 && !inGivenBack) {
          // any other verb acting on her ("שתי החוויות מציבות אותך מול…", "הזמינה אותך"): only as the dream or her words tell it
          // ("החברה הזמינה אותך" for the dream's "הזמינה אותי"), never something of the dream doing a thing to her inner world (doc 76, ד)
          if (!inWords(w, [...hers, ...words(s.sourceText)])) reasons.push(`says something about her inner world she did not say ("${raw}")`);
          return;
        } else if (EVALUATIVE.test(raw) && /^(לך|לכם)$/.test(next(1))) {
          // "חשובה לך": the evaluation itself is the claim, so it must be her word, as a verb of feeling must (doc 65, issue 4)
          window = [w, ...content(ws.slice(i + 2)).slice(0, 3)];
          core = w;
        }
        else if (INNER_NOUN.test(raw) && next(1) === 'שלך') {
          window = content(ws.slice(i + 2)).slice(0, 4);
          if (!/^(?:ו)?ה?(תחושה|רגש)$/.test(raw)) core = w; // "הרצון שלך", "הפחד שלך": the noun itself is the claim
        } else if (INNER_NOUN_YOURS.test(raw)) {
          window = content(ws.slice(i + 1)).slice(0, 4);
          if (!/^(?:[ובלמה]{0,2})(תחושת|רגש)ך$/.test(raw)) core = w; // "מקומך", "רצונך": the noun itself is the claim
        }
        // (not every "X שלך": "מה שבידיים שלך" is her hands, not her inner world; only the class above is a claim, doc 70)
        if (!window) return;
        // an emotive verb ("שמרגשים אותך") is hers only if she used such a verb herself: "הרגשתי" (felt) is not "מרגש" (moves)
        const emotive = core !== null && EMOTIVE_YOU.test(core.replace(/[^א-ת]/g, ''));
        const coreOff = core !== null && (emotive ? !hers.some((h) => EMOTIVE_YOU.test(h.replace(/[^א-ת]/g, '')) && sameWord(h, core)) : !inWords(core, hers));
        if (coreOff || (window.length && tooFar(window))) reasons.push(`says something about her inner world she did not say ("${[...(coreOff ? [core as string] : []), ...off(window)].filter((x, k, a) => a.indexOf(x) === k).slice(0, 3).join('", "')}")`);
      });
    }
  }
  return [...new Set(reasons)];
}

export function verifyInterpretation(
  text: string,
  basis: readonly string[],
  verified: ReadonlySet<string>,
  s: Sources,
  opts: { exploredCount?: number; requireBasis?: boolean; orderKnown?: boolean; everyHedged?: boolean } = {},
): string[] {
  const reasons: string[] = [];
  if (!text.trim()) return ['empty'];
  text = nonTemporal(text); // "חיפוש אחרי…", "עד הסוף": no time is said (doc 70)
  if (opts.requireBasis !== false && !basis.some((b) => verified.has(b))) reasons.push('rests on no sentence that passed the checks');
  // a candidate with a source card is checked sentence by sentence instead (interpretationCheck: an offer hedged, a fact founded)
  if (opts.everyHedged !== false && !everySentenceTentative(text)) reasons.push('a sentence states as fact what can only be a possibility (every sentence must be hedged)');
  if (firstPersonOutsideQuotes(text).length) reasons.push('first person in a sentence addressed to the dreamer');
  const own = [...answerWords(s), ...segWords(s, s.allowed)];
  // "חוסר X" is her own "לא X" ("חוסר ההבנה" for "לא הבנתי"): the lack is what she said, not a feeling we gave her (doc 76, item ז)
  const herNegated = s.answers.filter((a) => !isUnsureAnswer(a)).flatMap((a) => words(a).flatMap((x, k, ws) => (isNegation(x) && ws[k + 1] ? [ws[k + 1]] : [])));
  const lackOfHers = [...text.matchAll(/(?<![א-ת])(?:ו|ה|ב|ל|ש)?חוסר\s+(\S+)/g)].some((m) => inWords(m[1].replace(/[^א-ת]/g, ''), herNegated));
  for (const w of contentWords(withoutQuotes(text))) {
    if (isFeelingWord(w) && !inWords(w, own) && !(lackOfHers && /^(?:ו|ה|ב|ל|ש)?חוסר$/.test(norm(w)))) reasons.push(`gives her a feeling she did not name ("${w}")`);
    if (isTimeWord(w) && !inWords(w, own)) reasons.push(`a time word neither the dream nor she used ("${w}")`);
  }
  if (DIAGNOSTIC.test(text) || feelingsTextLooksDiagnostic(text)) reasons.push('reads like a diagnosis');
  const usable = s.answers.filter((a) => !isUnsureAnswer(a));
  const hers = usable.flatMap(words);
  if (POINTS_TO.test(text) && !herPhrase(text.match(POINTS_TO), usable)) reasons.push('reads an image as a sign of something ("מצביע על", "מעיד על")');
  for (const m of text.matchAll(new RegExp(HINTS_AT, 'gi'))) {
    if (herPhrase(m, usable)) continue;
    // what it hints at must be hers; a wish she said ("הייתי רוצה") makes "הרצון" hers
    const hersWithWish = SHE_WANTED.test(usable.join(' ')) ? [...hers, 'רצון', 'הרצון', 'רצונך', 'wish'] : hers;
    const { after } = sentenceAt(text, (m.index ?? 0) + m[0].length);
    if (!mostlyHers(after, hersWithWish, [])) reasons.push(`hints at something she did not say ("${m[0].trim()}")`);
  }
  if ((FIXED_MEANING.test(text) && !herPhrase(text.match(FIXED_MEANING), usable)) || (FIXED_ROOT.test(text) && !herPhrase(text.match(FIXED_ROOT), usable))) reasons.push('gives an image a fixed meaning');
  // a cause is hers only when she herself gave one (a causal word in her answers), and in her words
  const herCause = HER_CAUSE.test(usable.join(' '));
  for (const m of text.matchAll(CAUSE_AFTER)) {
    const { after } = sentenceAt(text, (m.index ?? 0) + m[0].length);
    if (!herCause || !mostlyHers(after, hers, segWords(s, s.allowed))) reasons.push(`explains with a cause she did not give ("${m[2]}")`);
  }
  for (const m of text.matchAll(CAUSE_BEFORE)) {
    const { before } = sentenceAt(text, m.index ?? 0);
    if (!herCause || !mostlyHers(before, hers, segWords(s, s.allowed))) reasons.push(`says something caused what she did or felt, which she did not say ("${m[0].trim()}")`);
  }
  // "אפשר לראות את X כ‹Y›": Y makes the image into something; it must be hers or the dream's, not a meaning of ours (doc 56, problem 5)
  // any form of "to see" ("ראית ב…", "רואה את…") and the markers "ביטוי ל…" / "סימן ל…" say the same (doc 65, issue 4); a word that only
  // starts with כ and is the dream's or hers ("ראית כלב כחול") is not "as"
  for (const m of text.matchAll(/(?:(?:אפשר|ניתן)\s+לראות|(?<![א-ת])(?:ש)?(?:ראית|רואה|רואים|תראי|תראה))\s+(?:את\s+)?[^.?!]*?\s((?:ו)?כ(?!מו(?![א-ת])|אילו|ש)|ביטוי\s+ל|סימן\s+ל)([א-ת][^.?!]*)/g)) {
    const marker = `${m[1]}${m[2]}`.split(/\s+/).find((x) => x.length > 0) ?? '';
    if (/כ/.test(m[1]) && inWords(marker, [...words(s.sourceText), ...s.answers.flatMap(words)])) continue; // a whole word of the dream or hers
    const y = contentWords(`${m[2]}`).filter((w) => !isMeta(w, DREAM_META) && !HEDGE_WORDS.includes(norm(w)));
    const offY = y.filter((w) => !inWords(w, own));
    if (y.length && offY.length / y.length > 0.5) reasons.push(`gives a psychological meaning she did not give (sees the image as "${offY.slice(0, 3).join(' ')}")`);
  }
  for (const re of [PSY_EQUATION, PSY_ABOUT, PSY_JARGON, PSY_MESSAGE]) {
    const m = text.match(re);
    if (m && !herPhrase(m, usable)) reasons.push(`gives a psychological meaning she did not give ("${m[0].trim()}")`);
  }
  for (const w of contentWords(withoutQuotes(text))) if (innerConcept(w) && !inWords(w, own)) reasons.push(`gives a psychological meaning she did not give ("${w}")`);
  reasons.push(...claimsAboutHer(text, s));
  const desire = text.match(DESIRE);
  const around = desire ? sentenceAt(text, desire.index ?? 0) : null;
  const ownWish = () => SHE_WANTED.test(usable.join(' ')) || (around !== null && dreamWish(around.before + around.after, s));
  if (desire && !ownWish()) reasons.push(`gives her a wish or a need she did not say ("${desire[2]}")`);
  // a need is its own claim: a wish she said ("הייתי רוצה") is not a need ("את צריכה")
  const need = text.match(NEED);
  if (need && !SHE_NEEDED.test(usable.join(' '))) reasons.push(`gives her a need she did not say ("${need[2]}")`);
  // (the empty frame "יש משהו ב-X ש…" is a matter of quality, not safety — her binding note 3 of phase 2 — so it is not refused here:
  // a possibility rates it 0, and the whole view does not show it; see EMPTY_FRAME)
  // seeing an image as a moment or place that "shows" something ("לראות בספל התה רגע שמדגיש את האפשרות…", C9; doc 78): a meaning given
  // to the image, even when each word is hers; unless she used that verb of showing herself
  const shows = text.match(/(?:לראות|ראית|רואה|רואים)[^.?!]*?(?<![א-ת])ש(?:מ|ה)(?:דגיש|דגישה|ראה|ציב|ציבה|בטא|בטאת|שקף|שקפת|סמן|סמנת|איר|אירה|בליט|בליטה)(?![א-ת])/);
  if (shows && !herPhrase(shows, usable)) reasons.push(`gives a psychological meaning she did not give (the image "${shows[0].split(/\s+/).pop()}" something)`);
  const therapy = text.match(THERAPY) ?? therapyForm(text, usable.flatMap(words));
  if (therapy && !herPhrase(therapy, usable)) reasons.push(`therapy language she did not use ("${therapy[0]}")`);
  const intent = text.match(INTENT);
  if (intent && FIGURE.test(text) && !inWords(intent[2].split(/\s+/)[0], own)) reasons.push(`gives someone in the dream an intention or inner stance that was not said ("${intent[2]}")`);
  if (opts.orderKnown === false && SEQUENCE.test(text)) reasons.push('puts moments in a sequence the dream does not state');
  if (BROKEN.test(text)) reasons.push('broken Hebrew ("ש" glued to a word that cannot take it)');
  if ((opts.exploredCount ?? 2) <= 1 && WHOLE_PICTURE.test(text)) reasons.push('claims the whole picture after one moment');
  if (words(text).length > MAX_INTERPRETATION_WORDS) reasons.push('too long');
  return reasons;
}

// ------------------------------------------------------------------------------------------------ questions

// the kinds of question are defined once, with the journey that stores them (doc 65, issue 1: two copies had drifted apart)
import { FOCI, type QuestionFocus } from './exploration.js';
export { FOCI, type QuestionFocus };

const QUESTION_VOCAB = [
  'עולה', 'עלה', 'עלתה', 'עולים', 'מזכיר', 'מזכירה', 'הזכיר', 'הזכירה', 'שמעת', 'שומעת', 'שומע', 'ראית', 'רואה', 'הרגשת', 'הרגיש', 'הרגישה', 'מרגיש', 'מרגישה', 'תחושה',
  'קרה', 'קורה', 'נשאר', 'נשארה', 'נשארו', 'השתנה', 'השתנתה', 'זוכר', 'זוכרת', 'סביב', 'סביבך', 'חוזרים', 'כשחוזרים', 'חושבים', 'כשחושבים', 'מתבוננים', 'פוגשת',
  'פוגש', 'היום', 'עכשיו', 'בחיים', 'בחייך', 'במרכז', 'עומד', 'עומדת', 'ראשון', 'הראשון', 'שונה', 'דומה', 'עבורך', 'בשבילך', 'הכי', 'נוכח', 'בולט', 'בלט', 'משך',
  'נראה', 'נראית', 'נראו', 'נראתה', 'עשית', 'עושה', 'עשה', 'עשתה', 'שמת', 'שמה', 'לב', 'הבנת', 'הבחנת', 'לתאר', 'תארי', 'צבע', 'קול', 'קולות', 'נשמע', 'נשמעה', 'נשמעו',
  'אנשים', 'מראה', 'פרטים', 'פרט', 'משהו', 'דבר', 'הדבר', 'שונה', 'קרה', 'עבר', 'עברה', 'נשאר', 'פוגש',
  'בלטה', 'בלטו', 'הפתיע', 'הפתיעה', 'הפתיעו', 'משכה', 'משכו', 'לבחור', 'בחרת', 'דווקא', 'בכלל', 'מעורר', 'מעוררת', 'סקרן', 'מסקרן', 'חשוב', 'חשובה', 'מוזר', 'מוזרה', 'מיוחד', 'מיוחדת', 'אותך', 'מחייך', 'מחייך',
  'תפס', 'תפסה', 'תפסו', 'תשומת', 'ליבך', 'לבך', 'מושך', 'מושכת', 'מעניין', 'מעניינת',
  'stood', 'surprised', 'surprise', 'drew', 'choose', 'chose', 'strange', 'important', 'curious',
  'come', 'comes', 'mind', 'remind', 'reminds', 'notice', 'noticed', 'see', 'saw', 'hear', 'heard', 'feel', 'felt', 'happen', 'happened', 'stay', 'stayed', 'change',
  'changed', 'remember', 'there', 'today', 'life', 'now', 'center', 'first', 'different', 'stands', 'out', 'around', 'like',
].map(norm);
const YES_NO = /^\s*(האם|האין|is|are|do|does|did|was|were|have|has|can|could|will|would)(?=[\s,?]|$)/i;
/** A real (not yes/no) question names what it asks: a question word somewhere in it ("כשאת שם, מה..." counts). */
const WH = /(^|[\s,"«])(?:[ובלמכש]{0,2})(מה|מי|איך|איפה|היכן|מתי|איזה|איזו|אילו|כמה|לאן|מאיפה|במה|על מה|עם מי|what|who|how|where|which|when)(?=[\s,?]|$)/i;
// (?=…) and not \b: \b sees no boundary after a Hebrew letter
const WHY = /^\s*(?:ו)?(למה|מדוע|why)(?=[\s,?]|$)/i;
const SENSE = /^(ראית|שמעת|הרחת|נגעת|רואה|שומעת|שומע|see|saw|hear|heard|smell|smelled)/;
const FEEL = /^(הרגשת|הרגיש|מרגיש|תחוש|התחוש|רגש|feel|felt|feeling)/;
export const MAX_QUESTION_WORDS = 16;

export function inferFocus(question: string): QuestionFocus | null {
  // the kind comes from the main clause: in "מה הפתיע אותך כשראית…" the "כש…" clause only places the moment (doc 70)
  const all = words(question);
  const cut = all.findIndex((w, i) => i > 0 && (/^(?:ו)?כש/.test(w) || /^(?:ו)?(?:ברגע|בזמן|כאשר)$/.test(w)));
  const main = cut > 0 ? all.slice(0, cut) : all;
  const ws = main.map((w) => w.replace(/^[וכש]+/, ''));
  if (ws.some((w) => FEEL.test(w)) || main.some(isFeelingWord)) return 'feeling';
  if (ws.some((w) => SENSE.test(w))) return 'sense';
  return null;
}

export interface QuestionContext {
  language: AppLanguage;
  segments: DreamSegment[];
  momentSegments: number[];
  /** Everything the dreamer already said in this journey (usable answers). */
  answers: string[];
  /** sameMoment: the question asked about THIS moment before "I don't know" (another angle on the same moment is the point). */
  prior: { question: string; focus: QuestionFocus | null; subject: string | null; sameMoment?: boolean }[];
  /** A closing question (about her dream and her life): its own words are free, but it is built from hers, may build on a feeling she
      named, and never brings in a part of the dream that was not explored. A moment question stays within its moment. */
  closing?: boolean;
  /** Parts of the dream already explored in this journey: a question may bring them in (they are no longer "another part"). */
  explored?: number[];
}

/** Order words: a question may not place the moment before or after another event ("בזמן ש", "הראשון" only situate it). */
const ORDER_WORDS = ['אחרי', 'לאחר', 'לפני', 'קודם', 'מקודם', 'בסוף', 'לבסוף', 'בהתחלה', 'בתחילה', 'ואז', 'then', 'before', 'after', 'earlier', 'later', 'finally'].map(norm);
const isOrderWord = (w: string) => isTimeWord(w) && (ORDER_WORDS.includes(norm(w)) || ORDER_WORDS.some((o) => norm(w).length <= o.length + 2 && norm(w).endsWith(o)));
/** A word used as HER action ("כשאת מחזיקה", "נגעת") in a question, when the moment does not say she did it. */
function saysSheDid(question: string, word: string): boolean {
  const ws = words(question);
  const at = ws.findIndex((x) => x === word);
  if (at < 0) return false;
  const before = ws.slice(Math.max(0, at - 2), at).map(norm);
  const pronoun = before.some((b) => /^[וכש]+את$/.test(b)); // "כשאת", "שאת": "you" as the subject
  const w = norm(word).replace(/^[וכש]+/, '');
  const pastYou = /^[וכש]/.test(norm(word)) && w.length >= 3 && w.endsWith('ת') && !w.endsWith('ות'); // "כשטיילת", "שלקחת"
  return pronoun || pastYou;
}
/** Someone from the dream, and a frame that places them in her waking life ("כלפי אמא שלך ברגעים שבהם", "איך את מתמודדת היום עם אחיך"). */
const REAL_PERSON = /(^|[\s,])(?:[ושכלבמ]{0,2})(אמא|אמך|אבא|אביך|אחיך|אחותך|דודה|דודתך|דוד|דודך|סבתא|סבא|השכנה|השכן|חברה|חברתך|חבר|חברך|המורה|mother|mom|father|dad|brother|sister|aunt|uncle|neighbou?r|friend|teacher)(?=[\s,.?!]|$)/i;
const LIFE_FRAME = /(בחיים|בחייך|במציאות|ביומיום|כלפי|מתמודדת|מתמודד|להתמודד|ברגעים שבהם|בדרך כלל|בימים אלה|in your life|in real life|day to day|usually|toward|cope)/i;
const NOW_FRAME = /(^|[\s,])(היום|עכשיו|today|now|these days)(?=[\s,.?!]|$)/i;
const REMINDS = /(מזכיר|מזכירה|מזכירים|הזכיר|הזכירה|דומה|remind)/i;
const IN_THE_DREAM = /(בחלום|החלום|הרגע הזה|ברגע הזה|לרגע הזה|in the dream|this moment)/i;
/** A place or a habit of her waking life ("בבית שלך", "בחיים שלך", "בדרך כלל", "מה את עושה כש…"), with no one from the dream named. */
const WAKING_LIFE = /(בחיים|בחייך|במציאות|ביומיום|בבית שלך|בעבודה|במשפחה שלך|בדרך כלל|ברגעים שבהם|בכל פעם ש|בימים אלה|בתקופה הזו|באילו מצבים|in your life|in real life|day to day|at home|at work|usually|whenever|these days)/i;
const HABIT = /((מה|איך)\s+(את|אתה)\s+(עושה|מגיבה|מגיב|מתמודדת|מתמודד)|כלפי|(^|\s)מתי\s+(את|אתה)\s|(^|\s)עם מי\s+(את|אתה)\s|מה עוזר לך|מה קורה לך כש|what do you do when|how do you (cope|react|deal)|when do you|what helps you)/i;
/** In a closing question, a general "when you…" in the present ("כשאת מחכה") is her life, unless it is about going back to the dream. */
const WHEN_YOU = /(^|\s)כש(את|אתה)\s+[א-ת]+/;
const BACK_TO_DREAM = /(כש(את|אתה)\s+(חושבת|חושב|חוזרת|חוזר|נזכרת|נזכר|מדמיינת|מדמיין|מתבוננת|מתבונן|מסתכלת|מסתכל|קוראת|קורא)(?=\s|$))/;
/** …asked openly, as a possibility she may or may not find ("אם בכלל", "מה זה מזכיר לך"). */
const OPEN_ASK = /(אם בכלל|אם יש|אם קורה|אם קרה|if at all|if ever|if any)/i;

/** How many words of a moment question may be in neither the dream nor her answers (plain question language). */
export const MAX_FREE_QUESTION_WORDS = 2;

export function verifyQuestion(c: { question: string; focus: string; subject: string }, ctx: QuestionContext): { reasons: string[]; focus: QuestionFocus; subject: string } {
  const reasons: string[] = [];
  const q = nonTemporal(c.question.trim()); // "החיפוש אחרי…", "עד הסוף": no time is said (doc 70)
  const focus: QuestionFocus = inferFocus(q) ?? ((FOCI as readonly string[]).includes(c.focus) ? (c.focus as QuestionFocus) : 'detail');
  const subject = c.subject.trim();
  if (!q.endsWith('?') || (q.match(/\?/g) ?? []).length !== 1) reasons.push('not one question ending with a question mark');
  if (words(q).length > MAX_QUESTION_WORDS + 2) reasons.push(`too long (at most ${MAX_QUESTION_WORDS} words)`);
  if (YES_NO.test(q) || !WH.test(q)) reasons.push('a yes/no question (no question word)');
  if (/\s(?:ו|או\s+)(?:מה|מי|איך|איפה|מתי|איזה|איזו|אילו|כמה|למה)(?=\s)/.test(` ${q}`) ||/\s(?:and|or) (?:what|who|how|where|which|when)\b/i.test(q)) reasons.push('two questions in one sentence');
  if (WHY.test(q)) reasons.push('a "why" question');
  // the person and the waking-life frame in the same clause ("…היום חיבור…, כמו שתיארת עם אחיך" keeps the brother in her own words)
  const placesInLife = (cl: string) => REAL_PERSON.test(cl) && (LIFE_FRAME.test(cl) || (NOW_FRAME.test(cl) && !IN_THE_DREAM.test(q)));
  if (!REMINDS.test(q) && q.split(/[,;]/).some(placesInLife))
    reasons.push('takes someone from the dream as her real life (ask what the dream reminds her of instead)');
  // the same with no one named: "מה את עושה כשאת מרגישה שאף אחד לא שם לב אלייך בבית שלך?" assumes it happens to her
  else if (
    !REMINDS.test(q) &&
    !OPEN_ASK.test(q) &&
    (WAKING_LIFE.test(q) || HABIT.test(q) || (NOW_FRAME.test(q) && !IN_THE_DREAM.test(q)) || (ctx.closing && WHEN_YOU.test(q) && !BACK_TO_DREAM.test(q) && !IN_THE_DREAM.test(q)))
  )
    reasons.push('assumes something from the dream happens in her real life (ask openly: what it reminds her of, or "אם בכלל")');
  if (THERAPY.test(q)) reasons.push('therapy language in a question');
  if (firstPersonOutsideQuotes(q).length) reasons.push('first person in a question to the dreamer (e.g. "אחי" instead of "אחיך")');
  const moment = ctx.momentSegments.flatMap((id) => (ctx.segments[id] ? words(ctx.segments[id].text) : []));
  const near = (x: DreamSegment) => ctx.momentSegments.some((id) => ctx.segments[id] && ctx.segments[id].group === x.group && Math.abs(id - x.id) === 1);
  const explored = ctx.explored ?? [];
  const others = ctx.segments.filter((x) => !ctx.momentSegments.includes(x.id) && !near(x) && !explored.includes(x.id)).flatMap((x) => words(x.text));
  const nearby = [
    ...ctx.segments.filter((x) => near(x) || (explored.includes(x.id) && !ctx.momentSegments.includes(x.id))).flatMap((x) => words(x.text)),
    ...antecedents(ctx.segments, ctx.momentSegments),
  ];
  const said = ctx.answers.filter((a) => !isUnsureAnswer(a)).flatMap(words);
  const free: string[] = [];
  for (const w of contentWords(withoutQuotes(q))) {
    const own = inWords(w, moment) || inWords(w, said) || inWords(w, nearby);
    if (isOrderWord(w) && !own) {
      reasons.push(`places the moment before or after another event ("${w}")`);
      continue;
    }
    if (own || isTimeWord(w) || isMeta(w, ATTRIBUTION) || isMeta(w, DREAM_META) || QUESTION_VOCAB.includes(norm(w)) || QUESTION_VOCAB.some((v) => sameWord(w, v) && norm(w).length >= 4)) continue;
    if (!ctx.closing && inWordsLong(w, others)) reasons.push(`presupposes something from another part of the dream ("${w}")`);
    else if (!ctx.closing && saysSheDid(q, w)) reasons.push(`presupposes something she did that the dream does not say ("${w}")`);
    else free.push(w);
  }
  if (!ctx.closing && free.length > MAX_FREE_QUESTION_WORDS) reasons.push(`too many words that are in neither the dream nor her answers (${free.map((w) => `"${w}"`).join(', ')})`);
  // built from her words, or from a detail of a moment she explored (doc 50, א8: "על מילה שלך או על פרט מהחלום"; doc 76, item ז)
  if (ctx.closing && said.length && !contentWords(q).some((w) => inWords(w, said) || inWords(w, moment))) reasons.push('not built from her own words');
  const last = ctx.prior[ctx.prior.length - 1];
  const describes = (f: QuestionFocus | null) => f === 'sense' || f === 'detail';
  if (!ctx.closing && last && describes(last.focus) && describes(focus)) reasons.push('a second question in a row about how it looked or sounded: ask what stood out, surprised her, or drew her to it');
  for (const p of ctx.prior) {
    if (p.sameMoment) {
      // the question she could not answer: the same moment again is the point, the same angle is not
      // the moment's own words are shared by any question about it; what is compared is the rest
      const beyond = (t: string) => contentWords(t).filter((w) => !inWords(w, moment)).join(' ');
      if (p.focus === focus || (beyond(q) !== '' && overlap(beyond(q), beyond(p.question)) >= 0.85)) reasons.push(`asks the same moment again from the same angle (${focus})`);
      continue;
    }
    if (overlap(q, p.question) >= 0.6) reasons.push('repeats a question already asked');
    const sharedNoun = contentWords(q).some((w) => !QUESTION_VOCAB.includes(norm(w)) && inWords(w, contentWords(p.question)) && inWords(w, [...moment, ...others]));
    if (p.focus === focus && ((subject && p.subject && sameWord(subject, p.subject)) || sharedNoun)) reasons.push(`asks again about the same thing in the same way (${focus})`);
  }
  if (!ctx.closing && focus === 'feeling' && words(q).some((w) => isFeelingWord(w) && inWords(w, said))) reasons.push('asks about a feeling she already named');
  return { reasons: [...new Set(reasons)], focus, subject };
}

/** The safe question when every candidate failed: built by code, about this moment, with nothing presupposed. */
export function fallbackQuestion(language: AppLanguage, alternative: boolean, used: readonly (QuestionFocus | null)[] = []): { question: string; focus: QuestionFocus } {
  const he: [QuestionFocus, string][] = [['salience', 'מה בלט לך ברגע הזה?'], ['connection', 'מה הרגע הזה מזכיר לך, אם בכלל?'], ['choice', 'מה משך אותך דווקא לרגע הזה?'], ['surprise', 'מה הפתיע אותך ברגע הזה?']];
  const en: [QuestionFocus, string][] = [['salience', 'What stood out to you in this moment?'], ['connection', 'What does this moment remind you of, if anything?'], ['choice', 'What drew you to this moment?'], ['surprise', 'What surprised you in this moment?']];
  if (alternative && !used.includes('sense')) return { question: language === 'he' ? 'מה הדבר הראשון שנראה או נשמע ברגע הזה?' : 'What is the first thing you see or hear in this moment?', focus: 'sense' };
  const list = language === 'he' ? he : en;
  const [focus, question] = list.find(([f]) => !used.includes(f)) ?? list[0];
  return { question, focus };
}

// ------------------------------------------------------------------------------------------------ labels

/** A moment label: short, no first person, only the moment's own words, not a copy of another label. Repaired or rebuilt by code. */
export function checkLabel(candidate: string, momentText: string, used: readonly string[], dreamText = ''): string {
  const inDream = (w: string) => inWords(w, words(momentText)) || inWords(w, words(dreamText));
  // a short paraphrase is a title, not a fact: one word of its own (two in a label of three or more), never a feeling, a time word
  // or a negation the moment does not have, and at least one word of the moment itself
  const paraphrase = (l: string) => contentWords(l).filter((w) => !inDream(w));
  const ok = (l: string) =>
    l.trim().length > 0 &&
    words(l).length <= 5 &&
    !words(l).some(isFirstPersonWord) &&
    paraphrase(l).length <= (contentWords(l).length >= 3 ? 2 : contentWords(l).length >= 2 ? 1 : 0) &&
    !paraphrase(l).some((w) => isFeelingWord(w) || isTimeWord(w)) &&
    !(words(l).some(isNegation) && !words(momentText).some(isNegation)) &&
    contentWords(l).some((w) => inWords(w, words(momentText))) &&
    !used.some((u) => norm(u.trim()) === norm(l.trim()));
  const c = candidate.trim();
  if (ok(c)) return c;
  const hasFirstPersonVerb = words(c).some((w) => isFirstPersonWord(w) && neutralizeFirstPerson(w) === '');
  const repaired = hasFirstPersonVerb ? '' : neutralizeFirstPerson(c).trim();
  if (repaired && ok(repaired) && contentWords(repaired).length > 0) return repaired;
  // rebuilt from the moment's own words: first-person words dropped, "my" made neutral, a leading time or function word dropped
  const ws = neutralizeFirstPerson(momentText.replace(/[,;.…]/g, ' ')).split(/\s+/).filter(Boolean);
  const keeps = (w: string) => contentWords(w).length > 0 || /^(מישהו|מישהי|כולם|כולן|someone|everyone)$/.test(w);
  while (ws.length && (isTimeWord(ws[0]) || !keeps(ws[0]))) ws.shift();
  const runs: string[][] = [[]];
  for (const w of ws) {
    if (!keeps(w) && runs[runs.length - 1].length === 0) continue;
    runs[runs.length - 1].push(w);
  }
  let built = (runs.find((r) => r.length >= 2) ?? runs[0] ?? []).slice(0, 4);
  while (built.length > 1 && (contentWords(built[built.length - 1]).length === 0 || isTimeWord(built[built.length - 1]) || isNegation(built[built.length - 1]))) built = built.slice(0, -1);
  const out = built.join(' ');
  if (out && ok(out)) return out;
  return quotedLabel(momentText, used);
}

function quotedLabel(momentText: string, used: readonly string[]): string {
  for (let n = 3; n <= 6; n++) {
    const l = `«${momentText.split(/\s+/).slice(0, n).join(' ')}${momentText.split(/\s+/).length > n ? '…' : ''}»`;
    if (!used.includes(l)) return l;
  }
  return `«${momentText}»`;
}

// ------------------------------------------------------------------------------------------------ assembling a reply

export interface ReplyRaw {
  dream: DreamClaim[];
  user: UserClaim[];
  possibilities: Possibility[];
  /** A question for when no possibility is worth showing (doc 50 v2, א5). */
  invitation?: string;
}
export interface AssembledInsight {
  observation: string;
  reflection: string;
  possibility: string;
  kind: 'interpretive' | 'factual';
  /** When no possibility was worth showing: one question that opens a new direction instead (shown as the follow-up question). */
  invitation?: string;
}
export interface ClaimReport {
  dream: { status: Status; reasons: string[] }[];
  user: { status: Status; reasons: string[] }[];
  /** Per candidate: why it may not be shown (safety). Empty = it may. */
  possibilities: string[][];
  /** Per candidate: how good it is (level 0–3, score, notes), apart from safety (doc 50 v2, her note 3). */
  quality?: CandidateVerdict['quality'][];
  /** The candidate shown, or -1; and the inviting question shown instead, when one was. */
  chosen?: number;
  invitation?: { question: string; shown: boolean; reasons: string[] } | null;
  /** Each candidate's source card as the model wrote it (null for an older reply). */
  cards?: (SourceCard | null)[];
  /** The sentences as the model wrote them, in the same order (so a report can show what was refused). */
  texts: { dream: string[]; user: string[]; possibilities: string[] };
}

const excerptOf = (text: string, max = 24) => {
  const ws = text.trim().split(/\s+/);
  return ws.length <= max ? text.trim() : `${ws.slice(0, max).join(' ')}…`;
};

/** What of a reply may be shown: verified sentences, exact quotes in place of the rest, and a possibility only if one passed. */
/** earlier: insights already shown for other moments (a possibility that mostly repeats one is not shown). */
export function assembleReply(raw: ReplyRaw, s: Sources, earlier: readonly string[] = []): { insight: AssembledInsight; report: ClaimReport } {
  const verified = new Set<string>();
  const dream = raw.dream.slice(0, 4).map((c) => verifyDreamClaim(c, s));
  const checkedSegs = new Set<number>();
  const quoteSegs = new Set<number>();
  const obs: string[] = [];
  raw.dream.slice(0, 4).forEach((c, i) => {
    if (dream[i].status === 'checked') {
      obs.push(c.text.trim());
      checkedSegs.add(c.segment);
      verified.add(`d${i}`);
    } else if (dream[i].status === 'quote') {
      quoteSegs.add(c.segment);
      verified.add(`d${i}`);
    }
  });
  const pieces: string[] = [];
  raw.dream.slice(0, 4).forEach((c, i) => {
    if (dream[i].status !== 'quote' || checkedSegs.has(c.segment)) return;
    const piece = quoteWindow(s.sourceText, s.segments[c.segment], c.text);
    if (piece && !pieces.some((p) => p.includes(piece) || piece.includes(p))) pieces.push(piece);
  });
  if (obs.length === 0 && pieces.length === 0)
    for (const id of s.allowed) {
      const piece = s.segments[id] ? quoteWindow(s.sourceText, s.segments[id], '') : '';
      if (piece && pieces.length < 2) pieces.push(piece);
    }
  if (pieces.length) obs.push(pieces.map((p) => quoted(s.language, p)).join(' '));

  const user = raw.user.slice(0, 4).map((c) => verifyUserClaim(c, s));
  const refl: string[] = [];
  const said = s.language === 'he' ? 'אמרת:' : 'You said:';
  raw.user.slice(0, 4).forEach((c, i) => {
    if (user[i].status === 'checked') refl.push(c.text.trim());
    else if (user[i].status === 'quote') refl.push(s.language === 'he' ? reflectBack(c.quote, s.address ?? 'neutral') : `${said} ${quoted(s.language, c.quote)}`);
    if (user[i].status !== 'drop') verified.add(`u${i}`);
  });
  const usable = s.answers.filter((a) => !isUnsureAnswer(a));
  // her whole answer when nothing else was given back (a cut excerpt stays a quote: it is not a whole sentence of hers)
  if (refl.length === 0 && usable.length)
    refl.push(s.language === 'he' && excerptOf(usable[0]) === usable[0].trim() ? reflectBack(usable[0], s.address ?? 'neutral') : `${said} ${quoted(s.language, excerptOf(usable[0]))}`);

  // the best safe candidate by quality, not the first that passes; none when the best is only an echo (doc 50 v2, א4)
  const pick = selectPossibility(
    raw.possibilities.slice(0, 3).map((p) => ({ text: p.text, card: p.card ? restoreAnchors(p.card, s) : null, basis: p.basis })),
    s,
    { exploredCount: 1, verified, earlier, exchanges: s.exchanges ?? [] },
  );
  const possibilities = pick.verdicts.map((v) => v.safety.reasons);
  const chosen = pick.index ?? -1;
  const invitation = chosen < 0 && raw.invitation?.trim() ? checkInvitation(raw.invitation.trim(), s) : null;
  return {
    insight: {
      observation: obs.join(' '),
      reflection: refl.join(' '),
      possibility: chosen >= 0 ? raw.possibilities[chosen].text.trim() : '',
      kind: chosen >= 0 ? 'interpretive' : 'factual',
      ...(invitation?.shown ? { invitation: invitation.question } : {}),
    },
    report: {
      dream: dream.map(({ status, reasons }) => ({ status, reasons })),
      user: user.map(({ status, reasons }) => ({ status, reasons })),
      possibilities,
      quality: pick.verdicts.map((v) => v.quality),
      chosen,
      invitation,
      cards: raw.possibilities.slice(0, 3).map((p) => (p.card ? restoreAnchors(p.card, s) : null)),
      texts: { dream: raw.dream.slice(0, 4).map((c) => c.text), user: raw.user.slice(0, 4).map((c) => c.text), possibilities: raw.possibilities.slice(0, 3).map((p) => p.text) },
    },
  };
}

/**
 * The question shown instead of a possibility (doc 50 v2, א5): it passes every check of a moment question, it is not below the quality
 * floor, and it opens a new direction: it names a detail of the dream (this moment or one explored) that her answers did not.
 */
function checkInvitation(question: string, s: Sources): { question: string; shown: boolean; reasons: string[] } {
  const momentSegments = s.momentSegments ?? s.allowed;
  const prior = (s.priorQuestions ?? []).map((q) => ({ question: q, focus: null, subject: null }));
  const reasons = [...verifyQuestion({ question, focus: '', subject: '' }, { language: s.language, segments: s.segments, momentSegments, answers: s.answers, prior, explored: s.explored ?? [] }).reasons];
  const momentText = momentSegments.map((id) => s.segments[id]?.text ?? '').join(' ');
  const q = questionQuality(question, { momentText, prior: s.priorQuestions ?? [] });
  if (q.score < QUESTION_FLOOR) reasons.push(...q.notes);
  const dreamWords = [...momentSegments, ...(s.explored ?? [])].flatMap((id) => (s.segments[id] ? contentWords(s.segments[id].text) : []));
  const said = s.answers.filter((a) => !isUnsureAnswer(a)).flatMap(words);
  if (!contentWords(question).some((w) => inWords(w, dreamWords) && !inWords(w, said))) reasons.push('opens no new direction: names no detail of the dream that her answers did not');
  return { question, shown: reasons.length === 0, reasons };
}

/** Her words turned to "you", spelled the same for every address. */
const BACK_WORDS: Record<string, string> = {
  לי: 'לך', שלי: 'שלך', אותי: 'אותך', עבורי: 'עבורך', בשבילי: 'בשבילך', ממני: 'ממך', בי: 'בך', איתי: 'איתך', אצלי: 'אצלך', מולי: 'מולך',
  אחי: 'אחיך', אחותי: 'אחותך', אמי: 'אמך', אבי: 'אביך', חברתי: 'חברתך',
  // "my …" words that end like a verb ("לדעתי" is "in my opinion", never "לדעת", to know)
  לדעתי: 'לדעתך', לטעמי: 'לטעמך', לצערי: 'לצערך', לשמחתי: 'לשמחתך', לעצמי: 'לעצמך', בעצמי: 'בעצמך', כמוני: 'כמוך',
};
/** …and the ones whose "you" is spelled by gender (עלייך / עליך). */
const BACK_WORDS_GENDERED: Record<string, [string, string]> = { עליי: ['עלייך', 'עליך'], עלי: ['עלייך', 'עליך'], אליי: ['אלייך', 'אליך'], אלי: ['אלייך', 'אליך'], לפניי: ['לפנייך', 'לפניך'], אחריי: ['אחרייך', 'אחריך'], בעיניי: ['בעינייך', 'בעיניך'] };
/** After "אני", the verb must be a present tense of the address's gender: "אני אלך" (future) is never turned into "את אלך". */
const presentAfterI = (next: string | undefined, address: AddressPreference) =>
  !!next && (address === 'feminine' ? /^[א-ת]{2,}[הת]$/.test(next) && !/^א[א-ת]{1,3}$/.test(next) : address === 'masculine' ? /^מ[א-ת]{2,}$/.test(next) : false);
const CLOSE = /[.,!?;:…"«»'׳]+$/;
const HEBREW_LETTER = /[א-ת]/;
const CLAUSE_START = /^(זה|זאת|זו|הוא|היא|הם|הן|יש|אין|היה|הייתה|היו|הכול|הכל|כולם|מישהו|משהו|אמא|אבא|אחי|אחותי)$/;
/**
 * Her own first-person sentence given back in the second person ("הרגשתי אכזבה וכעס" → "הרגשת אכזבה וכעס"), or null when it cannot be
 * done without guessing: a present-tense "I" for a neutral address, or a first-person word left over. Hebrew only.
 */
export function giveBack(quote: string, address: AddressPreference): string | null {
  const body = quote.trim().replace(CLOSE, '');
  // one sentence only, opening as a clause can after "אמרת ש": "I did", "I", "it / there was", a person, or a definite noun
  if (/[.!?…]/.test(body)) return null;
  const ws = body.split(/\s+/).filter(Boolean);
  if (ws.length === 0 || !ws.some((w) => HEBREW_LETTER.test(w))) return null;
  const first = ws[0];
  // a definite noun opens a clause only with a verb or a linking word after it ("הדבר הראשון שנשמע זה…"); "התחושה של חום" is a phrase
  const definiteClause = /^ה[א-ת]{2,}$/.test(first) && !/^(הכי|הרי|הנה)$/.test(first) && ws.slice(1).some((w) => CLAUSE_START.test(w.replace(CLOSE, '')) || isFirstPersonVerb(w));
  if (!(isFirstPersonVerb(first) || first === 'אני' || CLAUSE_START.test(first) || definiteClause)) return null;
  const out: string[] = [];
  for (const [i, raw] of ws.entries()) {
    if (raw.replace(CLOSE, '') === 'אני') {
      const after = ws.slice(i + 1).map((x) => x.replace(CLOSE, '')).find((x) => !isNegation(x));
      if (!presentAfterI(after, address)) return null;
    }
    const tail = raw.match(CLOSE)?.[0] ?? '';
    const w = raw.slice(0, raw.length - tail.length);
    const whole = BACK_WORDS[w] !== undefined || BACK_WORDS_GENDERED[w] !== undefined || w === 'אני';
    const pre = whole ? '' : (w.match(/^[ושכ]/)?.[0] ?? '');
    const stem = w.slice(pre.length);
    let next: string | null;
    if (BACK_WORDS[stem] !== undefined) next = BACK_WORDS[stem];
    else if (BACK_WORDS_GENDERED[stem] !== undefined) next = address === 'neutral' ? null : BACK_WORDS_GENDERED[stem][address === 'feminine' ? 0 : 1];
    else if (stem === 'אני') next = address === 'feminine' ? 'את' : address === 'masculine' ? 'אתה' : null;
    else if (isFirstPersonVerb(w) && w.endsWith('תי')) next = stem.slice(0, -1);
    else if (isFirstPersonWord(w)) next = null;
    else next = stem;
    if (next === null) return null;
    out.push(pre + next + tail);
  }
  const back = out.join(' ');
  return words(back).some(isFirstPersonWord) ? null : back;
}

/**
 * Her answer given back, sentence by sentence: each sentence that can be turned to "you" without guessing is said as hers ("אמרת ש…",
 * "ואמרת ש…"), every other one stays her exact words in quotes. Nothing is added but "אמרת ש" (and "זה" before an answer that opens
 * with "כי", because…); nothing is dropped. When no sentence can be turned, the answer stays one quote, as before. Hebrew only.
 */
export function reflectBack(quote: string, address: AddressPreference): string {
  const sentences = quote.trim().split(/(?<=[.!?…])\s+/).map((x) => x.trim()).filter(Boolean);
  const pieces = sentences.map((sentence) => {
    const body = sentence.replace(CLOSE, '');
    let back = giveBack(body, address);
    if (!back && /^כי\s/.test(body)) {
      const rest = giveBack(body.replace(/^כי\s+/, ''), address);
      if (rest) back = `זה כי ${rest}`;
    }
    if (!back && /^ש[א-ת]/.test(body)) back = giveBack(body.slice(1), address); // "שהן פשוט שם": "אמרת שהן…"
    return { sentence, back };
  });
  if (!pieces.some((p) => p.back)) return `אמרת: ${quoted('he', quote.trim())}`;
  return pieces.map((p, i) => `${i === 0 ? 'אמרת' : 'ואמרת'}${p.back ? ` ש${p.back}.` : `: ${quoted('he', p.sentence)}`}`).join(' ');
}

/** The words of a part that a refused sentence was about, verbatim, at most `max` words (the whole part when it is short). */
export function quoteWindow(sourceText: string, seg: DreamSegment | undefined, about: string, max = 12): string {
  if (!seg) return '';
  const spans = [...sourceText.slice(seg.start, seg.end).matchAll(/[\p{L}\p{N}'’׳]+/gu)].map((m) => ({ w: m[0], start: seg.start + (m.index ?? 0), end: seg.start + (m.index ?? 0) + m[0].length }));
  if (spans.length <= max) return seg.text;
  const wanted = contentWords(withoutQuotes(about));
  let best = { from: 0, score: -1 };
  for (let from = 0; from + max <= spans.length; from++) {
    const score = spans.slice(from, from + max).filter((x) => inWords(x.w, wanted)).length;
    if (score > best.score) best = { from, score };
  }
  const first = spans[best.from];
  const last = spans[best.from + max - 1];
  return `${best.from > 0 ? '…' : ''}${sourceText.slice(first.start, last.end)}${best.from + max < spans.length ? '…' : ''}`;
}

/** The look a moment gets when the answer was "I don't know": the dream's own words for it, nothing interpreted. */
export function unsureLook(language: AppLanguage, sourceText: string, segments: readonly DreamSegment[], momentSegments: readonly number[]): AssembledInsight & { kind: 'factual' } {
  return { observation: quoted(language, textOfSegments(sourceText, segments, momentSegments.length ? momentSegments : segments.map((x) => x.id))), reflection: '', possibility: '', kind: 'factual' };
}

// ------------------------------------------------------------------------------------------------ assembling a whole view

export interface WholeRaw {
  overview: { source: string; segment: number; action: string; actor: string; target: string; moment: string; quote: string; basis: string[]; text: string }[];
  connections: { from: string; to: string; title: string; fromQuote: string; toQuote: string; link: string }[];
  recurring: { element: string; text: string; quotes: { moment: string; quote: string }[] };
  contrast: { text: string; quotes: { moment: string; quote: string }[] };
  readings: { segment: number; text: string }[];
  closing: { text: string; moment: string; quote: string };
}

export interface ExploredForWhole {
  id: string;
  label: string;
  segments: number[];
  /** Her answer and clarification; "I don't know" stays here but is never used as a source. */
  answers: string[];
  question: string;
  insight: { observation: string; reflection: string; possibility: string } | null;
}

export type WholeKind = 'whole' | 'first-look' | 'no-link' | 'factual-summary';
export interface AssembledWhole {
  kind: WholeKind;
  notice: string | null;
  overview: string;
  connections: { from: string; to: string; title: string; basis: string; fromQuote?: string; toQuote?: string }[];
  recurring: string | null;
  contrast: string | null;
  readings: { basis: string; reading: string }[];
  closingQuestion: string;
  invite: string[];
}
export interface WholeReport {
  overview: { source: string; ok: boolean; reasons: string[] }[];
  connections: string[][];
  recurring: string[];
  contrast: string[];
  readings: string[][];
  closing: string[];
  texts: { overview: string[]; connections: string[]; recurring: string; contrast: string; readings: string[]; closing: string };
}

const CONTRAST_WORDS = ['ואילו', 'לעומת', 'בעוד', 'מול', 'אבל', 'whereas', 'while', 'but', 'unlike'].map(norm);

export interface WholeSources {
  language: AppLanguage;
  sourceText: string;
  segments: DreamSegment[];
  explored: ExploredForWhole[];
  unexplored: { id: string; text: string }[];
  previous: { overview: string; closingQuestion: string } | null;
  maxReadings: number;
}

export function wholeNotice(language: AppLanguage, kind: WholeKind): string | null {
  if (kind === 'factual-summary')
    return language === 'he'
      ? 'זה עדיין לא המבט השלם: כאן רק מה שכתוב בחלום ומה שנאמר ברגעים שנחקרו. אפשר לנסות שוב.'
      : 'This is not the whole view yet: only what the dream says and what was said in the moments explored. You can try again.';
  if (kind === 'no-link')
    return language === 'he'
      ? 'עוד לא נמצא קשר בין הרגעים שנשען על החלום עצמו או על מה שנאמר עליו.'
      : 'No link between these moments rests on the dream or on what was said about it yet.';
  if (kind === 'first-look')
    return language === 'he' ? 'זו התבוננות ראשונה, מתוך רגע אחד. רגעים נוספים יכולים להעמיק אותה.' : 'This is a first look, from one moment. More moments can deepen it.';
  return null;
}

/** The verified summary shown when a whole view fails every check: the dream's words and the dreamer's, nothing interpreted. */
export function factualSummary(s: WholeSources): AssembledWhole {
  const lines = s.explored.map((m) => {
    const said = m.answers.filter((a) => !isUnsureAnswer(a));
    const dream = quoted(s.language, textOfSegments(s.sourceText, s.segments, m.segments));
    if (!said.length) return `${dream} — ${s.language === 'he' ? 'בלי תשובה' : 'no answer'}`;
    return `${dream} — ${s.language === 'he' ? 'אמרת:' : 'you said:'} ${quoted(s.language, excerptOf(said.join(' '), 30))}`;
  });
  return { kind: 'factual-summary', notice: wholeNotice(s.language, 'factual-summary'), overview: lines.join('\n'), connections: [], recurring: null, contrast: null, readings: [], closingQuestion: '', invite: s.unexplored.map((u) => u.id) };
}

/** Her own words for feelings, in the order she said them (one per word): what a modest opening or closing is built from. */
function herFeelingWords(s: WholeSources): string[] {
  const out: string[] = [];
  for (const m of s.explored)
    for (const a of m.answers.filter((x) => !isUnsureAnswer(x)))
      for (const clause of a.split(/[,.;!?]+/)) {
        // words that described someone else ("יוסי היה נראה מופתע") are not her feelings
        if (/(?<![א-ת])(נראה|נראתה|נראו|נראית)(?![א-ת])/.test(clause)) continue;
        const cw = words(clause);
        for (const [k, raw] of cw.entries()) {
          // a feeling she said she did NOT have ("לא הכניס לי ביטחון") is not one of her feeling words
          if (cw.slice(Math.max(0, k - 3), k).some(isNegation)) continue;
          // quoted without its "and" ("ומבולבל" → "מבולבל"), when the bare word is the same feeling
          const w = /^ו[א-ת]{2,}/.test(raw) && isFeelingWord(raw.slice(1)) ? raw.slice(1) : raw;
          if (isFeelingWord(w) && !out.some((o) => sameWord(o, w))) out.push(w);
        }
      }
  return out.slice(0, 3);
}

/** When no opening sentence passed: a short, true opening — which of her words came up in the moments explored. */
/** One short phrase of hers per explored moment (3–10 words, the shortest clause of her answer): her own voice, verbatim. */
function herShortPhrases(s: WholeSources): string[] {
  return s.explored
    .map((m) => m.answers.filter((x) => !isUnsureAnswer(x))[0] ?? '')
    .map((a) => a.split(/[.,;!?]+/).map((x) => x.trim()).filter((x) => { const n = x.split(/\s+/).length; return n >= 3 && n <= 10; }).sort((x, y) => x.length - y.length)[0] ?? '')
    .filter(Boolean)
    .slice(0, 2);
}

export function modestOpening(s: WholeSources): string {
  const ws = herFeelingWords(s).map((w) => quoted(s.language, w));
  const one = s.explored.length === 1;
  if (s.language === 'he') {
    if (ws.length) return `${one ? 'ברגע הזה' : 'ברגעים שנחקרו'} עלו במילים שלך: ${ws.join(', ')}.`;
    const phrases = herShortPhrases(s);
    if (phrases.length) return `${one ? 'ברגע הזה אמרת' : 'ברגעים שנחקרו אמרת'}: ${phrases.map((p) => quoted(s.language, p)).join(' · ')}.`;
    return `${one ? 'הרגע שנחקר' : 'הרגעים שנחקרו'}: ${s.explored.map((m) => m.label).join(' · ')}.`;
  }
  if (ws.length) return `${one ? 'In this moment' : 'In the moments explored'} your own words were: ${ws.join(', ')}.`;
  return `${one ? 'The moment explored' : 'The moments explored'}: ${s.explored.map((m) => m.label).join(' · ')}.`;
}

/** When no closing question passed: a safe one that goes back to her own words. */
export function modestClosing(s: WholeSources): string {
  const w = herFeelingWords(s)[0];
  // an open question about her own word or the moment, never the general "מה עוד עולה…" (doc 70)
  if (w) return s.language === 'he' ? `מה המילה ${quoted(s.language, w)} מזכירה לך, אם בכלל?` : `What does the word ${quoted(s.language, w)} remind you of, if anything?`;
  const m = s.explored[s.explored.length - 1];
  if (m) return s.language === 'he' ? `מה הרגע ${quoted(s.language, m.label)} מזכיר לך, אם בכלל?` : `What does the moment ${quoted(s.language, m.label)} remind you of, if anything?`;
  return s.language === 'he' ? 'מה מהחלום הזה הכי חשוב לך לקחת איתך?' : 'What from this dream would you most like to keep?';
}

/**
 * The empty frame "יש משהו ב-X ש…" says there is something without saying what (C1 of the re-review, R4 of the golden set; doc 78). It
 * makes no unfounded claim, so it is not a safety refusal (her binding note 3 of phase 2); a possibility rates it 0, and the whole view,
 * which has no rating, simply does not show it, with a reason that says so.
 */
const EMPTY_FRAME = /(?<![א-ת])(?:ש)?יש\s+משהו\s+ב\S+/;
const EMPTY_NOTE = 'empty: says there is something without saying what (quality, not a safety refusal)';

export function assembleWhole(raw: WholeRaw, s: WholeSources): { view: AssembledWhole; report: WholeReport } {
  const byId = new Map(s.explored.map((m) => [m.id, m]));
  const allSegs = [...new Set(s.explored.flatMap((m) => m.segments))];
  const usableOf = (m: ExploredForWhole) => m.answers.filter((a) => !isUnsureAnswer(a));
  const all: Sources = { language: s.language, sourceText: s.sourceText, segments: s.segments, allowed: allSegs, answers: s.explored.flatMap(usableOf) };
  const of = (ms: ExploredForWhole[]): Sources => ({ ...all, allowed: [...new Set(ms.flatMap((m) => m.segments))], answers: ms.flatMap(usableOf) });
  const shown = s.explored.flatMap((m) => (m.insight ? [m.insight.observation, m.insight.reflection, m.insight.possibility] : [])).filter(Boolean);
  const repeatsShown = (t: string) => shown.some((x) => overlap(t, x) >= 0.7) || (s.previous ? overlap(t, s.previous.overview) >= 0.75 : false);
  // the same quote matching as a card's anchors (doc 70): the person turned to her and a dropped conjunction letter are the same quote
  const inSources = (quote: string, m: ExploredForWhole) => !isUnsureAnswer(quote) && quote.trim().length > 0 && (usableOf(m).some((a) => quotedAs(quote, a) !== null) || quotedAs(quote, textOfSegments(s.sourceText, s.segments, m.segments)) !== null);
  const asWritten = (quote: string, m: ExploredForWhole) => [...usableOf(m), textOfSegments(s.sourceText, s.segments, m.segments)].map((x) => quotedAs(quote, x)).find((x) => x !== null) ?? quote.trim();
  const sourceWords = (ms: ExploredForWhole[]) => [...ms.flatMap(usableOf).flatMap(words), ...ms.flatMap((m) => m.segments).flatMap((id) => (s.segments[id] ? words(s.segments[id].text) : []))];
  // a sentence about the cited moments: her feelings only, the dream's time words only, nothing from a part that is not cited
  const statementAbout = (text: string, cited: ExploredForWhole[], extra: string[]) => {
    const own = [...sourceWords(cited), ...extra];
    const citedSegs = new Set(cited.flatMap((m) => m.segments));
    const elsewhere = s.segments.filter((x) => !citedSegs.has(x.id)).flatMap((x) => words(x.text));
    const out: string[] = [];
    const free: string[] = [];
    for (const w of contentWords(withoutQuotes(nonTemporal(text)))) {
      if (inWords(w, own) || isMeta(w, ATTRIBUTION) || isMeta(w, DREAM_META) || CONTRAST_WORDS.includes(norm(w))) continue;
      if (isFeelingWord(w)) out.push(`gives her a feeling she did not name there ("${w}")`);
      else if (isTimeWord(w)) out.push(`a time word the moments do not have ("${w}")`);
      else if (inWordsLong(w, elsewhere)) out.push(`brings in a part of the dream it does not cite ("${w}")`);
      else free.push(w);
    }
    // facts only from the quoted moments; anything beyond them is said as a possibility, or not at all
    if (free.length && !everySentenceTentative(text)) out.push(`states as fact what the moments do not say (${free.map((w) => `"${w}"`).join(', ')})`);
    if (firstPersonOutsideQuotes(text).length) out.push('first person');
    return out;
  };
  const report: WholeReport = {
    overview: [],
    connections: [],
    recurring: [],
    contrast: [],
    readings: [],
    closing: [],
    texts: {
      overview: raw.overview.slice(0, 6).map((o) => `[${o.source}] ${o.text}`),
      connections: raw.connections.slice(0, 6).map((c) => `${c.from}→${c.to} "${c.title}" «${c.fromQuote}» · «${c.toQuote}» — ${c.link}`),
      recurring: raw.recurring?.text ? `${raw.recurring.element}: ${raw.recurring.text}` : '',
      contrast: raw.contrast?.text ?? '',
      readings: raw.readings.slice(0, 4).map((r) => `s${r.segment}: ${r.text}`),
      closing: raw.closing?.text ?? '',
    },
  };

  // the dream states the order of these moments (every pair): only then may a sentence put them in a sequence
  const orderKnownBetween = (ms: ExploredForWhole[]) =>
    ms.every((x, i) => ms.slice(i + 1).every((y) => x.segments.length > 0 && y.segments.length > 0 && eventOrder(s.segments, x.segments[0], y.segments[0]) !== 'unknown'));
  // the opening's own rules (doc 76, item ה): one sentence is said in one breath (at most 30 words), and a link it offers ("קשר בין X
  // לבין Y") rests, on each side, on an explored moment's words or hers, as a connection's two ends must
  const momentWordsOf = (m: ExploredForWhole) => [...m.segments.flatMap((id) => (s.segments[id] ? words(s.segments[id].text) : [])), ...usableOf(m).flatMap(words)];
  const grounded = (side: string) => {
    const cw = contentWords(nonTemporal(side)).filter((w) => !isMeta(w, ATTRIBUTION) && !isMeta(w, DREAM_META) && !HEDGE_WORDS.includes(norm(w)));
    return cw.length === 0 || s.explored.some((m) => cw.filter((w) => inWords(w, momentWordsOf(m))).length / cw.length >= 0.6);
  };
  const openingProblems = (text: string): string[] => {
    const out: string[] = [];
    if (EMPTY_FRAME.test(text)) out.push(EMPTY_NOTE);
    if (text.split(/(?<=[.!?])\s+/u).some((x) => words(x).length > 30)) out.push('too long for one sentence (more than 30 words)');
    for (const m of text.matchAll(/(?:קשר|חיבור)\s+בין\s+(.+?)\s+(?:ו)?לבין\s+(.+?)(?=[,.;!?—–]|$)/g))
      if (!grounded(m[1]) || !grounded(m[2])) out.push('offers a link to something the explored moments do not have');
    return out;
  };
  // overview: every sentence with its source; an interpretation may rest on an explored moment itself ("m2")
  const verified = new Set<string>(s.explored.map((m) => m.id));
  const parts: string[] = [];
  let interpretations = 0;
  raw.overview.slice(0, 6).forEach((c, i) => {
    let reasons: string[] = [];
    if (c.source === 'dream') reasons = verifyDreamClaim({ segment: c.segment, action: c.action, actor: c.actor, target: c.target, text: c.text }, all).reasons;
    else if (c.source === 'user') {
      const m = byId.get(c.moment);
      if (!m) reasons = ['names no explored moment'];
      else {
        const v = verifyUserClaim({ quote: c.quote, text: c.text }, of([m]));
        reasons = v.status === 'checked' ? [] : v.reasons.length ? v.reasons : ['the quote is not hers'];
      }
    } else if (c.source === 'interpretation') {
      const cited = c.basis.map((b) => byId.get(b)).filter((m): m is ExploredForWhole => Boolean(m));
      reasons = verifyInterpretation(c.text, c.basis, verified, all, { exploredCount: s.explored.length, orderKnown: cited.length >= 2 && orderKnownBetween(cited) });
      reasons.push(...openingProblems(c.text));
    } else reasons = ['no source'];
    if (!reasons.length && (c.source === 'user' ? shown.some((x) => overlap(c.text, x) >= 0.9) : repeatsShown(c.text))) reasons = ['repeats what was already shown'];
    report.overview.push({ source: c.source, ok: reasons.length === 0, reasons });
    if (!reasons.length) {
      verified.add(`o${i}`);
      parts.push(c.text.trim());
      if (c.source === 'interpretation') interpretations += 1;
    }
  });

  // links between two different explored moments, each end resting on its own moment
  const seen = new Set<string>();
  const connections: AssembledWhole['connections'] = [];
  for (const c of raw.connections.slice(0, 6)) {
    const a = byId.get(c.from);
    const b = byId.get(c.to);
    const reasons: string[] = [];
    const pair = [c.from, c.to].sort().join('|');
    if (!a || !b || c.from === c.to) reasons.push('not two different explored moments');
    else {
      if (!inSources(c.fromQuote, a)) reasons.push('the first end does not rest on its own moment (or rests on "I don\'t know")');
      if (!inSources(c.toQuote, b)) reasons.push('the second end does not rest on its own moment (or rests on "I don\'t know")');
      reasons.push(...verifyInterpretation(c.link, [], verified, of([a, b]), { requireBasis: false, orderKnown: orderKnownBetween([a, b]) }));
      if (seen.has(pair)) reasons.push('the same pair twice');
      if (!reasons.length && repeatsShown(c.link)) reasons.push('repeats what was already shown');
    }
    report.connections.push(reasons);
    if (reasons.length || !a || !b) continue;
    seen.add(pair);
    const own = sourceWords([a, b]);
    const titleOk = words(c.title).length > 0 && words(c.title).length <= 6 && !firstPersonOutsideQuotes(c.title).length && contentWords(c.title).every((w) => inWords(w, own));
    connections.push({ from: c.from, to: c.to, title: titleOk ? c.title.trim() : `${a.label} · ${b.label}`, basis: `${quoted(s.language, asWritten(c.fromQuote, a))} · ${quoted(s.language, asWritten(c.toQuote, b))} — ${c.link.trim()}`, fromQuote: asWritten(c.fromQuote, a), toQuote: asWritten(c.toQuote, b) });
  }

  // what recurs: the element must be in every quoted moment
  let recurring: string | null = null;
  {
    const r = raw.recurring;
    const reasons: string[] = [];
    if (r && r.text.trim()) {
      const ms = r.quotes.map((x) => byId.get(x.moment));
      if (new Set(r.quotes.map((x) => x.moment)).size < 2) reasons.push('recurs in fewer than two explored moments');
      r.quotes.forEach((x, i) => {
        const m = ms[i];
        if (!m || !inSources(x.quote, m)) reasons.push('a quote is not from its moment');
        else if (!contentWords(r.element).every((w) => inWords(w, words(x.quote)))) reasons.push(`"${r.element}" is not in what was quoted for ${x.moment}`);
      });
      const cited = ms.filter((m): m is ExploredForWhole => Boolean(m));
      reasons.push(...statementAbout(r.text, cited, [...words(r.element)]));
      if (firstPersonOutsideQuotes(r.text).length) reasons.push('first person');
      report.recurring = reasons;
      if (!reasons.length) recurring = r.text.trim();
    }
  }

  // a difference between exactly two explored moments, in their own words
  let contrast: string | null = null;
  {
    const c = raw.contrast;
    const reasons: string[] = [];
    if (c && c.text.trim()) {
      const ms = c.quotes.map((x) => byId.get(x.moment));
      if (c.quotes.length !== 2 || new Set(c.quotes.map((x) => x.moment)).size !== 2) reasons.push('not exactly two explored moments');
      c.quotes.forEach((x, i) => {
        if (!ms[i] || !inSources(x.quote, ms[i] as ExploredForWhole)) reasons.push('a quote is not from its moment');
      });
      reasons.push(...statementAbout(c.text, ms.filter((m): m is ExploredForWhole => Boolean(m)), []));
      if (firstPersonOutsideQuotes(c.text).length) reasons.push('first person');
      report.contrast = reasons;
      if (!reasons.length) contrast = c.text.trim();
    }
  }

  // readings: on a part that was explored, hedged
  const readings: AssembledWhole['readings'] = [];
  for (const r of raw.readings.slice(0, 4)) {
    const reasons = allSegs.includes(r.segment) ? verifyInterpretation(r.text, [], verified, all, { exploredCount: s.explored.length, requireBasis: false, orderKnown: false }) : ['rests on a part of the dream that was not explored'];
    if (EMPTY_FRAME.test(r.text)) reasons.push(EMPTY_NOTE);
    if (allSegs.includes(r.segment) && !contentWords(r.text).some((w) => inWords(w, words(s.segments[r.segment].text)))) reasons.push('does not speak about the part it says it rests on');
    if (!reasons.length && repeatsShown(r.text)) reasons.push('repeats what was already shown');
    report.readings.push(reasons);
    if (!reasons.length && readings.length < s.maxReadings) readings.push({ basis: textOfSegments(s.sourceText, s.segments, [r.segment]), reading: r.text.trim() });
  }

  // the closing question
  let closingQuestion = '';
  {
    const cq = raw.closing;
    const asked = s.explored.map((m) => m.question);
    const v = verifyQuestion({ question: cq.text, focus: 'memory', subject: '' }, { language: s.language, segments: s.segments, momentSegments: allSegs, answers: all.answers, prior: [], closing: true });
    const reasons = [...v.reasons];
    if (cq.moment) {
      const m = byId.get(cq.moment);
      // her words in that moment, or a detail of that moment's dream text (doc 50, א8; doc 76, item ז)
      const inMoment = m && [...usableOf(m), textOfSegments(s.sourceText, s.segments, m.segments)].some((a) => quotedAs(cq.quote, a) !== null);
      if (!m || !cq.quote.trim() || !inMoment) reasons.push('the quoted words are not hers in that moment');
    }
    if (asked.some((q) => overlap(cq.text, q) >= 0.6)) reasons.push('repeats a question already asked');
    if (s.previous && overlap(cq.text, s.previous.closingQuestion) >= 0.6) reasons.push('repeats the previous closing question');
    if (words(cq.text).some((w) => isFeelingWord(w) && !inWords(w, all.answers.flatMap(words)))) reasons.push('gives her a feeling she did not name');
    report.closing = cq.text.trim() ? reasons : ['empty'];
    if (cq.text.trim() && !reasons.length) closingQuestion = cq.text.trim();
  }

  const n = s.explored.length;
  const adds = connections.length + (recurring ? 1 : 0) + (contrast ? 1 : 0);
  let kind: WholeKind;
  if (n >= 2) kind = adds > 0 ? 'whole' : parts.length > 0 ? 'no-link' : 'factual-summary';
  else kind = interpretations + readings.length > 0 ? 'first-look' : 'factual-summary';
  if (kind === 'factual-summary') return { view: factualSummary(s), report };
  const opening = parts.length ? parts.join(' ') : modestOpening(s);
  if (!closingQuestion) closingQuestion = modestClosing(s);
  return {
    view: {
      kind,
      notice: wholeNotice(s.language, kind),
      overview: opening,
      connections: n >= 2 ? connections.slice(0, 4) : [],
      recurring: n >= 2 ? recurring : null,
      contrast: n >= 2 ? contrast : null,
      readings,
      closingQuestion,
      invite: s.unexplored.map((u) => u.id),
    },
    report,
  };
}

export { QUESTION_FLOOR, questionQuality, planQuestionFocus } from './interpretationCheck.js';
