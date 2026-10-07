import { getSupabaseServiceClient } from '../supabaseServiceClient.js';
import type { CompletionRequest } from './completionRequest.js';

/** Outcomes of public.complete_payment_order (see the migration for what each means). None of them closes an order. */
export const COMPLETION_STATUSES = [
  'granted',
  'duplicate',
  'order_not_found',
  'transaction_used_by_other_order',
  'order_already_completed',
  'amount_mismatch',
  'currency_mismatch',
  'owner_gone',
  'invalid',
] as const;
export type CompletionStatus = (typeof COMPLETION_STATUSES)[number];

/** `null` = the database could not be reached or is not configured (the caller answers 503 so Make can retry). */
export async function completePaymentOrder(request: CompletionRequest): Promise<CompletionStatus | null> {
  const client = getSupabaseServiceClient();
  if (!client) return null;
  const { data, error } = await client.rpc('complete_payment_order', {
    p_order: request.orderId,
    p_tx: request.transactionId,
    p_amount: request.amount,
    p_currency: request.currency,
    p_provider_status: request.providerStatus,
  });
  if (error || !data || typeof data !== 'object') return null;
  const status = (data as { status?: unknown }).status;
  return (COMPLETION_STATUSES as readonly unknown[]).includes(status) ? (status as CompletionStatus) : null;
}

/** Remembers the last NON-PAID status text seen for an order. Best effort: it changes no status and grants nothing. */
export async function recordPaymentNotice(orderId: string, providerStatus: string): Promise<void> {
  const client = getSupabaseServiceClient();
  if (!client) return;
  await client.rpc('record_payment_notice', { p_order: orderId, p_provider_status: providerStatus });
}
