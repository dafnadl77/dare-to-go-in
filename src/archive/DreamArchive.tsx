import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import DreamStageBackground from '../hero/DreamStageBackground';
import { usePointerParallax } from '../hero/usePointerParallax';
import { DREAM_CLIP_PATH, DREAM_CLIP_VIEWBOX, DREAM_CLIP_FEATHER_STD_DEVIATION } from '../hero/dreamClipShape';
import { MOCK_DREAMS, formatMockDate, type MockDream } from './mockDreams';
import './DreamArchive.css';

interface DreamArchiveProps {
  onBack: () => void;
}

/** Hand-placed constellation positions (percent of the tall .ar-stage, NOT
    the viewport) — a cinematic composition, not evenly-spaced icons: one
    large near dream close to the top, two mid-distance ones nearby (so the
    first screenful reads as roughly 3 major portals), then progressively
    smaller/further ones the deeper you travel down. Reused directly by
    both the portals themselves and the connection lines between them, so
    the two always agree on where things actually are. */
const LAYOUT: { left: number; top: number; size: number; z: number }[] = [
  { left: 38, top: 4, size: 560, z: 6 }, // The Open Door — primary, large, near
  { left: 12, top: 27, size: 300, z: 3 }, // The Ocean — smaller, deeper into the first view
  { left: 78, top: 1, size: 420, z: 5 }, // Grandmother — secondary, upper right
  { left: 68, top: 42, size: 400, z: 4 }, // The Empty City — secondary, further down
  { left: 20, top: 60, size: 340, z: 3 }, // Flying — smaller, further still
  { left: 52, top: 78, size: 300, z: 2 }, // The Forest — smallest, deepest
];

/** Which pairs of dreams occasionally show a faint connecting thread —
    indices into MOCK_DREAMS/LAYOUT. Not every dream needs to connect to
    every other; a handful of threads reads as "a constellation," not a
    network diagram. */
const CONNECTIONS: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 4],
  [3, 4],
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
  open,
  dimmed,
  onToggle,
}: {
  dream: MockDream;
  layout: { left: number; top: number; size: number; z: number };
  index: number;
  open: boolean;
  dimmed: boolean;
  onToggle: () => void;
}) {
  const maskId = `ar-mask-${dream.id}`;
  const featherId = `ar-feather-${dream.id}`;
  return (
    <button
      type="button"
      className="ar-portal"
      data-cursor-hover
      data-open={open ? 'true' : 'false'}
      data-dimmed={dimmed ? 'true' : 'false'}
      onClick={onToggle}
      aria-label={open ? `Close ${dream.title}` : `Open ${dream.title}`}
      style={
        {
          '--px': `${layout.left}%`,
          '--py': `${layout.top}%`,
          '--psize': `${layout.size}px`,
          '--pz': layout.z,
          '--float-delay': `${index * -4.3}s`,
          '--float-dur': `${22 + index * 3.1}s`,
          zIndex: open ? 200 : layout.z,
        } as CSSProperties
      }
    >
      <span className="ar-portal-parallax">
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
      </span>
      <span className="ar-portal-caption">
        <span className="ar-portal-title">{dream.title}</span>
        <span className="ar-portal-date">{formatMockDate(dream.date)}</span>
      </span>
      {/* Only revealed once this exact portal has finished growing into
          place (data-open, delayed fade — see DreamArchive.css) — the
          dream's own image never swaps or re-mounts, it simply keeps
          growing and this detail settles in after, so opening one reads
          as entering that memory rather than a page navigating away. */}
      <span className="ar-portal-detail" aria-hidden={!open}>
        <span className="ar-portal-keywords">{dream.keywords.join(' · ')}</span>
        <span className="ar-portal-note">The full dream memory is coming soon.</span>
        <span className="ar-portal-close">CLOSE</span>
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
 * clipping technique. Never a circle, rectangle, card, or colored
 * placeholder blob.
 */
export default function DreamArchive({ onBack }: DreamArchiveProps) {
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    bgVideoRef.current?.play().catch(() => {});
  }, []);

  const stageRef = useRef<HTMLDivElement>(null);
  usePointerParallax(stageRef, 8, true);

  const [openId, setOpenId] = useState<string | null>(null);

  const layoutByDream = useMemo(() => MOCK_DREAMS.map((dream, i) => ({ dream, layout: LAYOUT[i] })), []);

  const toggleDream = (id: string) => {
    setOpenId((current) => (current === id ? null : current === null ? id : current));
  };

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  return (
    <div className="dream-archive" data-immersed={openId ? 'true' : 'false'}>
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

      <div className="ar-stage" ref={stageRef}>
        <ConnectionThreads />
        {layoutByDream.map(({ dream, layout }, i) => (
          <DreamPortal
            key={dream.id}
            dream={dream}
            layout={layout}
            index={i}
            open={openId === dream.id}
            dimmed={openId !== null && openId !== dream.id}
            onToggle={() => toggleDream(dream.id)}
          />
        ))}
      </div>
    </div>
  );
}
