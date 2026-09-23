import './Breadcrumb.css';

export interface BreadcrumbItem {
  /** The crumb's own label, in whichever language/script it actually is
      (an app nav label, a dream's own title, a legal document's title —
      never translated here). */
  label: string;
  /** Omit for the current/terminal page — it renders as plain text
      (aria-current="page"), never a button. */
  onClick?: () => void;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  ariaLabel: string;
}

/**
 * A real, multi-level page-trail — NOT a brand mark. It used to always
 * prepend its own "DARE TO GO IN" icon+wordmark segment, but that's now
 * redundant: the shared GlobalHeader (src/ui/GlobalHeader.tsx) already
 * shows the brand on every screen, so a second copy inside the page
 * content was just visual duplication. Removed here rather than only at
 * each call site, so every usage benefits at once — see the header
 * consolidation's own final report for the full audit.
 *
 * Only kept where a trail has genuine multi-level navigational value
 * (DreamArchive's section trail, DreamDetail's "My Dreams / <title>") —
 * every call site that only ever passed a single, non-clickable item (a
 * bare, redundant "current page name" label) was removed entirely
 * instead, per that same audit.
 */
export default function Breadcrumb({ items, ariaLabel }: BreadcrumbProps) {
  return (
    <nav className="app-breadcrumb" dir="ltr" aria-label={ariaLabel}>
      {items.map((item, i) => (
        <span className="crumb-segment" key={i}>
          {i > 0 && (
            <span className="crumb-sep" aria-hidden="true">
              /
            </span>
          )}
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
