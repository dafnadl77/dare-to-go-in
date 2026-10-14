import { useEffect, useState } from 'react';
import type { PackageId } from '../pricing/packages';
import { fetchCreditSummary } from './credits';

export type AccountPlanState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'owner'; /** The verified administrator: the unlimited-access area is shown. */ admin?: true }
  | { status: 'ready'; plan: PackageId; /** More than one purchase: the package shown is only the latest one. */ several: boolean; /** The account's free dream: 'available' or 'used' (absent = not known). */ freeDream?: 'available' | 'used' };

/** The package the signed-in account holds (see CreditSummary.plan), fetched once when the screen mounts for that account. */
export function useAccountPlan(userId: string | undefined): AccountPlanState {
  const [state, setState] = useState<{ forUser: string; value: AccountPlanState } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchCreditSummary().then((summary) => {
      if (cancelled) return;
      setState({ forUser: userId, value: summary?.owner ? { status: 'owner', ...(summary.admin ? { admin: true as const } : {}) } : summary?.plan ? { status: 'ready', plan: summary.plan, several: (summary.grantCount ?? 0) > 1, ...(summary.freeDream ? { freeDream: summary.freeDream } : {}) } : { status: 'unavailable' } });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!userId || !state || state.forUser !== userId) return { status: 'loading' };
  return state.value;
}
