import { getSupabaseServiceClient } from '../supabaseServiceClient.js';
import { PAID_PACKAGE_IDS, type PaidPackageId } from './checkoutPackages.js';

/**
 * Which package an account most recently PURCHASED — read-only, from the one durable record of a purchase:
 * the newest `payment_orders` row of that account with status 'granted' (that status is set only by complete_payment_order,
 * in the same transaction that grants the credits). It is never derived from the credit balance, which falls as dreams are used.
 *
 *   PaidPackageId  the account's latest completed purchase
 *   null           no completed purchase: a free account
 *   undefined      could not be determined (not configured / database error): the caller must not guess
 */
export type PurchasedPackage = PaidPackageId | null | undefined;

export function toPurchasedPackage(packageId: unknown): PurchasedPackage {
  return typeof packageId === 'string' && (PAID_PACKAGE_IDS as readonly string[]).includes(packageId) ? (packageId as PaidPackageId) : undefined;
}

export async function getPurchasedPackage(ownerId: string): Promise<PurchasedPackage> {
  const client = getSupabaseServiceClient();
  if (!client) return undefined;
  const { data, error } = await client
    .from('payment_orders')
    .select('package_id')
    .eq('owner_id', ownerId)
    .eq('status', 'granted')
    .order('granted_at', { ascending: false })
    .limit(1);
  if (error || !Array.isArray(data)) return undefined;
  if (data.length === 0) return null;
  return toPurchasedPackage((data[0] as { package_id?: unknown }).package_id);
}
