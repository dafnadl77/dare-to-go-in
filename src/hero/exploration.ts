import type { DreamReflectionResult } from './dreamReflectionSchema.js';
import { containsVerbatim, isUnsureAnswer } from './hebrewText.js';

/** What a question asks about (declared by the model, corrected by code where the words show it; see claimCheck.ts). */
/**
 * The kinds of question, defined once: the checker (claimCheck) re-exports this list, so a kind it plans ('whatif', phase 2) is never
 * dropped when the journey stores it or is resumed (doc 65, issue 1).
 */
export const FOCI = ['feeling', 'sense', 'figure', 'action', 'detail', 'change', 'memory', 'salience', 'surprise', 'choice', 'connection', 'whatif'] as const;
export type QuestionFocus = (typeof FOCI)[number];
/** whole = a real link or difference across moments; first-look = one moment, never "the whole picture"; no-link = honest "nothing
    joins them yet"; factual-summary = every interpretive part failed its checks, only verified facts (not counted as a whole view). */
export type WholeViewKind = 'whole' | 'first-look' | 'no-link' | 'factual-summary';
/** An insight is "factual" when no interpretation passed its checks (or the answer was "I don't know"): not a successful insight.
    "listening" (doc 90 v3): DARE gave back what the dream shows and what she said, perhaps with two details side by side and a
    question; nothing interpreted, and never a reason for another (paid) try — most moments are listening ones. */
export type InsightKind = 'interpretive' | 'factual' | 'listening';
/** One more interpretive try for a moment whose insight came back factual, one more whole view after a factual summary. */
export const MAX_INSIGHT_RETRIES = 1;
export const MAX_WHOLE_VIEW_FAILURES = 2;

/**
 * THE MULTI-MOMENT DREAM JOURNEY: its data and the pure rules that move it forward (stage 3a; see
 * docs/upgrade-2026-10/23-dream-map-plan.md section 2 and 24-stage3-connection-plan.md).
 *
 * Nothing here calls a server or a model. Every function is pure: it takes an Exploration and returns a new one (or the same one,
 * unchanged, when the step is not allowed). The calls themselves arrive in stage 3b; these rules are what keep them from being
 * repeated: a moment that already has its question / its insight, and a whole view already written from the same answers, never
 * need a second call (see needs*).
 *
 * The record lives inside the dream's jsonb payload (`exploration`, optional), so older dreams simply do not have it and no database
 * migration is needed. parseExploration() is the one tolerant reader for anything coming back from storage.
 */

export const EXPLORATION_VERSION = 1;
/** The most moments a dream offers (deriveDreamElements caps at 6). */
export const MAX_MOMENTS = 6;
/** One whole view and two updates per dream (the server's reflection_count allows 3). */
export const MAX_WHOLE_VIEWS = 3;
/** The client's mirror of the per-dream allowance for moment calls (the server, label_count, is the authority). */
export const MAX_MOMENT_CALLS = 16;
/** The longest answer kept (same bound the reflection route already applies). */
export const MAX_ANSWER_CHARS = 2000;

export type MomentId = string;
export type QuestionSource = 'pregenerated' | 'adaptive' | 'fixed';

/** One moment offered for this dream: never invented, taken from the analysis (see deriveDreamElements). */
export interface ExplorationMoment {
  id: MomentId;
  /** The label shown to the dreamer (in the journey's language). */
  label: string;
  /** The same moment as the analysis named it, in the dream's own language (used to find the excerpt). */
  rawLabel: string | null;
  /** A sentence taken from the dream's own text, or null when none matches (see momentExcerpt.ts). */
  excerpt: string | null;
  /** The question written for this moment in advance, if any. Kept for older records; since the fix round (doc 30) even the first
      moment gets a question written for it, so this is no longer asked as it is. */
  pregeneratedQuestion: string | null;
  /** The parts of the dream this moment rests on (dreamSegments.ts ids); absent on older records (then found from the excerpt). */
  segmentIds?: number[];
}

/** What DARE chose to do in a turn of the conversation (doc 102). */
export const MOVES = ['reflect', 'ask', 'offer', 'deepen', 'summarize'] as const;
export type Move = (typeof MOVES)[number];
/** The longest conversation kept for one moment, and the longest turn. */
export const MAX_TURNS_PER_MOMENT = 60;
const MAX_TURN_CHARS = 1500;

/** One turn of a moment's conversation (doc 102). */
export interface ConversationTurn {
  role: 'dare' | 'dreamer';
  text: string;
  move?: Move;
  /** An angle DARE offered, shown apart with "זה לא מתאים לי". */
  offer?: string;
  /** She said the offer does not fit her. */
  rejected?: boolean;
  /** Her turn made by the "זה לא מתאים לי" button (her bubble with that text; DARE answers it at once). */
  rejection?: true;
  /** Her turn made by a direction button, "להמשיך בכיוון" / "לשנות כיוון" (doc 117): a regular turn DARE answers at once. */
  steer?: 'deepen' | 'shift';
  /** What DARE's offer rested on, as really written: an angle she turns down is not offered again (doc 114). */
  anchors?: string[];
  /** DARE's closing line of a moment after its third question: no question; nothing more is asked in that moment. */
  closing?: true;
}

/** Two details side by side, each in its own exact words, and one open question (doc 90 v3). What joins them is never said. */
export interface MomentPair {
  a: { quote: string; from: 'dream' | 'answer' };
  b: { quote: string; from: 'dream' | 'answer' };
  question: string;
}

export interface MomentInsight {
  observation: string;
  reflection: string;
  /** '' when no interpretation passed its checks (kind 'factual'), and always in a listening insight. */
  possibility: string;
  kind?: InsightKind;
  /** Only in a listening insight. Its question is the moment's follow-up question; her answer is kept there, given back by code. */
  pair?: MomentPair;
}

export interface ExploredMoment {
  status: 'exploring' | 'explored';
  question: string;
  questionSource: QuestionSource;
  /** null until answered. */
  answer: string | null;
  /** Present only when a clarification was asked. answer stays null until answered; skipped = the dreamer chose not to answer. */
  followUp: { question: string; answer: string | null; skipped: boolean } | null;
  insight: MomentInsight | null;
  /** True once the insight was rewritten with the clarification's answer (so it is never requested twice). */
  insightFromFollowUp: boolean;
  /** 1-based order in which moments were explored (0 while still exploring). */
  order: number;
  startedAt: string;
  exploredAt: string | null;
  /** What the question asks about, so a later question never asks the same thing in other words. */
  focus?: QuestionFocus | null;
  subject?: string | null;
  /** After an "I don't know": the first question and its answer, kept; `question` / `answer` are then the one different question. */
  firstTry?: { question: string; answer: string } | null;
  /** Interpretive retries used after a factual insight (at most MAX_INSIGHT_RETRIES). */
  retries?: number;
  /** The conversation of this moment (doc 102), in order; absent on every earlier record. `question` is its opening turn, `answer`
      her first words, so the map and older readers still read a question and an answer. */
  turns?: ConversationTurn[];
}

export interface WholeViewConnection {
  from: MomentId;
  to: MomentId;
  title: string;
  basis: string;
  /** The verbatim words each end rests on (her answer or the dream), so a later update can check the link still holds. */
  fromQuote?: string;
  toQuote?: string;
  /** Kept from an earlier whole view of fewer moments (still resting on her unchanged words). */
  carried?: boolean;
}

export interface WholeViewRecord {
  /** Fingerprint of the explored moments and answers it was written from (see basedOnKey). */
  basedOn: string;
  momentIds: MomentId[];
  generatedAt: string;
  overview: string;
  recurring: string | null;
  contrast: string | null;
  readings: { basis: string; reading: string }[];
  /** '' when no closing question passed its checks. */
  closingQuestion: string;
  connections: WholeViewConnection[];
  /** Absent on older records (then 'whole'). */
  kind?: WholeViewKind;
  /** The plain sentence that says what this is when it is not a full whole view. */
  notice?: string | null;
  /** Moments not explored yet, offered to go deeper. */
  invite?: MomentId[];
  /** Factual summaries received in a row for the same answers (a retry is allowed while below MAX_WHOLE_VIEW_FAILURES). */
  failures?: number;
  /** "מה לקחתי מהחלום" (doc 117): her own sentences where something connected, and DARE's ideas she kept. Absent when there is none. */
  takeaways?: { mine: string[]; ideas: string[]; open?: string[] };
}

/** The takeaways as stored: strings only, at most three each, absent when both are empty. */
const cleanTakeaways = (v: unknown): { mine: string[]; ideas: string[]; open?: string[] } | undefined => {
  if (!isObj(v)) return undefined;
  const list = (x: unknown) => (Array.isArray(x) ? x : []).map((s) => clean(s, 300)).filter(Boolean).slice(0, 3);
  const open = list(v.open).slice(0, 2);
  const t = { mine: list(v.mine), ideas: list(v.ideas), ...(open.length ? { open } : {}) };
  return t.mine.length || t.ideas.length || open.length ? t : undefined;
};

export interface Exploration {
  version: typeof EXPLORATION_VERSION;
  attemptId: string;
  moments: ExplorationMoment[];
  explored: Record<MomentId, ExploredMoment>;
  wholeView: WholeViewRecord | null;
  /** Whole views written so far for this dream (successful ones). */
  wholeViewCount: number;
  /** The feelings step is offered once per dream, after the first insight. */
  feelingsAsked: boolean;
  /** An update whose every check failed (the earlier view stays shown): how many times, for these answers (one retry). */
  wholeViewFailedFor?: { basedOn: string; count: number };
  /** Earlier whole views, newest first (at most MAX_WHOLE_VIEWS): an update never loses what was shown before. */
  wholeViewHistory?: WholeViewRecord[];
  /** Bumped on every change; a save to the account checks it so two tabs never overwrite each other. */
  rev: number;
  /** Questions DARE already asked in a moment that was left unanswered (and so removed): kept, so coming back does not start over. */
  asked?: Record<MomentId, number>;
}

const clean = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const nowIso = (now: Date) => now.toISOString();
const bump = (e: Exploration, patch: Partial<Exploration>): Exploration => ({ ...e, ...patch, rev: e.rev + 1 });

// ------------------------------------------------------------------------------------------------ creation

export interface MomentSeed {
  label: string;
  rawLabel?: string | null;
  excerpt?: string | null;
  pregeneratedQuestion?: string | null;
  segmentIds?: readonly number[] | null;
}

const cleanSegmentIds = (v: unknown): number[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const ids = [...new Set(v.filter((x): x is number => Number.isInteger(x) && x >= 0 && x < 400))].slice(0, 12);
  return ids.length ? ids : undefined;
};

/** Starts a journey from the moments the analysis offered. Empty labels are dropped; never more than MAX_MOMENTS; ids are m1..m6. */
export function createExploration(attemptId: string, seeds: readonly MomentSeed[]): Exploration {
  const moments: ExplorationMoment[] = [];
  for (const seed of seeds) {
    const label = clean(seed.label, 200);
    if (!label || moments.length >= MAX_MOMENTS) continue;
    moments.push({
      id: `m${moments.length + 1}`,
      label,
      rawLabel: clean(seed.rawLabel, 200) || null,
      excerpt: clean(seed.excerpt, 300) || null,
      pregeneratedQuestion: clean(seed.pregeneratedQuestion, 300) || null,
      ...(cleanSegmentIds(seed.segmentIds) ? { segmentIds: cleanSegmentIds(seed.segmentIds) } : {}),
    });
  }
  return { version: EXPLORATION_VERSION, attemptId: clean(attemptId, 100), moments, explored: {}, wholeView: null, wholeViewCount: 0, feelingsAsked: false, rev: 0 };
}

// ------------------------------------------------------------------------------------------------ reading

export const momentById = (e: Exploration, id: MomentId) => e.moments.find((m) => m.id === id) ?? null;

/** Explored moments (with their insight), in the order the dreamer explored them. */
export function exploredInOrder(e: Exploration): { moment: ExplorationMoment; entry: ExploredMoment }[] {
  return e.moments
    .map((moment) => ({ moment, entry: e.explored[moment.id] }))
    .filter((x): x is { moment: ExplorationMoment; entry: ExploredMoment } => x.entry?.status === 'explored')
    .sort((a, b) => a.entry.order - b.entry.order);
}

export const exploredCount = (e: Exploration) => Object.values(e.explored).filter((x) => x.status === 'explored').length;

/** The one moment being explored right now, if any. */
export function exploringId(e: Exploration): MomentId | null {
  for (const [id, entry] of Object.entries(e.explored)) if (entry.status === 'exploring') return id;
  return null;
}

/** Every moment's question is written for it, the first one too (decision of 2026-10-21, doc 30): the questions written in advance
    were written for the analysis's words, not for the moments the dreamer chooses. */
export function questionPlanFor(_e: Exploration, _id: MomentId): { kind: 'ready'; question: string; source: QuestionSource } | { kind: 'needs-call' } {
  return { kind: 'needs-call' };
}

/** The answer says "I don't know" (it is never interpreted, never a source). */
export const answeredUnsure = (entry: ExploredMoment | undefined) => Boolean(entry && entry.answer !== null && isUnsureAnswer(entry.answer));

/** One different question may follow an "I don't know", once per moment. */
export const alternativeQuestionAllowed = (entry: ExploredMoment | undefined) =>
  Boolean(entry && entry.status === 'exploring' && answeredUnsure(entry) && !entry.firstTry && entry.insight === null);

/** A stable fingerprint of what a whole view would be written from (moment ids, answers, clarification answers), in exploration order. */
export function basedOnKey(e: Exploration): string {
  const parts = exploredInOrder(e).map(({ moment, entry }) => [moment.id, entry.answer ?? '', entry.followUp?.answer ?? ''].join('\u0001'));
  return `v1:${fnv1a(parts.join('\u0002'))}:${parts.length}`;
}

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export const wholeViewIsStale = (e: Exploration) => e.wholeView !== null && e.wholeView.basedOn !== basedOnKey(e);
export const wholeViewUpdatesLeft = (e: Exploration) => Math.max(0, MAX_WHOLE_VIEWS - e.wholeViewCount);

// ------------------------------------------------------------------------------------------------ "is a call needed?" (no repeated AI calls)

/** A question call is needed only for a moment not opened yet whose question cannot honestly be the pre-written one. Never for a
    moment already opened or explored: its question is stored. */
export const needsQuestionCall = (e: Exploration, id: MomentId) => !e.explored[id] && questionPlanFor(e, id).kind === 'needs-call';

/** An insight call is needed only after an answer, and only while the moment has no insight (or a clarification was just answered). */
export function needsReplyCall(e: Exploration, id: MomentId): boolean {
  const entry = e.explored[id];
  if (!entry || entry.status !== 'exploring' || entry.answer === null) return false;
  // "I don't know" is not interpreted: the moment gets the dream's own words (unsureLook) and, once, a different question.
  if (answeredUnsure(entry)) return false;
  if (entry.insight === null) return true;
  // Her answer to a pair is given back by code (pairAnswerReflection), never by another call.
  if (entry.insight.pair) return false;
  // The clarification was answered: exactly one refreshed insight, never a second.
  if (entry.followUp !== null && entry.followUp.answer !== null && !entry.insightFromFollowUp) return true;
  // Only facts passed the checks: one more interpretive try, never a loop.
  return entry.insight.kind === 'factual' && (entry.retries ?? 0) < MAX_INSIGHT_RETRIES && !followUpPending(entry);
}

/** The insight call about to be made is a retry of a factual insight (not a first insight, not a refresh). */
export const isInsightRetry = (entry: ExploredMoment | undefined) =>
  Boolean(entry && entry.insight && entry.insight.kind === 'factual' && !(entry.followUp && entry.followUp.answer !== null && !entry.insightFromFollowUp));

/** The clarification is still waiting for an answer or a skip. */
export const followUpPending = (entry: ExploredMoment) => entry.followUp !== null && entry.followUp.answer === null && !entry.followUp.skipped;

/** A whole view is written only on request, only from at least one explored moment, only when the answers changed since the last one,
    and only within the per-dream limit. Opening a saved map, revisiting a moment or asking twice never calls again. */
export function canRequestWholeView(e: Exploration): boolean {
  if (exploredCount(e) === 0 || exploringId(e) !== null) return false;
  if (e.wholeViewCount >= MAX_WHOLE_VIEWS) return false;
  if (e.wholeViewFailedFor && e.wholeViewFailedFor.basedOn === basedOnKey(e) && e.wholeViewFailedFor.count >= MAX_WHOLE_VIEW_FAILURES) return false;
  if (e.wholeView === null || wholeViewIsStale(e)) return true;
  // The same answers: again only after a factual summary (every check failed), and only once.
  return e.wholeView.kind === 'factual-summary' && (e.wholeView.failures ?? 1) < MAX_WHOLE_VIEW_FAILURES;
}

// ------------------------------------------------------------------------------------------------ steps (each returns the same object when not allowed)

/** Starts exploring a moment with its question. Not allowed for an explored moment, an unknown one, or while another is open. */
export function beginMoment(e: Exploration, id: MomentId, question: string, source: QuestionSource, now = new Date()): Exploration {
  const q = clean(question, 300);
  if (!q || !momentById(e, id) || e.explored[id] || exploringId(e) !== null) return e;
  const entry: ExploredMoment = { status: 'exploring', question: q, questionSource: source, answer: null, followUp: null, insight: null, insightFromFollowUp: false, order: 0, startedAt: nowIso(now), exploredAt: null };
  return bump(e, { explored: { ...e.explored, [id]: entry } });
}

// ------------------------------------------------------------------------------------------------ the conversation (doc 102)

const cleanTurn = (t: unknown): ConversationTurn | null => {
  if (!isObj(t) || (t.role !== 'dare' && t.role !== 'dreamer')) return null;
  const text = clean(t.text, MAX_TURN_CHARS);
  const offer = clean(t.offer, 800);
  if (!text && !offer) return null;
  return {
    role: t.role,
    text,
    ...(t.role === 'dare' && typeof t.move === 'string' && (MOVES as readonly string[]).includes(t.move) ? { move: t.move as Move } : {}),
    ...(t.role === 'dare' && offer ? { offer } : {}),
    ...(t.role === 'dare' && offer && t.rejected === true ? { rejected: true } : {}),
    ...(t.role === 'dare' && offer && Array.isArray(t.anchors) ? { anchors: t.anchors.filter((a): a is string => typeof a === 'string').map((a) => clean(a, 200)).filter(Boolean).slice(0, 4) } : {}),
    ...(t.role === 'dreamer' && t.rejection === true ? { rejection: true as const } : {}),
    ...(t.role === 'dreamer' && (t.steer === 'deepen' || t.steer === 'shift') ? { steer: t.steer } : {}),
    ...(t.role === 'dare' && t.closing === true ? { closing: true as const } : {}),
  };
};

// ------------------------------------------------------------------------------------------------ three questions a moment

/** At most this many questions of DARE in a moment (approved 2026-10-25); then a closing line and the ways out. */
export const MAX_QUESTIONS_PER_MOMENT = 3;
/** A request to answer without a question mark: "ספרי לי…", "אשמח לשמוע…". */
const INDIRECT_ASK = /(?<![א-ת])(?:ספרי|ספר|תספרי|תספר|תארי|תאר|תתארי|אשמח\s+לשמוע|מעניין\s+(?:אותי\s+)?(?:לשמוע|לדעת)|נסי\s+לתאר|נסה\s+לתאר)(?![א-ת])|\b(?:tell\s+me|describe|i'?d\s+love\s+to\s+hear)\b/i;
/** A turn of DARE that asks her to answer: a question mark, or an indirect request. The closing line never does. */
export const isQuestionTurn = (t: ConversationTurn): boolean => t.role === 'dare' && !t.closing && (/\?/.test(`${t.text} ${t.offer ?? ''}`) || INDIRECT_ASK.test(`${t.text} ${t.offer ?? ''}`));
/** Questions asked in a moment so far, including those of an earlier, unanswered visit. */
export function questionsAsked(e: Exploration, id: MomentId): number {
  return (e.asked?.[id] ?? 0) + (e.explored[id]?.turns ?? []).filter(isQuestionTurn).length;
}
/** Another moment she can still go to: not talked about yet, and with questions left (one moment only: there is none). */
export const anotherMomentLeft = (e: Exploration, id: MomentId): boolean =>
  e.moments.some((m) => m.id !== id && !e.explored[m.id] && questionsAsked(e, m.id) < MAX_QUESTIONS_PER_MOMENT);
/** The moment had its closing line: nothing more is asked in it. */
export const momentClosed = (e: Exploration, id: MomentId): boolean => Boolean(e.explored[id]?.turns?.some((t) => t.role === 'dare' && t.closing));
const withTurns = (e: Exploration, id: MomentId, entry: ExploredMoment, turns: ConversationTurn[], patch: Partial<ExploredMoment> = {}) =>
  bump(e, { explored: { ...e.explored, [id]: { ...entry, ...patch, turns: turns.slice(-MAX_TURNS_PER_MOMENT) } } });

/** Opens a moment as a conversation: DARE's first turn is its question. */
export function beginConversation(e: Exploration, id: MomentId, opening: ConversationTurn, now = new Date()): Exploration {
  const t = cleanTurn({ ...opening, role: 'dare' });
  if (!t) return e;
  const opened = beginMoment(e, id, t.text || t.offer || '', 'adaptive', now);
  if (opened === e) return e;
  return withTurns(opened, id, opened.explored[id], [t]);
}

/** Her words in the conversation. Her first words are also the moment's answer. */
export function addDreamerTurn(e: Exploration, id: MomentId, text: string): Exploration {
  const entry = e.explored[id];
  const t = cleanTurn({ role: 'dreamer', text: clean(text, MAX_ANSWER_CHARS) });
  if (!entry || entry.status !== 'exploring' || !entry.turns || !t) return e;
  return withTurns(e, id, entry, [...entry.turns, t], entry.answer === null ? { answer: t.text } : {});
}

/** DARE's turn, received after hers. */
export function addDareTurn(e: Exploration, id: MomentId, turn: ConversationTurn): Exploration {
  const entry = e.explored[id];
  const t = cleanTurn({ ...turn, role: 'dare' });
  if (!entry || entry.status !== 'exploring' || !entry.turns || !t || entry.turns[entry.turns.length - 1]?.role !== 'dreamer') return e;
  return withTurns(e, id, entry, [...entry.turns, t]);
}

/** DARE answers "זה לא מתאים לי" at once up to this many times in a dream, apart from the moment calls (approved 2026-10-25). */
export const MAX_REJECTION_REPLIES = 3;
export const REJECTION_TEXT = 'זה לא מתאים לי';

/** Rejections DARE already answered in this dream: her button-bubble followed by DARE's turn. */
export function rejectionRepliesUsed(e: Exploration): number {
  let n = 0;
  for (const x of Object.values(e.explored)) {
    const turns = x.turns ?? [];
    turns.forEach((t, i) => {
      if (t.role === 'dreamer' && t.rejection && turns[i + 1]?.role === 'dare') n += 1;
    });
  }
  return n;
}

/**
 * The "זה לא מתאים לי" button (doc 114, option ב): the last offer is marked, and — while the dream has rejection replies left — her
 * bubble with that text is added, so DARE answers it at once. Only DARE's last turn, only an offer not yet rejected: a second click,
 * or a click while DARE is writing, adds nothing. With no replies left the offer is only marked (reply: false).
 */
export function rejectWithReply(e: Exploration, id: MomentId, text = REJECTION_TEXT): { e: Exploration; reply: boolean } {
  const entry = e.explored[id];
  const last = entry?.turns?.[entry.turns.length - 1];
  if (!entry || entry.status !== 'exploring' || !entry.turns || last?.role !== 'dare' || !last.offer || last.rejected) return { e, reply: false };
  const marked = rejectOffer(e, id);
  if (rejectionRepliesUsed(e) >= MAX_REJECTION_REPLIES) return { e: marked, reply: false };
  const m = marked.explored[id];
  return { e: withTurns(marked, id, m, [...(m.turns ?? []), { role: 'dreamer', text, rejection: true }]), reply: true };
}

export const STEER_TEXT = { deepen: 'להמשיך בכיוון', shift: 'לשנות כיוון' } as const;

/**
 * A direction button (doc 117): her bubble with its words, and DARE answers at once — a regular turn, out of the 16. Only right after
 * DARE spoke: a second click, or a click while DARE is writing, adds nothing (null).
 */
export function steerWithReply(e: Exploration, id: MomentId, kind: 'deepen' | 'shift', text: string = STEER_TEXT[kind]): Exploration | null {
  const entry = e.explored[id];
  const last = entry?.turns?.[entry.turns.length - 1];
  if (!entry || entry.status !== 'exploring' || !entry.turns || last?.role !== 'dare') return null;
  return withTurns(e, id, entry, [...entry.turns, { role: 'dreamer', text, steer: kind }]);
}

/** "זה לא מתאים לי": the last offer does not fit her. */
export function rejectOffer(e: Exploration, id: MomentId): Exploration {
  const entry = e.explored[id];
  if (!entry || entry.status !== 'exploring' || !entry.turns) return e;
  const at = entry.turns.map((t) => t.role === 'dare' && Boolean(t.offer)).lastIndexOf(true);
  if (at < 0) return e;
  return withTurns(e, id, entry, entry.turns.map((t, i) => (i === at ? { ...t, rejected: true } : t)));
}

/** A turn is asked for only after she spoke. */
export function needsTurnCall(e: Exploration, id: MomentId): boolean {
  const entry = e.explored[id];
  // after the closing line of a moment nothing more is asked in it, whatever is added
  return Boolean(entry && entry.status === 'exploring' && entry.turns && entry.turns[entry.turns.length - 1]?.role === 'dreamer' && !entry.turns.some((t) => t.role === 'dare' && t.closing));
}

/** She moves on: the moment is explored once she has said something in it. */
export function completeConversation(e: Exploration, id: MomentId, now = new Date()): Exploration {
  const entry = e.explored[id];
  if (!entry || entry.status !== 'exploring' || !entry.turns?.some((t) => t.role === 'dreamer')) return e;
  const order = exploredCount(e) + 1;
  return bump(e, { explored: { ...e.explored, [id]: { ...entry, status: 'explored', order, exploredAt: nowIso(now) } } });
}

/** Leaves a moment that was opened but not answered (the dreamer went back to the map). */
export function abandonMoment(e: Exploration, id: MomentId): Exploration {
  const entry = e.explored[id];
  if (!entry || entry.status !== 'exploring' || entry.answer !== null) return e;
  const explored = { ...e.explored };
  delete explored[id];
  // the questions of this unanswered visit stay counted: coming back does not start the moment over
  const asked = (entry.turns ?? []).filter(isQuestionTurn).length;
  return bump(e, { explored, ...(asked ? { asked: { ...(e.asked ?? {}), [id]: (e.asked?.[id] ?? 0) + asked } } : {}) });
}

/** After an "I don't know": asks the moment once more, differently. The first question and answer are kept (firstTry). */
export function beginAlternativeQuestion(e: Exploration, id: MomentId, question: string, focus: QuestionFocus | null = null, subject: string | null = null, _now = new Date()): Exploration {
  const entry = e.explored[id];
  const q = clean(question, 300);
  if (!q || !alternativeQuestionAllowed(entry) || !entry || entry.answer === null) return e;
  const next: ExploredMoment = { ...entry, firstTry: { question: entry.question, answer: entry.answer }, question: q, questionSource: 'adaptive', answer: null, focus: focus && FOCI.includes(focus) ? focus : null, subject: clean(subject, 80) || null };
  return bump(e, { explored: { ...e.explored, [id]: next } });
}

/** Records what the new question asks about (from the question call), so later questions never repeat it in other words. */
export function setQuestionFocus(e: Exploration, id: MomentId, focus: QuestionFocus | null, subject: string | null): Exploration {
  const entry = e.explored[id];
  if (!entry || entry.status !== 'exploring') return e;
  return bump(e, { explored: { ...e.explored, [id]: { ...entry, focus: focus && FOCI.includes(focus) ? focus : null, subject: clean(subject, 80) || null } } });
}

/** An "I don't know" moment is closed with the dream's own words for it (no call, nothing interpreted). */
export function receiveUnsureLook(e: Exploration, id: MomentId, observation: string): Exploration {
  const entry = e.explored[id];
  const o = clean(observation, 800);
  if (!entry || entry.status !== 'exploring' || !answeredUnsure(entry) || !o) return e;
  return bump(e, { explored: { ...e.explored, [id]: { ...entry, insight: { observation: o, reflection: '', possibility: '', kind: 'factual' }, retries: MAX_INSIGHT_RETRIES } } });
}

export function answerMoment(e: Exploration, id: MomentId, answer: string): Exploration {
  const entry = e.explored[id];
  const a = clean(answer, MAX_ANSWER_CHARS);
  if (!entry || entry.status !== 'exploring' || entry.answer !== null || !a) return e;
  return bump(e, { explored: { ...e.explored, [id]: { ...entry, answer: a } } });
}

/** Stores the reply to an answer: the insight and, only when it adds something, a clarification question (null = none). */
export function receiveReply(e: Exploration, id: MomentId, insight: MomentInsight, followUpQuestion: string | null): Exploration {
  const entry = e.explored[id];
  const ins = cleanInsight(insight);
  if (!entry || entry.status !== 'exploring' || entry.answer === null || !ins) return e;
  // A retry of a factual insight (never a clarification on a retry).
  if (entry.insight !== null) {
    if (!isInsightRetry(entry) || (entry.retries ?? 0) >= MAX_INSIGHT_RETRIES) return e;
    return bump(e, { explored: { ...e.explored, [id]: { ...entry, insight: ins, retries: (entry.retries ?? 0) + 1 } } });
  }
  // A clarification is offered at most once per moment.
  const fq = entry.followUp === null ? clean(followUpQuestion, 300) : '';
  return bump(e, { explored: { ...e.explored, [id]: { ...entry, insight: ins, followUp: fq ? { question: fq, answer: null, skipped: false } : entry.followUp } } });
}

/** The dreamer's answer to the clarification (null = skipped). */
export function answerFollowUp(e: Exploration, id: MomentId, answer: string | null): Exploration {
  const entry = e.explored[id];
  if (!entry || entry.status !== 'exploring' || !entry.followUp || !followUpPending(entry)) return e;
  const a = answer === null ? null : clean(answer, MAX_ANSWER_CHARS) || null;
  return bump(e, { explored: { ...e.explored, [id]: { ...entry, followUp: { ...entry.followUp, answer: a, skipped: a === null } } } });
}

/** The insight rewritten after an answered clarification. */
export function receiveRefreshedInsight(e: Exploration, id: MomentId, insight: MomentInsight): Exploration {
  const entry = e.explored[id];
  const ins = cleanInsight(insight);
  if (!entry || entry.status !== 'exploring' || !entry.followUp || entry.followUp.answer === null || entry.insightFromFollowUp || !ins) return e;
  return bump(e, { explored: { ...e.explored, [id]: { ...entry, insight: ins, insightFromFollowUp: true } } });
}

/** Closes the moment as explored. Requires an answer and an insight; a clarification that was asked must be answered or skipped
    first, and an answered one needs its refreshed insight, unless that refresh failed and the dreamer chose to go on with the first
    insight (keepFirstInsight). */
export function completeMoment(e: Exploration, id: MomentId, now = new Date(), options: { keepFirstInsight?: boolean } = {}): Exploration {
  const entry = e.explored[id];
  if (!entry || entry.status !== 'exploring' || entry.answer === null || entry.insight === null) return e;
  if (entry.followUp && followUpPending(entry)) return e;
  if (entry.followUp?.answer && !entry.insightFromFollowUp && !entry.insight.pair && !options.keepFirstInsight) return e;
  const order = exploredCount(e) + 1;
  return bump(e, { explored: { ...e.explored, [id]: { ...entry, status: 'explored', order, exploredAt: nowIso(now) } } });
}

export const markFeelingsAsked = (e: Exploration): Exploration => (e.feelingsAsked ? e : bump(e, { feelingsAsked: true }));

/** Stores a newly written whole view. Ignored when it was written from different answers than the current ones (a late reply), when
    it repeats the current view's basis, or past the per-dream limit. Links are kept only between two different explored moments. */
export function receiveWholeView(e: Exploration, view: Omit<WholeViewRecord, 'basedOn' | 'momentIds' | 'generatedAt'>, basedOn: string, now = new Date()): Exploration {
  if (basedOn !== basedOnKey(e) || !canRequestWholeView(e)) return e;
  const explored = new Set(exploredInOrder(e).map((x) => x.moment.id));
  const overview = clean(view.overview, 2000);
  const closingQuestion = clean(view.closingQuestion, 400);
  const kind: WholeViewKind = view.kind && ['whole', 'first-look', 'no-link', 'factual-summary'].includes(view.kind) ? view.kind : 'whole';
  if (!overview) return e;
  // Only a whole view or a first look counts as one of the dream's whole views; a factual summary or "no link yet" does not.
  const counts = kind === 'whole' || kind === 'first-look';
  const failures = kind === 'factual-summary' ? (e.wholeView?.kind === 'factual-summary' && e.wholeView.basedOn === basedOn ? (e.wholeView.failures ?? 1) + 1 : 1) : 0;
  const ids = new Set(e.moments.map((m) => m.id));
  const seen = new Set<string>();
  const connections: WholeViewConnection[] = [];
  for (const c of view.connections ?? []) {
    const title = clean(c.title, 120);
    const basis = clean(c.basis, 400);
    const pair = [c.from, c.to].sort().join('|');
    if (c.from === c.to || !explored.has(c.from) || !explored.has(c.to) || !title || !basis || seen.has(pair)) continue;
    seen.add(pair);
    const fromQuote = clean(c.fromQuote, 300);
    const toQuote = clean(c.toQuote, 300);
    connections.push({ from: c.from, to: c.to, title, basis, ...(fromQuote ? { fromQuote } : {}), ...(toQuote ? { toQuote } : {}) });
  }
  // An update (more moments than the view before it): the earlier links that still rest on her unchanged words stay, the earlier view
  // goes to the history. A link whose words are no longer in the answers is not carried.
  const previous = e.wholeView && e.wholeView.basedOn !== basedOn && (e.wholeView.kind ?? 'whole') !== 'factual-summary' ? e.wholeView : null;
  const carried = previous ? previous.connections.filter((c) => !seen.has([c.from, c.to].sort().join('|')) && linkStillHolds(e, c)).map((c) => ({ ...c, carried: true })) : [];
  if (previous && kind === 'factual-summary') {
    // every check of the update failed: the earlier view stays shown, and the failed update is remembered for its one retry
    return bump(e, { wholeView: { ...previous, connections: [...previous.connections.filter((c) => linkStillHolds(e, c))] }, wholeViewFailedFor: { basedOn, count: (e.wholeViewFailedFor?.basedOn === basedOn ? e.wholeViewFailedFor.count : 0) + 1 } });
  }
  for (const c of carried) connections.push(c);
  const record: WholeViewRecord = {
    basedOn,
    momentIds: [...explored],
    generatedAt: nowIso(now),
    overview,
    recurring: clean(view.recurring, 800) || null,
    contrast: clean(view.contrast, 800) || null,
    readings: (view.readings ?? [])
      .map((r) => ({ basis: clean(r.basis, 300), reading: clean(r.reading, 800) }))
      .filter((r) => r.basis && r.reading)
      .slice(0, 2),
    closingQuestion,
    connections: connections.slice(0, 4),
    kind,
    notice: clean(view.notice, 400) || null,
    invite: (view.invite ?? []).filter((x) => typeof x === 'string' && ids.has(x) && !explored.has(x)),
    ...(cleanTakeaways(view.takeaways) ? { takeaways: cleanTakeaways(view.takeaways) } : {}),
    ...(failures ? { failures } : {}),
  };
  if (previous && kind === 'no-link' && carried.length) {
    // nothing new joins the moments, but earlier links still hold: they stay, with the earlier opening if the update has none
    record.kind = 'whole';
    record.notice = null;
    if (!record.closingQuestion) record.closingQuestion = previous.closingQuestion;
  }
  if (previous && !record.closingQuestion) record.closingQuestion = previous.closingQuestion;
  if (previous) record.readings = [...record.readings, ...previous.readings.filter((r) => !record.readings.some((x) => x.reading === r.reading))].slice(0, 2);
  const history = previous ? [{ ...previous, connections: previous.connections }, ...(e.wholeViewHistory ?? [])].slice(0, MAX_WHOLE_VIEWS) : e.wholeViewHistory;
  return bump(e, { wholeView: record, wholeViewCount: e.wholeViewCount + (counts ? 1 : 0), ...(history ? { wholeViewHistory: history } : {}) });
}

/** A link of an earlier view still holds when both moments are explored and each end's words are still in that moment's sources. */
function linkStillHolds(e: Exploration, c: WholeViewConnection): boolean {
  if (!c.fromQuote || !c.toQuote) return false;
  const holds = (id: MomentId, quote: string) => {
    const entry = e.explored[id];
    const m = momentById(e, id);
    if (!entry || entry.status !== 'explored' || !m) return false;
    const sources = [entry.answer ?? '', entry.followUp?.answer ?? '', m.excerpt ?? ''].filter(Boolean);
    return sources.some((s) => containsVerbatim(s, quote));
  };
  return holds(c.from, c.fromQuote) && holds(c.to, c.toQuote);
}

function cleanPair(pair: unknown): MomentPair | null {
  if (!isObj(pair) || !isObj(pair.a) || !isObj(pair.b)) return null;
  const side = (x: Record<string, unknown>): MomentPair['a'] | null => {
    const quote = clean(x.quote, 300);
    return quote && (x.from === 'dream' || x.from === 'answer') ? { quote, from: x.from } : null;
  };
  const a = side(pair.a);
  const b = side(pair.b);
  const question = clean(pair.question, 300);
  return a && b && question ? { a, b, question } : null;
}

function cleanInsight(insight: MomentInsight | null | undefined): MomentInsight | null {
  if (!insight) return null;
  const observation = clean(insight.observation, 800);
  const reflection = clean(insight.reflection, 800);
  if (insight.kind === 'listening') {
    // the dream line may be left out when the pair is about to show it (doc 90 v3): something must still be said
    const pair = cleanPair(insight.pair);
    if (!observation && !reflection && !pair) return null;
    return { observation, reflection, possibility: '', kind: 'listening', ...(pair ? { pair } : {}) };
  }
  const possibility = clean(insight.possibility, 800);
  // A factual insight has no possibility (and, after "I don't know", nothing of hers to give back); an interpretive one has all three.
  const kind: InsightKind = insight.kind === 'factual' || !possibility ? 'factual' : 'interpretive';
  if (!observation) return null;
  // (an interpretive insight is stored as it always was: no kind = interpretive)
  if (kind === 'interpretive') return reflection ? { observation, reflection, possibility } : null;
  return { observation, reflection, possibility: '', kind };
}

// ------------------------------------------------------------------------------------------------ reading back from storage

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/**
 * The one tolerant reader for an exploration coming back from the payload or the browser store. Anything malformed is dropped, never
 * repaired with invented content: a moment without a valid question is not "explored", a whole view without its text is not kept.
 * Returns null for anything that is not an exploration at all (every older dream).
 */
export function parseExploration(raw: unknown): Exploration | null {
  if (!isObj(raw) || raw.version !== EXPLORATION_VERSION) return null;
  const attemptId = str(raw.attemptId, 100);
  if (!attemptId || !Array.isArray(raw.moments)) return null;
  const moments: ExplorationMoment[] = [];
  for (const m of raw.moments) {
    if (!isObj(m)) continue;
    const id = str(m.id, 10);
    const label = str(m.label, 200);
    if (!id || !/^m[1-9]$/.test(id) || !label || moments.some((x) => x.id === id) || moments.length >= MAX_MOMENTS) continue;
    const segmentIds = cleanSegmentIds(m.segmentIds);
    moments.push({ id, label, rawLabel: str(m.rawLabel, 200), excerpt: str(m.excerpt, 300), pregeneratedQuestion: str(m.pregeneratedQuestion, 300), ...(segmentIds ? { segmentIds } : {}) });
  }
  if (moments.length === 0) return null;
  const ids = new Set(moments.map((m) => m.id));
  const explored: Record<MomentId, ExploredMoment> = {};
  if (isObj(raw.explored)) {
    for (const [id, v] of Object.entries(raw.explored)) {
      if (!ids.has(id) || !isObj(v)) continue;
      const question = str(v.question, 300);
      const status = v.status === 'explored' || v.status === 'exploring' ? v.status : null;
      const source: QuestionSource = v.questionSource === 'pregenerated' || v.questionSource === 'adaptive' ? v.questionSource : 'fixed';
      const insight = isObj(v.insight) ? cleanInsight(v.insight as unknown as MomentInsight) : null;
      const answer = str(v.answer, MAX_ANSWER_CHARS);
      if (!question || !status) continue;
      // a conversation (doc 102) is kept with its turns; an explored one needs her words, not an insight
      const turns = Array.isArray(v.turns) ? v.turns.slice(-MAX_TURNS_PER_MOMENT).map(cleanTurn).filter((t): t is ConversationTurn => t !== null) : null;
      // a conversation moment is explored once she answered in it, in words or with a button (then it has no first words): kept
      const hasHers = Boolean(turns?.some((t) => t.role === 'dreamer'));
      if (status === 'explored' && !hasHers && (!answer || !insight)) continue;
      const fuAnswer = isObj(v.followUp) ? str(v.followUp.answer, MAX_ANSWER_CHARS) : null;
      const fu =
        isObj(v.followUp) && str(v.followUp.question, 300)
          ? { question: str(v.followUp.question, 300) as string, answer: fuAnswer, skipped: fuAnswer === null && v.followUp.skipped === true }
          : null;
      explored[id] = {
        status,
        question,
        questionSource: source,
        answer,
        followUp: fu,
        insight,
        insightFromFollowUp: v.insightFromFollowUp === true && fuAnswer !== null,
        order: status === 'explored' && typeof v.order === 'number' && v.order > 0 ? Math.floor(v.order) : 0,
        startedAt: str(v.startedAt, 40) ?? '',
        exploredAt: str(v.exploredAt, 40),
        // the fix-round fields, only when present (a record written before them reads back exactly as it was)
        ...(typeof v.focus === 'string' && (FOCI as readonly string[]).includes(v.focus) ? { focus: v.focus as QuestionFocus } : v.focus === null ? { focus: null } : {}),
        ...(str(v.subject, 80) ? { subject: str(v.subject, 80) } : v.subject === null ? { subject: null } : {}),
        ...(isObj(v.firstTry) && str(v.firstTry.question, 300) && str(v.firstTry.answer, MAX_ANSWER_CHARS)
          ? { firstTry: { question: str(v.firstTry.question, 300) as string, answer: str(v.firstTry.answer, MAX_ANSWER_CHARS) as string } }
          : {}),
        ...(typeof v.retries === 'number' ? { retries: Math.min(MAX_INSIGHT_RETRIES, Math.max(0, Math.floor(v.retries))) } : {}),
        ...(turns && turns.length ? { turns } : {}),
      };
    }
  }
  const e: Exploration = {
    version: EXPLORATION_VERSION,
    attemptId,
    moments,
    explored,
    wholeView: null,
    wholeViewCount: typeof raw.wholeViewCount === 'number' ? Math.min(MAX_WHOLE_VIEWS, Math.max(0, Math.floor(raw.wholeViewCount))) : 0,
    feelingsAsked: raw.feelingsAsked === true,
    rev: typeof raw.rev === 'number' && raw.rev >= 0 ? Math.floor(raw.rev) : 0,
  };
  // the questions of earlier, unanswered visits (whole numbers, known moments only)
  if (isObj(raw.asked)) {
    const asked: Record<MomentId, number> = {};
    for (const [id, n] of Object.entries(raw.asked)) if (ids.has(id) && typeof n === 'number' && n > 0) asked[id] = Math.min(MAX_QUESTIONS_PER_MOMENT, Math.floor(n));
    if (Object.keys(asked).length) e.asked = asked;
  }
  const exploredIds = new Set(exploredInOrder(e).map((x) => x.moment.id));
  const view = parseWholeViewRecord(raw.wholeView, ids, exploredIds);
  if (view) e.wholeView = view;
  if (Array.isArray(raw.wholeViewHistory)) {
    const history = raw.wholeViewHistory.map((w) => parseWholeViewRecord(w, ids, exploredIds)).filter((w): w is WholeViewRecord => w !== null).slice(0, MAX_WHOLE_VIEWS);
    if (history.length) e.wholeViewHistory = history;
  }
  if (isObj(raw.wholeViewFailedFor) && str(raw.wholeViewFailedFor.basedOn, 80) && typeof raw.wholeViewFailedFor.count === 'number')
    e.wholeViewFailedFor = { basedOn: str(raw.wholeViewFailedFor.basedOn, 80) as string, count: Math.min(MAX_WHOLE_VIEW_FAILURES, Math.max(1, Math.floor(raw.wholeViewFailedFor.count))) };
  return e;
}

// ------------------------------------------------------------------------------------------------ compatibility with every existing reader

/**
 * The three fields every existing reader of a saved dream relies on (the archive list and detail, titles, pattern reflection):
 * filled from the journey, never invented. selectedElement / reflectionResponse come from the FIRST explored moment; the reflection
 * from the whole view when there is one, otherwise from that moment's insight. Fields with no source stay empty / null.
 * Returns null when nothing was explored yet (such a dream is not saved).
 */
export function compatFieldsFromExploration(
  e: Exploration,
  groundingStatement: string,
): { selectedElement: string; reflectionResponse: string; dreamReflection: DreamReflectionResult } | null {
  const first = exploredInOrder(e)[0];
  if (!first || !first.entry.answer || !first.entry.insight) return null;
  // a factual summary or "no link yet" is not a whole view: the archive keeps the first moment's insight instead
  const w = e.wholeView && (e.wholeView.kind ?? 'whole') !== 'factual-summary' && e.wholeView.kind !== 'no-link' ? e.wholeView : null;
  return {
    selectedElement: first.moment.label,
    reflectionResponse: first.entry.answer,
    dreamReflection: {
      observation: w?.overview ?? first.entry.insight.observation,
      personalAssociation: first.entry.insight.reflection,
      possibleThread: first.entry.insight.possibility,
      continuityQuestion: w?.closingQuestion || first.entry.question,
      lenses: { cognitive: null, jungian: null, psychodynamic: null },
      confidenceNotes: [],
      summary: null,
      alternativeReadings: w && w.readings.length > 0 ? w.readings.map((r) => ({ basis: r.basis, reading: r.reading })) : null,
      existentialLens: null,
      groundingStatement,
    },
  };
}

function parseWholeViewRecord(raw: unknown, ids: Set<string>, exploredIds: Set<string>): WholeViewRecord | null {
  if (!isObj(raw)) return null;
  const w = raw;
  const overview = str(w.overview, 2000);
  const closingQuestion = str(w.closingQuestion, 400) ?? '';
  const basedOn = str(w.basedOn, 80);
  const kind: WholeViewKind = typeof w.kind === 'string' && ['whole', 'first-look', 'no-link', 'factual-summary'].includes(w.kind) ? (w.kind as WholeViewKind) : 'whole';
  // an older whole view always had a closing question; a newer one may have none (it did not pass its checks)
  if (!overview || !basedOn || (!closingQuestion && w.kind === undefined)) return null;
  return {
    basedOn,
    momentIds: Array.isArray(w.momentIds) ? w.momentIds.filter((x): x is string => typeof x === 'string' && ids.has(x)) : [],
    generatedAt: str(w.generatedAt, 40) ?? '',
    overview,
    recurring: str(w.recurring, 800),
    contrast: str(w.contrast, 800),
    readings: Array.isArray(w.readings)
      ? w.readings.filter(isObj).map((r) => ({ basis: str(r.basis, 300) ?? '', reading: str(r.reading, 800) ?? '' })).filter((r) => r.basis && r.reading).slice(0, 2)
      : [],
    closingQuestion,
    connections: Array.isArray(w.connections)
      ? w.connections
          .filter(isObj)
          .map((c) => {
            const fromQuote = str(c.fromQuote, 300);
            const toQuote = str(c.toQuote, 300);
            return { from: String(c.from), to: String(c.to), title: str(c.title, 120) ?? '', basis: str(c.basis, 400) ?? '', ...(fromQuote ? { fromQuote } : {}), ...(toQuote ? { toQuote } : {}), ...(c.carried === true ? { carried: true } : {}) };
          })
          .filter((c) => c.from !== c.to && exploredIds.has(c.from) && exploredIds.has(c.to) && c.title && c.basis)
          .slice(0, 4)
      : [],
    kind,
    notice: str(w.notice, 400),
    invite: Array.isArray(w.invite) ? w.invite.filter((x): x is string => typeof x === 'string' && ids.has(x) && !exploredIds.has(x)) : [],
    ...(cleanTakeaways(w.takeaways) ? { takeaways: cleanTakeaways(w.takeaways) } : {}),
    ...(kind === 'factual-summary' ? { failures: typeof w.failures === 'number' ? Math.min(MAX_WHOLE_VIEW_FAILURES, Math.max(1, Math.floor(w.failures))) : 1 } : {}),
  };
}
