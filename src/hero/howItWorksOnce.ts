import type { User } from '@supabase/supabase-js';

/**
 * "How it works" opens by itself once, the first time a dreamer chooses to write a dream. After that writing opens directly: after a refresh,
 * a new sign-in or on another device, because the mark lives on the account (`user_metadata`, like the address preference), with no table
 * and no migration. An account that already holds a dream never gets the automatic opening, and neither does a dreamer who already opened the
 * section by hand: signed in it is marked at once, as a guest it is remembered on this device until there is an account to mark. The "How it
 * works" control stays open to everyone.
 */

/** The exact key stored in Supabase auth `user_metadata`. */
export const HOW_IT_WORKS_SEEN_METADATA_KEY = 'how_it_works_seen_at';

/** How long the check for an existing dream may hold back the writing screen that opens by itself after sign-in. It never blocks writing. */
export const DREAM_CHECK_LIMIT_MS = 1500;

/** pending: being read. seen: marked, on another device. none / some: the account's saved dreams. unknown: the read failed or took too long. */
export type AccountDreamCheck = 'pending' | 'seen' | 'none' | 'some' | 'unknown';

/** explain: the section first, writing when it closes. write-and-mark: writing, and the account stops asking. write: writing, nothing else. */
export type TypingStep = 'explain' | 'write-and-mark' | 'write';

// Seen on this page, also when saving the mark failed: the section does not come back until the page is reloaded.
const seenOnThisPage = new Set<string>();

export function rememberHowItWorksSeen(userId: string): void {
  seenOnThisPage.add(userId);
}

export function howItWorksSeen(user: Pick<User, 'id' | 'user_metadata'> | null | undefined): boolean {
  if (!user) return false;
  return !!user.user_metadata?.[HOW_IT_WORKS_SEEN_METADATA_KEY] || seenOnThisPage.has(user.id);
}

const GUEST_SEEN_KEY = 'dare-how-it-works-seen';

/** A guest opened the section by hand. Device storage can be missing; then the section simply opens once more after sign-up. */
export function rememberGuestSawHowItWorks(): void {
  try {
    localStorage.setItem(GUEST_SEEN_KEY, '1');
  } catch {
    /* nothing depends on it */
  }
}

export function guestSawHowItWorks(): boolean {
  try {
    return localStorage.getItem(GUEST_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** The account carries it now, so the next person on this device starts clean. */
export function forgetGuestSawHowItWorks(): void {
  try {
    localStorage.removeItem(GUEST_SEEN_KEY);
  } catch {
    /* nothing depends on it */
  }
}

/** Only a confirmed empty account that has not read the section sees it. When it cannot be known, writing opens: an existing dreamer is never shown it by mistake. */
export function typingStepFor(seen: boolean, dreams: AccountDreamCheck, sawAsGuest = false): TypingStep {
  if (seen) return 'write';
  if (dreams === 'none') return sawAsGuest ? 'write-and-mark' : 'explain';
  if (dreams === 'some') return 'write-and-mark';
  return 'write';
}
