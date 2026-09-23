import { useEffect, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import Breadcrumb from '../ui/Breadcrumb';
import EditorialTitle from '../ui/EditorialTitle';
import AppFooter from '../legal/AppFooter';
import type { LegalKey } from '../legal/legalContent';
import { DREAM_PACKAGES, type DreamPackageDef, type PackageId } from './packages';
import './PricingPage.css';

interface PricingPageProps {
  onBack: () => void;
  /** The FIRST DREAM (free) package's CTA — this is real, already-shipped
      behavior (the existing hold-to-record Hero flow, already reachable
      with zero gating for a signed-out visitor), never a new entitlement. */
  onStartFree: () => void;
  onOpenLegal: (key: LegalKey) => void;
}

/** Maps each stable package id to its own `pricing.packages.*` translation
    block (see translations.ts) — kept as an explicit table, not a string
    transform, so a package id can never accidentally miss its copy. */
const PACKAGE_COPY_KEY: Record<PackageId, 'firstDream' | 'goDeeper' | 'explore' | 'diveIn'> = {
  first_dream: 'firstDream',
  go_deeper_3: 'goDeeper',
  explore_10: 'explore',
  dive_in_25: 'diveIn',
};

/** One real dream-scene photograph per package — cropped from the approved
    reference's own four-panel visual set, not a stock/invented substitute
    (see PricingPage.css's header comment for the asset's provenance). Pure
    presentation, so it lives here rather than in packages.ts's own,
    payment-relevant data. */
const PACKAGE_SCENE_IMAGE: Record<PackageId, string> = {
  first_dream: '/dream-assets/pricing-scene-first-dream.jpg',
  go_deeper_3: '/dream-assets/pricing-scene-go-deeper.jpg',
  explore_10: '/dream-assets/pricing-scene-explore.jpg',
  dive_in_25: '/dream-assets/pricing-scene-dive-in.jpg',
};

/** The composition role each package plays — quiet / hero / premium — drives
    layout (column width, elevation, image scale) in PricingPage.css. EXPLORE
    is the one hero package; FIRST DREAM and GO DEEPER stay visually quiet;
    DIVE IN reads as premium without competing with EXPLORE for attention. */
const PACKAGE_ROLE: Record<PackageId, 'quiet' | 'hero' | 'premium'> = {
  first_dream: 'quiet',
  go_deeper_3: 'quiet',
  explore_10: 'hero',
  dive_in_25: 'premium',
};

/** A thin, unfilled checkmark — the same line-art icon language as the
    archive's favorite heart (DreamTimeline.tsx: stroke, no fill, currentColor). */
function CheckIcon() {
  return (
    <svg className="pr-check" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface PackageCardProps {
  pkg: DreamPackageDef;
  onStartFree: () => void;
  onSelectPaid: (id: PackageId) => void;
  showComingSoon: boolean;
}

function PackageCard({ pkg, onStartFree, onSelectPaid, showComingSoon }: PackageCardProps) {
  const { t } = useLanguage();
  const copyKey = PACKAGE_COPY_KEY[pkg.id];
  const role = PACKAGE_ROLE[pkg.id];
  const scene = PACKAGE_SCENE_IMAGE[pkg.id];

  return (
    <div className={`pr-card-slot pr-card-slot--${role}`}>
      <article className={`pr-card pr-card--${role}`}>
        {pkg.featured && <span className="pr-card-badge">{t('pricing.mostPopular')}</span>}

        <div className="pr-card-scene">
          <img className="pr-card-scene-img" src={scene} alt="" aria-hidden="true" loading="lazy" />
          <div className="pr-card-scene-fade" aria-hidden="true" />
        </div>

        <div className="pr-card-body">
          <p className="pr-card-eyebrow">{t(`pricing.packages.${copyKey}.name`)}</p>

          <p className="pr-card-price-big">
            {pkg.priceIls === null ? t('pricing.freeLabel') : t('pricing.dreamsCountLabel').replace('{count}', String(pkg.dreamCount))}
          </p>
          {/* Reserves its row even when empty (the free tier) so every card's
              description starts at the same vertical position within its role group. */}
          <p className="pr-card-price-sub">{pkg.priceIls !== null ? `₪${pkg.priceIls}` : ''}</p>

          <p className="pr-card-description">{t(`pricing.packages.${copyKey}.description`)}</p>

          <ul className="pr-card-features">
            {pkg.features.map((feature) => (
              <li className="pr-card-feature" key={feature}>
                <CheckIcon />
                <span>{t(`pricing.features.${feature}`)}</span>
              </li>
            ))}
          </ul>

          <div className="pr-card-cta-wrap">
            {pkg.priceIls === null ? (
              <button type="button" className="btn btn-primary pr-card-cta" data-cursor-hover onClick={onStartFree}>
                {t('pricing.packages.firstDream.cta')}
              </button>
            ) : (
              <>
                <button type="button" className="btn btn-primary pr-card-cta" data-cursor-hover onClick={() => onSelectPaid(pkg.id)}>
                  {t(`pricing.packages.${copyKey}.cta`)}
                </button>
                {showComingSoon && (
                  <p className="pr-card-note" role="status">
                    {t('pricing.comingSoonNote')}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </article>

      {/* A faint, blurred, vertically-flipped echo of the SAME scene photo
          directly beneath the card — the "reflected on water" read from the
          reference, built from the real asset rather than a fabricated one. */}
      <div className="pr-card-reflection" style={{ backgroundImage: `url(${scene})` }} aria-hidden="true" />
    </div>
  );
}

/**
 * DREAM PACKAGES — the pricing/packages page. Public, unauthenticated,
 * reached from the Hero's own top-right nav (see App.tsx) — same shell
 * convention as About/Legal (fixed full-bleed root, its own scroll
 * container, the shared Breadcrumb, no second AppFooter mount elsewhere).
 *
 * Card content is entirely data-driven from packages.ts; this file only
 * renders it and owns the ONE deliberately isolated payment placeholder
 * (handleSelectPaidPackage below) — Grow/Make integration later replaces
 * just that function's body, nothing else here needs to change.
 */
export default function PricingPage({ onBack, onStartFree, onOpenLegal }: PricingPageProps) {
  const { t } = useLanguage();
  const [comingSoonFor, setComingSoonFor] = useState<PackageId | null>(null);

  useEffect(() => {
    const previousTitle = document.title;
    const descriptionTag = document.querySelector('meta[name="description"]');
    const previousDescription = descriptionTag?.getAttribute('content') ?? null;

    document.title = t('pricing.pageTitle');
    descriptionTag?.setAttribute('content', t('pricing.pageDescription'));

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

  // ISOLATED PLACEHOLDER — UI-only for this phase. Deliberately does nothing
  // beyond showing a local "coming soon" note next to the clicked card: no
  // fake checkout, no fake success, no entitlement of any kind. The package's
  // own stable `id` (packages.ts) is exactly what a later Grow/Make handler
  // would need to start a real purchase — replace this function's body only.
  const handleSelectPaidPackage = (id: PackageId) => {
    setComingSoonFor(id);
  };

  return (
    <div className="pricing-page">
      {/* The room itself — full-bleed, only lightly dimmed (unlike the first
          pass) so it reads as a real environment the cards float inside,
          not a black page with a photo hint behind it. */}
      <img className="pr-backdrop" src="/dream-assets/about-portal.jpg" alt="" aria-hidden="true" />
      <div className="pr-backdrop-veil" aria-hidden="true" />
      <div className="pr-backdrop-glow" aria-hidden="true" />

      <div className="pr-scroll">
        <div className="pr-column">
          <Breadcrumb ariaLabel={t('breadcrumb.ariaLabel')} onHome={onBack} items={[{ label: t('breadcrumb.packages') }]} />

          <div className="pr-hero">
            {/* The brand mark — never translated, always literally English
                (see translations.ts's own header comment on this rule). */}
            <p className="pr-eyebrow" dir="ltr">
              DARE TO GO IN
            </p>
            <h1 className="pr-headline">
              <EditorialTitle text={t('pricing.headline')} />
            </h1>
            <p className="pr-subtitle">{t('pricing.subtitle')}</p>
          </div>

          <div className="pr-grid">
            {DREAM_PACKAGES.map((pkg) => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                onStartFree={onStartFree}
                onSelectPaid={handleSelectPaidPackage}
                showComingSoon={comingSoonFor === pkg.id}
              />
            ))}
          </div>

          <p className="pr-reassurance">{t('about.emphasis')}</p>

          <AppFooter onNavigate={onOpenLegal} />
        </div>
      </div>
    </div>
  );
}
