import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import DreamStageBackground from '../hero/DreamStageBackground';
import { usePointerParallax } from '../hero/usePointerParallax';
import { DREAM_CLIP_PATH, DREAM_CLIP_VIEWBOX, DREAM_CLIP_FEATHER_STD_DEVIATION } from '../hero/dreamClipShape';
import { MOCK_DREAMS, formatMockDate, type MockDream } from './mockDreams';
import './DreamArchive.css';

interface DreamArchiveProps {
  onBack: () => void;
}

/** Hand-placed constellation positions (percent of the stage) — deliberately
    asymmetric: one large near dream, two mid-distance ones either side, three
    smaller/further ones scattered behind, never a grid. Reused directly by
    both the portals themselves and the connection lines between them, so the
    two always agree on where things actually are. */
const LAYOUT: { left: number; top: number; size: number; z: number }[] = [
  { left: 45, top: 30, size: 320, z: 5 }, // The Open Door — centered, largest, nearest
  { left: 15, top: 48, size: 220, z: 3 }, // The Ocean
  { left: 76, top: 22, size: 260, z: 4 }, // Grandmother
  { left: 87, top: 60, size: 160, z: 2 }, // The Empty City
  { left: 22, top: 78, size: 185, z: 2 }, // Flying
  { left: 58, top: 82, size: 150, z: 1 }, // The Forest
];

/** Which pairs of dreams occasionally show a faint connecting thread —
    indices into MOCK_DREAMS/LAYOUT. Not every dream needs to connect to
    every other; a handful of threads reads as "a constellation," not a
    network diagram. */
const CONNECTIONS: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 4],
  [2, 3],
  [4, 5],
];

function ConnectionThreads() {
  return (
    <svg className="ar-threads" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {CONNECTIONS.map(([a, b], i) => {
        const from = LAYOUT[a];
        const to = LAYOUT[b];
        const d = `M ${from.left} ${from.top} L ${to.left} ${to.top}`;
        const dur = 9 + i * 1.7;
        return (
          <g key={i} className="ar-thread" style={{ '--thread-delay': `${i * -2.6}s`, '--thread-dur': `${dur}s` } as CSSProperties}>
            <path d={d} className="ar-thread-line" />
            <circle r="0.55" className="ar-thread-spark">
              <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={d} />
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

function DreamPortal({
  dream,
  layout,
  index,
  focused,
  dimmed,
  onOpen,
}: {
  dream: MockDream;
  layout: { left: number; top: number; size: number; z: number };
  index: number;
  focused: boolean;
  dimmed: boolean;
  onOpen: () => void;
}) {
  const maskId = `ar-mask-${dream.id}`;
  const featherId = `ar-feather-${dream.id}`;
  return (
    <button
      type="button"
      className="ar-portal"
      data-cursor-hover
      data-focused={focused ? 'true' : 'false'}
      data-dimmed={dimmed ? 'true' : 'false'}
      onClick={onOpen}
      aria-label={`Open ${dream.title}`}
      style={
        {
          '--px': `${layout.left}%`,
          '--py': `${layout.top}%`,
          '--psize': `${layout.size}px`,
          '--pz': layout.z,
          '--float-delay': `${index * -4.3}s`,
          '--float-dur': `${22 + index * 3.1}s`,
          zIndex: layout.z,
        } as CSSProperties
      }
    >
      <span className="ar-portal-inner">
        <span className="ar-portal-glow" aria-hidden="true" />
        <svg className="ar-portal-svg" viewBox={DREAM_CLIP_VIEWBOX} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <filter id={featherId} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation={DREAM_CLIP_FEATHER_STD_DEVIATION} />
            </filter>
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="2048" height="1152">
              <path d={DREAM_CLIP_PATH} fill="white" filter={`url(#${featherId})`} />
            </mask>
          </defs>
          <image
            href={dream.image}
            x="0"
            y="0"
            width="2048"
            height="1152"
            preserveAspectRatio="xMidYMid slice"
            mask={`url(#${maskId})`}
          />
        </svg>
        <span className="ar-portal-particles" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <span key={i} className="ar-portal-particle" style={{ '--pi': i } as CSSProperties} />
          ))}
        </span>
      </span>
      <span className="ar-portal-caption">
        <span className="ar-portal-title">{dream.title}</span>
        <span className="ar-portal-date">{formatMockDate(dream.date)}</span>
      </span>
    </button>
  );
}

/**
 * MY DREAM ARCHIVE — DREAM CONSTELLATION concept. A visual prototype only:
 * six mock dreams (see mockDreams.ts) stand in for a real saved-dreams list.
 * Each dream is a real SVG <mask>+feGaussianBlur portal — the exact same
 * organic KETEM.jpg-derived shape/feather already proven working for THIS
 * IS YOUR DREAM (see dreamClipShape.ts) — reused here rather than any new
 * clipping technique, since it's the one already confirmed to render
 * correctly. Never a circle, rectangle, card, or colored placeholder blob.
 */
export default function DreamArchive({ onBack }: DreamArchiveProps) {
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    bgVideoRef.current?.play().catch(() => {});
  }, []);

  const stageRef = useRef<HTMLDivElement>(null);
  usePointerParallax(stageRef, 8, true);

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [detailDream, setDetailDream] = useState<MockDream | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const layoutByDream = useMemo(() => MOCK_DREAMS.map((dream, i) => ({ dream, layout: LAYOUT[i] })), []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const openDream = (dream: MockDream) => {
    if (focusedId) return;
    setFocusedId(dream.id);
    // The chosen dream draws close while the rest recede — the detail view
    // only appears once that approach has actually had time to play out,
    // so it reads as "arriving back inside the memory," not a modal popping up.
    closeTimerRef.current = window.setTimeout(() => setDetailDream(dream), 850);
  };

  const closeDetail = () => {
    setDetailDream(null);
    setFocusedId(null);
  };

  useEffect(() => {
    if (!detailDream) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDetail();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailDream]);

  return (
    <div className="dream-archive">
      <DreamStageBackground ref={bgVideoRef} active />
      <div className="ar-night-tint" aria-hidden="true" />
      <div className="ar-stars" aria-hidden="true">
        {Array.from({ length: 22 }).map((_, i) => (
          <span
            key={i}
            className="ar-star"
            style={
              {
                '--si': i,
                left: `${(i * 13.1 + 5) % 100}%`,
                top: `${(i * 7.7 + 3) % 92}%`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div className="ar-top">
        <button type="button" className="ar-back" data-cursor-hover onClick={onBack} aria-label="Back to DARE">
          DARE
        </button>
        <nav className="ar-nav" aria-label="Dream Archive">
          <span className="ar-nav-item" data-active="true">
            MY DREAMS
          </span>
          <span className="ar-nav-item" data-placeholder="true" title="Coming soon">
            CONSTELLATIONS
          </span>
          <span className="ar-nav-item" data-placeholder="true" title="Coming soon">
            TIMELINE
          </span>
        </nav>
        <div className="ar-profile" aria-hidden="true">
          D
        </div>
      </div>

      <header className="ar-header">
        <h1 className="ar-title">MY DREAM ARCHIVE</h1>
        <p className="ar-subtitle">Every dream leaves a trace.</p>
      </header>

      <div className="ar-stage" ref={stageRef} data-dimmed={focusedId ? 'true' : 'false'}>
        <ConnectionThreads />
        {layoutByDream.map(({ dream, layout }, i) => (
          <DreamPortal
            key={dream.id}
            dream={dream}
            layout={layout}
            index={i}
            focused={focusedId === dream.id}
            dimmed={focusedId !== null && focusedId !== dream.id}
            onOpen={() => openDream(dream)}
          />
        ))}
      </div>

      {detailDream && (
        <div className="ar-detail" role="dialog" aria-modal="true" aria-label={detailDream.title}>
          <button type="button" className="ar-detail-close" data-cursor-hover onClick={closeDetail}>
            CLOSE
          </button>
          <svg className="ar-detail-svg" viewBox={DREAM_CLIP_VIEWBOX} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <defs>
              <filter id="ar-detail-feather" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation={DREAM_CLIP_FEATHER_STD_DEVIATION} />
              </filter>
              <mask id="ar-detail-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="2048" height="1152">
                <path d={DREAM_CLIP_PATH} fill="white" filter="url(#ar-detail-feather)" />
              </mask>
            </defs>
            <image
              href={detailDream.image}
              x="0"
              y="0"
              width="2048"
              height="1152"
              preserveAspectRatio="xMidYMid slice"
              mask="url(#ar-detail-mask)"
            />
          </svg>
          <h2 className="ar-detail-title">{detailDream.title}</h2>
          <p className="ar-detail-meta">
            {formatMockDate(detailDream.date)} &middot; {detailDream.keywords.join(' · ')}
          </p>
          <p className="ar-detail-note">The full dream memory is coming soon.</p>
        </div>
      )}
    </div>
  );
}
