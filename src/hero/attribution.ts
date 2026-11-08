import type { AppLanguage } from './appLanguage.js';

/**
 * NOTHING ATTRIBUTED TO HER THAT SHE DID NOT TELL (2026-11-07). A sentence of DARE that states, as a fact about her, something she did not do
 * ("לא ויתרת", "בלי לגעת בה", "you didn't feel uneasy"), a knowing, deciding or choosing she never reported ("ידעת שאין שם", "כשוויתרת על…"),
 * asks the model ONCE for a fresh answer (attributionNote). Nothing found here is ever removed from what she sees: a word cannot be sure, so
 * when the fresh answer still has it, it is shown as it is (her decision, 2026-11-08). This is not a list of banned words:
 *   - only statements ABOUT HER in the second person count (her experience, never the dream's events or DARE's own ideas);
 *   - a sentence worded as a possibility (אולי, ייתכן, נראה ש, נשמע, maybe, perhaps…) or asked as a question is a hypothesis, and always stays;
 *   - a claim she supports in her own words, or that the dream itself says, stays ("לא פתחת אותה" when the dream says "לא פתחתי אותה").
 * Support is read by the verb's letters, not its exact form, so "המשכת" is supported by "המשכתי" and "לפתוח" by "פתחתי".
 *
 * A possibility is not a free pass either (2026-11-07): worded as "אולי" or not, a sentence may not bring in a person of her life, a past of hers,
 * a place of her life or a motive she never mentioned ("אולי זה קשור לאמא שלך", "כשהיית ילדה", "כי פחדת"). A new reading of the dream's own
 * images stays welcome: only these four kinds of invented facts are looked for. A question asks; it states nothing, and is never one.
 */

const HEDGE =
  /(?<![א-ת])(?:ו?אולי|ייתכן|יתכן|יכול\s+להיות|יכולה\s+להיות|אפשר\s+(?:לחשוב|לראות|לדמיין|ש)|נראה\s+ש|נשמע|מעניין\s+אם|כאילו|אם\s+(?:זה|יש))(?![א-ת])|\b(?:maybe|perhaps|might|could|possibly|wonder|seems?|sounds?|as\s+if|as\s+though)\b|\?/i;

// The letters of a Hebrew word without its vowel letters inside, and without a past-tense ending: "ויתרתי", "וויתרת" and "לוותר" all read "ותר".
const skeleton = (w: string) => {
  const core = w.replace(/[^א-ת]/g, '').replace(/(?:תי|תם|תן|ת|נו)$/, '');
  return core ? core[0] + core.slice(1).replace(/[וי]/g, '') : '';
};
const PREFIX = /^(?:ו|ש|כש|וכש|ול|ה|ב|ל|מ)(?=[א-ת]{3,})/;
const heWords = (t: string) => (t.match(/[א-ת]+/g) ?? []);

function supportedHe(verb: string, pool: readonly string[], infinitive = false): boolean {
  // a leading ו or ש may be a prefix ("וחיכית") or the verb's own first letter ("ויתרת"): both readings are tried
  const bare = verb.length > 4 ? verb.replace(/^(?:ו|ש|כש)(?=[א-ת]{3,})/, '') : verb;
  if (bare !== verb && supportedHe(bare, pool, infinitive)) return true;
  let stem = verb;
  if (infinitive) stem = stem.replace(/^ל/, '');
  const s = skeleton(stem);
  // two letters are too few to search inside other words: a word with exactly these letters, or the root with its usual third letter
  // (and the root that starts with י: "לדעת" is supported by "יודעת", "לשבת" by "ישבתי", 2026-11-08)
  const candidates = s.length >= 3 ? [s] : s.length === 2 ? [`נ${s}`, `${s}ע`, `${s}ה`, `י${s}`] : [];
  if (!candidates.length) return true; // too short to judge: never a reason to drop a sentence
  return pool.some((t) =>
    heWords(t).some((w) => {
      const k = skeleton(w.replace(PREFIX, ''));
      const full = skeleton(w);
      return (s.length === 2 && (k === s || full === s)) || candidates.some((c) => k.includes(c) || full.includes(c));
    }),
  );
}

// a negated verb of hers in the second person past ("לא ויתרת", "שלא נגעת"), with at most one word between
const HE_NEGATED = /(?<![א-ת])(?:ו|ש|כש)?(?:לא|לא\s+ממש|אף\s+פעם\s+לא)\s+(?:(?:באמת|בכלל|עדיין|אז|ממש)\s+)?([א-ת]{3,7}ת)(?![א-ת])(?:\s+(ל[א-ת]{3,8})(?![א-ת]))?/g;
// a present-tense form ("דירה לא מוכרת") describes a thing, and an infinitive ("לא צריך לדעת") is no act at all: neither is a past act of hers
const PARTICIPLE = /^מ[א-ת]{4,}$/;
const INFINITIVE = /^ל[א-ת]{3,}$/;
// a passive present form ("והסיבה לא נפתרת") says something about a thing; it reads like a past verb of hers, so it is never judged
const PASSIVE = /^ו?נ[א-ת]{3}ת$/;
// "בלי לוותר", "מבלי לגעת": an action she did not do, said as hers
const HE_WITHOUT = /(?<![א-ת])(?:ו?מבלי|ו?בלי)\s+(ל[א-ת]{3,8})(?![א-ת])/g;
// knowing, deciding, giving up or fearing, said as hers in the second person past ("ידעת ש", "החלטת", "כשוויתרת")
const HE_STATE = /(?<![א-ת])(?:ו|ש|כש)?(ידעת|החלטת|ויתרת|וויתרת|התייאשת|פחדת|נבהלת|נרגעת|הבנת|רצית|כעסת|נעלבת|נפגעת|התאכזבת|נלחצת|חששת|התביישת|התגעגעת|הצטערת|קינאת)(?![א-ת])/g;
// a feeling said as hers with "היית" ("היית עצובה", 2026-11-08): the adjective must come from her words
const HE_FELT = /(?<![א-ת])(?:ו|ש|כש)?היית\s+(?:כל\s+כך\s+|ממש\s+|קצת\s+)?(עצובה|עצוב|כועסת|כועס|מפוחדת|מפוחד|לחוצה|לחוץ|בודדה|בודד|מאוכזבת|מאוכזב|נבוכה|נבוך|מבוהלת|מבוהל|פגועה|פגוע)(?![א-ת])/g;

// English: "you didn't feel", "you never wanted", "without giving up", "you knew", "you chose to"
const EN_NEGATED = /\byou\s+(?:didn['’]t|did\s+not|never|weren['’]t|were\s+not)\s+(?:really\s+|even\s+)?(\w+)/gi;
const EN_WITHOUT = /\bwithout\s+(\w+ing)\b/gi;
const EN_STATE = /\byou\s+(knew|decided|chose|gave\s+up|were\s+afraid|wanted|felt\s+(?:no|nothing))\b/gi;
const lemma = (w: string) => w.toLowerCase().replace(/['’]/g, '').replace(/(?:ing|ed|es|s)$/, '').replace(/(.)\1$/, '$1').replace(/e$/, '');
const EN_IRREGULAR: Record<string, string[]> = { knew: ['know', 'knew'], chose: ['choose', 'chose'], felt: ['feel', 'felt'], gave: ['give', 'gave'], were: ['was', 'were', 'be'], kept: ['keep', 'kept'], left: ['leave', 'left'] };
function supportedEn(word: string, pool: readonly string[]): boolean {
  const w = word.toLowerCase().split(/\s+/)[0];
  const forms = new Set([lemma(w), ...(EN_IRREGULAR[w] ?? []).map(lemma)]);
  if ([...forms].every((f) => f.length < 3)) return true;
  return pool.some((t) => (t.toLowerCase().match(/[a-z'’]+/g) ?? []).some((x) => forms.has(lemma(x)) || [...forms].some((f) => f.length >= 4 && lemma(x).startsWith(f))));
}

/** The words of hers (and of the dream) that make a claim hers. A quote of hers inside DARE's sentence is hers too. */
export interface AttributionContext {
  herWords: readonly string[];
  sourceText: string;
  language: AppLanguage;
  /** DARE's questions she answered with a no ("הספקת לבקש?" — "לא"): her no makes the negated claim hers. */
  answeredNo?: readonly string[];
}

// a person of her life: "אמא שלך", "אחיך", "your mother"
const HE_PERSON = /(?<![א-ת])(?:וכש|כש|ו|ש|ל|ב|מ|ה)?(אמא|אבא|סבתא|סבא|אח|אחות|בן\s+זוג|בת\s+זוג|בעל|אישה|חבר|חברה|ילדים|ההורים|הורים|הבוס|בוס|מנהלת|מנהל|מורה|משפחה)\s+שלך(?![א-ת])|(?<![א-ת])(?:ו|ש|ל|ב|מ)?(אמך|אמך|אביך|אחיך|אחותך|הורייך|הוריך|משפחתך|ילדייך|ילדיך|בעלך|חברתך|חברך|סבתך)(?![א-ת])/g;
// a past or a place of her life: "כשהיית ילדה", "בילדותך", "בעבודה שלך", "בזוגיות"
const HE_LIFE = /(?<![א-ת])(?:ו|ש)?(?:כשהיית|בתור)\s+(ילדה|ילד|קטנה|קטן|צעירה|צעיר|נערה|נער)(?![א-ת])|(?<![א-ת])(?:ו|ש|מ|ב)?(ילדותך|ילדות\s+שלך|עבודה\s+שלך|העבודה\s+שלך|זוגיות\s+שלך|הזוגיות\s+שלך|הבית\s+שלך)(?![א-ת])|(?<![א-ת])(?:ו)?(בעבודה|בזוגיות|בילדות)(?![א-ת])/g;
// a motive of hers: "כי פחדת", "בגלל שרצית", "because you were afraid"
const HE_MOTIVE = /(?<![א-ת])(?:כי|בגלל\s+ש|מפני\s+ש|משום\s+ש)\s*(?:את\s+|אתה\s+)?(רצית|פחדת|חששת|ניסית|הרגשת|התביישת|כעסת)(?![א-ת])/g;
const EN_PERSON = /\byour\s+(mother|mom|mum|father|dad|partner|husband|wife|boss|family|kids|children|friend|sister|brother|grandmother|grandma|grandfather|grandpa|parents)\b/gi;
const EN_LIFE = /\b(?:when\s+you\s+were\s+(?:a\s+)?(child|kid|little|young|girl|boy)|in\s+your\s+(childhood|past|relationship|marriage)|at\s+your\s+(work|job)|your\s+(job|relationship|marriage|childhood))\b/gi;
const EN_MOTIVE = /\bbecause\s+you\s+(wanted|were\s+afraid|feared|needed|felt|tried)\b/gi;
const has = (word: string, pool: readonly string[]) => pool.some((t) => t.includes(word));
const firstGroup = (m: RegExpMatchArray) => m.slice(1).find(Boolean) ?? m[0];

// an event of her life she never told, even inside a possibility (2026-11-08): someone acting on her ("מישהו כעס עלייך"), an occasion of
// hers ("לפעם שבה הלכת לאיבוד"), something that happened to her ("קרה לך", "בעבר")
const HE_ACTED_ON_HER = /(?<![א-ת])(?:ו|ש|כש)?(?:מישהו|מישהי|אנשים|מישהו\s+קרוב|מישהו\s+אחר)\s+(?:פעם\s+)?([א-ת]{2,7})\s+(?:עלייך|עליך|אלייך|אליך|אותך|לך|בך|ממך)(?![א-ת])/g;
const HE_OCCASION = /(?<![א-ת])(?:ל|ב|ו)?פעם\s+(?:אחת\s+)?(?:ש|שבה|שבו)\s*([א-ת]{3,7}ת)(?![א-ת])/g;
// she told of a past of hers: "קרה לי", "בעבר", "פעם הייתי" (not "אף פעם לא")
const HER_PAST_TOLD = /(?<![א-ת])(?:קרה|קרתה|קרו)s+(?:גםs+)?לי(?![א-ת])|(?<![א-ת])ו?בעבר(?![א-ת])|(?<![א-ת])(?<!אףs)פעםs+(?!לא(?![א-ת]))[א-ת]/;
const HE_HAPPENED = /(?<![א-ת])(?:ו|ש)?(?:קרה|קרתה|קרו)\s+לך(?![א-ת])|(?<![א-ת])(?:ו|ש)?בעבר(?![א-ת])/g;
const EN_EVENT = /\b(?:someone|somebody|people)\s+(?:once\s+)?(\w+)\s+(?:at\s+|to\s+|on\s+)?you\b|\b(?:once|in\s+the\s+past),?\s+you\s+(\w+)|\bsomething\s+(?:like\s+this\s+|similar\s+)?(happened)\s+to\s+you\b/gi;

/**
 * A person, a past, a place, an event of her life or a motive she never mentioned: an invented fact, even inside a possibility. Null when
 * there is none. A question asks and is not judged here, except with `strict` (a question kept from an answer that was set aside, which may
 * itself take for granted what she never told: "מה הרגשת כשאבא שלך כעס?").
 */
export function inventedLifeDetail(sentence: string, ctx: AttributionContext, strict = false): string | null {
  const s = sentence.replace(/«[^»]*»|"[^"]*"|“[^”]*”/g, ' ');
  if (!strict && s.includes('?')) return null;
  const pool = [...ctx.herWords, ctx.sourceText].filter(Boolean);
  for (const m of s.matchAll(HE_ACTED_ON_HER)) if (!supportedHe(m[1], pool)) return m[0].trim();
  for (const m of s.matchAll(HE_OCCASION)) if (!supportedHe(m[1], pool)) return m[0].trim();
  // "מה קרה לך שם?" or "האם קרה לך פעם…?" asks whether: only a statement says it happened
  if (!s.includes('?')) for (const m of s.matchAll(HE_HAPPENED)) if (!pool.some((t) => HER_PAST_TOLD.test(t))) return m[0].trim();
  for (const m of s.matchAll(EN_EVENT)) if (!supportedEn(firstGroup(m), pool)) return m[0].trim();
  for (const m of s.matchAll(HE_PERSON)) {
    const who = firstGroup(m).replace(/ך$/, '').replace(/^(?:ה)/, '');
    if (!has(who.slice(0, 3), pool)) return m[0].trim();
  }
  for (const m of s.matchAll(HE_LIFE)) if (!supportedHe(firstGroup(m).split(/\s+/)[0].replace(/ך$/, '').replace(/^ב/, ''), pool)) return m[0].trim();
  for (const m of s.matchAll(HE_MOTIVE)) if (!supportedHe(m[1], pool)) return m[0].trim();
  for (const m of s.matchAll(EN_PERSON)) if (!pool.some((t) => new RegExp(`\\b${m[1]}`, 'i').test(t))) return m[0].trim();
  for (const m of s.matchAll(EN_LIFE)) if (!supportedEn(firstGroup(m), pool)) return m[0].trim();
  for (const m of s.matchAll(EN_MOTIVE)) if (!supportedEn(m[1], pool)) return m[0].trim();
  return null;
}

/** The phrase that attributes to her something she did not tell, or null. A question is never one; a possibility may still invent a fact of her life. */
export function unreportedAttribution(sentence: string, ctx: AttributionContext, strict = false): string | null {
  const invented = inventedLifeDetail(sentence, ctx, strict);
  if (invented) return invented;
  const s = sentence.replace(/«[^»]*»|"[^"]*"|“[^”]*”/g, ' ');
  if (!strict && HEDGE.test(s)) return null;
  const pool = [...ctx.herWords, ctx.sourceText, ...(ctx.answeredNo ?? [])].filter(Boolean);
  for (const m of s.matchAll(HE_NEGATED)) {
    if (PARTICIPLE.test(m[1]) || INFINITIVE.test(m[1]) || PASSIVE.test(m[1])) continue;
    // "לא הצלחת להחליט" is hers when she said she never decided: the verb, or the infinitive it governs
    if (!supportedHe(m[1], pool) && !(m[2] && supportedHe(m[2], pool, true))) return m[0].trim();
  }
  for (const m of s.matchAll(HE_WITHOUT)) if (!supportedHe(m[1], pool, true)) return m[0].trim();
  for (const m of s.matchAll(HE_STATE)) if (!supportedHe(m[1], pool)) return m[0].trim();
  for (const m of s.matchAll(HE_FELT)) if (!supportedHe(m[1], pool) && !supportedHe(m[1].replace(/^מ/, ''), pool)) return m[0].trim();
  for (const m of s.matchAll(EN_NEGATED)) if (!supportedEn(m[1], pool)) return m[0].trim();
  for (const m of s.matchAll(EN_WITHOUT)) if (!supportedEn(m[1], pool)) return m[0].trim();
  for (const m of s.matchAll(EN_STATE)) if (!supportedEn(m[1], pool)) return m[0].trim();
  return null;
}

/**
 * DARE never speaks in its own first person about the conversation ("הצעתי", "העליתי", "I suggested"): the brand speaks TO her. Only these few
 * verbs of a conversation's own course are looked for; her own words in a quote, or the same word in her text, never count.
 */
const HE_FIRST = /(?<![א-ת])(?:ו|ש|כש)?(הצעתי|העליתי|שאלתי|הצגתי|ציינתי|תהיתי|הצענו|העלינו|שאלנו)(?![א-ת])|(?<![א-ת])אני\s+(?:מציעה|מציע|שואלת|שואל)(?![א-ת])/;
const EN_FIRST = /\bI\s+(?:suggested|offered|asked|mentioned|raised|proposed|wondered)\b/;
export function dareFirstPerson(sentence: string, herWords: readonly string[]): string | null {
  const s = sentence.replace(/«[^»]*»|"[^"]*"|“[^”]*”/g, ' ');
  const m = HE_FIRST.exec(s) ?? EN_FIRST.exec(s);
  if (!m) return null;
  return herWords.some((t) => t.includes(m[0].trim())) ? null : m[0].trim();
}

/**
 * The correction for a regenerated answer: what was said about her that she never told, DARE's first person, or the content of a work she
 * named told by DARE. Null when nothing was found. Only a request for a fresh answer: the text itself is never cut.
 */
export function attributionNote(texts: readonly string[], ctx: AttributionContext): string | null {
  const sentences = texts.flatMap((t) => t.split(/(?<=[.!?…])\s+|\n+/u)).map((x) => x.trim()).filter(Boolean);
  const claims = sentences.map((x) => unreportedAttribution(x, ctx)).filter((x): x is string => Boolean(x));
  const firsts = sentences.map((x) => dareFirstPerson(x, ctx.herWords)).filter((x): x is string => Boolean(x));
  const works = worksSheNamed(ctx.herWords);
  const told = works.length > 0 && sentences.some((x) => withoutWorkContent(x, works) !== null);
  if (!claims.length && !firsts.length && !told) return null;
  // The guard logs the note's opening words (languageGuard.ts, characters 12–80): they are fixed text, so no word of hers or DARE's is logged.
  return `\n\nCORRECTION: part of your previous attempt did not rest on the dreamer's own words or spoke as DARE itself. ${claims.length ? `your previous attempt stated as the dreamer's something they never told (${[...new Set(claims)].map((c) => `"${c}"`).join(', ')}): a feeling, an act, a motive, a person, a past or a place of their life must come from their own words. A new idea of yours stays welcome, worded as a possibility and resting on the dream's own details. ` : ''}${firsts.length ? `Your previous attempt spoke in DARE's own first person (${[...new Set(firsts)].map((c) => `"${c}"`).join(', ')}): speak TO the dreamer and never about yourself; say "עלתה אפשרות" / "one possibility was" instead. ` : ''}${told ? 'Your previous attempt described what happens in a work the dreamer named: the work is theirs to tell; ask what in it came up for them instead. ' : ''}Regenerate the entire response.`;
}

/**
 * A work she named (a film, a book, a song) is hers to tell: DARE does not describe what happens in it. Returns the sentence without the
 * clause that describes the work ("הזכרת את הסרט 'קארי', שבו קורים דברים מוזרים…" → "הזכרת את הסרט 'קארי'."), or null when there is none.
 */
const HE_WORK = /(?:ה?סרט|ה?ספר|ה?שיר|ה?סדרה|ה?אגדה|ה?הצגה|ה?משחק)\s+(?:של\s+)?["'״׳“]?([א-תA-Za-z][^\s,.!?"'״׳”]*)/g;
const EN_WORK = /\b(?:movie|film|book|song|series|novel|play|game)\s+["'“]?([A-Z][\w'’]*)/g;
/** The names of the works she mentioned, in her own words. */
export function worksSheNamed(herWords: readonly string[]): string[] {
  const out = new Set<string>();
  for (const t of herWords) {
    for (const m of t.matchAll(HE_WORK)) if (m[1].length >= 2) out.add(m[1].replace(/^["'״׳“]|["'״׳”]$/g, ''));
    for (const m of t.matchAll(EN_WORK)) if (m[1].length >= 2) out.add(m[1]);
  }
  return [...out];
}
// the start of a clause that tells what the work is or what happens in it
const HE_CLAUSE = /\s*[,–—-]?\s*(?:שבו|שבה|שבהם|שבהן|שבמהלכו|שעוסק|שעוסקת|שמספר|שמספרת|שם\s+(?:קורים|קורה|יש))(?![א-ת])/;
const EN_CLAUSE = /\s*[,–—-]?\s*\b(?:where|in\s+which|which\s+is\s+about|that\s+is\s+about|about\s+a|about\s+an|about\s+the)\b/i;
export function withoutWorkContent(sentence: string, works: readonly string[]): string | null {
  for (const name of works) {
    const at = sentence.indexOf(name);
    if (at < 0) continue;
    const after = sentence.slice(at + name.length);
    const clause = (/[א-ת]/.test(name) ? HE_CLAUSE : EN_CLAUSE).exec(after);
    // only a clause that starts right after the name (its closing quote and a comma at most)
    if (!clause || clause.index > 3) continue;
    const head = sentence.slice(0, at + name.length + clause.index).replace(/[\s,–—-]+$/, '');
    return `${head}.`;
  }
  return null;
}

/**
 * A question kept from an answer that was set aside (2026-11-08): kept only when it takes nothing for granted that she never told — no
 * person, event, past, motive, act or feeling of hers that is not in her words or the dream. Read strictly: its question mark and an
 * "אולי" inside it excuse nothing. Null when the question is clean.
 */
export function questionTakesForGranted(question: string, ctx: AttributionContext): string | null {
  return unreportedAttribution(question, ctx, true) ?? dareFirstPerson(question, ctx.herWords);
}
