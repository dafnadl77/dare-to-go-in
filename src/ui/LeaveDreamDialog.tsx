import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../i18n/LanguageContext';
import '../archive/DeleteDreamDialog.css';

interface LeaveDreamDialogProps {
  /** Stay on the dream (the default, safe choice). */
  onStay: () => void;
  /** Discard the unsaved dream and go where the dreamer was headed. */
  onLeave: () => void;
}

/**
 * "Leave this dream?": asked before an in-app navigation would discard an analyzed dream
 * that has not been saved. Same alert-dialog behavior and DARE styling as
 * DeleteDreamDialog: focus starts on Stay, Tab is trapped, Escape and the backdrop
 * both mean Stay, focus returns to whatever opened it.
 */
export default function LeaveDreamDialog({ onStay, onLeave }: LeaveDreamDialogProps) {
  const { t } = useLanguage();
  const titleId = useId();
  const bodyId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  const leaveRef = useRef<HTMLButtonElement>(null);
  const onStayRef = useRef(onStay);
  useEffect(() => {
    onStayRef.current = onStay;
  }, [onStay]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    stayRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onStayRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const first = stayRef.current;
      const last = leaveRef.current;
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
        if (e.target === e.currentTarget) onStay();
      }}
    >
      <div ref={panelRef} className="dd-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}>
        <h2 id={titleId} className="dd-dialog-title">
          {t('leaveDream.title')}
        </h2>
        <p id={bodyId} className="dd-dialog-body">
          {t('leaveDream.body')}
        </p>
        <div className="dd-dialog-actions">
          <button ref={stayRef} type="button" className="btn btn-secondary dd-dialog-btn" onClick={onStay}>
            {t('leaveDream.stay')}
          </button>
          <button ref={leaveRef} type="button" className="btn dd-dialog-btn dd-dialog-confirm" onClick={onLeave}>
            {t('leaveDream.leave')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
