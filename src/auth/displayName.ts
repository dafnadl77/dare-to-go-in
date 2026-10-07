import type { User } from '@supabase/supabase-js';

/**
 * The dreamer's name, from the data the account already carries on its Supabase auth user (`user_metadata`) — there is no
 * profile table, and a name is never inferred from the email address.
 *
 *   1. `displayName` — the name the dreamer typed in Settings (this app's own key; a Google sign-in never overwrites it)
 *   2. `full_name`, then `name` — what Google supplies for an account created with "Continue with Google"
 *
 * An account with none of these (an email sign-up that has not added one) simply has no name: callers show a clean fallback.
 */
export const DISPLAY_NAME_METADATA_KEY = 'displayName';
export const MAX_DISPLAY_NAME_LENGTH = 60;

/** A usable name, or null: trimmed, single-spaced, 1–60 characters, no control characters and nothing that looks like an email address. */
export function normalizeDisplayName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length < 1 || name.length > MAX_DISPLAY_NAME_LENGTH) return null;
  if ([...name].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)) return null;
  if (name.includes('@')) return null;
  if (!/\p{L}/u.test(name)) return null;
  return name;
}

export function fullNameOfUser(user: Pick<User, 'user_metadata'> | null | undefined): string | null {
  const meta = user?.user_metadata;
  if (!meta) return null;
  return normalizeDisplayName(meta[DISPLAY_NAME_METADATA_KEY]) ?? normalizeDisplayName(meta.full_name) ?? normalizeDisplayName(meta.name);
}

/** The first word of a full name — what the greeting uses. */
export function firstNameOf(fullName: string | null): string | null {
  if (!fullName) return null;
  return fullName.split(' ')[0] || null;
}

export function firstNameOfUser(user: Pick<User, 'user_metadata'> | null | undefined): string | null {
  return firstNameOf(fullNameOfUser(user));
}
