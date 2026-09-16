/**
 * Calls /api/claim-trial once right after a real sign-in (see
 * AuthContext.tsx's onAuthStateChange handler) — re-points this browser's
 * anonymous dream_attempts history to the now-authenticated account. Best
 * effort and fire-and-forget by design: the server-side claim is itself
 * idempotent (see server/dreamAttempts.ts's claimTrialForUser), so a
 * failed or duplicated call here is always safe to simply retry on the
 * next sign-in, never something the UI needs to block on or surface as an
 * error — signing in must never fail or stall because of this.
 */
export async function claimTrial(accessToken: string): Promise<void> {
  try {
    await fetch('/api/claim-trial', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    console.error('Failed to claim anonymous trial history:', err);
  }
}
