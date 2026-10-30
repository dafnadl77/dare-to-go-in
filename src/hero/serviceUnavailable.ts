/**
 * DARE'S AI BUDGET RAN OUT (2026-10-30; docs/upgrade-2026-10/budget-cap-credit-protection-design-2026-10-30.md). The server answers
 * 'service_unavailable_refunded' when a later step failed and the dream's credit is back in the account, and 'service_unavailable' when
 * nothing was returned now (an account that spends no credit, or the database could not be reached). The dream stays on her screen.
 */
export type ServiceNotice = 'refunded' | 'plain';

export function serviceNoticeOf(reason: unknown): ServiceNotice | null {
  if (reason === 'service_unavailable_refunded') return 'refunded';
  if (reason === 'service_unavailable') return 'plain';
  return null;
}
