import { useLanguage } from '../i18n/LanguageContext';
import type { LegalKey } from './legalContent';
import './AppFooter.css';

interface AppFooterProps {
  onNavigate: (key: LegalKey) => void;
  /** true on the fixed, non-scrolling screens (Hero, DreamAuth) where this
      pins to the bottom of the viewport with its own absolute position;
      false on scrollable pages (DreamArchive, DreamDetail) where it's
      simply the last thing in the page's own flow, like an ordinary page
      footer — never fixed there, so it can never float over content or
      the last archive entry while scrolling. */
  pinned?: boolean;
}

/**
 * The legal/credit line every real screen ends with — three quiet text
 * links (never button-shaped CTAs) plus the designer credit underneath.
 * One shared component so this never gets re-typed per screen (see
 * HeroDream.tsx, DreamAuth.tsx, DreamArchive.tsx, DreamDetail.tsx for the
 * four places this mounts) — deliberately excluded from any screen mid
 * recording/transcription (the caller decides that, not this component).
 */
export default function AppFooter({ onNavigate, pinned }: AppFooterProps) {
  const { t } = useLanguage();

  return (
    <footer className={`app-footer${pinned ? ' app-footer--pinned' : ''}`}>
      <nav className="footer-links" aria-label={t('footer.legalNavAriaLabel')}>
        <button type="button" className="footer-link" data-cursor-hover onClick={() => onNavigate('privacy')}>
          {t('footer.privacyPolicy')}
        </button>
        <span className="footer-dot" aria-hidden="true">
          ·
        </span>
        <button type="button" className="footer-link" data-cursor-hover onClick={() => onNavigate('accessibility')}>
          {t('footer.accessibilityStatement')}
        </button>
        <span className="footer-dot" aria-hidden="true">
          ·
        </span>
        <button type="button" className="footer-link" data-cursor-hover onClick={() => onNavigate('terms')}>
          {t('footer.termsOfUse')}
        </button>
      </nav>
      <p className="footer-credit">
        {t('footer.designedDevelopedPrefix')}{' '}
        <a
          className="footer-credit-link"
          href="https://dafnadl.co.il/"
          target="_blank"
          rel="noopener noreferrer"
          data-cursor-hover
        >
          {t('footer.dafnaName')}
        </a>
      </p>
    </footer>
  );
}
