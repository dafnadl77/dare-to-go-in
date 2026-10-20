import type { DreamReflectionResult } from './dreamReflectionSchema.js';

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
  /** The question written for this moment in advance, if any (only honest as-is for the FIRST moment explored). */
  pregeneratedQuestion: string | null;
}

export interface MomentInsight {
  observation: string;
  reflection: string;
  possibility: string;
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
}

export interface WholeViewConnection {
  from: MomentId;
  to: MomentId;
  title: string;
  basis: string;
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
  closingQuestion: string;
  connections: WholeViewConnection[];
}

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
  /** Bumped on every change; a save to the account checks it so two tabs never overwrite each other. */
  rev: number;
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
}

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

/** The honest question source for the next moment: the pre-written question only when nothing was answered yet. */
export function questionPlanFor(e: Exploration, id: MomentId): { kind: 'ready'; question: string; source: QuestionSource } | { kind: 'needs-call' } {
  const m = momentById(e, id);
  if (m && exploredCount(e) === 0 && m.pregeneratedQuestion) return { kind: 'ready', question: m.pregeneratedQuestion, source: 'pregenerated' };
  return { kind: 'needs-call' };
}

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
  if (entry.insight === null) return true;
  // The clarification was answered: exactly one refreshed insight, never a second.
  return entry.followUp !== null && entry.followUp.answer !== null && !entry.insightFromFollowUp;
}

/** The clarification is still waiting for an answer or a skip. */
export const followUpPending = (entry: ExploredMoment) => entry.followUp !== null && entry.followUp.answer === null && !entry.followUp.skipped;

/** A whole view is written only on request, only from at least one explored moment, only when the answers changed since the last one,
    and only within the per-dream limit. Opening a saved map, revisiting a moment or asking twice never calls again. */
export function canRequestWholeView(e: Exploration): boolean {
  if (exploredCount(e) === 0 || exploringId(e) !== null) return false;
  if (e.wholeViewCount >= MAX_WHOLE_VIEWS) return false;
  return e.wholeView === null || wholeViewIsStale(e);
}

// ------------------------------------------------------------------------------------------------ steps (each returns the same object when not allowed)

/** Starts exploring a moment with its question. Not allowed for an explored moment, an unknown one, or while another is open. */
export function beginMoment(e: Exploration, id: MomentId, question: string, source: QuestionSource, now = new Date()): Exploration {
  const q = clean(question, 300);
  if (!q || !momentById(e, id) || e.explored[id] || exploringId(e) !== null) return e;
  const entry: ExploredMoment = { status: 'exploring', question: q, questionSource: source, answer: null, followUp: null, insight: null, insightFromFollowUp: false, order: 0, startedAt: nowIso(now), exploredAt: null };
  return bump(e, { explored: { ...e.explored, [id]: entry } });
}

/** Leaves a moment that was opened but not answered (the dreamer went back to the map). */
export function abandonMoment(e: Exploration, id: MomentId): Exploration {
  const entry = e.explored[id];
  if (!entry || entry.status !== 'exploring' || entry.answer !== null) return e;
  const explored = { ...e.explored };
  delete explored[id];
  return bump(e, { explored });
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
  if (entry.followUp?.answer && !entry.insightFromFollowUp && !options.keepFirstInsight) return e;
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
  if (!overview || !closingQuestion) return e;
  const seen = new Set<string>();
  const connections: WholeViewConnection[] = [];
  for (const c of view.connections ?? []) {
    const title = clean(c.title, 120);
    const basis = clean(c.basis, 400);
    const pair = [c.from, c.to].sort().join('|');
    if (c.from === c.to || !explored.has(c.from) || !explored.has(c.to) || !title || !basis || seen.has(pair)) continue;
    seen.add(pair);
    connections.push({ from: c.from, to: c.to, title, basis });
  }
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
  };
  return bump(e, { wholeView: record, wholeViewCount: e.wholeViewCount + 1 });
}

function cleanInsight(insight: MomentInsight | null | undefined): MomentInsight | null {
  if (!insight) return null;
  const observation = clean(insight.observation, 800);
  const reflection = clean(insight.reflection, 800);
  const possibility = clean(insight.possibility, 800);
  return observation && reflection && possibility ? { observation, reflection, possibility } : null;
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
    moments.push({ id, label, rawLabel: str(m.rawLabel, 200), excerpt: str(m.excerpt, 300), pregeneratedQuestion: str(m.pregeneratedQuestion, 300) });
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
      if (status === 'explored' && (!answer || !insight)) continue;
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
  if (isObj(raw.wholeView)) {
    const w = raw.wholeView;
    const overview = str(w.overview, 2000);
    const closingQuestion = str(w.closingQuestion, 400);
    const basedOn = str(w.basedOn, 80);
    if (overview && closingQuestion && basedOn) {
      const exploredIds = new Set(exploredInOrder(e).map((x) => x.moment.id));
      e.wholeView = {
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
              .map((c) => ({ from: String(c.from), to: String(c.to), title: str(c.title, 120) ?? '', basis: str(c.basis, 400) ?? '' }))
              .filter((c) => c.from !== c.to && exploredIds.has(c.from) && exploredIds.has(c.to) && c.title && c.basis)
              .slice(0, 4)
          : [],
      };
    }
  }
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
  const w = e.wholeView;
  return {
    selectedElement: first.moment.label,
    reflectionResponse: first.entry.answer,
    dreamReflection: {
      observation: w?.overview ?? first.entry.insight.observation,
      personalAssociation: first.entry.insight.reflection,
      possibleThread: first.entry.insight.possibility,
      continuityQuestion: w?.closingQuestion ?? first.entry.question,
      lenses: { cognitive: null, jungian: null, psychodynamic: null },
      confidenceNotes: [],
      summary: null,
      alternativeReadings: w && w.readings.length > 0 ? w.readings.map((r) => ({ basis: r.basis, reading: r.reading })) : null,
      existentialLens: null,
      groundingStatement,
    },
  };
}
