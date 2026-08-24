/**
 * Structured shape for a remembered fragment, extracted only from the
 * user's real transcript (spoken or typed) — see dreamLexicon.ts. There is
 * no demo/sample data anywhere in this pipeline; a fragment only exists if
 * its `original` text was literally found in what the user said or wrote.
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
  /** The literal word/phrase as it appeared in the transcript. */
  original: string;
  /** Normalized English label the visual layer renders. */
  label: string;
  type: DreamFragmentType;
  confidence: number;
}
