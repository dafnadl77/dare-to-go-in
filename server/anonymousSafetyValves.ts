/**
 * TECHNICAL SAFETY VALVES for anonymous (trial) callers — NOT commercial quotas.
 *
 * They exist only so that one anonymous browser cannot, by looping, start an
 * unbounded number of dream attempts (each attempt unlocks paid image and
 * reflection generation — see dreamAttempts.ts) and so that the site has an
 * emergency stop if trial identities are being minted in bulk. They say nothing
 * about what a user is entitled to; the future Grow/payment entitlement model
 * replaces or sits above them. No table, no migration: both count rows that
 * already exist (dream_attempts.created_at, trial_identities.created_at).
 *
 * KNOWN LIMITATIONS (by design, documented rather than hidden):
 *  - Counting is not atomic. Requests running at the same instant can each see
 *    the others' rows too late, so the limit can be exceeded slightly under
 *    concurrency (bounded by how many requests are in flight at once).
 *  - Neither valve stops someone who deletes the trial cookie: that yields a new
 *    trial identity with a fresh allowance. Edge/WAF rate limiting on
 *    /api/trial-session and the paid routes is a separate, required layer.
 */

/** Anonymous dream-analysis attempts allowed per rolling 24 hours, per trial identity. */
export const TRIAL_ANALYSES_PER_DAY_ENV = 'DARE_TRIAL_MAX_ANALYSES_PER_DAY';
export const DEFAULT_TRIAL_ANALYSES_PER_DAY = 10;

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

export function trialAnalysesPerDay(env: Record<string, string | undefined> = process.env): number {
  return readPositiveIntEnv(env[TRIAL_ANALYSES_PER_DAY_ENV], DEFAULT_TRIAL_ANALYSES_PER_DAY);
}

export function trialMintBackstopPerHour(env: Record<string, string | undefined> = process.env): number {
  return readPositiveIntEnv(env[TRIAL_MINT_BACKSTOP_ENV], DEFAULT_TRIAL_MINT_BACKSTOP_PER_HOUR);
}

// ---- Attempt creation with the anonymous safety valve ----

export type AttemptIdentity = { kind: 'user'; userId: string } | { kind: 'trial'; trialId: string };

export interface AttemptStore {
  /** Inserts one attempt row for this identity; null when it could not be created. */
  insertAttempt: (identity: AttemptIdentity) => Promise<string | null>;
  /** How many attempt rows this trial currently has created at or after `sinceIso`; null when unreadable. */
  countTrialAttemptsSince: (trialId: string, sinceIso: string) => Promise<number | null>;
  deleteAttempt: (attemptId: string) => Promise<void>;
}

export type CreateAttemptResult = { ok: true; attemptId: string } | { ok: false; reason: 'limit_reached' | 'unavailable' };

/**
 * Creates the attempt for a dream-analysis request. For an authenticated user
 * this is the plain insert (nothing here restricts accounts — their limits
 * belong to the entitlement work). For a trial it inserts first and then counts
 * the trial's attempts in the rolling window INCLUDING the new row: if that
 * exceeds the limit the new row is deleted again and the request is refused, so
 * a refused request never leaves an extra attempt behind and never reaches the
 * model. (Insert-then-count, rather than count-then-insert, so requests that
 * are already committed are always seen.) Failed analyses are still cleaned up
 * by the route (deleteDreamAttempt), so they do not count.
 */
export async function createAttemptWithinSafetyValve(
  store: AttemptStore,
  identity: AttemptIdentity,
  limitPerDay: number,
  nowMs: number = Date.now(),
): Promise<CreateAttemptResult> {
  const attemptId = await store.insertAttempt(identity);
  if (!attemptId) return { ok: false, reason: 'unavailable' };
  if (identity.kind !== 'trial') return { ok: true, attemptId };

  const since = new Date(nowMs - DAY_MS).toISOString();
  const count = await store.countTrialAttemptsSince(identity.trialId, since);
  if (count === null) {
    // Fail closed: an unmetered anonymous attempt is exactly what this valve prevents.
    await store.deleteAttempt(attemptId);
    return { ok: false, reason: 'unavailable' };
  }
  if (count > limitPerDay) {
    await store.deleteAttempt(attemptId);
    return { ok: false, reason: 'limit_reached' };
  }
  return { ok: true, attemptId };
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
