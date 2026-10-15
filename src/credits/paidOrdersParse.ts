import type { DocumentOrder, PurchasablePackage } from '../payments/transactionDocument';

const PACKAGES: readonly PurchasablePackage[] = ['go_deeper_3', 'explore_10', 'dive_in_25'];
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The administrator's purchases list as the server sends it. Strict: any unexpected shape is "could not be read" (null), never a guess. */
export function parsePaidOrdersResponse(json: unknown): DocumentOrder[] | null {
  if (!isRecord(json) || !Array.isArray(json.items)) return null;
  const items: DocumentOrder[] = [];
  for (const raw of json.items) {
    if (!isRecord(raw)) return null;
    const { orderId, accountEmail, packageId, credits, amountIls, paidAt } = raw;
    if (typeof orderId !== 'string' || !/^[0-9a-f]{8,64}$/i.test(orderId)) return null;
    if (accountEmail !== null && typeof accountEmail !== 'string') return null;
    if (typeof packageId !== 'string' || !(PACKAGES as readonly string[]).includes(packageId)) return null;
    if (typeof credits !== 'number' || typeof amountIls !== 'number') return null;
    if (paidAt !== null && typeof paidAt !== 'string') return null;
    items.push({ orderId, accountEmail, packageId: packageId as PurchasablePackage, credits, amountIls, paidAt });
  }
  return items;
}
