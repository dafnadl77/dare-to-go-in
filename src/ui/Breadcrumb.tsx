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
export default function Breadcrumb({ items, onHome, ariaLabel }: BreadcrumbProps) {
  return (
    <nav className="app-breadcrumb" dir="ltr" aria-label={ariaLabel}>
      <button type="button" className="crumb-home" dir="ltr" data-cursor-hover onClick={onHome}>
        DARE TO GO IN
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
