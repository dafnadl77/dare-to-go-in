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
let inFlight: Promise<void> | null = null;

export class RequestTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`The request did not finish within ${Math.round(timeoutMs / 1000)} seconds.`);
    this.name = 'RequestTimeoutError';
  }
}

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

async function runPaidFetch(input: string, init: RequestInit | undefined): Promise<Response> {
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
