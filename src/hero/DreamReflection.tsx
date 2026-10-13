import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { buildReflectionQuestion } from './dreamElements';
import { usePointerParallax } from './usePointerParallax';
import { useReflectionDisplay } from './useReflectionDisplay';
import { useScrollCue } from './useScrollCue';
import { FALLBACK_ACCENT, type AccentColor } from './dreamAccentColor';
import type { DreamReflectionResult } from './dreamReflectionSchema';
import { EMOTION_IDS, MAX_EMOTIONS, type EmotionId } from './dreamEmotions';
import type { InsideStep } from './DreamReconstruction';
import { useLanguage } from '../i18n/LanguageContext';
import EditorialTitle from '../ui/EditorialTitle';
import './DreamReflection.css';
import './DreamEmotions.css';

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
  /** The optional feelings step. An empty list means the dreamer skipped it. */
  onSubmitEmotions: (emotions: EmotionId[]) => void;
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
  // THE FEELINGS YOU NAMED — a soft wave.
  <svg key="wave" viewBox="0 0 32 32" fill="none">
    <path d="M4 18c3-6 5-6 8 0s5 6 8 0 5-6 8 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>,
];

const CHOICE_STEPS = new Set<InsideStep>(['choices', 'selected']);
const QUESTION_STEPS = new Set<InsideStep>(['prompt', 'choices', 'selected', 'reflecting']);
const ARRIVAL_STEPS = new Set<InsideStep>(['prompt', 'choices', 'selected', 'reflecting', 'emotions']);

// Translation-key lookup (not the literal label itself — see t() calls at
// render time) for each lens name to the i18n key that holds its display
// label in the current language.
const LENS_LABEL_KEYS: Record<'cognitive' | 'jungian' | 'psychodynamic', string> = {
  cognitive: 'reflection.cognitive',
  jungian: 'reflection.jungian',
  psychodynamic: 'reflection.psychodynamic',
};

/** The node path sits in the frame's left third, clear of the upper-center
    zone where a generated portrait's face most often sits — vertical
    spacing between the four nodes is handled by flexbox, not hand-placed
    coordinates, per the approved reflection-path reference. */
const NODE_LEFT_VW = 11;

// `labelKey` is an i18n path (see LENS_LABEL_KEYS above for the same
// pattern), resolved via t() at render time — not the literal text.
interface ReflectionFragment {
  key: keyof Pick<DreamReflectionResult, 'observation' | 'personalAssociation' | 'emotionReflection' | 'possibleThread' | 'continuityQuestion'>;
  labelKey: string;
  tier: 'body' | 'thread' | 'question';
  /** Index into NODE_ICONS. */
  icon: number;
}

const OBSERVATION: ReflectionFragment = { key: 'observation', labelKey: 'reflection.whatINotice', tier: 'body', icon: 0 };
const ASSOCIATION: ReflectionFragment = { key: 'personalAssociation', labelKey: 'reflection.yourAssociation', tier: 'body', icon: 1 };
const FEELINGS: ReflectionFragment = { key: 'emotionReflection', labelKey: 'reflection.theFeelingsYouNamed', tier: 'body', icon: 4 };
const THREAD: ReflectionFragment = { key: 'possibleThread', labelKey: 'reflection.onePossibleThread', tier: 'thread', icon: 2 };
const QUESTION: ReflectionFragment = { key: 'continuityQuestion', labelKey: 'reflection.aQuestionWorthKeeping', tier: 'question', icon: 3 };

const BASE_FRAGMENTS: ReflectionFragment[] = [OBSERVATION, ASSOCIATION, THREAD, QUESTION];

/** The path has four nodes. A fifth, the feelings the dreamer named, joins it only when the reflection has something to say about them (never for a dreamer who skipped that step, nor for a dream saved before it existed). */
function fragmentsFor(result: DreamReflectionResult | null): ReflectionFragment[] {
  const text = result?.emotionReflection;
  return typeof text === 'string' && text.trim() !== '' ? [OBSERVATION, ASSOCIATION, FEELINGS, THREAD, QUESTION] : BASE_FRAGMENTS;
}

// How long each thought stays the active/focused one before the next
// resolves in — a hold long enough to read, per stage. The thread (the
// interpretive turn) gets a beat longer, matching its larger emphasis.
const HOLD_MS = 4200;
const THREAD_HOLD_MS = 4800;

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
  onSubmitEmotions,
  onRetryReflection,
  onContinue,
}: DreamReflectionProps) {
  const { t, language } = useLanguage();
  const showAiText = useReflectionDisplay(reflectionResult);
  const [responseText, setResponseText] = useState('');
  const [lensesVisible, setLensesVisible] = useState(false);
  // The short explanation of the symbols-and-meanings lens opens only when the dreamer asks for it.
  const [lensInfoOpen, setLensInfoOpen] = useState(false);
  // The optional feelings step: which of the twelve are chosen (at most three).
  const [selectedEmotions, setSelectedEmotions] = useState<EmotionId[]>([]);
  const toggleEmotion = (id: EmotionId) =>
    setSelectedEmotions((current) => (current.includes(id) ? current.filter((x) => x !== id) : current.length >= MAX_EMOTIONS ? current : [...current, id]));
  useEffect(() => {
    if (step === 'emotions') setSelectedEmotions([]);
  }, [step]);
  const fieldRef = useRef<HTMLDivElement>(null);
  const sequenceRef = useRef<HTMLDivElement>(null);
  const continueWrapRef = useRef<HTMLDivElement>(null);
  usePointerParallax(fieldRef, 16, CHOICE_STEPS.has(step));
  usePointerParallax(sequenceRef, 10, step === 'reflection');
  const accent = accentColor ?? FALLBACK_ACCENT;
  const palette = dreamPalette && dreamPalette.length > 0 ? dreamPalette : [accent, accent, accent, accent];
  const fragments = fragmentsFor(reflectionResult);
  // The last stage is the terminal one: every thought has resolved and the question holds.
  const lastStage = fragments.length;

  // FIT CHECK. The fixed interpretation layout (an absolutely placed column of thoughts above a closing line) was drawn for four short
  // thoughts. A longer reflection, a fifth thought (the feelings), the one-line summary, English wording or a shorter screen can make the
  // last thought run into the closing line. So after the FIXED layout has rendered, its own thoughts are measured against the box they were
  // given, and only when they do not fit does the interpretation flow and scroll instead (the same way it already does on a phone).
  // Re-checked when the content or the window changes; the measurement is always taken on a fixed-layout render, so it cannot flip-flop.
  const pathRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(() => (typeof window === 'undefined' ? '' : `${window.innerWidth}x${window.innerHeight}`));
  useEffect(() => {
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setViewport(`${window.innerWidth}x${window.innerHeight}`), 150);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  const fitKey = `${step}|${viewport}|${language}|${fragments.length}|${reflectionResult ? [reflectionResult.observation, reflectionResult.personalAssociation, reflectionResult.emotionReflection ?? '', reflectionResult.possibleThread, reflectionResult.continuityQuestion, reflectionResult.summary ?? ''].join('|').length : 0}`;
  const [fit, setFit] = useState({ key: '', flow: false });
  useLayoutEffect(() => {
    if (fit.key !== fitKey) setFit({ key: fitKey, flow: false });
  }, [fit.key, fitKey]);
  useLayoutEffect(() => {
    if (fit.key !== fitKey || fit.flow || step !== 'reflection' || !reflectionResult) return;
    const path = pathRef.current;
    if (!path || !window.matchMedia('(min-width: 641px) and (min-height: 501px)').matches) return;
    const rows = path.querySelectorAll('.dr-node-row');
    const last = rows[rows.length - 1];
    if (last && last.getBoundingClientRect().bottom > path.getBoundingClientRect().bottom + 4) setFit({ key: fitKey, flow: true });
  });
  const flowLayout = fit.key === fitKey && fit.flow;

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
    if (stage < 1 || stage >= lastStage) return;
    const hold = fragments[stage - 1].tier === 'thread' ? THREAD_HOLD_MS : HOLD_MS;
    const timer = setTimeout(() => setStage((s) => s + 1), hold);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, lastStage]);

  // Mobile-only orientation cue: the interpretation can end near the bottom
  // of the screen with CONTINUE just below the fold — this only tells the
  // reader more is there. Never moves or pins anything (see useScrollCue).
  const showScrollCue = useScrollCue(step === 'reflection' && stage >= lastStage, continueWrapRef);

  const questionText = QUESTION_STEPS.has(step) && selectedElement ? buildReflectionQuestion(selectedElement, t) : null;
  const showAnchor = selectedElement && (step === 'interpreting' || step === 'reflection');

  const handleContinue = () => {
    const text = responseText.trim();
    if (!text) return;
    onSubmitReflection(text);
  };

  const activeLenses = reflectionResult
    ? (Object.entries(reflectionResult.lenses) as [keyof typeof LENS_LABEL_KEYS, string | null][]).filter(([, text]) => !!text)
    : [];

  return (
    <div className="dream-reflection" data-step={step} data-flow={step === 'reflection' && flowLayout ? 'true' : undefined} style={{ '--accent-rgb': `${accent.r}, ${accent.g}, ${accent.b}` } as CSSProperties}>
      {ARRIVAL_STEPS.has(step) && (
        <div className="dream-arrival" data-step={step}>
          <div className="da-content">
            {(step === 'prompt' || step === 'choices' || step === 'selected') && (
              <>
                <h2 className="da-title">
                  <EditorialTitle text={t('reflection.momentQuestion')} />
                </h2>
                <p className="da-subtitle">{t('reflection.momentHint')}</p>
              </>
            )}

            {(step === 'choices' || step === 'selected') && elements.length > 0 && (
              <div
                className="da-choice-row"
                ref={fieldRef}
                aria-hidden={step !== 'choices'}
                style={{ '--choice-count': elements.length } as CSSProperties}
              >
                {elements.map((el, i) => {
                  const traceColor = palette[i % palette.length];
                  return (
                    <button
                      key={el}
                      type="button"
                      className={`da-choice${selectedElement === el ? ' is-selected' : ''}${
                        selectedElement && selectedElement !== el ? ' is-fading' : ''
                      }`}
                      data-cursor-hover
                      disabled={!!selectedElement}
                      onClick={() => onSelect(el)}
                      style={
                        {
                          '--trace-rgb': `${traceColor.r}, ${traceColor.g}, ${traceColor.b}`,
                          '--ci': i,
                        } as CSSProperties
                      }
                    >
                      <span className="da-choice-aura" aria-hidden="true" />
                      <span className="da-choice-trace" aria-hidden="true">
                        <span className="da-choice-trace-particle" />
                        <span className="da-choice-trace-particle da-choice-trace-particle--b" />
                      </span>
                      <span className="da-choice-sparkle" aria-hidden="true" />
                      <span className="da-choice-pulse" aria-hidden="true" />
                      <span className="da-choice-text">{el}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {step === 'reflecting' && (
              <>
                <p className="dr-question dr-question--asking">
                  {questionText && <EditorialTitle text={questionText} />}
                </p>
                {selectedElement && <p className="dr-anchor">{selectedElement}</p>}
                <div className="dr-response">
                  <div className={`dr-writing-surface${responseText ? ' has-text' : ''}`}>
                    <textarea
                      className="dr-response-textarea"
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      placeholder={t('reflection.writingPlaceholder')}
                      dir="auto"
                      rows={3}
                    />
                    <span className="dr-writing-line" aria-hidden="true">
                      <span className="dr-writing-line-glow" />
                    </span>
                    <span className="dr-writing-sparks" aria-hidden="true">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <span key={i} className="dr-writing-spark" style={{ '--wsi': i } as CSSProperties} />
                      ))}
                    </span>
                  </div>
                  <button type="button" className="dr-choice" data-cursor-hover onClick={handleContinue}>
                    {t('reflection.continue')}
                  </button>
                </div>
              </>
            )}

            {step === 'emotions' && (
              <>
                <h2 className="da-title de-title">
                  <EditorialTitle text={t('reflection.emotionsTitle')} />
                </h2>
                <p className="da-subtitle de-subtitle">{t('reflection.emotionsDescription')}</p>
                <div className="de-chips" role="group" aria-label={t('reflection.emotionsGroupAria')}>
                  {EMOTION_IDS.map((id, i) => {
                    const on = selectedEmotions.includes(id);
                    const muted = !on && selectedEmotions.length >= MAX_EMOTIONS;
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`de-chip${on ? ' is-selected' : ''}${muted ? ' is-muted' : ''}`}
                        aria-pressed={on}
                        aria-disabled={muted}
                        data-cursor-hover
                        style={{ '--ei': i } as CSSProperties}
                        onClick={() => toggleEmotion(id)}
                      >
                        <svg className="de-chip-check" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="M3.5 8.4l3 3 6-6.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="de-chip-text">{t(`reflection.emotions.${id}`)}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="de-count" aria-live="polite">
                  {t('reflection.emotionsCount').replace('{count}', String(selectedEmotions.length))}
                </p>
                <div className="de-actions">
                  <button type="button" className="dr-choice" data-cursor-hover onClick={() => onSubmitEmotions(selectedEmotions)}>
                    {t('reflection.emotionsContinue')}
                  </button>
                  <button type="button" className="de-skip" data-cursor-hover onClick={() => onSubmitEmotions([])}>
                    {t('reflection.emotionsSkip')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showAnchor && (
        <>
          <p className="dr-anchor-label">{t('reflection.chosenMoment')}</p>
          <p className="dr-anchor">{selectedElement}</p>
          <span className="dr-anchor-rule" aria-hidden="true" />
        </>
      )}

      <div className={`dr-scroll-cue${showScrollCue ? ' is-visible' : ''}`} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M6 9.5l6 6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {step === 'interpreting' && !reflectionErrored && <p className="dr-interpreting">{t('reflection.reflecting')}</p>}

      {step === 'interpreting' && reflectionErrored && (
        <div className="dr-reflection-error">
          <p className="dr-line">{t('reflection.couldntGatherThoughts')}</p>
          <button type="button" className="dr-choice" data-cursor-hover onClick={onRetryReflection}>
            {t('reflection.tryAgain')}
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
              '--lit-fraction': String(Math.max(0, Math.min(1, (stage - 1) / (fragments.length - 1)))),
            } as CSSProperties
          }
        >
          {/* A single reflection path — four glowing nodes connected by one
              light that travels down as each thought resolves. Previous
              nodes stay visible, just quieter, never removed. */}
          <div className="dr-node-path" ref={pathRef} style={{ left: `${NODE_LEFT_VW}vw` } as CSSProperties}>
            <div className="dr-node-line" aria-hidden="true">
              <div className="dr-node-line-fill">
                <span className="dr-node-line-spark" />
              </div>
            </div>
            {fragments.map((f, i) => {
              const stageNumber = i + 1;
              const state = stageNumber > stage ? 'pending' : stageNumber === stage ? 'active' : 'settled';
              return (
                <div key={f.key} className="dr-node-row" data-state={state}>
                  <span className="dr-node-icon" aria-hidden="true">
                    <span className="dr-node-icon-glow" />
                    {NODE_ICONS[f.icon]}
                  </span>
                  <div className={`dr-thought dr-thought--${f.tier}`}>
                    <h3 className="dr-thought-label">
                      <EditorialTitle text={t(f.labelKey)} />
                    </h3>
                    <p className="dr-thought-text">{showAiText(reflectionResult[f.key] ?? '')}</p>
                    {i === fragments.length - 1 && reflectionResult.summary && reflectionResult.summary.trim() !== '' && (
                      <p className="dr-thought-summary">
                        <span className="dr-thought-summary-label">{t('reflection.inShort')}</span> {showAiText(reflectionResult.summary)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {stage >= lastStage && activeLenses.length > 0 && (
            <div className="dr-lenses-wrap">
              <button type="button" className="dr-lenses-toggle" data-cursor-hover onClick={() => setLensesVisible((v) => !v)}>
                {lensesVisible ? t('reflection.hideOtherLenses') : t('reflection.seeOtherLenses')}
              </button>
              {lensesVisible && (
                <div className="dr-lenses">
                  {activeLenses.map(([key, text]) => (
                    <p className="dr-lens" key={key}>
                      <span className="dr-lens-label">{t(LENS_LABEL_KEYS[key])}</span>
                      {key === 'jungian' && (
                        <button
                          type="button"
                          className="dr-lens-info"
                          data-cursor-hover
                          aria-expanded={lensInfoOpen}
                          aria-controls="dr-lens-info-text"
                          aria-label={t('reflection.jungianInfoAria')}
                          onClick={() => setLensInfoOpen((v) => !v)}
                        >
                          i
                        </button>
                      )}
                      {key === 'jungian' && lensInfoOpen && (
                        <span id="dr-lens-info-text" className="dr-lens-info-text" role="note">
                          {t('reflection.jungianInfo')}
                        </span>
                      )}{' '}
                      {showAiText(text as string)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {stage >= lastStage && <p className="dr-grounding">{reflectionResult.groundingStatement}</p>}

          {stage >= lastStage && (
            <div ref={continueWrapRef} className={`dr-continue-wrap${continueVisible ? ' is-visible' : ''}`}>
              <button type="button" className="dr-choice dr-choice--yes" data-cursor-hover onClick={onContinue}>
                {t('reflection.continue')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
