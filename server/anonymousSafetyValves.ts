/**
 * TECHNICAL SAFETY VALVE for anonymous (trial) identity minting — NOT a commercial quota.
 *
 * The per-dream anonymous allowance (ONE completed free dream per identity, bounded technical
 * attempts, transcription/label metering, the global anonymous-spend breaker) lives in
 * trialAllowance.ts and is enforced atomically in the database. What remains here is only the
 * emergency stop on how many NEW trial identities may be minted site-wide per hour (counted on
 * trial_identities.created_at; no table, no IP tracking). It is not a defence against someone
 * clearing cookies — that is the edge/WAF layer's job.
 *
 * KNOWN LIMITATION: counting is not atomic, so the limit can be exceeded slightly under concurrency.
 */

/** EMERGENCY BACKSTOP ONLY: new trial identities allowed site-wide per rolling hour. Deliberately high — it is
    not a defence against cookie deletion (an attacker can also use it to exhaust the hour for real visitors);
    it only caps the damage if minting is being scripted at volume. */
export const TRIAL_MINT_BACKSTOP_ENV = 'DARE_TRIAL_MINT_BACKSTOP_PER_HOUR';
export const DEFAULT_TRIAL_MINT_BACKSTOP_PER_HOUR = 1000;

export const DAY_MS = 24 * 60 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;

/** A positive integer from the environment, else the documented default (never 0/negative/NaN). */
export function readPositiveIntEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : fallback;
}

export function trialMintBackstopPerHour(env: Record<string, string | undefined> = process.env): number {
  return readPositiveIntEnv(env[TRIAL_MINT_BACKSTOP_ENV], DEFAULT_TRIAL_MINT_BACKSTOP_PER_HOUR);
}

// ---- Trial-mint emergency backstop ----

export interface TrialMintStore {
  /** How many trial identities were created at or after `sinceIso`; null when unreadable. */
  countTrialsSince: (sinceIso: string) => Promise<number | null>;
}

export type MintBackstopResult = 'ok' | 'backstop_reached' | 'unavailable';

export async function checkTrialMintBackstop(store: TrialMintStore, limitPerHour: number, nowMs: number = Date.now()): Promise<MintBackstopResult> {
  const count = await store.countTrialsSince(new Date(nowMs - HOUR_MS).toISOString());
  if (count === null) return 'unavailable';
  return count >= limitPerHour ? 'backstop_reached' : 'ok';
}
