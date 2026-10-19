/**
 * A cheap, deterministic grounding check: does a generated line share at least one meaningful word with the material it is
 * supposed to be about (the dream, the chosen element, the dreamer's own answers)? It cannot prove a line is faithful, but it does
 * catch a line that is about nothing in this dream, which is the failure these questions and readings must never show.
 * Hebrew-aware: leading one-letter prefixes (ה ו ב ל מ ש כ) are ignored and words that share their first four letters match, so
 * "המדרגות" matches "מדרגה". No language model is involved.
 */

const STOPWORDS = new Set([
  'של', 'עם', 'את', 'מה', 'על', 'זה', 'זאת', 'הוא', 'היא', 'אני', 'אתה', 'אבל', 'כמו', 'גם', 'אם', 'כי', 'לא', 'יש', 'אין', 'כל', 'עוד', 'אל', 'מן', 'אפשר', 'עולה', 'עכשיו', 'בחלום', 'החלום', 'רגע', 'שלך', 'שלי', 'שלנו', 'שלו', 'שלה', 'עליך', 'עליי', 'אליך', 'אותך', 'אותי', 'אחרי', 'לפני', 'אחת', 'אחד', 'בין',
  'the', 'and', 'with', 'that', 'this', 'what', 'when', 'your', 'you', 'about', 'does', 'for', 'from', 'was', 'were', 'are', 'there', 'have', 'dream', 'moment', 'now',
]);

const HEBREW_PREFIXES = new Set(['ה', 'ו', 'ב', 'ל', 'מ', 'ש', 'כ']);

function stem(word: string): string {
  let w = word;
  // Up to two stacked prefixes ("ובמדרגות", "שהמדרגות"), only while a real word of 3+ letters remains.
  for (let i = 0; i < 2 && w.length > 3 && HEBREW_PREFIXES.has(w[0]); i += 1) w = w.slice(1);
  return w;
}

/** Each content word as its raw form and its prefix-stripped form: a leading letter is sometimes a prefix and sometimes the root ("מדרגות"). */
function contentForms(text: string): string[][] {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return words.map((w) => [...new Set([w, stem(w)])].filter((f) => f.length >= 3 && !STOPWORDS.has(f)));
}

function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  return a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4);
}

/**
 * True when `text` uses a word that belongs to `include` but not to `exclude` (same matching as everywhere here: three-letter words and
 * Hebrew prefixes included). "Does this question name another detail of the dream, one that is not already the moment itself?"
 */
export function usesWordOfButNot(text: string, include: string, exclude: string): boolean {
  const mine = contentForms(text);
  const inc = contentForms(include);
  const exc = contentForms(exclude);
  const matches = (forms: string[], pool: string[][]) => pool.some((other) => forms.some((x) => other.some((y) => sameWord(x, y))));
  return mine.some((forms) => matches(forms, inc) && !matches(forms, exc));
}

/**
 * True when `text` names BOTH things: it shares a content word with `first`, and a different content word (one that does not also
 * match `first`) with `second`. Used to check that a link question really names two things from the dream and not just one.
 */
export function namesBoth(text: string, first: string, second: string): boolean {
  const mine = contentForms(text);
  const a = contentForms(first);
  const b = contentForms(second);
  const matches = (forms: string[], pool: string[][]) => pool.some((other) => forms.some((x) => other.some((y) => sameWord(x, y))));
  const aWords = mine.filter((forms) => matches(forms, a));
  const bWords = mine.filter((forms) => matches(forms, b) && !matches(forms, a));
  return aWords.length > 0 && bWords.length > 0;
}

/**
 * True when (almost) every meaningful word of `text` is a word of the `sources`: used for the short "basis" the model copies from the dream
 * (at most about ten words), where a word that is not in the dream or the dreamer's answers means the model is no longer quoting.
 * At least 70% of the words must match, so one inflection the matcher cannot see does not sink a faithful quote.
 */
export function mostlyGrounded(text: string, ...sources: (string | null | undefined)[]): boolean {
  const mine = contentForms(text);
  if (mine.length === 0) return false;
  const theirs = sources.flatMap((s) => (typeof s === 'string' ? contentForms(s) : []));
  const matched = mine.filter((forms) => theirs.some((other) => forms.some((a) => other.some((b) => sameWord(a, b))))).length;
  return matched / mine.length >= 0.7;
}

/** True when `text` has at least one content word in common with any of `sources`. */
export function sharesContentWord(text: string, ...sources: (string | null | undefined)[]): boolean {
  const mine = contentForms(text);
  if (mine.length === 0) return false;
  const theirs = sources.flatMap((s) => (typeof s === 'string' ? contentForms(s) : []));
  return mine.some((forms) => theirs.some((other) => forms.some((a) => other.some((b) => sameWord(a, b)))));
}
