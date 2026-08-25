import { useState, type CSSProperties } from 'react';
import type { DreamAnalysis } from './dreamAnalysisSchema';
import type { ReconstructionBrief } from './reconstructionBrief';
import { deriveVisualCues } from './reconstructionVisualCues';
import './DreamReconstruction.css';

export type ReconstructionPhase = 'none' | 'dissolving' | 'fragments' | 'reconstructing' | 'reveal' | 'correcting' | 'ready';

interface DreamReconstructionProps {
  phase: ReconstructionPhase;
  analysis: DreamAnalysis | null;
  brief: ReconstructionBrief | null;
  fragments: string[];
  onNotQuite: () => void;
  onCorrectionSubmit: (text: string) => void;
  onYes: () => void;
}

/**
 * The room itself becoming a reconstructed memory. Never a dashboard, never
 * raw JSON — only real DreamAnalysis content (fragments, brief) drives what
 * appears. Unknown details are represented by leaving visual motifs off,
 * never by inventing a detailed substitute.
 */
export default function DreamReconstruction({
  phase,
  analysis,
  brief,
  fragments,
  onNotQuite,
  onCorrectionSubmit,
  onYes,
}: DreamReconstructionProps) {
  const [correctionText, setCorrectionText] = useState('');

  if (phase === 'none') return null;

  const cues = analysis && brief ? deriveVisualCues(analysis, brief) : null;

  const handleTryAgain = () => {
    const text = correctionText.trim();
    if (!text) return;
    onCorrectionSubmit(text);
    setCorrectionText('');
  };

  return (
    <div className={`dream-reconstruction is-phase-${phase}`}>
      <div
        className="dr-visual"
        data-water={cues?.water ? 'true' : 'false'}
        data-falling={cues?.falling ? 'true' : 'false'}
        data-unknown-person={cues?.hasUnknownPerson ? 'true' : 'false'}
        data-setting-known={cues?.settingKnown ? 'true' : 'false'}
        aria-hidden="true"
      >
        <div className="dr-blur-veil dr-blur-veil--a" />
        <div className="dr-blur-veil dr-blur-veil--b" />
        <div className="dr-water-layer" />
        <div className="dr-fall-layer" />
        <div className="dr-silhouette" />
      </div>

      {phase === 'fragments' && fragments.length > 0 && (
        <div className="dr-fragments" aria-hidden="true">
          {fragments.map((f, i) => (
            <span key={i} className="dr-fragment" style={{ '--fi': i } as CSSProperties}>
              {f.toUpperCase()}
            </span>
          ))}
        </div>
      )}

      {phase === 'reveal' && (
        <div className="dr-reveal">
          <p className="dr-line dr-line--found">THIS IS WHAT I FOUND.</p>
          <p className="dr-line dr-line--felt">IS THIS HOW IT FELT?</p>
          <div className="dr-choices">
            <button type="button" className="dr-choice dr-choice--yes" data-cursor-hover onClick={onYes}>
              YES &mdash; TAKE ME IN
            </button>
            <button type="button" className="dr-choice dr-choice--no" data-cursor-hover onClick={onNotQuite}>
              NOT QUITE
            </button>
          </div>
        </div>
      )}

      {phase === 'correcting' && (
        <div className="dr-correct">
          <p className="dr-line">WHAT DID I GET WRONG?</p>
          <textarea
            className="dr-correct-textarea"
            value={correctionText}
            onChange={(e) => setCorrectionText(e.target.value)}
            placeholder="Tell me what to change..."
            dir="auto"
            rows={3}
          />
          <button type="button" className="dr-choice" data-cursor-hover onClick={handleTryAgain}>
            TRY AGAIN
          </button>
        </div>
      )}

      {phase === 'ready' && (
        <div className="dr-ready">
          <p className="dr-line dr-line--ready">READY TO GO BACK IN.</p>
        </div>
      )}
    </div>
  );
}
