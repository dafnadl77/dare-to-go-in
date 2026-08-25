import type { DreamInput } from './dreamInput';

/** A single recognized element, traceable back to the user's own words. */
export interface DreamEntity {
  /** The literal word/phrase as the user said or typed it. */
  original: string;
  /** A normalized form (e.g. "אמא" -> "mother"), still not invented content. */
  normalized: string;
  confidence: number;
}

/**
 * Structured breakdown of a dream, derived ONLY from what the user
 * actually said or typed. Every array may be empty — an empty array
 * means nothing of that kind was found, never a placeholder guess.
 */
export interface DreamAnalysis {
  language: string;
  people: DreamEntity[];
  places: DreamEntity[];
  objects: DreamEntity[];
  actions: DreamEntity[];
  emotions: DreamEntity[];
  environment: DreamEntity[];
  relationships: DreamEntity[];
  unusualElements: DreamEntity[];
  narrativeSummary: string;
  emotionalTone: string;
  visualPromptFoundation: string;
}

/**
 * Service boundary for the future real analysis backend. NOT implemented —
 * intentionally throws rather than returning a fabricated DreamAnalysis.
 * When this is wired up, it must derive every field solely from
 * `dreamInput.originalText` / `dreamInput.transcript`, never invent
 * elements the user didn't actually mention (no "hotel", "falling", "dog",
 * "fire", etc. unless genuinely present in their words), and skip symbolic
 * interpretation — that is a later, separate stage.
 */
export async function analyzeDream(dreamInput: DreamInput): Promise<DreamAnalysis> {
  void dreamInput;
  throw new Error('analyzeDream is not implemented yet — no AI analysis backend is connected.');
}
