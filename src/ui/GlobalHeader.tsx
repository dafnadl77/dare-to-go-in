import { useLanguage } from '../i18n/LanguageContext';
import LanguageSwitcher from '../i18n/LanguageSwitcher';
import './GlobalHeader.css';

/** Which of the three nav links (if any) represents the screen currently
    showing — drives the subtle "you are here" treatment (.gh-link--active),
    never a bright conventional tab. */
export type GlobalNavKey = 'myDreams' | 'packages' | 'about' | null;

interface BrandMarkProps {
  onHome: () => void;
  /** Every call site supplies its own class, deliberately no default — the
      SAME icon+wordmark markup/behavior renders at two different tuned
      sizes: the small fixed-corner treatment (.gh-brand, used by
      GlobalHeader itself) and DreamArchive's own larger in-flow header
      brand (.ar-brand, unchanged CSS, just no longer hand-typed JSX). */
  className: string;
  iconClassName: string;
}

/** The icon+"DARE TO GO IN" wordmark button — always navigates Home (the
    Hero/'dream' view), matching what every one of the six previous
    hand-rolled copies of this exact markup already did (see this task's
    own header-consolidation audit). Never translated — the brand mark is
    always literally English in both languages, per translations.ts's own
    top-comment rule. */
export function BrandMark({ onHome, className, iconClassName }: BrandMarkProps) {
  const { t } = useLanguage();
  return (
    <button type="button" className={className} dir="ltr" data-cursor-hover onClick={onHome} aria-label={t('archive.backToDare')}>
      <img className={iconClassName} src="/apple-touch-icon.png" alt="" aria-hidden="true" />
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

/** MY DREAMS / PACKAGES / ABOUT + the language switcher — the standard
    DARE global nav content (see this task's own spec), unpositioned so it
    can be mounted either inside GlobalHeader's fixed corner (every screen
    except Archive) or directly inside DreamArchive's own in-flow sticky
    header (see DreamArchive.tsx — it needs the exact same links/labels/
    active-state logic, just without a second competing fixed element). */
export function GlobalNavLinks({ active, onMyDreams, onPackages, onAbout }: GlobalNavLinksProps) {
  const { t, language } = useLanguage();
  return (
    // Explicit dir, not inherited: when mounted inside GlobalHeader (whose
    // own dir="ltr" only fixes which SIDE this whole cluster lands on —
    // see GlobalHeader's own comment), this restores the internal item
    // order (My Dreams/Packages/About/language) mirroring under Hebrew
    // exactly like the original .top-right-nav always did — only the
    // outer brand-vs-nav placement was the thing that needed to stop
    // mirroring, not this cluster's own internal order.
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
  onHome: () => void;
  onMyDreams: () => void;
  onPackages: () => void;
  onAbout: () => void;
  active?: GlobalNavKey;
  /** false on the Hero screen — it already has its own persistent "you are
      home" identity (the animated MemoryTitle centerpiece) and, once the
      immersive reconstruction/reflection/closing journey begins, its own
      special "way back" (HeroDream.tsx's .dare-home) that resets internal
      journey state and releases the microphone — a generic Home button
      here can't safely replace that without touching the already-audited
      mic-lifecycle logic, so this stays false there rather than showing a
      second, redundant "go home" affordance. false on Dream Detail too,
      purely to avoid a corner collision with its own, differently-purposed
      "back to archive" control (.dd-back, same top-start corner). See this
      task's own final report for both decisions in full. */
  showBrand?: boolean;
}

/**
 * ONE shared, fixed-position global header — brand on the start side,
 * MY DREAMS / PACKAGES / ABOUT / language on the end side, both children
 * of a single flex row (`justify-content: space-between`) so they are
 * GUARANTEED to sit on the same horizontal line by construction, not by
 * independently matching two elements' `top` values (which is exactly how
 * the previous per-page implementations drifted out of alignment — see
 * this task's own audit). No background/border/shadow — purely a
 * positioning mechanism, so it never reads as a conventional SaaS navbar;
 * `pointer-events: none` on the row itself (re-enabled on its two content
 * groups) keeps the invisible full-width strip from blocking clicks on
 * whatever page content happens to sit underneath it.
 *
 * NOT used on Archive — DreamArchive.tsx already has its own real,
 * non-fixed, in-flow header (.ar-shell-header) for good reasons (see its
 * own comment: never fighting this fixed header for the same corner); it
 * mounts BrandMark/GlobalNavLinks directly instead, at App.tsx's
 * direction (see App.tsx's `usesEmbeddedHeader`).
 */
export default function GlobalHeader({ onHome, onMyDreams, onPackages, onAbout, active = null, showBrand = true }: GlobalHeaderProps) {
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
        {showBrand && <BrandMark className="gh-brand" iconClassName="gh-brand-icon" onHome={onHome} />}
      </div>
      <GlobalNavLinks active={active} onMyDreams={onMyDreams} onPackages={onPackages} onAbout={onAbout} />
    </div>
  );
}
