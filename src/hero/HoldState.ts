export interface HoldState {
  active: boolean;
  /** 0..1 fill progress of the hold interaction. */
  progress: number;
  /** Screen-space center of the hold button, for veil focus. */
  cx: number;
  cy: number;
}

export function createHoldState(): HoldState {
  return { active: false, progress: 0, cx: 0, cy: 0 };
}
