import { useState, type CSSProperties } from 'react';
import type { DreamAnalysis } from './dreamAnalysisSchema';
import type { ReconstructionBrief } from './reconstructionBrief';
import { deriveVisualCues } from './reconstructionVisualCues';
import './DreamReconstruction.css';

export type ReconstructionPhase =
  | 'none'
  | 'dissolving'
  | 'fragments'
  | 'reconstructing'
  | 'imaging'
  | 'reveal'
  | 'correcting'
  | 'regenerating'
  | 'image-error'
  | 'ready';

interface DreamReconstructionProps {
  phase: ReconstructionPhase;
  analysis: DreamAnalysis | null;
  brief: ReconstructionBrief | null;
  fragments: string[];
  /** The last successfully generated image, already fully revealed. Null until the first generation succeeds. */
  displayedImageUrl: string | null;
  /** A freshly generated image mid-reveal during the 'imaging' phase (room→image the first time, image→image on regeneration). */
  incomingImageUrl: string | null;
  onNotQuite: () => void;
  onCorrectionSubmit: (text: string) => void;
  onRetryImage: () => void;
  onYes: () => void;
}

/**
 * The room itself becoming a reconstructed memory, then a real generated
 * image. Never a dashboard, never raw JSON — only real DreamAnalysis
 * content (fragments, brief) and a real generated image drive what
 * appears. Unknown details stay visually unresolved, never invented.
 */
export default function DreamReconstruction({
  phase,
  analysis,
  brief,
  fragments,
  displayedImageUrl,
  incomingImageUrl,
  onNotQuite,
  onCorrectionSubmit,
  onRetryImage,
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
      {/* Temporary CSS reconstruction — the placeholder while the real image
          loads, and the fallback if generation ever fails. Kept at low
          residue opacity even once a real image is showing. */}
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

      {/* The real generated dream — never a separate card/gallery, always
          overtaking the room itself through organic, irregular masks. */}
      {(displayedImageUrl || incomingImageUrl) && (
        <div className="dr-image-layer" aria-hidden="true">
          {displayedImageUrl && <img className="dr-image dr-image-current" src={displayedImageUrl} alt="" />}
          {incomingImageUrl && (
            <>
              <img className="dr-image dr-image-incoming" src={incomingImageUrl} alt="" />
              <img className="dr-image dr-image-incoming-patch dr-image-incoming-patch--a" src={incomingImageUrl} alt="" />
              <img className="dr-image dr-image-incoming-patch dr-image-incoming-patch--b" src={incomingImageUrl} alt="" />
            </>
          )}
        </div>
      )}

      {phase === 'fragments' && fragments.length > 0 && (
        <div className="dr-fragments" aria-hidden="true">
          {fragments.map((f, i) => (
            <span key={i} className="dr-fragment" style={{ '--fi': i } as CSSProperties}>
              {f.toUpperCase()}
            </span>
          ))}
        </div>
      )}

      {phase === 'regenerating' && <p className="dr-remembering">REMEMBERING&hellip;</p>}

      {phase === 'image-error' && (
        <div className="dr-image-error">
          <p className="dr-line">I COULDN&rsquo;T SEE ALL OF IT.</p>
          <button type="button" className="dr-choice" data-cursor-hover onClick={onRetryImage}>
            TRY AGAIN
          </button>
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
