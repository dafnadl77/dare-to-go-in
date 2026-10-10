import { getSupabaseServiceClient } from './supabaseServiceClient.js';
import { readPositiveIntEnv } from './anonymousSafetyValves.js';

/**
 * Server-side rate limiting for paid AI endpoints, shared by every server instance: the counters live in the database
 * (take_rate_limit, see supabase/migrations/20261010_rate_limits.sql), never in a process's memory.
 *
 * Two windows per account — a short one against bursts and a longer one against sustained use — sized so a real dreamer never
 * meets them (a recording and a retry or two per dream) while a script cannot turn one paid credit into unbounded AI spend.
 *
 * If the counter cannot be read (database hiccup, not configured), the request is ALLOWED and the problem is logged: a paying
 * customer must never be locked out by an infrastructure fault, and every other protection (credit check, size cap) still applies.
 */
export interface RateRule {
  /** A short stable name, part of the counter key. */
  name: string;
  limit: number;
  windowSeconds: number;
}

export type RateOutcome = { status: 'ok' } | { status: 'limited'; retryAfterSeconds: number } | { status: 'unknown' };

export interface RateLimitStore {
  /** Takes one hit from the bucket; 'unknown' when the counter could not be read. */
  take(bucket: string, limit: number, windowSeconds: number): Promise<RateOutcome>;
}

export type RateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** Applies each rule in order; stops at the first one that is exceeded. A counter that cannot be read never blocks. */
export async function enforceRateLimits(store: RateLimitStore, scope: string, subject: string, rules: readonly RateRule[], warn: (message: string) => void = () => {}): Promise<RateDecision> {
  for (const rule of rules) {
    const outcome = await store.take(`${scope}:${rule.name}:${subject}`, rule.limit, rule.windowSeconds);
    if (outcome.status === 'limited') return { allowed: false, retryAfterSeconds: outcome.retryAfterSeconds };
    if (outcome.status === 'unknown') warn(`rate_limit_unavailable scope=${scope}`);
  }
  return { allowed: true };
}

/** Transcription: at most 6 requests a minute and 40 an hour per signed-in account (override with the env vars, never below 1). */
export function transcriptionRules(env: Record<string, string | undefined> = process.env): RateRule[] {
  return [
    { name: 'm', limit: readPositiveIntEnv(env.DARE_TRANSCRIBE_PER_MINUTE, 6), windowSeconds: 60 },
    { name: 'h', limit: readPositiveIntEnv(env.DARE_TRANSCRIBE_PER_HOUR, 40), windowSeconds: 3600 },
  ];
}

/** The real store: the database function, called with the service role. */
export const databaseRateLimitStore: RateLimitStore = {
  async take(bucket, limit, windowSeconds) {
    const client = getSupabaseServiceClient();
    if (!client) return { status: 'unknown' };
    const { data, error } = await client.rpc('take_rate_limit', { p_bucket: bucket, p_limit: limit, p_window_seconds: windowSeconds });
    if (error || !data || typeof data !== 'object') return { status: 'unknown' };
    const result = data as { status?: unknown; retry_after?: unknown };
    if (result.status === 'ok') return { status: 'ok' };
    if (result.status === 'limited') {
      const retry = typeof result.retry_after === 'number' && Number.isFinite(result.retry_after) ? Math.max(1, Math.ceil(result.retry_after)) : 60;
      return { status: 'limited', retryAfterSeconds: retry };
    }
    return { status: 'unknown' };
  },
};
