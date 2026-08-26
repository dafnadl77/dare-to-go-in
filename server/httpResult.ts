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
}

export function okResult(body: unknown): HandlerResult {
  return { status: 200, body };
}

export function errorResult(status: number, reason: AnalysisErrorReason, message: string): HandlerResult {
  return { status, body: { reason, message } };
}
