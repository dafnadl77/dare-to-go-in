import type { PackageId } from '../pricing/packages';

/**
 * What the SERVER reports about the signed-in account (GET /api/credits). Purely advisory for the UI — the real enforcement
 * is the server's atomic spend inside /api/dream-analysis; a client can neither set nor spend a balance.
 *
 * `plan` is the package the account PURCHASED, as the server read it from the account's completed orders — never derived
 * from `balance` (a 3-dream buyer who has used a dream still holds the 3-dream package):
 *   'go_deeper_3' | 'explore_10' | 'dive_in_25'   the latest completed purchase
 *   'first_dream'                                  no completed purchase (free)
 *   null                                           the server could not tell: show nothing, never guess
 */
export interface CreditSummary {
  balance: number;
  plan: PackageId | null;
}

const PURCHASABLE: readonly PackageId[] = ['go_deeper_3', 'explore_10', 'dive_in_25'];

export function parseCreditSummary(data: unknown): CreditSummary | null {
  if (!data || typeof data !== 'object') return null;
  const body = data as { balance?: unknown; purchasedPackage?: unknown };
  if (typeof body.balance !== 'number' || !Number.isFinite(body.balance)) return null;
  let plan: PackageId | null = null;
  if (body.purchasedPackage === null) plan = 'first_dream';
  else if (typeof body.purchasedPackage === 'string' && (PURCHASABLE as readonly string[]).includes(body.purchasedPackage)) plan = body.purchasedPackage as PackageId;
  return { balance: body.balance, plan };
}
