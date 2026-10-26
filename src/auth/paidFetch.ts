/**
 * fetch() for the paid AI endpoints. An anonymous browser needs one stable trial
 * cookie before it may use them (the server never mints one inside a paid call):
 * when a paid call answers 401 `trial_required`, this asks /api/trial-session
 * for that cookie once (concurrent callers share the one request) and retries
 * the original request once. Signed-in callers and every other response are
 * passed through untouched.
 *
 * Optional `timeoutMs`: ONE deadline for the whole call (including that single
 * bootstrap + retry and reading the response body). When it passes, the request
 * is aborted and this rejects with RequestTimeoutError, which every caller already
 * handles like any other network failure (a controlled request_failed result).
 * It is never retried here: a timeout must not become a second request.
 */
import { carriesBearerToken, dropRevokedSession } from './revokedSession';
import { AGE_REQUIRED_EVENT, sessionStopped } from '../hero/safety/sessionStop';

let inFlight: Promise<void> | null = null;

export class RequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`The request did not finish within ${Math.round(timeoutMs / 1000)} seconds.`);
    this.name = 'RequestTimeoutError';
  }
}

/** The server no longer hands out guest sessions: starting a dream needs an account. */
export class SignInRequiredError extends Error {
  serverMessage: string;
  constructor(serverMessage: string) {
    super('Signing in is required to start a dream.');
    this.name = 'SignInRequiredError';
    this.serverMessage = serverMessage;
  }
}

export function ensureTrialSession(): Promise<void> {
  if (!inFlight) {
    inFlight = fetch('/api/trial-session', { method: 'POST' })
      .then(async (res) => {
        if (res.ok) return;
        const body: unknown = await res.json().catch(() => null);
        const reason = body && typeof body === 'object' ? (body as { reason?: unknown }).reason : null;
        if (reason === 'sign_in_required') throw new SignInRequiredError(typeof (body as { message?: unknown }).message === 'string' ? (body as { message: string }).message : '');
        throw new Error(`trial-session responded with HTTP ${res.status}`);
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

async function runPaidFetch(input: string, init: RequestInit | undefined): Promise<Response> {
  // After immediate danger or a threat this page asks nothing more of the AI (safety/sessionStop.ts): nothing is sent.
  const stopped = sessionStopped();
  if (stopped) return new Response(JSON.stringify({ safety: { level: stopped } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const res = await fetch(input, init);
  if (res.status === 403) {
    const reason = await res.clone().json().then((b: unknown) => (b && typeof b === 'object' ? (b as { reason?: unknown }).reason : null)).catch(() => null);
    // The server asks for the age question (age_required): the app shows it; the caller still gets the refusal.
    if (reason === 'age_required' && typeof window !== 'undefined') window.dispatchEvent(new Event(AGE_REQUIRED_EVENT));
    return res;
  }
  if (res.status !== 401) return res;
  const body: unknown = await res
    .clone()
    .json()
    .catch(() => null);
  const reason = body && typeof body === 'object' ? (body as { reason?: unknown }).reason : null;
  // The account's own token was refused. If Supabase confirms that session is gone (it was ended elsewhere), drop it on this
  // device so the app is honestly signed out instead of failing every action; the 401 itself is still returned to the caller.
  if (reason === 'not_authenticated' && carriesBearerToken(init)) {
    await dropRevokedSession();
    return res;
  }
  if (reason !== 'trial_required') return res;
  try {
    await ensureTrialSession();
  } catch (error) {
    // No guest session is available any more: the caller is told, in the server's own words, that an account is needed.
    if (error instanceof SignInRequiredError) {
      return new Response(JSON.stringify({ reason: 'sign_in_required', message: error.serverMessage || 'Please sign in or create an account to start a dream.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return res;
  }
  return fetch(input, init);
}

export async function paidFetch(input: string, init?: RequestInit, options?: { timeoutMs?: number }): Promise<Response> {
  const timeoutMs = options?.timeoutMs;
  if (!timeoutMs) return runPaidFetch(input, init);

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new RequestTimeoutError(timeoutMs));
    }, timeoutMs);
  });
  // The response body is read INSIDE the deadline too (a server that sends headers and then
  // stalls must not hang the caller), then handed back as an ordinary Response.
  const work = runPaidFetch(input, { ...init, signal: controller.signal }).then(async (res) => {
    const text = await res.text();
    return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers });
  });
  work.catch(() => {}); // if the deadline wins, the aborted work's rejection must not go unhandled
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
