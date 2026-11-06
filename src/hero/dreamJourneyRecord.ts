import type { AppLanguage } from './appLanguage.js';
import type { DreamAnalysis } from './dreamAnalysisSchema.js';
import { getGroundingStatement, type DreamReflectionResult } from './dreamReflectionSchema.js';

/**
 * AN OPEN DREAM IN THE ACCOUNT (autosave, 2026-11-05). A dream is written to its `dreams` row when its analysis ends, and the same row
 * follows the journey: `journey` says how far it went. Pure, so the rules are testable exactly; the server and the browser share it.
 * A dream without `journey` (everything saved before this existed) is a finished dream: nothing about it changes.
 */

/** The last place of an open dream; opening it from the archive continues exactly there. */
export type JourneyStep = 'analysis' | 'reveal' | 'feelings' | 'map' | 'interpreting' | 'reflection' | 'closing';

export interface DreamJourneyState {
  status: 'open' | 'done';
  step: JourneyStep;
  /** The moment whose window was open, if any. */
  momentId: string | null;
  /** The row's version: a write counts only on the version it read, so two devices never overwrite each other. */
  rev: number;
  /** The saved `dreamReflection` is the real one, not the empty shape of an unfinished dream. */
  reflected?: boolean;
}

export const isOpenDream = (dream: { journey?: DreamJourneyState | null }): boolean => dream.journey?.status === 'open';

/** The reflection field of a dream not reflected on yet: the right shape, so nothing that reads a saved dream ever breaks on it. */
export function emptyReflection(language: AppLanguage): DreamReflectionResult {
  return {
    observation: '',
    personalAssociation: '',
    possibleThread: '',
    continuityQuestion: '',
    lenses: { cognitive: null, jungian: null, psychodynamic: null },
    confidenceNotes: [],
    groundingStatement: getGroundingStatement(language),
    summary: null,
  };
}

/** What the server writes when the analysis ends: the dream as told, at the very start of its journey (no image yet). */
export function openDreamPayload(p: { sourceText: string; inputMode: 'voice' | 'text'; analysis: DreamAnalysis; language: AppLanguage }) {
  return {
    sourceText: p.sourceText,
    inputMode: p.inputMode,
    dreamAnalysis: p.analysis,
    dreamImageDataUrl: null,
    dreamImagePath: null,
    selectedElement: '',
    reflectionResponse: '',
    dreamReflection: emptyReflection(p.language),
    corrections: [] as string[],
    appLanguage: p.language,
    journey: { status: 'open', step: 'analysis', momentId: null, rev: 0 } satisfies DreamJourneyState,
  };
}

/** Where the journey stands, from the screen's own two states. */
export function journeyStepOf(phase: string, insideStep: string): JourneyStep {
  if (phase !== 'inside') return phase === 'reveal' || phase === 'correcting' || phase === 'entering' ? 'reveal' : 'analysis';
  if (insideStep === 'map') return 'map';
  if (insideStep === 'interpreting') return 'interpreting';
  if (insideStep === 'reflection') return 'reflection';
  if (insideStep === 'closing' || insideStep === 'saving' || insideStep === 'saved') return 'closing';
  return 'feelings';
}

/**
 * Where an open dream comes back to. Without a picture the journey goes on from the analysis, as it would have (the picture is made on
 * the dream's own slots); with one it returns to the very step it left, past the opening and the reconstruction.
 */
export function resumePlan(journey: DreamJourneyState | null | undefined, hasImage: boolean): { phase: 'none' | 'reveal' | 'inside'; insideStep: 'emotions' | 'map' | 'interpreting' | 'reflection' | 'closing' } {
  const step = journey?.step ?? 'analysis';
  if (!hasImage) return { phase: 'none', insideStep: 'emotions' };
  // a picture saved while it was still appearing: she comes back to it, never to a second one
  if (step === 'analysis' || step === 'reveal') return { phase: 'reveal', insideStep: 'emotions' };
  if (step === 'feelings') return { phase: 'inside', insideStep: 'emotions' };
  // a reflection that was asked for but never reached the dream is asked for again (the server hands back a finished one)
  if ((step === 'reflection' || step === 'closing') && !journey?.reflected) return { phase: 'inside', insideStep: step === 'closing' ? 'closing' : 'interpreting' };
  return { phase: 'inside', insideStep: step };
}
