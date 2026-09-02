import { useEffect, useRef, useState } from 'react';
import DreamStageBackground from '../hero/DreamStageBackground';
import { sanitizeAiTextForDisplay, containsHebrew } from '../hero/appLanguage';
import { formatEntryDayMonth, formatEntryYear, type ArchiveEntry } from './archiveData';
import { translateTexts } from './dreamTranslationEngine';
import './DreamDetail.css';

interface DreamDetailProps {
  entry: ArchiveEntry;
  onBack: () => void;
  /** "RETURN TO THE ROOM / HOME" — leaves the archive area entirely, back
      to the main DARE room (the same place HeroDream starts). */
  onGoHome: () => void;
}

/** THE DREAM / WHAT STOOD OUT / YOUR ASSOCIATION need a REAL translation
    when the underlying saved value is Hebrew — there is no guaranteed-
    English field anywhere else to fall back to for the dreamer's own
    original words (unlike title/keywords, which archiveData.ts already
    keeps safely English via a synchronous fallback). See
    dreamTranslationEngine.ts. `raw` is what gets sent for translation and
    is NEVER rendered directly when it contains Hebrew — only `display`
    is, which is either the original (already English), the resolved
    translation, or a plain loading/error placeholder — so raw Hebrew
    never reaches the page, even for a moment. */
type FieldKey = 'dream' | 'stoodOut' | 'association';
type TranslationState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * MY DREAM ARCHIVE's dream detail view — opened by clicking a dream in the
 * timeline. No standalone "view a past saved dream" screen existed before
 * this (the app's only existing reconstruction/reflection UI —
 * DreamReconstruction/DreamReflection/DreamClosing — is built around one
 * *live* generation in progress, not replaying a stored record by id), so
 * this is a small, deliberately separate read-only view: same cloud world
 * and typography, its own single centered editorial column. For a real
 * saved dream it renders that dream's own actual stored content — never
 * invented. This screen is English-only end to end: DreamReflectionResult
 * is already guaranteed English by its own system prompt; the dreamer's
 * own original words (sourceText, reflectionResponse, selectedElement)
 * are translated on demand via dreamTranslationEngine.ts when needed —
 * storage itself is never touched, only what's displayed here. A mock
 * dream has no such saved reflection, so it falls back to a placeholder
 * note.
 */
export default function DreamDetail({ entry, onBack, onGoHome }: DreamDetailProps) {
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    bgVideoRef.current?.play().catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  const reflection = entry.kind === 'real' ? entry.savedDream.dreamReflection : null;
  const sourceTextRaw = entry.kind === 'real' ? entry.savedDream.sourceText : null;
  const associationRaw = entry.kind === 'real' ? entry.savedDream.reflectionResponse : null;
  const selectedElementRaw = entry.kind === 'real' ? entry.savedDream.selectedElement : null;

  const [translationState, setTranslationState] = useState<TranslationState>('idle');
  const [translated, setTranslated] = useState<Partial<Record<FieldKey, string>>>({});

  useEffect(() => {
    setTranslationState('idle');
    setTranslated({});
    if (entry.kind !== 'real') return;

    const items: { key: FieldKey; text: string }[] = [];
    if (sourceTextRaw && containsHebrew(sourceTextRaw)) items.push({ key: 'dream', text: sourceTextRaw });
    if (selectedElementRaw && containsHebrew(selectedElementRaw)) items.push({ key: 'stoodOut', text: selectedElementRaw });
    if (associationRaw && containsHebrew(associationRaw)) items.push({ key: 'association', text: associationRaw });
    if (items.length === 0) return;

    let cancelled = false;
    setTranslationState('loading');
    translateTexts(items.map((i) => i.text)).then((result) => {
      if (cancelled) return;
      if (result.status === 'ok') {
        const next: Partial<Record<FieldKey, string>> = {};
        items.forEach((item, i) => {
          next[item.key] = result.translations[i];
        });
        setTranslated(next);
        setTranslationState('ready');
      } else {
        setTranslationState('error');
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id]);

  /** Resolves one field to safe, displayable English text — the ONLY
      function in this file allowed to decide what actually reaches the
      page for a field that might be Hebrew in storage. */
  function resolve(key: FieldKey, raw: string | null): string | null {
    if (!raw) return null;
    if (!containsHebrew(raw)) return sanitizeAiTextForDisplay(raw);
    if (translationState === 'ready' && translated[key]) return translated[key]!;
    if (translationState === 'error') return 'Original entry recorded in another language — translation unavailable right now.';
    return null; // loading — see the *-loading placeholder rendered below
  }

  const dreamText = sourceTextRaw ? resolve('dream', sourceTextRaw) : null;
  const stoodOutText = selectedElementRaw ? resolve('stoodOut', selectedElementRaw) : entry.kind === 'real' ? entry.stoodOut : null;
  const associationText = associationRaw
    ? resolve('association', associationRaw)
    : reflection
      ? sanitizeAiTextForDisplay(reflection.personalAssociation)
      : null;

  return (
    <div className="dream-detail">
      <DreamStageBackground ref={bgVideoRef} active />
      <div className="dd-night-tint" aria-hidden="true" />

      <button type="button" className="dd-back" onClick={onBack} aria-label="Back to MY DREAM ARCHIVE">
        <span className="dd-back-arrow" aria-hidden="true">
          ←
        </span>
        BACK TO MY DREAM ARCHIVE
      </button>

      {/* The entrance animation lives here, deliberately NOT on
          .dream-detail itself — see DreamDetail.css for why: a CSS
          animation resolving `filter: none` still interpolates to
          blur(0px) at rest, which still creates a containing block for
          position:fixed descendants (the fixed cloud background and the
          fixed back button), trapping them against this element's own
          scrolling box instead of the true viewport. Keeping the
          animation on a sibling of both fixes it structurally. */}
      <div className="dd-scene">
        <div className="dd-column">
          <div className="dd-hero">
            <span className="dd-image-wrap">
              <span className="dd-image-glow" style={{ backgroundImage: `url(${entry.image})` }} aria-hidden="true" />
              <img className="dd-image" src={entry.image} alt={entry.title} />
            </span>
            <p className="dd-date">
              {formatEntryDayMonth(entry.date)} {formatEntryYear(entry.date)}
            </p>
            <h1 className="dd-title">{entry.title}</h1>
          </div>

          {reflection ? (
            <div className="dd-narrative">
              <section className="dd-block">
                <p className="dd-eyebrow">The Dream</p>
                {dreamText ? (
                  <p className="dd-body">{dreamText}</p>
                ) : (
                  <p className="dd-body dd-body--loading">Translating…</p>
                )}
              </section>

              {(stoodOutText || (selectedElementRaw && containsHebrew(selectedElementRaw))) && (
                <section className="dd-block">
                  <p className="dd-eyebrow">What Stood Out</p>
                  {stoodOutText ? (
                    <p className="dd-body dd-body--stood-out">{stoodOutText}</p>
                  ) : (
                    <p className="dd-body dd-body--loading">Translating…</p>
                  )}
                </section>
              )}

              <section className="dd-block">
                <p className="dd-eyebrow">Your Association</p>
                {associationText ? (
                  <p className="dd-body">{associationText}</p>
                ) : (
                  <p className="dd-body dd-body--loading">Translating…</p>
                )}
              </section>

              <section className="dd-block">
                <p className="dd-eyebrow">A Possible Thread</p>
                <p className="dd-body dd-body--thread">{sanitizeAiTextForDisplay(reflection.possibleThread)}</p>
              </section>

              <section className="dd-block">
                <p className="dd-eyebrow">A Question Worth Sitting With</p>
                <p className="dd-body dd-body--question">{sanitizeAiTextForDisplay(reflection.continuityQuestion)}</p>
              </section>

              <p className="dd-disclaimer">This is a reflection, not a diagnosis or a definitive interpretation.</p>
            </div>
          ) : (
            <p className="dd-mock-note">The full dream memory is coming soon.</p>
          )}

          <nav className="dd-end-nav" aria-label="Dream detail navigation">
            <button type="button" className="dd-end-link" onClick={onBack}>
              BACK TO MY DREAM ARCHIVE
            </button>
            <span className="dd-end-divider" aria-hidden="true" />
            <button type="button" className="dd-end-link" onClick={onGoHome}>
              RETURN TO THE ROOM
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}
