import { checkLabel } from './claimCheck.js';

/**
 * AN ENGLISH MOMENT TITLE IS WHOLE (2026-11-17). The live English run of 2026-11-15 showed titles that were pieces of a sentence: "said",
 * "reading room found", "walking through a large" (a lone verb, a verb with no object, a phrase cut at a word count). `checkLabel`
 * (claimCheck.ts, a frozen safety file) judges a title by its words, not by its shape, so the shape is checked here, around it, and only for
 * English text: a Hebrew title goes through `checkLabel` exactly as before. A title the model wrote that is whole stays as it was. Otherwise the
 * title is the moment's own first whole noun phrase ("a large library", "the edge of a cliff"), from the moment's own words and nothing else.
 */

const EN_DET = /^(?:a|an|the|this|that|these|those|some|every|each|any|no)$/;
const EN_FUNCTION = /^(?:a|an|the|of|to|in|on|at|by|for|from|with|through|into|onto|over|under|about|and|or|but|so|as|than|that|which|who|whom|whose|while|when|if|then|is|are|was|were|be|been|being|am|do|did|does|had|has|have|would|could|should|will|can|might|must|not|it|he|she|they|them|him|us|we|you|there|here|my|me|i)$/;
const EN_BARE = /^(?:said|says|say|told|tell|asked|ask|went|go|going|saw|see|looked|look|came|come|got|get|made|make|took|take|started|began|felt|knew|thought|wanted|tried|turned|walked|ran|kept|left|stood|sat|nothing|something|everything|anything|nobody|someone|just|suddenly|found|called|opened|smiled|noticed|heard|held|wore|carried)$/;
// a verb that needs its object: a title that ends on it is a fragment ("reading room found")
const EN_NEEDS_OBJECT = /^(?:said|says|told|asked|saw|took|made|got|found|called|opened|wanted|tried|knew|thought|felt|began|started|noticed|heard|held|wore|carried|looked)$/;
// where a noun phrase ends: a preposition, a conjunction, a verb of being, or a describing tail ("full of", "made of")
const EN_PHRASE_END = /^(?:of|to|in|on|at|by|for|from|with|through|into|onto|over|under|about|and|or|but|so|as|than|that|which|who|whom|whose|while|when|if|then|is|are|was|were|be|been|am|do|did|does|had|has|have|would|could|should|will|can|might|must|not|full|filled|made|covered|called|named|there|where|because|near|beside|behind|inside|outside|toward|towards|across|around|along|against|between|among|without|within|after|before|past|like|beyond|below|above|underneath)$/;

const isEnglishText = (t: string) => /[A-Za-z]/.test(t) && !/[֐-׿]/.test(t);
const enWord = (w: string) => w.toLowerCase().replace(/^[^a-z']+|[^a-z']+$/g, '');
const enWords = (t: string) => t.split(/\s+/).map(enWord).filter(Boolean);
const endsPhrase = (w: string) => !w || EN_PHRASE_END.test(w) || EN_FUNCTION.test(w) || EN_BARE.test(w);
// a past verb after the noun ("a stranger followed", 2026-11-22): "-ed" ends the phrase when what comes next is not a noun of it
const pastVerb = (w: string) => w.length > 4 && /[a-z]ed$/.test(w) && !/(?:eed|need|bed|shed|sled)$/.test(w);
const verbEnds = (w: string | undefined, next: string | undefined) => pastVerb(w ?? '') && endsPhrase(next ?? '');

/** Is this English title a lone verb, one starting or ending on a small word or a verb that needs an object, or one cut in the middle of the moment's phrase? */
export function weakEnglishTitle(label: string, momentText: string): boolean {
  if (!isEnglishText(label)) return false;
  const ws = enWords(label);
  if (!ws.length) return true;
  if (ws.every((w) => EN_BARE.test(w) || EN_FUNCTION.test(w))) return true;
  const last = ws[ws.length - 1];
  if (EN_FUNCTION.test(last) || EN_NEEDS_OBJECT.test(last) || (EN_FUNCTION.test(ws[0]) && !EN_DET.test(ws[0]))) return true;
  // a noun and then its verb: "a stranger followed", "the door opened" (a describing "-ed" stands before its noun, never at the end)
  if (ws.length >= 2 && pastVerb(last) && !EN_DET.test(ws[ws.length - 2])) return true;
  // cut in the middle: a small word that opens a phrase with only one word after it, while the moment goes on with a word of that phrase
  const d = ws.map((w, i) => (EN_DET.test(w) ? i : -1)).filter((i) => i >= 0).pop();
  if (d !== undefined && ws.length - d - 1 <= 1) {
    const m = enWords(momentText);
    for (let i = 0; i + ws.length <= m.length; i++) if (ws.every((w, k) => m[i + k] === w) && !endsPhrase(m[i + ws.length] ?? '') && !verbEnds(m[i + ws.length], m[i + ws.length + 1])) return true;
  }
  return false;
}

/** The first whole noun phrase of the moment ("a large empty house"), from its own words; null when there is none. */
export function englishNounPhrase(momentText: string): string | null {
  const raw = momentText.split(/\s+/).filter(Boolean);
  for (let i = 0; i < raw.length - 1; i++) {
    if (!EN_DET.test(enWord(raw[i]))) continue;
    const phrase = [raw[i].replace(/^[^A-Za-z']+/, '')];
    let stopped = /[,;.!?…]$/.test(raw[i]);
    let j = i + 1;
    for (; j < raw.length && !stopped && phrase.length < 5; j++) {
      // "the edge of a cliff": one "of" may join two nouns, when a word follows it
      const after = enWord(raw[j + 1] ?? '');
      const joins = enWord(raw[j]) === 'of' && phrase.length >= 2 && !phrase.includes('of') && after !== '' && (EN_DET.test(after) || !endsPhrase(after));
      const afterOf = enWord(phrase[phrase.length - 1]) === 'of' && EN_DET.test(enWord(raw[j]));
      if (!joins && !afterOf && endsPhrase(enWord(raw[j]))) break;
      // "a stranger followed me": the verb after the noun ends the phrase; "the old painted door" goes on (a noun comes after it)
      if (phrase.length >= 2 && pastVerb(enWord(raw[j])) && endsPhrase(enWord(raw[j + 1] ?? ''))) break;
      phrase.push(raw[j].replace(/^[^A-Za-z']+/, ''));
      stopped = /[,;.!?…]$/.test(raw[j]);
    }
    const text = phrase.join(' ').replace(/[,;.!?…]+$/g, '');
    // whole: a small word and a word after it, and the phrase was not stopped by the word cap in the middle of itself
    const whole = phrase.length >= 2 && (stopped || j >= raw.length || endsPhrase(enWord(raw[j])) || (pastVerb(enWord(raw[j])) && endsPhrase(enWord(raw[j + 1] ?? ''))));
    if (whole && !weakEnglishTitle(text, momentText)) return text;
  }
  return null;
}

/**
 * The title of a moment: `checkLabel`, and for English text a title that is whole. `candidate` is the model's title ('' when there is none).
 * The title is checked against the moment's own words by `checkLabel` as before; this only keeps a fragment from being shown as a title.
 */
export function checkMomentTitle(candidate: string, momentText: string, used: readonly string[], dreamText = ''): string {
  if (!isEnglishText(momentText) || /[֐-׿]/.test(candidate)) return checkLabel(candidate, momentText, used, dreamText);
  const given = candidate.trim();
  const usable = given !== '' && !weakEnglishTitle(given, momentText);
  const checked = checkLabel(usable ? given : '', momentText, used, dreamText);
  if (usable && !weakEnglishTitle(checked, momentText)) return checked;
  const phrase = englishNounPhrase(momentText);
  const taken = (t: string) => used.some((u) => u.trim().toLowerCase() === t.toLowerCase());
  if (phrase && !taken(phrase)) return phrase;
  return checked;
}
