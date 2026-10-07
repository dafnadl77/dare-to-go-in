import { DREAM_PACKAGES, type PackageId } from '../../src/pricing/packages.js';

/**
 * The server-side price list: the ONLY place an amount or a credit count for a purchase is decided. The browser sends a
 * package id and nothing else; everything below is derived from packages.ts (the same data the Pricing page shows) and
 * pinned by tests to the launch prices (59 / 149 / 279 ILS for 3 / 10 / 25 credits).
 */
export type PaidPackageId = Exclude<PackageId, 'first_dream'>;

export interface PaidPackage {
  id: PaidPackageId;
  /** Whole ILS, as shown to the customer. */
  amountIls: number;
  credits: number;
  /** The title on the Grow payment page: plain ASCII only (Grow rejects special characters in parameters). */
  title: string;
}

const TITLES: Record<PaidPackageId, string> = {
  go_deeper_3: 'DARE TO GO IN GO DEEPER 3 dreams',
  explore_10: 'DARE TO GO IN EXPLORE 10 dreams',
  dive_in_25: 'DARE TO GO IN DIVE IN 25 dreams',
};

export function paidPackage(id: unknown): PaidPackage | null {
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(TITLES, id)) return null;
  const def = DREAM_PACKAGES.find((p) => p.id === id);
  if (!def || def.priceIls === null || !Number.isInteger(def.priceIls) || def.priceIls < 1) return null;
  return { id: id as PaidPackageId, amountIls: def.priceIls, credits: def.dreamCount, title: TITLES[id as PaidPackageId] };
}

export const PAID_PACKAGE_IDS = Object.keys(TITLES) as PaidPackageId[];
