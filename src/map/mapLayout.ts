/**
 * Where the moment cards sit around the dream picture. Pure functions, no DOM, so every count is unit-tested
 * (tests/dreamMapLayout.test.ts). The number of cards always comes from the dream itself; nothing here assumes four.
 */

/** Below this width the map is a vertical path (picture on top, moments below), never a shrunken desktop orbit. */
export const ORBIT_MIN_WIDTH = 1024;

export type MapMode = 'orbit' | 'path';

export function mapModeFor(width: number): MapMode {
  return width >= ORBIT_MIN_WIDTH ? 'orbit' : 'path';
}

export interface OrbitColumns {
  /** Moment indexes in the column on the reading-start side (right in Hebrew, left in English), top to bottom. */
  start: number[];
  /** Moment indexes in the column on the reading-end side, top to bottom. */
  end: number[];
}

/**
 * Splits `count` moments between the two columns beside the picture. The start side gets the extra one when the count is odd, and the
 * numbering runs down the start column first, then down the end column, so 1 is always where reading begins.
 * 1 → [1] | [] · 2 → [1] | [2] · 3 → [1,2] | [3] · 4 → [1,2] | [3,4] · 5 → [1,2,3] | [4,5] · 6 → [1,2,3] | [4,5,6].
 * More than six never happens today (deriveDreamElements caps at 6); if it ever does, the columns simply grow.
 */
export function orbitColumns(count: number): OrbitColumns {
  const n = Math.max(0, Math.floor(count));
  const startCount = Math.ceil(n / 2);
  const indexes = Array.from({ length: n }, (_, i) => i);
  return { start: indexes.slice(0, startCount), end: indexes.slice(startCount) };
}

export interface Point {
  x: number;
  y: number;
}

/** The point on a circle's rim facing `toward`. */
export function rimPoint(center: Point, radius: number, toward: Point): Point {
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: center.x + (dx / len) * radius, y: center.y + (dy / len) * radius };
}

/** A soft horizontal curve from the picture's rim to a card's inner edge (the line never enters the card, so it never crosses text). */
export function spokePath(from: Point, to: Point): string {
  const midX = (from.x + to.x) / 2;
  return `M ${r(from.x)} ${r(from.y)} C ${r(midX)} ${r(from.y)}, ${r(midX)} ${r(to.y)}, ${r(to.x)} ${r(to.y)}`;
}

/**
 * A link between two moments, drawn as: card A → the picture's rim → around the outside of the picture → the rim → card B. It travels
 * through the dream (the picture) instead of across other cards, so it never crosses text. The shorter way round is taken.
 */
export function linkPath(center: Point, ringRadius: number, a: Point, b: Point): string {
  const ra = rimPoint(center, ringRadius, a);
  const rb = rimPoint(center, ringRadius, b);
  const angleA = Math.atan2(ra.y - center.y, ra.x - center.x);
  const angleB = Math.atan2(rb.y - center.y, rb.x - center.x);
  let delta = angleB - angleA;
  while (delta <= -Math.PI) delta += 2 * Math.PI;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  // In screen coordinates (y down) an increasing angle turns clockwise, which is SVG's sweep-flag 1.
  const sweep = delta > 0 ? 1 : 0;
  return [
    `M ${r(a.x)} ${r(a.y)}`,
    `L ${r(ra.x)} ${r(ra.y)}`,
    `A ${r(ringRadius)} ${r(ringRadius)} 0 0 ${sweep} ${r(rb.x)} ${r(rb.y)}`,
    `L ${r(b.x)} ${r(b.y)}`,
  ].join(' ');
}

const r = (n: number): string => (Math.round(n * 10) / 10).toString();
