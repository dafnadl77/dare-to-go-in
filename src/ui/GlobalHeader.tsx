import { useLanguage } from '../i18n/LanguageContext';
import LanguageSwitcher from '../i18n/LanguageSwitcher';
import './GlobalHeader.css';

/** Which of the three nav links (if any) represents the screen currently
    showing — drives the subtle "you are here" treatment (.gh-link--active),
    never a bright conventional tab. */
export type GlobalNavKey = 'myDreams' | 'packages' | 'about' | null;

/** The icon+"DARE TO GO IN" wordmark — always navigates Home. Replaces six
    previous independent hand-rolled copies of this exact markup
    (.crumb-home, .auth-back, .ar-brand, .dare-home-lockup, .legal-back,
    plus this file's own former .top-right-nav — see this task's own
    header-consolidation audit). Never translated — the brand mark is
    always literally English in both languages, per translations.ts's own
    top-comment rule. */
function BrandMark({ onHome }: { onHome: () => void }) {
  const { t } = useLanguage();
  return (
    <button type="button" className="gh-brand" dir="ltr" data-cursor-hover onClick={onHome} aria-label={t('archive.backToDare')}>
      <img className="gh-brand-icon" src="/apple-touch-icon.png" alt="" aria-hidden="true" />
      <span className="editorial-word-flow">
        {['DARE', 'TO', 'GO', 'IN'].map((word) => (
          <span className="editorial-word" key={word}>
            {word}
          </span>
        ))}
      </span>
    </button>
  );
}

interface GlobalNavLinksProps {
  active: GlobalNavKey;
  onMyDreams: () => void;
  onPackages: () => void;
  onAbout: () => void;
}

/** MY DREAMS / PACKAGES / ABOUT + the language switcher. */
function GlobalNavLinks({ active, onMyDreams, onPackages, onAbout }: GlobalNavLinksProps) {
  const { t, language } = useLanguage();
  return (
    // Explicit dir, not inherited: GlobalHeader's own dir="ltr" (see its
    // own comment) only fixes which SIDE this whole cluster lands on —
    // this restores the internal item order (My Dreams/Packages/About/
    // language) mirroring under Hebrew exactly like the original
    // .top-right-nav always did.
    <nav className="gh-nav" dir={language === 'he' ? 'rtl' : 'ltr'}>
      <button
        type="button"
        className={`gh-link${active === 'myDreams' ? ' gh-link--active' : ''}`}
        aria-current={active === 'myDreams' ? 'page' : undefined}
        data-cursor-hover
        onClick={onMyDreams}
      >
        {t('hero.myDreamsNav')}
      </button>
      <span className="gh-divider" aria-hidden="true">
        |
      </span>
      <button
        type="button"
        className={`gh-link${active === 'packages' ? ' gh-link--active' : ''}`}
        aria-current={active === 'packages' ? 'page' : undefined}
        data-cursor-hover
        onClick={onPackages}
      >
        {t('hero.packagesNav')}
      </button>
      <span className="gh-divider" aria-hidden="true">
        |
      </span>
      <button
        type="button"
        className={`gh-link${active === 'about' ? ' gh-link--active' : ''}`}
        aria-current={active === 'about' ? 'page' : undefined}
        data-cursor-hover
        onClick={onAbout}
      >
        {t('hero.aboutNav')}
      </button>
      <span className="gh-divider" aria-hidden="true">
        |
      </span>
      <LanguageSwitcher />
    </nav>
  );
}

interface GlobalHeaderProps {
  /** Always navigates Home. On the Hero screen (view === 'dream') App.tsx
      wires this to the journey's OWN handleGoHome (via HeroDream.tsx's
      onRegisterHomeHandler) instead of a plain setView('dream') no-op,
      since view never changes away from 'dream' during the whole
      recording/reconstruction/reflection/closing journey — those are
      internal sub-phases of that one screen, not separate views. This is
      the ONE place context-aware wiring happens; the header itself is
      rendered identically on every screen. */
  onHome: () => void;
  onMyDreams: () => void;
  onPackages: () => void;
  onAbout: () => void;
  active?: GlobalNavKey;
}

/**
 * ONE shared, fixed-position global header — mounted on EVERY screen, no
 * exceptions, no per-screen visual variants (see App.tsx: it's rendered
 * once, unconditionally, as a sibling of whichever screen is current).
 * Brand on the start side, MY DREAMS / PACKAGES / ABOUT / language on the
 * end side, both children of a single flex row (`justify-content:
 * space-between`) so they are GUARANTEED to sit on the same horizontal
 * line by construction, not by independently matching two elements' `top`
 * values (which is exactly how the previous per-page implementations
 * drifted out of alignment — see this task's own audit). No background/
 * border/shadow — purely a positioning mechanism, so it never reads as a
 * conventional SaaS navbar; `pointer-events: none` on the row itself
 * (re-enabled on its two content groups) keeps the invisible full-width
 * strip from blocking clicks on whatever page content sits underneath it.
 *
 * A screen with its own page-specific control in the same corner (Dream
 * Detail's "back to archive"; Archive's own account/sign-out row) keeps
 * that control as separate, repositioned page content instead — never a
 * reason to omit part of this header. See this task's own final report
 * for exactly how each screen's own control was adapted.
 */
export default function GlobalHeader({ onHome, onMyDreams, onPackages, onAbout, active = null }: GlobalHeaderProps) {
  return (
    // dir="ltr" on the row itself — every previous per-page brand/nav
    // implementation was physically pinned (brand top-start via `left:`,
    // nav+language top-end via `right:`), never mirrored under Hebrew (see
    // LanguageSwitcher's own comment: "easier to find again when it never
    // moves"). This is now ONE flex row instead of two independent fixed
    // elements, so without an explicit dir it would inherit the page's
    // RTL direction and reverse which side each group lands on — brand
    // and nav swapping corners under Hebrew, breaking that established
    // convention. Hebrew nav labels still render correctly regardless
    // (Hebrew is inherently RTL at the character level; this only fixes
    // the CONTAINER's own left/right placement).
    <div className="global-header" dir="ltr">
      <div className="gh-left">
        <BrandMark onHome={onHome} />
      </div>
      <GlobalNavLinks active={active} onMyDreams={onMyDreams} onPackages={onPackages} onAbout={onAbout} />
    </div>
  );
}
