import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { buildReflectionQuestion } from './dreamElements';
import { usePointerParallax } from './usePointerParallax';
import { sanitizeAiTextForDisplay } from './appLanguage';
import { FALLBACK_ACCENT, type AccentColor } from './dreamAccentColor';
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
  accentColor: AccentColor | null;
  /** This dream's own harmonious palette — cycled one color per bubble, so the arrival scene never reduces to one accent. */
  dreamPalette: AccentColor[] | null;
  onSelect: (element: string) => void;
  onSubmitReflection: (text: string) => void;
  onRetryReflection: () => void;
  onContinue: () => void;
}

/** Simple line-art glyphs for the four reflection nodes — thin strokes that
    inherit `currentColor` so they pick up each node's own glow tint. */
const NODE_ICONS: ReactNode[] = [
  // WHAT I NOTICE — an eye.
  <svg key="eye" viewBox="0 0 32 32" fill="none">
    <path d="M4 16c3.5-6 8-9 12-9s8.5 3 12 9c-3.5 6-8 9-12 9s-8.5-3-12-9Z" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="16" cy="16" r="3.4" stroke="currentColor" strokeWidth="1.4" />
  </svg>,
  // YOUR ASSOCIATION — a heart.
  <svg key="heart" viewBox="0 0 32 32" fill="none">
    <path
      d="M16 25S5 18.2 5 11.6C5 7.9 7.9 5 11.4 5c2 0 3.8 1 4.6 2.6C16.8 6 18.6 5 20.6 5 24.1 5 27 7.9 27 11.6 27 18.2 16 25 16 25Z"
      stroke="currentColor"
      strokeWidth="1.4"
    />
  </svg>,
  // ONE POSSIBLE THREAD — a link.
  <svg key="link" viewBox="0 0 32 32" fill="none">
    <rect x="5" y="12" width="14" height="8" rx="4" transform="rotate(-25 5 12)" stroke="currentColor" strokeWidth="1.4" />
    <rect x="13" y="12" width="14" height="8" rx="4" transform="rotate(-25 13 12)" stroke="currentColor" strokeWidth="1.4" />
  </svg>,
  // A QUESTION WORTH KEEPING — a question mark.
  <svg key="question" viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="1.4" />
    <path d="M12.5 12.5c0-2 1.6-3.5 3.6-3.5s3.6 1.4 3.6 3.2c0 2.6-3.6 2.6-3.6 5.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="16.1" cy="21.6" r="0.9" fill="currentColor" />
  </svg>,
];

const CHOICE_STEPS = new Set<InsideStep>(['choices', 'selected']);
const QUESTION_STEPS = new Set<InsideStep>(['prompt', 'choices', 'selected', 'reflecting']);
const ARRIVAL_STEPS = new Set<InsideStep>(['prompt', 'choices', 'selected', 'reflecting']);

const LENS_LABELS: Record<'cognitive' | 'jungian' | 'psychodynamic', string> = {
  cognitive: 'COGNITIVE',
  jungian: 'JUNGIAN',
  psychodynamic: 'PSYCHODYNAMIC',
};

/** The node path sits in the frame's left third, clear of the upper-center
    zone where a generated portrait's face most often sits — vertical
    spacing between the four nodes is handled by flexbox, not hand-placed
    coordinates, per the approved reflection-path reference. */
const NODE_LEFT_VW = 8;

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
  accentColor,
  dreamPalette,
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
  const accent = accentColor ?? FALLBACK_ACCENT;
  const palette = dreamPalette && dreamPalette.length > 0 ? dreamPalette : [accent, accent, accent, accent];

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
  const showAnchor = selectedElement && (step === 'interpreting' || step === 'reflection');

  const handleContinue = () => {
    const text = responseText.trim();
    if (!text) return;
    onSubmitReflection(text);
  };

  const activeLenses = reflectionResult
    ? (Object.entries(reflectionResult.lenses) as [keyof typeof LENS_LABELS, string | null][]).filter(([, text]) => !!text)
    : [];

  return (
    <div className="dream-reflection" data-step={step} style={{ '--accent-rgb': `${accent.r}, ${accent.g}, ${accent.b}` } as CSSProperties}>
      {ARRIVAL_STEPS.has(step) && (
        <div className="dream-arrival" data-step={step}>
          <div className="da-content">
            {(step === 'prompt' || step === 'choices' || step === 'selected') && (
              <>
                <h2 className="da-title">THIS IS YOUR DREAM</h2>
                <p className="da-subtitle">Choose the moment that stands out to you</p>
              </>
            )}

            {(step === 'choices' || step === 'selected') && elements.length > 0 && (
              <div className="da-bubbles" ref={fieldRef} aria-hidden={step !== 'choices'}>
                {elements.map((el, i) => {
                  const bubbleColor = palette[i % palette.length];
                  return (
                    <button
                      key={el}
                      type="button"
                      className={`da-bubble${selectedElement === el ? ' is-selected' : ''}${
                        selectedElement && selectedElement !== el ? ' is-fading' : ''
                      }`}
                      data-cursor-hover
                      disabled={!!selectedElement}
                      onClick={() => onSelect(el)}
                      style={
                        {
                          '--bubble-rgb': `${bubbleColor.r}, ${bubbleColor.g}, ${bubbleColor.b}`,
                          '--bi': i,
                        } as CSSProperties
                      }
                    >
                      <span className="da-bubble-cloud" aria-hidden="true" />
                      <span className="da-bubble-ring" aria-hidden="true" />
                      <span className="da-bubble-pulse" aria-hidden="true" />
                      <span className="da-bubble-particles" aria-hidden="true">
                        <span className="da-bubble-particle" />
                        <span className="da-bubble-particle da-bubble-particle--b" />
                        <span className="da-bubble-particle da-bubble-particle--c" />
                      </span>
                      <span className="da-bubble-label">{el.toUpperCase()}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {step === 'reflecting' && (
              <>
                <p className="dr-question dr-question--asking">{questionText}</p>
                {selectedElement && <p className="dr-anchor">{selectedElement}</p>}
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
              </>
            )}
          </div>
        </div>
      )}

      {showAnchor && <p className="dr-anchor">{selectedElement}</p>}

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
        <div
          className="dream-thought-sequence"
          ref={sequenceRef}
          data-stage={stage}
          style={
            {
              '--accent-rgb': `${accent.r}, ${accent.g}, ${accent.b}`,
              '--lit-fraction': String(Math.max(0, Math.min(1, (stage - 1) / (REFLECTION_FRAGMENTS.length - 1)))),
            } as CSSProperties
          }
        >
          {/* A single reflection path — four glowing nodes connected by one
              light that travels down as each thought resolves. Previous
              nodes stay visible, just quieter, never removed. */}
          <div className="dr-node-path" style={{ left: `${NODE_LEFT_VW}vw` } as CSSProperties}>
            <div className="dr-node-line" aria-hidden="true">
              <div className="dr-node-line-fill" />
            </div>
            {REFLECTION_FRAGMENTS.map((f, i) => {
              const stageNumber = i + 1;
              const state = stageNumber > stage ? 'pending' : stageNumber === stage ? 'active' : 'settled';
              return (
                <div key={f.key} className="dr-node-row" data-state={state}>
                  <span className="dr-node-icon" aria-hidden="true">
                    <span className="dr-node-icon-glow" />
                    {NODE_ICONS[i]}
                  </span>
                  <div className={`dr-thought dr-thought--${f.tier}`}>
                    <h3 className="dr-thought-label">{f.label}</h3>
                    <p className="dr-thought-text">{sanitizeAiTextForDisplay(reflectionResult[f.key])}</p>
                  </div>
                </div>
              );
            })}
          </div>

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
