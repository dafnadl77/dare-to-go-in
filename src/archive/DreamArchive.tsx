import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import DreamStageBackground from '../hero/DreamStageBackground';
import { getArchiveEntries, getLastArchiveScrollTop, setLastArchiveScrollTop, type ArchiveEntry } from './archiveData';
import DreamTimeline from './DreamTimeline';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../auth/AuthContext';
import AppFooter from '../legal/AppFooter';
import type { LegalKey } from '../legal/legalContent';
import './DreamArchive.css';

interface DreamArchiveProps {
  onBack: () => void;
  onOpenEntry: (entry: ArchiveEntry) => void;
  onOpenLegal: (key: LegalKey) => void;
}

/**
 * MY DREAM ARCHIVE — a real, structured personal area: a proper
 * responsive header (brand + account, never fighting the global language
 * switcher for the same corner — see .ar-shell-header below), a page
 * heading + subtitle + primary "New Dream" action, a left-hand section
 * nav, and the dream list itself as clean editorial cards (see
 * DreamTimeline.tsx). The cinematic cloud/star background stays; the
 * CONTENT on top of it is now structured and easy to scan, per the
 * approved personal-archive direction.
 *
 * Favorites/Insights/Settings are shown in the nav (matching that
 * direction) but are honestly disabled — no such views/data exist yet,
 * and this task is not the one that builds them; see .ar-nav-disabled.
 * All Dreams is the one real, working section: exactly what already
 * existed here before this pass.
 */
export default function DreamArchive({ onBack, onOpenEntry, onOpenLegal }: DreamArchiveProps) {
  const { t, language } = useLanguage();
  const { user, signOut } = useAuth();
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    bgVideoRef.current?.play().catch(() => {});
  }, []);

  // Re-derived on every language change (not just on mount) — mock/sample
  // titles, excerpts and keywords must follow the CURRENT interface
  // language even if the dreamer switches it mid-visit; see
  // archiveData.ts's own language-aware entry builders.
  const entries = useMemo(() => getArchiveEntries(language), [language]);

  // Restores the scroll position left behind before opening a dream's
  // detail view (see DreamDetail.tsx's "← BACK TO MY DREAMS") — behavior
  // only, no change to the list's own layout/visuals.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    el.scrollTop = getLastArchiveScrollTop();
  }, []);

  // The actual save happens HERE, synchronously in the click handler that
  // triggers navigation away — not in a scroll listener or an unmount
  // cleanup. Both were tried and both are unreliable for this: an
  // unmounting element's scrollTop reads back as 0 the moment it's
  // detached from the document (confirmed directly — a real, general
  // browser behavior, not specific to this app), which is exactly when a
  // cleanup effect fires, so it was capturing nothing useful.
  const handleOpenEntry = (entry: ArchiveEntry) => {
    if (rootRef.current) setLastArchiveScrollTop(rootRef.current.scrollTop);
    onOpenEntry(entry);
  };

  return (
    <div className="dream-archive" ref={rootRef}>
      <DreamStageBackground ref={bgVideoRef} active />
      <div className="ar-night-tint" aria-hidden="true" />
      <div className="ar-stars" aria-hidden="true">
        {Array.from({ length: 22 }).map((_, i) => (
          <span
            key={i}
            className="ar-star"
            style={
              {
                '--si': i,
                left: `${(i * 13.1 + 5) % 100}%`,
                top: `${(i * 7.7 + 3) % 92}%`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      {/* A real, non-fixed page header — brand on one side, account on the
          other, wrapping/stacking on its own at narrow widths instead of
          ever fighting App.tsx's own fixed top-right language switcher
          for the same corner. No magic-number positioning: this is a
          normal flex row in normal document flow, at the very top of the
          scrolling page, so there is nothing for it to collide with as
          the page scrolls (it isn't fixed, it simply isn't there to
          overlap anything once scrolled past). */}
      <header className="ar-shell-header">
        <button type="button" className="ar-brand" dir="ltr" data-cursor-hover onClick={onBack} aria-label={t('archive.backToDare')}>
          DARE TO GO IN
        </button>
        {user && (
          <div className="ar-account">
            {user.email && <span className="ar-account-email">{user.email}</span>}
            <button type="button" className="ar-account-signout btn btn-secondary" data-cursor-hover onClick={() => signOut()}>
              {t('auth.signOut')}
            </button>
          </div>
        )}
      </header>

      <div className="ar-shell-body">
        <nav className="ar-sidenav" aria-label={t('archive.dreamArchiveNav')}>
          <span className="ar-nav-item ar-nav-item--active" aria-current="page">
            {t('archive.navAllDreams')}
          </span>
          <span className="ar-nav-item ar-nav-item--disabled">
            {t('archive.navFavorites')}
            <span className="ar-nav-badge">{t('archive.navComingSoon')}</span>
          </span>
          <span className="ar-nav-item ar-nav-item--disabled">
            {t('archive.navInsights')}
            <span className="ar-nav-badge">{t('archive.navComingSoon')}</span>
          </span>
          <span className="ar-nav-item ar-nav-item--disabled">
            {t('archive.navSettings')}
            <span className="ar-nav-badge">{t('archive.navComingSoon')}</span>
          </span>
        </nav>

        <main className="ar-main">
          <div className="ar-hero-row">
            <div className="ar-hero-copy">
              <h1 className="ar-title">{t('archive.pageHeading')}</h1>
              <p className="ar-subtitle">{t('archive.pageSubtitle')}</p>
            </div>
            {/* A real action, not a fake one — "a new dream" starts from
                the same HOLD/TYPE capture the whole app already has, so
                this returns to the room exactly like the header's own
                brand button, just with an unmistakably primary look. */}
            <button type="button" className="ar-new-dream btn btn-primary" data-cursor-hover onClick={onBack}>
              <span className="ar-new-dream-plus" aria-hidden="true">
                +
              </span>
              {t('archive.newDream')}
            </button>
          </div>

          <DreamTimeline entries={entries} onOpenEntry={handleOpenEntry} />
        </main>
      </div>

      <AppFooter onNavigate={onOpenLegal} />
    </div>
  );
}
