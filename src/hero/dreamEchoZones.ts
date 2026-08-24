export type EchoZoneId = 'bed' | 'mirror' | 'ceiling' | 'window' | 'lamp';

export interface EchoZone {
  id: EchoZoneId;
  /** Normalized viewport fractions (0..1). */
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  /** Cursor must dwell inside the zone this long before the echo triggers. */
  dwellMs: number;
}

export const ECHO_ZONES: Record<EchoZoneId, EchoZone> = {
  bed: { id: 'bed', xMin: 0.0, xMax: 0.42, yMin: 0.66, yMax: 1.0, dwellMs: 650 },
  mirror: { id: 'mirror', xMin: 0.76, xMax: 0.97, yMin: 0.2, yMax: 0.55, dwellMs: 780 },
  ceiling: { id: 'ceiling', xMin: 0.0, xMax: 1.0, yMin: 0.0, yMax: 0.3, dwellMs: 600 },
  window: { id: 'window', xMin: 0.4, xMax: 0.66, yMin: 0.42, yMax: 0.78, dwellMs: 900 },
  lamp: { id: 'lamp', xMin: 0.83, xMax: 0.97, yMin: 0.62, yMax: 0.82, dwellMs: 550 },
};

export function isInsideZone(zone: EchoZone, fx: number, fy: number): boolean {
  return fx >= zone.xMin && fx <= zone.xMax && fy >= zone.yMin && fy <= zone.yMax;
}

export function zoneStyle(zone: EchoZone): { left: string; right: string; top: string; bottom: string } {
  return {
    left: `${zone.xMin * 100}%`,
    right: `${(1 - zone.xMax) * 100}%`,
    top: `${zone.yMin * 100}%`,
    bottom: `${(1 - zone.yMax) * 100}%`,
  };
}
