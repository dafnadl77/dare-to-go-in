import { useCallback, useEffect, useState } from 'react';
import type { CreditSummary } from './creditSummary';
import { fetchCreditSummary } from './credits';

/** The signed-in account's dream balance, as the SERVER reports it (GET /api/credits). Never a number before it has arrived. */
export type DreamBalanceState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; summary: CreditSummary };

/**
 * Fetches the balance when the screen mounts for that account, and again whenever the page becomes visible (a purchase made
 * in another tab, a dream finished elsewhere), so the figure is never left stale. A failed request is an error state with a
 * retry — the screen shows that, not a made-up number. `retry` asks again.
 */
export function useDreamBalance(userId: string | undefined): { state: DreamBalanceState; retry: () => void } {
  const [result, setResult] = useState<{ forUser: string; state: DreamBalanceState } | null>(null);
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = () => {
      fetchCreditSummary().then((summary) => {
        if (cancelled) return;
        setResult({ forUser: userId, state: summary ? { status: 'ready', summary } : { status: 'error' } });
      });
    };
    load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, tick]);

  if (!userId || !result || result.forUser !== userId) return { state: { status: 'loading' }, retry };
  return { state: result.state, retry };
}
