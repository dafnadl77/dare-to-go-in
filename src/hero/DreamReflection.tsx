import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { buildReflectionQuestion } from './dreamElements';
import { usePointerParallax } from './usePointerParallax';
import { sanitizeAiTextForDisplay } from './appLanguage';
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

/** Irregular, hand-placed positions/depths for the floating dream-element
    thoughts — deliberately not a grid, no enclosing box. Cycled by index so
    any number of real elements (never more than 6, see dreamElements.ts)
    gets a varied arrangement. */
const ELEMENT_LAYOUT: { x: number; y: number; depth: 0 | 1 | 2 }[] = [
  { x: -27, y: -16, depth: 1 },
  { x: 24, y: -21, depth: 0 },
  { x: -33, y: 12, depth: 2 },
  { x: 31, y: 9, depth: 1 },
  { x: -9, y: 26, depth: 0 },
  { x: 12, y: -30, depth: 2 },
];

/** Fixed "home" position for each reflection thought, chosen to stay off
    the safer margins of the frame (left/right thirds, lower half) rather
    than the upper-center zone where a generated portrait's face most often
    sits — see "SPATIAL COMPOSITION": frame the image, never obscure it. */
const THOUGHT_HOME = [
  { left: '17vw', top: '58vh', align: 'left', maxWidth: '30em' }, // WHAT I NOTICE
  { left: '80vw', top: '24vh', align: 'right', maxWidth: '26em' }, // YOUR ASSOCIATION
  { left: '50vw', top: '86vh', align: 'center', maxWidth: '38em' }, // ONE POSSIBLE THREAD
  { left: '50vw', top: '56vh', align: 'center', maxWidth: '30em' }, // A QUESTION WORTH KEEPING
] as const;

const REFLECTION_FRAGMENTS: {
  key: keyof Pick<DreamReflectionResult, 'observation' | 'personalAssociation' | 'possibleThread' | 'continuityQuestion'>;
  label: string;
  tier: 'body' | 'thread' | 'question';
}[] = [
  { key: 'observation', label: 'WHAT I NOTICE', tier: 'body' },
  { key: 'personalAssociation', label: 'YOUR ASSOCIATION', tier: 'body' },
  { key: 'possibleThread', label: 'ONE POSSIBLE THREAD', tier: 'thread' },
  { key: 'continuityQuestion', label: 'A QUESTION WORTH KEEPING', tier: 'question' },
];

// How long each thought stays the active/focused one before the next
// resolves in — a hold long enough to read, per stage. The thread (the
// interpretive turn) gets a beat longer, matching its larger emphasis.
const STAGE_HOLD_MS = [4200, 4200, 4800];

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
  const sequenceRef = useRef<HTMLDivElement>(null);
  usePointerParallax(fieldRef, 16, CHOICE_STEPS.has(step));
  usePointerParallax(sequenceRef, 10, step === 'reflection');

  // The cinematic reveal sequence — stage 0 = nothing shown yet, 1..3 = that
  // thought is the active/focused one, 4 = the question holds as the final,
  // quiet focus (terminal; CONTINUE is a separate, later invitation).
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (step !== 'reflection') {
      setStage(0);
      return;
    }
    setStage(1);
  }, [step]);

  useEffect(() => {
    if (stage < 1 || stage > 3) return;
    const t = setTimeout(() => setStage((s) => s + 1), STAGE_HOLD_MS[stage - 1]);
    return () => clearTimeout(t);
  }, [stage]);

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
                <span className="dr-element-glow" aria-hidden="true" />
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
        <div className="dream-thought-sequence" ref={sequenceRef} data-stage={stage}>
          {REFLECTION_FRAGMENTS.map((f, i) => {
            const stageNumber = i + 1;
            const home = THOUGHT_HOME[i];
            const state = stageNumber > stage ? 'pending' : stageNumber === stage ? 'active' : 'settled';
            return (
              <div
                key={f.key}
                className={`dr-thought dr-thought--${f.tier}`}
                data-state={state}
                style={
                  {
                    left: home.left,
                    top: home.top,
                    textAlign: home.align,
                    maxWidth: home.maxWidth,
                    '--fi': i,
                  } as CSSProperties
                }
              >
                <span className="dr-thought-glow" aria-hidden="true" />
                <h3 className="dr-thought-label">{f.label}</h3>
                <p className="dr-thought-text">{sanitizeAiTextForDisplay(reflectionResult[f.key])}</p>
              </div>
            );
          })}

          {/* A brief, unlabeled wisp of light traveling between the first two
              settled thoughts as the interpretive thread connects them —
              never a diagram, never literal, gone again just as quietly. */}
          {stage === 3 && <div className="dr-thought-connector" aria-hidden="true" />}

          {stage >= 4 && activeLenses.length > 0 && (
            <div className="dr-lenses-wrap">
              <button type="button" className="dr-lenses-toggle" data-cursor-hover onClick={() => setLensesVisible((v) => !v)}>
                {lensesVisible ? 'HIDE OTHER LENSES' : 'SEE OTHER LENSES'}
              </button>
              {lensesVisible && (
                <div className="dr-lenses">
                  {activeLenses.map(([key, text]) => (
                    <p className="dr-lens" key={key}>
                      <span className="dr-lens-label">{LENS_LABELS[key]}</span> {sanitizeAiTextForDisplay(text as string)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {stage >= 4 && <p className="dr-grounding">{reflectionResult.groundingStatement}</p>}

          {stage >= 4 && (
            <div className={`dr-continue-wrap${continueVisible ? ' is-visible' : ''}`}>
              <button type="button" className="dr-choice dr-choice--yes" data-cursor-hover onClick={onContinue}>
                CONTINUE
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
