import OpenAI from 'openai';
import { namesBudgetCode } from './openaiBudgetCodes.js';

let client: OpenAI | null = null;
let clientKey: string | undefined;

/**
 * Lazily constructs the OpenAI client so a missing key is reported as a
 * controlled error at request time, not a crash at server boot.
 */
export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  if (!client || clientKey !== apiKey) {
    client = new OpenAI({ apiKey, fetch: budgetAwareFetch((input, init) => fetch(input, init)) });
    clientKey = apiKey;
  }
  return client;
}

/**
 * A budget answer is never retried (2026-11-07). The SDK retries every 429 up to twice unless the response says `x-should-retry: false`;
 * a 429 that names a budget code (openaiBudgetCodes.ts) gets that header here, so the route sees the error at once: no second or third
 * request, no wait. The body and status are passed on unchanged. Every other response, including an ordinary rate limit, is returned
 * exactly as it came (the SDK keeps retrying those as before).
 */
export function budgetAwareFetch(base: typeof fetch): typeof fetch {
  return async (input, init) => {
    const res = await base(input, init);
    if (res.status !== 429 || res.headers.get('x-should-retry') === 'false') return res;
    let text: string;
    try {
      text = await res.clone().text();
    } catch {
      return res;
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return res;
    }
    if (!namesBudgetCode(body)) return res;
    const headers = new Headers(res.headers);
    headers.set('x-should-retry', 'false');
    headers.delete('content-encoding');
    headers.delete('content-length');
    return new Response(text, { status: res.status, statusText: res.statusText, headers });
  };
}
