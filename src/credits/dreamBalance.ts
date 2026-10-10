import type { CreditSummary } from './creditSummary';

/**
 * How the server's credit summary is described to the dreamer. Pure: every number shown comes from the server's own answer
 * (the credits mechanism in Supabase), nothing is computed in the browser beyond choosing the wording.
 *
 *   owner           the app owner: unlimited dreams, no number at all
 *   package         one package, so "N of TOTAL" is exactly right
 *   across          several grants (or a total that does not map to one package): ONE overall figure, never "of a package"
 *   none-purchased  something was bought, and nothing is left
 *   free-used       a free account whose free dream was used
 *   free-none       a free account with nothing to use (and no record of a used free dream)
 */
export type DreamBalanceKind = 'owner' | 'package' | 'across' | 'none-purchased' | 'free-used' | 'free-none';

export interface DreamBalanceView {
  kind: DreamBalanceKind;
  /** Dreams left (the server's balance). */
  remaining: number;
  /** Dreams ever granted, when the server said so (and it is a sensible total for the balance). */
  total: number | null;
}

export function describeBalance(summary: CreditSummary): DreamBalanceView {
  const remaining = Math.max(0, Math.floor(summary.balance));
  if (summary.owner) return { kind: 'owner', remaining, total: null };
  const granted = summary.grantedCredits;
  const count = summary.grantCount;
  const hasGrants = typeof granted === 'number' && granted > 0;
  if (!hasGrants) {
    // Not one grant on record. A balance may still exist (e.g. credits given by hand): show it as a plain remaining count.
    if (remaining > 0) return { kind: 'across', remaining, total: null };
    return { kind: summary.freeDreamUsed === true ? 'free-used' : 'free-none', remaining: 0, total: null };
  }
  if (remaining === 0) return { kind: 'none-purchased', remaining: 0, total: granted };
  // One grant, and the balance fits inside it: "N of TOTAL in your package". Several grants (or a balance larger than the
  // single grant): one overall figure — never presented as part of a single package.
  if (count === 1 && remaining <= granted) return { kind: 'package', remaining, total: granted };
  return { kind: 'across', remaining, total: granted };
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
      return one ? 'archive.balanceOneAcross' : 'archive.balanceAcross';
    case 'none-purchased':
      return 'archive.balanceNone';
    case 'free-used':
      return 'archive.balanceFreeUsed';
    case 'free-none':
      return 'archive.balanceFreeNone';
  }
}
