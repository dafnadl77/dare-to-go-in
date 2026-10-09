import { createTextDreamInput, type DreamInput } from './dreamInput';

/**
 * "I'M DONE" in the typing box. A dream is only handed to the analysis when there is something written (or transcribed) to analyze.
 *
 * Before this, I'M DONE with an EMPTY box went straight on: the capture was submitted, the screen moved to "I think I have it", the
 * analysis immediately refused the empty text, and the dreamer landed on "Something went wrong while I was putting this together" —
 * which is exactly what happened to a dreamer with no microphone who pressed record (getting the typing box, empty, with a kind note)
 * and then pressed I'M DONE. Nothing in that path was an AI problem; there was simply nothing to analyze.
 *
 * Pure (the screen's reactions are passed in), so the rule is tested without a browser.
 */

/** Something real to analyze: at least one letter or digit. Whitespace or punctuation alone is not a dream. */
export function hasDreamText(entry: string): boolean {
  return /[\p{L}\p{N}]/u.test(entry);
}

export type SubmitOutcome = 'submitted' | 'blocked_empty';

export function submitTypedDream(
  entry: string,
  hooks: {
    /** Hands the captured dream on; this is what starts the analysis. */
    onCapture?: (input: DreamInput) => void;
    /** The screen moves on (clears the box, shows the settled state). */
    onSubmitted: () => void;
  },
): SubmitOutcome {
  if (!hasDreamText(entry)) return 'blocked_empty';
  hooks.onCapture?.(createTextDreamInput(entry));
  hooks.onSubmitted();
  return 'submitted';
}
