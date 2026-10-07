import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { getLegalDocument } from './legalContent';
import { linkifyEmails } from './linkifyEmails';
import './PrivacyPolicyDialog.css';

interface PrivacyPolicyDialogProps {
  /** Label of the button that returns to what the reader was doing (e.g. "Close and return to payment"). */
  closeLabel: string;
  onClose: () => void;
}

/**
 * The SAME Privacy Policy text the Privacy page shows (legalContent.ts, read-only), in a modal over the current screen.
 * Opening it never navigates, so whatever the reader was filling in (e.g. the checkout form) stays exactly as it was; closing
 * it (button, Escape, or the dark backdrop) returns focus to the control that opened it.
 */
export default function PrivacyPolicyDialog({ closeLabel, onClose }: PrivacyPolicyDialogProps) {
  const { language } = useLanguage();
  const doc = getLegalDocument(language, 'privacy');
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Only THIS dialog closes: the dialog underneath must not see the key.
        e.stopImmediatePropagation();
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]') ?? []);
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
    // Registered when this dialog opens, i.e. AFTER the checkout dialog's own listener: that one steps aside while this is open.
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return createPortal(
    <div
      className="pp-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} className="pp-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="pp-scroll">
          <h2 id={titleId} className="pp-title">
            {doc.title}
          </h2>
          <p className="pp-updated">{doc.updated}</p>
          <p className="pp-intro">{doc.intro}</p>
          {doc.sections.map((section) => (
            <section className="pp-section" key={section.heading}>
              <h3 className="pp-heading">{section.heading}</h3>
              {section.body.split('\n\n').map((paragraph, i) => (
                <p className="pp-body" key={i}>
                  {linkifyEmails(paragraph)}
                </p>
              ))}
            </section>
          ))}
          <p className="pp-draft">{doc.draftNotice}</p>
        </div>
        <div className="pp-footer">
          <button ref={closeRef} type="button" className="btn btn-primary pp-close" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
