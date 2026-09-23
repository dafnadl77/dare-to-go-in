import { useEffect, useState, type CSSProperties } from 'react';
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

const STAR_COUNT = 14;

/** A thin, unfilled checkmark — the same line-art icon language as the
    archive's favorite heart (DreamTimeline.tsx: stroke, no fill, currentColor). */
function CheckIcon() {
  return (
    <svg className="pr-check" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
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

  return (
    <article className={`pr-card${pkg.featured ? ' pr-card--featured' : ''}`}>
      {pkg.featured && <span className="pr-card-badge">{t('pricing.mostPopular')}</span>}

      <p className="pr-card-eyebrow">{t(`pricing.packages.${copyKey}.name`)}</p>

      <p className="pr-card-price-big">
        {pkg.priceIls === null ? t('pricing.freeLabel') : t('pricing.dreamsCountLabel').replace('{count}', String(pkg.dreamCount))}
      </p>
      {/* Reserves its row even when empty (the free tier) so every card's
          description/divider/features start at the same vertical position —
          see PricingPage.css's min-height on this class. */}
      <p className="pr-card-price-sub">{pkg.priceIls !== null ? `₪${pkg.priceIls}` : ''}</p>

      <p className="pr-card-description">{t(`pricing.packages.${copyKey}.description`)}</p>

      <hr className="pr-card-divider" />

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
    </article>
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
      {/* Purely decorative atmosphere — every word of real content is real
          text below, so this carries no information a screen reader needs. */}
      <img className="pr-backdrop" src="/dream-assets/about-portal.jpg" alt="" aria-hidden="true" />
      <div className="pr-backdrop-veil" aria-hidden="true" />
      <div className="pr-stars" aria-hidden="true">
        {Array.from({ length: STAR_COUNT }).map((_, i) => (
          <span
            key={i}
            className="pr-star"
            style={{ '--si': i, left: `${(i * 7.1 + 3) % 100}%`, top: `${(i * 11.3 + 4) % 60}%` } as CSSProperties}
          />
        ))}
      </div>

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
