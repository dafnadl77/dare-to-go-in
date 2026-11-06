import { createHash } from 'node:crypto';
import { getSupabaseServiceClient } from './supabaseServiceClient.js';

/**
 * ONE LOGICAL AI REQUEST RUNS ONCE (autosave, 2026-11-05; supabase/migrations/20261105_autosave_resume.sql). A turn of DARE, the whole view
 * and the reflection are claimed on the dream's own record before the model is called: a result that already exists comes back with no
 * model call and no slot, a request still running is waited for, and a stuck one runs again on the slot it already took.
 *
 * When the record cannot be reached (no such dream row, a guest's dream, the migration not applied yet) the claim is null and the route
 * goes on exactly as it did before this existed: the record only ever prevents repeats, it never blocks a dream.
 */

export type AiClaim = { state: 'new' | 'retry'; token: string } | { state: 'done'; result: unknown } | { state: 'processing' | 'busy' } | null;

export interface AiRequestDeps {
  claim: (dreamId: string, ownerId: string, key: string) => Promise<AiClaim>;
  finish: (dreamId: string, ownerId: string, token: string, result: unknown) => Promise<void>;
  /** False when another run has taken this request over: what this run reserved now belongs to that run. */
  release: (dreamId: string, ownerId: string, token: string) => Promise<boolean>;
}

/** The request's identity, computed by the server from the journey itself: a client can never choose or forge it. */
export const aiRequestKey = (kind: string, parts: readonly unknown[]): string => `${kind}:${createHash('sha256').update(JSON.stringify(parts)).digest('hex')}`;

export const realAiRequests: AiRequestDeps = {
  async claim(dreamId, ownerId, key) {
    const client = getSupabaseServiceClient();
    if (!client) return null;
    const { data, error } = await client.rpc('claim_dream_ai_request', { p_dream: dreamId, p_owner: ownerId, p_key: key });
    if (error || !data || typeof data !== 'object') return null;
    const d = data as { state?: unknown; token?: unknown; result?: unknown };
    if ((d.state === 'new' || d.state === 'retry') && typeof d.token === 'string') return { state: d.state, token: d.token };
    if (d.state === 'done') return { state: 'done', result: d.result };
    if (d.state === 'processing' || d.state === 'busy') return { state: d.state };
    return null;
  },
  async finish(dreamId, ownerId, token, result) {
    const client = getSupabaseServiceClient();
    if (!client) return;
    // best effort: the answer is on its way to her either way
    await client.rpc('finish_dream_ai_request', { p_dream: dreamId, p_owner: ownerId, p_token: token, p_result: result }).then(
      () => {},
      () => {},
    );
  },
  async release(dreamId, ownerId, token) {
    const client = getSupabaseServiceClient();
    if (!client) return true;
    const { data, error } = await client.rpc('release_dream_ai_request', { p_dream: dreamId, p_owner: ownerId, p_token: token }).then(
      (r) => r,
      () => ({ data: null, error: true }),
    );
    // only a clear "no" counts: a record that cannot be reached leaves the slot's refund exactly as it always was
    return error ? true : data !== false;
  },
};
