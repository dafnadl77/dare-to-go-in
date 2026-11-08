import { createHash } from 'node:crypto';
import { getSupabaseServiceClient } from './supabaseServiceClient.js';
import { readPositiveIntEnv } from './anonymousSafetyValves.js';

/**
 * LIMITS FOR THE AI EXTRAS: translation and pattern reflection (prepared 2026-11-08, Option A). Neither spends a credit or touches the
 * dream journey; both are display additions. Before this, both could call the AI without any bound.
 *
 * Every request is counted in the database BEFORE any AI call (take_rate_limit_weighted / peek_rate_limit, migration
 * 20261109_rate_limit_weighted.sql), atomically, so parallel requests are counted exactly. Order, and why:
 *   1. the account's own windows (minute, hour, day) and, for translation, its characters a day. A blocked account stops here, so
 *      it can never add to the site total by retrying.
 *   2. light users keep a share: once the site has used 70% of a day's site cap, an account that already used more than its
 *      "light" amount today waits for tomorrow; everyone under it still gets through.
 *   3. the site's own day cap (all accounts together): the budget bound that does not depend on how many accounts exist. Sized
 *      for launch (about 330 typical sessions a day; one account at most a quarter of it) and raised by setting as DARE grows.
 * A counter that cannot be read BLOCKS (fails closed): these are extras, the screen already falls back (original text / "not
 * available right now"), and an open door here is exactly the unbounded spend this exists to stop.
 * Windows are fixed (the day starts 00:00 UTC), as for every other limit in DARE.
 */

export type ExtrasFeature = 'translate' | 'pattern';

export interface ExtrasPolicy {
  feature: ExtrasFeature;
  perMinute: number;
  perHour: number;
  perDay: number;
  /** Units (characters) an account may send a day; absent = requests are the only measure. */
  unitsPerDay?: number;
  siteRequestsPerDay: number;
  /** Units the whole site may send a day; absent = site requests are the measure. */
  siteUnitsPerDay?: number;
  /** Above this much use today (units, or requests when there are no units), an account waits once the site is past the share. */
  lightAllowance: number;
  /** The fraction of the site's day cap after which only light users get through. */
  reserveShare: number;
}

const env = (e: Record<string, string | undefined>, name: string, fallback: number) => readPositiveIntEnv(e[name], fallback);

/** Translation (Option A): sized from the real archive — a 300-dream archive in the other language is about 1,800 short items, 60k
    characters and 45 requests of 40 items; one Dream Detail about 0.8–1.8k characters. A heavy day — that archive loaded twice,
    30 dreams opened, 10 reflections — is about 190k characters and 130 requests, inside the account's day. */
export function translationPolicy(e: Record<string, string | undefined> = process.env): ExtrasPolicy {
  return {
    feature: 'translate',
    perMinute: env(e, 'DARE_TRANSLATE_PER_MINUTE', 60),
    perHour: env(e, 'DARE_TRANSLATE_PER_HOUR', 300),
    perDay: env(e, 'DARE_TRANSLATE_PER_DAY', 400),
    unitsPerDay: env(e, 'DARE_TRANSLATE_CHARS_PER_DAY', 250_000),
    siteRequestsPerDay: env(e, 'DARE_TRANSLATE_SITE_PER_DAY', 1_500),
    siteUnitsPerDay: env(e, 'DARE_TRANSLATE_SITE_CHARS_PER_DAY', 1_000_000),
    lightAllowance: env(e, 'DARE_TRANSLATE_LIGHT_CHARS', 30_000),
    reserveShare: 0.7,
  };
}

/** Pattern reflection: counted only when a NEW reflection is written (a saved one costs nothing and is never counted). Sized so a
    dreamer can open every one of 12 recurring patterns and then all 12 again in the other language within the same hour. */
export function patternPolicy(e: Record<string, string | undefined> = process.env): ExtrasPolicy {
  return {
    feature: 'pattern',
    perMinute: env(e, 'DARE_PATTERN_PER_MINUTE', 10),
    perHour: env(e, 'DARE_PATTERN_PER_HOUR', 30),
    perDay: env(e, 'DARE_PATTERN_PER_DAY', 40),
    siteRequestsPerDay: env(e, 'DARE_PATTERN_SITE_PER_DAY', 150),
    lightAllowance: env(e, 'DARE_PATTERN_LIGHT', 8),
    reserveShare: 0.7,
  };
}

/** Per-request size caps for translation (the server's; the browser splits its own batches below these). */
export const TRANSLATE_MAX_TEXTS = 40;
export const TRANSLATE_MAX_TEXT_CHARS = 20_000;
export const TRANSLATE_MAX_TOTAL_CHARS = 24_000;
export const TRANSLATE_MAX_OUTPUT_TOKENS = 12_000;
/** Pattern reflection: what one request may name, what each dream contributes, and the answer's size. */
export const PATTERN_MAX_REQUESTED_IDS = 200;
export const PATTERN_MAX_FIELD_CHARS = 800;
export const PATTERN_MAX_OUTPUT_TOKENS = 1_000;

export type CounterOutcome = { status: 'ok'; hits: number } | { status: 'limited'; hits: number; retryAfterSeconds: number } | { status: 'unknown' };

export interface ExtrasStore {
  take(bucket: string, cost: number, limit: number, windowSeconds: number): Promise<CounterOutcome>;
  /** The counter's current value, without adding to it; null when it cannot be read. */
  peek(bucket: string, windowSeconds: number): Promise<number | null>;
}

export type ExtrasDecision =
  | { allowed: true }
  | { allowed: false; status: 429 | 409 | 503; reason: 'usage_limited' | 'in_progress' | 'limits_unavailable'; retryAfterSeconds: number; scope: 'account' | 'reserve' | 'site' | 'duplicate' | 'store' };

const DAY = 86_400;
const unavailable: ExtrasDecision = { allowed: false, status: 503, reason: 'limits_unavailable', retryAfterSeconds: 60, scope: 'store' };
const limited = (scope: 'account' | 'reserve' | 'site', retryAfterSeconds: number): ExtrasDecision => ({ allowed: false, status: 429, reason: 'usage_limited', retryAfterSeconds, scope });

function secondsToUtcMidnight(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

/** The whole allowance check for one request. `units` = characters for translation, 1 for a pattern reflection. */
export async function checkExtrasAllowance(
  store: ExtrasStore,
  policy: ExtrasPolicy,
  ownerId: string,
  units: number,
  log: (line: string) => void = (line) => console.warn(line),
  now: () => Date = () => new Date(),
): Promise<ExtrasDecision> {
  const f = policy.feature;
  const cost = Math.max(1, Math.ceil(units));
  const a = (name: string) => `x:${f}:${name}:${ownerId}`;

  // 1. the account's own windows; a blocked account stops here and never reaches the site counters
  let accountDayRequests = 0;
  for (const [name, limit, window] of [['m', policy.perMinute, 60], ['h', policy.perHour, 3600], ['d', policy.perDay, DAY]] as const) {
    const r = await store.take(a(name), 1, limit, window);
    if (r.status === 'unknown') return unavailable;
    if (r.status === 'limited') return limited('account', r.retryAfterSeconds);
    if (name === 'd') accountDayRequests = r.hits;
  }
  let accountUse = accountDayRequests;
  if (policy.unitsPerDay !== undefined) {
    const r = await store.take(a('u'), cost, policy.unitsPerDay, DAY);
    if (r.status === 'unknown') return unavailable;
    if (r.status === 'limited') return limited('account', r.retryAfterSeconds);
    accountUse = r.hits;
  }

  // 2. light users keep a share of the site's day
  const siteMeasure = policy.siteUnitsPerDay !== undefined ? `x:${f}:su` : `x:${f}:sr`;
  const siteCap = policy.siteUnitsPerDay ?? policy.siteRequestsPerDay;
  const siteSoFar = await store.peek(siteMeasure, DAY);
  if (siteSoFar === null) return unavailable;
  if (siteSoFar >= policy.reserveShare * siteCap && accountUse > policy.lightAllowance) {
    log(`extras_reserve_applied feature=${f}`);
    return limited('reserve', secondsToUtcMidnight(now()));
  }

  // 3. the site's day cap
  const sr = await store.take(`x:${f}:sr`, 1, policy.siteRequestsPerDay, DAY);
  if (sr.status === 'unknown') return unavailable;
  if (sr.status === 'limited') {
    log(`extras_site_cap_reached feature=${f} measure=requests`);
    return limited('site', sr.retryAfterSeconds);
  }
  if (policy.siteUnitsPerDay !== undefined) {
    const su = await store.take(`x:${f}:su`, cost, policy.siteUnitsPerDay, DAY);
    if (su.status === 'unknown') return unavailable;
    if (su.status === 'limited') {
      log(`extras_site_cap_reached feature=${f} measure=units`);
      return limited('site', su.retryAfterSeconds);
    }
  }
  return { allowed: true };
}

/** A short, non-reversible name for a request's content (never the content itself in a counter key). */
export function contentKey(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 32);
}

/** Translation: the same texts from the same account at most 3 times in 10 minutes (a retry after a blip still goes through). */
export async function checkDuplicateTranslation(store: ExtrasStore, ownerId: string, target: string, texts: readonly string[]): Promise<ExtrasDecision> {
  const r = await store.take(`x:translate:dup:${ownerId}:${contentKey([target, ...texts])}`, 1, 3, 600);
  if (r.status === 'unknown') return unavailable;
  if (r.status === 'limited') return { allowed: false, status: 429, reason: 'usage_limited', retryAfterSeconds: r.retryAfterSeconds, scope: 'duplicate' };
  return { allowed: true };
}

/** Pattern reflection: one generation at a time for the same reflection; a second arrival within 2 minutes makes no AI call. */
export async function claimPatternGeneration(store: ExtrasStore, ownerId: string, identity: readonly string[]): Promise<ExtrasDecision> {
  const r = await store.take(`x:pattern:lock:${ownerId}:${contentKey(identity)}`, 1, 1, 120);
  if (r.status === 'unknown') return unavailable;
  if (r.status === 'limited') return { allowed: false, status: 409, reason: 'in_progress', retryAfterSeconds: r.retryAfterSeconds, scope: 'duplicate' };
  return { allowed: true };
}

/** The real store: the two database functions, called with the service role. Any error = 'unknown' / null (fails closed above). */
export const databaseExtrasStore: ExtrasStore = {
  async take(bucket, cost, limit, windowSeconds) {
    const client = getSupabaseServiceClient();
    if (!client) return { status: 'unknown' };
    const { data, error } = await client.rpc('take_rate_limit_weighted', { p_bucket: bucket, p_cost: cost, p_limit: limit, p_window_seconds: windowSeconds });
    if (error || !data || typeof data !== 'object') return { status: 'unknown' };
    const r = data as { status?: unknown; hits?: unknown; retry_after?: unknown };
    const hits = typeof r.hits === 'number' && Number.isFinite(r.hits) ? r.hits : NaN;
    if (r.status === 'ok' && Number.isFinite(hits)) return { status: 'ok', hits };
    if (r.status === 'limited' && Number.isFinite(hits)) {
      const retry = typeof r.retry_after === 'number' && Number.isFinite(r.retry_after) ? Math.max(1, Math.ceil(r.retry_after)) : 60;
      return { status: 'limited', hits, retryAfterSeconds: retry };
    }
    return { status: 'unknown' };
  },
  async peek(bucket, windowSeconds) {
    const client = getSupabaseServiceClient();
    if (!client) return null;
    const { data, error } = await client.rpc('peek_rate_limit', { p_bucket: bucket, p_window_seconds: windowSeconds });
    if (error || !data || typeof data !== 'object') return null;
    const r = data as { status?: unknown; hits?: unknown };
    return r.status === 'ok' && typeof r.hits === 'number' && Number.isFinite(r.hits) ? r.hits : null;
  },
};

/** Translation is for an account's own dreams: an account with no saved dream at all has nothing to translate. Null = unknown. */
export async function accountHasSavedDream(ownerId: string): Promise<boolean | null> {
  const client = getSupabaseServiceClient();
  if (!client) return null;
  const { data, error } = await client.from('dreams').select('id').eq('owner_id', ownerId).limit(1);
  if (error || !Array.isArray(data)) return null;
  return data.length > 0;
}
