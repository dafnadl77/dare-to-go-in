import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolveCallerIdentity, type RequestHeaders, type ResolveCallerResult } from './callerIdentity.js';
import { getSigningSecret, readCookie } from './trialIdentity.js';
import { getSupabaseServiceClient } from './supabaseServiceClient.js';

/**
 * ADULTS ONLY (doc 109, approved 2026-10-24): every AI route asks this, not only the screen. Only the TIME of the confirmation is kept,
 * never a date of birth, and nothing is kept for "under 18".
 *
 *   - An account: `age_confirmed_at` in its own metadata — written at sign-up when the box is ticked, or by the server here when the
 *     dreamer answers the age question (Google, older accounts). Deleted with the account. It is a declaration, like the box itself.
 *   - Without an account: a second signed, HttpOnly cookie (`dare_age`) bound to that browser's own trial id, so it cannot be copied to
 *     another trial or edited. It holds the trial's random id and the time; nothing else, and no database row.
 *
 * No database change is needed for either.
 */

export const AGE_COOKIE_NAME = 'dare_age';
const AGE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
export const AGE_REQUIRED_MESSAGE = 'DARE is for people aged 18 or over. Please confirm your age to continue.';

const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('base64url');

/** The Set-Cookie value for an anonymous visitor who confirmed being 18 or over, or null when no signing secret exists (fail closed). */
export function mintAgeCookie(trialId: string, env: Record<string, string | undefined> = process.env, now = Date.now()): string | null {
  const secret = getSigningSecret(env);
  if (!secret) return null;
  const payload = JSON.stringify({ id: `age:${trialId}`, iat: now });
  const token = `${Buffer.from(payload).toString('base64url')}.${sign(payload, secret)}`;
  return [`${AGE_COOKIE_NAME}=${encodeURIComponent(token)}`, 'Path=/', `Max-Age=${AGE_COOKIE_MAX_AGE_SECONDS}`, 'HttpOnly', 'Secure', 'SameSite=Lax'].join('; ');
}

/** Whether this browser's age cookie is genuine, unexpired and belongs to this very trial. */
export function trialAgeConfirmed(cookieHeader: string | null | undefined, trialId: string, env: Record<string, string | undefined> = process.env, now = Date.now()): boolean {
  try {
    const secret = getSigningSecret(env);
    const raw = readCookie(cookieHeader, AGE_COOKIE_NAME);
    if (!secret || !raw) return false;
    const dot = raw.indexOf('.');
    if (dot <= 0) return false;
    const payload = Buffer.from(raw.slice(0, dot), 'base64url').toString('utf8');
    const given = Buffer.from(raw.slice(dot + 1));
    const expected = Buffer.from(sign(payload, secret));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
    const p = JSON.parse(payload) as { id?: unknown; iat?: unknown };
    return p.id === `age:${trialId}` && typeof p.iat === 'number' && p.iat > 0 && now - p.iat <= AGE_COOKIE_MAX_AGE_SECONDS * 1000;
  } catch {
    return false;
  }
}

export interface AdultDeps {
  resolve?: (headers: RequestHeaders) => Promise<ResolveCallerResult>;
  env?: Record<string, string | undefined>;
}

/** The identity check of every AI route, with the age check: no confirmation, no call (403 age_required). */
export async function resolveAdultCaller(headers: RequestHeaders, deps: AdultDeps = {}): Promise<ResolveCallerResult> {
  const resolved = await (deps.resolve ?? resolveCallerIdentity)(headers);
  if (!resolved.ok) return resolved;
  const adult = resolved.identity.kind === 'user' ? Boolean(resolved.ageConfirmedAt) : trialAgeConfirmed(headers.cookie, resolved.identity.trialId, deps.env);
  if (!adult) return { ok: false, status: 403, reason: 'age_required', message: AGE_REQUIRED_MESSAGE };
  return resolved;
}

/** Writes the time of the confirmation into the account's own metadata (merged, never replacing the name or the address). */
export async function recordUserAge(userId: string, at: string): Promise<boolean> {
  try {
    const client = getSupabaseServiceClient();
    if (!client) return false;
    const { data, error } = await client.auth.admin.getUserById(userId);
    if (error || !data?.user) return false;
    const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
    const { error: updateError } = await client.auth.admin.updateUserById(userId, { user_metadata: { ...meta, age_confirmed_at: at } });
    return !updateError;
  } catch {
    return false;
  }
}
