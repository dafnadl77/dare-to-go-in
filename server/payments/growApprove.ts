/**
 * Grow's Approve Transaction: an ACKNOWLEDGEMENT that DARE received and handled a notification. Per Grow's documentation a
 * transaction is processed whether or not it is approved, so an approval is never proof of payment, of origin or of ownership,
 * and its result never decides a grant.
 *
 * ISOLATED INTERFACE ONLY. No real call to Grow exists in DARE: the production dependency is `disabledApprover`, which answers
 * "not_configured" without any network access. A real implementation (most likely: DARE asks a separate Make webhook to run Grow's
 * Approve Transaction module with the connection Make already holds, so DARE gets no Grow API credentials) is a separate,
 * approved step.
 *
 * Rules the caller (growNotify.ts) follows:
 *  - approve only after the database answered granted or duplicate (a duplicate is approved again: Grow resends until approved);
 *  - an approval failure never undoes a grant and never changes the answer to Grow; it is logged as a fixed word;
 *  - the transaction token is passed through and never logged.
 */

export interface ApproveRequest {
  environment: 'sandbox' | 'production';
  transactionId: string;
  /** From the notification; never logged, never stored. */
  transactionToken: string | null;
  sum: number;
}

export type ApproveOutcome = 'approved' | 'failed' | 'not_configured';

export interface GrowApprover {
  approve(request: ApproveRequest): Promise<ApproveOutcome>;
}

/** The only approver DARE has today: no network, no credentials, always "not_configured". */
export const disabledApprover: GrowApprover = {
  approve: async () => 'not_configured',
};

/** Calls the approver and turns any throw, rejection or unexpected answer into "failed". It never throws. */
export async function safeApprove(approver: GrowApprover, request: ApproveRequest): Promise<ApproveOutcome> {
  try {
    const outcome = await approver.approve(request);
    return outcome === 'approved' || outcome === 'not_configured' ? outcome : 'failed';
  } catch {
    return 'failed';
  }
}
