import { createHmac } from 'node:crypto';

/**
 * The Grow configuration behind the payment-link binding, and the keyed hash of a link's token. Kept in its own small module (no
 * database, no other payment code) so both the checkout binding and the completion store can use it without importing each other.
 * Re-exported by growLinkBinding.ts, which documents what a match does and does not prove.
 */

export type GrowEnvironment = 'sandbox' | 'production';

export interface GrowLinkConfig {
  environment: GrowEnvironment;
  merchant: string;
  key: string;
}

export const MIN_LINK_KEY_LENGTH = 32;
const MERCHANT_REF = /^[a-z0-9][a-z0-9_-]{1,31}$/;
const HASH_DOMAIN = 'dare.grow-link-token.v1';

export function growLinkConfig(env: NodeJS.ProcessEnv = process.env): GrowLinkConfig | null {
  const environment = (env.GROW_ENVIRONMENT ?? '').trim();
  const merchant = (env.GROW_MERCHANT_REF ?? '').trim();
  const key = env.GROW_LINK_TOKEN_KEY ?? '';
  if (environment !== 'sandbox' && environment !== 'production') return null;
  if (!MERCHANT_REF.test(merchant) || key.length < MIN_LINK_KEY_LENGTH) return null;
  // Production identifiers only on the production deployment; a Preview or a local run can only ever be a Sandbox.
  if ((environment === 'production') !== (env.VERCEL_ENV === 'production')) return null;
  return { environment, merchant, key };
}

/** The stored form of a process token: 64 hex, bound to environment, merchant and process id. Deterministic for one key. */
export function linkTokenHash(config: GrowLinkConfig, processId: string, processToken: string): string {
  return createHmac('sha256', config.key)
    .update(`${HASH_DOMAIN}\n${config.environment}\n${config.merchant}\n${processId}\n${processToken}`)
    .digest('hex');
}
