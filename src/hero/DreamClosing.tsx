import type { CSSProperties } from 'react';
import { sanitizeAiTextForDisplay } from './appLanguage';
import type { DreamReflectionResult } from './dreamReflectionSchema';
import type { InsideStep } from './DreamReconstruction';
import './DreamClosing.css';

interface DreamClosingProps {
  step: InsideStep;
  reflectionResult: DreamReflectionResult;
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
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </>
  );
}

/**
 * The end of the dream journey — no dead end, no modal, no dashboard card.
 * 'closing': the interpretation quietly clears, the image holds alone, then
 * DON'T LET IT DISAPPEAR reveals with the two closing choices. 'saving' is
 * the brief photographic-memory flash before 'saved'; 'letting-go'/'gone'
 * are the dissolve outcome of LET IT GO.
 */
export default function DreamClosing({ step, reflectionResult, onSave, onLetGo, onReturnToRoom }: DreamClosingProps) {
  return (
    <div className="dream-closing" data-step={step}>
      {step === 'closing' && (
        <>
          <div className="dc-fading-reflection" aria-hidden="true">
            <p className="dc-fading-text">{sanitizeAiTextForDisplay(reflectionResult.observation)}</p>
            <p className="dc-fading-text dc-fading-text--question">{sanitizeAiTextForDisplay(reflectionResult.continuityQuestion)}</p>
          </div>

          <div className="dc-block dc-block--closing">
            <p className="dc-title">DON&rsquo;T LET IT DISAPPEAR.</p>
            <div className="dc-choices">
              <button type="button" className="dc-keep" data-cursor-hover onClick={onSave}>
                <span className="dc-keep-halo" aria-hidden="true" />
                KEEP THIS DREAM
              </button>
              <button type="button" className="dc-let-go" data-cursor-hover onClick={onLetGo}>
                <DispersingLetters text="LET IT GO" />
              </button>
            </div>
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
