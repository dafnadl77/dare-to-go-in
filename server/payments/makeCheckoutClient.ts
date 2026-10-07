import type { PayerDetails } from '../../src/payments/payerDetails.js';
import type { PaidPackage } from './checkoutPackages.js';

/**
 * DARE -> Make: the checkout request, and Make's synchronous answer (the Grow payment link).
 *
 * The Make webhook URL is a SECRET (anyone holding it can start a scenario run): it lives only in the server
 * environment (MAKE_CHECKOUT_WEBHOOK_URL), is never sent to the browser, never logged, and must be an https Make host.
 * The payload carries an opaque order id, the package facts and the payer's checkout details (full name and Israeli
 * mobile: Grow requires both to create a payment link). Never the account id, never an email. The payer details exist
 * only in this one request: DARE does not store, log or reuse them.
 */

export interface MakeCheckoutPayload {
  schema: 'dare.checkout.v1';
  /** Opaque, unguessable order id (32 hex). Make puts it in Grow's Custom Field 1. */
  orderId: string;
  packageId: PaidPackage['id'];
  /** Whole ILS (informational for Make/Grow: DARE re-checks the paid amount against ITS OWN order before granting). */
  amount: number;
  currency: 'ILS';
  title: string;
  successUrl: string;
  /** Checkout details for the Grow payment page (validated and normalized server-side). NOT an account identity. */
  fullName: string;
  /** Israeli mobile, local ten-digit form (05XXXXXXXX). */
  phone: string;
  /** Present only on the one-off sample sent while Make learns the payload structure. */
  sample?: true;
}

export function buildMakeCheckoutPayload(orderId: string, pkg: PaidPackage, siteUrl: string, payer: PayerDetails, options: { sample?: boolean } = {}): MakeCheckoutPayload {
  return {
    schema: 'dare.checkout.v1',
    orderId,
    packageId: pkg.id,
    amount: pkg.amountIls,
    currency: 'ILS',
    title: pkg.title,
    // Where the customer lands after paying. NEVER proof of payment: it only tells the page to show "confirming".
    successUrl: `${siteUrl}/?payment=${orderId}`,
    fullName: payer.fullName,
    phone: payer.phone,
    ...(options.sample ? { sample: true as const } : {}),
  };
}

const MAKE_HOST = /^hook\.([a-z0-9-]+\.)?(make|integromat)\.com$/;

export function parseMakeWebhookUrl(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || url.username || url.password || !MAKE_HOST.test(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

/** The public https origin of the site, used to build the customer's return link. */
export function siteUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  try {
    const url = new URL((env.PUBLIC_SITE_URL ?? 'https://daretogoin.com').trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

const DEFAULT_PAYMENT_HOST_SUFFIXES = ['grow.link', 'grow.business', 'meshulam.co.il'];

/** A payment link is only ever followed if it is https, carries no credentials and sits on a Grow domain. */
export function validatePaymentUrl(raw: unknown, env: NodeJS.ProcessEnv = process.env): string | null {
  if (typeof raw !== 'string' || raw.length < 12 || raw.length > 2000) return null;
  const suffixes = (env.GROW_PAYMENT_URL_HOSTS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const allowed = suffixes.length > 0 ? suffixes : DEFAULT_PAYMENT_HOST_SUFFIXES;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (!allowed.some((s) => host === s || host.endsWith(`.${s}`))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export interface RawMakeResponse {
  status: number;
  bodyText: string;
}

export interface MakeClientOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Make answers a synchronous webhook within 40 s at most; DARE gives up earlier so the customer is never left waiting. */
export const MAKE_TIMEOUT_MS = 25_000;
const MAX_RESPONSE_CHARS = 8_000;

/** The raw POST. Returns null when Make is not configured, or on any network failure / timeout. */
export async function postToMake(payload: MakeCheckoutPayload, options: MakeClientOptions = {}): Promise<RawMakeResponse | null> {
  const env = options.env ?? process.env;
  const url = parseMakeWebhookUrl(env.MAKE_CHECKOUT_WEBHOOK_URL);
  if (!url) return null;
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  // Optional second lock when the Make webhook has "API key authentication" turned on.
  if (env.MAKE_CHECKOUT_WEBHOOK_API_KEY) headers['x-make-apikey'] = env.MAKE_CHECKOUT_WEBHOOK_API_KEY;
  try {
    const res = await (options.fetchImpl ?? fetch)(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(options.timeoutMs ?? MAKE_TIMEOUT_MS),
    });
    const text = await res.text();
    return { status: res.status, bodyText: text.slice(0, MAX_RESPONSE_CHARS) };
  } catch {
    return null;
  }
}

export type MakeCheckoutResult = { ok: true; paymentUrl: string } | { ok: false; reason: 'not_configured' | 'unavailable' | 'bad_response' };

/**
 * Make must answer {"ok":true,"orderId":"<the same id>","paymentUrl":"https://..."} with HTTP 200 (a "Webhook response"
 * module at the end of the scenario). The echoed order id must match and the link must pass validatePaymentUrl.
 */
export async function requestPaymentLink(payload: MakeCheckoutPayload, options: MakeClientOptions = {}): Promise<MakeCheckoutResult> {
  const env = options.env ?? process.env;
  if (!parseMakeWebhookUrl(env.MAKE_CHECKOUT_WEBHOOK_URL)) return { ok: false, reason: 'not_configured' };
  const raw = await postToMake(payload, options);
  if (!raw || raw.status !== 200) return { ok: false, reason: 'unavailable' };
  try {
    const data: unknown = JSON.parse(raw.bodyText);
    if (!data || typeof data !== 'object') return { ok: false, reason: 'bad_response' };
    const body = data as { ok?: unknown; orderId?: unknown; paymentUrl?: unknown };
    const paymentUrl = validatePaymentUrl(body.paymentUrl, env);
    if (body.ok !== true || body.orderId !== payload.orderId || !paymentUrl) return { ok: false, reason: 'bad_response' };
    return { ok: true, paymentUrl };
  } catch {
    return { ok: false, reason: 'bad_response' };
  }
}
