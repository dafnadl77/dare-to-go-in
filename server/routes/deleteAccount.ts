import { errorResult, okResult, type HandlerResult } from '../httpResult.js';
import { verifyBearerToken, type RequestHeaders, type VerifyBearerResult } from '../callerIdentity.js';
import { isValidConfirmation, performAccountDeletion, type AccountDeletionDeps } from '../accountDeletion.js';
import { accountDeletionStore } from '../accountDeletionStore.js';

export interface DeleteAccountDeps {
  verifyBearer: (authorizationHeader: string) => Promise<VerifyBearerResult>;
  deletion: AccountDeletionDeps;
}

const realDeps: DeleteAccountDeps = { verifyBearer: verifyBearerToken, deletion: accountDeletionStore };

/**
 * POST /api/delete-account: permanently deletes the CALLER's own account.
 *
 *  - The account is ALWAYS the verified bearer token's own user. The request body is
 *    never read for an id: an owner_id / user_id / email a client puts there is ignored,
 *    so one account can never target another (see the tests).
 *  - The dreamer's typed confirmation (DELETE / מחיקה) is required and checked here too,
 *    so calling the API directly without it does nothing.
 *  - Success is reported only after the whole ordered deletion, Auth user last, completed
 *    (see accountDeletion.ts). A partial failure answers 502 deletion_incomplete and is safe
 *    to repeat; no internal detail is returned.
 *  - A second call after success has no valid token (the user is gone) and is refused 401.
 */
export async function handleDeleteAccount(
  rawBody: unknown,
  requestHeaders: RequestHeaders,
  deps: DeleteAccountDeps = realDeps,
): Promise<HandlerResult> {
  const authHeader = requestHeaders.authorization;
  if (!authHeader) {
    return errorResult(401, 'not_authenticated', 'Deleting an account requires being signed in.');
  }
  const verified = await deps.verifyBearer(authHeader);
  if (!verified.ok) {
    return errorResult(verified.status, verified.reason, verified.message);
  }

  const confirmation = rawBody && typeof rawBody === 'object' ? (rawBody as { confirmation?: unknown }).confirmation : undefined;
  if (!isValidConfirmation(confirmation)) {
    return errorResult(400, 'confirmation_required', 'The confirmation text was not entered exactly.');
  }

  const result = await performAccountDeletion(verified.userId, deps.deletion);
  if (!result.ok) {
    return errorResult(502, 'deletion_incomplete', 'Your account could not be fully deleted. Nothing was reported as deleted; please try again.');
  }
  return okResult({ deleted: true });
}
