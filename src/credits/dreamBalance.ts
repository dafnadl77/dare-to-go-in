import type { CreditSummary } from './creditSummary';

/**
 * How the server's credit summary is described to the dreamer. Pure: every number shown comes from the server's own answer
 * (the credits mechanism in Supabase), nothing is computed in the browser beyond choosing the wording.
 *
 *   owner           the app owner: unlimited dreams, no number at all
 *   package         one package, so "N of TOTAL" is exactly right
 *   across          several grants (or a total that does not map to one package): "N of TOTAL", the total PURCHASED, never "of a package"
 *   across-free     purchased dreams plus the account's own free dream: "N of TOTAL", the total received
 *   free-available  the account's free dream is waiting and nothing was purchased
 *   none-purchased  something was bought, and nothing is left
 *   free-used       a free account whose free dream was used
 *   free-none       a free account with nothing to use (and no record of a used free dream)
 */
export type DreamBalanceKind = 'owner' | 'package' | 'across' | 'across-free' | 'free-available' | 'none-purchased' | 'free-used' | 'free-none';

export interface DreamBalanceView {
  kind: DreamBalanceKind;
  /** Dreams left (the server's balance). */
  remaining: number;
  /** Dreams ever received, when the server said so (and it is a sensible total for the balance). */
  total: number | null;
}

export function describeBalance(summary: CreditSummary): DreamBalanceView {
  const remaining = Math.max(0, Math.floor(summary.balance));
  if (summary.owner) return { kind: 'owner', remaining, total: null };
  const granted = summary.grantedCredits;
  const count = summary.grantCount;
  // The free dream counts in the figures only while it is still waiting: it is the first dream used, so once it is spent what is left
  // is all purchased and reads as "N of the purchased".
  const free = summary.freeDream === 'available' ? (summary.freeGranted ?? 0) : 0;
  const hasGrants = typeof granted === 'number' && granted > 0;
  if (!hasGrants) {
    // Nothing purchased. The account's own free dream may be waiting; otherwise a balance can still exist (e.g. credits given by hand).
    if (remaining > 0) return summary.freeDream === 'available' ? { kind: 'free-available', remaining, total: null } : { kind: 'across', remaining, total: null };
    return { kind: summary.freeDreamUsed === true ? 'free-used' : 'free-none', remaining: 0, total: null };
  }
  // Everything this account ever received: what it purchased plus its own free dream, if it was given one.
  const total = granted + free;
  if (remaining === 0) return { kind: 'none-purchased', remaining: 0, total };
  // One purchase, no free dream, and the balance fits inside it: "N of TOTAL in your package". Several purchases (or a free dream in the
  // mix): one overall figure with its total — never presented as the remainder of a single package.
  if (count === 1 && free === 0 && remaining <= granted) return { kind: 'package', remaining, total: granted };
  // A balance larger than everything received (credits given by hand) cannot be "N of TOTAL": say only what is left.
  if (remaining > total) return { kind: 'across', remaining, total: null };
  return { kind: free > 0 ? 'across-free' : 'across', remaining, total };
}

/** The i18n key and values for what to say, for one described balance. Exported so the wording rules are tested without a browser. */
export function balanceMessageKey(view: DreamBalanceView, variant: 'archive' | 'pricing'): string | null {
  const one = view.remaining === 1;
  switch (view.kind) {
    case 'owner':
      return 'archive.balanceOwner';
    case 'package':
      if (variant === 'pricing') return one ? 'pricing.yourPackageRemainingOne' : 'pricing.yourPackageRemaining';
      return one ? 'archive.balanceOne' : 'archive.balanceRemaining';
    case 'across':
      // With the total received (so "12 of 13" is visible); without it, just what is left.
      if (view.total !== null) return one ? 'archive.balanceOneAcrossOf' : 'archive.balanceAcrossOf';
      return one ? 'archive.balanceOneAcross' : 'archive.balanceAcross';
    case 'across-free':
      return 'archive.balanceAcrossFreeOf';
    case 'free-available':
      return 'archive.balanceFreeAvailable';
    case 'none-purchased':
      return 'archive.balanceNone';
    case 'free-used':
      return 'archive.balanceFreeUsed';
    case 'free-none':
      return 'archive.balanceFreeNone';
  }
}
