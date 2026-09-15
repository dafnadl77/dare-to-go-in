import './Breadcrumb.css';

export interface BreadcrumbItem {
  /** The crumb's own label, in whichever language/script it actually is
      (an app nav label, a dream's own title, a legal document's title —
      never translated here). */
  label: string;
  /** Omit for the current/terminal page — it renders as plain text
      (aria-current="page"), never a button, matching the existing
      LegalPage breadcrumb convention this component generalizes. */
  onClick?: () => void;
}

interface BreadcrumbProps {
  /** The path AFTER the brand mark — "DARE TO GO IN" itself is always
      prepended by this component, never passed in here. */
  items: BreadcrumbItem[];
  onHome: () => void;
  ariaLabel: string;
}

/**
 * The one shared breadcrumb trail for every navigable page except Home —
 * generalizes the pattern LegalPage.tsx originated (DARE TO GO IN / ...),
 * so Archive/Insights/Favorites/Settings/Dream Detail/Auth/legal pages
 * all render the exact same markup and styling rather than each copying
 * it. The row itself always stays `dir="ltr"` (the brand name reads
 * first in every language, matching the app's existing top-right-nav/
 * language-switcher convention for persistent chrome) — each crumb's OWN
 * label still renders in its natural script direction via
 * `unicode-bidi: isolate` in Breadcrumb.css, so Hebrew segments read
 * correctly right-to-left within themselves.
 */
/** The brand name itself — never translated, always this exact string,
    always LTR (see .crumb-home's own dir="ltr" plus the RTL font
    exemption in index.css). Rendered as real word-flow spans (the same
    .editorial-word-flow/.editorial-word classes .memory-title and
    EditorialTitle use — see src/index.css) so the small header wordmark
    genuinely shares the logo's own word-spacing mechanism, not an
    approximation of it. */
const BRAND_WORDS = ['DARE', 'TO', 'GO', 'IN'];

export default function Breadcrumb({ items, onHome, ariaLabel }: BreadcrumbProps) {
  return (
    <nav className="app-breadcrumb" dir="ltr" aria-label={ariaLabel}>
      <button type="button" className="crumb-home" dir="ltr" data-cursor-hover onClick={onHome}>
        <img className="crumb-home-icon" src="/apple-touch-icon.png" alt="" aria-hidden="true" />
        <span className="editorial-word-flow crumb-home-words">
          {BRAND_WORDS.map((word) => (
            <span className="editorial-word" key={word}>
              {word}
            </span>
          ))}
        </span>
      </button>
      {items.map((item, i) => (
        <span className="crumb-segment" key={i}>
          <span className="crumb-sep" aria-hidden="true">
            /
          </span>
          {item.onClick ? (
            <button type="button" className="crumb-link" data-cursor-hover onClick={item.onClick}>
              {item.label}
            </button>
          ) : (
            <span className="crumb-current" aria-current="page">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
