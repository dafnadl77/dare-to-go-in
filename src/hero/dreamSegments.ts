import { contentWords, inWords, isFirstPersonVerb, isFirstPersonWord, isNegation, isTimeWord, neutralizeFirstPerson, norm, sameWord, words } from './hebrewText.js';

/**
 * THE DREAM AS NUMBERED PARTS (stage 3b fix round, doc 30). Everything here is computed from the dreamer's own text, deterministically,
 * by the server and the browser alike, so a model can point at a part ("s3") but never invent one.
 *
 *  - segments: the clauses of the dream, verbatim, with their place in the text. Claims about the dream rest on exactly one of them.
 *  - moments: what the dreamer can choose to explore. One sentence of the dream (a run-on dictated sentence is cut at its discourse
 *    words first), with the parts that tell the same event twice merged into one. Never padded: a one-sentence dream has one moment.
 *  - eventOrder: what the text itself says about which of two parts happened first. The order of the telling is NOT the order of
 *    events: without a word that says so ("ואז", "בסוף", "לפני זה"), the answer is "unknown".
 *  - whoActs: who performs a verb of a part, from the grammar of the part (a first-person verb is the dreamer's; otherwise a figure
 *    named in the part, or no one named). The analysis model's own list of actions is NOT used: on real samples it gave the dreamer
 *    an action the dream gives to "someone", and gave the dreamer a "his" brother.
 */

export interface DreamSegment {
  id: number;
  text: string;
  start: number;
  end: number;
  sentence: number;
  /** The written sentence it came from (a dictated run-on sentence cut into pieces keeps one group): neighbours in it share context. */
  group: number;
}

export interface DreamMomentGroup {
  segmentIds: number[];
  /** The moment as the dream tells it (verbatim; non-adjacent parts joined with " … "). */
  text: string;
  priority: number;
}

const SENTENCE_END = /[.!?…]+|\n+/g;
/** Where a long unpunctuated sentence may be cut: discourse words that open a new step. */
const CUT_BEFORE = /^(ואז|אז|ופתאום|פתאום|ואחר|אחר|ואחרי|אחרי|ובסוף|בסוף|ולפני|לפני|וכש\S*|כש\S*|קודם|וקודם|מקודם|ויש|ואין|then|suddenly|after|before|when|finally|earlier|later|afterwards|meanwhile)$/i;
/** "and" + a person who then acts: a new event in a dictated sentence ("ואמא שלי חיבקה", "ואני הרגשתי", "והשכנה עלתה"). */
const NEW_ACTOR = /^ו(אני|אנחנו|אמא|אבא|אחי|אחותי|אחיו|סבתא|סבא|השכנה|השכן|החבר|החברה|מישהו|מישהי|הוא|היא|הם|הן|הילד|הילדה|הכלב|החתול|and I|and she|and he)$/;
const CONTRAST_START =/^(אבל|אך|אלא|למרות|ולמרות|but|although|yet|though)$/i;
const SUBORDINATE_START = /^(כש\S*|וכש\S*|when|while|as)$/i;
const BACK_POINTER = /(^|\s)(אותו|אותה|אותם|אותן|it|him|her|them)(\s|$)/i;
const MAX_UNPUNCTUATED_WORDS = 22;

interface Span {
  start: number;
  end: number;
}

const trimSpan = (src: string, s: Span): Span => {
  let { start, end } = s;
  while (start < end && /[\s,;:—–\-.!?…"«»]/.test(src[start])) start++;
  while (end > start && /[\s,;:—–\-.!?…"«»]/.test(src[end - 1])) end--;
  return { start, end };
};

/** The word spans of a range, as [start, end) offsets into the source. */
function wordSpans(src: string, range: Span): Span[] {
  const out: Span[] = [];
  const re = /[\p{L}\p{N}'’׳]+/gu;
  re.lastIndex = range.start;
  for (let m = re.exec(src); m && m.index < range.end; m = re.exec(src)) out.push({ start: m.index, end: m.index + m[0].length });
  return out;
}

function sentencesOf(src: string): Span[] {
  const out: Span[] = [];
  let last = 0;
  for (const m of src.matchAll(SENTENCE_END)) {
    out.push({ start: last, end: m.index ?? 0 });
    last = (m.index ?? 0) + m[0].length;
  }
  out.push({ start: last, end: src.length });
  return out.map((s) => trimSpan(src, s)).filter((s) => s.end > s.start);
}

/** A dictated run-on sentence is cut before its discourse words (each piece keeps at least 3 words). */
function cutRunOn(src: string, s: Span): Span[] {
  const ws = wordSpans(src, s);
  if (ws.length <= MAX_UNPUNCTUATED_WORDS) return [s];
  const cuts: number[] = [];
  let lastCut = 0;
  const at = (i: number) => (ws[i] ? src.slice(ws[i].start, ws[i].end) : '');
  for (let i = 3; i < ws.length - 2; i++) {
    const w = at(i);
    // a new step: a discourse word, "and I ...", or "and <someone>" who acts next ("ואמא שלי חיבקה", "ואני הרגשתי")
    const dreamerNext = /^ו/.test(w) && w.length >= 3 && (at(i + 1) === 'אני' || at(i + 2) === 'אני'); // "ובכביש אני עוצר"
    // "…מים חמים רציתי להגיד…": a first-person verb right after a content word opens a new step, even without "ו" (doc 50 v2, א7)
    const bareFirstPerson = !/^[ושכ]/.test(w) && isFirstPersonVerb(w) && contentWords(at(i - 1)).length > 0 && !CUT_BEFORE.test(at(i - 1)) && !/^(לא|אני|גם|רק|כבר|עוד)$/.test(at(i - 1));
    // "ולחזור לפני שהיא גומרת שורה": a bare "לפני ש…" / "אחרי ש…" belongs to the clause before it
    if (/^(לפני|אחרי)$/.test(w) && /^ש/.test(at(i + 1))) continue;
    // English: "and I / and she …" opens a new step, cut before the "and"
    const andActor = /^and$/i.test(w) && /^(i|we|she|he|they|my)$/i.test(at(i + 1));
    const startsStep = CUT_BEFORE.test(w) || NEW_ACTOR.test(w) || dreamerNext || bareFirstPerson || andActor || (/^ו/.test(w) && isFirstPersonVerb(w) && w.length >= 5);
    if (!startsStep) continue;
    // a look back ("ומה שהיה לפני זה ...") opens with its own words: the cut goes before "ומה שהיה", not between them
    let cut = i;
    // English "and then / and later": the "and" goes with the new step, so the step before does not end on it
    if (CUT_BEFORE.test(w) && /^and$/i.test(at(i - 1))) cut = i - 1;
    if (/^ו?לפני$|^ו?קודם$/.test(w)) {
      if (/^ש?(היה|קרה)$/.test(at(i - 1))) cut = i - 1;
      if (cut === i - 1 && /^ו?מה$/.test(at(i - 2))) cut = i - 2;
    }
    if (cut - lastCut >= 3 && ws.length - cut >= 3) {
      cuts.push(cut);
      lastCut = cut;
    }
  }
  if (cuts.length === 0) return [s];
  const pieces: Span[] = [];
  let from = s.start;
  for (const i of cuts) {
    pieces.push({ start: from, end: ws[i].start });
    from = ws[i].start;
  }
  pieces.push({ start: from, end: s.end });
  return pieces.map((p) => trimSpan(src, p)).filter((p) => p.end > p.start);
}

/** The clauses of one sentence piece, merged where a clause cannot stand alone. */
function clausesOf(src: string, piece: Span): Span[] {
  const raw: Span[] = [];
  let from = piece.start;
  const re = /[,;]|\s[—–-]\s/g;
  const text = src.slice(piece.start, piece.end);
  for (const m of text.matchAll(re)) {
    raw.push({ start: from, end: piece.start + (m.index ?? 0) });
    from = piece.start + (m.index ?? 0) + m[0].length;
  }
  raw.push({ start: from, end: piece.end });
  let clauses = raw.map((c) => trimSpan(src, c)).filter((c) => c.end > c.start);
  const firstWord = (c: Span) => src.slice(c.start, c.end).trim().split(/\s+/)[0] ?? '';
  const wordCount = (c: Span) => wordSpans(src, c).length;
  // "כשהגענו לדלת, המפתח..." — a "when" clause belongs to the clause after it
  for (let i = 0; i < clauses.length - 1; i++)
    if (SUBORDINATE_START.test(firstWord(clauses[i]))) {
      clauses = [...clauses.slice(0, i), { start: clauses[i].start, end: clauses[i + 1].end }, ...clauses.slice(i + 2)];
      i--;
    }
  const merged: Span[] = [];
  for (const c of clauses) {
    const prev = merged[merged.length - 1];
    const t = src.slice(c.start, c.end);
    // "..., אבל ידעתי" (a contrast), "..., ולא הצלחתי להעיר אותו" (points back), a fragment of two words: one clause with the one before
    if (prev && (CONTRAST_START.test(firstWord(c)) || wordCount(c) <= 2 || (wordCount(c) <= 4 && BACK_POINTER.test(t)))) prev.end = c.end;
    else merged.push({ ...c });
  }
  if (merged.length > 1 && wordCount(merged[0]) <= 2) {
    merged[1].start = merged[0].start;
    merged.shift();
  }
  return merged;
}

/** The dream's parts, verbatim and in the order of the telling. */
export function segmentDream(sourceText: string): DreamSegment[] {
  const src = sourceText ?? '';
  const out: DreamSegment[] = [];
  let sentence = 0;
  let group = 0;
  for (const s of sentencesOf(src)) {
    for (const piece of cutRunOn(src, s)) {
      for (const c of clausesOf(src, piece)) out.push({ id: out.length, text: src.slice(c.start, c.end), start: c.start, end: c.end, sentence, group });
      sentence += 1;
    }
    group += 1;
  }
  return out;
}

/** The dream's own words for a run of parts (adjacent parts keep the text between them; others are joined with " … "). */
export function textOfSegments(sourceText: string, segments: readonly DreamSegment[], ids: readonly number[]): string {
  const chosen = [...new Set(ids)].map((id) => segments[id]).filter(Boolean).sort((a, b) => a.start - b.start);
  const parts: string[] = [];
  let run: DreamSegment[] = [];
  const flush = () => {
    if (run.length) parts.push(sourceText.slice(run[0].start, run[run.length - 1].end));
    run = [];
  };
  for (const s of chosen) {
    const last = run[run.length - 1];
    if (last && (s.id !== last.id + 1 || s.sentence !== last.sentence)) flush();
    run.push(s);
  }
  flush();
  return parts.join(' … ');
}

// ------------------------------------------------------------------------------------------------ moments

const SETTING_VERBS = new Set(['הייתי', 'היינו', 'היה', 'הייתה', 'היו', 'עמדתי', 'ישבתי', 'שכבתי', 'was', 'were', 'stood', 'sat'].map(norm));

/** Illness, death, injury: such a moment is never moved up by the signals below (doc 50 v2, א7); she can still choose it. */
const SENSITIVE = /(בית חולים|בבית החולים|חולה|מחלה|(?<![א-ת])מת(?![א-ת])|(?<![א-ת])מתה(?![א-ת])|מוות|הלוויה|קבר|(?<![א-ת])דם(?![א-ת])|פצוע|פציעה|נפגע|נפגעה|תאונה)/;
const WANTED = /(?<![א-ת])(?:[ושכ]{0,2})(רציתי|רוצה|ניסיתי)(?![א-ת])/;
const COULD_NOT = /(לא הצלח|לא יצא|לא יכול|לא יכולה|דבוק)/;
const SAID_TO_ME = /(?<![א-ת])(?:ו)?(אמר|אמרה|אמרו|שאל|שאלה|צעק|צעקה)\s+(לי|שאני)/;
const CHANGED = /(הפך|הפכה|הופך|נהיה|נהייתה|כבר היה|כבר הייתה|התחיל להיות)/;

function priorityOf(text: string, unusual: readonly string[]): number {
  const ws = words(text);
  let p = 0;
  // what makes a moment charged: a wish not done, someone who says something to her, something that turns into something else, "always"
  if (!SENSITIVE.test(text)) {
    if (WANTED.test(text) && COULD_NOT.test(text)) p += 3;
    if (SAID_TO_ME.test(text)) p += 2;
    if (CHANGED.test(text)) p += 2;
    if (ws.some((w) => /^(?:ו|ש)?(תמיד|always)$/.test(w))) p += 1;
  }
  if (ws.some((w, i) => isNegation(w) && i < ws.length - 1)) p += 3; // something did not happen / could not be done
  if (ws.some((w) => /^(אבל|אך|למרות|ולמרות|but|although)$/.test(w))) p += 2; // a contradiction inside the moment
  if (ws.some((w) => /^(פתאום|ופתאום|suddenly)$/.test(w))) p += 2;
  if (ws.some((w) => /^(מדי|too)$/.test(w) || /^(שוב|again)$/.test(w))) p += 1;
  if (unusual.some((u) => contentWords(u).filter((w) => inWords(w, contentWords(text))).length >= 2)) p += 2; // the analysis marked it as odd
  if (ws.some((w, i) => i < 3 && !isFirstPersonWord(w) && contentWords(w).length > 0 && /^[א-ת]/.test(w) && ws.slice(i + 1, i + 3).some((v) => !isFirstPersonVerb(v)))) p += 1;
  const verbs = ws.filter((w) => isFirstPersonVerb(w) || SETTING_VERBS.has(norm(w)));
  if (verbs.length > 0 && verbs.every((w) => SETTING_VERBS.has(norm(w))) && p <= 1) p -= 2; // only a setting ("הייתי בחתונה")
  if (SENSITIVE.test(text)) p = Math.min(p, 0);
  return p;
}

/** Two sentences that tell the same event: most of their content words are shared. */
function sameEvent(a: string, b: string): boolean {
  const x = contentWords(a).filter((w) => !isTimeWord(w));
  const y = contentWords(b).filter((w) => !isTimeWord(w));
  if (x.length < 2 || y.length < 2) return false;
  const shared = x.filter((w) => inWords(w, y)).length;
  return shared / Math.min(x.length, y.length) >= 0.75 && shared / Math.max(x.length, y.length) >= 0.6;
}

/**
 * The moments a dream offers, most telling first (what did not happen, a contradiction, something sudden or odd; a bare setting last),
 * ties in the order of the telling. All of them are returned; the map shows at most MAX_MOMENTS and the rest stay choosable as
 * "another moment of the dream".
 */
export function momentGroups(sourceText: string, unusualElements: readonly string[] = []): DreamMomentGroup[] {
  const segments = segmentDream(sourceText);
  const bySentence = new Map<number, number[]>();
  for (const s of segments) bySentence.set(s.sentence, [...(bySentence.get(s.sentence) ?? []), s.id]);
  const groups: number[][] = [...bySentence.values()];
  // the same event told twice is one moment, in its first telling: the repeat is not pasted into it (a dream that says the same
  // sentence again and again made one giant moment of every copy, joined with " … ")
  for (let i = 0; i < groups.length; i++)
    for (let j = i + 1; j < groups.length; j++)
      if (sameEvent(textOfSegments(sourceText, segments, groups[i]), textOfSegments(sourceText, segments, groups[j]))) {
        groups.splice(j, 1);
        j--;
      }
  return groups
    .map((ids, order) => {
      const text = textOfSegments(sourceText, segments, ids);
      return { segmentIds: [...ids].sort((a, b) => a - b), text, priority: priorityOf(text, unusualElements), order };
    })
    .sort((a, b) => b.priority - a.priority || a.order - b.order)
    .map(({ segmentIds, text, priority }) => ({ segmentIds, text, priority }));
}

/** The parts a stored moment rests on: its own ids when they are valid for this dream, otherwise the parts its excerpt covers. */
export function segmentsForMoment(segments: readonly DreamSegment[], moment: { segmentIds?: readonly number[] | null; excerpt?: string | null; label?: string }): number[] {
  const ids = (moment.segmentIds ?? []).filter((id) => Number.isInteger(id) && id >= 0 && id < segments.length);
  if (ids.length) return [...new Set(ids)];
  const excerpt = (moment.excerpt ?? '').replace(/…$/, '').trim();
  if (!excerpt) return [];
  const covered = segments.filter((s) => excerpt.includes(s.text) || s.text.includes(excerpt));
  return covered.map((s) => s.id);
}

// ------------------------------------------------------------------------------------------------ order of events

const FORWARD_ADJACENT = /(^|\s)(ואז|אז|אחר כך|ואחר כך|אחרי זה|ואחרי זה|לאחר מכן|then|after that|afterwards|next)(\s|$)/i;
const FORWARD_LAST = /(^|\s)(בסוף|ובסוף|לבסוף|finally|in the end|at last|eventually)(\s|$)/i;
const BACKWARD = /(^|\s)(לפני זה|ולפני זה|לפני כן|קודם לכן|קודם|מקודם|לפני ש\S*|before that|earlier|previously)(\s|$)/i;

/**
 * Which of two parts happened first, as far as the TEXT says: "before" (a happened before b), "after", or "unknown". The telling
 * order alone never decides it: only a word in the later part does ("ואז" / "אחר כך" for the part right before it, "בסוף" for
 * everything told before it, "לפני זה" / "קודם" pointing back to the part right before it).
 */
export function eventOrder(segments: readonly DreamSegment[], a: number, b: number): 'before' | 'after' | 'unknown' {
  if (a === b || !segments[a] || !segments[b]) return 'unknown';
  const [early, late] = segments[a].start < segments[b].start ? [segments[a], segments[b]] : [segments[b], segments[a]];
  const adjacent = late.id === early.id + 1;
  let earlyFirst: boolean | null = null;
  if (BACKWARD.test(late.text) && adjacent) earlyFirst = false;
  else if (FORWARD_LAST.test(late.text) && !segments.slice(early.id + 1, late.id).some((s) => BACKWARD.test(s.text))) earlyFirst = true;
  else if (FORWARD_ADJACENT.test(late.text) && adjacent) earlyFirst = true;
  if (earlyFirst === null) return 'unknown';
  const aIsEarly = early.id === a;
  return aIsEarly === earlyFirst ? 'before' : 'after';
}

// ------------------------------------------------------------------------------------------------ who acts

export type Actor = { kind: 'dreamer' } | { kind: 'figure'; words: string[] } | { kind: 'unnamed' };

const INDEFINITE = new Set(['מישהו', 'מישהי', 'כולם', 'כולן', 'אנשים', 'הם', 'הן', 'someone', 'somebody', 'everyone', 'everybody', 'people', 'they'].map(norm));

/**
 * Who performs `verb` in the part, from the part's grammar: a first-person verb (or one after "אני" / "I") is the dreamer's; otherwise
 * the figure named right before it (up to three words back, "אחי הקטן נתן"), and when none is named, no one (an impersonal "רדפו").
 * null when the verb is not in the part at all.
 */
export function whoActs(segmentText: string, verb: string): Actor | null {
  const ws = words(segmentText);
  const v = norm(verb);
  let at = ws.findIndex((w) => norm(w) === v);
  if (at < 0) at = ws.findIndex((w) => sameWord(w, verb));
  if (at < 0) return null;
  const w = ws[at];
  const before = ws.slice(Math.max(0, at - 3), at);
  if (isFirstPersonVerb(w) || before.some((b) => ['אני', 'אנחנו', 'i', 'we'].includes(norm(b).replace(/^[ושכ]+(?=אני|אנחנו)/, '')))) return { kind: 'dreamer' };
  // "מישהו שר", "כולם לבשו": an indefinite doer is still someone else, never the dreamer
  const indefinite = before.filter((b) => INDEFINITE.has(norm(b)));
  if (indefinite.length) return { kind: 'figure', words: indefinite };
  const named = before.filter((b) => contentWords(b).length > 0 && !isFirstPersonVerb(b) && !isTimeWord(b));
  // "אחי" names a figure (the dreamer's brother), even though it is a first-person form
  const figure = named.length ? named : before.filter((b) => isFirstPersonWord(b) && !isFirstPersonVerb(b) && norm(b).length >= 3 && neutralizeFirstPerson(b) !== '');
  if (figure.length) return { kind: 'figure', words: figure };
  return { kind: 'unnamed' };
}

/** Whether the part says the action was done TO the dreamer ("נתן לי", "רדפו אחריי", "קרא לי"). */
export function dreamerIsTarget(segmentText: string): boolean {
  return words(segmentText).some((w) => ['לי', 'אותי', 'אליי', 'אלי', 'אחריי', 'עליי', 'עלי', 'ממני', 'בי', 'איתי', 'אצלי', 'me', 'us', 'לנו', 'אותנו'].includes(norm(w)));
}

/** True when a negation stands right before the verb (within two words). */
export function negatedIn(text: string, verb: string): boolean | null {
  const ws = words(text);
  const at = ws.findIndex((w) => sameWord(w, verb));
  if (at < 0) return null;
  return ws.slice(Math.max(0, at - 2), at).some(isNegation);
}
