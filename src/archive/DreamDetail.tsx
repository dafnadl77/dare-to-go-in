import { useEffect, useMemo, useRef, useState } from 'react';
import DreamStageBackground from '../hero/DreamStageBackground';
import { sanitizeAiTextForDisplay } from '../hero/appLanguage';
import { formatEntryDayMonth, formatEntryYear, type ArchiveEntry } from './archiveData';
import './DreamDetail.css';

interface DreamDetailProps {
  entry: ArchiveEntry;
  onBack: () => void;
}

/** One id per reveal section, in reading order — also drives the optional
    desktop progress marker (section 8 of the brief). */
type SectionId = 'dream' | 'stoodOut' | 'association' | 'thread' | 'question';
const SECTION_ORDER: SectionId[] = ['dream', 'stoodOut', 'association', 'thread', 'question'];

/** A section that fades/rises into place once scrolled near — "extremely
    restrained": opacity 0→1, translateY ~20px→0. `revealed` is decided by
    the parent (see DreamDetail's `revealedUpTo`), not by this section's
    own visibility alone: a fast scroll/Page Down can jump straight past a
    section without it ever individually intersecting, which would
    otherwise leave it permanently stuck at opacity 0 (confirmed live
    while testing this). Revealing every section up to and including
    whichever one the reader has actually reached avoids that regardless
    of scroll speed, while still reading as a gentle one-at-a-time
    reveal during normal scrolling. */
function RevealSection({
  id,
  className,
  revealed,
  children,
  onIntersect,
}: {
  id: SectionId;
  className?: string;
  revealed: boolean;
  children: React.ReactNode;
  onIntersect: (id: SectionId) => void;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onIntersect(id);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting || e.boundingClientRect.top < 0) onIntersect(id);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <section ref={ref} className={className} data-revealed={revealed ? 'true' : 'false'}>
      {children}
    </section>
  );
}

/**
 * MY DREAM ARCHIVE's dream detail view — opened by clicking a dream in the
 * timeline. No standalone "view a past saved dream" screen existed before
 * this (the app's only existing reconstruction/reflection UI —
 * DreamReconstruction/DreamReflection/DreamClosing — is built around one
 * *live* generation in progress, not replaying a stored record by id), so
 * this is a small, deliberately separate read-only view: same cloud world
 * and typography, but its own editorial layout. For a real saved dream it
 * renders that dream's own actual stored content — never invented, never
 * translated (see archiveData.ts's isDisplaySafe for why some fields fall
 * back rather than showing raw Hebrew in this English UI). A mock dream
 * has no such saved reflection, so it falls back to a placeholder note.
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

  // The furthest section the reader has reached, as an index into
  // SECTION_ORDER — every section up to and including it renders
  // revealed; it also is the active dot for the progress marker.
  const [revealedUpTo, setRevealedUpTo] = useState(-1);
  const onIntersect = useMemo(
    () => (id: SectionId) => {
      const index = SECTION_ORDER.indexOf(id);
      setRevealedUpTo((current) => Math.max(current, index));
    },
    [],
  );
  const activeSection = SECTION_ORDER[Math.max(revealedUpTo, 0)];

  const reflection = entry.kind === 'real' ? entry.savedDream.dreamReflection : null;
  // The dreamer's own original words — never run through the English-only
  // sanitizer (that guard exists only for AI-generated fields; the brief
  // is explicit that original user-entered dream data must never be
  // translated or altered for display).
  const sourceText = entry.kind === 'real' ? entry.savedDream.sourceText : null;
  const association = entry.kind === 'real' ? entry.savedDream.reflectionResponse : null;
  const stoodOut = entry.kind === 'real' ? entry.stoodOut : null;

  return (
    <div className="dream-detail">
      <DreamStageBackground ref={bgVideoRef} active />
      <div className="dd-night-tint" aria-hidden="true" />

      <button type="button" className="dd-back" onClick={onBack} aria-label="Back to MY DREAM ARCHIVE">
        <span className="dd-back-arrow" aria-hidden="true">
          ←
        </span>
        BACK TO MY DREAMS
      </button>

      {/* The entrance blur/opacity animation lives here, deliberately NOT
          on .dream-detail itself — .dream-detail is the ancestor of the
          fixed cloud background and the fixed back button, and per spec
          any non-`none` `filter` value (even the fully-settled end state
          of an animated one — see DreamDetail.css) makes an element a new
          containing block for its `position:fixed` descendants. That
          trapped the background against THIS element's own scrolling box
          instead of the true viewport, so scrolling revealed plain black
          page background underneath once the video scrolled out of view
          with it — the reported "sudden black section". Moving the
          animation to a sibling of the background/back-button fixes it
          without giving up the entrance effect. */}
      <div className="dd-scene">
        <div className="dd-hero">
          <span className="dd-image-wrap">
            <span className="dd-image-glow" style={{ backgroundImage: `url(${entry.image})` }} aria-hidden="true" />
            <img className="dd-image" src={entry.image} alt={entry.title} />
          </span>
          <p className="dd-date">
            {formatEntryDayMonth(entry.date)} {formatEntryYear(entry.date)}
          </p>
          <h1 className="dd-title">{entry.title}</h1>
          {entry.keywords.length > 0 && <p className="dd-keywords">{entry.keywords.join(' · ')}</p>}
        </div>

        {reflection ? (
          <div className="dd-narrative">
            {sourceText && (
              <RevealSection
                id="dream"
                className="dd-block dd-block--dream"
                revealed={revealedUpTo >= SECTION_ORDER.indexOf('dream')}
                onIntersect={onIntersect}
              >
                <p className="dd-eyebrow">The Dream</p>
                <p className="dd-body dd-body--source">{sourceText}</p>
              </RevealSection>
            )}

            {stoodOut && (
              <RevealSection
                id="stoodOut"
                className="dd-block dd-block--stood-out"
                revealed={revealedUpTo >= SECTION_ORDER.indexOf('stoodOut')}
                onIntersect={onIntersect}
              >
                <p className="dd-eyebrow">What Stood Out</p>
                <p className="dd-body">{sanitizeAiTextForDisplay(stoodOut)}</p>
              </RevealSection>
            )}

            <RevealSection
              id="association"
              className="dd-block dd-block--association"
              revealed={revealedUpTo >= SECTION_ORDER.indexOf('association')}
              onIntersect={onIntersect}
            >
              <p className="dd-eyebrow">Your Association</p>
              <p className="dd-body dd-body--personal">{association || sanitizeAiTextForDisplay(reflection.personalAssociation)}</p>
            </RevealSection>

            <RevealSection
              id="thread"
              className="dd-block dd-block--thread"
              revealed={revealedUpTo >= SECTION_ORDER.indexOf('thread')}
              onIntersect={onIntersect}
            >
              <p className="dd-eyebrow">A Possible Thread</p>
              <p className="dd-body dd-body--thread">{sanitizeAiTextForDisplay(reflection.possibleThread)}</p>
            </RevealSection>

            <RevealSection
              id="question"
              className="dd-block dd-block--question"
              revealed={revealedUpTo >= SECTION_ORDER.indexOf('question')}
              onIntersect={onIntersect}
            >
              <p className="dd-eyebrow">A Question Worth Sitting With</p>
              <p className="dd-body dd-body--question">{sanitizeAiTextForDisplay(reflection.continuityQuestion)}</p>
            </RevealSection>

            <p className="dd-disclaimer">This is a reflection, not a diagnosis or a definitive interpretation.</p>
          </div>
        ) : (
          <p className="dd-mock-note">The full dream memory is coming soon.</p>
        )}
      </div>

      {reflection && (
        <nav className="dd-progress" aria-hidden="true">
          {SECTION_ORDER.map((id) => (
            <span key={id} className="dd-progress-dot" data-active={activeSection === id ? 'true' : 'false'} />
          ))}
        </nav>
      )}
    </div>
  );
}
