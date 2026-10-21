import type { AppLanguage } from './appLanguage.js';
import type { EmotionId } from './dreamEmotions.js';
import { mentionsUnlistedFeeling } from './dreamEmotions.js';
import { sharesContentWord, usesWordOfButNot } from './groundedText.js';

/**
 * Deterministic quality checks for the generated questions and reflection. None of them calls a model, none rewrites a word: a failed
 * check returns a short correction note, and the route asks for a fresh response with that note (see `qualityCheck` in languageGuard.ts:
 * the last attempt is accepted as it is, so a quality check can never turn a usable answer into an error).
 *
 * They are honest about what they can do. They catch a known list of insertions and wordings with high precision; they cannot prove that
 * a sentence is faithful to the dream, so a new kind of invented detail can still get through.
 */

const HEB = '\\u0590-\\u05FF';
// Only the prefixes that attach to a verb or an adjective (and, that, when): "בלבד" and "מלבד" must not read as "לבד".
const PREFIXES = '(?:ו|ש|וש|כש)?';
const QUOTED = /["“”«»][^"“”«»]*["“”«»]/g;

/** Words a model tends to ADD to a dream: a circumstance, a motive, an intention, an expectation, a feeling of the dreamer's. Only flagged when neither the dream nor the dreamer's own words use them. */
const HEBREW_INSERTIONS = [
  'לבד', 'פתאום', 'בפתאומיות', 'מיד', 'מייד', 'בהפתעה', 'בכוונה', 'התכוונת', 'רצית', 'ציפית', 'תכננת', 'החלטת', 'קיווית',
  'פחדת', 'חששת', 'כעסת', 'התגעגעת', 'התבלבלת', 'נבהלת', 'שמחת', 'התרגשת', 'נעלבת', 'התאכזבת', 'הצטערת', 'התביישת', 'הופתעת', 'נלחצת',
  'מתוסכלת', 'מתוסכל', 'בודדה', 'בודד', 'מפוחדת', 'מפוחד', 'כועסת', 'כועס',
];

/** Feeling states named as nouns ("תחושת בדידות", "לתסכול") that the dreamer never gave. Any of the usual prefixes may attach (ה ב ל מ כ ו ש). */
const HEBREW_FEELING_NOUNS = ['תסכול', 'אכזבה', 'בדידות', 'חרדה', 'חשש', 'אשמה', 'בושה', 'ייאוש', 'קנאה', 'מבוכה', 'חרטה', 'בהלה'];
const ENGLISH_INSERTIONS = [
  'alone', 'suddenly', 'immediately', 'unexpectedly', 'deliberately', 'on purpose', 'intended', 'wanted', 'expected', 'planned', 'decided', 'hoped',
  'afraid', 'scared', 'angry', 'ashamed', 'excited', 'relieved', 'disappointed', 'frustrated', 'lonely', 'anxious', 'terrified',
  'loneliness', 'frustration', 'disappointment', 'anxiety', 'guilt', 'shame', 'despair', 'jealousy', 'embarrassment', 'regret', 'panic',
];

const hebrewPattern = (w: string, broadPrefixes = false) => new RegExp(`(?<![${HEB}])${broadPrefixes ? '[ובכלמשה]{0,2}' : PREFIXES}${w}(?![${HEB}])`);
const englishPattern = (w: string) => new RegExp(`(?<![A-Za-z])${w}(?![A-Za-z])`, 'i');

const stripQuotes = (t: string) => t.replace(QUOTED, ' ');

/**
 * Words that attribute to the dreamer something nobody told us ("alone", "suddenly", "intended", "wanted", "were afraid", ...). A word is
 * flagged only when it appears in the generated text, outside quotation marks, and NOT in the material that text may draw on (the dream, the
 * moments, the dreamer's own answers). Returns the correction note, or null.
 */
export function unsupportedInsertionNote(texts: readonly string[], sources: readonly string[], language: AppLanguage | null): string | null {
  const source = sources.join('\n');
  const he = language === 'he';
  const list = he ? [...HEBREW_INSERTIONS, ...HEBREW_FEELING_NOUNS] : ENGLISH_INSERTIONS;
  const make = (word: string) => (he ? hebrewPattern(word, HEBREW_FEELING_NOUNS.includes(word)) : englishPattern(word));
  const found = new Set<string>();
  for (const word of list) {
    const pattern = make(word);
    // The dream or the dreamer used it (also in the first person: "פחדת" is covered by "פחדתי").
    if (pattern.test(source) || (he && hebrewPattern(word + '(?:י|נו)', HEBREW_FEELING_NOUNS.includes(word)).test(source))) continue;
    if (texts.some((t) => pattern.test(stripQuotes(t)))) found.add(word);
  }
  if (found.size === 0) return null;
  return `\n\nCORRECTION: your previous attempt used wording that the dream and the dreamer's own words do not support: ${[...found].map((w) => `"${w}"`).join(', ')}. Do not add that the dreamer was alone, did something suddenly, intended, wanted, expected or planned anything, or felt anything they did not name. Regenerate the entire response using only what the dream and the dreamer's own words state.`;
}

const SYMBOL_HE = new RegExp(`(?<![${HEB}])${PREFIXES}(?:מסמל|מסמלת|מסמלים|מסמלות|מסמן|מסמנת|מסמנים|מסמנות|מייצג|מייצגת|מייצגים|מייצגות|ייצג|ייצגה|ייצגו|סימל|סימלה|סימלו|סמל|סמלית)(?![${HEB}])`);
const SYMBOL_EN = /(?<![A-Za-z])(?:symbolizes?|symbolises?|symbolizing|represents?|representing|stands? for|signifies|signify)(?![A-Za-z])/i;

/** An object or event "symbolizes" or "represents" something: the fixed-meaning wording this product never uses outside the one lens that is labelled as such. */
export function symbolWordingNote(texts: readonly string[], language: AppLanguage | null): string | null {
  const pattern = language === 'he' ? SYMBOL_HE : SYMBOL_EN;
  if (!texts.some((t) => pattern.test(stripQuotes(t)))) return null;
  return '\n\nCORRECTION: your previous attempt said that something in the dream "symbolizes" or "represents" something ("מסמל", "מייצג", "symbolizes", "represents"). Never give an object or event a fixed meaning. Start from what the dreamer did or what happened, and offer only a possibility ("אולי", "ייתכן", "perhaps"). Regenerate the entire response.';
}

const HEDGE_HE = new RegExp(`(?<![${HEB}])(?:אולי|ייתכן|יתכן|נראה ש|נדמה|אפשר לראות|אפשר לחשוב|אפשר לקרוא|אפשר להסתכל|אפשר לשאול|משקף|משקפת|מעיד|מעידה|מרמז|מרמזת|מצביע|מצביעה|קשור ל|מתחבר ל)`);
const HEDGE_EN = /(?<![A-Za-z])(?:perhaps|maybe|might|may|possibly|could be|seems?|suggests?|reflects?|indicates?|one (?:possible )?(?:way|thread|reading)|it is possible|can be (?:seen|read))(?![A-Za-z])/i;

/** The five lines have distinct jobs: the first only DESCRIBES the dream (no hedging, no interpretation), the thread OFFERS a possibility (always hedged). */
export function descriptionVersusInterpretationNote(
  result: { observation: string; possibleThread: string },
  language: AppLanguage | null,
): string | null {
  const hedge = language === 'he' ? HEDGE_HE : HEDGE_EN;
  const problems: string[] = [];
  if (hedge.test(stripQuotes(result.observation))) problems.push('the observation interprets or hedges: it must only DESCRIBE what is in the dream, in plain statements, with no "perhaps", "seems" or "reflects"');
  if (!hedge.test(stripQuotes(result.possibleThread))) problems.push('the possible thread is stated as a fact: it must be offered as a possibility ("אולי", "ייתכן", "אפשר לראות", "perhaps", "one possible thread")');
  if (problems.length === 0) return null;
  return `\n\nCORRECTION: ${problems.join('; and ')}. Regenerate the entire response keeping the two apart.`;
}

/** Hebrew vowel points (the model once wrote "מַעֵרֵב"), an immediately repeated word, and a Latin letter glued to a Hebrew word: signs of garbled text. */
export function garbledTextNote(texts: readonly string[]): string | null {
  const bad = texts.some(
    (t) => /[ְ-ׇ]/.test(t) || /(?<![֐-׿])([֐-׿]{3,})\s+\1(?![֐-׿])/.test(t) || /[֐-׿][A-Za-z]|[A-Za-z][֐-׿]/.test(t),
  );
  if (!bad) return null;
  return '\n\nCORRECTION: your previous attempt contained garbled text (vowel points, a repeated word, or letters of another script inside a word). Regenerate the entire response in plain, correctly spelled everyday language.';
}

/**
 * A feeling (one of the twelve the dreamer could have named) that the text attributes to the dreamer although they did not name it and
 * neither the dream nor their own words use that exact word. The existing optional feelings text already drops such a mention; this asks
 * the main lines for the same discipline.
 */
export function attributedFeelingNote(
  texts: readonly string[],
  named: readonly EmotionId[],
  sources: readonly string[],
  language: 'en' | 'he',
): string | null {
  const source = sources.join('\n');
  const flagged = texts.filter((t) => mentionsUnlistedFeeling(stripQuotes(t), named, language) && !mentionsUnlistedFeeling(source, named, language));
  if (flagged.length === 0) return null;
  return '\n\nCORRECTION: your previous attempt named a feeling that the dreamer did not name and that neither the dream nor their own words mention. Name only the feelings listed in the input or words the dreamer used, and attribute them to the dreamer\'s own report. Regenerate the entire response.';
}

/**
 * A question that could be about any dream: it must share a word with the moment it is about AND name at least one more concrete thing from
 * the dream (so "what comes up when you think about the station?" alone is refused). `genericQuestion` is true when it fails that.
 */
export function isGenericQuestion(question: string, moment: string, dreamText: string): boolean {
  return !(sharesContentWord(question, moment) && namesDetailBeyond(question, moment, dreamText));
}

/** True when the question uses a word of the dream that does not belong to the moment's own label. */
export function namesDetailBeyond(question: string, moment: string, dreamText: string): boolean {
  return usesWordOfButNot(question, dreamText, moment);
}

/** True when a link question adds a dream detail that the association question did not already mention (otherwise it only repeats it). */
export function linkAddsSomethingNew(link: string, association: string, moment: string, dreamText: string): boolean {
  return usesWordOfButNot(link, dreamText, `${moment} ${association}`);
}
