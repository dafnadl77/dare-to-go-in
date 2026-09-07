import { useLanguage, type Language } from './LanguageContext';
import './LanguageSwitcher.css';

const OPTIONS: Language[] = ['en', 'he'];

/** "EN | עברית" — mounted once at the app root (see App.tsx) so it's
    reachable at any time regardless of which screen is showing, fixed to
    the same top-right corner in both languages (deliberately NOT mirrored
    to top-left in RTL — a persistent utility control is easier to find
    again when it never moves) opposite the "DARE" home button's top-left
    corner, so neither ever competes with the other or with centered hero
    content. */
export default function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="language-switcher" dir="ltr" role="group" aria-label={t('languageSwitcher.ariaLabel')}>
      {OPTIONS.map((option, i) => (
        <span className="ls-item" key={option}>
          {i > 0 && (
            <span className="ls-divider" aria-hidden="true">
              |
            </span>
          )}
          <button
            type="button"
            className={`ls-option${option === 'he' ? ' ls-option--he' : ''}${language === option ? ' is-active' : ''}`}
            data-cursor-hover
            aria-pressed={language === option}
            onClick={() => setLanguage(option)}
          >
            {t(`languageSwitcher.${option}`)}
          </button>
        </span>
      ))}
    </div>
  );
}
