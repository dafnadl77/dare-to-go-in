import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from './AuthContext';
import { getAuthHeader } from './getAccessToken';
import { AGE_REQUIRED_EVENT } from '../hero/safety/sessionStop';
import '../archive/DeleteDreamDialog.css';

/**
 * THE AGE QUESTION (doc 109, approved 2026-10-24): its own step, apart from the terms. Asked once, before first use: right after
 * sign-in for an account that has not confirmed (Google from any screen, older accounts), and whenever the server answers
 * age_required (a visitor without an account). Neither answer is preselected. "18 or over" is recorded by the server — the time only;
 * "under 18" records nothing, signs the account out and stops here. The server refuses every AI call without the confirmation anyway.
 */

async function ask(body: Record<string, unknown>): Promise<{ ok: boolean; ageConfirmed: boolean }> {
  try {
    const res = await fetch('/api/trial-session', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getAuthHeader()) }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => null)) as { ageConfirmed?: unknown } | null;
    return { ok: res.ok, ageConfirmed: res.ok && data?.ageConfirmed === true };
  } catch {
    return { ok: false, ageConfirmed: false };
  }
}

export default function AgeGate() {
  const { t } = useLanguage();
  const { user, loading, signOut } = useAuth();
  const [state, setState] = useState<'hidden' | 'asking' | 'saving' | 'minor'>('hidden');
  const [error, setError] = useState(false);
  const titleId = useId();
  const firstRef = useRef<HTMLButtonElement>(null);

  // An account that has not confirmed is asked right after sign-in (the server answers from the account itself).
  useEffect(() => {
    if (loading || !user) return;
    let live = true;
    void ask({ action: 'age-status' }).then((r) => {
      if (live && r.ok && !r.ageConfirmed) setState('asking');
    });
    return () => {
      live = false;
    };
  }, [user, loading]);

  // Any AI call the server refused for want of the confirmation brings the question up.
  useEffect(() => {
    const show = () => setState((s) => (s === 'minor' ? s : 'asking'));
    window.addEventListener(AGE_REQUIRED_EVENT, show);
    return () => window.removeEventListener(AGE_REQUIRED_EVENT, show);
  }, []);

  useEffect(() => {
    if (state === 'asking') firstRef.current?.focus();
  }, [state]);

  const adult = useCallback(async () => {
    setState('saving');
    setError(false);
    const r = await ask({ action: 'confirm-age', adult: true });
    if (r.ageConfirmed) setState('hidden');
    else {
      setError(true);
      setState('asking');
    }
  }, []);

  const minor = useCallback(async () => {
    setState('minor');
    if (user) await signOut().catch(() => {});
  }, [user, signOut]);

  if (state === 'hidden') return null;
  return createPortal(
    <div className="dd-dialog-backdrop">
      <div className="dd-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        {state === 'minor' ? (
          <>
            <h2 id={titleId} className="dd-dialog-title">
              {t('ageGate.minorTitle')}
            </h2>
            <p className="dd-dialog-body">{t('ageGate.minorBody')}</p>
            <p className="dd-dialog-body">{t('ageGate.minorAccount')}</p>
          </>
        ) : (
          <>
            <h2 id={titleId} className="dd-dialog-title">
              {t('ageGate.title')}
            </h2>
            <p className="dd-dialog-body">{t('ageGate.body')}</p>
            <p className="dd-dialog-body">
              <strong>{t('ageGate.question')}</strong>
            </p>
            <div className="dd-dialog-actions">
              <button ref={firstRef} type="button" className="btn btn-secondary dd-dialog-btn" disabled={state === 'saving'} onClick={() => void adult()}>
                {t('ageGate.adult')}
              </button>
              <button type="button" className="btn btn-secondary dd-dialog-btn" disabled={state === 'saving'} onClick={() => void minor()}>
                {t('ageGate.minor')}
              </button>
            </div>
            {error && (
              <p className="dd-dialog-error" role="alert">
                {t('ageGate.error')}
              </p>
            )}
            <p className="dd-dialog-body">
              <small>{t('ageGate.note')}</small>
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
