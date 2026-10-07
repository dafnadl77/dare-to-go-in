import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Authenticates the machine caller of the payment-completion route (the Make scenario) with a dedicated server-side
 * secret sent as `Authorization: Bearer <secret>`.
 *
 *  - The secret exists only in the server environment (MAKE_COMPLETION_SECRET), at least 32 characters. Without it the
 *    route refuses everything (fail closed): there is no default and no fallback to any other credential.
 *  - The comparison hashes both sides (equal length) and uses timingSafeEqual, so neither the value nor its length leaks.
 *  - The secret is never logged, echoed or returned.
 */
export type CompletionAuth = 'ok' | 'unauthorized' | 'not_configured';

export const MIN_COMPLETION_SECRET_LENGTH = 32;

export function checkCompletionAuth(authorizationHeader: string | undefined | null, env: NodeJS.ProcessEnv = process.env): CompletionAuth {
  const secret = env.MAKE_COMPLETION_SECRET;
  if (!secret || secret.length < MIN_COMPLETION_SECRET_LENGTH) return 'not_configured';
  const match = /^Bearer\s+(\S+)$/i.exec((authorizationHeader ?? '').trim());
  if (!match) return 'unauthorized';
  const given = createHash('sha256').update(match[1]).digest();
  const expected = createHash('sha256').update(secret).digest();
  return timingSafeEqual(given, expected) ? 'ok' : 'unauthorized';
}
