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

/**
 * The end of the dream journey — no dead end, no modal, no dashboard card.
 * 'closing': the reflection quietly fades while DON'T LET IT DISAPPEAR
 * reveals with the two closing choices. 'saved'/'gone' are the terminal
 * outcomes of SAVE THIS DREAM / LET IT GO respectively.
 */
export default function DreamClosing({ step, reflectionResult, onSave, onLetGo, onReturnToRoom }: DreamClosingProps) {
  return (
    <div className="dream-closing" data-step={step}>
      {step === 'closing' && (
        <>
          <div className="dc-fading-reflection" aria-hidden="true">
            <p className="dc-fading-text">{reflectionResult.observation}</p>
            <p className="dc-fading-text dc-fading-text--question">{reflectionResult.continuityQuestion}</p>
          </div>

          <div className="dc-block dc-block--closing">
            <p className="dc-title">DON&rsquo;T LET IT DISAPPEAR.</p>
            <div className="dc-choices">
              <button type="button" className="dr-choice dr-choice--yes" data-cursor-hover onClick={onSave}>
                SAVE THIS DREAM
              </button>
              <button type="button" className="dr-choice" data-cursor-hover onClick={onLetGo}>
                LET IT GO
              </button>
            </div>
          </div>
        </>
      )}

      {step === 'saving' && (
        <div className="dc-converging" aria-hidden="true">
          <p className="dc-converge-text">{reflectionResult.observation}</p>
          <p className="dc-converge-text dc-converge-text--question">{reflectionResult.continuityQuestion}</p>
        </div>
      )}

      {step === 'saved' && (
        <div className="dc-block dc-block--enter">
          <p className="dc-title">DREAM SAVED.</p>
          <button type="button" className="dr-choice dr-choice--yes" data-cursor-hover onClick={onReturnToRoom}>
            RETURN TO THE ROOM
          </button>
        </div>
      )}

      {step === 'gone' && (
        <div className="dc-block dc-block--enter">
          <p className="dc-title">GONE.</p>
        </div>
      )}
    </div>
  );
}
