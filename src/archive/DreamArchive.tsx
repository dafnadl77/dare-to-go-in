import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import DreamStageBackground from '../hero/DreamStageBackground';
import { getArchiveEntries, type ArchiveEntry } from './archiveData';
import DreamTimeline from './DreamTimeline';
import './DreamArchive.css';

interface DreamArchiveProps {
  onBack: () => void;
  onOpenEntry: (entry: ArchiveEntry) => void;
}

/**
 * MY DREAM ARCHIVE — the DREAM TIMELINE. A calm, editorial, vertical
 * chronology of saved dreams (see archiveData.ts): the earlier floating
 * "constellation" of cloud-masked portals has been fully removed per the
 * approved visual reference, replaced by DreamTimeline. The cloud world
 * behind it, the header, and the top nav are unchanged.
 */
export default function DreamArchive({ onBack, onOpenEntry }: DreamArchiveProps) {
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    bgVideoRef.current?.play().catch(() => {});
  }, []);

  const entries = useMemo(() => getArchiveEntries(), []);

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

      <DreamTimeline entries={entries} onOpenEntry={onOpenEntry} />
    </div>
  );
}
