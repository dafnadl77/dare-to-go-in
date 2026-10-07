import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { normalizeFullName, normalizeIsraeliMobile } from './payerDetails';
import { startCheckout, type CheckoutError, type PaidPackageId } from './checkout';
import '../archive/DeleteDreamDialog.css';
import './CheckoutDialog.css';

interface CheckoutDialogProps {
  packageId: PaidPackageId;
  /** Already-translated pieces of the summary line (the Pricing card's own wording). */
  packageName: string;
  dreamsLabel: string;
  priceLabel: string;
  onClose: () => void;
  onOpenPrivacy: () => void;
}

const ERROR_KEY: Record<Exclude<CheckoutError, 'invalid_name' | 'invalid_phone'>, string> = {
  not_authenticated: 'pricing.checkout.errSession',
  rate_limited: 'pricing.checkout.errRate',
  unavailable: 'pricing.checkout.errUnavailable',
};

/**
 * Opens only AFTER the signed-in customer chose a package, and collects the minimum Grow needs for a payment page: full name and
 * Israeli mobile number. They live in this component's state only for as long as the dialog is open (no storage, no URL, no
 * cookie), are validated here for instant feedback and again by the server, and travel only in the one POST that starts
 * the checkout. Success sends the browser to the Grow link the server validated; nothing is credited here.
 */
export default function CheckoutDialog({ packageId, packageName, dreamsLabel, priceLabel, onClose, onOpenPrivacy }: CheckoutDialogProps) {
  const { t } = useLanguage();
  const titleId = useId();
  const nameErrorId = useId();
  const phoneErrorId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const pendingFocusRef = useRef<RefObject<HTMLInputElement | null> | null>(null);
  const onCloseRef = useRef(onClose);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [phase, setPhase] = useState<'idle' | 'submitting' | 'redirecting'>('idle');
  const [nameInvalid, setNameInvalid] = useState(false);
  const [phoneInvalid, setPhoneInvalid] = useState(false);
  const [error, setError] = useState<Exclude<CheckoutError, 'invalid_name' | 'invalid_phone'> | null>(null);
  const locked = phase !== 'idle';

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // After a failed attempt the form unlocks; only then can the field the server complained about take focus.
  useEffect(() => {
    if (phase !== 'idle' || !pendingFocusRef.current) return;
    pendingFocusRef.current.current?.focus();
    pendingFocusRef.current = null;
  }, [phase]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    nameRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        if (!submittingRef.current) onCloseRef.current();
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
    // Coming BACK from the payment page (browser back / bfcache) must not leave the form frozen on "taking you to...".
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        submittingRef.current = false;
        setPhase('idle');
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pageshow', onPageShow);
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return; // one request at a time: a double click or a second Enter does nothing
    const nameBad = normalizeFullName(fullName) === null;
    const phoneBad = normalizeIsraeliMobile(phone) === null;
    setNameInvalid(nameBad);
    setPhoneInvalid(phoneBad);
    setError(null);
    if (nameBad || phoneBad) {
      (nameBad ? nameRef : phoneRef).current?.focus();
      return;
    }
    submittingRef.current = true;
    setPhase('submitting');
    const result = await startCheckout(packageId, fullName.trim(), phone.trim());
    if (result.ok) {
      setPhase('redirecting'); // stays locked: the browser is leaving for the Grow page
      window.location.assign(result.paymentUrl);
      return;
    }
    submittingRef.current = false;
    setPhase('idle');
    // The inputs are enabled again only after this render: the effect below moves focus then.
    if (result.reason === 'invalid_name') {
      setNameInvalid(true);
      pendingFocusRef.current = nameRef;
    } else if (result.reason === 'invalid_phone') {
      setPhoneInvalid(true);
      pendingFocusRef.current = phoneRef;
    } else {
      setError(result.reason);
    }
  };

  return createPortal(
    <div
      className="dd-dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submittingRef.current) onClose();
      }}
    >
      <div ref={panelRef} className="dd-dialog co-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={locked}>
        <h2 id={titleId} className="dd-dialog-title">
          {t('pricing.checkout.title')}
        </h2>
        <p className="co-summary">
          <strong>{packageName}</strong>
          <span className="co-summary-sep" aria-hidden="true">
            ·
          </span>
          <span>{dreamsLabel}</span>
          <span className="co-summary-sep" aria-hidden="true">
            ·
          </span>
          <span dir="ltr">{priceLabel}</span>
        </p>
        <p className="dd-dialog-body">{t('pricing.checkout.intro')}</p>

        <form className="co-form" onSubmit={submit} noValidate>
          <label className="co-field">
            <span className="co-label">{t('pricing.checkout.fullName')}</span>
            <input
              ref={nameRef}
              className="dd-dialog-input"
              type="text"
              name="name"
              autoComplete="name"
              dir="auto"
              maxLength={100}
              value={fullName}
              disabled={locked}
              aria-invalid={nameInvalid}
              aria-describedby={nameInvalid ? nameErrorId : undefined}
              onChange={(e) => {
                setFullName(e.target.value);
                setNameInvalid(false);
              }}
            />
            {nameInvalid ? (
              <span id={nameErrorId} className="co-error" role="alert">
                {t('pricing.checkout.errName')}
              </span>
            ) : (
              <span className="co-hint">{t('pricing.checkout.fullNameHint')}</span>
            )}
          </label>

          <label className="co-field">
            <span className="co-label">{t('pricing.checkout.phone')}</span>
            <input
              ref={phoneRef}
              className="dd-dialog-input co-phone"
              type="tel"
              name="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              maxLength={30}
              value={phone}
              disabled={locked}
              aria-invalid={phoneInvalid}
              aria-describedby={phoneInvalid ? phoneErrorId : undefined}
              onChange={(e) => {
                setPhone(e.target.value);
                setPhoneInvalid(false);
              }}
            />
            {phoneInvalid ? (
              <span id={phoneErrorId} className="co-error" role="alert">
                {t('pricing.checkout.errPhone')}
              </span>
            ) : (
              <span className="co-hint">{t('pricing.checkout.phoneHint')}</span>
            )}
          </label>

          <p className="co-privacy">
            {t('pricing.checkout.privacy')}{' '}
            <button type="button" className="co-link" disabled={locked} onClick={onOpenPrivacy}>
              {t('pricing.checkout.privacyLink')}
            </button>
          </p>

          {error && (
            <p className="dd-dialog-error" role="alert">
              {t(ERROR_KEY[error])}
            </p>
          )}

          <div className="dd-dialog-actions">
            <button type="button" className="btn btn-secondary dd-dialog-btn" aria-disabled={locked} onClick={() => !locked && onClose()}>
              {t('pricing.checkout.cancel')}
            </button>
            <button type="submit" className={`btn btn-primary dd-dialog-btn${locked ? ' is-loading' : ''}`} disabled={locked}>
              {locked && <span className="btn-spinner" aria-hidden="true" />}
              {phase === 'redirecting' ? t('pricing.checkout.redirecting') : phase === 'submitting' ? t('pricing.checkout.preparing') : t('pricing.checkout.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
