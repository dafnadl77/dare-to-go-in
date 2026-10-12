import { useEffect, useRef, useState } from 'react';

export type Phase = 'black' | 'emerging' | 'title' | 'prompt' | 'interaction' | 'idle';

/** Millisecond marks at which each phase begins, from experience start (the first opening of a visit). */
const FIRST_OPENING_MS: Record<Phase, number> = {
  black: 0,
  emerging: 600,
  title: 1500,
  // Title is substantially resolved well before its slowest character
  // finishes its flicker (~3.8s); the question follows right after.
  prompt: 3500,
  interaction: 3900,
  idle: 4300,
};

/** Coming back to the opening within the same visit (e.g. from About or Packages) plays the same sequence, quicker. */
const RETURN_SPEED = 0.4;

const PHASE_ORDER: Phase[] = ['black', 'emerging', 'title', 'prompt', 'interaction', 'idle'];

let openingCompletedThisVisit = false;

/** Speed multiplier for the opening's own timings (title flicker included): 1 on the first opening, shorter on a return. */
export function openingScale(): number {
  return openingCompletedThisVisit ? RETURN_SPEED : 1;
}

/** The phase marks for the opening that is starting now. */
export function phaseStartMs(): Record<Phase, number> {
  const scale = openingScale();
  const marks = {} as Record<Phase, number>;
  for (const phase of PHASE_ORDER) marks[phase] = FIRST_OPENING_MS[phase] * scale;
  return marks;
}

/**
 * Drives the cinematic opening sequence. `startTime` is a shared
 * performance.now() anchor — child components run their own rAF loops and
 * compute continuous progress against it, so only discrete phase changes
 * (mount/unmount of UI) go through React state.
 */
export function useOpeningSequence() {
  const startTimeRef = useRef(performance.now());
  const [phase, setPhase] = useState<Phase>('black');

  useEffect(() => {
    const marks = phaseStartMs();
    const timers = PHASE_ORDER.filter((p) => p !== 'black').map((p) =>
      setTimeout(() => {
        setPhase(p);
        if (p === 'idle') openingCompletedThisVisit = true;
      }, marks[p]),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return { phase, startTime: startTimeRef.current };
}

export function elapsedSeconds(startTime: number): number {
  return (performance.now() - startTime) / 1000;
}
