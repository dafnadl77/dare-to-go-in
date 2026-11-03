import type { PaidPackageId } from '../payments/checkout';

/**
 * The paid package a SIGNED-OUT visitor chose on Pricing, held only for the trip through sign-up / sign-in (including the confirmation
 * e-mail opened in another tab and the Google round trip). Afterwards Pricing opens that package's checkout dialog, where the customer
 * still enters their details, accepts the terms and presses pay themselves: nothing is charged or reserved by this record.
 *
 * Only the package id is kept (no personal details, no price: the server decides the price). It is used once, expires after two hours,
 * is dropped when the visitor backs out of the sign-in screen, and is removed on sign-out (see localAccountState.ts).
 */
export const PENDING_PACKAGE_KEY = 'dare.pendingPackage.v1';
export const PENDING_PACKAGE_TTL_MS = 2 * 60 * 60 * 1000;
const PAID_PACKAGE_IDS: readonly PaidPackageId[] = ['go_deeper_3', 'explore_10', 'dive_in_25'];

export interface PackageStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const defaultStore = (): PackageStore | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export function isPaidPackageId(value: unknown): value is PaidPackageId {
  return typeof value === 'string' && (PAID_PACKAGE_IDS as readonly string[]).includes(value);
}

export function setPendingPackage(id: PaidPackageId, store: PackageStore | null = defaultStore(), now = Date.now()): void {
  try {
    store?.setItem(PENDING_PACKAGE_KEY, JSON.stringify({ id, savedAt: now }));
  } catch {
    /* blocked storage: the visitor simply chooses the package again after signing in */
  }
}

/** The chosen package if a valid, unexpired record exists; a malformed or expired one is removed. Does not consume it. */
export function getPendingPackage(store: PackageStore | null = defaultStore(), now = Date.now()): PaidPackageId | null {
  try {
    const raw = store?.getItem(PENDING_PACKAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const { id, savedAt } = (parsed && typeof parsed === 'object' ? parsed : {}) as { id?: unknown; savedAt?: unknown };
    if (isPaidPackageId(id) && typeof savedAt === 'number' && now - savedAt >= 0 && now - savedAt <= PENDING_PACKAGE_TTL_MS) return id;
    clearPendingPackage(store);
    return null;
  } catch {
    clearPendingPackage(store);
    return null;
  }
}

export function clearPendingPackage(store: PackageStore | null = defaultStore()): void {
  try {
    store?.removeItem(PENDING_PACKAGE_KEY);
  } catch {
    /* nothing else to do */
  }
}

/** Reads the record and removes it: the package is offered back exactly once. */
export function takePendingPackage(store: PackageStore | null = defaultStore(), now = Date.now()): PaidPackageId | null {
  const id = getPendingPackage(store, now);
  if (id) clearPendingPackage(store);
  return id;
}
