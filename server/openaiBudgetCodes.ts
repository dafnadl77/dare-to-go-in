/**
 * OPENAI'S "THE MONEY RAN OUT" ANSWERS (2026-11-07). Every one of them is HTTP 429, like an ordinary rate limit, so the status alone never
 * tells them apart: only the error's code (or type) does. Source: OpenAI's error-codes guide and spend-limits guide
 * (developers.openai.com/api/docs/guides/error-codes, .../spend-limits), read 2026-11-07.
 *
 *   project_spend_limit_exceeded       the project's own hard spend limit (DARE's $20 cap) was reached
 *   organization_spend_limit_exceeded  the organization's hard spend limit was reached
 *   organization_usage_limit_exceeded  OpenAI's own monthly usage cap for the organization was reached
 *   credit_balance_exhausted           the prepaid credit balance is empty
 *   insufficient_quota                 the older code/type for the same situation; kept so nothing that worked before stops working
 *
 * NOT budget (and never in this list): rate_limit_exceeded, slow_down, rate_limit_error and any other 429. Retrying a budget answer does
 * not bring the money back, so it is never retried (see openaiClient.ts); an ordinary rate limit keeps the SDK's normal retries.
 */
export const OPENAI_BUDGET_CODES: ReadonlySet<string> = new Set([
  'project_spend_limit_exceeded',
  'organization_spend_limit_exceeded',
  'organization_usage_limit_exceeded',
  'credit_balance_exhausted',
  'insufficient_quota',
]);

/** True when an error body's `code` or `type` (top level or under `error`) names a budget answer. Anything else, or garbage: false. */
export function namesBudgetCode(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const b = body as { code?: unknown; type?: unknown; error?: { code?: unknown; type?: unknown } | null };
  const values = [b.code, b.type, b.error?.code, b.error?.type];
  return values.some((v) => typeof v === 'string' && OPENAI_BUDGET_CODES.has(v));
}
