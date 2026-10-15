import { getSupabaseServiceClient } from './supabaseServiceClient.js';

/**
 * The administrator's list of completed purchases (see supabase/migrations/20261016_admin_paid_orders.sql). The actor is ALWAYS the verified
 * account id the server derived from the bearer token, and the database re-checks that the actor is the admin. null = could not be
 * determined (callers fail closed).
 */

export interface PaidOrderItem {
  orderId: string;
  /** null = the account no longer exists (it was deleted). */
  accountEmail: string | null;
  packageId: 'go_deeper_3' | 'explore_10' | 'dive_in_25';
  credits: number;
  amountIls: number;
  paidAt: string | null;
}

export type PaidOrdersOutcome = { status: 'ok'; items: PaidOrderItem[] } | { status: 'not_authorized' };

const PACKAGES = ['go_deeper_3', 'explore_10', 'dive_in_25'] as const;
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function parsePaidOrders(data: unknown): PaidOrdersOutcome | null {
  if (!isRecord(data) || typeof data.status !== 'string') return null;
  if (data.status === 'not_authorized') return { status: 'not_authorized' };
  if (data.status !== 'ok' || !Array.isArray(data.items)) return null;
  const items: PaidOrderItem[] = [];
  for (const raw of data.items) {
    if (!isRecord(raw)) return null;
    const { order_id, account_email, package_id, credits, amount_ils, paid_at } = raw;
    if (typeof order_id !== 'string' || !/^[0-9a-f]{8,64}$/i.test(order_id)) return null;
    if (account_email !== null && typeof account_email !== 'string') return null;
    if (typeof package_id !== 'string' || !(PACKAGES as readonly string[]).includes(package_id)) return null;
    if (typeof credits !== 'number' || typeof amount_ils !== 'number') return null;
    if (paid_at !== null && typeof paid_at !== 'string') return null;
    items.push({ orderId: order_id, accountEmail: account_email, packageId: package_id as PaidOrderItem['packageId'], credits, amountIls: amount_ils, paidAt: paid_at });
  }
  return { status: 'ok', items };
}

export async function listPaidOrders(actorId: string, limit = 50): Promise<PaidOrdersOutcome | null> {
  const client = getSupabaseServiceClient();
  if (!client) return null;
  const { data, error } = await client.rpc('admin_list_paid_orders', { p_actor: actorId, p_limit: limit });
  return error ? null : parsePaidOrders(data);
}
