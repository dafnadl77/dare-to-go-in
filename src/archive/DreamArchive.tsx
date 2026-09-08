import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import DreamStageBackground from '../hero/DreamStageBackground';
import { getArchiveEntries, getLastArchiveScrollTop, setLastArchiveScrollTop, type ArchiveEntry } from './archiveData';
import DreamTimeline from './DreamTimeline';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../auth/AuthContext';
import './DreamArchive.css';

interface DreamArchiveProps {
  onBack: () => void;
  onOpenEntry: (entry: ArchiveEntry) => void;
}

/**
 * MY DREAM ARCHIVE — the DREAM TIMELINE. A calm, editorial, vertical
 * chronology of saved dreams (see archiveData.ts): the earlier floating
 * "constellation" of cloud-masked portals has been fully removed per the
 * approved visual reference, replaced by DreamTimeline. The cloud world
 * behind it, the header, and the top nav are unchanged.
 */
export default function DreamArchive({ onBack, onOpenEntry }: DreamArchiveProps) {
  const { t } = useLanguage();
  const { user, signOut } = useAuth();
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    bgVideoRef.current?.play().catch(() => {});
  }, []);

  const entries = useMemo(() => getArchiveEntries(), []);

  // Restores the scroll position left behind before opening a dream's
  // detail view (see DreamDetail.tsx's "← BACK TO MY DREAMS") — behavior
  // only, no change to the timeline's own layout/visuals.
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

      <div className="ar-top">
        <button type="button" className="ar-back" dir="ltr" data-cursor-hover onClick={onBack} aria-label={t('archive.backToDare')}>
          DARE
        </button>
        {/* CONSTELLATIONS and a separate TIMELINE item were removed here —
            inspected first, per instruction: no Constellations view exists
            anywhere in the codebase, and DreamTimeline.tsx (the "real
            timeline view") is already exactly what MY DREAMS renders
            below, not a distinct unconnected screen. Two nav items
            pointing at byte-identical content isn't real navigation
            either, so rather than wire up a second label that goes
            nowhere new, MY DREAMS stays as the one accurate, working
            item. The (now removed) circular "D" profile button used to
            sit at the end of this same flex row — see .ar-top's
            justify-content below, changed from space-between to
            flex-start so this nav no longer stretches into the
            language switcher's fixed top-right corner (App.tsx). */}
        <nav className="ar-nav" aria-label={t('archive.dreamArchiveNav')}>
          <span className="ar-nav-item" data-active="true">
            {t('archive.myDreams')}
          </span>
        </nav>
        {/* Minimal post-auth account control — email + sign out only, no
            dashboard, no avatar. Deliberately placed in this same
            left-grouped flex row (not a new fixed top-right element) so it
            can never land on the language switcher's fixed corner
            (LanguageSwitcher.css), in either LTR or RTL. */}
        {user && (
          <div className="ar-account">
            {user.email && <span className="ar-account-email">{user.email}</span>}
            <button type="button" className="ar-account-signout" data-cursor-hover onClick={() => signOut()}>
              {t('auth.signOut')}
            </button>
          </div>
        )}
      </div>

      <header className="ar-header">
        <h1 className="ar-title">{t('archive.myDreamArchive')}</h1>
        <p className="ar-subtitle">{t('archive.everyDreamLeavesATrace')}</p>
      </header>

      <DreamTimeline entries={entries} onOpenEntry={handleOpenEntry} />
    </div>
  );
}
