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
}

/** Renders text as individually-spanned letters so LET IT GO can disperse
    letter-by-letter on hover — a pure-CSS effect, no per-letter JS needed. */
function DispersingLetters({ text }: { text: string }) {
  return (
    <>
      {text.split('').map((ch, i) => (
        <span key={i} className="dc-letter" style={{ '--li': i } as CSSProperties}>
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </>
  );
}

const RING_PARTICLE_COUNT = 5;

/**
 * The end of the dream journey — no dead end, no modal, no dashboard card.
 * 'closing': the interpretation quietly clears, the image holds alone, then
 * DON'T LET IT DISAPPEAR reveals with two energy-ring interactions, each
 * tinted by this dream's own accent color. 'saving' is the brief
 * photographic-memory flash before 'saved'; 'letting-go'/'gone' are the
 * dissolve outcome of LET IT GO.
 */
export default function DreamClosing({ step, reflectionResult, accentColor, onSave, onLetGo, onReturnToRoom }: DreamClosingProps) {
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
              <button type="button" className="dc-ring dc-ring--keep" data-cursor-hover onClick={onSave}>
                <span className="dc-ring-circle" aria-hidden="true" />
                <span className="dc-ring-particles" aria-hidden="true">
                  {Array.from({ length: RING_PARTICLE_COUNT }).map((_, i) => (
                    <span key={i} className="dc-ring-particle" style={{ '--pi': i } as CSSProperties} />
                  ))}
                </span>
                <svg className="dc-ring-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <path d="M16 9c-2.6-2-6.2-2.8-10-1.8v17c3.8-1 7.4-.2 10 1.8 2.6-2 6.2-2.8 10-1.8V7.2C22.2 6.2 18.6 7 16 9Z" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M16 9v17.6" stroke="currentColor" strokeWidth="1.3" />
                </svg>
                <span className="dc-ring-label">
                  KEEP THIS
                  <br />
                  DREAM
                </span>
              </button>

              <button type="button" className="dc-ring dc-ring--let-go" data-cursor-hover onClick={onLetGo}>
                <span className="dc-ring-circle" aria-hidden="true" />
                <span className="dc-ring-particles dc-ring-particles--escape" aria-hidden="true">
                  {Array.from({ length: RING_PARTICLE_COUNT }).map((_, i) => (
                    <span key={i} className="dc-ring-particle" style={{ '--pi': i } as CSSProperties} />
                  ))}
                </span>
                <svg className="dc-ring-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <path
                    d="M24.5 5.5c-8.3 0-15 6.7-15 15v3.5h3.5c8.3 0 15-6.7 15-15V5.5h-3.5Z"
                    stroke="currentColor"
                    strokeWidth="1.3"
                  />
                  <path d="M9.5 22.5 22 10" stroke="currentColor" strokeWidth="1.1" />
                </svg>
                <span className="dc-ring-label">
                  <DispersingLetters text="LET IT GO" />
                </span>
              </button>
            </div>
            <p className="dc-choice-hint">THE CHOICE IS YOURS.</p>
          </div>
        </>
      )}

      {step === 'saving' && <div className="dc-flash" aria-hidden="true" />}

      {step === 'saved' && (
        <div className="dc-block dc-block--enter">
          <p className="dc-title dc-title--small">SAVED.</p>
          <button type="button" className="dr-choice dr-choice--yes" data-cursor-hover onClick={onReturnToRoom}>
            RETURN TO THE ROOM
          </button>
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
