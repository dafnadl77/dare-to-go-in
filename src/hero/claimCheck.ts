import type { AppLanguage } from './appLanguage.js';
import { feelingsTextLooksDiagnostic } from './dreamReflectionSchema.js';
import { dreamerIsTarget, eventOrder, negatedIn, textOfSegments, whoActs, type DreamSegment } from './dreamSegments.js';
import {
  containsVerbatim,
  contentWords,
  everySentenceTentative,
  firstPersonOutsideQuotes,
  inWords,
  inWordsLong,
  isFeelingWord,
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
}

export interface Sources {
  language: AppLanguage;
  sourceText: string;
  segments: DreamSegment[];
  /** The parts that may be stated as facts here (the moment's, or the explored moments'). */
  allowed: number[];
  /** The dreamer's usable words here (never an "I don't know"). */
  answers: string[];
}

const segWords = (s: Sources, ids: readonly number[]) => ids.flatMap((id) => (s.segments[id] ? words(s.segments[id].text) : []));
const answerWords = (s: Sources) => s.answers.flatMap(words);
const otherSegWords = (s: Sources) => segWords(s, s.segments.map((x) => x.id).filter((id) => !s.allowed.includes(id)));

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
  const own = words(seg.text);
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

const DIAGNOSTIC = /(טראומ|דיכאון|דיכאוני|הפרעה|פוסט[\s-]?טראומ|חרדתי|נוירוז|(?:ל)?הצביע על|מצביע(?:ה|ים|ות)? על|(?:ל)?העיד על|מעיד(?:ה|ים|ות)? על|סימן ל|trauma|depress|disorder|ptsd|neuros|indicates?|points? to|is a sign)/i;
const FIXED_MEANING = /(מסמל|מסמלת|מייצג|מייצגת|ייצג|סימל|סמל של|סמל ל|מסמן|מסמנת|מסמנים|דימוי ל|מטאפורה|symboli[sz]e|represent|stands for|a symbol|a metaphor)/i;
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

export function verifyInterpretation(text: string, basis: readonly string[], verified: ReadonlySet<string>, s: Sources, opts: { exploredCount?: number; requireBasis?: boolean; orderKnown?: boolean } = {}): string[] {
  const reasons: string[] = [];
  if (!text.trim()) return ['empty'];
  if (opts.requireBasis !== false && !basis.some((b) => verified.has(b))) reasons.push('rests on no sentence that passed the checks');
  if (!everySentenceTentative(text)) reasons.push('a sentence states as fact what can only be a possibility (every sentence must be hedged)');
  if (firstPersonOutsideQuotes(text).length) reasons.push('first person in a sentence addressed to the dreamer');
  const own = [...answerWords(s), ...segWords(s, s.allowed)];
  for (const w of contentWords(withoutQuotes(text))) {
    if (isFeelingWord(w) && !inWords(w, own)) reasons.push(`gives her a feeling she did not name ("${w}")`);
    if (isTimeWord(w) && !inWords(w, own)) reasons.push(`a time word neither the dream nor she used ("${w}")`);
  }
  if (DIAGNOSTIC.test(text) || feelingsTextLooksDiagnostic(text)) reasons.push('reads like a diagnosis');
  if (FIXED_MEANING.test(text)) reasons.push('gives an image a fixed meaning');
  const intent = text.match(INTENT);
  if (intent && FIGURE.test(text) && !inWords(intent[2].split(/\s+/)[0], own)) reasons.push(`gives someone in the dream an intention or inner stance that was not said ("${intent[2]}")`);
  if (opts.orderKnown === false && SEQUENCE.test(text)) reasons.push('puts moments in a sequence the dream does not state');
  if (BROKEN.test(text)) reasons.push('broken Hebrew ("ש" glued to a word that cannot take it)');
  if ((opts.exploredCount ?? 2) <= 1 && WHOLE_PICTURE.test(text)) reasons.push('claims the whole picture after one moment');
  if (words(text).length > MAX_INTERPRETATION_WORDS) reasons.push('too long');
  return reasons;
}

// ------------------------------------------------------------------------------------------------ questions

export type QuestionFocus = 'feeling' | 'sense' | 'figure' | 'action' | 'detail' | 'change' | 'memory' | 'salience' | 'surprise' | 'choice' | 'connection';
export const FOCI: readonly QuestionFocus[] = ['feeling', 'sense', 'figure', 'action', 'detail', 'change', 'memory', 'salience', 'surprise', 'choice', 'connection'];

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
const YES_NO = /^\s*(האם|האין|is|are|do|does|did|was|were|have|has|can|could|will|would)\b/i;
/** A real (not yes/no) question names what it asks: a question word somewhere in it ("כשאת שם, מה..." counts). */
const WH = /(^|[\s,"«])(?:[וכש]{0,2})(מה|מי|איך|איפה|היכן|מתי|איזה|איזו|אילו|כמה|לאן|מאיפה|במה|על מה|עם מי|what|who|how|where|which|when)(?=[\s,?]|$)/i;
const WHY = /^\s*(למה|מדוע|why)\b/i;
const SENSE = /^(ראית|שמעת|הרחת|נגעת|רואה|שומעת|שומע|see|saw|hear|heard|smell|smelled)/;
const FEEL = /^(הרגשת|הרגיש|מרגיש|תחוש|התחוש|רגש|feel|felt|feeling)/;
export const MAX_QUESTION_WORDS = 16;

export function inferFocus(question: string): QuestionFocus | null {
  const ws = words(question).map((w) => w.replace(/^[וכש]+/, ''));
  if (ws.some((w) => FEEL.test(w)) || words(question).some(isFeelingWord)) return 'feeling';
  if (ws.some((w) => SENSE.test(w))) return 'sense';
  return null;
}

export interface QuestionContext {
  language: AppLanguage;
  segments: DreamSegment[];
  momentSegments: number[];
  /** Everything the dreamer already said in this journey (usable answers). */
  answers: string[];
  prior: { question: string; focus: QuestionFocus | null; subject: string | null }[];
  /** A closing question (about her dream and her life): its own words are free, but it is built from hers, may build on a feeling she
      named, and never brings in a part of the dream that was not explored. A moment question stays within its moment. */
  closing?: boolean;
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
/** How many words of a moment question may be in neither the dream nor her answers (plain question language). */
export const MAX_FREE_QUESTION_WORDS = 2;

export function verifyQuestion(c: { question: string; focus: string; subject: string }, ctx: QuestionContext): { reasons: string[]; focus: QuestionFocus; subject: string } {
  const reasons: string[] = [];
  const q = c.question.trim();
  const focus: QuestionFocus = inferFocus(q) ?? ((FOCI as readonly string[]).includes(c.focus) ? (c.focus as QuestionFocus) : 'detail');
  const subject = c.subject.trim();
  if (!q.endsWith('?') || (q.match(/\?/g) ?? []).length !== 1) reasons.push('not one question ending with a question mark');
  if (words(q).length > MAX_QUESTION_WORDS + 2) reasons.push(`too long (at most ${MAX_QUESTION_WORDS} words)`);
  if (YES_NO.test(q) || !WH.test(q)) reasons.push('a yes/no question (no question word)');
  if (/\sו(?:מה|מי|איך|איפה|מתי|איזה|איזו|אילו|כמה|למה)(?=\s)/.test(` ${q}`) || /\s(?:and|or) (?:what|who|how|where|which|when)\b/i.test(q)) reasons.push('two questions in one sentence');
  if (WHY.test(q)) reasons.push('a "why" question');
  if (firstPersonOutsideQuotes(q).length) reasons.push('first person in a question to the dreamer (e.g. "אחי" instead of "אחיך")');
  const moment = ctx.momentSegments.flatMap((id) => (ctx.segments[id] ? words(ctx.segments[id].text) : []));
  const near = (x: DreamSegment) => ctx.momentSegments.some((id) => ctx.segments[id] && ctx.segments[id].group === x.group && Math.abs(id - x.id) === 1);
  const others = ctx.segments.filter((x) => !ctx.momentSegments.includes(x.id) && !near(x)).flatMap((x) => words(x.text));
  const nearby = ctx.segments.filter(near).flatMap((x) => words(x.text));
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
  if (ctx.closing && said.length && !contentWords(q).some((w) => inWords(w, said))) reasons.push('not built from her own words');
  const last = ctx.prior[ctx.prior.length - 1];
  const describes = (f: QuestionFocus | null) => f === 'sense' || f === 'detail';
  if (!ctx.closing && last && describes(last.focus) && describes(focus)) reasons.push('a second question in a row about how it looked or sounded: ask what stood out, surprised her, or drew her to it');
  for (const p of ctx.prior) {
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
  if (alternative) return { question: language === 'he' ? 'מה הדבר הראשון שנראה או נשמע ברגע הזה?' : 'What is the first thing you see or hear in this moment?', focus: 'sense' };
  const list = language === 'he' ? he : en;
  const [focus, question] = list.find(([f]) => !used.includes(f)) ?? list[0];
  return { question, focus };
}

// ------------------------------------------------------------------------------------------------ labels

/** A moment label: short, no first person, only the moment's own words, not a copy of another label. Repaired or rebuilt by code. */
export function checkLabel(candidate: string, momentText: string, used: readonly string[], dreamText = ''): string {
  const ok = (l: string) =>
    l.trim().length > 0 &&
    words(l).length <= 5 &&
    !words(l).some(isFirstPersonWord) &&
    contentWords(l).every((w) => inWords(w, words(momentText)) || inWords(w, words(dreamText))) &&
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
}
export interface AssembledInsight {
  observation: string;
  reflection: string;
  possibility: string;
  kind: 'interpretive' | 'factual';
}
export interface ClaimReport {
  dream: { status: Status; reasons: string[] }[];
  user: { status: Status; reasons: string[] }[];
  possibilities: string[][];
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
    else if (user[i].status === 'quote') refl.push(`${said} ${quoted(s.language, c.quote)}`);
    if (user[i].status !== 'drop') verified.add(`u${i}`);
  });
  const usable = s.answers.filter((a) => !isUnsureAnswer(a));
  if (refl.length === 0 && usable.length) refl.push(`${said} ${quoted(s.language, excerptOf(usable[0]))}`);

  const possibilities = raw.possibilities.slice(0, 3).map((p) => {
    const reasons = verifyInterpretation(p.text, p.basis, verified, s, { exploredCount: 1 });
    if (earlier.some((x) => overlap(p.text, x) >= 0.6)) reasons.push('repeats an insight already shown for an earlier moment');
    return reasons;
  });
  const chosen = raw.possibilities.findIndex((_, i) => possibilities[i].length === 0);
  return {
    insight: {
      observation: obs.join(' '),
      reflection: refl.join(' '),
      possibility: chosen >= 0 ? raw.possibilities[chosen].text.trim() : '',
      kind: chosen >= 0 ? 'interpretive' : 'factual',
    },
    report: {
      dream: dream.map(({ status, reasons }) => ({ status, reasons })),
      user: user.map(({ status, reasons }) => ({ status, reasons })),
      possibilities,
      texts: { dream: raw.dream.slice(0, 4).map((c) => c.text), user: raw.user.slice(0, 4).map((c) => c.text), possibilities: raw.possibilities.slice(0, 3).map((p) => p.text) },
    },
  };
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
      for (const w of words(a)) if (isFeelingWord(w) && !out.some((o) => sameWord(o, w))) out.push(w);
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
  if (w) return s.language === 'he' ? `מה עוד עולה כשחוזרים למילה ${quoted(s.language, w)}?` : `What else comes up when you go back to the word ${quoted(s.language, w)}?`;
  const m = s.explored[s.explored.length - 1];
  if (m) return s.language === 'he' ? `מה עוד עולה כשחוזרים לרגע ${quoted(s.language, m.label)}?` : `What else comes up when you go back to the moment ${quoted(s.language, m.label)}?`;
  return s.language === 'he' ? 'מה מהחלום הזה הכי חשוב לך לקחת איתך?' : 'What from this dream would you most like to keep?';
}

export function assembleWhole(raw: WholeRaw, s: WholeSources): { view: AssembledWhole; report: WholeReport } {
  const byId = new Map(s.explored.map((m) => [m.id, m]));
  const allSegs = [...new Set(s.explored.flatMap((m) => m.segments))];
  const usableOf = (m: ExploredForWhole) => m.answers.filter((a) => !isUnsureAnswer(a));
  const all: Sources = { language: s.language, sourceText: s.sourceText, segments: s.segments, allowed: allSegs, answers: s.explored.flatMap(usableOf) };
  const of = (ms: ExploredForWhole[]): Sources => ({ ...all, allowed: [...new Set(ms.flatMap((m) => m.segments))], answers: ms.flatMap(usableOf) });
  const shown = s.explored.flatMap((m) => (m.insight ? [m.insight.observation, m.insight.reflection, m.insight.possibility] : [])).filter(Boolean);
  const repeatsShown = (t: string) => shown.some((x) => overlap(t, x) >= 0.7) || (s.previous ? overlap(t, s.previous.overview) >= 0.75 : false);
  const inSources = (quote: string, m: ExploredForWhole) => !isUnsureAnswer(quote) && quote.trim().length > 0 && (usableOf(m).some((a) => containsVerbatim(a, quote)) || containsVerbatim(textOfSegments(s.sourceText, s.segments, m.segments), quote));
  const sourceWords = (ms: ExploredForWhole[]) => [...ms.flatMap(usableOf).flatMap(words), ...ms.flatMap((m) => m.segments).flatMap((id) => (s.segments[id] ? words(s.segments[id].text) : []))];
  // a sentence about the cited moments: her feelings only, the dream's time words only, nothing from a part that is not cited
  const statementAbout = (text: string, cited: ExploredForWhole[], extra: string[]) => {
    const own = [...sourceWords(cited), ...extra];
    const citedSegs = new Set(cited.flatMap((m) => m.segments));
    const elsewhere = s.segments.filter((x) => !citedSegs.has(x.id)).flatMap((x) => words(x.text));
    const out: string[] = [];
    const free: string[] = [];
    for (const w of contentWords(withoutQuotes(text))) {
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
    connections.push({ from: c.from, to: c.to, title: titleOk ? c.title.trim() : `${a.label} · ${b.label}`, basis: `${quoted(s.language, c.fromQuote)} · ${quoted(s.language, c.toQuote)} — ${c.link.trim()}`, fromQuote: c.fromQuote.trim(), toQuote: c.toQuote.trim() });
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
      if (!m || !cq.quote.trim() || !usableOf(m).some((a) => containsVerbatim(a, cq.quote))) reasons.push('the quoted words are not hers in that moment');
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
