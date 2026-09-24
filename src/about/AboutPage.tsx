import { useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import EditorialTitle from '../ui/EditorialTitle';
import type { LegalKey } from '../legal/legalContent';
import './AboutPage.css';

interface AboutPageProps {
  onBack: () => void;
  onOpenLegal: (key: LegalKey) => void;
}

/** Splits one translation string on its deliberate `\n` line breaks (see
    translations.ts's about.paragraphPractice/paragraphAi) into real <br />
    breaks within a single paragraph — the same "one flowing block, a few
    intentional short lines" shape as the approved reference, without
    turning each short line into its own separate paragraph element. */
function BrokenLines({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

/**
 * ABOUT DARE — a public, unauthenticated informational page. Editorial
 * split composition: the approved cinematic dream-bedroom/portal
 * photograph on one side (public/dream-assets/about-portal.jpg — cropped
 * from the approved reference to keep only the real photographed scene,
 * deliberately excluding every pixel of that reference's own baked-in
 * mockup UI: its fake nav, fake logo, fake body copy, fake icon row, and
 * fake credit line, none of which are approved product content), real
 * app copy on the other. Reuses the exact same shell LegalPage.tsx
 * already established for every other public, non-Home page (fixed
 * full-bleed root + Breadcrumb + its own closing credit/link, no second
 * AppFooter mount — see AboutPage.css's header comment) rather than
 * inventing a second page pattern.
 */
export default function AboutPage({ onBack, onOpenLegal }: AboutPageProps) {
  const { t, language } = useLanguage();

  // No existing per-page <title>/meta-description mechanism exists yet
  // (the app is a single static index.html) — this is the smallest
  // reasonable way to give this one page its own SEO metadata without
  // inventing a whole routing/head-management system for it. Restores
  // the app's own default the moment this page unmounts, so nothing
  // else is affected.
  useEffect(() => {
    const previousTitle = document.title;
    const descriptionTag = document.querySelector('meta[name="description"]');
    const previousDescription = descriptionTag?.getAttribute('content') ?? null;

    document.title = t('about.pageTitle');
    descriptionTag?.setAttribute('content', t('about.pageDescription'));

    return () => {
      document.title = previousTitle;
      if (descriptionTag && previousDescription !== null) {
        descriptionTag.setAttribute('content', previousDescription);
      }
    };
  }, [t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <div className="about-page">
      {/* Purely decorative atmosphere — every word of real content is
          real text below, so this carries no information a screen reader
          needs. */}
      <img className="about-visual" src="/dream-assets/about-portal.jpg" alt="" aria-hidden="true" />
      <div className="about-visual-fade" aria-hidden="true" />

      <div className="about-scroll">
        <div className="about-column">
          <p className="about-eyebrow">{t('about.eyebrow')}</p>
          <h1 className="about-headline">
            <EditorialTitle text={t('about.headline')} />
          </h1>
          <hr className="about-divider" />

          <p className="about-body">{t('about.paragraphIntro')}</p>
          <p className="about-body">
            <BrokenLines text={t('about.paragraphPractice')} />
          </p>
          <p className="about-body">
            <BrokenLines text={t('about.paragraphAi')} />
          </p>

          <hr className="about-divider" />
          <p className="about-emphasis">{t('about.emphasis')}</p>
          <hr className="about-divider" />

          <div className="about-footer-row">
            <button type="button" className="about-privacy-link" data-cursor-hover onClick={() => onOpenLegal('privacy')}>
              {t('about.privacyLink')}
              <span aria-hidden="true" className="about-privacy-arrow">
                {language === 'he' ? '←' : '→'}
              </span>
            </button>
            <a
              className="about-credit"
              href="https://dafnadl.co.il/"
              target="_blank"
              rel="noopener noreferrer"
              data-cursor-hover
            >
              {t('about.credit')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
