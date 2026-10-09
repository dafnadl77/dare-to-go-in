import { useEffect, useState } from 'react';
import type { PackageId } from '../pricing/packages';
import { fetchCreditSummary } from './credits';

export type AccountPlanState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'owner' }
  | { status: 'ready'; plan: PackageId };

/** The package the signed-in account holds (see CreditSummary.plan), fetched once when the screen mounts for that account. */
export function useAccountPlan(userId: string | undefined): AccountPlanState {
  const [state, setState] = useState<{ forUser: string; value: AccountPlanState } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchCreditSummary().then((summary) => {
      if (cancelled) return;
      setState({ forUser: userId, value: summary?.owner ? { status: 'owner' } : summary?.plan ? { status: 'ready', plan: summary.plan } : { status: 'unavailable' } });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!userId || !state || state.forUser !== userId) return { status: 'loading' };
  return state.value;
}
