import { useEffect, useState, type ReactNode } from 'react';
import HeroDream from './hero/HeroDream';
import DreamAuth, { type AuthMode } from './archive/DreamAuth';
import DreamArchive from './archive/DreamArchive';
import DreamDetail from './archive/DreamDetail';
import type { ArchiveEntry } from './archive/archiveData';
import LanguageSwitcher from './i18n/LanguageSwitcher';
import { useAuth, POST_AUTH_REDIRECT_PARAM, POST_AUTH_REDIRECT_VALUE } from './auth/AuthContext';
import { useLanguage } from './i18n/LanguageContext';

/** Which top-level experience is mounted. No router is introduced for
    this first pass (the whole app is already a single state machine —
    see HeroDream.tsx) — 'dream' is the entire existing reconstruction/
    reflection/closing journey, untouched; 'auth'/'archive'/'detail' are
    the Dream Archive area, reached only via DREAM SAVED.'s "go to my
    dream archive" invitation, or directly once real auth is involved
    (see below). 'detail' always returns to 'archive', never anywhere
    else, matching "clicking a dream opens it; leaving it returns to MY
    DREAM ARCHIVE" from the brief. */
type AppView = 'dream' | 'auth' | 'archive' | 'detail';

/** Reflects `view` in the URL as a plain query param (never a route —
    there is still no router) so two real things work without inventing
    any fake "logged in" storage of our own: (1) refreshing the page
    while on a protected screen lands back on that same screen once the
    real Supabase session is confirmed, instead of always resetting to
    'dream'; (2) the Google OAuth redirect (which necessarily leaves and
    returns to this exact origin — see AuthContext.tsx's redirectTo) can
    say "I meant to end up at the archive" across that round trip. Only
    'dream' | 'auth' | 'archive' are ever written — 'detail' collapses to
    'archive' here because which specific dream was open isn't something
    a fresh page load can recover (no id in the URL for it), so refreshing
    mid-dream-detail lands one level up, on the real archive list. */
function getInitialView(): AppView {
  const value = new URLSearchParams(window.location.search).get(POST_AUTH_REDIRECT_PARAM);
  if (value === POST_AUTH_REDIRECT_VALUE) return 'archive';
  if (value === 'auth') return 'auth';
  return 'dream';
}

function writeViewToUrl(view: AppView) {
  const url = new URL(window.location.href);
  if (view === 'dream') {
    url.searchParams.delete(POST_AUTH_REDIRECT_PARAM);
  } else {
    url.searchParams.set(POST_AUTH_REDIRECT_PARAM, view === 'detail' ? POST_AUTH_REDIRECT_VALUE : view);
  }
  window.history.replaceState({}, '', url);
}

/** Minimal, on-brand "checking your session" hold — shown only for the
    brief window before the real Supabase session check resolves, on a
    protected screen. Deliberately plain (no new visual language): the
    same black/ivory palette as the rest of the app, nothing borrowed
    from the cloud/room scenes those protected screens themselves use, so
    there's nothing to flash before we know whether to show them at all. */
function AuthLoadingScreen() {
  const { t } = useLanguage();
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--dream-black)',
        color: 'var(--dream-white)',
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: '0.8rem',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        opacity: 0.7,
      }}
    >
      {t('auth.checkingSession')}
    </div>
  );
}

function App() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  const [view, setViewState] = useState<AppView>(() => getInitialView());
  const [authMode, setAuthMode] = useState<AuthMode>('signup');
  const [openEntry, setOpenEntry] = useState<ArchiveEntry | null>(null);

  const setView = (next: AppView) => {
    setViewState(next);
    writeViewToUrl(next);
  };

  // The Hero's own way into the Dream Archive area — previously the only
  // path in was mid-journey, via DREAM SAVED.'s "go to my dream archive".
  // Decided from the real Supabase session (`user`), exactly like the
  // guard effect below: never a fake stored boolean, and never a second
  // source of truth for "is someone signed in".
  const handleMyDreamsNav = () => {
    setView(user ? 'archive' : 'auth');
  };

  // The auth guard: Dream Archive and Dream Detail are real protected
  // screens now (see instructions) — an unauthenticated visitor lands on
  // DreamAuth instead, decided from the real Supabase session (`user`),
  // never a fake stored boolean. Waits for `loading` to resolve first so
  // a genuinely signed-in dreamer refreshing on the archive never gets
  // bounced to auth just because the session hasn't loaded yet.
  useEffect(() => {
    if (loading) return;
    if ((view === 'archive' || view === 'detail') && !user) {
      setView('auth');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, view]);

  let screen: ReactNode;

  if ((view === 'archive' || view === 'detail') && loading) {
    // Never render the real archive/detail content until we genuinely
    // know whether this visitor is signed in — avoids a flash of
    // protected content before the guard above can react.
    screen = <AuthLoadingScreen />;
  } else if (view === 'auth') {
    screen = (
      <DreamAuth
        mode={authMode}
        onSwitchMode={setAuthMode}
        onBack={() => setView('dream')}
        onAuthenticated={() => setView('archive')}
      />
    );
  } else if (view === 'detail' && openEntry && user) {
    screen = <DreamDetail entry={openEntry} onBack={() => setView('archive')} onGoHome={() => setView('dream')} />;
  } else if (view === 'archive' && user) {
    screen = (
      <DreamArchive
        onBack={() => setView('dream')}
        onOpenEntry={(entry) => {
          setOpenEntry(entry);
          setView('detail');
        }}
      />
    );
  } else {
    screen = <HeroDream onGoToArchive={() => setView('auth')} />;
  }

  return (
    <>
      {screen}
      <div className="top-right-nav">
        {/* Hero-only — DreamAuth/DreamArchive/DreamDetail already have
            their own way back or are the archive itself, so a second
            "go to my dreams" link there would be redundant at best. */}
        {view === 'dream' && (
          <>
            <button type="button" className="trn-archive-link" data-cursor-hover onClick={handleMyDreamsNav}>
              {t('hero.myDreamsNav')}
            </button>
            <span className="trn-divider" aria-hidden="true">
              |
            </span>
          </>
        )}
        <LanguageSwitcher />
      </div>
    </>
  );
}

export default App;
