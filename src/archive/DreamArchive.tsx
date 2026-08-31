import { useEffect, useRef, useState, type CSSProperties } from 'react';
import DreamStageBackground from '../hero/DreamStageBackground';
import { MOCK_DREAMS, formatMockDate, type MockDream } from './mockDreams';
import './DreamArchive.css';

interface DreamArchiveProps {
  onBack: () => void;
}

function tintVars(dream: MockDream): CSSProperties {
  return { '--ar-tint-a': dream.gradient[0], '--ar-tint-b': dream.gradient[1] } as CSSProperties;
}

/**
 * MY DREAM ARCHIVE — a visual prototype only. Six mock dreams (see
 * mockDreams.ts) stand in for a real saved-dreams list so the collection's
 * layout/interactions can be reviewed before any real auth/storage is
 * wired in. CONSTELLATIONS and TIMELINE are inert placeholders, per spec.
 */
export default function DreamArchive({ onBack }: DreamArchiveProps) {
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    bgVideoRef.current?.play().catch(() => {});
  }, []);

  const [openDream, setOpenDream] = useState<MockDream | null>(null);

  useEffect(() => {
    if (!openDream) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenDream(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openDream]);

  return (
    <div className="dream-archive">
      <DreamStageBackground ref={bgVideoRef} active />

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

      <div className="ar-collection">
        {MOCK_DREAMS.map((dream) => (
          <div className="ar-window-wrap" key={dream.id} style={tintVars(dream)}>
            <button
              type="button"
              className="ar-window"
              data-cursor-hover
              onClick={() => setOpenDream(dream)}
              aria-label={`Open ${dream.title}`}
            >
              <span className="ar-window-glow" aria-hidden="true" />
              <span className="ar-window-blob" aria-hidden="true">
                <span className="ar-window-sheen" aria-hidden="true" />
              </span>
            </button>
            <p className="ar-window-title">{dream.title}</p>
            <p className="ar-window-date">{formatMockDate(dream.date)}</p>
            <p className="ar-window-keywords">{dream.keywords.join(' · ')}</p>
          </div>
        ))}
      </div>

      {openDream && (
        <div className="ar-detail" role="dialog" aria-modal="true" aria-label={openDream.title}>
          <button type="button" className="ar-detail-close" data-cursor-hover onClick={() => setOpenDream(null)}>
            CLOSE
          </button>
          <div className="ar-detail-blob" style={tintVars(openDream)} aria-hidden="true" />
          <h2 className="ar-detail-title">{openDream.title}</h2>
          <p className="ar-detail-meta">
            {formatMockDate(openDream.date)} &middot; {openDream.keywords.join(' · ')}
          </p>
          <p className="ar-detail-note">The full dream memory is coming soon.</p>
        </div>
      )}
    </div>
  );
}
