/**
 * Word-level tools for checking what the journey's model calls write against the dream and the dreamer's words (stage 3b fix round,
 * doc 30). Deterministic, no model. Hebrew-aware (prefixes, endings, defective spelling, binyan prefixes), with a plain English path.
 *
 * What a match here means, and what it does not: two words "match" when they plausibly share a stem. That is LEXICAL SUPPORT only —
 * a sentence whose every word matches the dream can still say something false (who did it, in which order, whether it happened at
 * all). Those are checked separately (claimCheck.ts); nothing in this file is ever reported as proof that a sentence is true.
 */

const FINAL: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
const NIQQUD = /[֑-ׇ]/g;
const HEBREW = /[א-ת]/;

export const isHebrewText = (text: string) => HEBREW.test(text);

/** Final letters made regular, niqqud dropped, lower case: the form every comparison uses. */
export function norm(word: string): string {
  return word.toLowerCase().replace(NIQQUD, '').replace(/[ךםןףץ]/g, (c) => FINAL[c]).replace(/['’׳״"]/g, '');
}

/** The words of a text, in order, as written (punctuation dropped). */
export function words(text: string): string[] {
  return (text.replace(NIQQUD, '').match(/[\p{L}\p{N}]+(?:['’׳][\p{L}]+)*/gu) ?? []).map((w) => w.toLowerCase());
}

/** Text with every quoted span removed (« », " ", “ ”, „ “): what remains is the speaker's own wording. */
export function withoutQuotes(text: string): string {
  return text.replace(/«[^»]*»|"[^"]*"|“[^”]*”|„[^“”]*[“”]/g, ' ');
}

/** Whitespace, punctuation and final letters evened out, for "is this a verbatim piece of that text". */
export function flat(text: string): string {
  return words(text).map(norm).join(' ');
}
/** A verbatim piece: the same words in the same order (a one-letter prefix glued to its first word in the source is allowed,
    "אין לי מקום" inside "שאין לי מקום"; punctuation and spacing do not matter). */
export const containsVerbatim = (haystack: string, needle: string) => {
  const n = flat(needle);
  if (words(needle).length === 0 || n.length < 2) return false;
  const h = ` ${flat(haystack)} `;
  // every place it stands (its first word may carry one more prefix letter there); a place right after a negation does not count: a
  // quote that cuts the "לא" off before it says the opposite (doc 70: "הבנתי איך הוא הגיע אליה" out of "ולא הבנתי…")
  for (const p of ['', ...'והבלמשכ']) {
    for (let at = h.indexOf(` ${p}${n} `); at >= 0; at = h.indexOf(` ${p}${n} `, at + 1)) {
      const before = h.slice(0, at).trim().split(' ').pop() ?? '';
      if (!before || !isNegation(before)) return true;
    }
  }
  return false;
};

/**
 * The dreamer's first person as the model turns it to her (doc 62, item 3): told to speak to her, it copies «נקרעה לי בידיים» as
 * «נקרעה לך בידיים». Grammar only: a second-person ending (לך→לי, אותך→אותי, עלייך→עליי, ממך→ממני), a second-person past verb
 * (ניסית→ניסיתי) and the pronoun (את/אתה→אני). Every other word must stay exactly the same.
 */
export function firstPersonForms(word: string): string[] {
  const w = word.replace(/[^א-ת]/g, '');
  const out = [w];
  if (/^(?:ו|ש|וש|כש|וכש)?(?:את|אתה)$/.test(w)) out.push(w.replace(/(?:אתה|את)$/, 'אני'));
  if (/ממך$/.test(w)) out.push(w.replace(/ממך$/, 'ממני'));
  else if (/ך$/.test(w)) out.push(w.replace(/יך$/, 'י').replace(/ך$/, 'י'));
  if (/ת$/.test(w) && w.length >= 3) out.push(`${w}י`);
  return out;
}

/**
 * Where `quote` stands in `text`, in `text`'s own words, or null: one matching for every quote the model copies (a card's anchors, the
 * whole view's quotes, the closing question's quote; doc 70). Verbatim as containsVerbatim has it (its first word may lack one prefix
 * letter of the text: "לא" for "ולא"; never right after a negation it cut off), or differing only in the dreamer's person
 * («לא הבנת…» for «ולא הבנתי…»). A number ("we" → "you") or any other word that differs is not the same quote.
 */
export function quotedAs(quote: string, text: string): string | null {
  const q = quote.trim().split(/\s+/).filter((w) => /[א-תa-zA-Z]/.test(w));
  if (!q.length) return null;
  if (containsVerbatim(text, quote)) return q.join(' ').replace(/[^א-תa-zA-Z'\s]/g, '').trim();
  const t = text.split(/\s+/).map((w) => w.replace(/[^א-ת]/g, ''));
  const fits = (k: number, tw: string, f: string) => tw === f || (k === 0 && tw.length === f.length + 1 && 'והבלמשכ'.includes(tw[0]) && tw.slice(1) === f);
  for (let i = 0; i + q.length <= t.length; i += 1) {
    const chosen: string[] = [];
    for (let k = 0; k < q.length; k += 1) {
      const v = firstPersonForms(q[k]).find((f) => f && fits(k, t[i + k], f));
      if (v === undefined) break;
      chosen.push(t[i + k]); // the text's own word, with the prefix letter the model dropped
    }
    if (chosen.length === q.length && containsVerbatim(text, chosen.join(' '))) return chosen.join(' ');
  }
  return null;
}

/**
 * "אחרי" and "עד" where they say no time (doc 70): "אחרי" governed by a verb of searching, chasing or following ("חיפוש אחרי מתנה",
 * "רודפת אחרי", "עוקבת אחרי") is its object; "עד הסוף" and "עד כמה" are degree. Removed before the time words are looked for; every
 * other "אחרי" / "עד" ("אחרי ש…", "אחרי השוק", "עד ש…") stays a time word.
 */
export function nonTemporal(text: string): string {
  return text
    .replace(/((?:^|\s)\S*(?:ח[יו]?פ[ו]?ש|ר[ו]?ד[ו]?פ|ע[ו]?ק[ו]?ב)\S*)\s+אחרי(?![א-ת])/g, '$1')
    .replace(/(?<![א-ת])עד\s+(?:ה)?סוף(?![א-ת])/g, '')
    .replace(/(?<![א-ת])עד\s+(?=כמה(?![א-ת]))/g, '');
}

// ------------------------------------------------------------------------------------------------ stems

const PREFIX = new Set(['ו', 'ה', 'ב', 'ל', 'מ', 'ש', 'כ']);
// Longest first. Written with regular (not final) letters, as norm() leaves words.
const SUFFIXES = ['ותיהמ', 'ותיה', 'יהמ', 'יהנ', 'תמ', 'תנ', 'תי', 'נו', 'ימ', 'ות', 'יה', 'יו', 'יכ', 'כמ', 'ה', 'ת', 'י', 'ו', 'כ', 'מ', 'נ'];
const BINYAN = /^(הת|מת|נת|ית|את|תת)/;
const EN_SUFFIXES = ['ing', 'ed', 'es', 's', 'ly'];

interface Forms {
  long: Set<string>;
  /** Two-letter stems, only from short bases (so "אח" matches "אחיך" but not every word that loses letters down to two). */
  short: Set<string>;
}
const cache = new Map<string, Forms>();

function formsOf(raw: string): Forms {
  const w = norm(raw);
  const hit = cache.get(w);
  if (hit) return hit;
  const long = new Set<string>();
  const short = new Set<string>();
  // two-letter stems only from an ending taken off a short word ("אחי" → "אח"), never from a spelling variant ("היום" / "המים")
  const add = (f: string, baseLen: number, mayBeShort = true) => {
    if (f.length >= 3) long.add(f);
    else if (f.length === 2 && baseLen <= 4 && mayBeShort) short.add(f);
  };
  if (!HEBREW.test(w)) {
    add(w, w.length);
    for (const s of EN_SUFFIXES) if (w.length - s.length >= 3 && w.endsWith(s)) add(w.slice(0, -s.length), w.length);
  } else {
    const bases = [w];
    let cur = w;
    for (let i = 0; i < 3 && cur.length > 2 && PREFIX.has(cur[0]); i++) {
      cur = cur.slice(1);
      bases.push(cur);
    }
    for (const b of [...bases]) if (b.length >= 5 && BINYAN.test(b)) bases.push(b.slice(2));
    const stems = new Set<[string, number]>();
    for (const b of bases) {
      stems.add([b, b.length]);
      for (const s1 of SUFFIXES) {
        if (b.length - s1.length < 2 || !b.endsWith(s1)) continue;
        const b1 = b.slice(0, -s1.length);
        stems.add([b1, b.length]);
        for (const s2 of SUFFIXES) if (b1.length - s2.length >= 2 && b1.endsWith(s2)) stems.add([b1.slice(0, -s2.length), b.length]);
      }
    }
    for (const [f, len] of stems) {
      add(f, len);
      // defective / full spelling: the same word with or without its inner ו and י
      const d = f[0] + f.slice(1).replace(/[וי]/g, '');
      add(d, len, false);
    }
  }
  const out = { long, short };
  cache.set(w, out);
  return out;
}

/** True when the two words plausibly share a stem (see the file note: lexical support, never proof). */
export function sameWord(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const A = formsOf(x);
  const B = formsOf(y);
  for (const f of A.long) if (B.long.has(f)) return true;
  for (const f of A.short) if (B.short.has(f)) return true;
  return sameLamedHe(x, y);
}

/**
 * A verb whose root ends in ה, past "you"/"I" against the present ("ראית" / "רואה", "עשית" / "עושה"): the two root letters before
 * the ending, the present with its ו. Only these two patterns, so "קמה" (got up) and "קומה" (a floor) stay apart.
 */
const LH_PAST = /^(..)(יתי|ית|ינו)$/;
const LH_PRESENT = /^(.)ו(.)(ה|ימ|ות)$/;
function sameLamedHe(x: string, y: string): boolean {
  if (!HEBREW.test(x) || !HEBREW.test(y)) return false;
  const bare = (w: string) => [w, ...(w.length >= 4 && PREFIX.has(w[0]) ? [w.slice(1)] : [])];
  const past = (w: string) => bare(w).map((b) => b.match(LH_PAST)?.[1]).filter(Boolean) as string[];
  const present = (w: string) => bare(w).map((b) => { const m = b.match(LH_PRESENT); return m ? m[1] + m[2] : ''; }).filter(Boolean);
  return past(x).some((r) => present(y).includes(r)) || past(y).some((r) => present(x).includes(r));
}

export const inWords = (word: string, pool: readonly string[]) => pool.some((p) => sameWord(word, p));

/** The stricter match (three letters or more in common): for "this word belongs to ANOTHER part of the dream", where two-letter
    stems would tie unrelated words ("לב" / "לבן"). */
export function sameWordLong(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const B = formsOf(y);
  for (const f of formsOf(x).long) if (B.long.has(f)) return true;
  return false;
}
export const inWordsLong = (word: string, pool: readonly string[]) => pool.some((p) => sameWordLong(word, p));

// ------------------------------------------------------------------------------------------------ word classes

/** Function words: never the content a check looks for. */
const STOP = new Set(
  [
    'של', 'את', 'עם', 'על', 'אל', 'מן', 'אם', 'כי', 'גם', 'רק', 'עוד', 'כבר', 'אבל', 'אך', 'או', 'כמו', 'כאילו', 'זה', 'זו', 'זאת', 'הזה', 'הזאת', 'ההוא', 'ההיא',
    'הוא', 'היא', 'הם', 'הן', 'אתה', 'אתם', 'אתן', 'לך', 'לכם', 'שלך', 'שלכם', 'אותך', 'אותכם', 'אלייך', 'אליך', 'עלייך', 'עליך', 'בך', 'ממך', 'איתך', 'אצלך', 'בשבילך', 'עבורך', 'אחרייך', 'אחריך', 'לפנייך',
    'לו', 'לה', 'להם', 'שלו', 'שלה', 'שלהם', 'אותו', 'אותה', 'אותם', 'אותן', 'בו', 'בה', 'בהם', 'אליו', 'אליה', 'ממנו', 'ממנה', 'איתו', 'איתה',
    'יש', 'אין', 'היה', 'הייתה', 'היתה', 'היו', 'יהיה', 'להיות', 'הוא', 'כל', 'כולם', 'כולן', 'כולו', 'כולה', 'משהו', 'מישהו', 'דבר', 'שום',
    'מה', 'מי', 'איך', 'איפה', 'מתי', 'למה', 'איזה', 'איזו', 'אילו', 'כמה', 'האם',
    'שם', 'כאן', 'פה', 'אשר', 'שבו', 'שבה', 'שבהם', 'אחת', 'אחד', 'השני', 'השנייה', 'בין', 'מאוד', 'מדי', 'ממש', 'קצת', 'יותר', 'פחות', 'הרבה', 'כך', 'כן',
    'אולי', 'ייתכן', 'יתכן', 'אפשר', 'אפשרות', 'יכול', 'יכולה', 'נראה', 'כנראה', 'בעצם', 'עצם', 'עצמו', 'עצמה', 'עצמך',
    'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'was', 'were', 'is', 'are', 'be', 'been', 'it', 'its', 'that', 'this',
    'there', 'but', 'he', 'she', 'they', 'his', 'her', 'their', 'him', 'them', 'you', 'your', 'yours', 'yourself', 'what', 'who', 'how', 'where', 'which', 'as', 'so',
    'very', 'too', 'just', 'some', 'something', 'someone', 'all', 'perhaps', 'maybe', 'might', 'could', 'can', 'one', 'way',
  ].map(norm),
);

export function isStop(word: string): boolean {
  const w = norm(word);
  if (STOP.has(w)) return true;
  // a function word with a one-letter prefix ("שעוד", "וגם", "כשאין")
  let cur = w;
  for (let i = 0; i < 2 && cur.length > 2 && PREFIX.has(cur[0]); i++) {
    cur = cur.slice(1);
    if (STOP.has(cur)) return true;
  }
  return false;
}

const NEGATION = new Set(['לא', 'אין', 'בלי', 'אף', 'not', 'never', 'no', "didn't", "couldn't", "wasn't", "don't", "can't", 'without'].map(norm));
export function isNegation(word: string): boolean {
  const w = norm(word);
  if (NEGATION.has(w) || /n't$/.test(w)) return true;
  return HEBREW.test(w) && w.length <= 4 && /^[ושכ]{1,2}(לא|אינ|בלי|אפ)$/.test(w);
}

/** Words that place events in time. A claim may use one only where its own source (the dream part or the answer) uses it. */
const TIME = [
  'אחרי', 'לאחר', 'לפני', 'קודם', 'מקודם', 'בסוף', 'לבסוף', 'בהתחלה', 'בתחילה', 'אז', 'ואז', 'בזמן', 'במהלך', 'מיד', 'מייד', 'פתאום', 'שוב', 'עד', 'ככל',
  'בהמשך', 'כבר', 'תמיד', 'לתמיד', 'לעולם',
  'after', 'before', 'then', 'later', 'earlier', 'first', 'finally', 'eventually', 'suddenly', 'again', 'always', 'never', 'forever', 'meanwhile', 'while',
].map(norm);
export function isTimeWord(word: string): boolean {
  const w = norm(word);
  if (TIME.includes(w)) return true;
  let cur = w;
  for (let i = 0; i < 2 && cur.length > 2 && PREFIX.has(cur[0]); i++) {
    cur = cur.slice(1);
    if (TIME.includes(cur)) return true;
  }
  return false;
}

/** Feelings and inner states. In anything said ABOUT the dreamer, such a word must come from her own words (or the dream's). */
const FEELINGS = [
  'פחד', 'מפחד', 'מפוחד', 'חרדה', 'לחץ', 'לחוץ', 'עצב', 'עצוב', 'שמחה', 'שמח', 'כעס', 'כועס', 'בושה', 'אשמה', 'געגוע', 'מתגעגע', 'לבד', 'בדידות', 'בודד',
  // (no "רוגע/רגוע": with defective spelling it is the same letters as "רגע", a moment)
  'זרות', 'זר', 'שייכות', 'שייך', 'תקווה', 'ייאוש', 'יאוש', 'אונים', 'שליטה', 'ביטחון', 'שלווה', 'שקט', 'כאב', 'אהבה', 'אוהב', 'שנאה',
  'קנאה', 'הקלה', 'מבוכה', 'נבוך', 'חולשה', 'חלש', 'מאמץ', 'עייפות', 'עייף', 'בלבול', 'מבולבל', 'ודאות', 'ציפייה', 'אכזבה', 'נחמה', 'אובדן', 'חסר', 'ריקנות',
  'תסכול', 'מתח', 'בהלה', 'נבהל', 'דאגה', 'דואג', 'צער', 'הפתעה', 'מופתע', 'סקרנות', 'פליאה', 'תדהמה', 'עלבון', 'נעלב', 'גאווה', 'נטישה', 'נטוש',
  'דחייה', 'נדחה', 'שלמות', 'טראומה', 'אשם', 'בדידות', 'מוגן', 'הגנה', 'חרטה', 'ערגה', 'חוסר', 'ציפיות', 'מתגעגע', 'התגעגע', 'געגועים', 'אכזב', 'התאכזב', 'מתאכזב', 'נלחץ', 'נלחצ', 'פחדים', 'חשש', 'חושש', 'חוששת', 'מפחידה', 'ניכור', 'בודדה', 'פגיע', 'פגיעה', 'מפתיע', 'מפתיעה', 'ספקנות', 'ספק', 'מצחיק', 'משעשע', 'מבלבל', 'מבלבלת',
  'fear', 'afraid', 'scared', 'anxiety', 'anxious', 'stress', 'sad', 'sadness', 'happy', 'joy', 'anger', 'angry', 'shame', 'guilt', 'longing', 'lonely', 'alone',
  'loneliness', 'belong', 'belonging', 'hope', 'despair', 'helpless', 'control', 'safe', 'safety', 'calm', 'peace', 'pain', 'hurt', 'love', 'hate', 'jealous',
  'relief', 'embarrassed', 'weak', 'weakness', 'effort', 'tired', 'confused', 'confusion', 'certainty', 'uncertain', 'disappointed', 'comfort', 'loss', 'empty',
  'emptiness', 'frustration', 'tension', 'terror', 'panic', 'worry', 'grief', 'surprise', 'curious', 'wonder', 'abandoned', 'rejected', 'free', 'freedom', 'quiet',
].map(norm);
/**
 * The feelings check matches the SAME word (with its prefixes and endings), never a shared root: "מעצבות" (shaping) is not "עצב",
 * "מתאימים" is not "אימה", "לשים לב" is not a feeling. A word may lose one prefix, or two when four letters remain ("בלבוש" is not
 * "בושה"), a binyan prefix when four letters remain ("מתאכזבת"), and one ending.
 */
// written with regular (not final) letters, as norm() leaves words: the plural is 'ימ' ("פחדים" → "פחדימ")
const FEELING_ENDINGS = ['ויות', 'יות', 'ות', 'ימ', 'תי', 'תמ', 'תנ', 'נו', 'ית', 'ה', 'ת', 'י', 'ו', 'כ'];
const endingsOff = (w: string) => [w, ...FEELING_ENDINGS.filter((e) => w.length - e.length >= 2 && w.endsWith(e)).map((e) => w.slice(0, -e.length))];
const FEELING_KEYS = new Set(FEELINGS.filter((f) => HEBREW.test(f)).flatMap(endingsOff).filter((k) => k.length >= 2));
/** Words that look like a feeling but are another word with the same letters. */
const FEELING_HOMOGRAPHS = new Set(['מעצב', 'מעצבת', 'מעצבות', 'מעצבים', 'לעצב', 'עיצוב', 'לשים', 'שמה', 'שמו'].map(norm));
/** Feelings matched only as these exact words (their letters are common inside other words: "רגשי" in "הרגשתי"). */
const EXACT_FEELINGS = new Set(['רגשי', 'רגשית', 'רגשיים', 'רגשיות', 'שבריריות', 'שברירי', 'שברירית', 'ריחוק', 'פגיעות'].map(norm));

export function isFeelingWord(word: string): boolean {
  const w = norm(word);
  if (w.length < 2) return false;
  if (!HEBREW.test(w)) {
    const f = formsOf(w);
    return FEELINGS.some((e) => !HEBREW.test(e) && (f.long.has(e) || e === w));
  }
  if (FEELING_HOMOGRAPHS.has(w)) return false;
  const bases = [w];
  if (w.length >= 3 && PREFIX.has(w[0])) bases.push(w.slice(1));
  if (w.length - 2 >= 4 && PREFIX.has(w[0]) && PREFIX.has(w[1])) bases.push(w.slice(2));
  for (const b of [...bases]) if (/^(מת|הת|נת)/.test(b) && b.length - 2 >= 4) bases.push(b.slice(2));
  if (bases.some((b) => EXACT_FEELINGS.has(b))) return true;
  return bases.some((b) => endingsOff(b).some((k) => FEELING_KEYS.has(k) && (k.length >= 3 || b.length <= 4)));
}

/** Hedges that make a sentence a possibility. */
const TENTATIVE = ['אולי', 'ייתכן', 'יתכן', 'אפשר', 'אפשרות', 'perhaps', 'maybe', 'might', 'could', 'possibly'].map(norm);
/** Every sentence of `text` opens (within its first six words) with a hedge. */
export function everySentenceTentative(text: string): boolean {
  const sentences = text.split(/(?<=[.!?])\s+/u).map((s) => s.trim()).filter((s) => words(s).length > 0);
  return sentences.length > 0 && sentences.every((s) => words(s).slice(0, 6).some((w) => TENTATIVE.includes(norm(w)) || TENTATIVE.some((t) => norm(w).endsWith(t) && norm(w).length <= t.length + 1) || /^(יכול|one way)/.test(w)));
}

// ------------------------------------------------------------------------------------------------ the dreamer's first person

const FIRST_PERSON = new Set(
  ['אני', 'אנחנו', 'שלי', 'שלנו', 'לי', 'לנו', 'אותי', 'אותנו', 'אליי', 'אלי', 'אלינו', 'עליי', 'עלי', 'עלינו', 'ממני', 'מאיתנו', 'בי', 'איתי', 'איתנו', 'אצלי', 'אצלנו', 'בשבילי', 'אחריי', 'אחרינו', 'לפניי', 'מולי', 'i', "i'm", 'me', 'my', 'mine', 'we', 'us', 'our', 'myself'].map(norm),
);
/** Nouns that end like a first-person verb ("…תי") but are not one. */
const TI_NOUNS = new Set(['אחותי', 'דודתי', 'חברתי', 'סבתי', 'ביתי', 'שמלתי', 'מיטתי', 'אמיתי', 'ילדותי', 'משפחתי', 'כיתתי', 'מורתי', 'אשתי', 'בתי', 'מתי', 'באמת', 'בלתי', 'בשתי', 'לשתי', 'ושתי', 'שגרתי', 'מסורתי', 'תרבותי', 'חגיגתי', 'אישיותי', 'בריאותי', 'מקצועיותי'].map(norm));
// also "אינו" (is not) and third-person plurals whose root ends in נ ("נתנו" is "they gave" as well as "we gave")
const NU_WORDS = new Set(['אנחנו', 'שלנו', 'לנו', 'אותנו', 'איתנו', 'עלינו', 'אלינו', 'ממנו', 'בנו', 'אצלנו', 'לפנינו', 'אחרינו', 'בשבילנו', 'כמונו', 'מאיתנו', 'ביננו', 'בינינו', 'אינו', 'שאינו', 'ואינו', 'איננו', 'שאיננו', 'נתנו', 'שנתנו', 'ונתנו', 'הבינו', 'הכינו', 'שהבינו'].map(norm));
/** Family words with the first-person ending, and their neutral form. */
const KIN: Record<string, string> = { אחי: 'האח', אחותי: 'האחות', אמי: 'האם', אבי: 'האב', בני: 'הבן', בתי: 'הבת', בעלי: 'הבעל', אשתי: 'האישה', סבתי: 'הסבתא', סבי: 'הסבא', דודי: 'הדוד', דודתי: 'הדודה', חברי: 'החבר', חברתי: 'החברה' };
const KIN_N = new Map(Object.entries(KIN).map(([k, v]) => [norm(k), v]));

const stripConj = (w: string) => {
  let cur = norm(w);
  for (let i = 0; i < 2 && cur.length > 3 && /^[ושכ]/.test(cur); i++) cur = cur.slice(1);
  return cur;
};

/** A Hebrew past-tense verb in the first person ("עמדתי", "הלכנו"), with an attached ו / ש / כש. */
export function isFirstPersonVerb(word: string): boolean {
  const w = norm(word);
  if (!HEBREW.test(w) || TI_NOUNS.has(w) || NU_WORDS.has(w) || TI_NOUNS.has(stripConj(w)) || NU_WORDS.has(stripConj(w))) return false;
  for (const form of [w, stripConj(w)]) {
    // "…ותי" is an adjective ("משמעותי", "איכותי"), not "I did"
    if (form.length >= 4 && form.endsWith('תי') && !TI_NOUNS.has(form) && !(form.length >= 5 && form.endsWith('ותי'))) return true;
    if (form.length >= 4 && form.endsWith('נו') && !NU_WORDS.has(form)) return true;
  }
  return false;
}

/** A first-person word: pronoun, possessive, a family word with "my", or a first-person verb. */
export function isFirstPersonWord(word: string): boolean {
  const w = norm(word);
  return FIRST_PERSON.has(w) || FIRST_PERSON.has(stripConj(w)) || KIN_N.has(w) || KIN_N.has(stripConj(w)) || isFirstPersonVerb(w);
}

/** The first-person words of a text outside its quotations (where the dreamer's own sentence was copied instead of given back). */
export const firstPersonOutsideQuotes = (text: string) => words(withoutQuotes(text)).filter(isFirstPersonWord);

/**
 * A second-person verb or subject ("הלכת", "נתתם", "את" before a verb, "you"). `asInDream` is the same verb as the dream wrote it:
 * a form identical to the dream's, or one ending in ת as the dream's does ("נסגרת" / "הולכת" of a third person), is not "you".
 */
export function isSecondPersonForm(word: string, previous: readonly string[], asInDream = ''): boolean {
  const w = norm(word);
  if (previous.slice(-2).some((p) => ['את', 'אתה', 'אתם', 'אתן', 'you'].includes(norm(p)))) return true;
  if (!HEBREW.test(w)) return false;
  const f = stripConj(w);
  const d = stripConj(norm(asInDream));
  if (d && (f === d || (f.endsWith('ת') && d.endsWith('ת')))) return false;
  return (f.length >= 4 && (f.endsWith('תמ') || f.endsWith('תנ'))) || (f.length >= 3 && f.endsWith('ת') && !f.endsWith('ות'));
}

/** Kinship and "my" made neutral, first-person words dropped: a label or a fallback that speaks to no one in the first person. */
export function neutralizeFirstPerson(text: string): string {
  const out: string[] = [];
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const bare = w.replace(/[.,!?;:"«»]/g, '');
    const n = norm(bare);
    if (KIN_N.has(n)) out.push(KIN_N.get(n) as string);
    else if (isFirstPersonWord(bare)) continue;
    else out.push(bare);
  }
  return out.join(' ');
}

/** The content words of a text (no function words, no first-person pronouns), in order. */
export function contentWords(text: string): string[] {
  return words(text).filter((w) => !isStop(w) && !isNegation(w) && !FIRST_PERSON.has(norm(w)) && norm(w).length >= 2);
}

/** Share of `a`'s content words that also appear in `b` (0..1). */
export function overlap(a: string, b: string): number {
  const mine = contentWords(a);
  if (!mine.length) return 0;
  const theirs = contentWords(b);
  return mine.filter((w) => inWords(w, theirs)).length / mine.length;
}

/** "I don't know" and its kin: an answer that says nothing about the moment (and is never treated as if it did). */
export const UNSURE = /^\s*(?:אני\s+)?(?:לא\s+(?:יודע|יודעת|בטוח|בטוחה|זוכר|זוכרת)|אין\s+לי\s+(?:מושג|מה\s+לומר|מה\s+להגיד)|לא\s+עולה\s+לי\s+כלום|(?:i\s+)?don'?t\s+know|not\s+sure|no\s+idea|nothing(?:\s+comes(?:\s+to\s+mind)?)?|i\s+can'?t\s+say)(?:\s+מה\s+(?:לומר|להגיד))?\s*[.!…]*\s*$/i;
export const isUnsureAnswer = (answer: string | null | undefined) => typeof answer === 'string' && UNSURE.test(answer.trim());
