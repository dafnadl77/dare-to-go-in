import { useEffect, useRef, useState, type FormEvent } from 'react';
import DreamStageBackground from '../hero/DreamStageBackground';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../auth/AuthContext';
import { describeAuthError } from '../auth/authErrors';
import AppFooter from '../legal/AppFooter';
import type { LegalKey } from '../legal/legalContent';
import Breadcrumb from '../ui/Breadcrumb';
import './DreamAuth.css';

interface ResetPasswordProps {
  /** The brand lockup's own "leave" affordance — same as DreamAuth's,
      back to Home. Available in every state, including the invalid-link
      one, so a dreamer is never stuck here with no way out. */
  onBack: () => void;
  /** Fired only once updatePassword() has actually succeeded and the
      dreamer explicitly continues — never automatic (see the success
      state below), matching how DREAM SAVED.'s own "go to my dream
      archive" invitation works elsewhere in this app. */
  onDone: () => void;
  /** Routes back to DreamAuth already in 'forgot' mode — the invalid/
      expired state's own "request a new link" action. App.tsx owns
      `authMode`/`view` together, so this is the one callback that can
      set both correctly rather than ResetPassword guessing at App.tsx's
      internal state shape. */
  onRequestNewLink: () => void;
  onOpenLegal: (key: LegalKey) => void;
}

/** How long to wait for Supabase's own async URL processing
    (detectSessionInUrl, see supabaseClient.ts) to actually fire the
    PASSWORD_RECOVERY event before concluding the link never worked —
    genuinely asynchronous, not instant, so this needs a real window
    rather than checking once on mount. */
const LINK_CHECK_TIMEOUT_MS = 6000;

/**
 * The dedicated "set a new password" destination a real Supabase
 * password-recovery email link lands on (see resetPasswordRedirectUrl in
 * AuthContext.tsx) — reached only via App.tsx's 'reset-password' view,
 * never by clicking anything inside DreamAuth.tsx directly. Reuses
 * DreamAuth.css's shared visual language (same shell, same field/button
 * classes) rather than inventing a second auth look.
 *
 * Three real states, decided from Supabase's own signals — never a
 * custom token system:
 * 1. Checking — brief, while waiting to see whether a genuine
 *    PASSWORD_RECOVERY session actually materializes.
 * 2. Invalid/expired — either Supabase put an error directly in the
 *    redirect URL (an already-used or expired link is caught server-side
 *    before the app ever sees a session), or the check above timed out
 *    with no recovery session ever appearing.
 * 3. Ready — a real recovery session exists (AuthContext's
 *    isPasswordRecovery), so the actual new-password form renders.
 */
export default function ResetPassword({ onBack, onDone, onRequestNewLink, onOpenLegal }: ResetPasswordProps) {
  const { t } = useLanguage();
  const { isPasswordRecovery, updatePassword } = useAuth();
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    bgVideoRef.current?.play().catch(() => {});
  }, []);

  // Checked once, on mount, never re-parsed — Supabase appends error
  // info directly to the redirect URL (this project's supabaseClient.ts
  // sets no explicit flowType, so supabase-js defaults to the implicit
  // flow: hash-based tokens/errors, not a `code` query param) when the
  // link itself was already invalid before the app ever had a chance to
  // see a real session.
  const [linkError] = useState<boolean>(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    return hash.includes('error=') || hash.includes('error_code=') || search.includes('error=');
  });

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (linkError || isPasswordRecovery) return;
    const timer = setTimeout(() => setTimedOut(true), LINK_CHECK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [linkError, isPasswordRecovery]);

  const showInvalid = !succeeded && (linkError || (timedOut && !isPasswordRecovery));
  const showChecking = !succeeded && !showInvalid && !isPasswordRecovery;
  const showForm = !succeeded && !showInvalid && isPasswordRecovery;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setErrorMessage(null);

    if (newPassword.length < 6) {
      setErrorMessage(t('auth.errorWeakPassword'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage(t('auth.passwordsDontMatch'));
      return;
    }

    setPending(true);
    const result = await updatePassword(newPassword);
    setPending(false);

    if (!result.ok) {
      setErrorMessage(describeAuthError(result.error, t));
    } else {
      setSucceeded(true);
    }
  };

  return (
    <div className="dream-auth">
      <DreamStageBackground ref={bgVideoRef} active />
      <button type="button" className="auth-back" dir="ltr" data-cursor-hover onClick={onBack} aria-label={t('auth.backToDare')}>
        <img className="auth-back-icon" src="/apple-touch-icon.png" alt="" aria-hidden="true" />
        <span className="editorial-word-flow">
          {['DARE', 'TO', 'GO', 'IN'].map((word) => (
            <span className="editorial-word" key={word}>
              {word}
            </span>
          ))}
        </span>
      </button>

      <div className="auth-content">
        <Breadcrumb ariaLabel={t('breadcrumb.ariaLabel')} onHome={onBack} items={[{ label: t('auth.setNewPasswordTitle') }]} />

        {succeeded ? (
          <>
            <h1 className="auth-eyebrow-title">{t('auth.passwordUpdatedTitle')}</h1>
            <p className="auth-tagline">{t('auth.passwordUpdatedMessage')}</p>
            <button type="button" className="auth-submit" data-cursor-hover onClick={onDone}>
              {t('auth.continueToArchive')}
            </button>
          </>
        ) : showInvalid ? (
          <>
            <h1 className="auth-eyebrow-title">{t('auth.resetLinkInvalidTitle')}</h1>
            <p className="auth-tagline">{t('auth.resetLinkInvalidMessage')}</p>
            <button type="button" className="auth-submit" data-cursor-hover onClick={onRequestNewLink}>
              {t('auth.requestNewLink')}
            </button>
          </>
        ) : showChecking ? (
          <>
            <h1 className="auth-eyebrow-title">{t('auth.setNewPasswordTitle')}</h1>
            <p className="auth-tagline">{t('auth.resetLinkChecking')}</p>
          </>
        ) : (
          <>
            <h1 className="auth-eyebrow-title">{t('auth.setNewPasswordTitle')}</h1>
            <p className="auth-tagline">{t('auth.setNewPasswordTagline')}</p>
          </>
        )}

        {showForm && (
          <form className="auth-form" onSubmit={handleSubmit}>
            {errorMessage && (
              <p className="auth-error" role="alert">
                {errorMessage}
              </p>
            )}

            <label className="auth-field">
              <input
                className="auth-input"
                type="password"
                autoComplete="new-password"
                dir="ltr"
                placeholder={t('auth.newPasswordPlaceholder')}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={pending}
                required
              />
            </label>

            <label className="auth-field">
              <input
                className="auth-input"
                type="password"
                autoComplete="new-password"
                dir="ltr"
                placeholder={t('auth.confirmPasswordPlaceholder')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={pending}
                required
              />
            </label>

            <button type="submit" className="auth-submit" data-cursor-hover disabled={pending}>
              {pending ? t('auth.updatingPassword') : t('auth.updatePasswordSubmit')}
            </button>
          </form>
        )}
      </div>

      <AppFooter onNavigate={onOpenLegal} pinned />
    </div>
  );
}
