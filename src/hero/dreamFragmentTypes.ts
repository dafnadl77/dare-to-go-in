/**
 * Structured shape for a remembered fragment. This is the contract the
 * future Speech-to-Text + AI pipeline will produce — for this stage we only
 * feed it a small demo stream so the visual system can be built against the
 * real shape ahead of time. No classification logic lives here yet.
 */
export type DreamFragmentType =
  | 'person'
  | 'place'
  | 'object'
  | 'emotion'
  | 'action'
  | 'transition'
  | 'environment';

export interface DreamFragment {
  text: string;
  type: DreamFragmentType;
  confidence: number;
}

/** Demo-only stream, standing in for real transcription during this stage. */
export const DEMO_DREAM_FRAGMENTS: DreamFragment[] = [
  { text: 'HOTEL', type: 'place', confidence: 0.81 },
  { text: 'WATER', type: 'environment', confidence: 0.92 },
  { text: 'MOTHER', type: 'person', confidence: 0.77 },
  { text: 'RUNNING', type: 'action', confidence: 0.68 },
  { text: 'DOOR', type: 'object', confidence: 0.85 },
  { text: 'FALLING', type: 'transition', confidence: 0.71 },
  { text: 'UNKNOWN PLACE', type: 'place', confidence: 0.54 },
];
