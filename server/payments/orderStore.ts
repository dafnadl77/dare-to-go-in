import { getSupabaseServiceClient } from '../supabaseServiceClient.js';
import type { PaidPackage } from './checkoutPackages.js';

/** Service-role-only access to public.payment_orders (RLS on, no policies, no client grants): see the migration. */

export type CreateOrderOutcome = { status: 'created'; orderId: string } | { status: 'rate_limited' };

/** `null` = the database could not be reached / is not configured. */
export async function createPaymentOrder(ownerId: string, pkg: PaidPackage): Promise<CreateOrderOutcome | null> {
  const client = getSupabaseServiceClient();
  if (!client) return null;
  const { data, error } = await client.rpc('create_payment_order', {
    p_owner: ownerId,
    p_package: pkg.id,
    p_amount: pkg.amountIls,
    p_credits: pkg.credits,
  });
  if (error || !data || typeof data !== 'object') return null;
  const result = data as { status?: unknown; order_id?: unknown };
  if (result.status === 'rate_limited') return { status: 'rate_limited' };
  if (result.status === 'created' && typeof result.order_id === 'string' && /^[0-9a-f]{32}$/.test(result.order_id)) return { status: 'created', orderId: result.order_id };
  return null;
}

export async function markPaymentOrderLink(orderId: string, ownerId: string, status: 'link_created' | 'link_failed'): Promise<boolean> {
  const client = getSupabaseServiceClient();
  if (!client) return false;
  const { data, error } = await client.rpc('set_payment_order_link_status', { p_order: orderId, p_owner: ownerId, p_status: status });
  return !error && data === true;
}
