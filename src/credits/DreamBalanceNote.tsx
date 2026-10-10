import { useLanguage } from '../i18n/LanguageContext';
import { balanceMessageKey, describeBalance } from './dreamBalance';
import type { DreamBalanceState } from './useDreamBalance';
import './DreamBalanceNote.css';

interface DreamBalanceNoteProps {
  state: DreamBalanceState;
  retry: () => void;
  /** Opens the packages screen (offered when nothing is left). */
  onGetPackage?: () => void;
  /** 'archive' words the line generally; 'pricing' words a held package as "Your package — N dreams left". */
  variant: 'archive' | 'pricing';
  /** Pricing already says the free dream was used (it sent the dreamer there): do not repeat it. */
  hideFree?: boolean;
}

/**
 * The line that tells the dreamer how many dreams they have left, from the server's answer only. While the answer has not
 * arrived it says it is checking (never a zero); if it could not be loaded it says so and offers a retry (never an invented number).
 */
export default function DreamBalanceNote({ state, retry, onGetPackage, variant, hideFree = false }: DreamBalanceNoteProps) {
  const { t } = useLanguage();

  if (state.status === 'loading') {
    return (
      <p className="dream-balance dream-balance--quiet" role="status">
        {t('archive.balanceLoading')}
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <p className="dream-balance dream-balance--quiet" role="status">
        {t('archive.balanceError')}{' '}
        <button type="button" className="dream-balance-action" data-cursor-hover onClick={retry}>
          {t('archive.balanceRetry')}
        </button>
      </p>
    );
  }

  const view = describeBalance(state.summary);
  // The owner is told on the packages screen by its own notice.
  if (variant === 'pricing' && view.kind === 'owner') return null;
  if (variant === 'pricing' && hideFree && (view.kind === 'free-used' || view.kind === 'free-none')) return null;
  const key = balanceMessageKey(view, variant);
  if (!key) return null;
  const text = t(key).replace('{remaining}', String(view.remaining)).replace('{total}', String(view.total ?? ''));
  const offersPackage = view.kind === 'none-purchased' || view.kind === 'free-used' || view.kind === 'free-none';

  return (
    <p className="dream-balance" role="status" data-kind={view.kind}>
      <span className="dream-balance-text">{text}</span>
      {offersPackage && onGetPackage && (
        <>
          {' '}
          <button type="button" className="dream-balance-action" data-cursor-hover onClick={onGetPackage}>
            {t('archive.balanceBuyMore')}
          </button>
        </>
      )}
    </p>
  );
}
