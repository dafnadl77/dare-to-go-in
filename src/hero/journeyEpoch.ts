/**
 * A dream JOURNEY is everything from capturing a dream to saving or leaving it.
 * Every asynchronous result that can change the active journey (analysis, labels,
 * image, image regeneration, reflection) must still belong to the SAME journey when
 * it arrives. The epoch is a counter that is bumped whenever a journey is abandoned,
 * reset or replaced (going home, letting it go, leaving the screen); a response
 * that started under an older epoch is then a harmless no-op and can never
 * populate a new dream.
 *
 * Requests inside one journey are sequential and share its epoch, so a legitimate
 * follow-up (initial image, then a regeneration; analysis, then labels) is never
 * discarded by this alone; overlapping requests of the SAME kind are additionally
 * ordered by their own tokens in HeroDream.
 */
export interface JourneyEpoch {
  /** The epoch a new request should capture when it starts. */
  current(): number;
  /** Abandons the current journey: every response captured under an older epoch is now stale. */
  invalidate(): number;
  /** Whether a captured epoch still belongs to the active journey. */
  isCurrent(captured: number): boolean;
}

export function createJourneyEpoch(): JourneyEpoch {
  let value = 0;
  return {
    current: () => value,
    invalidate: () => {
      value += 1;
      return value;
    },
    isCurrent: (captured) => captured === value,
  };
}

/**
 * Starts `task` under the CURRENT epoch and applies its result only if that epoch
 * is still current when it settles. A rejected task is handed to `onError` under
 * the same rule. Never throws: an old journey's late failure is ignored too.
 */
export function runInJourney<T>(
  epoch: JourneyEpoch,
  task: () => Promise<T>,
  apply: (result: T) => void,
  onError?: (error: unknown) => void,
): Promise<void> {
  const captured = epoch.current();
  return task().then(
    (result) => {
      if (epoch.isCurrent(captured)) apply(result);
    },
    (error) => {
      if (epoch.isCurrent(captured)) onError?.(error);
    },
  );
}
