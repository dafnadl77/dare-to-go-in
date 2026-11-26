import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Authenticates the machine caller of the payment-completion route (the Make scenario) with a dedicated server-side
 * secret sent as `Authorization: Bearer <secret>`.
 *
 *  - The secret exists only in the server environment (MAKE_COMPLETION_SECRET), at least 32 characters. Without it the
 *    route refuses everything (fail closed): there is no default and no fallback to any other credential.
 *  - ROTATION (2026-11-26): MAKE_COMPLETION_SECRET_PREVIOUS may hold the OLD secret for the few minutes it takes to switch
 *    Make's header, so no valid notification is refused during the change. It is accepted ONLY next to a valid primary secret,
 *    only when it is itself valid (32+ characters) and different from the primary. Anything else about it (unset, empty,
 *    short, equal to the primary) leaves the check exactly as it is with one secret. It never stands in for a missing primary.
 *  - The comparison hashes every side (equal length) and uses timingSafeEqual; with a previous secret configured BOTH
 *    comparisons always run, so the timing does not reveal which one matched. Neither value nor length leaks.
 *  - The secrets are never logged, echoed or returned. 'ok_previous' only says which slot matched, so the operator can see
 *    when Make still sends the old value and when it is safe to remove it.
 */
export type CompletionAuth = 'ok' | 'ok_previous' | 'unauthorized' | 'not_configured';

export const MIN_COMPLETION_SECRET_LENGTH = 32;

const digest = (value: string) => createHash('sha256').update(value).digest();
const valid = (value: string | undefined): value is string => typeof value === 'string' && value.length >= MIN_COMPLETION_SECRET_LENGTH;

/** 'set_but_unusable' = the rotation slot holds something that will NOT be accepted (short or equal to the primary). */
export function previousSecretState(env: NodeJS.ProcessEnv = process.env): 'unset' | 'active' | 'set_but_unusable' {
  const previous = env.MAKE_COMPLETION_SECRET_PREVIOUS;
  if (previous === undefined || previous === '') return 'unset';
  if (!valid(previous) || previous === env.MAKE_COMPLETION_SECRET) return 'set_but_unusable';
  return 'active';
}

export function checkCompletionAuth(authorizationHeader: string | undefined | null, env: NodeJS.ProcessEnv = process.env): CompletionAuth {
  const secret = env.MAKE_COMPLETION_SECRET;
  if (!valid(secret)) return 'not_configured';
  const match = /^Bearer\s+(\S+)$/i.exec((authorizationHeader ?? '').trim());
  if (!match) return 'unauthorized';
  const given = digest(match[1]);
  const primaryOk = timingSafeEqual(given, digest(secret));
  if (previousSecretState(env) !== 'active') return primaryOk ? 'ok' : 'unauthorized';
  const previousOk = timingSafeEqual(given, digest(env.MAKE_COMPLETION_SECRET_PREVIOUS as string));
  if (primaryOk) return 'ok';
  return previousOk ? 'ok_previous' : 'unauthorized';
}
