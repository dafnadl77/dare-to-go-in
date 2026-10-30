import OpenAI from 'openai';
import { errorResult, type HandlerResult } from './httpResult.js';
import type { CallerIdentity } from './callerIdentity.js';
import { refundAttemptCreditOnce, type CreditRefundOutcome } from './dreamAttempts.js';

/**
 * DARE'S AI BUDGET RAN OUT (2026-10-30). The OpenAI project has a hard monthly spend limit; once it is reached every request fails with
 * HTTP 429 and the code `insufficient_quota`. Only that case is handled here: an ordinary rate limit (also 429, `rate_limit_exceeded`)
 * and every other failure keep their existing behaviour in each route.
 *
 *   service_unavailable_refunded  a later step of the dream failed and its credit is back in the account (now, or earlier in this dream)
 *   service_unavailable           nothing was returned now: the analysis (whose credit comes back through cancel_user_attempt, as
 *                                 before), an account that spends no credit, a guest, or a database that could not be reached
 */
export const BUDGET_EXHAUSTED_CODE = 'insufficient_quota';
export const SERVICE_UNAVAILABLE = 'service_unavailable';
export const SERVICE_UNAVAILABLE_REFUNDED = 'service_unavailable_refunded';
const MESSAGE = 'DARE is unavailable right now. Please try again later.';

export function isBudgetExhausted(err: unknown): boolean {
  if (!(err instanceof OpenAI.APIError) || err.status !== 429) return false;
  const inner = err.error as { code?: unknown; type?: unknown } | undefined;
  return err.code === BUDGET_EXHAUSTED_CODE || err.type === BUDGET_EXHAUSTED_CODE || inner?.code === BUDGET_EXHAUSTED_CODE || inner?.type === BUDGET_EXHAUSTED_CODE;
}

/** The analysis: its credit already came back through the attempt's cancellation; only the answer names the cause. */
export function analysisBudgetResult(err: unknown): HandlerResult | null {
  return isBudgetExhausted(err) ? errorResult(503, SERVICE_UNAVAILABLE, MESSAGE) : null;
}

/**
 * A later step of a dream (image, titles, questions, conversation, whole view, reflection): when the budget ran out, the dream's credit is
 * returned once and the answer says whether it is back. The step's own slot is returned by the route, as for any failure.
 */
export async function laterStepBudgetResult(
  err: unknown,
  attemptId: string,
  identity: CallerIdentity,
  refund: (attemptId: string, identity: CallerIdentity) => Promise<CreditRefundOutcome | null> = refundAttemptCreditOnce,
): Promise<HandlerResult | null> {
  if (!isBudgetExhausted(err)) return null;
  const outcome = await refund(attemptId, identity);
  const back = outcome === 'refunded' || outcome === 'already_refunded';
  console.error(`ai_budget_exhausted credit=${outcome ?? 'unavailable'}`);
  return errorResult(503, back ? SERVICE_UNAVAILABLE_REFUNDED : SERVICE_UNAVAILABLE, MESSAGE);
}
