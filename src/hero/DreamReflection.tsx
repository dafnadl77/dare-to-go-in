import { useState } from 'react';
import { buildReflectionQuestion } from './dreamElements';
import type { DreamReflectionResult } from './dreamReflectionSchema';
import type { InsideStep } from './DreamReconstruction';
import './DreamReflection.css';

interface DreamReflectionProps {
  step: InsideStep;
  elements: string[];
  selectedElement: string | null;
  reflectionResult: DreamReflectionResult | null;
  reflectionErrored: boolean;
  /** Revealed only once the dreamer has had enough time to read the reflection — see HeroDream's continueVisible timer. */
  continueVisible: boolean;
  onSelect: (element: string) => void;
  onSubmitReflection: (text: string) => void;
  onRetryReflection: () => void;
  onContinue: () => void;
}

const CHOICE_STEPS = new Set<InsideStep>(['choices', 'selected']);
const QUESTION_STEPS = new Set<InsideStep>(['prompt', 'choices', 'selected', 'reflecting']);

const LENS_LABELS: Record<'cognitive' | 'jungian' | 'psychodynamic', string> = {
  cognitive: 'COGNITIVE',
  jungian: 'JUNGIAN',
  psychodynamic: 'PSYCHODYNAMIC',
};

/**
 * WHAT STANDS OUT TO YOU? → pick one real dream element → a reflection
 * question generated from that exact element → free-text response → one
 * grounded reflection from the real reflection engine. Every choice and
 * every reflection field comes from the real dream/response — nothing
 * here is invented, no dream-dictionary meanings, no diagnosis.
 */
export default function DreamReflection({
  step,
  elements,
  selectedElement,
  reflectionResult,
  reflectionErrored,
  continueVisible,
  onSelect,
  onSubmitReflection,
  onRetryReflection,
  onContinue,
}: DreamReflectionProps) {
  const [responseText, setResponseText] = useState('');
  const [lensesVisible, setLensesVisible] = useState(false);

  const questionText = QUESTION_STEPS.has(step) && selectedElement ? buildReflectionQuestion(selectedElement) : null;
  const showPromptOnly = step === 'prompt' || step === 'choices' || step === 'selected';

  const handleContinue = () => {
    const text = responseText.trim();
    if (!text) return;
    onSubmitReflection(text);
  };

  const activeLenses = reflectionResult
    ? (Object.entries(reflectionResult.lenses) as [keyof typeof LENS_LABELS, string | null][]).filter(([, text]) => !!text)
    : [];

  return (
    <div className="dream-reflection" data-step={step}>
      {questionText && <p className="dr-question">{showPromptOnly ? 'WHAT STANDS OUT TO YOU?' : questionText}</p>}

      {CHOICE_STEPS.has(step) && elements.length > 0 && (
        <div className="dr-elements" aria-hidden={step !== 'choices'}>
          {elements.map((el) => (
            <button
              key={el}
              type="button"
              className={`dr-element${selectedElement === el ? ' is-selected' : ''}${
                selectedElement && selectedElement !== el ? ' is-fading' : ''
              }`}
              data-cursor-hover
              disabled={!!selectedElement}
              onClick={() => onSelect(el)}
            >
              {el.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {step === 'reflecting' && (
        <div className="dr-response">
          <textarea
            className="dr-response-textarea"
            value={responseText}
            onChange={(e) => setResponseText(e.target.value)}
            placeholder="TYPE WHAT COMES TO MIND..."
            dir="auto"
            rows={3}
          />
          <button type="button" className="dr-choice" data-cursor-hover onClick={handleContinue}>
            CONTINUE
          </button>
        </div>
      )}

      {step === 'interpreting' && !reflectionErrored && <p className="dr-interpreting">REFLECTING&hellip;</p>}

      {step === 'interpreting' && reflectionErrored && (
        <div className="dr-reflection-error">
          <p className="dr-line">I COULDN&rsquo;T QUITE GATHER MY THOUGHTS.</p>
          <button type="button" className="dr-choice" data-cursor-hover onClick={onRetryReflection}>
            TRY AGAIN
          </button>
        </div>
      )}

      {step === 'reflection' && reflectionResult && (
        <div className="dream-reflection-result">
          <div className="drr-section">
            <h3 className="drr-label">WHAT I NOTICE</h3>
            <p className="drr-text">{reflectionResult.observation}</p>
          </div>

          <div className="drr-section">
            <h3 className="drr-label">YOUR ASSOCIATION</h3>
            <p className="drr-text">{reflectionResult.personalAssociation}</p>
          </div>

          <div className="drr-section">
            <h3 className="drr-label">ONE POSSIBLE THREAD</h3>
            <p className="drr-text">{reflectionResult.possibleThread}</p>
          </div>

          <div className="drr-section">
            <h3 className="drr-label">A QUESTION WORTH KEEPING</h3>
            <p className="drr-text drr-text--question">{reflectionResult.continuityQuestion}</p>
          </div>

          {activeLenses.length > 0 && (
            <div className="drr-lenses-toggle-wrap">
              <button
                type="button"
                className="drr-lenses-toggle"
                data-cursor-hover
                onClick={() => setLensesVisible((v) => !v)}
              >
                {lensesVisible ? 'HIDE OTHER LENSES' : 'SEE OTHER LENSES'}
              </button>
            </div>
          )}

          {lensesVisible && (
            <div className="drr-lenses">
              {activeLenses.map(([key, text]) => (
                <div className="drr-lens" key={key}>
                  <h4 className="drr-lens-label">{LENS_LABELS[key]}</h4>
                  <p className="drr-text">{text}</p>
                </div>
              ))}
            </div>
          )}

          <p className="drr-grounding">{reflectionResult.groundingStatement}</p>

          <div className={`drr-continue-wrap${continueVisible ? ' is-visible' : ''}`}>
            <button type="button" className="dr-choice dr-choice--yes" data-cursor-hover onClick={onContinue}>
              CONTINUE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
