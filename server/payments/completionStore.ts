import { getSupabaseServiceClient } from '../supabaseServiceClient.js';
import type { CompletionRequest } from './completionRequest.js';
import { growLinkConfig, linkTokenHash } from './growLinkHash.js';

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

/** What complete_payment_order_with_link adds: the link refusals (20261125_complete_payment_order_with_link.sql). */
export const LINKED_COMPLETION_STATUSES = [...COMPLETION_STATUSES, 'link_required', 'link_missing', 'link_mismatch'] as const;
export type LinkedCompletionStatus = (typeof LINKED_COMPLETION_STATUSES)[number];

/**
 * GROW_LEGACY_ORDERS_BEFORE: an ISO-8601 instant. Unset = link enforcement is off (today's behaviour). Set = an order created at or
 * after it must carry a bound payment link to complete; an earlier order without a link is "legacy" and completes as before.
 * `undefined` = unset, `null` = set but not a valid instant (fail closed: nothing completes through the linked path).
 */
export function legacyOrdersBefore(env: NodeJS.ProcessEnv = process.env): Date | null | undefined {
  const raw = (env.GROW_LEGACY_ORDERS_BEFORE ?? '').trim();
  if (!raw) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(raw)) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type CompletionCall =
  | { rpc: 'complete_payment_order'; args: { p_order: string; p_tx: string; p_amount: number; p_currency: string; p_provider_status: string } }
  | {
      rpc: 'complete_payment_order_with_link';
      args: {
        p_order: string;
        p_tx: string;
        p_amount: number;
        p_currency: string;
        p_provider_status: string;
        p_environment: string | null;
        p_merchant: string | null;
        p_process_id: string | null;
        p_token_hash: string | null;
        p_legacy_before: string | null;
      };
    };

/**
 * Which database function a completion request calls, and with what. Pure (no I/O), so it is tested on its own.
 * With no Grow link configuration at all and no GROW_LEGACY_ORDERS_BEFORE it is exactly the original complete_payment_order, whatever
 * the request carries (v1, or v2 with its link, which is then ignored): deploying this code, and Make switching to v2, change nothing.
 * Once the binding is configured (or a cutoff is set) the linked function decides, so an old-format (v1) call can no longer complete an
 * order that has a bound link. A half or wrong configuration builds no call (503, Make retries): it never silently weakens the check.
 * `null` = cannot be built safely (a link without the Grow configuration, or an invalid cutoff): the caller answers 503 and Make retries.
 */
export function completionCall(request: CompletionRequest, env: NodeJS.ProcessEnv = process.env): CompletionCall | null {
  const base = {
    p_order: request.orderId,
    p_tx: request.transactionId,
    p_amount: request.amount,
    p_currency: request.currency,
    p_provider_status: request.providerStatus,
  };
  const cutoff = legacyOrdersBefore(env);
  if (cutoff === null) return null; // a cutoff that is set but not a valid instant: fail closed
  const config = growLinkConfig(env);
  const touched = ['GROW_ENVIRONMENT', 'GROW_MERCHANT_REF', 'GROW_LINK_TOKEN_KEY'].some((k) => (env[k] ?? '').trim() !== '');
  // Nothing about the binding is configured: nothing is enforceable yet, so a link in the request is ignored and today's function
  // runs. This is what lets Make start sending v2 BEFORE the binding is switched on, without refusing a single valid payment.
  if (!touched && cutoff === undefined) return { rpc: 'complete_payment_order', args: base };
  // Configured wrongly or halfway (a Preview with production identifiers, a missing key, a cutoff without a configuration): fail closed.
  if (!config) return null;
  return {
    rpc: 'complete_payment_order_with_link',
    args: {
      ...base,
      // The four link values come together or not at all (the database refuses half a set).
      p_environment: config && request.link ? config.environment : null,
      p_merchant: config && request.link ? config.merchant : null,
      p_process_id: request.link ? request.link.processId : null,
      p_token_hash: config && request.link ? linkTokenHash(config, request.link.processId, request.link.processToken) : null,
      p_legacy_before: cutoff ? cutoff.toISOString() : null,
    },
  };
}

/** `null` = the database could not be reached or is not configured (the caller answers 503 so Make can retry). */
export async function completePaymentOrder(request: CompletionRequest, env: NodeJS.ProcessEnv = process.env): Promise<LinkedCompletionStatus | null> {
  const client = getSupabaseServiceClient();
  if (!client) return null;
  const call = completionCall(request, env);
  if (!call) return null;
  const { data, error } = await client.rpc(call.rpc, call.args);
  if (error || !data || typeof data !== 'object') return null;
  const status = (data as { status?: unknown }).status;
  const allowed: readonly unknown[] = call.rpc === 'complete_payment_order' ? COMPLETION_STATUSES : LINKED_COMPLETION_STATUSES;
  return allowed.includes(status) ? (status as LinkedCompletionStatus) : null;
}

/** Remembers the last NON-PAID status text seen for an order. Best effort: it changes no status and grants nothing. */
export async function recordPaymentNotice(orderId: string, providerStatus: string): Promise<void> {
  const client = getSupabaseServiceClient();
  if (!client) return;
  await client.rpc('record_payment_notice', { p_order: orderId, p_provider_status: providerStatus });
}
