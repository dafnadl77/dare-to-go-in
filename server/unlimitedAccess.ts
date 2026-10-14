import { getSupabaseServiceClient } from './supabaseServiceClient.js';

/**
 * The admin's "unlimited access" store: thin wrappers over the database functions of 20261014_unlimited_access.sql. The actor is
 * ALWAYS the verified account id the server derived from the bearer token; every function re-checks, in SQL, that the actor is the
 * admin, so a mistake here can never let another account grant or revoke. null = could not be determined (callers fail closed).
 */

export interface UnlimitedAccessItem {
  userId: string;
  email: string;
  grantedAt: string;
}

export type GrantOutcome =
  | { status: 'granted' | 'already_granted' | 'already_unlimited'; userId: string; email: string }
  | { status: 'not_registered' | 'invalid_email' | 'not_authorized' };

export type RevokeOutcome = { status: 'revoked'; userId: string; email: string } | { status: 'not_found' | 'not_authorized' };

export type ListOutcome = { status: 'ok'; items: UnlimitedAccessItem[] } | { status: 'not_authorized' };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Whether this VERIFIED account is the admin (the app owner). null = not determined: never treated as admin. */
export async function isDreamAdmin(userId: string): Promise<boolean | null> {
  const client = getSupabaseServiceClient();
  if (!client) return null;
  const { data, error } = await client.rpc('is_dream_admin', { p_actor: userId });
  return error || typeof data !== 'boolean' ? null : data;
}

export function parseGrantOutcome(data: unknown): GrantOutcome | null {
  if (!isRecord(data) || typeof data.status !== 'string') return null;
  switch (data.status) {
    case 'granted':
    case 'already_granted':
    case 'already_unlimited':
      return typeof data.user_id === 'string' && typeof data.email === 'string' ? { status: data.status, userId: data.user_id, email: data.email } : null;
    case 'not_registered':
    case 'invalid_email':
    case 'not_authorized':
      return { status: data.status };
    default:
      return null;
  }
}

export function parseRevokeOutcome(data: unknown): RevokeOutcome | null {
  if (!isRecord(data) || typeof data.status !== 'string') return null;
  if (data.status === 'revoked') return typeof data.user_id === 'string' && typeof data.email === 'string' ? { status: 'revoked', userId: data.user_id, email: data.email } : null;
  if (data.status === 'not_found' || data.status === 'not_authorized') return { status: data.status };
  return null;
}

export function parseListOutcome(data: unknown): ListOutcome | null {
  if (!isRecord(data) || typeof data.status !== 'string') return null;
  if (data.status === 'not_authorized') return { status: 'not_authorized' };
  if (data.status !== 'ok' || !Array.isArray(data.items)) return null;
  const items: UnlimitedAccessItem[] = [];
  for (const raw of data.items) {
    if (!isRecord(raw) || typeof raw.user_id !== 'string' || typeof raw.email !== 'string' || typeof raw.granted_at !== 'string') return null;
    items.push({ userId: raw.user_id, email: raw.email, grantedAt: raw.granted_at });
  }
  return { status: 'ok', items };
}

export async function grantUnlimitedAccess(actorId: string, email: string): Promise<GrantOutcome | null> {
  const client = getSupabaseServiceClient();
  if (!client) return null;
  const { data, error } = await client.rpc('admin_grant_unlimited', { p_actor: actorId, p_email: email });
  return error ? null : parseGrantOutcome(data);
}

export async function revokeUnlimitedAccess(actorId: string, targetUserId: string): Promise<RevokeOutcome | null> {
  const client = getSupabaseServiceClient();
  if (!client) return null;
  const { data, error } = await client.rpc('admin_revoke_unlimited', { p_actor: actorId, p_user: targetUserId });
  return error ? null : parseRevokeOutcome(data);
}

export async function listUnlimitedAccess(actorId: string): Promise<ListOutcome | null> {
  const client = getSupabaseServiceClient();
  if (!client) return null;
  const { data, error } = await client.rpc('admin_list_unlimited', { p_actor: actorId });
  return error ? null : parseListOutcome(data);
}
