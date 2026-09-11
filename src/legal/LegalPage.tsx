import { useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { getLegalDocument, type LegalKey } from './legalContent';
import './LegalPage.css';

interface LegalPageProps {
  documentKey: LegalKey;
  onBack: () => void;
}

/**
 * Privacy Policy / Accessibility Statement / Terms of Use — one shared,
 * read-only document view (see legalContent.ts for the actual text).
 * Deliberately NOT built on the cinematic cloud/video background the rest
 * of DARE uses: dense multi-paragraph legal text needs strong, steady
 * contrast to actually read, which a moving video behind it would fight.
 * "Cinematic premium" comes through here via typography, spacing and the
 * same warm-ivory/serif language as everywhere else, not motion — a plain
 * near-black page, never a generic white corporate legal page either.
 *
 * All content is plain strings from legalContent.ts, rendered as text
 * nodes only (see the `.split('\n\n').map(...)` below) — never dangerouslySetInnerHTML,
 * so there is no HTML-injection surface here even though the content is
 * long-form.
 */
export default function LegalPage({ documentKey, onBack }: LegalPageProps) {
  const { t, language } = useLanguage();
  const doc = getLegalDocument(language, documentKey);

  // A real document view — Escape returns home, matching DreamDetail's
  // own convention for its equivalent "leave this screen" gesture.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <div className="legal-page">
      <button type="button" className="legal-back" dir="ltr" data-cursor-hover onClick={onBack} aria-label={t('archive.backToDare')}>
        DARE
      </button>

      <div className="legal-scroll">
        <article className="legal-column">
          <h1 className="legal-title">{doc.title}</h1>
          <p className="legal-updated">{doc.updated}</p>
          <p className="legal-intro">{doc.intro}</p>

          {doc.sections.map((section) => (
            <section className="legal-section" key={section.heading}>
              <h2 className="legal-heading">{section.heading}</h2>
              {section.body.split('\n\n').map((paragraph, i) => (
                <p className="legal-body" key={i}>
                  {paragraph}
                </p>
              ))}
            </section>
          ))}

          <p className="legal-draft-notice">{doc.draftNotice}</p>

          <button type="button" className="legal-return" data-cursor-hover onClick={onBack}>
            {t('archive.backToDare')}
          </button>
        </article>
      </div>
    </div>
  );
}
