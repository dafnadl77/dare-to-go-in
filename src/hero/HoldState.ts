export interface HoldState {
  active: boolean;
  /** 0..1 fill progress of the hold interaction. */
  progress: number;
  /** Screen-space center of the hold button, for veil focus. */
  cx: number;
  cy: number;
  /** True while the room is actively listening (recording), independent of physical press. */
  listening: boolean;
  /** Smoothed 0..1 live voice amplitude while listening. */
  audioLevel: number;
}

export function createHoldState(): HoldState {
  return { active: false, progress: 0, cx: 0, cy: 0, listening: false, audioLevel: 0 };
}
