import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { fetchOrderState } from './checkout';
import '../archive/DeleteDreamDialog.css';
import './CheckoutDialog.css';

interface PaymentReturnNoticeProps {
  /** The order id from ?payment=. NOT proof of anything: it is only a lookup key the server checks against the signed-in account. */
  orderId: string;
  signedIn: boolean;
  authLoading: boolean;
  onSignIn: () => void;
  onStartDreaming: () => void;
  onClose: () => void;
}

type View = 'confirming' | 'confirmed' | 'unknown';

const FAST_POLL_MS = 3_000;
const SLOW_AFTER_MS = 90_000;
const SLOW_POLL_MS = 10_000;
const GIVE_UP_AFTER_MS = 15 * 60_000;

/**
 * Shown when the customer lands back from the Grow payment page. It never decides that a payment happened: it only asks the server
 * how THIS account's order is doing (the server answers from its own record, written by the authenticated completion callback).
 * Refreshing, going back or closing this notice changes nothing about the payment or the credits.
 */
export default function PaymentReturnNotice({ orderId, signedIn, authLoading, onSignIn, onStartDreaming, onClose }: PaymentReturnNoticeProps) {
  const { t } = useLanguage();
  const titleId = useId();
  const [view, setView] = useState<View>('confirming');
  const [slow, setSlow] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const poll = async () => {
      const state = await fetchOrderState(orderId);
      if (cancelled) return;
      const elapsed = Date.now() - started;
      if (state === 'confirmed' || state === 'unknown') {
        setView(state);
        return;
      }
      setCheckFailed(state === null);
      if (elapsed > SLOW_AFTER_MS) setSlow(true);
      if (elapsed > GIVE_UP_AFTER_MS) return;
      timer = setTimeout(poll, elapsed > SLOW_AFTER_MS ? SLOW_POLL_MS : FAST_POLL_MS);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId, signedIn]);

  const reference = orderId.slice(0, 8).toUpperCase();

  return createPortal(
    <div className="dd-dialog-backdrop">
      <div className="dd-dialog co-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-live="polite">
        <h2 id={titleId} className="dd-dialog-title">
          {t('pricing.paymentReturn.title')}
        </h2>

        {!signedIn && !authLoading && (
          <>
            <p className="dd-dialog-body">{t('pricing.paymentReturn.signIn')}</p>
            <div className="dd-dialog-actions">
              <button type="button" className="btn btn-secondary dd-dialog-btn" onClick={onClose}>
                {t('pricing.paymentReturn.close')}
              </button>
              <button type="button" className="btn btn-primary dd-dialog-btn" onClick={onSignIn}>
                {t('pricing.paymentReturn.signInButton')}
              </button>
            </div>
          </>
        )}

        {(signedIn || authLoading) && view === 'confirming' && (
          <>
            <p className="dd-dialog-body">{slow ? t('pricing.paymentReturn.slow') : t('pricing.paymentReturn.confirming')}</p>
            {!slow && <p className="co-return-note">{t('pricing.paymentReturn.confirmingNote')}</p>}
            {checkFailed && <p className="co-return-note">{t('pricing.paymentReturn.checkFailed')}</p>}
            {slow && (
              <p className="co-return-note">
                {t('pricing.paymentReturn.reference')} <span className="co-return-ref">{reference}</span>
              </p>
            )}
            <div className="dd-dialog-actions">
              <button type="button" className="btn btn-secondary dd-dialog-btn" onClick={onClose}>
                {t('pricing.paymentReturn.close')}
              </button>
            </div>
          </>
        )}

        {signedIn && view === 'confirmed' && (
          <>
            <p className="dd-dialog-body">{t('pricing.paymentReturn.confirmed')}</p>
            <div className="dd-dialog-actions">
              <button type="button" className="btn btn-primary dd-dialog-btn" onClick={onStartDreaming}>
                {t('pricing.paymentReturn.startDreaming')}
              </button>
            </div>
          </>
        )}

        {signedIn && view === 'unknown' && (
          <>
            <p className="dd-dialog-body">{t('pricing.paymentReturn.unknown')}</p>
            <p className="co-return-note">
              {t('pricing.paymentReturn.reference')} <span className="co-return-ref">{reference}</span>
            </p>
            <div className="dd-dialog-actions">
              <button type="button" className="btn btn-secondary dd-dialog-btn" onClick={onClose}>
                {t('pricing.paymentReturn.close')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
