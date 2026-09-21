import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../i18n/LanguageContext';

interface DeleteDreamDialogProps {
  /** A deletion is in flight: actions are inert and the dialog can't be dismissed. */
  busy: boolean;
  /** The last attempt failed — shows a retryable error; the dream is still there. */
  failed: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation for permanently deleting a saved dream. A real alert dialog:
 * focus starts on Cancel (the safe choice), Tab is trapped inside, Escape
 * closes ONLY this dialog (it is handled in the capture phase and stopped, so
 * Dream Detail's own Escape-to-go-back never sees it), clicking the backdrop
 * cancels, and focus returns to whatever opened it. While deleting, nothing
 * dismisses it and the actions ignore clicks (aria-disabled rather than
 * `disabled`, so keyboard focus is never dropped mid-request).
 */
export default function DeleteDreamDialog({ busy, failed, onCancel, onConfirm }: DeleteDreamDialogProps) {
  const { t } = useLanguage();
  const titleId = useId();
  const bodyId = useId();
  const errorId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
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
        // Only this dialog reacts; nothing behind it may also handle it.
        e.stopPropagation();
        e.preventDefault();
        if (!busyRef.current) onCancelRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const first = cancelRef.current;
      const last = confirmRef.current;
      if (!first || !last) return;
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
        aria-describedby={failed ? `${bodyId} ${errorId}` : bodyId}
        aria-busy={busy}
      >
        <h2 id={titleId} className="dd-dialog-title">
          {t('dreamDetail.deleteDialogTitle')}
        </h2>
        <p id={bodyId} className="dd-dialog-body">
          {t('dreamDetail.deleteDialogBody')}
        </p>
        {failed && !busy && (
          <p id={errorId} className="dd-dialog-error" role="alert">
            {t('dreamDetail.deleteFailed')}
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
            {t('dreamDetail.deleteCancel')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn dd-dialog-btn dd-dialog-confirm${busy ? ' is-loading' : ''}`}
            aria-disabled={busy}
            onClick={() => {
              if (!busy) onConfirm();
            }}
          >
            {busy && <span className="btn-spinner" aria-hidden="true" />}
            {busy ? t('dreamDetail.deleteInProgress') : t('dreamDetail.deleteConfirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
