import { getSupabaseServiceClient } from './supabaseServiceClient.js';
import { readTrialIdFromCookieHeader } from './trialIdentity.js';
import { readPositiveIntEnv } from './anonymousSafetyValves.js';

/**
 * The account's ONE free dream (see the account_free_dream migration). The decision is made once per account in the database
 * (decide_account_free_dream): a person who signs up before starting a dream gets one free credit; a guest who already finished their
 * free dream gets nothing more; a guest who signs up half-way keeps theirs. The guest this browser was is identified ONLY by the signed
 * trial cookie of the request itself, never by anything the browser names.
 *
 * Failing safe: when the decision cannot be made (no database, an error) nothing is granted and the caller carries on exactly as it did
 * before this existed.
 */
export const ACCOUNT_FREE_PER_DAY_ENV = 'DARE_ACCOUNT_FREE_PER_DAY';
/** Emergency cap on free dreams given to NEW accounts in a rolling day (the decision is retried later when it is reached). */
export const DEFAULT_ACCOUNT_FREE_PER_DAY = 100;

export type FreeDreamOutcome = 'granted' | 'used_inflight' | 'used_as_guest' | 'legacy_used' | 'browser_used' | 'owner';
const OUTCOMES: readonly string[] = ['granted', 'used_inflight', 'used_as_guest', 'legacy_used', 'browser_used', 'owner'];

export type FreeDreamDecision =
  | { status: 'decided'; outcome: FreeDreamOutcome; isNew: boolean }
  | { status: 'unavailable' | 'unconfirmed' | 'unknown_user' };

/** Maps the SQL function's jsonb. Anything unrecognized is null (= no decision: grant nothing, change nothing). */
export function readFreeDreamDecision(data: unknown): FreeDreamDecision | null {
  if (!data || typeof data !== 'object') return null;
  const r = data as { status?: unknown; outcome?: unknown; new?: unknown };
  if (r.status === 'unavailable' || r.status === 'unconfirmed' || r.status === 'unknown_user') return { status: r.status };
  if (r.status === 'decided' && typeof r.outcome === 'string' && OUTCOMES.includes(r.outcome) && typeof r.new === 'boolean') {
    return { status: 'decided', outcome: r.outcome as FreeDreamOutcome, isNew: r.new };
  }
  return null;
}

export interface FreeDreamStore {
  decide(userId: string, trialId: string | null, dailyLimit: number): Promise<unknown | null>;
}

export const databaseFreeDreamStore: FreeDreamStore = {
  async decide(userId, trialId, dailyLimit) {
    const client = getSupabaseServiceClient();
    if (!client) return null;
    const { data, error } = await client.rpc('decide_account_free_dream', { p_owner: userId, p_trial: trialId, p_daily_limit: dailyLimit });
    return error ? null : data;
  },
};

type Env = Record<string, string | undefined>;
export const accountFreeDreamsPerDay = (env: Env = process.env) => readPositiveIntEnv(env[ACCOUNT_FREE_PER_DAY_ENV], DEFAULT_ACCOUNT_FREE_PER_DAY);

/**
 * Settles the free-dream question for a VERIFIED account (the id comes from the validated bearer token). Idempotent: asking again
 * changes nothing. The trial id is read from the request's own signed cookie. Never throws.
 */
export async function ensureFreeDreamDecision(
  userId: string,
  cookieHeader: string | null | undefined,
  store: FreeDreamStore = databaseFreeDreamStore,
  env: Env = process.env,
): Promise<FreeDreamDecision | null> {
  try {
    const trialId = readTrialIdFromCookieHeader(cookieHeader, env);
    return readFreeDreamDecision(await store.decide(userId, trialId, accountFreeDreamsPerDay(env)));
  } catch {
    return null;
  }
}

/** True only when THIS call has just given the account its free credit, so a request that was refused for lack of credit may retry once. */
export async function freeDreamGrantedNow(userId: string, cookieHeader: string | null | undefined): Promise<boolean> {
  const decision = await ensureFreeDreamDecision(userId, cookieHeader);
  return decision?.status === 'decided' && decision.isNew && decision.outcome === 'granted';
}
