export type DreamEventType = 'bed' | 'art' | 'mirror';

export interface DreamEventState {
  activeType: DreamEventType | null;
  startTime: number;
  inMs: number;
  holdMs: number;
  outMs: number;
}

export function createDreamEventState(): DreamEventState {
  return { activeType: null, startTime: 0, inMs: 0, holdMs: 0, outMs: 0 };
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Rise -> hold -> fall over the event's own elapsed ms, using its explicit phase durations. Returns null once the event has fully finished. */
export function dreamEventEnvelope(elapsedMs: number, s: DreamEventState): number | null {
  if (elapsedMs < s.inMs) return easeInOutCubic(s.inMs > 0 ? elapsedMs / s.inMs : 1);
  if (elapsedMs < s.inMs + s.holdMs) return 1;
  const outT = s.outMs > 0 ? (elapsedMs - s.inMs - s.holdMs) / s.outMs : 1;
  if (outT >= 1) return null;
  return 1 - easeInOutCubic(outT);
}
