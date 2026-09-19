import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import HeroDream from './hero/HeroDream';
import DreamAuth, { type AuthMode } from './archive/DreamAuth';
import DreamArchive from './archive/DreamArchive';
import DreamDetail from './archive/DreamDetail';
import type { ArchiveEntry } from './archive/archiveData';
import type { SavedDream } from './hero/dreamStorage';
import { saveDreamRemote } from './hero/dreamRemoteStorage';
import { getPendingDreamSave, setPendingDreamSave, clearPendingDreamSave } from './hero/pendingDreamSave';
import LanguageSwitcher from './i18n/LanguageSwitcher';
import ResetPassword from './archive/ResetPassword';
import { useAuth, POST_AUTH_REDIRECT_PARAM, POST_AUTH_REDIRECT_VALUE, RESET_PASSWORD_VIEW_VALUE } from './auth/AuthContext';
import { useLanguage } from './i18n/LanguageContext';
import LegalPage from './legal/LegalPage';
import type { LegalKey } from './legal/legalContent';
import AboutPage from './about/AboutPage';
import AccessibilityControl from './a11y/AccessibilityControl';

/** Which top-level experience is mounted. No router is introduced for
    this first pass (the whole app is already a single state machine —
    see HeroDream.tsx) — 'dream' is the entire existing reconstruction/
    reflection/closing journey, untouched; 'auth'/'archive'/'detail' are
    the Dream Archive area, reached only via DREAM SAVED.'s "go to my
    dream archive" invitation, or directly once real auth is involved
    (see below). 'detail' always returns to 'archive', never anywhere
    else, matching "clicking a dream opens it; leaving it returns to MY
    DREAM ARCHIVE" from the brief. 'privacy' | 'accessibility' | 'terms'
    are the legal pages (see src/legal) — public, unguarded, reachable
    from every screen's own footer. */
type AppView = 'dream' | 'auth' | 'archive' | 'detail' | 'reset-password' | 'about' | LegalKey;

const LEGAL_VIEWS: LegalKey[] = ['privacy', 'accessibility', 'terms'];

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
  // A real password-recovery email link (see resetPasswordRedirectUrl in
  // AuthContext.tsx) lands here with this exact query value, alongside
  // Supabase's own auth params (a `code` param, or hash tokens — either
  // way this plain search param survives untouched). React state set
  // here persists for the rest of this page load even if Supabase's own
  // client later cleans its params out of the URL.
  if (value === RESET_PASSWORD_VIEW_VALUE) return 'reset-password';
  if (value === 'about') return 'about';
  if (value && (LEGAL_VIEWS as string[]).includes(value)) return value as LegalKey;
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
    there's nothing to flash before we know whether to show them at all.
    Reused (never redesigned) for the pending-save resume below — the
    same "wait for something real before showing the destination" purpose
    this screen already exists for — with an optional error+retry state
    for a genuine save failure (see attemptPendingSave in App()). */
function AuthLoadingScreen({ messageKey = 'auth.checkingSession', onRetry }: { messageKey?: string; onRetry?: () => void }) {
  const { t } = useLanguage();
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '1.2rem',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--dream-black)',
        color: 'var(--dream-white)',
        fontFamily: "'Heebo', 'Assistant', system-ui, sans-serif",
        fontSize: '0.8rem',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        textAlign: 'center',
        padding: '0 1.5rem',
        opacity: 0.7,
      }}
    >
      {t(messageKey)}
      {onRetry && (
        <button
          type="button"
          data-cursor-hover
          onClick={onRetry}
          style={{
            background: 'none',
            border: '1px solid currentColor',
            borderRadius: '999px',
            padding: '0.6em 1.4em',
            color: 'inherit',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            letterSpacing: 'inherit',
            textTransform: 'inherit',
            cursor: 'pointer',
          }}
        >
          {t('reconstruction.tryAgain')}
        </button>
      )}
    </div>
  );
}

function App() {
  const { user, loading, isPasswordRecovery } = useAuth();
  const { t } = useLanguage();
  const [view, setViewState] = useState<AppView>(() => getInitialView());
  const [authMode, setAuthMode] = useState<AuthMode>('signup');
  const [openEntry, setOpenEntry] = useState<ArchiveEntry | null>(null);
  // SAVE THIS DREAM, chosen while signed OUT (see HeroDream.tsx's
  // handleSaveDream): 'none' the rest of the time; 'awaiting-auth' once a
  // dream is pending and DreamAuth is showing (view === 'auth' already
  // covers what's on screen, nothing extra to render here); 'resuming'/
  // 'error' while the pending dream is actually being written to Supabase
  // once a real session exists — these two override whatever `view`
  // happens to be (see the screen-selection below), so the dreamer can
  // never land on the (still dream-less) archive before that save is
  // genuinely confirmed. Initialized synchronously from localStorage so a
  // returning Google OAuth / email-confirmation redirect never flashes
  // the ordinary archive first.
  const [pendingSaveState, setPendingSaveState] = useState<'none' | 'awaiting-auth' | 'resuming' | 'error'>(() =>
    getPendingDreamSave() ? 'awaiting-auth' : 'none',
  );
  // Guards the resume attempt below against firing twice concurrently
  // (e.g. a fast double state change right after sign-in) — a ref, not
  // state, since it must be readable synchronously inside the same effect
  // tick that sets it.
  const isResumingSaveRef = useRef(false);

  const setView = (next: AppView) => {
    setViewState(next);
    writeViewToUrl(next);
  };

  // The one place a pending dream is actually written to Supabase — used
  // both by the effect below (every automatic trigger: ordinary sign-in/
  // up, and a fresh page load already authenticated after a Google/email
  // redirect) and by the error state's own Retry action. saveDreamRemote
  // itself is upsert-based (see dreamRemoteStorage.ts), so a retry after
  // an uncertain failure can never create a duplicate row.
  const attemptPendingSave = useCallback(async () => {
    if (isResumingSaveRef.current || !user) return;
    const pending = getPendingDreamSave();
    if (!pending) {
      setPendingSaveState('none');
      return;
    }
    isResumingSaveRef.current = true;
    setPendingSaveState('resuming');
    try {
      await saveDreamRemote(pending, user.id);
      clearPendingDreamSave();
      setPendingSaveState('none');
      setView('archive');
    } catch (err) {
      console.error('Failed to resume pending dream save:', err);
      setPendingSaveState('error');
    } finally {
      isResumingSaveRef.current = false;
    }
  }, [user]);

  // Fires the resume above the moment a real session exists alongside a
  // pending dream — covers every path a dreamer can reach that combination
  // from: an ordinary sign-in/up (DreamAuth's onAuthenticated already
  // flips `user`, which re-runs this), and a fresh page load that's
  // already authenticated after returning from Google OAuth or a sign-up
  // confirmation-email link (both round trips survive only because the
  // pending dream itself lives in localStorage — see pendingDreamSave.ts
  // — not in this component's own state).
  useEffect(() => {
    if (loading) return;
    if (!user) {
      // Genuinely signed out — nothing to resume yet; leave any pending
      // dream exactly where it is for a future sign-in to pick up (see
      // the TTL in pendingDreamSave.ts for how long that stays valid).
      setPendingSaveState((prev) => (prev === 'resuming' ? prev : getPendingDreamSave() ? 'awaiting-auth' : 'none'));
      return;
    }
    attemptPendingSave();
  }, [user, loading, attemptPendingSave]);

  // HeroDream's own SAVE, chosen while signed out (see its handleSaveDream)
  // — the completed dream survives HeroDream's own unmount (it's about to
  // be replaced by the existing DreamAuth screen) because it's handed up
  // here and written to localStorage, not kept in HeroDream's local state.
  const handleRequireAuthForSave = (dream: SavedDream) => {
    setPendingDreamSave(dream);
    setPendingSaveState('awaiting-auth');
    setView('auth');
  };

  // The Hero's own way into the Dream Archive area — previously the only
  // path in was mid-journey, via DREAM SAVED.'s "go to my dream archive".
  // Decided from the real Supabase session (`user`), exactly like the
  // guard effect below: never a fake stored boolean, and never a second
  // source of truth for "is someone signed in".
  const handleMyDreamsNav = () => {
    setView(user ? 'archive' : 'auth');
  };

  // The footer's three legal links, from every screen that shows one —
  // always allowed, regardless of auth state, so this never needs (or
  // triggers) the guard below.
  const handleOpenLegal = (key: LegalKey) => {
    setView(key);
  };

  // The auth guard: Dream Archive and Dream Detail are real protected
  // screens now (see instructions) — an unauthenticated visitor lands on
  // DreamAuth instead, decided from the real Supabase session (`user`),
  // never a fake stored boolean. Waits for `loading` to resolve first so
  // a genuinely signed-in dreamer refreshing on the archive never gets
  // bounced to auth just because the session hasn't loaded yet.
  //
  // A password-recovery link creates a real session the exact same way a
  // normal sign-in does (see AuthContext.tsx), so `user` alone can't
  // keep it out of the archive — isPasswordRecovery is what does that:
  // whenever it's true, archive/detail redirect to the dedicated "set a
  // new password" screen instead of either auth or the archive itself,
  // until updatePassword() actually succeeds and clears the flag.
  useEffect(() => {
    if (loading) return;
    if (isPasswordRecovery && (view === 'archive' || view === 'detail')) {
      setView('reset-password');
      return;
    }
    if ((view === 'archive' || view === 'detail') && !user) {
      setView('auth');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, view, isPasswordRecovery]);

  let screen: ReactNode;

  if (pendingSaveState === 'resuming' || pendingSaveState === 'error') {
    // Takes priority over `view` entirely — the pending dream is only
    // ever in this state right after a real session just materialized
    // (see the effect above), so `view` at this exact moment is either
    // still 'auth' or already flipped to 'archive'/POST_AUTH_REDIRECT's
    // default; either way, the dreamer must see this, not that, until the
    // save is genuinely confirmed (or fails, with a real way to retry).
    screen = (
      <AuthLoadingScreen
        messageKey={pendingSaveState === 'error' ? 'auth.saveDreamFailedMessage' : 'auth.savingYourDream'}
        onRetry={pendingSaveState === 'error' ? attemptPendingSave : undefined}
      />
    );
  } else if ((view === 'archive' || view === 'detail') && loading) {
    // Never render the real archive/detail content until we genuinely
    // know whether this visitor is signed in — avoids a flash of
    // protected content before the guard above can react.
    screen = <AuthLoadingScreen />;
  } else if (LEGAL_VIEWS.includes(view as LegalKey)) {
    screen = <LegalPage documentKey={view as LegalKey} onBack={() => setView('dream')} />;
  } else if (view === 'about') {
    screen = <AboutPage onBack={() => setView('dream')} onOpenLegal={handleOpenLegal} />;
  } else if (view === 'auth') {
    screen = (
      <DreamAuth
        mode={authMode}
        onSwitchMode={setAuthMode}
        onBack={() => {
          // Backing out of an auth prompt reached via SAVE — while
          // nothing has been authenticated yet — is a deliberate cancel:
          // clear the pending dream rather than leaving it to potentially
          // attach itself to some unrelated future sign-in on this same
          // browser (see pendingDreamSave.ts's own TTL note on that same
          // risk). Never touches a pending dream that's already resuming/
          // resolved, since this branch only renders while it's still
          // 'awaiting-auth'.
          if (pendingSaveState === 'awaiting-auth') {
            clearPendingDreamSave();
            setPendingSaveState('none');
          }
          setView('dream');
        }}
        onAuthenticated={() => setView('archive')}
        onOpenLegal={handleOpenLegal}
      />
    );
  } else if (view === 'reset-password') {
    screen = (
      <ResetPassword
        onBack={() => setView('dream')}
        onDone={() => setView('archive')}
        onRequestNewLink={() => {
          setAuthMode('forgot');
          setView('auth');
        }}
        onOpenLegal={handleOpenLegal}
      />
    );
  } else if (view === 'detail' && openEntry && user) {
    screen = (
      <DreamDetail
        entry={openEntry}
        onBack={() => setView('archive')}
        onGoHome={() => setView('dream')}
        onOpenLegal={handleOpenLegal}
      />
    );
  } else if (view === 'archive' && user) {
    screen = (
      <DreamArchive
        onBack={() => setView('dream')}
        onOpenEntry={(entry) => {
          setOpenEntry(entry);
          setView('detail');
        }}
        onOpenLegal={handleOpenLegal}
      />
    );
  } else {
    screen = (
      <HeroDream
        onGoToArchive={() => setView(user ? 'archive' : 'auth')}
        onRequireAuthForSave={handleRequireAuthForSave}
        onOpenLegal={handleOpenLegal}
      />
    );
  }

  return (
    <>
      {screen}
      <div className="top-right-nav">
        {/* Hero-only — DreamAuth/DreamArchive/DreamDetail already have
            their own way back or are the archive itself, so a second
            "go to my dreams" link there would be redundant at best. */}
        {(view === 'dream' || view === 'about') && (
          <>
            <button type="button" className="trn-archive-link" data-cursor-hover onClick={handleMyDreamsNav}>
              {t('hero.myDreamsNav')}
            </button>
            <span className="trn-divider" aria-hidden="true">
              |
            </span>
          </>
        )}
        {view === 'dream' && (
          <>
            <button type="button" className="trn-archive-link" data-cursor-hover onClick={() => setView('about')}>
              {t('hero.aboutNav')}
            </button>
            <span className="trn-divider" aria-hidden="true">
              |
            </span>
          </>
        )}
        <LanguageSwitcher />
      </div>
      <AccessibilityControl />
    </>
  );
}

export default App;
