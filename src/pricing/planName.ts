import type { PackageId } from './packages';
import { DREAM_PACKAGES } from './packages';

/**
 * The name shown to the dreamer for a package: "Free" for the free tier, otherwise "<count> Dreams" (עברית: "<count> חלומות"),
 * where the count comes from packages.ts. The internal ids (first_dream, go_deeper_3, explore_10, dive_in_25) are unchanged.
 */
export function planDisplayName(plan: PackageId, t: (path: string) => string): string {
  const def = DREAM_PACKAGES.find((p) => p.id === plan);
  if (!def || def.priceIls === null) return t('pricing.planFree');
  return t('pricing.dreamsCountLabel').replace('{count}', String(def.dreamCount));
}
