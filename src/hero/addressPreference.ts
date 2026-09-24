import type { User } from '@supabase/supabase-js';

/**
 * How DARE should grammatically address a dreamer directly in generated
 * Hebrew text — the dreamer's own explicit, optional choice (see Settings).
 * NEVER inferred from name, email, dream content, or any other signal (see
 * AuthContext.tsx's updateAddressPreference: the only way this is ever
 * set). Existing accounts that never chose one read as 'neutral' — the
 * safe, no-assumption default.
 *
 * English output is naturally gender-neutral regardless of this setting —
 * this only ever changes Hebrew grammar (see buildHebrewAddressInstruction).
 *
 * Deliberately free of any Vite/browser-only code (aside from importing
 * supabase-js's own `User` type, which both the frontend and the Node
 * backend already depend on) so this module can be imported unchanged by
 * both sides — mirrors appLanguage.ts / conceptTaxonomy.ts.
 */
export type AddressPreference = 'feminine' | 'masculine' | 'neutral';

const KEY = 'addressPreference';

/** Never trusts an unrecognized/missing value as anything but the safe
    default — this is the ONE place "no preference chosen" resolves to
    'neutral', so every caller (client cache-key, server prompt) agrees. */
export function normalizeAddressPreference(value: unknown): AddressPreference {
  return value === 'feminine' || value === 'masculine' ? value : 'neutral';
}

/** Reads the preference straight off the Supabase user's own metadata —
    the same object both the browser's session and the server's verified
    token payload carry, so client and server always agree without a
    second fetch or a new table. */
export function addressPreferenceOfUser(user: Pick<User, 'user_metadata'> | null | undefined): AddressPreference {
  return normalizeAddressPreference(user?.user_metadata?.[KEY]);
}

/** The exact key stored in Supabase auth `user_metadata` — exported so the
    one write site (AuthContext.tsx's updateAddressPreference) and the one
    read site above never drift apart. */
export const ADDRESS_PREFERENCE_METADATA_KEY = KEY;

/**
 * The Hebrew grammatical-address instruction appended to a Hebrew-output
 * prompt that addresses the dreamer directly (currently only Pattern
 * Reflection — see this task's own audit of other routes). English needs
 * no equivalent: English second-person address has no grammatical gender,
 * so this is never called for language === 'en'.
 *
 * 'neutral' does NOT mean "default to masculine" (that was the actual bug
 * this exists to fix) — it means actively restructuring sentences to avoid
 * a gendered second-person construction, never awkward slash-forms like
 * "את/ה".
 */
export function buildHebrewAddressInstruction(preference: AddressPreference): string {
  if (preference === 'feminine') {
    return `HEBREW GRAMMATICAL ADDRESS: this dreamer has told DARE to address her in FEMININE Hebrew. Whenever you address her directly in second person, use grammatically correct feminine forms exclusively (את, מרגישה, שלך במובן נקבה, פוגשת, מבחינה, וכו'). Never use a masculine second-person form (אתה, מרגיש, פוגש) anywhere in your response.`;
  }
  if (preference === 'masculine') {
    return `HEBREW GRAMMATICAL ADDRESS: this dreamer has told DARE to address him in MASCULINE Hebrew. Whenever you address him directly in second person, use grammatically correct masculine forms exclusively (אתה, מרגיש, שלך במובן זכר, פוגש, מבחין, וכו'). Never use a feminine second-person form (את, מרגישה, פוגשת) anywhere in your response.`;
  }
  return `HEBREW GRAMMATICAL ADDRESS: this dreamer's grammatical gender is unknown and was never provided — do NOT guess it, and do NOT default to masculine Hebrew (a real, fixed past failure this rule exists to prevent). Actively AVOID direct second-person gendered constructions (אתה/את, מרגיש/מרגישה, פוגש/פוגשת, or a gendered "שלך"). Instead, restructure sentences so they need no gendered second-person verb or pronoun at all — for example, prefer a nominalized or impersonal construction: "במפגש עם...", "כאשר מופיעה תחושה של...", "מה שמתעורר סביב...", "יש נוכחות של...", "ניתן לשים לב ל...", "עולה שאלה לגבי...". NEVER use an awkward slash form such as "את/ה", "מרגיש/ה" or "שלך/שלך" — these must not appear. The result must still read as natural, fluent, idiomatic Hebrew, not a workaround.`;
}
