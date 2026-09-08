import type { AuthError } from '@supabase/supabase-js';

/**
 * Maps a raw Supabase AuthError (or a thrown network exception) to one of
 * a small set of known categories — never shown to the dreamer as raw
 * Supabase text (per instruction: friendly, human messages only). Each
 * category has its own i18n key (see translations.ts's `auth` namespace)
 * so the actual wording stays centralized and bilingual.
 *
 * Pattern-matched on the English message Supabase Auth returns (its API
 * doesn't return a stable machine-readable error code for every one of
 * these cases across versions — matching on message substrings is the
 * documented, commonly-used approach) — deliberately case-insensitive
 * and permissive, so a small wording change on Supabase's side degrades
 * to the generic message rather than showing raw text.
 */
export type AuthErrorCode =
  | 'invalid_email'
  | 'invalid_credentials'
  | 'account_exists'
  | 'weak_password'
  | 'network_error'
  | 'rate_limited'
  | 'generic';

const AUTH_ERROR_KEY: Record<AuthErrorCode, string> = {
  invalid_email: 'auth.errorInvalidEmail',
  invalid_credentials: 'auth.errorInvalidCredentials',
  account_exists: 'auth.errorAccountExists',
  weak_password: 'auth.errorWeakPassword',
  network_error: 'auth.errorNetwork',
  rate_limited: 'auth.errorRateLimited',
  generic: 'auth.errorGeneric',
};

export function classifyAuthError(error: unknown): AuthErrorCode {
  // A thrown exception (not a Supabase AuthError at all) is the
  // network-failure case — fetch itself never reached Supabase.
  if (error instanceof TypeError) return 'network_error';

  const message = (error as Partial<AuthError> | undefined)?.message?.toLowerCase() ?? '';
  if (!message) return 'generic';

  // Observed directly against the live project during testing: Supabase's
  // shared free-tier email sender has its own low rate limit, independent
  // of anything this app controls — worth its own honest message rather
  // than the generic fallback.
  if (message.includes('rate limit')) {
    return 'rate_limited';
  }
  if (message.includes('already registered') || message.includes('already exists') || message.includes('user already')) {
    return 'account_exists';
  }
  if (message.includes('invalid login credentials') || message.includes('invalid email or password')) {
    return 'invalid_credentials';
  }
  if (message.includes('password') && (message.includes('short') || message.includes('weak') || message.includes('at least'))) {
    return 'weak_password';
  }
  if (message.includes('invalid') && message.includes('email')) {
    return 'invalid_email';
  }
  if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
    return 'network_error';
  }
  return 'generic';
}

/** `t` is the caller's own useLanguage().t — this module is a plain
    function, not a component, so it takes the translator rather than
    calling the hook itself (matches the pattern already established for
    dreamElements.ts's buildReflectionQuestion). */
export function describeAuthError(error: unknown, t: (path: string) => string): string {
  return t(AUTH_ERROR_KEY[classifyAuthError(error)]);
}
