/**
 * The line a moment card shows "from the dream": a sentence taken AS IS from the dreamer's own text, chosen by the words of the moment
 * (the label the analysis gave it in the dream's own language first, then the label shown). Deterministic, no model: when no sentence
 * shares a real word with the moment, there is no excerpt (null), never a written-for-the-card description.
 */

const MAX_EXCERPT_CHARS = 200;

/** Very common words that say nothing about a moment (English and Hebrew). */
const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'was', 'were', 'is', 'are', 'be', 'been',
  'it', 'its', 'that', 'this', 'there', 'then', 'but', 'not', 'my', 'me', 'i', 'he', 'she', 'they', 'his', 'her', 'their', 'you', 'your',
  'של', 'את', 'על', 'עם', 'אל', 'זה', 'זו', 'היה', 'הייתה', 'היו', 'אני', 'הוא', 'היא', 'הם', 'הן', 'לא', 'גם', 'כי', 'אבל', 'או', 'כל',
  'שלי', 'שלו', 'שלה', 'לי', 'לו', 'לה', 'בו', 'בה', 'מה', 'מי', 'איך', 'כמו', 'רק', 'עוד', 'כבר', 'אז', 'שם', 'פה', 'יש', 'אין',
]);

/** One-letter Hebrew prefixes that attach to a word (ה, ו, ב, ל, מ, ש, כ). */
const HE_PREFIX = /^[ובהלמשכ]/;

function stripNiqqud(text: string): string {
  return text.replace(/[֑-ׇ]/g, '');
}

/** The comparable forms of a word: itself and, for Hebrew, the word without up to two attached prefixes. */
function forms(word: string): string[] {
  const out = [word];
  let w = word;
  for (let i = 0; i < 2 && /^[א-ת]/.test(w) && HE_PREFIX.test(w) && w.length > 2; i++) {
    w = w.slice(1);
    out.push(w);
  }
  return out;
}

function words(text: string): string[] {
  return stripNiqqud(text.toLowerCase())
    .split(/[^\p{L}\p{N}'’-]+/u)
    .map((w) => w.replace(/^['’-]+|['’-]+$/g, ''))
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

/** The dream split into sentences, each kept exactly as written. */
export function dreamSentences(sourceText: string): string[] {
  return sourceText
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function score(sentence: string, label: string): number {
  const sentenceForms = new Set(words(sentence).flatMap(forms));
  let hits = 0;
  for (const w of new Set(words(label))) {
    if (forms(w).some((f) => f.length >= 2 && sentenceForms.has(f))) hits += 1;
  }
  return hits;
}

/**
 * The best sentence for a moment, or null. The label in the dream's own language is tried first (it shares the dream's words); the
 * displayed label only when that finds nothing. Ties go to the earlier sentence. A sentence longer than the card allows is shortened
 * at a word boundary with an ellipsis: the words themselves are never changed.
 */
export function excerptForMoment(sourceText: string, rawLabel: string | null, displayLabel: string): string | null {
  const sentences = dreamSentences(sourceText ?? '');
  if (sentences.length === 0) return null;
  for (const label of [rawLabel, displayLabel]) {
    if (!label || !label.trim()) continue;
    let best: { sentence: string; hits: number } | null = null;
    for (const sentence of sentences) {
      const hits = score(sentence, label);
      if (hits > 0 && (!best || hits > best.hits)) best = { sentence, hits };
    }
    if (best) return shorten(best.sentence);
  }
  return null;
}

function shorten(sentence: string): string {
  if (sentence.length <= MAX_EXCERPT_CHARS) return sentence;
  const cut = sentence.slice(0, MAX_EXCERPT_CHARS);
  const space = cut.lastIndexOf(' ');
  return `${(space > 40 ? cut.slice(0, space) : cut).trim()}…`;
}
