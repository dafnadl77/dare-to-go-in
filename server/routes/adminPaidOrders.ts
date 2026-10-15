import { errorResult, okResult, type HandlerResult } from '../httpResult.js';
import { verifyBearerToken, type RequestHeaders } from '../callerIdentity.js';
import { isDreamAdmin } from '../unlimitedAccess.js';
import { listPaidOrders, type PaidOrdersOutcome } from '../paidOrders.js';

/**
 * GET /api/credits?admin=orders — the administrator's list of completed purchases, so the transaction-details document and the tax invoice
 * can be sent by hand to the right account email. Read-only. Who is calling is ALWAYS the verified account behind the bearer token; the
 * admin check is made first, here and again inside the database function; a regular account, a granted account, a missing token and an
 * undetermined role are all refused before anything is read. Customer names and phones are not in this database and never appear.
 */

export interface AdminPaidOrdersDeps {
  verify: typeof verifyBearerToken;
  isAdmin: (userId: string) => Promise<boolean | null>;
  list: (actorId: string, limit?: number) => Promise<PaidOrdersOutcome | null>;
}

const realDeps: AdminPaidOrdersDeps = { verify: verifyBearerToken, isAdmin: isDreamAdmin, list: listPaidOrders };

export async function handleAdminPaidOrders(method: string | undefined, requestHeaders: RequestHeaders, deps: AdminPaidOrdersDeps = realDeps): Promise<HandlerResult> {
  if (method !== 'GET') return errorResult(405, 'request_failed', 'Method not allowed.');
  const authHeader = requestHeaders.authorization;
  if (!authHeader) return errorResult(401, 'not_authenticated', 'This area requires being signed in.');
  const verified = await deps.verify(authHeader);
  if (!verified.ok) return errorResult(verified.status, verified.reason, verified.message);
  const admin = await deps.isAdmin(verified.userId);
  if (admin === null) return errorResult(503, 'not_configured', 'The purchases list is not available right now.');
  if (admin !== true) return errorResult(403, 'forbidden', 'Only the administrator can use this area.');
  const result = await deps.list(verified.userId);
  if (!result) return errorResult(503, 'not_configured', 'The purchases list is not available right now.');
  if (result.status !== 'ok') return errorResult(403, 'forbidden', 'Only the administrator can use this area.');
  return okResult({ items: result.items });
}
