import type { AppLanguage } from '../../src/hero/appLanguage.js';
import { JOURNAL_MAX_DREAMS } from '../../src/archive/journalLimits.js';

/**
 * The data model the Dream Journal PDF is built from. Every field is something DARE ACTUALLY
 * stores for a saved dream (see SavedDream / dreams.payload): nothing here is generated at export
 * time, and a field that is missing or empty is simply null so that no empty heading is ever drawn.
 */
export interface JournalImage {
  /** `data:image/(jpeg|png|webp);base64,...` built from bytes that were validated as a real image. */
  dataUri: string;
  width: number;
  height: number;
}

export interface JournalDream {
  id: string;
  /** ISO timestamp of the saved dream (`created_at`). */
  createdAt: string;
  /** The journey language the dream was saved in. Drives this section's direction and labels; content is never translated. */
  language: AppLanguage;
  title: string;
  /** The dreamer's original words, exactly as stored. */
  sourceText: string;
  selectedElement: string | null;
  /** The dreamer's own association (stored `reflectionResponse`). */
  association: string | null;
  /** Stored `dreamReflection.possibleThread`. */
  thread: string | null;
  /** Stored `dreamReflection.continuityQuestion`. */
  question: string | null;
  image: JournalImage | null;
}

export interface JournalPattern {
  id: string;
  /** The language the stored Pattern Reflection was written in. */
  language: AppLanguage;
  /** Localized concept label. */
  label: string;
  whatRepeats: string;
  possibleConnection: string;
  directionToExplore: string;
  question: string;
  /** A real image from one of the dreams the pattern is about (already part of this export), if any. */
  thumbnail: JournalImage | null;
}

export interface JournalDocument {
  /** The language of the cover, table of contents and closing page. */
  language: AppLanguage;
  /** An IANA time zone used to format dates; falls back to UTC. */
  timeZone: string;
  dreams: JournalDream[];
  patterns: JournalPattern[];
}

/** Hard bounds on one export (the route answers 413 export_too_large beyond them). */
export const JOURNAL_LIMITS = {
  maxDreams: JOURNAL_MAX_DREAMS,
  /**
   * Sum of all validated image bytes. Measured on Vercel Preview: peak memory grows ~30 MB per image-MB (60 dreams with
   * 26 MB of images peaked at 1.3 GB, 42 MB at 1.9 GB of the ~2.3 GB available), so 32 MB keeps a comfortable margin.
   */
  maxTotalImageBytes: 32 * 1024 * 1024,
  maxSingleImageBytes: 6 * 1024 * 1024,
  /** Sum of all text characters across dreams and patterns. */
  maxTotalTextChars: 1_500_000,
} as const;

/** A dream section is only given a Table of Contents when there are enough of them for it to add value. */
export const TOC_MIN_DREAMS = 3;
