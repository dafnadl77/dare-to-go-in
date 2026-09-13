import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import DreamStageBackground from '../hero/DreamStageBackground';
import {
  getArchiveEntries,
  getLastArchiveScrollTop,
  getRecurringMotifs,
  setLastArchiveScrollTop,
  type ArchiveEntry,
} from './archiveData';
import { toggleFavorite } from '../hero/dreamStorage';
import DreamTimeline from './DreamTimeline';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../auth/AuthContext';
import AppFooter from '../legal/AppFooter';
import type { LegalKey } from '../legal/legalContent';
import Breadcrumb from '../ui/Breadcrumb';
import './DreamArchive.css';

type ArchiveSection = 'all' | 'favorites' | 'insights' | 'settings';

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
 * Favorites/Insights/Settings are real, minimal sections now:
 * - Favorites: a real per-dream toggle (see DreamTimeline's favorite
 *   button), filtering to just the favorited real dreams — persisted via
 *   the existing localStorage dream storage, no schema change.
 * - Insights: real recurring-motif detection over every structured field
 *   the analysis step already extracted — people/places/objects/actions,
 *   not just the narrow keyword pool the card chips use (see
 *   getRecurringMotifs in archiveData.ts for the full field priority) —
 *   never a new AI call, never an invented theme. A motif is eligible the
 *   moment it appears in 2 SEPARATE saved dreams; there is no arbitrary
 *   "need 3+ dreams first" gate — only "fewer than 2 real dreams" is
 *   mathematically incapable of recurrence at all.
 * - Settings: the account email already known from auth, the language
 *   switcher already in the header, and sign out — nothing invented.
 */
export default function DreamArchive({ onBack, onOpenEntry, onOpenLegal }: DreamArchiveProps) {
  const { t, language, setLanguage } = useLanguage();
  const { user, signOut } = useAuth();
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    bgVideoRef.current?.play().catch(() => {});
  }, []);

  const [activeSection, setActiveSection] = useState<ArchiveSection>('all');
  // Bumped on every favorite toggle so the entries memo below re-derives —
  // toggleFavorite() writes straight to localStorage, which on its own
  // triggers no re-render.
  const [favoriteVersion, setFavoriteVersion] = useState(0);

  // Re-derived on every language change (not just on mount) — mock/sample
  // titles, excerpts and keywords must follow the CURRENT interface
  // language even if the dreamer switches it mid-visit; see
  // archiveData.ts's own language-aware entry builders.
  const entries = useMemo(() => getArchiveEntries(language), [language, favoriteVersion]);
  const visibleEntries = useMemo(
    () => (activeSection === 'favorites' ? entries.filter((e) => e.kind === 'real' && e.favorite) : entries),
    [entries, activeSection],
  );
  const recurringMotifs = useMemo(() => getRecurringMotifs(entries), [entries]);

  const handleToggleFavorite = (id: string) => {
    toggleFavorite(id);
    setFavoriteVersion((v) => v + 1);
  };

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
          <button
            type="button"
            className={`ar-nav-item${activeSection === 'all' ? ' ar-nav-item--active' : ''}`}
            aria-current={activeSection === 'all' ? 'page' : undefined}
            onClick={() => setActiveSection('all')}
          >
            {t('archive.navAllDreams')}
          </button>
          <button
            type="button"
            className={`ar-nav-item${activeSection === 'favorites' ? ' ar-nav-item--active' : ''}`}
            aria-current={activeSection === 'favorites' ? 'page' : undefined}
            onClick={() => setActiveSection('favorites')}
          >
            {t('archive.navFavorites')}
          </button>
          <button
            type="button"
            className={`ar-nav-item${activeSection === 'insights' ? ' ar-nav-item--active' : ''}`}
            aria-current={activeSection === 'insights' ? 'page' : undefined}
            onClick={() => setActiveSection('insights')}
          >
            {t('archive.navInsights')}
          </button>
          <button
            type="button"
            className={`ar-nav-item${activeSection === 'settings' ? ' ar-nav-item--active' : ''}`}
            aria-current={activeSection === 'settings' ? 'page' : undefined}
            onClick={() => setActiveSection('settings')}
          >
            {t('archive.navSettings')}
          </button>
        </nav>

        <main className="ar-main">
          <Breadcrumb
            ariaLabel={t('breadcrumb.ariaLabel')}
            onHome={onBack}
            items={
              activeSection === 'all'
                ? [{ label: t('archive.pageHeading') }]
                : [
                    { label: t('archive.pageHeading'), onClick: () => setActiveSection('all') },
                    {
                      label:
                        activeSection === 'favorites'
                          ? t('archive.navFavorites')
                          : activeSection === 'insights'
                            ? t('archive.navInsights')
                            : t('archive.navSettings'),
                    },
                  ]
            }
          />
          {(activeSection === 'all' || activeSection === 'favorites') && (
            <>
              <div className="ar-hero-row">
                <div className="ar-hero-copy">
                  <h1 className="ar-title">{activeSection === 'favorites' ? t('archive.navFavorites') : t('archive.pageHeading')}</h1>
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

              {activeSection === 'favorites' && visibleEntries.length === 0 ? (
                <div className="ar-empty-state">
                  <p className="ar-empty-title">{t('archive.emptyFavoritesTitle')}</p>
                  <p className="ar-empty-body">{t('archive.emptyFavoritesBody')}</p>
                </div>
              ) : (
                <DreamTimeline entries={visibleEntries} onOpenEntry={handleOpenEntry} onToggleFavorite={handleToggleFavorite} />
              )}
            </>
          )}

          {activeSection === 'insights' && (
            <div className="ar-panel">
              <h1 className="ar-title">{t('archive.navInsights')}</h1>
              <p className="ar-subtitle">{t('archive.insightsSubtitle')}</p>
              {recurringMotifs === null ? (
                <p className="ar-panel-note">{t('archive.insightsNotEnough')}</p>
              ) : recurringMotifs.length === 0 ? (
                <p className="ar-panel-note">{t('archive.insightsEmpty')}</p>
              ) : (
                <ul className="ar-insights-list">
                  {recurringMotifs.map((m) => (
                    <li key={m.key} className="ar-insights-item">
                      <div className="ar-insights-row">
                        <span className="ar-insights-word">{m.label}</span>
                        <span className="ar-insights-count">
                          {t('archive.insightsAppearsInDreams').replace('{count}', String(m.count))}
                        </span>
                      </div>
                      {m.dreams.length > 0 && (
                        <p className="ar-insights-dreams">{m.dreams.map((d) => d.title).join(' · ')}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {activeSection === 'settings' && (
            <div className="ar-panel">
              <h1 className="ar-title">{t('archive.navSettings')}</h1>
              <p className="ar-subtitle">{t('archive.settingsSubtitle')}</p>
              <div className="ar-settings-row">
                <span className="ar-settings-label">{t('archive.settingsEmailLabel')}</span>
                <span className="ar-settings-value">{user?.email ?? '—'}</span>
              </div>
              <div className="ar-settings-row">
                <span className="ar-settings-label">{t('archive.settingsLanguageLabel')}</span>
                <div className="ar-settings-lang-buttons">
                  <button
                    type="button"
                    className={`ar-settings-lang-btn${language === 'en' ? ' ar-settings-lang-btn--active' : ''}`}
                    onClick={() => setLanguage('en')}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    className={`ar-settings-lang-btn${language === 'he' ? ' ar-settings-lang-btn--active' : ''}`}
                    onClick={() => setLanguage('he')}
                  >
                    עברית
                  </button>
                </div>
              </div>
              <button type="button" className="ar-settings-signout btn btn-secondary" data-cursor-hover onClick={() => signOut()}>
                {t('auth.signOut')}
              </button>
            </div>
          )}
        </main>
      </div>

      <AppFooter onNavigate={onOpenLegal} />
    </div>
  );
}
