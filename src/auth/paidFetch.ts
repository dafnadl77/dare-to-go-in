/**
 * fetch() for the paid AI endpoints. An anonymous browser needs one stable trial
 * cookie before it may use them (the server never mints one inside a paid call):
 * when a paid call answers 401 `trial_required`, this asks /api/trial-session
 * for that cookie once (concurrent callers share the one request) and retries
 * the original request once. Signed-in callers and every other response are
 * passed through untouched.
 */
let inFlight: Promise<void> | null = null;

export function ensureTrialSession(): Promise<void> {
  if (!inFlight) {
    inFlight = fetch('/api/trial-session', { method: 'POST' })
      .then((res) => {
        if (!res.ok) throw new Error(`trial-session responded with HTTP ${res.status}`);
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export async function paidFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status !== 401) return res;
  const body: unknown = await res
    .clone()
    .json()
    .catch(() => null);
  const reason = body && typeof body === 'object' ? (body as { reason?: unknown }).reason : null;
  if (reason !== 'trial_required') return res;
  try {
    await ensureTrialSession();
  } catch {
    return res;
  }
  return fetch(input, init);
}
