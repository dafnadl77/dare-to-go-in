export type EchoZoneId = 'mirror' | 'ceiling' | 'window' | 'lampLeft' | 'lampRight';

export interface EchoZone {
  id: EchoZoneId;
  /** Normalized viewport fractions (0..1). */
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  /** Cursor must dwell inside the zone this long before the echo triggers. Unused (kept large) for the lamps, which are autonomous-only. */
  dwellMs: number;
}

export const ECHO_ZONES: Record<EchoZoneId, EchoZone> = {
  mirror: { id: 'mirror', xMin: 0.76, xMax: 0.97, yMin: 0.2, yMax: 0.55, dwellMs: 780 },
  ceiling: { id: 'ceiling', xMin: 0.0, xMax: 1.0, yMin: 0.0, yMax: 0.3, dwellMs: 600 },
  window: { id: 'window', xMin: 0.4, xMax: 0.66, yMin: 0.42, yMax: 0.78, dwellMs: 900 },
  /** The two bedside lamps — re-measured directly from the reference
      photo by scanning for bright warm (lamp-glow) pixel clusters rather
      than by eye. Left: the bed's own nightstand lamp, hard against the
      left edge. Right: the table lamp by the far-right armchair. */
  lampLeft: { id: 'lampLeft', xMin: 0.0, xMax: 0.028, yMin: 0.38, yMax: 0.68, dwellMs: 999999 },
  lampRight: { id: 'lampRight', xMin: 0.695, xMax: 0.79, yMin: 0.56, yMax: 0.68, dwellMs: 999999 },
};

export interface ExclusionRect {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/**
 * Books + console table on the right wall, below the mirror. Hard-excluded
 * from every cursor-reactive and autonomous effect (Memory Veil clarity,
 * echoes, everything) — must stay exactly as filmed. Kept clear of the
 * mirror zone above it (yMax 0.55) and the bed zone to the left (xMax 0.42).
 */
export const CONSOLE_EXCLUDE_ZONE: ExclusionRect = { xMin: 0.5, xMax: 1.0, yMin: 0.56, yMax: 0.95 };

export function isInsideRect(rect: ExclusionRect, fx: number, fy: number): boolean {
  return fx >= rect.xMin && fx <= rect.xMax && fy >= rect.yMin && fy <= rect.yMax;
}

export function isInsideZone(zone: EchoZone, fx: number, fy: number): boolean {
  return isInsideRect(zone, fx, fy);
}

export function zoneStyle(zone: EchoZone): { left: string; right: string; top: string; bottom: string } {
  return {
    left: `${zone.xMin * 100}%`,
    right: `${(1 - zone.xMax) * 100}%`,
    top: `${zone.yMin * 100}%`,
    bottom: `${(1 - zone.yMax) * 100}%`,
  };
}
