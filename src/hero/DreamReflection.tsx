import { useRef, useState, type CSSProperties } from 'react';
import { buildReflectionQuestion } from './dreamElements';
import { usePointerParallax } from './usePointerParallax';
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

/** Irregular, hand-placed positions/depths for the floating glass elements —
    deliberately not a grid. Cycled by index so any number of real elements
    (never more than 6, see dreamElements.ts) gets a varied arrangement. */
const ELEMENT_LAYOUT: { x: number; y: number; depth: 0 | 1 | 2 }[] = [
  { x: -27, y: -16, depth: 1 },
  { x: 24, y: -21, depth: 0 },
  { x: -33, y: 12, depth: 2 },
  { x: 31, y: 9, depth: 1 },
  { x: -9, y: 26, depth: 0 },
  { x: 12, y: -30, depth: 2 },
];

const REFLECTION_FRAGMENTS: {
  key: keyof Pick<DreamReflectionResult, 'observation' | 'personalAssociation' | 'possibleThread' | 'continuityQuestion'>;
  label: string;
  emphasis?: boolean;
}[] = [
  { key: 'observation', label: 'WHAT I NOTICE' },
  { key: 'personalAssociation', label: 'YOUR ASSOCIATION' },
  { key: 'possibleThread', label: 'ONE POSSIBLE THREAD' },
  { key: 'continuityQuestion', label: 'A QUESTION WORTH KEEPING', emphasis: true },
];

/**
 * WHAT STANDS OUT TO YOU? → pick one real dream element → a reflection
 * question generated from that exact element → free-text response → one
 * grounded reflection from the real reflection engine. Every choice and
 * every reflection field comes from the real dream/response — nothing
 * here is invented, no dream-dictionary meanings, no diagnosis. This file
 * only governs presentation; the selection/reflection logic above is
 * untouched from the props down.
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
  const fieldRef = useRef<HTMLDivElement>(null);
  usePointerParallax(fieldRef, 16, CHOICE_STEPS.has(step));

  const questionText = QUESTION_STEPS.has(step) && selectedElement ? buildReflectionQuestion(selectedElement) : null;
  const showPromptOnly = step === 'prompt' || step === 'choices' || step === 'selected';
  const showAnchor = selectedElement && (step === 'reflecting' || step === 'interpreting' || step === 'reflection');

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
      {questionText && (
        <p className={`dr-question${step === 'reflecting' ? ' dr-question--asking' : ''}`}>
          {showPromptOnly ? 'WHAT STANDS OUT TO YOU?' : questionText}
        </p>
      )}

      {showAnchor && <p className="dr-anchor">{selectedElement}</p>}

      {CHOICE_STEPS.has(step) && elements.length > 0 && (
        <div className="dr-elements" ref={fieldRef} aria-hidden={step !== 'choices'}>
          {elements.map((el, i) => {
            const layout = ELEMENT_LAYOUT[i % ELEMENT_LAYOUT.length];
            return (
              <button
                key={el}
                type="button"
                className={`dr-element${selectedElement === el ? ' is-selected' : ''}${
                  selectedElement && selectedElement !== el ? ' is-fading' : ''
                }`}
                data-depth={layout.depth}
                data-cursor-hover
                disabled={!!selectedElement}
                onClick={() => onSelect(el)}
                style={
                  {
                    '--ex': `${layout.x}vw`,
                    '--ey': `${layout.y}vh`,
                    '--fi': i,
                  } as CSSProperties
                }
              >
                <span className="dr-element-label">{el.toUpperCase()}</span>
              </button>
            );
          })}
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
          {REFLECTION_FRAGMENTS.map((f, i) => (
            <div
              key={f.key}
              className={`drr-plane${f.emphasis ? ' drr-plane--emphasis' : ''}`}
              style={{ '--fi': i } as CSSProperties}
            >
              <h3 className="drr-label">{f.label}</h3>
              <p className={`drr-text${f.emphasis ? ' drr-text--question' : ''}`}>{reflectionResult[f.key]}</p>
            </div>
          ))}

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
