import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { DreamAnalysis } from './dreamAnalysisSchema';
import type { ReconstructionBrief } from './reconstructionBrief';
import type { DreamReflectionResult } from './dreamReflectionSchema';
import { deriveVisualCues } from './reconstructionVisualCues';
import { deriveDreamWorldEffects } from './dreamWorldEffects';
import { usePointerParallax } from './usePointerParallax';
import { FALLBACK_ACCENT, type AccentColor } from './dreamAccentColor';
import DreamPortalTransition from './DreamPortalTransition';
import DreamStageBackground from './DreamStageBackground';
import DreamWorld from './DreamWorld';
import DreamReflection from './DreamReflection';
import DreamClosing from './DreamClosing';
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
  | 'entering'
  | 'inside';

/** Sub-steps inside the 'inside' phase. The portal hands off directly into
    'prompt' — no quiet/look-around pause, no bedroom flash — then WHAT
    STANDS OUT TO YOU? → choices → selected → reflecting on the chosen
    element → interpreting (real reflection engine call) → reflection
    (terminal — the grounded reflection is shown). */
export type InsideStep =
  | 'prompt'
  | 'choices'
  | 'selected'
  | 'reflecting'
  | 'interpreting'
  | 'reflection'
  | 'closing'
  | 'saving'
  | 'saved'
  | 'letting-go'
  | 'gone';

const REFLECTION_ENGINE_STEPS = new Set<InsideStep>(['prompt', 'choices', 'selected', 'reflecting', 'interpreting', 'reflection']);
const CLOSING_STEPS = new Set<InsideStep>(['closing', 'saving', 'saved', 'letting-go', 'gone']);
const DISSOLVING_STEPS = new Set<InsideStep>(['letting-go', 'gone']);
const SAVING_STEPS = new Set<InsideStep>(['saving']);

interface DreamReconstructionProps {
  phase: ReconstructionPhase;
  insideStep: InsideStep;
  analysis: DreamAnalysis | null;
  brief: ReconstructionBrief | null;
  fragments: string[];
  /** Selectable real dream elements for the WHAT STANDS OUT TO YOU? step — derived from DreamAnalysis, never invented. */
  dreamElements: string[];
  selectedElement: string | null;
  /** The one grounded reflection from the real reflection engine — null until it resolves. */
  reflectionResult: DreamReflectionResult | null;
  reflectionErrored: boolean;
  /** Revealed only once the dreamer has had enough time to read the reflection. */
  continueVisible: boolean;
  /** The last successfully generated image, already fully revealed. Null until the first generation succeeds. */
  displayedImageUrl: string | null;
  /** A freshly generated image mid-reveal during the 'imaging' phase (room→image the first time, image→image on regeneration). */
  incomingImageUrl: string | null;
  /** This dream's own extracted accent color — null until the image has loaded and been sampled. */
  accentColor: AccentColor | null;
  /** A small harmonious palette from the same image, for the richer dream-arrival atmosphere. */
  dreamPalette: AccentColor[] | null;
  onNotQuite: () => void;
  onCorrectionSubmit: (text: string) => void;
  onRetryImage: () => void;
  onYes: () => void;
  onPortalComplete: () => void;
  onSelectElement: (element: string) => void;
  onSubmitReflection: (text: string) => void;
  onRetryReflection: () => void;
  onContinueFromReflection: () => void;
  onSaveDream: () => void;
  onLetGo: () => void;
  onReturnToRoom: () => void;
}

/**
 * The room itself becoming a reconstructed memory, then a real generated
 * image. Never a dashboard, never raw JSON — only real DreamAnalysis
 * content (fragments, brief) and a real generated image drive what
 * appears. Unknown details stay visually unresolved, never invented.
 */
export default function DreamReconstruction({
  phase,
  insideStep,
  analysis,
  brief,
  fragments,
  dreamElements,
  selectedElement,
  reflectionResult,
  reflectionErrored,
  continueVisible,
  displayedImageUrl,
  incomingImageUrl,
  accentColor,
  dreamPalette,
  onNotQuite,
  onCorrectionSubmit,
  onRetryImage,
  onYes,
  onPortalComplete,
  onSelectElement,
  onSubmitReflection,
  onRetryReflection,
  onContinueFromReflection,
  onSaveDream,
  onLetGo,
  onReturnToRoom,
}: DreamReconstructionProps) {
  const [correctionText, setCorrectionText] = useState('');
  const imageLayerRef = useRef<HTMLDivElement>(null);
  // The generated image itself never changes without a new API call — this
  // only adds subtle procedural motion on top of it (parallax, drifting
  // light, grain) so the experience feels alive without generating anything
  // new. Only active once there's actually a living image to sit over.
  usePointerParallax(imageLayerRef, 7, phase === 'entering' || phase === 'inside');

  // THE DREAM STAGE background video — the only visual environment once
  // inside; no generated image or cloud overlay sits over it anymore.
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    // The `autoplay` attribute alone isn't always reliable the instant a
    // video mounts (depends on the browser/embedding context) — an
    // explicit .play() call is the robust fallback for a muted clip,
    // which is always allowed regardless of user gesture.
    bgVideoRef.current?.play().catch(() => {});
  }, [phase]);

  if (phase === 'none') return null;

  const cues = analysis && brief ? deriveVisualCues(analysis, brief) : null;
  const worldEffects = analysis ? deriveDreamWorldEffects(analysis) : null;

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

      {/* THE DREAM STAGE — the approved moving cloud MP4, the actual
          post-portal environment. Mounted slightly early (through
          'entering' too) so it's already playing/buffered the instant the
          vortex hands off, then simply revealed — no load flash. The only
          visual layer once inside; nothing else sits over it. */}
      {(phase === 'entering' || phase === 'inside') && <DreamStageBackground ref={bgVideoRef} active={phase === 'inside'} />}

      {/* THE DREAM STAGE (phase 'inside') never shows the generated image in
          a picture/frame of any kind — the moving cloud video above is the
          entire environment, and the title/choices/question/reflection text
          floats directly over it (see DreamReflection/DreamClosing below).
          The reconstructed image itself is still shown pre-portal, on the
          THIS IS WHAT I FOUND / IS THIS HOW IT FELT reveal screen and during
          the vortex crossing — untouched, not part of this restriction. */}
      {(displayedImageUrl || incomingImageUrl) && phase !== 'inside' && (
        <div
          ref={imageLayerRef}
          className="dr-image-layer"
          data-falling={worldEffects?.falling ? 'true' : 'false'}
          data-dissolving={DISSOLVING_STEPS.has(insideStep) ? 'true' : 'false'}
          data-saving={SAVING_STEPS.has(insideStep) ? 'true' : 'false'}
          data-portal-active={phase === 'entering' ? 'true' : 'false'}
          /* Never 'inside' here (see the guard above) — the arrival/secondary
             hero sizing never applies pre-portal, only to the full-bleed
             reveal image itself. */
          data-arrival="false"
          data-secondary="false"
          data-hide-image={insideStep === 'reflection' || CLOSING_STEPS.has(insideStep) ? 'true' : 'false'}
          aria-hidden="true"
          style={{ '--accent-rgb': `${(accentColor ?? FALLBACK_ACCENT).r}, ${(accentColor ?? FALLBACK_ACCENT).g}, ${(accentColor ?? FALLBACK_ACCENT).b}` } as CSSProperties}
        >
          {displayedImageUrl && <img className="dr-image dr-image-current" src={displayedImageUrl} alt="" />}
          {incomingImageUrl && (
            <>
              <img className="dr-image dr-image-incoming" src={incomingImageUrl} alt="" />
              <img className="dr-image dr-image-incoming-patch dr-image-incoming-patch--a" src={incomingImageUrl} alt="" />
              <img className="dr-image dr-image-incoming-patch dr-image-incoming-patch--b" src={incomingImageUrl} alt="" />
            </>
          )}
          {/* Purely procedural "alive" layers over the settled image — no new
              image content, just drifting light and grain so a static frame
              doesn't read as static. */}
          {phase === 'entering' && displayedImageUrl && (
            <>
              <div className="dr-image-light-drift" />
              <div className="dr-image-grain" />
              <div className="dr-image-motes">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span key={i} className="dr-mote" style={{ '--mi': i } as CSSProperties} />
                ))}
              </div>
            </>
          )}
          {SAVING_STEPS.has(insideStep) && <div className="dr-memory-frame" />}
        </div>
      )}

      {/* YES — TAKE ME IN: a real WebGL vortex built from the settled image
          itself (see DreamPortalTransition/DreamPortal) — no new image, no
          pre-rendered asset. Its own GSAP timeline calls onPortalComplete
          when the travel finishes. */}
      {phase === 'entering' && displayedImageUrl && (
        <DreamPortalTransition imageUrl={displayedImageUrl} accent={accentColor ?? FALLBACK_ACCENT} onComplete={onPortalComplete} />
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

      {(phase === 'reconstructing' || phase === 'regenerating') && <p className="dr-remembering">REMEMBERING&hellip;</p>}

      {phase === 'image-error' && (
        <div className="dr-image-error">
          <p className="dr-line">I COULDN&rsquo;T SEE ALL OF IT.</p>
          <button type="button" className="dr-choice" data-cursor-hover onClick={onRetryImage}>
            TRY AGAIN
          </button>
        </div>
      )}

      {/* Stays mounted through 'entering' too (not just 'reveal') so the
          CSS opacity transition can actually play as a fade — unmounting
          exactly on the phase change would just make it vanish instantly. */}
      {(phase === 'reveal' || phase === 'entering') && (
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

      {/* ENTER THE DREAM — only during the vortex crossing itself; once
          'inside', the approved Dream Stage video is the entire
          environment and DreamWorld's generated room/water ambience must
          not layer on top of it. */}
      {phase === 'entering' && worldEffects && <DreamWorld effects={worldEffects} accentColor={accentColor} />}

      {phase === 'inside' && REFLECTION_ENGINE_STEPS.has(insideStep) && (
        <DreamReflection
          step={insideStep}
          elements={dreamElements}
          selectedElement={selectedElement}
          reflectionResult={reflectionResult}
          reflectionErrored={reflectionErrored}
          continueVisible={continueVisible}
          accentColor={accentColor}
          dreamPalette={dreamPalette}
          onSelect={onSelectElement}
          onSubmitReflection={onSubmitReflection}
          onRetryReflection={onRetryReflection}
          onContinue={onContinueFromReflection}
        />
      )}

      {phase === 'inside' && CLOSING_STEPS.has(insideStep) && reflectionResult && (
        <DreamClosing
          step={insideStep}
          reflectionResult={reflectionResult}
          accentColor={accentColor}
          onSave={onSaveDream}
          onLetGo={onLetGo}
          onReturnToRoom={onReturnToRoom}
        />
      )}
    </div>
  );
}
