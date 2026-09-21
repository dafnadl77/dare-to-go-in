import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import DreamStageBackground from '../hero/DreamStageBackground';
import {
  getArchiveEntries,
  getLastArchiveScrollTop,
  getRecurringInsights,
  setLastArchiveScrollTop,
  type ArchiveEntry,
  type RecurringMotif,
} from './archiveData';
import { getDreamsRemote, toggleFavoriteRemote } from '../hero/dreamRemoteStorage';
import type { SavedDream } from '../hero/dreamStorage';
import { containsHebrew } from '../hero/appLanguage';
import { translateTexts } from './dreamTranslationEngine';
import { useTranslatedCards } from './dreamTitleTranslation';
import DreamTimeline from './DreamTimeline';
import LocalDreamImportPrompt from './LocalDreamImportPrompt';
import { conceptLabel } from '../hero/conceptTaxonomy';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../auth/AuthContext';
import AppFooter from '../legal/AppFooter';
import type { LegalKey } from '../legal/legalContent';
import Breadcrumb from '../ui/Breadcrumb';
import EditorialTitle from '../ui/EditorialTitle';
import './DreamArchive.css';

type ArchiveSection = 'all' | 'favorites' | 'insights' | 'settings';

/** Whether a recurring-motif label's own script doesn't match what's
    natural for the given UI language — the exact trigger for the
    display-only localization pass below (see motifTranslations). A
    motif's label is always either Hebrew or Latin script (see
    normalizeMotifCandidate in archiveData.ts), so this is symmetric:
    Hebrew text under an English UI, or non-Hebrew (Latin) text under a
    Hebrew UI. */
function motifLabelNeedsLocalization(label: string, language: 'en' | 'he'): boolean {
  const hasHebrew = containsHebrew(label);
  return language === 'he' ? !hasHebrew : hasHebrew;
}

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
  // The dreamer's own real saved dreams — always from Supabase here (this
  // screen only ever renders for a signed-in user, see App.tsx's own auth
  // guard), never localStorage directly. LocalDreamImportPrompt below is
  // the one explicit, opt-in path that moves a pre-Supabase browser's
  // local dreams into this list; handleToggleFavorite updates it directly
  // (optimistic, reverted on failure) rather than re-fetching everything.
  const [dreams, setDreams] = useState<SavedDream[]>([]);
  useEffect(() => {
    if (!user) {
      setDreams([]);
      return;
    }
    let cancelled = false;
    getDreamsRemote(user.id)
      .then((remote) => {
        if (!cancelled) setDreams(remote);
      })
      .catch((err) => {
        console.error('Failed to load dreams from Supabase:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleImported = (imported: SavedDream[]) => {
    setDreams((prev) => {
      const existingIds = new Set(prev.map((d) => d.id));
      return [...prev, ...imported.filter((d) => !existingIds.has(d.id))];
    });
  };

  // Set only while viewing one recurring motif's own filtered dream list
  // (reached by clicking it in the Insights overview) — null shows the
  // overview list instead. Reset any time Insights itself is (re)entered
  // or left, so a stale filtered view never lingers behind the sidenav.
  const [openMotif, setOpenMotif] = useState<RecurringMotif | null>(null);

  const goToSection = (section: ArchiveSection) => {
    setActiveSection(section);
    setOpenMotif(null);
  };

  // Re-derived on every language change (not just on mount) — mock/sample
  // titles, excerpts and keywords must follow the CURRENT interface
  // language even if the dreamer switches it mid-visit; see
  // archiveData.ts's own language-aware entry builders.
  const baseEntries = useMemo(() => getArchiveEntries(dreams, language), [dreams, language]);
  // Card text (title, excerpt, keywords) saved in the other language shows its
  // translation instead of a generic fallback: shared with DreamDetail's title,
  // cached, and fetched in one batched request per visit.
  const translatedCards = useTranslatedCards(baseEntries, language);
  const entries = useMemo(
    () => baseEntries.map((e) => (e.kind === 'real' && translatedCards[e.id] ? { ...e, ...translatedCards[e.id] } : e)),
    [baseEntries, translatedCards],
  );
  const visibleEntries = useMemo(
    () => (activeSection === 'favorites' ? entries.filter((e) => e.kind === 'real' && e.favorite) : entries),
    [entries, activeSection],
  );
  // One coherent list: the literal recurring motifs plus semantic concepts (see
  // getRecurringInsights) — both open the same way, into the dreams they came from.
  const recurringMotifs = useMemo(() => getRecurringInsights(entries), [entries]);
  // Re-matched against the LIVE entries list (not the possibly-stale
  // `openMotif.dreams` snapshot from when it was opened) by id, exactly
  // like DreamTimeline's own dream cards — so a language switch mid-view
  // still shows correctly re-localized titles, and a dream that genuinely
  // no longer exists simply drops out rather than crashing anything (see
  // the empty state below).
  const motifDreamIds = useMemo(() => new Set((openMotif?.dreams ?? []).map((d) => d.id)), [openMotif]);
  const motifEntries = useMemo(
    () => (openMotif ? entries.filter((e) => e.kind === 'real' && motifDreamIds.has(e.id)) : []),
    [entries, openMotif, motifDreamIds],
  );

  // DISPLAY-ONLY localization for motif labels — never touches
  // getRecurringMotifs' own matching/counting (that stays keyed on the
  // ORIGINAL normalized motif regardless of language, see archiveData.ts).
  // A Hebrew-only motif under an English UI (or the reverse) is looked up
  // here and, if a translation is cached, shown translated; otherwise the
  // ORIGINAL label renders as-is — this only ever ADDS a nicer label, it
  // never hides a recurring motif the way an earlier version did. Keyed
  // by `${language}:${motif.key}` so a translation is fetched once per
  // language and reused across every render/re-open of that motif.
  const [motifTranslations, setMotifTranslations] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!recurringMotifs) return;
    const pending = recurringMotifs.filter(
      (m) => !m.conceptId && motifLabelNeedsLocalization(m.label, language) && !(`${language}:${m.key}` in motifTranslations),
    );
    if (pending.length === 0) return;
    let cancelled = false;
    translateTexts(pending.map((m) => m.label)).then((result) => {
      if (cancelled || result.status !== 'ok') return;
      setMotifTranslations((prev) => {
        const next = { ...prev };
        pending.forEach((m, i) => {
          next[`${language}:${m.key}`] = result.translations[i];
        });
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurringMotifs, language]);

  /** The label to actually render for one motif — the cached translation
      when this motif's own script didn't match the current UI language
      and translation succeeded, otherwise the original stored label
      (translation still pending, failed, or simply not needed). Never
      returns anything other than a real label — an Insight is never
      hidden for language reasons (see the effect above). */
  const motifDisplayLabel = (m: RecurringMotif): string =>
    m.conceptId ? conceptLabel(m.conceptId, language) : (motifTranslations[`${language}:${m.key}`] ?? m.label);

  const handleToggleFavorite = (id: string) => {
    if (!user) return;
    const current = dreams.find((d) => d.id === id);
    if (!current) return;
    const next = current.favorite !== true;
    // Optimistic — instant toggle, matching how this already felt when
    // toggleFavorite() wrote straight to localStorage synchronously.
    setDreams((prev) => prev.map((d) => (d.id === id ? { ...d, favorite: next } : d)));
    toggleFavoriteRemote(id, user.id, next).catch((err) => {
      console.error('Failed to update favorite in Supabase:', err);
      setDreams((prev) => prev.map((d) => (d.id === id ? { ...d, favorite: !next } : d)));
    });
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
          {/* The brand mark is never translated and must always keep the
              logo's word-flow treatment, even under a Hebrew UI — unlike
              every other heading, so this can't go through the
              language-gated EditorialTitle (src/ui/EditorialTitle.tsx),
              which intentionally falls back to plain text for non-English.
              Applies the same shared .editorial-word-flow/.editorial-word
              classes (src/index.css) directly, since the text itself is a
              static literal, not translatable content. The approved D
              favicon (public/apple-touch-icon.png — not regenerated, not
              altered) sits before the wordmark in DOM order, which combined
              with this button's own dir="ltr" keeps it visually first in
              both languages. */}
          <img className="ar-brand-icon" src="/apple-touch-icon.png" alt="" aria-hidden="true" />
          <span className="editorial-word-flow">
            {['DARE', 'TO', 'GO', 'IN'].map((word) => (
              <span className="editorial-word" key={word}>
                {word}
              </span>
            ))}
          </span>
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

      {user && (
        <div className="ar-import-banner-row">
          <LocalDreamImportPrompt userId={user.id} onImported={handleImported} />
        </div>
      )}

      <div className="ar-shell-body">
        <nav className="ar-sidenav" aria-label={t('archive.dreamArchiveNav')}>
          <button
            type="button"
            className={`ar-nav-item${activeSection === 'all' ? ' ar-nav-item--active' : ''}`}
            aria-current={activeSection === 'all' ? 'page' : undefined}
            onClick={() => goToSection('all')}
          >
            {t('archive.navAllDreams')}
          </button>
          <button
            type="button"
            className={`ar-nav-item${activeSection === 'favorites' ? ' ar-nav-item--active' : ''}`}
            aria-current={activeSection === 'favorites' ? 'page' : undefined}
            onClick={() => goToSection('favorites')}
          >
            {t('archive.navFavorites')}
          </button>
          <button
            type="button"
            className={`ar-nav-item${activeSection === 'insights' ? ' ar-nav-item--active' : ''}`}
            aria-current={activeSection === 'insights' ? 'page' : undefined}
            onClick={() => goToSection('insights')}
          >
            {t('archive.navInsights')}
          </button>
          <button
            type="button"
            className={`ar-nav-item${activeSection === 'settings' ? ' ar-nav-item--active' : ''}`}
            aria-current={activeSection === 'settings' ? 'page' : undefined}
            onClick={() => goToSection('settings')}
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
                : activeSection === 'insights' && openMotif
                  ? [
                      { label: t('archive.pageHeading'), onClick: () => goToSection('all') },
                      { label: t('archive.navInsights'), onClick: () => setOpenMotif(null) },
                      { label: motifDisplayLabel(openMotif) },
                    ]
                  : [
                      { label: t('archive.pageHeading'), onClick: () => goToSection('all') },
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
                  <h1 className="ar-title">
                    <EditorialTitle text={activeSection === 'favorites' ? t('archive.navFavorites') : t('archive.pageHeading')} />
                  </h1>
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

              {visibleEntries.length === 0 ? (
                <div className="ar-empty-state">
                  <p className="ar-empty-title">
                    {activeSection === 'favorites' ? t('archive.emptyFavoritesTitle') : t('archive.emptyAllDreamsTitle')}
                  </p>
                  <p className="ar-empty-body">
                    {activeSection === 'favorites' ? t('archive.emptyFavoritesBody') : t('archive.emptyAllDreamsBody')}
                  </p>
                </div>
              ) : (
                <DreamTimeline entries={visibleEntries} onOpenEntry={handleOpenEntry} onToggleFavorite={handleToggleFavorite} />
              )}
            </>
          )}

          {activeSection === 'insights' && openMotif && (
            <div className="ar-panel">
              {/* An explicit action, not just the breadcrumb — a filtered
                  list reached by clicking into a motif needs its own
                  visible way back next to the heading, not only a crumb
                  three levels up. */}
              <button type="button" className="ar-back-link btn btn-secondary" data-cursor-hover onClick={() => setOpenMotif(null)}>
                {t('archive.insightsBackToOverview')}
              </button>
              <h1 className="ar-title">
                {/* motifDisplayLabel can fall back to the motif's original
                    (possibly Hebrew) label while its translation is still
                    pending, even with language === 'en' — the containsHebrew
                    guard (already used the same way in DreamDetail.tsx) keeps
                    that untranslated Hebrew text on its own plain rendering
                    instead of incorrectly getting the Latin word-flow/Fraunces
                    treatment; this only changes the wrapper choice, never the
                    translation logic itself. */}
                {containsHebrew(motifDisplayLabel(openMotif)) ? (
                  motifDisplayLabel(openMotif)
                ) : (
                  <EditorialTitle text={motifDisplayLabel(openMotif)} />
                )}
              </h1>
              <p className="ar-subtitle">
                {t('archive.insightsAppearsInDreams').replace('{count}', String(openMotif.count))}
              </p>
              {motifEntries.length === 0 ? (
                <div className="ar-empty-state">
                  <p className="ar-empty-title">{t('archive.insightsMotifGoneTitle')}</p>
                  <p className="ar-empty-body">{t('archive.insightsMotifGoneBody')}</p>
                  <button type="button" className="btn btn-secondary" data-cursor-hover onClick={() => setOpenMotif(null)}>
                    {t('archive.insightsBackToOverview')}
                  </button>
                </div>
              ) : (
                <DreamTimeline entries={motifEntries} onOpenEntry={handleOpenEntry} onToggleFavorite={handleToggleFavorite} />
              )}
            </div>
          )}

          {activeSection === 'insights' && !openMotif && (
            <div className="ar-panel">
              <h1 className="ar-title">
                <EditorialTitle text={t('archive.navInsights')} />
              </h1>
              <p className="ar-subtitle">{t('archive.insightsSubtitle')}</p>
              {recurringMotifs === null ? (
                <p className="ar-panel-note">{t('archive.insightsNotEnough')}</p>
              ) : recurringMotifs.length === 0 ? (
                <p className="ar-panel-note">{t('archive.insightsEmpty')}</p>
              ) : (
                <ul className="ar-insights-list">
                  {recurringMotifs.map((m) => {
                    const label = motifDisplayLabel(m);
                    return (
                      <li key={m.key} className="ar-insights-item">
                        <button
                          type="button"
                          className="ar-insights-button"
                          data-cursor-hover
                          onClick={() => setOpenMotif(m)}
                          aria-label={`${t('archive.insightsOpenAria')} ${label}`}
                        >
                          <span className="ar-insights-row">
                            <span className="ar-insights-word">{label}</span>
                            <span className="ar-insights-count">
                              {t('archive.insightsAppearsInDreams').replace('{count}', String(m.count))}
                            </span>
                          </span>
                          {m.dreams.length > 0 && (
                            <span className="ar-insights-dreams">{m.dreams.map((d) => d.title).join(' · ')}</span>
                          )}
                          <span className="ar-insights-chevron" aria-hidden="true">
                            ›
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {activeSection === 'settings' && (
            <div className="ar-panel">
              <h1 className="ar-title">
                <EditorialTitle text={t('archive.navSettings')} />
              </h1>
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
