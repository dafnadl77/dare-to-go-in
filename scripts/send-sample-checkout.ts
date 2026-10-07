/**
 * Sends ONE sample checkout request to the Make webhook that is "listening for data", so Make can learn the payload
 * structure. It is the same payload builder the real route uses, with a throwaway random order id and "sample": true.
 *
 *   npx tsx scripts/send-sample-checkout.ts --send
 *
 * Reads MAKE_CHECKOUT_WEBHOOK_URL from .env (server-side only). Prints the payload (no secrets in it) and Make's answer.
 * It never prints the webhook URL, touches no database, creates no order, grants nothing, and charges nothing.
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { paidPackage } from '../server/payments/checkoutPackages.ts';
import { buildMakeCheckoutPayload, parseMakeWebhookUrl, postToMake, siteUrlFromEnv, validatePaymentUrl } from '../server/payments/makeCheckoutClient.ts';

const siteUrl = siteUrlFromEnv() ?? 'https://daretogoin.com';
const pkg = paidPackage('explore_10');
if (!pkg) throw new Error('package table is missing explore_10');
// Obviously fake sample customer: it only lets Make detect the fullName and phone fields. No real person is involved.
const payload = buildMakeCheckoutPayload(randomBytes(16).toString('hex'), pkg, siteUrl, { fullName: 'Sample Customer', phone: '0500000000' }, { sample: true });

console.log('Payload that will be sent to Make:');
console.log(JSON.stringify(payload, null, 2));

if (!parseMakeWebhookUrl(process.env.MAKE_CHECKOUT_WEBHOOK_URL)) {
  console.error('\nMAKE_CHECKOUT_WEBHOOK_URL is missing or is not an https hook.*.make.com address (set it in .env). Nothing was sent.');
  process.exit(1);
}
if (!process.argv.includes('--send')) {
  console.log('\nDry run only. Add --send to POST this ONE sample to the Make webhook.');
  process.exit(0);
}

const response = await postToMake(payload);
if (!response) {
  console.error('\nNo answer from Make (network error or timeout). Check the webhook is still listening.');
  process.exit(1);
}
console.log(`\nMake answered HTTP ${response.status}`);
let parsedOk = false;
try {
  const body = JSON.parse(response.bodyText) as { ok?: unknown; orderId?: unknown; paymentUrl?: unknown };
  parsedOk = true;
  console.log('Answer fields:', Object.keys(body).join(', '));
  console.log('orderId echoed correctly:', body.orderId === payload.orderId);
  if (typeof body.paymentUrl === 'string') {
    console.log('paymentUrl host:', (() => { try { return new URL(body.paymentUrl).hostname; } catch { return '(not a URL)'; } })());
    console.log('paymentUrl accepted by DARE\'s validator:', validatePaymentUrl(body.paymentUrl) !== null);
  }
} catch {
  // not JSON: expected while the scenario has no "Webhook response" module yet
}
if (!parsedOk) console.log('Body (not JSON):', response.bodyText.slice(0, 200));
