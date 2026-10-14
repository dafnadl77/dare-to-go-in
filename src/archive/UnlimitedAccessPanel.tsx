import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { fetchUnlimitedList, grantUnlimited, revokeUnlimited, type UnlimitedAccessItem } from '../credits/unlimitedAccessApi';
import './UnlimitedAccessPanel.css';

type Notice = { tone: 'ok' | 'error'; key: string; email?: string } | null;

/**
 * "Unlimited access" — the administrator's area in Settings. It is only rendered when the server says the verified account is the
 * administrator; the server and the database decide again on every call, so this component grants nothing by being visible.
 */
export function UnlimitedAccessPanel() {
  const { t, language } = useLanguage();
  const [items, setItems] = useState<UnlimitedAccessItem[] | null | 'loading'>('loading');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setItems(await fetchUnlimitedList());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchUnlimitedList().then((list) => {
      if (!cancelled) setItems(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value || busy) return;
    setBusy(true);
    setNotice(null);
    const result = await grantUnlimited(value);
    setBusy(false);
    switch (result.kind) {
      case 'granted':
        setNotice({ tone: 'ok', key: 'archive.unlimitedGranted', email: result.item.email });
        setEmail('');
        await reload();
        return;
      case 'already_granted':
        setNotice({ tone: 'ok', key: 'archive.unlimitedAlready', email: result.item.email });
        setEmail('');
        await reload();
        return;
      case 'already_unlimited':
        setNotice({ tone: 'ok', key: 'archive.unlimitedOwnerAccount', email: result.item.email });
        setEmail('');
        return;
      case 'not_registered':
        setNotice({ tone: 'error', key: 'archive.unlimitedNotRegistered' });
        return;
      case 'invalid_email':
        setNotice({ tone: 'error', key: 'archive.unlimitedInvalid' });
        return;
      case 'forbidden':
        setNotice({ tone: 'error', key: 'archive.unlimitedForbidden' });
        return;
      default:
        setNotice({ tone: 'error', key: 'archive.unlimitedError' });
    }
  };

  const revoke = async (item: UnlimitedAccessItem) => {
    setBusy(true);
    setNotice(null);
    const result = await revokeUnlimited(item.userId);
    setBusy(false);
    setConfirming(null);
    if (result.kind === 'revoked') setNotice({ tone: 'ok', key: 'archive.unlimitedRevoked', email: item.email });
    else if (result.kind === 'not_found') setNotice({ tone: 'ok', key: 'archive.unlimitedRevokeMissing' });
    else setNotice({ tone: 'error', key: result.kind === 'forbidden' ? 'archive.unlimitedForbidden' : 'archive.unlimitedError' });
    await reload();
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(language === 'he' ? 'he-IL' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <section className="ua-panel" aria-labelledby="ua-title">
      <h2 id="ua-title" className="ua-title">
        {t('archive.unlimitedTitle')}
      </h2>
      <p className="ua-intro">{t('archive.unlimitedIntro')}</p>

      <form className="ua-form" onSubmit={submit}>
        <label className="ua-label" htmlFor="ua-email">
          {t('archive.unlimitedEmailLabel')}
        </label>
        <div className="ua-form-row">
          <input
            id="ua-email"
            className="ua-input"
            type="email"
            dir="ltr"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            value={email}
            placeholder={t('archive.unlimitedEmailPlaceholder')}
            onChange={(e) => {
              setEmail(e.target.value);
              setNotice(null);
            }}
            disabled={busy}
          />
          <button type="submit" className="ua-btn ua-btn--primary" disabled={busy || email.trim() === ''}>
            {busy ? t('archive.unlimitedGranting') : t('archive.unlimitedGrantButton')}
          </button>
        </div>
      </form>

      {notice && (
        <p className={`ua-notice ua-notice--${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {t(notice.key as never)}
          {notice.email && (
            <>
              {' '}
              <bdi dir="ltr">{notice.email}</bdi>
            </>
          )}
        </p>
      )}

      <h3 className="ua-list-title">{t('archive.unlimitedListTitle')}</h3>
      {items === 'loading' ? (
        <p className="ua-muted">{t('archive.unlimitedListLoading')}</p>
      ) : items === null ? (
        <p className="ua-muted" role="alert">
          {t('archive.unlimitedListError')}
        </p>
      ) : items.length === 0 ? (
        <p className="ua-muted">{t('archive.unlimitedListEmpty')}</p>
      ) : (
        <ul className="ua-list">
          {items.map((item) => (
            <li key={item.userId} className="ua-item">
              <div className="ua-item-main">
                <bdi className="ua-item-email" dir="ltr">
                  {item.email}
                </bdi>
                <span className="ua-item-date">
                  {t('archive.unlimitedColDate')}: {formatDate(item.grantedAt)}
                </span>
              </div>
              {confirming === item.userId ? (
                <div className="ua-item-confirm">
                  <span className="ua-muted">{t('archive.unlimitedRevokeNote')}</span>
                  <button type="button" className="ua-btn ua-btn--danger" disabled={busy} onClick={() => void revoke(item)}>
                    {t('archive.unlimitedRevokeConfirm')}
                  </button>
                  <button type="button" className="ua-btn" disabled={busy} onClick={() => setConfirming(null)}>
                    {t('archive.unlimitedRevokeKeep')}
                  </button>
                </div>
              ) : (
                <button type="button" className="ua-btn" disabled={busy} onClick={() => setConfirming(item.userId)}>
                  {t('archive.unlimitedRevoke')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
