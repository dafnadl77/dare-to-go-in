import { useRef, useEffect, useState, type FormEvent } from 'react';
import DreamStageBackground from '../hero/DreamStageBackground';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../auth/AuthContext';
import { describeAuthError } from '../auth/authErrors';
import AppFooter from '../legal/AppFooter';
import type { LegalKey } from '../legal/legalContent';
import './DreamAuth.css';

export type AuthMode = 'signup' | 'signin';

interface DreamAuthProps {
  mode: AuthMode;
  onSwitchMode: (mode: AuthMode) => void;
  onBack: () => void;
  /** Fired only once a real Supabase session actually exists — either
      email/password sign-in/sign-up resolved successfully, or (for
      Google) AuthContext's own onAuthStateChange listener picks up the
      session after the OAuth redirect returns. Never fired just because
      a button was clicked. */
  onAuthenticated: () => void;
  onOpenLegal: (key: LegalKey) => void;
}

/** A restrained monochrome "G" monogram — deliberately not the multi-color
    branded Google logo, to stay inside DARE's own thin line-icon language
    (see DreamClosing.tsx's portal icons) rather than importing a generic
    SaaS asset. */
function GoogleMark() {
  return (
    <svg className="auth-google-mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 12.2c0-.7-.06-1.4-.18-2H12v3.8h5.05c-.22 1.18-.9 2.18-1.9 2.85v2.36h3.07C20.1 17.4 21 15 21 12.2Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M12 21c2.43 0 4.47-.8 5.96-2.18l-3.07-2.37c-.85.57-1.94.9-2.89.9-2.22 0-4.1-1.5-4.77-3.5H4.06v2.44A9 9 0 0 0 12 21Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M7.23 13.85a5.4 5.4 0 0 1 0-3.7V7.71H4.06a9 9 0 0 0 0 8.58l3.17-2.44Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M12 6.75c1.32 0 2.51.45 3.44 1.34l2.58-2.58C16.46 3.94 14.43 3 12 3a9 9 0 0 0-7.94 4.71l3.17 2.44c.67-2 2.55-3.4 4.77-3.4Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

/** Loose, deliberately permissive client-side check — just enough to
    catch an obviously malformed address before spending a network round
    trip, never a substitute for Supabase's own real validation. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * The Dream Archive's own authentication screen — the same cloud
 * environment as the rest of DARE, never a floating SaaS login card. Now
 * wired to real Supabase Auth (see AuthContext.tsx): email/password and
 * Google both create/resume a genuine session, never a bypass.
 */
export default function DreamAuth({ mode, onSwitchMode, onBack, onAuthenticated, onOpenLegal }: DreamAuthProps) {
  const { t } = useLanguage();
  const { signInWithPassword, signUpWithPassword, signInWithGoogle } = useAuth();
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    bgVideoRef.current?.play().catch(() => {});
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Distinguishes the three busy states so the submit button's own label
  // (and the Google button, disabled meanwhile) can say what's actually
  // happening, rather than one generic "loading" everywhere.
  const [pending, setPending] = useState<'password' | 'google' | null>(null);
  // Set only when a sign-up genuinely succeeded but returned no session —
  // a brand-new Supabase project has "Confirm email" on by default, so
  // the account exists but stays unusable until the dreamer opens the
  // link just emailed to them. Replaces the whole form (there is nothing
  // left to submit) rather than bouncing straight to the archive, which
  // would just get reversed by the auth guard the instant it discovers
  // there is still no real session — a confusing, unexplained dead end.
  const [awaitingConfirmationFor, setAwaitingConfirmationFor] = useState<string | null>(null);

  const isSignUp = mode === 'signup';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setErrorMessage(null);

    const trimmedEmail = email.trim();
    if (!looksLikeEmail(trimmedEmail)) {
      setErrorMessage(t('auth.errorInvalidEmail'));
      return;
    }
    if (isSignUp && password.length < 6) {
      setErrorMessage(t('auth.errorWeakPassword'));
      return;
    }

    setPending('password');
    const result = isSignUp
      ? await signUpWithPassword(trimmedEmail, password)
      : await signInWithPassword(trimmedEmail, password);
    setPending(null);

    if (!result.ok) {
      setErrorMessage(describeAuthError(result.error, t));
    } else if (result.sessionCreated) {
      onAuthenticated();
    } else {
      // Sign-up only — sign-in always either returns a real session or an
      // error, never this in-between state.
      setAwaitingConfirmationFor(trimmedEmail);
    }
  };

  const handleGoogleClick = async () => {
    if (pending) return;
    setErrorMessage(null);
    setPending('google');
    const result = await signInWithGoogle();
    // A successful call already has the browser navigating away to
    // Google — this only ever runs again if that redirect itself
    // couldn't even start (a real, if rare, failure — e.g. the OAuth
    // request being blocked before it could leave the page).
    if (!result.ok) {
      setPending(null);
      setErrorMessage(describeAuthError(result.error, t));
    }
  };

  const switchModeAndClearError = (next: AuthMode) => {
    setErrorMessage(null);
    setAwaitingConfirmationFor(null);
    onSwitchMode(next);
  };

  return (
    <div className="dream-auth">
      <DreamStageBackground ref={bgVideoRef} active />
      <button type="button" className="auth-back" dir="ltr" data-cursor-hover onClick={onBack} aria-label={t('auth.backToDare')}>
        DARE
      </button>

      <div className="auth-content">
        {awaitingConfirmationFor ? (
          <>
            <h1 className="auth-eyebrow-title">{t('auth.checkYourEmailTitle')}</h1>
            <p className="auth-tagline">{t('auth.checkYourEmailMessage').replace('{email}', awaitingConfirmationFor)}</p>
          </>
        ) : isSignUp ? (
          <>
            <h1 className="auth-eyebrow-title">{t('auth.keepYourDreams')}</h1>
            <p className="auth-tagline">{t('auth.createArchiveTagline')}</p>
          </>
        ) : (
          <>
            <h1 className="auth-eyebrow-title">{t('auth.welcomeBack')}</h1>
            <p className="auth-tagline">&nbsp;</p>
          </>
        )}

        {!awaitingConfirmationFor && <form className="auth-form" onSubmit={handleSubmit}>
          <button
            type="button"
            className="auth-google"
            data-cursor-hover
            onClick={handleGoogleClick}
            disabled={pending !== null}
          >
            <GoogleMark />
            {pending === 'google' ? t('auth.redirectingToGoogle') : t('auth.continueWithGoogle')}
          </button>

          <div className="auth-divider" aria-hidden="true">
            <span>{t('auth.or')}</span>
          </div>

          {errorMessage && (
            <p className="auth-error" role="alert">
              {errorMessage}
            </p>
          )}

          <label className="auth-field">
            <input
              className="auth-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              dir="ltr"
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending !== null}
            />
          </label>

          <label className="auth-field">
            <input
              className="auth-input"
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              dir="ltr"
              placeholder={t('auth.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending !== null}
            />
          </label>

          <button type="submit" className="auth-submit" data-cursor-hover disabled={pending !== null}>
            {pending === 'password'
              ? isSignUp
                ? t('auth.creatingAccount')
                : t('auth.signingIn')
              : isSignUp
                ? t('auth.createMyArchive')
                : t('auth.enterMyArchive')}
          </button>
        </form>}

        <p className="auth-switch">
          {awaitingConfirmationFor || isSignUp ? (
            <>
              {t('auth.alreadyHaveArchive')}
              <button type="button" className="auth-switch-link" data-cursor-hover onClick={() => switchModeAndClearError('signin')}>
                {t('auth.signIn')}
              </button>
            </>
          ) : (
            <>
              {t('auth.newHere')}
              <button type="button" className="auth-switch-link" data-cursor-hover onClick={() => switchModeAndClearError('signup')}>
                {t('auth.createYourArchive')}
              </button>
            </>
          )}
        </p>
      </div>

      <AppFooter onNavigate={onOpenLegal} pinned />
    </div>
  );
}
