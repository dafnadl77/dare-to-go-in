import { useEffect, useRef, useState } from 'react';

export type Phase =
  | 'black'
  | 'emerging'
  | 'title'
  | 'environment'
  | 'prompt'
  | 'interaction'
  | 'idle';

/** Millisecond marks at which each phase begins, from experience start. */
export const PHASE_START_MS: Record<Phase, number> = {
  black: 0,
  emerging: 1500,
  title: 4000,
  environment: 7000,
  prompt: 10000,
  interaction: 12000,
  idle: 14000,
};

const PHASE_ORDER: Phase[] = [
  'black',
  'emerging',
  'title',
  'environment',
  'prompt',
  'interaction',
  'idle',
];

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
    const timers = PHASE_ORDER.filter((p) => p !== 'black').map((p) =>
      setTimeout(() => setPhase(p), PHASE_START_MS[p]),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return { phase, startTime: startTimeRef.current };
}

export function elapsedSeconds(startTime: number): number {
  return (performance.now() - startTime) / 1000;
}
