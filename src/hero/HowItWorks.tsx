import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import './HowItWorks.css';

/**
 * The short explanation of DARE and its "how it works" section.
 *
 * Two parts, both on the opening screen only (never on a journey screen):
 *   - HowItWorksTagline: one line about what DARE is, set directly under the big title (in the opening's own column, so nothing moves when it fades in);
 *   - HowItWorksTeaser: a small "How it works" control, above the footer;
 *   - HowItWorksPanel: the section itself, which rises from below the opening: a title, a short introduction, the six steps on a thin
 *     connecting line, and a way back into the journey. The opening underneath is left exactly as it is (and is inert while this is open).
 * Every step described exists in the product; nothing here promises anything the journey does not do.
 */

const STEP_ICONS: ReactNode[] = [
  // tell: a microphone
  <svg key="tell" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
  </svg>,
  // see: a picture
  <svg key="see" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M4 17l5-4.5 4 3.2 3-2.4 4.5 3.7" />
  </svg>,
  // choose a moment: a ring with a point
  <svg key="moment" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="2.2" />
  </svg>,
  // feeling: a soft wave
  <svg key="feeling" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 13c2.2-4 4.4-4 6 0s3.8 4 6 0 3.4-4 6 0" />
    <path d="M3 18c2.2-3 4.4-3 6 0s3.8 3 6 0 3.4-3 6 0" />
  </svg>,
  // meaning: a spark
  <svg key="meaning" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3.5v5M12 15.5v5M3.5 12h5M15.5 12h5" />
    <circle cx="12" cy="12" r="1.4" />
  </svg>,
  // save: an open book
  <svg key="save" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 6.5C9.8 5 7 4.8 4 5.2v12.3c3-.4 5.8-.2 8 1.3 2.2-1.5 5-1.7 8-1.3V5.2c-3-.4-5.8-.2-8 1.3zM12 6.5v12.3" />
  </svg>,
];

/** Always mounted (its place is reserved either way), faded in only on the idle opening. A short window hides it in CSS: the control stays. */
export function HowItWorksTagline({ shown }: { shown: boolean }) {
  const { t } = useLanguage();
  return (
    <p className={`hiw-tagline${shown ? ' is-shown' : ''}`} aria-hidden={!shown}>
      {t('howItWorks.tagline')}
    </p>
  );
}

export function HowItWorksTeaser({ onOpen }: { onOpen: () => void }) {
  const { t } = useLanguage();
  // Both pieces sit just above the pinned footer, whatever height it has (on a phone its links wrap onto several lines).
  const [footerHeight, setFooterHeight] = useState<number | null>(null);
  useEffect(() => {
    const footer = document.querySelector('.app-footer--pinned');
    if (!footer) return;
    // The footer's height is also published for the opening's own column, which must leave room for it when the explanation is shown (HowItWorks.css).
    const root = document.documentElement;
    const update = () => {
      const height = footer.getBoundingClientRect().height;
      setFooterHeight(height);
      root.style.setProperty('--hiw-footer-h', `${height}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(footer);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--hiw-footer-h');
    };
  }, []);
  const style = { '--hiw-bottom': footerHeight === null ? '4.4rem' : `${footerHeight}px` } as CSSProperties;
  return (
    <>
      <div className="hiw-teaser" style={style}>
        <button type="button" className="hiw-trigger" data-cursor-hover aria-haspopup="dialog" aria-label={t('howItWorks.triggerAria')} onClick={onOpen}>
          <span>{t('howItWorks.trigger')}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9.5l6 6 6-6" />
          </svg>
        </button>
      </div>
    </>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function HowItWorksPanel({ onClose }: { onClose: () => void }) {
  const { t, language } = useLanguage();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div ref={panelRef} className="hiw" role="dialog" aria-modal="true" aria-label={t('howItWorks.panelAria')} onKeyDown={onKeyDown}>
      <div className="hiw-scroll">
        <div className="hiw-inner">
          <div className="hiw-top">
            <button type="button" className="btn btn-secondary hiw-close" data-cursor-hover onClick={onClose}>
              {t('howItWorks.close')}
            </button>
          </div>
          <p className="hiw-eyebrow">{t('howItWorks.eyebrow')}</p>
          <h2 className="hiw-title" ref={titleRef} tabIndex={-1}>
            {t('howItWorks.title')}
          </h2>
          <p className="hiw-intro">{t('howItWorks.intro')}</p>

          <ol className="hiw-steps" aria-label={t('howItWorks.stepsAria')}>
            {STEP_ICONS.map((icon, i) => (
              <li className="hiw-step" key={i} style={{ '--i': i } as React.CSSProperties}>
                <span className="hiw-node" aria-hidden="true">
                  {icon}
                </span>
                <span className="hiw-step-body">
                  <span className="hiw-step-title">{t(`howItWorks.steps.${i}.title`)}</span>
                  <span className="hiw-step-text">{t(`howItWorks.steps.${i}.text`)}</span>
                </span>
              </li>
            ))}
          </ol>

          <p className="hiw-note">{t('howItWorks.note')}</p>
          <div className="hiw-actions">
            <button type="button" className="btn btn-primary" data-cursor-hover onClick={onClose}>
              {t('howItWorks.start')}
            </button>
            <a className="hiw-faq" href={language === 'he' ? '/faq/' : '/en/faq/'} data-cursor-hover>
              {t('howItWorks.faq')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
