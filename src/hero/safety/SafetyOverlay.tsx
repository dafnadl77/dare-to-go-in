import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import SafetyPanel from './SafetyPanel';
import type { CrisisLevel } from './crisisTexts';
import type { AddressPreference } from '../addressPreference';
import type { AppLanguage } from '../appLanguage';
import '../../archive/DeleteDreamDialog.css';

/**
 * The distress path over the main dream screen (doc 106/109): the same fixed words and numbers as in the conversation window, above
 * whatever screen asked. It can always be closed — nobody is trapped — and after immediate danger or a threat nothing more is sent to
 * the AI on this page anyway (sessionStop.ts).
 */
export default function SafetyOverlay(p: {
  level: CrisisLevel;
  address: AddressPreference;
  language: AppLanguage;
  onChoice: (id: 'dream' | 'also-now' | 'in-danger' | 'not-immediate') => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus();
  }, [p.level]);
  return createPortal(
    <div className="dd-dialog-backdrop">
      <div ref={panelRef} className="dd-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <span id={titleId} className="dm-visually-hidden" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          {p.language === 'he' ? 'עזרה' : 'Help'}
        </span>
        <SafetyPanel level={p.level} address={p.address} language={p.language} onChoice={p.onChoice} />
        <div className="dd-dialog-actions">
          <button type="button" className="btn btn-secondary dd-dialog-btn" onClick={p.onClose}>
            {p.language === 'he' ? 'סגירה' : 'Close'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
