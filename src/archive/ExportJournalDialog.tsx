import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { dateLocale } from '../i18n/locale';
import { fetchJournalAccess, requestJournalPdf, saveJournalBlob, type JournalAccess, type JournalExportError } from './journalExport';
import { JOURNAL_MAX_DREAMS } from './journalLimits';
import './DeleteDreamDialog.css';
import './ExportJournalDialog.css';

export interface JournalDreamChoice {
  id: string;
  title: string;
  date: Date;
}

interface ExportJournalDialogProps {
  dreams: JournalDreamChoice[];
  onClose: () => void;
  onGoToPackages: () => void;
}

/**
 * "Export Dream Journal". Three faces: a short check of access, the premium message for an account without the
 * DIVE IN entitlement (with a way to Packages), and, for an entitled account, the choice between every dream and a
 * hand-picked set. The dialog only chooses what to show; the server decides who may export what.
 */
export default function ExportJournalDialog({ dreams, onClose, onGoToPackages }: ExportJournalDialogProps) {
  const { t, language } = useLanguage();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [access, setAccess] = useState<JournalAccess | 'checking'>('checking');
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<'all' | 'choose'>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<JournalExportError | null>(null);
  const busyRef = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    busyRef.current = busy;
    onCloseRef.current = onClose;
  }, [busy, onClose]);

  useEffect(() => {
    let cancelled = false;
    fetchJournalAccess().then((result) => {
      if (!cancelled) setAccess(result);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        if (!busyRef.current) onCloseRef.current();
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

  useEffect(() => {
    if (access !== 'checking') primaryRef.current?.focus();
  }, [access]);

  const tooMany = dreams.length > JOURNAL_MAX_DREAMS;
  const effectiveMode = tooMany ? 'choose' : mode;
  const chosenCount = picked.size;
  const canExport = !busy && (effectiveMode === 'all' ? dreams.length > 0 : chosenCount > 0 && chosenCount <= JOURNAL_MAX_DREAMS);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runExport = async () => {
    if (!canExport) return;
    setBusy(true);
    setError(null);
    const result = await requestJournalPdf(effectiveMode === 'all' ? { all: true } : { dreamIds: Array.from(picked) }, language);
    setBusy(false);
    if (result.ok) {
      saveJournalBlob(result.blob);
      onClose();
      return;
    }
    if (result.reason === 'entitlement_required') setAccess('locked');
    else setError(result.reason);
  };

  const errorKey: Record<JournalExportError, string> = {
    entitlement_required: 'archive.journalErrGeneric',
    export_too_large: 'archive.journalErrTooLarge',
    dreams_not_found: 'archive.journalErrNotFound',
    export_in_progress: 'archive.journalErrBusy',
    not_authenticated: 'archive.journalErrGeneric',
    failed: 'archive.journalErrGeneric',
  };

  const formatDate = (d: Date) => d.toLocaleDateString(dateLocale(language), { day: 'numeric', month: 'short', year: 'numeric' });

  return createPortal(
    <div
      className="dd-dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div ref={panelRef} className="dd-dialog jr-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy}>
        <h2 id={titleId} className="dd-dialog-title">
          {t('archive.journalTitle')}
        </h2>

        {access === 'checking' && (
          <p className="dd-dialog-body" role="status">
            {t('archive.journalChecking')}
          </p>
        )}

        {access === 'unknown' && (
          <>
            <p className="dd-dialog-body" role="alert">
              {t('archive.journalErrGeneric')}
            </p>
            <div className="dd-dialog-actions">
              <button type="button" className="btn btn-secondary dd-dialog-btn" onClick={onClose}>
                {t('archive.journalClose')}
              </button>
              <button ref={primaryRef} type="button" className="btn btn-primary dd-dialog-btn" onClick={() => {
                  setAccess('checking');
                  setAttempt((n) => n + 1);
                }}>
                {t('archive.loadRetry')}
              </button>
            </div>
          </>
        )}

        {access === 'locked' && (
          <>
            <p className="dd-dialog-body">{t('archive.journalLockedBody')}</p>
            <div className="dd-dialog-actions">
              <button type="button" className="btn btn-secondary dd-dialog-btn" onClick={onClose}>
                {t('archive.journalClose')}
              </button>
              <button
                ref={primaryRef}
                type="button"
                className="btn btn-primary dd-dialog-btn"
                onClick={() => {
                  onClose();
                  onGoToPackages();
                }}
              >
                {t('archive.journalSeePackages')}
              </button>
            </div>
          </>
        )}

        {access === 'entitled' && (
          <>
            <p className="dd-dialog-body">{t('archive.journalIntro')}</p>

            <fieldset className="jr-choice" disabled={busy}>
              <label className={`jr-radio${tooMany ? ' is-disabled' : ''}`}>
                <input type="radio" name="jr-mode" checked={effectiveMode === 'all'} disabled={tooMany} onChange={() => setMode('all')} />
                <span>{t('archive.journalAll').replace('{n}', String(dreams.length))}</span>
              </label>
              <label className="jr-radio">
                <input type="radio" name="jr-mode" checked={effectiveMode === 'choose'} onChange={() => setMode('choose')} />
                <span>{t('archive.journalChoose')}</span>
              </label>
            </fieldset>
            {tooMany && <p className="jr-note">{t('archive.journalTooMany').split('{max}').join(String(JOURNAL_MAX_DREAMS))}</p>}

            {effectiveMode === 'choose' && (
              <div className="jr-picker">
                <div className="jr-picker-bar">
                  <span className="jr-count">{t('archive.journalSelectedCount').replace('{n}', String(chosenCount))}</span>
                  <span className="jr-picker-actions">
                    <button type="button" className="jr-link" disabled={busy} onClick={() => setPicked(new Set(dreams.slice(0, JOURNAL_MAX_DREAMS).map((d) => d.id)))}>
                      {t('archive.journalSelectAll')}
                    </button>
                    <button type="button" className="jr-link" disabled={busy} onClick={() => setPicked(new Set())}>
                      {t('archive.journalClear')}
                    </button>
                  </span>
                </div>
                <ul className="jr-list">
                  {dreams.map((d) => (
                    <li key={d.id}>
                      <label className="jr-item">
                        <input type="checkbox" checked={picked.has(d.id)} disabled={busy || (!picked.has(d.id) && chosenCount >= JOURNAL_MAX_DREAMS)} onChange={() => toggle(d.id)} />
                        <span className="jr-item-title" dir="auto">
                          {d.title}
                        </span>
                        <span className="jr-item-date">{formatDate(d.date)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {error && (
              <p className="dd-dialog-error" role="alert">
                {t(errorKey[error])}
              </p>
            )}

            <div className="dd-dialog-actions">
              <button type="button" className="btn btn-secondary dd-dialog-btn" aria-disabled={busy} onClick={() => !busy && onClose()}>
                {t('archive.journalClose')}
              </button>
              <button ref={primaryRef} type="button" className={`btn btn-primary dd-dialog-btn${busy ? ' is-loading' : ''}`} disabled={!canExport} onClick={runExport}>
                {busy && <span className="btn-spinner" aria-hidden="true" />}
                {busy ? t('archive.journalPreparing') : t('archive.journalExportBtn')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
