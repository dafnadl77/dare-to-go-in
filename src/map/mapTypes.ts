/**
 * The Dream Map's data, as the map screen reads it. PROTOTYPE STAGE: only synthetic data (syntheticDreams.ts) fills it; nothing here
 * talks to a server. The shape follows the plan (docs/upgrade-2026-10/23-dream-map-plan.md, section 2), so the real journey can fill it
 * later without changing the map components.
 */
export type MapLanguage = 'he' | 'en';

export type MomentStatus = 'unexplored' | 'exploring' | 'explored';

export interface MomentInsight {
  /** One short sentence: what the card shows. */
  headline: string;
  /** The full insight shown when the moment is opened. */
  full: string;
}

export interface MapMoment {
  /** Stable within one dream (m1..m6). */
  id: string;
  title: string;
  /** A sentence taken from the dream's own text, or null when none matches (never written by a model). */
  excerpt: string | null;
  question: string;
  answer: string;
  /** The optional clarification: present only when one was asked; answer null = skipped. */
  followUp?: { question: string; answer: string | null };
  insight: MomentInsight;
}

/** A link between two explored moments that the whole view found, with the words it rests on. */
export interface MapConnection {
  id: string;
  from: string;
  to: string;
  title: string;
  basis: string;
}

export interface WholeView {
  /** The explored moments this view was written from. */
  basedOn: string[];
  overview: string;
  recurring: string | null;
  contrast: string | null;
  readings: { basis: string; reading: string }[];
  closingQuestion: string;
  connections: MapConnection[];
}

export interface MapDream {
  key: string;
  /** Shown in the prototype's own toolbar only. */
  label: string;
  language: MapLanguage;
  date: string;
  sourceText: string;
  imageSrc: string;
  /** A frightening or charged dream: the reveal stays quiet. */
  sensitive?: boolean;
  /** Every moment offered for this dream, in order. */
  moments: MapMoment[];
  /** Which of them the dreamer had already explored when the map opens. */
  initiallyExplored: string[];
  /** Whole views written in advance for the prototype, matched by the set of explored moments they are based on. */
  wholeViews: WholeView[];
}
