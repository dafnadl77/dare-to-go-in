import { getSupabaseServiceClient } from './supabaseServiceClient.js';

/**
 * What the dream-balance display needs besides the balance itself, read-only, from the EXISTING credits records (no new credit
 * system): the credit ledger — the same table every grant, spend and refund already goes through — and the trial record.
 *
 *   grantedCredits  every credit this account was ever GIVEN (purchases, plus any admin / backfill grant): the total the
 *                   remaining balance is shown "out of". Spends and refunds are not grants: a refund only restores a spent credit.
 *   grantCount      how many separate grants that was. More than one means the balance spans several packages, and the display
 *                   must not present it as the remainder of a single one.
 *   freeDreamUsed   whether this account's one free dream (the anonymous trial it was claimed from) was already completed.
 *
 * null = it could not be determined (not configured / database error): the caller leaves these fields out and the display shows
 * only what it knows, never a guess.
 */
export interface CreditHistory {
  grantedCredits: number;
  grantCount: number;
  freeDreamUsed: boolean;
}

const GRANT_REASONS = ['purchase', 'backfill', 'admin'];

export function summarizeGrants(rows: unknown): { grantedCredits: number; grantCount: number } | null {
  if (!Array.isArray(rows)) return null;
  let grantedCredits = 0;
  let grantCount = 0;
  for (const row of rows) {
    const delta = (row as { delta?: unknown } | null)?.delta;
    if (typeof delta !== 'number' || !Number.isFinite(delta)) return null;
    if (delta > 0) {
      grantedCredits += delta;
      grantCount += 1;
    }
  }
  return { grantedCredits, grantCount };
}

export async function getCreditHistory(userId: string): Promise<CreditHistory | null> {
  const client = getSupabaseServiceClient();
  if (!client) return null;
  const ledger = await client.from('credit_ledger').select('delta').eq('owner_id', userId).in('reason', GRANT_REASONS);
  if (ledger.error) return null;
  const grants = summarizeGrants(ledger.data);
  if (!grants) return null;
  const trial = await client
    .from('trial_identities')
    .select('id')
    .eq('converted_user_id', userId)
    .not('free_dream_completed_at', 'is', null)
    .limit(1);
  if (trial.error || !Array.isArray(trial.data)) return null;
  return { ...grants, freeDreamUsed: trial.data.length > 0 };
}
