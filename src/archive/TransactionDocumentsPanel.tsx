import { useEffect, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { fetchPaidOrders } from '../credits/paidOrdersApi';
import { buildTransactionDocument, orderReference, transactionDocumentMailto, type DocumentLanguage, type DocumentOrder } from '../payments/transactionDocument';
import './TransactionDocumentsPanel.css';

/**
 * "Purchase documents" — the administrator's list of completed purchases in Settings, so the transaction-details document can be sent by hand
 * to the account's email (together with the tax invoice / receipt issued in Morning). Rendered only for the verified administrator; the server
 * and the database decide again on every read, and the list holds no customer name or phone (those exist only at Grow).
 */
export function TransactionDocumentsPanel() {
  const { t, language } = useLanguage();
  const [orders, setOrders] = useState<DocumentOrder[] | null | 'loading'>('loading');
  const [docLanguage, setDocLanguage] = useState<DocumentLanguage>(language === 'he' ? 'he' : 'en');
  const [copied, setCopied] = useState<{ id: string; ok: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPaidOrders().then((list) => {
      if (!cancelled) setOrders(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const copy = async (order: DocumentOrder) => {
    const { subject, body } = buildTransactionDocument(order, docLanguage);
    const text = `${subject}\n\n${body}`;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = false;
    }
    setCopied({ id: order.orderId, ok });
  };

  const formatDate = (iso: string | null) => {
    const d = iso ? new Date(iso) : null;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(language === 'he' ? 'he-IL' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Jerusalem' }) : '—';
  };

  return (
    <section className="td-panel" aria-labelledby="td-title">
      <h2 id="td-title" className="td-title">
        {t('archive.purchasesTitle')}
      </h2>
      <p className="td-intro">{t('archive.purchasesIntro')}</p>

      <div className="td-lang" role="group" aria-label={t('archive.purchasesLanguage')}>
        <span className="td-lang-label">{t('archive.purchasesLanguage')}:</span>
        <button type="button" className={`td-btn${docLanguage === 'he' ? ' td-btn--on' : ''}`} aria-pressed={docLanguage === 'he'} onClick={() => setDocLanguage('he')}>
          עברית
        </button>
        <button type="button" className={`td-btn${docLanguage === 'en' ? ' td-btn--on' : ''}`} aria-pressed={docLanguage === 'en'} onClick={() => setDocLanguage('en')}>
          English
        </button>
      </div>

      {orders === 'loading' ? (
        <p className="td-muted">{t('archive.purchasesLoading')}</p>
      ) : orders === null ? (
        <p className="td-muted" role="alert">
          {t('archive.purchasesError')}
        </p>
      ) : orders.length === 0 ? (
        <p className="td-muted">{t('archive.purchasesEmpty')}</p>
      ) : (
        <ul className="td-list">
          {orders.map((order) => {
            const mailto = transactionDocumentMailto(order, docLanguage);
            return (
              <li key={order.orderId} className="td-item">
                <div className="td-item-main">
                  <span className="td-item-line">
                    {t('archive.purchasesRef')}: <bdi dir="ltr">{orderReference(order.orderId)}</bdi> · {formatDate(order.paidAt)}
                  </span>
                  <span className="td-item-line">
                    <bdi dir="ltr">₪{order.amountIls}</bdi> · {order.credits} {t('archive.purchasesCredits')}
                  </span>
                  <span className="td-item-email">
                    {order.accountEmail ? (
                      <bdi dir="ltr">{order.accountEmail}</bdi>
                    ) : (
                      t('archive.purchasesNoAccount')
                    )}
                  </span>
                </div>
                <div className="td-item-actions">
                  <button type="button" className="td-btn" onClick={() => void copy(order)}>
                    {t('archive.purchasesCopy')}
                  </button>
                  {mailto && (
                    <a className="td-btn td-btn--link" href={mailto}>
                      {t('archive.purchasesMail')}
                    </a>
                  )}
                  {copied?.id === order.orderId && (
                    <span className="td-copied" role="status">
                      {copied.ok ? t('archive.purchasesCopied') : t('archive.purchasesCopyFailed')}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
