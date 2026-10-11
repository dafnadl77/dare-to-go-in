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
  /** The account's own free-dream credit (0 or 1), counted apart from the purchased ones. Left out when the account has none. */
  freeGranted?: number;
  /** 'available' = the free dream is still waiting; 'used' = it was used (here or as a guest). Left out when not known. */
  freeDream?: 'available' | 'used';
}

const GRANT_REASONS = ['purchase', 'backfill', 'admin'];
const USED_OUTCOMES = ['used_as_guest', 'legacy_used', 'browser_used', 'used_inflight'];

/**
 * The free dream, from the ledger and the one-time decision. The free credit is counted as the FIRST one spent (it cannot be saved up
 * behind purchased ones), so a credit used is the free one while it is still there. Pure, so the rules are tested without a database.
 */
export function summarizeFreeDream(
  rows: unknown,
  decisionOutcome: string | null,
  trialCompleted: boolean,
): { freeGranted: number; freeDream?: 'available' | 'used'; freeDreamUsed: boolean } | null {
  if (!Array.isArray(rows)) return null;
  let freeGranted = 0;
  let netSpent = 0;
  for (const row of rows) {
    const r = row as { delta?: unknown; reason?: unknown } | null;
    if (typeof r?.delta !== 'number' || !Number.isFinite(r.delta) || typeof r.reason !== 'string') return null;
    if (r.reason === 'free' && r.delta > 0) freeGranted += r.delta;
    if (r.reason === 'spend' || r.reason === 'refund') netSpent -= r.delta;
  }
  if (freeGranted > 0) {
    const available = Math.max(0, freeGranted - Math.max(0, netSpent)) > 0;
    return { freeGranted, freeDream: available ? 'available' : 'used', freeDreamUsed: !available };
  }
  const usedElsewhere = trialCompleted || (decisionOutcome !== null && USED_OUTCOMES.includes(decisionOutcome));
  return usedElsewhere ? { freeGranted: 0, freeDream: 'used', freeDreamUsed: true } : { freeGranted: 0, freeDreamUsed: false };
}

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
  const ledger = await client.from('credit_ledger').select('delta, reason').eq('owner_id', userId);
  if (ledger.error || !Array.isArray(ledger.data)) return null;
  const grants = summarizeGrants(ledger.data.filter((row) => GRANT_REASONS.includes((row as { reason?: string }).reason ?? '')));
  if (!grants) return null;
  const trial = await client
    .from('trial_identities')
    .select('id')
    .eq('converted_user_id', userId)
    .not('free_dream_completed_at', 'is', null)
    .limit(1);
  if (trial.error || !Array.isArray(trial.data)) return null;
  const decision = await client.from('free_dream_decisions').select('outcome').eq('owner_id', userId).maybeSingle();
  if (decision.error) return null;
  const free = summarizeFreeDream(ledger.data, (decision.data as { outcome?: string } | null)?.outcome ?? null, trial.data.length > 0);
  if (!free) return null;
  return {
    ...grants,
    freeDreamUsed: free.freeDreamUsed,
    ...(free.freeGranted > 0 ? { freeGranted: free.freeGranted } : {}),
    ...(free.freeDream ? { freeDream: free.freeDream } : {}),
  };
}
