import type { CSSProperties } from 'react';
import { sanitizeAiTextForDisplay } from './appLanguage';
import { FALLBACK_ACCENT, type AccentColor } from './dreamAccentColor';
import type { DreamReflectionResult } from './dreamReflectionSchema';
import type { InsideStep } from './DreamReconstruction';
import './DreamClosing.css';

interface DreamClosingProps {
  step: InsideStep;
  reflectionResult: DreamReflectionResult;
  accentColor: AccentColor | null;
  onSave: () => void;
  onLetGo: () => void;
  onReturnToRoom: () => void;
  /** DREAM SAVED.'s quiet second invitation — deeper into the new Dream
      Archive area, not part of the reconstruction/reflection journey
      itself. */
  onGoToArchive: () => void;
}

/** Renders text as individually-spanned letters so LET IT GO can disperse
    letter-by-letter on hover — a pure-CSS effect, no per-letter JS needed.
    Word spaces render as a non-breaking space (not a plain " "): a plain
    space text node inside a `display: inline-block` span collapses to
    zero width in HTML, which would render "LET IT GO" as "LETITGO". */
function DispersingLetters({ text }: { text: string }) {
  return (
    <>
      {text.split('').map((ch, i) => (
        <span key={i} className="dc-letter" style={{ '--li': i } as CSSProperties}>
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </>
  );
}

const RING_PARTICLE_COUNT = 7;
const RING_ARC_COUNT = 6;
const SPARK_COUNT = 10;

/**
 * The end of the dream journey — no dead end, no modal, no dashboard card.
 * 'closing': the interpretation quietly clears, the image holds alone, then
 * DON'T LET IT DISAPPEAR reveals with two energy-ring interactions, each
 * tinted by this dream's own accent color. 'saving' is the brief
 * photographic-memory flash before 'saved'; 'letting-go'/'gone' are the
 * dissolve outcome of LET IT GO.
 */
export default function DreamClosing({ step, reflectionResult, accentColor, onSave, onLetGo, onReturnToRoom, onGoToArchive }: DreamClosingProps) {
  const accent = accentColor ?? FALLBACK_ACCENT;
  const accentVars = { '--accent-rgb': `${accent.r}, ${accent.g}, ${accent.b}` } as CSSProperties;

  return (
    <div className="dream-closing" data-step={step}>
      {step === 'closing' && (
        <>
          <div className="dc-fading-reflection" aria-hidden="true">
            <p className="dc-fading-text">{sanitizeAiTextForDisplay(reflectionResult.observation)}</p>
            <p className="dc-fading-text dc-fading-text--question">{sanitizeAiTextForDisplay(reflectionResult.continuityQuestion)}</p>
          </div>

          <div className="dc-block dc-block--closing" style={accentVars}>
            <p className="dc-title">DON&rsquo;T LET IT DISAPPEAR.</p>
            <div className="dc-choices">
              <button type="button" className="dc-portal dc-portal--keep" data-cursor-hover onClick={onSave}>
                <span className="dc-portal-glow" aria-hidden="true" />
                <span className="dc-portal-arcs" aria-hidden="true">
                  {Array.from({ length: RING_ARC_COUNT }).map((_, i) => (
                    <span key={i} className="dc-portal-arc" style={{ '--ai': i } as CSSProperties} />
                  ))}
                </span>
                <span className="dc-portal-core" aria-hidden="true" />
                <span className="dc-portal-particles" aria-hidden="true">
                  {Array.from({ length: RING_PARTICLE_COUNT }).map((_, i) => (
                    <span key={i} className="dc-portal-particle" style={{ '--pi': i } as CSSProperties} />
                  ))}
                </span>
                <svg className="dc-portal-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <path d="M16 9c-2.6-2-6.2-2.8-10-1.8v17c3.8-1 7.4-.2 10 1.8 2.6-2 6.2-2.8 10-1.8V7.2C22.2 6.2 18.6 7 16 9Z" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M16 9v17.6" stroke="currentColor" strokeWidth="1.3" />
                </svg>
                <span className="dc-portal-label">
                  KEEP THIS
                  <br />
                  DREAM
                </span>
              </button>

              <button type="button" className="dc-portal dc-portal--let-go" data-cursor-hover onClick={onLetGo}>
                <span className="dc-portal-glow" aria-hidden="true" />
                <span className="dc-portal-arcs dc-portal-arcs--loose" aria-hidden="true">
                  {Array.from({ length: RING_ARC_COUNT }).map((_, i) => (
                    <span key={i} className="dc-portal-arc" style={{ '--ai': i } as CSSProperties} />
                  ))}
                </span>
                <span className="dc-portal-core" aria-hidden="true" />
                <span className="dc-portal-particles dc-portal-particles--escape" aria-hidden="true">
                  {Array.from({ length: RING_PARTICLE_COUNT }).map((_, i) => (
                    <span key={i} className="dc-portal-particle" style={{ '--pi': i } as CSSProperties} />
                  ))}
                </span>
                <svg className="dc-portal-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <path
                    d="M24.5 5.5c-8.3 0-15 6.7-15 15v3.5h3.5c8.3 0 15-6.7 15-15V5.5h-3.5Z"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  />
                  <path d="M9.5 22.5 22 10" stroke="currentColor" strokeWidth="1.1" />
                </svg>
                <span className="dc-portal-label">
                  <DispersingLetters text="LET IT GO" />
                </span>
              </button>
            </div>
            <p className="dc-choice-hint">THE CHOICE IS YOURS.</p>
          </div>
        </>
      )}

      {step === 'saving' && (
        <div className="dc-saving" style={accentVars} aria-hidden="true">
          <span className="dc-saving-portal" />
          <span className="dc-saving-particles">
            {Array.from({ length: SPARK_COUNT }).map((_, i) => (
              <span key={i} className="dc-saving-particle" style={{ '--pi': i } as CSSProperties} />
            ))}
          </span>
          <div className="dc-flash" />
        </div>
      )}

      {step === 'saved' && (
        <div className="dc-block dc-block--enter" style={accentVars}>
          <p className="dc-title dc-title--small dc-title--materialize">DREAM SAVED.</p>
          <button type="button" className="dr-choice dr-choice--yes" data-cursor-hover onClick={onReturnToRoom}>
            RETURN TO THE ROOM
          </button>
          <button type="button" className="dc-archive-invite" data-cursor-hover onClick={onGoToArchive}>
            go to my dream archive
          </button>
        </div>
      )}

      {step === 'letting-go' && (
        <div className="dc-letting-go" style={accentVars} aria-hidden="true">
          <span className="dc-breaking-portal">
            {Array.from({ length: RING_ARC_COUNT }).map((_, i) => (
              <span key={i} className="dc-breaking-arc" style={{ '--ai': i } as CSSProperties} />
            ))}
          </span>
          <span className="dc-breaking-particles">
            {Array.from({ length: SPARK_COUNT }).map((_, i) => (
              <span key={i} className="dc-breaking-particle" style={{ '--pi': i } as CSSProperties} />
            ))}
          </span>
          <p className="dc-title dc-title--small dc-breaking-words">
            <DispersingLetters text="LET IT GO" />
          </p>
        </div>
      )}

      {step === 'gone' && (
        <div className="dc-block dc-block--enter">
          <p className="dc-title dc-title--small">GONE.</p>
        </div>
      )}
    </div>
  );
}
