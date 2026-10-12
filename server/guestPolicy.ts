/**
 * Starting a dream requires an account. A visitor who is not signed in can no longer begin a NEW dream through any API route:
 *
 *   /api/trial-session        no new guest identity is minted (the cookie that identified an anonymous browser is no longer handed out)
 *   /api/dream-transcription  a guest cookie may not send a recording
 *   /api/dream-analysis       a guest cookie may not start a new dream (an attempt is what every later step hangs on)
 *
 * Image, labels and reflection already work only on an EXISTING attempt that belongs to the caller, so without a way to create a guest
 * attempt they cannot be used by anyone new; translation and pattern reflection have always been for signed-in accounts only.
 *
 * Compatibility: a guest cookie that already exists, and the guest dreams already begun, keep working for what is IN PROGRESS (image,
 * labels, reflection on their own attempt, and /api/trial-session answering 200 for a valid cookie). Finishing marks the guest's free
 * dream completed, so signing up afterwards grants nothing further (see the account free-dream decision).
 *
 * DARE_GUEST_DREAMS=on re-opens guest dreams (an emergency lever; anything else, or unset, keeps them closed).
 */
export const GUEST_DREAMS_ENV = 'DARE_GUEST_DREAMS';
export const SIGN_IN_REQUIRED_REASON = 'sign_in_required';
export const SIGN_IN_REQUIRED_MESSAGE = 'Please sign in or create an account to start a dream.';

type Env = Record<string, string | undefined>;

export function guestDreamsAllowed(env: Env = process.env): boolean {
  return (env[GUEST_DREAMS_ENV] ?? '').trim().toLowerCase() === 'on';
}
