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
  /** The server says this account is the app owner: unlimited dreams, no credits, no package. Present only when true. */
  owner?: true;
  /** The server says this account is the ADMINISTRATOR (only ever with owner): it shows the unlimited-access area. An account that was granted unlimited access is an owner, never an admin. */
  admin?: true;
  /** The server could not tell whether this is the app owner: never act on a zero balance. Present only when true. */
  roleUnknown?: true;
  /** Every credit the account was ever granted, and in how many grants (server-read from the credit ledger). Absent = not known. */
  grantedCredits?: number;
  grantCount?: number;
  /** The account's one free dream was already completed. Absent = not known. */
  freeDreamUsed?: boolean;
  /** The free dream the account was given as a credit (0 or 1; counted apart from purchased ones). Absent = none. */
  freeGranted?: number;
  /** 'available' = the free dream is still waiting for the account; 'used' = it was used. Absent = not known. */
  freeDream?: 'available' | 'used';
  /** The server could not settle the account's free-dream decision just now: a balance of 0 may only mean "not decided yet", so nothing may act on it. */
  freeDreamUndecided?: true;
}

const PURCHASABLE: readonly PackageId[] = ['go_deeper_3', 'explore_10', 'dive_in_25'];

export function parseCreditSummary(data: unknown): CreditSummary | null {
  if (!data || typeof data !== 'object') return null;
  const body = data as { balance?: unknown; purchasedPackage?: unknown; owner?: unknown; admin?: unknown; roleUnknown?: unknown; grantedCredits?: unknown; grantCount?: unknown; freeDreamUsed?: unknown; freeGranted?: unknown; freeDream?: unknown; freeDreamUndecided?: unknown };
  if (typeof body.balance !== 'number' || !Number.isFinite(body.balance)) return null;
  let plan: PackageId | null = null;
  if (body.purchasedPackage === null) plan = 'first_dream';
  else if (typeof body.purchasedPackage === 'string' && (PURCHASABLE as readonly string[]).includes(body.purchasedPackage)) plan = body.purchasedPackage as PackageId;
  if (body.owner === true) return { balance: body.balance, plan, owner: true, ...(body.admin === true ? { admin: true as const } : {}) };
  if (body.roleUnknown === true) return { balance: body.balance, plan, roleUnknown: true };
  const summary: CreditSummary = { balance: body.balance, plan };
  const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  const granted = count(body.grantedCredits);
  const grants = count(body.grantCount);
  if (granted !== undefined && grants !== undefined) {
    summary.grantedCredits = granted;
    summary.grantCount = grants;
  }
  if (typeof body.freeDreamUsed === 'boolean') summary.freeDreamUsed = body.freeDreamUsed;
  const free = count(body.freeGranted);
  if (free !== undefined && free > 0) summary.freeGranted = free;
  if (body.freeDream === 'available' || body.freeDream === 'used') summary.freeDream = body.freeDream;
  if (body.freeDreamUndecided === true) summary.freeDreamUndecided = true;
  return summary;
}
