/**
 * The four Dream Packages — data-driven so PricingPage.tsx renders one card
 * component from this list rather than duplicating four large JSX blocks.
 *
 * `id` is a STABLE identifier, chosen to map cleanly onto a future Grow/Make
 * product/payment link (see PricingPage.tsx's handleSelectPaidPackage) —
 * never renamed once real purchases can reference it. Nothing here talks to
 * a payment provider; this file only describes what each package IS.
 *
 * `features` lists real, already-shipped DARE capabilities only (see each
 * FeatureKey's translation in translations.ts's `pricing.features` — every
 * label is phrased to match the product's own existing vocabulary, e.g.
 * "a guided reflection" rather than "AI interpretation", since About's own
 * copy explicitly disclaims definitive interpretation). No package lists a
 * capability DARE doesn't have (no "priority support", no unlimited/
 * subscription language, no expiration rules) — this file is the one place
 * that would need to change if that ever became false, so it's kept short
 * and reviewed alongside the copy in translations.ts.
 */

export type PackageId = 'first_dream' | 'go_deeper_3' | 'explore_10' | 'dive_in_25';

export type FeatureKey = 'fullJourney' | 'guidedReflection' | 'dreamImage' | 'saveArchive' | 'trackThemes' | 'bilingual';

export interface DreamPackageDef {
  id: PackageId;
  dreamCount: number;
  /** Price in ILS, or null for the free package. */
  priceIls: number | null;
  /** The one package visually emphasized as "Most popular" — exactly one, by construction (see the test). */
  featured: boolean;
  features: readonly FeatureKey[];
}

/** Every package's baseline: one full journey, a real reflection, a real
    generated image, saved to the dreamer's own archive. */
const BASE_FEATURES: readonly FeatureKey[] = ['fullJourney', 'guidedReflection', 'dreamImage', 'saveArchive'];

/** Multi-dream packages add the two capabilities that only mean anything
    across more than one dream: recurring-theme tracking (Insights genuinely
    needs >=2 saved dreams to ever show a recurrence) and the language toggle
    is worth calling out once there's more than a single dream to revisit. */
const FULL_FEATURES: readonly FeatureKey[] = [...BASE_FEATURES, 'trackThemes', 'bilingual'];

export const DREAM_PACKAGES: readonly DreamPackageDef[] = [
  { id: 'first_dream', dreamCount: 1, priceIls: null, featured: false, features: BASE_FEATURES },
  { id: 'go_deeper_3', dreamCount: 3, priceIls: 59, featured: false, features: FULL_FEATURES },
  { id: 'explore_10', dreamCount: 10, priceIls: 149, featured: true, features: FULL_FEATURES },
  { id: 'dive_in_25', dreamCount: 25, priceIls: 279, featured: false, features: FULL_FEATURES },
];
