import { createHash } from 'node:crypto';
import { getSupabaseServiceClient } from '../supabaseServiceClient.js';
import { growLinkConfig, linkTokenHash, MIN_LINK_KEY_LENGTH, type GrowEnvironment, type GrowLinkConfig } from './growLinkHash.js';
import { COMPLETION_STATUSES } from './completionStore.js';
import type { CompletionRequest } from './completionRequest.js';

/**
 * Grow payment-link identifiers: kept at checkout, matched when the direct Grow notification arrives (growNotify.ts).
 *
 * WHAT THIS IS NOT: proof of origin or of ownership. Grow's notification is unsigned and Grow has not committed that a link's
 * process id or token is secret or unique across all businesses. A match only says "this notification names the link DARE created
 * for this order, in this environment, for this merchant". The direct grant path stays closed (growNotify.ts) whatever matches.
 *
 * The token:
 *  - is never stored, logged, returned to the browser or put in an error. Only a keyed hash is stored (HMAC-SHA256 with
 *    GROW_LINK_TOKEN_KEY, a server-only key of 32+ characters that never enters the database), bound to the environment, the
 *    merchant and the process id, so a stored hash is useless for any other link and cannot be recomputed from the database alone.
 *  - if a later step ever needs the token ITSELF (for example a Grow call that requires it), a hash is not enough: it would have to
 *    be stored encrypted (AES-256-GCM with a separate server-only key, its own key version, never in logs), as a separate, reviewed
 *    and approved change. Nothing here does that.
 *
 * Environment and merchant separation: GROW_ENVIRONMENT (sandbox | production) and GROW_MERCHANT_REF (DARE's own short label for
 * the Grow business behind its Make connection) are stored with every binding and must be equal when matching. A Vercel production
 * deployment accepts only "production"; any other deployment (Preview, development, local) accepts only "sandbox". Anything
 * missing or malformed = no configuration = nothing is bound and nothing can complete (fail closed).
 */

// The configuration and the token hash live in growLinkHash.ts (no database import); re-exported here unchanged.
export { growLinkConfig, linkTokenHash, MIN_LINK_KEY_LENGTH, type GrowEnvironment, type GrowLinkConfig };
export const PROCESS_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const PROCESS_TOKEN = /^[A-Za-z0-9_-]{8,256}$/;

/** What the notice log keeps of a transaction id: its SHA-256 (reconcilable against Grow's report, not the id itself). */
export function transactionHash(transactionId: string): string {
  return createHash('sha256').update(`grow-tx\n${transactionId}`).digest('hex');
}

export interface LinkIds {
  processId: string;
  processToken: string;
}

const scalar = (v: unknown): string | null => {
  if (typeof v === 'number') return Number.isSafeInteger(v) && v >= 0 ? String(v) : null;
  return typeof v === 'string' ? v.trim() : null;
};

/** One link-id pair, both present and well formed; anything else is refused without saying which value was wrong. */
export function readLinkIds(id: unknown, token: unknown): { status: 'absent' } | { status: 'invalid' } | { status: 'present'; ids: LinkIds } {
  if ((id === undefined || id === null || id === '') && (token === undefined || token === null || token === '')) return { status: 'absent' };
  const processId = scalar(id);
  const processToken = typeof token === 'string' ? token.trim() : null; // a token is text, never a number
  if (!processId || !PROCESS_ID.test(processId) || !processToken || !PROCESS_TOKEN.test(processToken)) return { status: 'invalid' };
  return { status: 'present', ids: { processId, processToken } };
}

// ------------------------------------------------------------------------------- database ----

export type BindOutcome = 'bound' | 'already_bound' | 'conflict' | 'process_in_use' | 'order_not_open' | 'invalid';
const BIND_OUTCOMES: readonly string[] = ['bound', 'already_bound', 'conflict', 'process_in_use', 'order_not_open', 'invalid'];

export interface BindRequest {
  orderId: string;
  ownerId: string;
  environment: GrowEnvironment;
  merchant: string;
  processId: string;
  tokenHash: string;
  tokenInUrl: boolean;
}

/** `null` = the database could not be reached or is not configured. */
export async function bindPaymentOrderLink(r: BindRequest): Promise<BindOutcome | null> {
  const client = getSupabaseServiceClient();
  if (!client) return null;
  const { data, error } = await client.rpc('bind_payment_order_link', {
    p_order: r.orderId,
    p_owner: r.ownerId,
    p_environment: r.environment,
    p_merchant: r.merchant,
    p_process_id: r.processId,
    p_token_hash: r.tokenHash,
    p_token_in_url: r.tokenInUrl,
  });
  if (error || typeof data !== 'string') return null;
  return BIND_OUTCOMES.includes(data) ? (data as BindOutcome) : null;
}

/** Outcomes of complete_bound_payment_order: the binding refusals, then complete_payment_order's own. */
export const BOUND_COMPLETION_STATUSES = ['link_missing', 'link_mismatch', 'order_not_open', ...COMPLETION_STATUSES] as const;
export type BoundCompletionStatus = (typeof BOUND_COMPLETION_STATUSES)[number];

export interface BoundCompletionRequest extends CompletionRequest {
  environment: GrowEnvironment;
  merchant: string;
  processId: string;
  tokenHash: string;
}

/** `null` = unavailable (the caller answers 503 so Grow retries). The order lock, the binding check and the grant are one transaction. */
export async function completeBoundPaymentOrder(r: BoundCompletionRequest): Promise<BoundCompletionStatus | null> {
  const client = getSupabaseServiceClient();
  if (!client) return null;
  const { data, error } = await client.rpc('complete_bound_payment_order', {
    p_order: r.orderId,
    p_environment: r.environment,
    p_merchant: r.merchant,
    p_process_id: r.processId,
    p_token_hash: r.tokenHash,
    p_tx: r.transactionId,
    p_amount: r.amount,
    p_currency: r.currency,
    p_provider_status: r.providerStatus,
  });
  if (error || !data || typeof data !== 'object') return null;
  const status = (data as { status?: unknown }).status;
  return (BOUND_COMPLETION_STATUSES as readonly unknown[]).includes(status) ? (status as BoundCompletionStatus) : null;
}

export interface NoticeEntry {
  environment: GrowEnvironment | 'unknown';
  orderId: string | null;
  txHash: string | null;
  statusCode: string | null;
  shape: string | null;
  outcome: string;
  approve: 'approved' | 'failed' | 'not_configured' | null;
}

/** Best effort: a notice that cannot be written never changes the answer to Grow. Fixed formats only (the database drops the rest). */
export async function logPaymentNotice(e: NoticeEntry): Promise<void> {
  const client = getSupabaseServiceClient();
  if (!client) return;
  await client.rpc('log_payment_notice', {
    p_environment: e.environment,
    p_order: e.orderId,
    p_tx_hash: e.txHash,
    p_status_code: e.statusCode,
    p_shape: e.shape,
    p_outcome: e.outcome,
    p_approve: e.approve,
  });
}
