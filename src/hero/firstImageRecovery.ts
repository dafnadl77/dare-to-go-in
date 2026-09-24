/**
 * What the dreamer is offered when the FIRST image of an analyzed dream fails, before any
 * image exists. (A failure after a successful image is a different, already-correct flow.)
 *
 * Nothing here re-runs analysis or spends anything client-side: every retry reuses the dream's
 * own attemptId and brief, and the server's per-attempt image slots and refunds stay the only
 * accounting. The client cap exists because the server REFUNDS technical failures, so those
 * alone would never exhaust the allowance and a persistently failing provider could otherwise
 * be retried forever.
 */
export type FirstImageFailureKind = 'failed' | 'rejected' | 'limit';

/** Total image requests a dream may make before its first image succeeds (matches the server's 3 slots per attempt). */
export const MAX_FIRST_IMAGE_TRIES = 3;

/** Classifies the failing result's reason (a timeout arrives as an ordinary request_failed). */
export function classifyFirstImageFailure(reason: string | null | undefined): FirstImageFailureKind {
  if (reason === 'limit_reached') return 'limit';
  if (reason === 'content_rejected') return 'rejected';
  return 'failed';
}

export type FirstImageRecovery =
  /** Same brief, same attempt: try the image again. */
  | { action: 'retry' }
  /** Moderation rejected this description: let the dreamer rephrase it (the existing correction path), never resend it verbatim. */
  | { action: 'rephrase' }
  /** Nothing more can be done for this dream's image: explain, and offer the existing restart. */
  | { action: 'restart' };

export function recoveryForFirstImageFailure(kind: FirstImageFailureKind, triesSoFar: number): FirstImageRecovery {
  if (kind === 'limit' || triesSoFar >= MAX_FIRST_IMAGE_TRIES) return { action: 'restart' };
  return kind === 'rejected' ? { action: 'rephrase' } : { action: 'retry' };
}
