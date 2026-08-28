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
import DreamCloudFrame from './DreamCloudFrame';
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
/** THIS IS YOUR DREAM / WHAT STANDS OUT TO YOU? — the only inside-phase
    steps where the generated image reappears, masked to the exact organic
    reference silhouette (never a rectangle). Every other step (the
    association question and beyond) stays image-free, per spec. */
const DREAM_IMAGE_STEPS = new Set<InsideStep>(['prompt', 'choices', 'selected']);

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
  /** Whether the settled image reads as light behind THIS IS WHAT I FOUND — flips that screen's text dark for readability. */
  revealTextOnLight: boolean;
  /** displayedImageUrl pre-masked into the organic dream shape via <canvas> (see dreamImageMask.ts) — null until compositing finishes. Used on THIS IS YOUR DREAM instead of a live CSS mask. */
  maskedDreamImageUrl: string | null;
  onNotQuite: () => void;
  onCorrectionSubmit: (text: string) => void;
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
  revealTextOnLight,
  maskedDreamImageUrl,
  onNotQuite,
  onCorrectionSubmit,
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

  // THE DREAM STAGE background video, plus a second synced instance
  // (DreamCloudFrame) that layers real cloud footage IN FRONT of the
  // dream image on THIS IS YOUR DREAM / WHAT STANDS OUT TO YOU?. Both
  // elements decode the video independently, so a periodic correction
  // (via the background's own 'timeupdate', which fires ~4x/second)
  // snaps the frame copy back in step the moment it drifts more than
  // 150ms — cheap, and imperceptible for a looping, textural cloud clip.
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const frameVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    // The `autoplay` attribute alone isn't always reliable the instant a
    // video mounts (depends on the browser/embedding context) — an
    // explicit .play() call is the robust fallback for a muted clip,
    // which is always allowed regardless of user gesture.
    bgVideoRef.current?.play().catch(() => {});
    frameVideoRef.current?.play().catch(() => {});
    const bg = bgVideoRef.current;
    const frame = frameVideoRef.current;
    if (!bg || !frame) return;
    const resync = () => {
      if (!frame || frame.readyState < 2) return;
      if (Math.abs(frame.currentTime - bg.currentTime) > 0.15) {
        frame.currentTime = bg.currentTime;
      }
    };
    bg.addEventListener('timeupdate', resync);
    return () => bg.removeEventListener('timeupdate', resync);
    // Re-checked on every phase change: DreamCloudFrame only mounts once
    // inside, well after this effect's first run, so the refs aren't
    // both populated until then.
  }, [phase]);

  if (phase === 'none') return null;

  const cues = analysis && brief ? deriveVisualCues(analysis, brief) : null;
  const worldEffects = analysis ? deriveDreamWorldEffects(analysis) : null;
  const isArrival = phase === 'inside' && DREAM_IMAGE_STEPS.has(insideStep);

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

      {/* THE DREAM STAGE (phase 'inside') only shows the generated image on
          THIS IS YOUR DREAM / WHAT STANDS OUT TO YOU? (DREAM_IMAGE_STEPS) —
          masked to the exact organic reference silhouette below, never a
          rectangle. Every other inside step (the association question
          onward) stays image-free: the moving cloud video is the entire
          environment there, with title/question/reflection text floating
          directly over it. Pre-portal (reveal/entering/correcting/
          regenerating), the reconstructed image is always shown, untouched. */}
      {(displayedImageUrl || incomingImageUrl) && (phase !== 'inside' || DREAM_IMAGE_STEPS.has(insideStep)) && (
        <div
          ref={imageLayerRef}
          className="dr-image-layer"
          data-falling={worldEffects?.falling ? 'true' : 'false'}
          data-dissolving={DISSOLVING_STEPS.has(insideStep) ? 'true' : 'false'}
          data-saving={SAVING_STEPS.has(insideStep) ? 'true' : 'false'}
          data-portal-active={phase === 'entering' ? 'true' : 'false'}
          data-arrival={isArrival ? 'true' : 'false'}
          data-secondary="false"
          data-step={phase === 'inside' ? insideStep : undefined}
          data-hide-image="false"
          aria-hidden="true"
          style={{ '--accent-rgb': `${(accentColor ?? FALLBACK_ACCENT).r}, ${(accentColor ?? FALLBACK_ACCENT).g}, ${(accentColor ?? FALLBACK_ACCENT).b}` } as CSSProperties}
        >
          {/* On THIS IS YOUR DREAM the mask is baked into the pixels
              (maskedDreamImageUrl, via <canvas> — see dreamImageMask.ts).
              Deliberately no CSS mask-image anywhere in this path — see the
              CSS comment on .dr-image-layer[data-arrival='true'] for why
              (a live CSS mask on this element was the actual persistent
              bug, not the mask asset). Falls back to the plain unmasked
              photo only for the brief moment before compositing finishes,
              which in practice resolves well before phase 'inside' is ever
              reached (compositing starts the moment the image settles,
              during 'entering' — the portal crossing alone takes ~5s).

              key={currentSrc} forces React to unmount and mount a BRAND NEW
              <img> node whenever the src actually changes (raw photo →
              masked composite, or between dreams) instead of patching the
              src attribute on the same node. Verified directly in the
              field: the composited PNG's own pixel data was already 100%
              correct (getImageData sampled live in the browser reporting
              it — corner alpha 0, center alpha 255) while the screen kept
              showing the old unmasked frame regardless, meaning the
              browser was repainting stale GPU-layer content instead of the
              new src on an in-place swap. A fresh node has no stale layer
              to fall back to. */}
          {displayedImageUrl && (() => {
            const currentSrc = isArrival && maskedDreamImageUrl ? maskedDreamImageUrl : displayedImageUrl;
            return <img key={currentSrc} className="dr-image dr-image-current" src={currentSrc} alt="" />;
          })()}
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
          {(phase === 'entering' || phase === 'inside') && displayedImageUrl && (
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

      {/* A second instance of the exact same cloud MP4, layered IN FRONT of
          the dream image and masked (inverted reference shape) so only its
          outer cloud regions stay visible, physically overlapping the
          image's true edge — see DreamCloudFrame.css for the full
          reasoning. Mounted for exactly the same steps as the image
          itself, kept frame-synced via frameVideoRef/bgVideoRef above. */}
      {(displayedImageUrl || incomingImageUrl) && isArrival && (
        <DreamCloudFrame ref={frameVideoRef} active={true} />
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
          {/* A failed generation has nothing to retry from within this same
              session — send the dreamer back to the very start rather than
              re-firing the same request against the same brief. */}
          <button type="button" className="dr-choice" data-cursor-hover onClick={onReturnToRoom}>
            RESTART
          </button>
        </div>
      )}

      {/* Stays mounted through 'entering' too (not just 'reveal') so the
          CSS opacity transition can actually play as a fade — unmounting
          exactly on the phase change would just make it vanish instantly. */}
      {(phase === 'reveal' || phase === 'entering') && (
        <div className="dr-reveal" data-light-bg={revealTextOnLight ? 'true' : 'false'}>
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
