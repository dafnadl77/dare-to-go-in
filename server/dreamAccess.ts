import { errorResult, type HandlerResult } from './httpResult.js';
import type { CallerIdentity } from './callerIdentity.js';
import { getSupabaseServiceClient } from './supabaseServiceClient.js';

/**
 * EVERY AI REQUEST OF A DREAM NAMES A DREAM THAT IS STILL HERS (2026-11-05). Before any model call, slot or credit action the dream's own
 * row must exist under the signed-in account: a dream she deleted, or someone else's, gets nothing. Since the analysis opens the row in
 * the same transaction that completes it (complete_analysis_open_dream), a missing row always means the dream is gone.
 *
 * A database that cannot answer closes the door. A server with no database at all goes on to the reservation, which refuses there, as it
 * always did. A guest has no account and no row: the trial's own rules apply.
 */

export type DreamAccess = 'ok' | 'missing' | 'unavailable';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function dreamInAccount(dreamId: string, ownerId: string): Promise<DreamAccess> {
  const client = getSupabaseServiceClient();
  if (!client) return 'ok';
  if (!UUID.test(dreamId)) return 'missing';
  try {
    const { data, error } = await client.from('dreams').select('id').eq('id', dreamId).eq('owner_id', ownerId).maybeSingle();
    if (error) return 'unavailable';
    return data ? 'ok' : 'missing';
  } catch {
    return 'unavailable';
  }
}

/** The answer for a request that may not go on, or null when it may. */
export async function dreamRefusal(identity: CallerIdentity, dreamId: string, check: typeof dreamInAccount = dreamInAccount): Promise<HandlerResult | null> {
  if (identity.kind !== 'user') return null;
  const access = await check(dreamId, identity.userId);
  if (access === 'ok') return null;
  return access === 'missing' ? errorResult(404, 'dream_not_found', 'This dream is no longer in this account.') : errorResult(503, 'temporarily_unavailable', 'Please try again in a moment.');
}
