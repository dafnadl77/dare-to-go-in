import { useEffect, useState, type RefObject } from 'react';
import { linkPath, rimPoint, spokePath, type Point } from './mapLayout';
import type { MapConnection } from './mapTypes';

interface Spoke {
  id: string;
  d: string;
  rim: Point;
  anchor: Point;
  explored: boolean;
}

interface Link {
  id: string;
  d: string;
}

interface MapLinksProps {
  containerRef: RefObject<HTMLDivElement | null>;
  portalRef: RefObject<HTMLDivElement | null>;
  cardRefs: RefObject<Map<string, HTMLElement>>;
  momentIds: string[];
  explored: ReadonlySet<string>;
  /** Shown only once the whole view found them; empty before. */
  connections: MapConnection[];
  /** A moment or link the dreamer is pointing at / focusing: its lines brighten, the rest step back. */
  activeMomentId: string | null;
  activeConnectionId: string | null;
  /** Bumped whenever the layout may have moved (dataset, language, explored set). */
  layoutKey: string;
}

/** How far a card's line enters from its top edge: at the height of the number badge and the title, as in the concept. */
const ANCHOR_FROM_TOP = 46;
/** The link ring runs just outside the picture's glow. */
const RING_GAP = 20;
const RING_STEP = 11;

/**
 * The glowing lines of the desktop map, drawn in one SVG layer UNDER the cards: every line ends at a card's inner edge and never
 * enters it, so no line crosses text. Purely decorative (aria-hidden): everything the lines say is also in the text (the card status,
 * the list of links), so a screen reader loses nothing. Positions are measured from the real layout, never hard-coded.
 */
export default function MapLinks({
  containerRef,
  portalRef,
  cardRefs,
  momentIds,
  explored,
  connections,
  activeMomentId,
  activeConnectionId,
  layoutKey,
}: MapLinksProps) {
  const [geometry, setGeometry] = useState<{ w: number; h: number; spokes: Spoke[]; links: Link[] } | null>(null);

  // useEffect, not useLayoutEffect: the refs of the parent and of the later siblings (the picture, the end column) are attached only
  // after this child's layout effects run, so measuring there finds nothing on the first mount.
  useEffect(() => {
    const container = containerRef.current;
    const portal = portalRef.current;
    if (!container || !portal) return;

    const measure = () => {
      const box = container.getBoundingClientRect();
      const pr = portal.getBoundingClientRect();
      const center = { x: pr.left - box.left + pr.width / 2, y: pr.top - box.top + pr.height / 2 };
      const radius = pr.width / 2;
      const anchors = new Map<string, Point>();
      for (const id of momentIds) {
        const el = cardRefs.current?.get(id);
        if (!el) continue;
        const cr = el.getBoundingClientRect();
        const left = cr.left - box.left;
        const cardOnLeft = left + cr.width / 2 < center.x;
        anchors.set(id, { x: cardOnLeft ? left + cr.width : left, y: cr.top - box.top + Math.min(ANCHOR_FROM_TOP, cr.height / 2) });
      }
      const spokes: Spoke[] = [];
      for (const id of momentIds) {
        const anchor = anchors.get(id);
        if (!anchor) continue;
        const rim = rimPoint(center, radius + 4, anchor);
        spokes.push({ id, d: spokePath(rim, anchor), rim, anchor, explored: explored.has(id) });
      }
      const links: Link[] = [];
      // Each link rides its own ring, a little further out, so two links are always two visible lines.
      connections.forEach((c, i) => {
        const a = anchors.get(c.from);
        const b = anchors.get(c.to);
        if (a && b) links.push({ id: c.id, d: linkPath(center, radius + RING_GAP + i * RING_STEP, a, b) });
      });
      setGeometry({ w: box.width, h: box.height, spokes, links });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    cardRefs.current?.forEach((el) => observer.observe(el));
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
    // layoutKey stands for every input that can move a card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, connections]);

  if (!geometry) return null;

  const related = new Set<string>();
  if (activeConnectionId) {
    const c = connections.find((x) => x.id === activeConnectionId);
    if (c) related.add(c.from).add(c.to);
  }
  if (activeMomentId) related.add(activeMomentId);
  const focusing = related.size > 0;

  return (
    <svg className="dm-links" width={geometry.w} height={geometry.h} viewBox={`0 0 ${geometry.w} ${geometry.h}`} aria-hidden="true" focusable="false">
      {geometry.spokes.map((s, i) => {
        const state = focusing ? (related.has(s.id) ? 'on' : 'dim') : 'idle';
        return (
          <g key={`${s.id}-${s.explored ? 'x' : 'u'}`} className={`dm-spoke ${s.explored ? 'is-explored' : 'is-unexplored'}`} data-state={state} style={{ ['--i' as string]: i }}>
            {s.explored && <path className="dm-line-glow dm-draw" d={s.d} pathLength={1} />}
            <path className={`dm-line ${s.explored ? 'dm-draw' : ''}`} d={s.d} pathLength={1} />
            <circle className="dm-dot" cx={s.anchor.x} cy={s.anchor.y} r={s.explored ? 4 : 3} />
            <circle className="dm-dot dm-dot-rim" cx={s.rim.x} cy={s.rim.y} r={s.explored ? 3.5 : 2.5} />
          </g>
        );
      })}
      {geometry.links.map((l, i) => {
        const state = activeConnectionId ? (l.id === activeConnectionId ? 'on' : 'dim') : focusing ? (connections.find((c) => c.id === l.id && (related.has(c.from) || related.has(c.to))) ? 'on' : 'dim') : 'idle';
        return (
          <g key={l.id} className="dm-link" data-state={state} style={{ ['--i' as string]: i }}>
            <path className="dm-line-glow dm-draw dm-draw-late" d={l.d} pathLength={1} />
            <path className="dm-line dm-draw dm-draw-late" d={l.d} pathLength={1} />
          </g>
        );
      })}
    </svg>
  );
}
