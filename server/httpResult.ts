import type { AnalysisErrorReason } from '../src/hero/dreamAnalysisSchema.js';

/**
 * A plain, framework-agnostic HTTP result — every route's core logic
 * returns one of these instead of calling `res` directly, so the exact
 * same implementation can be adapted by both the local Express server
 * (server/index.ts) and Vercel serverless functions (api/*.ts) with zero
 * duplicated business logic.
 */
export interface HandlerResult {
  status: number;
  body: unknown;
  /** Optional response headers (e.g. Set-Cookie when a new anonymous
      trial identity was minted for this request). */
  headers?: Record<string, string>;
}

export function okResult(body: unknown, headers?: Record<string, string>): HandlerResult {
  return { status: 200, body, headers };
}

export function errorResult(status: number, reason: AnalysisErrorReason | string, message: string): HandlerResult {
  return { status, body: { reason, message } };
}

/** Merges extra response headers (e.g. a newly-minted trial's Set-Cookie)
    onto any HandlerResult — success or error — without every route having
    to thread this through its own return statements individually. */
export function withHeaders(result: HandlerResult, headers?: Record<string, string>): HandlerResult {
  if (!headers) return result;
  return { ...result, headers: { ...result.headers, ...headers } };
}
