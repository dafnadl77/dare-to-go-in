import { useEffect, useRef } from 'react';
import DreamStageBackground from '../hero/DreamStageBackground';
import { sanitizeAiTextForDisplay } from '../hero/appLanguage';
import { formatEntryDayMonth, formatEntryYear, type ArchiveEntry } from './archiveData';
import './DreamDetail.css';

interface DreamDetailProps {
  entry: ArchiveEntry;
  onBack: () => void;
}

/**
 * MY DREAM ARCHIVE's dream detail view — opened by clicking a dream image
 * in the timeline. No standalone "view a past saved dream" screen existed
 * before this (the app's only existing reconstruction/reflection UI —
 * DreamReconstruction/DreamReflection/DreamClosing — is built around one
 * *live* generation in progress: streaming analysis, voice/text input,
 * corrections, a single in-memory reflection result. None of that fits
 * "reopen an already-saved dream by id" from a static localStorage
 * record, so nothing there could be mounted as-is without either
 * fabricating a fake live session or rewriting those files, both of which
 * the brief rules out). This is a new, deliberately small read-only view
 * instead — it reuses the SAME cloud background, type system and
 * `dc-fading-text`-style presentation those screens already use, and for
 * a real saved dream it renders that dream's own actual stored content
 * (never invented): the dreamer's own words, and every field of the real
 * DreamReflectionResult that was saved with it. A mock dream (see
 * mockDreams.ts) has no such saved reflection to show, so it falls back
 * to the same placeholder note the earlier portal design already used.
 */
export default function DreamDetail({ entry, onBack }: DreamDetailProps) {
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
  const sourceText = entry.kind === 'real' ? entry.savedDream.sourceText : null;
  const reflectionResponse = entry.kind === 'real' ? entry.savedDream.reflectionResponse : null;

  return (
    <div className="dream-detail">
      <DreamStageBackground ref={bgVideoRef} active />
      <div className="dd-night-tint" aria-hidden="true" />

      <button type="button" className="dd-back" data-cursor-hover onClick={onBack} aria-label="Back to MY DREAM ARCHIVE">
        MY DREAM ARCHIVE
      </button>

      <div className="dd-content">
        <span className="dd-image-wrap">
          <span className="dd-image-glow" style={{ backgroundImage: `url(${entry.image})` }} aria-hidden="true" />
          <img className="dd-image" src={entry.image} alt={entry.title} />
        </span>

        <p className="dd-date">
          {formatEntryDayMonth(entry.date)} {formatEntryYear(entry.date)}
        </p>
        <h1 className="dd-title">{entry.title}</h1>
        <p className="dd-keywords">{entry.keywords.join(' · ')}</p>

        {reflection ? (
          <div className="dd-reflection">
            {sourceText && (
              <section className="dd-section">
                <p className="dd-eyebrow">The dream</p>
                <p className="dd-body dd-body--source">{sanitizeAiTextForDisplay(sourceText)}</p>
              </section>
            )}
            <section className="dd-section">
              <p className="dd-eyebrow">Observation</p>
              <p className="dd-body">{sanitizeAiTextForDisplay(reflection.observation)}</p>
            </section>
            <section className="dd-section">
              <p className="dd-eyebrow">Your association</p>
              <p className="dd-body">{sanitizeAiTextForDisplay(reflection.personalAssociation)}</p>
            </section>
            {reflectionResponse && (
              <section className="dd-section">
                <p className="dd-eyebrow">Your response</p>
                <p className="dd-body">{sanitizeAiTextForDisplay(reflectionResponse)}</p>
              </section>
            )}
            <section className="dd-section">
              <p className="dd-eyebrow">A possible thread</p>
              <p className="dd-body dd-body--emphasis">{sanitizeAiTextForDisplay(reflection.possibleThread)}</p>
            </section>
            <section className="dd-section">
              <p className="dd-eyebrow">A question worth sitting with</p>
              <p className="dd-body dd-body--emphasis">{sanitizeAiTextForDisplay(reflection.continuityQuestion)}</p>
            </section>
            <p className="dd-grounding">{reflection.groundingStatement}</p>
          </div>
        ) : (
          <p className="dd-mock-note">The full dream memory is coming soon.</p>
        )}
      </div>
    </div>
  );
}
