import { errorResult, okResult, type HandlerResult } from '../httpResult.js';
import { verifyBearerToken, type RequestHeaders } from '../callerIdentity.js';
import {
  isDreamAdmin,
  grantUnlimitedAccess,
  revokeUnlimitedAccess,
  listUnlimitedAccess,
  type GrantOutcome,
  type RevokeOutcome,
  type ListOutcome,
} from '../unlimitedAccess.js';

/**
 * /api/credits?admin=unlimited — the admin's "unlimited access" area (GET = the list, POST = grant or revoke).
 *
 * It rides on the existing credits function (the project is at its function limit). Who is calling is ALWAYS the verified account
 * behind the bearer token — never anything in the body or the headers. The admin check is made first, here and again inside every
 * database function: a regular account, a granted account or an unknown role is refused before anything is read or written, and no
 * route can create an account (an email that is not a registered, confirmed account is answered, nothing more). The body names only
 * the TARGET (an email to grant, an account id to revoke), which only the admin can act on.
 */

export interface AdminUnlimitedDeps {
  verify: typeof verifyBearerToken;
  isAdmin: (userId: string) => Promise<boolean | null>;
  grant: (actorId: string, email: string) => Promise<GrantOutcome | null>;
  revoke: (actorId: string, targetUserId: string) => Promise<RevokeOutcome | null>;
  list: (actorId: string) => Promise<ListOutcome | null>;
}

const realDeps: AdminUnlimitedDeps = {
  verify: verifyBearerToken,
  isAdmin: isDreamAdmin,
  grant: grantUnlimitedAccess,
  revoke: revokeUnlimitedAccess,
  list: listUnlimitedAccess,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_AVAILABLE = 'The unlimited-access area is not available right now.';

export async function handleUnlimitedAccess(
  method: string | undefined,
  body: unknown,
  requestHeaders: RequestHeaders,
  deps: AdminUnlimitedDeps = realDeps,
): Promise<HandlerResult> {
  if (method !== 'GET' && method !== 'POST') return errorResult(405, 'request_failed', 'Method not allowed.');
  const authHeader = requestHeaders.authorization;
  if (!authHeader) return errorResult(401, 'not_authenticated', 'This area requires being signed in.');
  const verified = await deps.verify(authHeader);
  if (!verified.ok) return errorResult(verified.status, verified.reason, verified.message);

  // The admin check comes before the request is even looked at. An undetermined answer is never "admin".
  const admin = await deps.isAdmin(verified.userId);
  if (admin === null) return errorResult(503, 'not_configured', NOT_AVAILABLE);
  if (admin !== true) return errorResult(403, 'forbidden', 'Only the administrator can use this area.');

  if (method === 'GET') {
    const listed = await deps.list(verified.userId);
    if (!listed) return errorResult(503, 'not_configured', NOT_AVAILABLE);
    if (listed.status !== 'ok') return errorResult(403, 'forbidden', 'Only the administrator can use this area.');
    return okResult({ items: listed.items });
  }

  const input = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  if (input.action === 'grant') {
    if (typeof input.email !== 'string' || input.email.length > 254) return errorResult(400, 'invalid_email', 'Enter a valid email address.');
    const outcome = await deps.grant(verified.userId, input.email);
    if (!outcome) return errorResult(503, 'not_configured', NOT_AVAILABLE);
    switch (outcome.status) {
      case 'granted':
      case 'already_granted':
      case 'already_unlimited':
        return okResult({ status: outcome.status, item: { userId: outcome.userId, email: outcome.email } });
      case 'not_registered':
        return errorResult(404, 'not_registered', 'There is no registered account with this email. No account was created.');
      case 'invalid_email':
        return errorResult(400, 'invalid_email', 'Enter a valid email address.');
      case 'not_authorized':
        return errorResult(403, 'forbidden', 'Only the administrator can use this area.');
    }
  }
  if (input.action === 'revoke') {
    if (typeof input.userId !== 'string' || !UUID.test(input.userId)) return errorResult(400, 'request_failed', 'Choose an account from the list.');
    const outcome = await deps.revoke(verified.userId, input.userId);
    if (!outcome) return errorResult(503, 'not_configured', NOT_AVAILABLE);
    if (outcome.status === 'revoked') return okResult({ status: 'revoked', item: { userId: outcome.userId, email: outcome.email } });
    if (outcome.status === 'not_found') return errorResult(404, 'not_found', 'This account no longer has unlimited access.');
    return errorResult(403, 'forbidden', 'Only the administrator can use this area.');
  }
  return errorResult(400, 'request_failed', 'Unknown request.');
}
