import { getSupabaseServiceClient } from './supabaseServiceClient.js';
import type { PackageId } from '../src/pricing/packages.js';

/**
 * Durable account entitlements (see supabase/migrations/20261006_account_entitlements.sql).
 *
 * An entitlement is a permanent fact about an account ("bought DIVE IN"), deliberately NOT derived
 * from the credit balance, the number of archived dreams or usage: it must stay true after all 25 DIVE IN
 * credits are spent, and it covers every dream in the archive, including ones made before the purchase.
 */
export const DREAM_JOURNAL_EXPORT = 'dream_journal_export' as const;
export type Entitlement = typeof DREAM_JOURNAL_EXPORT;

/**
 * What each package grants besides its credits. This is the single place a future payment webhook reads to
 * decide which entitlements a verified purchase unlocks; GO DEEPER and EXPLORE include none.
 * (Grow itself is not implemented: nothing calls grant_entitlement yet.)
 */
export const PACKAGE_ENTITLEMENTS: Record<PackageId, readonly Entitlement[]> = {
  first_dream: [],
  go_deeper_3: [],
  explore_10: [],
  dive_in_25: [DREAM_JOURNAL_EXPORT],
};

export function entitlementsForPackage(id: PackageId): readonly Entitlement[] {
  return PACKAGE_ENTITLEMENTS[id] ?? [];
}

/** true / false, or null when it could not be determined (callers fail closed). The owner is always the verified token's user. */
export async function hasEntitlement(userId: string, entitlement: Entitlement): Promise<boolean | null> {
  const client = getSupabaseServiceClient();
  if (!client) return null;
  const { data, error } = await client.rpc('has_entitlement', { p_owner: userId, p_entitlement: entitlement });
  return error || typeof data !== 'boolean' ? null : data;
}
