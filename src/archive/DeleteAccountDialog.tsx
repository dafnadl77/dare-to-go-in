import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { DELETE_ACCOUNT_CONFIRMATION } from '../auth/deleteAccount';
import './DeleteDreamDialog.css';

interface DeleteAccountDialogProps {
  /** A deletion is in flight: actions are inert and the dialog can't be dismissed. */
  busy: boolean;
  /** The last attempt failed: shows a retryable error; nothing was reported as deleted. */
  failed: boolean;
  onCancel: () => void;
  /** Called with the exact typed confirmation, and only once it matches. */
  onConfirm: (confirmation: string) => void;
}

/**
 * Confirmation for PERMANENTLY deleting the account. Same alert-dialog
 * behavior as DeleteDreamDialog (focus starts on Cancel, Tab trapped, Escape
 * closes only this dialog, backdrop click cancels, nothing dismisses it while
 * deleting), plus a typed confirmation: the final button is a real `disabled`
 * button until the input equals the confirmation word exactly (DELETE in
 * English, מחיקה in Hebrew), and the handler re-checks it.
 */
export default function DeleteAccountDialog({ busy, failed, onCancel, onConfirm }: DeleteAccountDialogProps) {
  const { t, language } = useLanguage();
  const word = DELETE_ACCOUNT_CONFIRMATION[language === 'he' ? 'he' : 'en'];
  const [typed, setTyped] = useState('');
  const matches = typed === word;
  const titleId = useId();
  const bodyId = useId();
  const promptId = useId();
  const errorId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(busy);
  const onCancelRef = useRef(onCancel);
  useEffect(() => {
    busyRef.current = busy;
    onCancelRef.current = onCancel;
  }, [busy, onCancel]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        if (!busyRef.current) onCancelRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])') ?? []);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (!panelRef.current?.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const submit = () => {
    if (busy || typed !== word) return;
    onConfirm(typed);
  };

  return createPortal(
    <div
      className="dd-dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={panelRef}
        className="dd-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={failed ? `${bodyId} ${promptId} ${errorId}` : `${bodyId} ${promptId}`}
        aria-busy={busy}
      >
        <h2 id={titleId} className="dd-dialog-title">
          {t('archive.deleteAccountTitle')}
        </h2>
        <p id={bodyId} className="dd-dialog-body">
          {t('archive.deleteAccountBody')}
        </p>
        <label className="dd-dialog-typed" htmlFor={`${promptId}-input`}>
          <span id={promptId} className="dd-dialog-typed-prompt">
            {t('archive.deleteAccountTypePrompt')}{' '}
            <bdi className="dd-dialog-word" dir="auto">
              {word}
            </bdi>
          </span>
          <input
            id={`${promptId}-input`}
            className="dd-dialog-input"
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            disabled={busy}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            dir="auto"
            aria-label={t('archive.deleteAccountInputLabel')}
          />
        </label>
        {failed && !busy && (
          <p id={errorId} className="dd-dialog-error" role="alert">
            {t('archive.deleteAccountFailed')}
          </p>
        )}
        <div className="dd-dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-secondary dd-dialog-btn"
            aria-disabled={busy}
            onClick={() => {
              if (!busy) onCancel();
            }}
          >
            {t('archive.deleteCancel')}
          </button>
          <button
            type="button"
            className={`btn dd-dialog-btn dd-dialog-confirm${busy ? ' is-loading' : ''}`}
            disabled={!matches || busy}
            onClick={submit}
          >
            {busy && <span className="btn-spinner" aria-hidden="true" />}
            {busy ? t('archive.deleteInProgress') : t('archive.deleteAccountConfirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
