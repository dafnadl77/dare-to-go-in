import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { GROW_PAYMENT_HOST_SUFFIXES, isSafePaymentUrl, readPaymentReturnParam } from '../src/payments/paymentLink.ts';
import { en, he } from '../src/i18n/translations.ts';
import { validatePaymentUrl } from '../server/payments/makeCheckoutClient.ts';
import { getLegalDocument } from '../src/legal/legalContent.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ORDER = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

// ------------------------------------------------------------------------ payment link ----

test('payment link: the browser follows only an https Grow address (same allow-list as the server)', () => {
  for (const ok of ['https://pay.grow.link/7128f0328c3d9475a05091226763a379-NDA5NzM0MA', 'https://grow.link/x1234567', 'https://secure.meshulam.co.il/far?l=abc', 'https://pay.grow.business/abc123']) {
    assert.equal(isSafePaymentUrl(ok), true, ok);
    assert.notEqual(validatePaymentUrl(ok, {}), null, `server agrees: ${ok}`);
  }
  for (const bad of [undefined, null, 5, '', 'http://pay.grow.link/x1234567', 'https://evil.example/pay', 'https://grow.link.evil.example/x', 'https://evilgrow.link/x1234567', 'https://u:p@pay.grow.link/x1234567', 'javascript:alert(1)', 'data:text/html,hi', '//pay.grow.link/x1234567', `https://pay.grow.link/${'a'.repeat(2100)}`]) {
    assert.equal(isSafePaymentUrl(bad), false, String(bad).slice(0, 40));
    assert.equal(validatePaymentUrl(bad as unknown, {}), null, `server agrees: ${String(bad).slice(0, 40)}`);
  }
});

test('payment link: the client and server allow-lists are identical', () => {
  const server = read('server/payments/makeCheckoutClient.ts');
  const match = /DEFAULT_PAYMENT_HOST_SUFFIXES = \[([^\]]+)\]/.exec(server);
  assert.ok(match);
  const serverList = match[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual([...GROW_PAYMENT_HOST_SUFFIXES], serverList);
});

test('return: only a well-formed order id is read from ?payment=; anything else is ignored', () => {
  assert.equal(readPaymentReturnParam(`?payment=${ORDER}`), ORDER);
  assert.equal(readPaymentReturnParam(`?view=pricing&payment=${ORDER}&x=1`), ORDER);
  for (const bad of ['', '?payment=', '?payment=short', `?payment=${ORDER.toUpperCase()}`, `?payment=${ORDER}0`, `?payment=${ORDER}&payment=other`.replace(ORDER, 'zz'), '?payment[]=x', '?payment=../../etc/passwd', '?payment=<script>']) {
    assert.equal(readPaymentReturnParam(bad), null, bad);
  }
});

// ----------------------------------------------------------------------- the request ----

test('request: the browser POSTs exactly {packageId, fullName, phone} to /api/credits: no amount, credits, user id or status', () => {
  const src = strip(read('src/payments/checkout.ts'));
  assert.match(src, /fetch\('\/api\/credits', \{\s*method: 'POST'/);
  assert.match(src, /body: JSON\.stringify\(\{ packageId, fullName, phone \}\)/);
  assert.ok(!/amount|credits:|userId|user_id|owner|status:\s*'paid'/.test(src.replace(/\/api\/credits/g, '')), 'nothing price- or identity-related is sent');
  assert.match(src, /AbortSignal\.timeout\(CHECKOUT_TIMEOUT_MS\)/);
  assert.match(src, /isSafePaymentUrl\(body\.paymentUrl\)/, 'the returned link is checked before it is handed back');
  assert.ok(!/console\./.test(src));
});

test('request: server answers map to clear outcomes (invalid details, session, rate limit, unavailable) and a timeout never loses account state', () => {
  const src = strip(read('src/payments/checkout.ts'));
  assert.match(src, /invalid_payer_details/);
  assert.match(src, /res\.status === 401[\s\S]*not_authenticated/);
  assert.match(src, /res\.status === 429[\s\S]*rate_limited/);
  assert.match(src, /catch \{[\s\S]*unavailable/, 'offline / timeout is "unavailable" (nothing was charged), not an exception');
});

// -------------------------------------------------------------------------- the dialog ----

test('dialog: payer details live in component state only: no storage, cookie, URL, global or log', () => {
  const src = strip(read('src/payments/CheckoutDialog.tsx'));
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie|history\.(push|replace)State|navigator\.|window\.[A-Za-z]+\s*=|console\./.test(src));
  assert.match(src, /useState\(''\)/);
  // the details are sent through startCheckout and nowhere else
  assert.equal((src.match(/startCheckout\(/g) ?? []).length, 1);
  assert.match(src, /startCheckout\(packageId, fullName\.trim\(\), phone\.trim\(\)\)/);
});

test('dialog: it validates with the SHARED payer rules, blocks double submission, and shows a safe loading state', () => {
  const src = strip(read('src/payments/CheckoutDialog.tsx'));
  assert.match(src, /import \{ normalizeFullName, normalizeIsraeliMobile \} from '\.\/payerDetails'/);
  assert.match(src, /if \(submittingRef\.current\) return;/);
  assert.match(src, /submittingRef\.current = true;[\s\S]*await startCheckout/);
  assert.match(src, /disabled=\{locked\}/);
  assert.match(src, /btn-spinner/);
  assert.match(src, /aria-busy=\{locked\}/);
  // closing is impossible while a request is in flight
  assert.match(src, /if \(!submittingRef\.current\) onCloseRef\.current\(\)/);
  assert.match(src, /e\.target === e\.currentTarget && !submittingRef\.current/);
});

test('dialog: success sends the browser ONLY to the validated payment link; failure unlocks the form and never touches the account', () => {
  const src = strip(read('src/payments/CheckoutDialog.tsx'));
  assert.equal((src.match(/window\.location\.assign\(/g) ?? []).length, 1);
  assert.match(src, /if \(result\.ok\) \{[\s\S]*window\.location\.assign\(result\.paymentUrl\)/);
  assert.match(src, /submittingRef\.current = false;\s*\n\s*setPhase\('idle'\)/, 'a failed attempt can simply be repeated');
  assert.ok(!/signOut|auth\./i.test(src), 'a payment failure never touches the session');
  assert.match(src, /pageshow/, 'coming back with the browser Back button does not leave the form frozen');
  assert.match(src, /e\.persisted/);
});

test('dialog: it is ACCESSIBLE and RTL/LTR safe: labelled dialog, focus trap, Escape, phone field always left-to-right', () => {
  const src = strip(read('src/payments/CheckoutDialog.tsx'));
  assert.match(src, /role="dialog"/);
  assert.match(src, /aria-modal="true"/);
  assert.match(src, /aria-labelledby=\{titleId\}/);
  assert.match(src, /autoComplete="name"/);
  assert.match(src, /autoComplete="tel"/);
  assert.match(src, /type="tel"/);
  assert.match(src, /dir="ltr"/);
  assert.match(src, /dir="auto"/);
  assert.match(src, /key === 'Escape'/);
  assert.match(src, /key !== 'Tab'/);
});

test('pricing: nothing is collected before the customer chooses to buy; a signed-out visitor is sent to sign in; credits come from nowhere here', () => {
  const src = strip(read('src/pricing/PricingPage.tsx'));
  assert.match(src, /const handleSelectPaidPackage = \(id: PackageId\) => \{[\s\S]*if \(!signedIn\) \{[\s\S]*onRequireSignIn\?\.\(\);[\s\S]*return;[\s\S]*setCheckoutFor\(id\)/);
  assert.match(src, /\{checkoutPackage && checkoutFor && \(\s*<CheckoutDialog/, 'the dialog (and its inputs) exist only after a package was chosen');
  assert.ok(!/<input|fullName|phone/i.test(src.replace(/CheckoutDialog/g, '')), 'the Pricing page itself has no payer fields');
  assert.ok(!/comingSoon/.test(src), 'the placeholder is gone');
  assert.ok(!/fetch\(|grant|credit.*\+\+/.test(src));
});

test('app: the return from the payment page is read once, stripped from the URL, never treated as payment, and does not trigger the zero-credit redirect while confirming', () => {
  const app = strip(read('src/App.tsx'));
  assert.match(app, /readPaymentReturnParam\(window\.location\.search\)/);
  assert.match(app, /url\.searchParams\.delete\('payment'\)/);
  assert.match(app, /window\.history\.replaceState/);
  assert.match(app, /\|\| paymentReturn\) return;/, 'entry gate waits while a payment is being confirmed');
  assert.match(app, /<PaymentReturnNotice/);
  assert.match(app, /returnToPricingAfterAuth/);
  const notice = strip(read('src/payments/PaymentReturnNotice.tsx'));
  assert.match(notice, /fetchOrderState\(orderId\)/);
  assert.ok(!/grant|setBalance|credits\s*[+=]/.test(notice), 'the notice only READS the order state');
  assert.match(notice, /state === 'confirmed' \|\| state === 'unknown'/);
});

test('return notice: polls the server (fast, then slow, then stops), keeps polling quietly on failures and never blocks the app', () => {
  const notice = strip(read('src/payments/PaymentReturnNotice.tsx'));
  assert.match(notice, /FAST_POLL_MS = 3_000/);
  assert.match(notice, /SLOW_AFTER_MS = 90_000/);
  assert.match(notice, /GIVE_UP_AFTER_MS = 15 \* 60_000/);
  assert.match(notice, /return \(\) => \{\s*cancelled = true;/, 'polling stops when the notice closes');
  assert.ok(!/localStorage|sessionStorage/.test(notice));
});

// -------------------------------------------------------------------------- copy ----

function leafPaths(obj: unknown, prefix = ''): string[] {
  if (obj && typeof obj === 'object') return Object.entries(obj).flatMap(([k, v]) => leafPaths(v, `${prefix}${prefix ? '.' : ''}${k}`));
  return [prefix];
}

test('copy: every checkout and payment-return string exists in BOTH Hebrew and English, with Hebrew actually in Hebrew', () => {
  const enKeys = [...leafPaths(en.pricing.checkout, 'checkout'), ...leafPaths(en.pricing.paymentReturn, 'paymentReturn')].sort();
  const heKeys = [...leafPaths(he.pricing.checkout, 'checkout'), ...leafPaths(he.pricing.paymentReturn, 'paymentReturn')].sort();
  assert.deepEqual(heKeys, enKeys);
  assert.ok(enKeys.length >= 28);
  const values = (o: unknown): string[] => (o && typeof o === 'object' ? Object.values(o).flatMap(values) : [String(o)]);
  for (const text of values(en.pricing.checkout).concat(values(en.pricing.paymentReturn))) assert.ok(text.length > 1 && !/[֐-׿]/.test(text), text);
  for (const text of values(he.pricing.checkout).concat(values(he.pricing.paymentReturn))) assert.ok(/[֐-׿]/.test(text), text);
});

test('copy: the form never promises anything untrue (no "secure by DARE", no card handling by DARE, nothing about stored details)', () => {
  const all = JSON.stringify([en.pricing.checkout, en.pricing.paymentReturn]);
  assert.ok(!/we (store|keep|save) your/i.test(all));
  assert.ok(!/credit card number|card details/i.test(all));
  assert.match(en.pricing.checkout.privacy, /does not store/i);
  assert.match(en.pricing.checkout.privacy, /Make and Grow/);
  assert.match(he.pricing.checkout.privacy, /Make ו-Grow/);
});

// ----------------------------------------------------------------------- privacy ----

test('privacy policy (EN + HE) discloses exactly what is true about payments, with no invented retention period', () => {
  for (const [lang, expected] of [['en', 'Payments'], ['he', 'תשלומים']] as const) {
    const doc = getLegalDocument(lang, 'privacy');
    const section = doc.sections.find((s) => s.heading === expected);
    assert.ok(section, `${lang}: Payments section`);
    const text = section.body;
    if (lang === 'en') {
      assert.match(text, /full name/);
      assert.match(text, /mobile phone number/);
      assert.match(text, /only when you start a payment/);
      assert.match(text, /Make/);
      assert.match(text, /Grow/);
      assert.match(text, /does not store your name or phone number/);
      assert.match(text, /never receives or stores your card details/);
      assert.match(text, /anonymized if you delete your account/);
      assert.match(text, /transaction, accounting, fraud-prevention and support/);
    } else {
      for (const needle of ['השם המלא', 'הטלפון הנייד', 'Make', 'Grow', 'אינה שומרת את השם או את מספר הטלפון', 'פרטי כרטיס אשראי', 'מוסר אם תמחקו', 'מניעת הונאות', 'הנהלת חשבונות']) assert.ok(text.includes(needle), `${lang}: ${needle}`);
    }
    assert.ok(!/\b\d+\s*(days?|weeks?|months?|years?)\b|\d+\s*(ימים|שבועות|חודשים|שנים)|שנה|year/i.test(text), `${lang}: no invented retention period`);
    assert.match(doc.updated, lang === 'en' ? /October 2026/ : /אוקטובר 2026/);
  }
});

test('privacy policy: the other two legal documents are untouched by this change', () => {
  assert.equal(getLegalDocument('en', 'terms').updated, 'Last updated: September 2026');
  assert.equal(getLegalDocument('en', 'accessibility').updated, 'Last updated: September 2026');
  assert.ok(!getLegalDocument('en', 'terms').sections.some((s) => s.heading === 'Payments'));
});

// --------------------------------------------------------------------- secrets / bundle ----

test('secrets: no browser source mentions the Make webhook, the completion secret or any server credential', () => {
  const walk = (dir: string): string[] => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
  for (const f of walk('src').filter((x) => /\.(ts|tsx)$/.test(x))) {
    assert.ok(!/MAKE_CHECKOUT|MAKE_COMPLETION|hook\.[a-z0-9]+\.make\.com|SERVICE_ROLE|payment-complete/.test(read(f)), f);
  }
});

// ------------------------------------------------------ privacy link keeps the customer in the checkout ----

test('privacy link: it opens the Privacy Policy in a modal OVER the checkout; nothing navigates, nothing is closed, nothing is lost', () => {
  const dialog = strip(read('src/payments/CheckoutDialog.tsx'));
  assert.match(dialog, /import PrivacyPolicyDialog from '\.\.\/legal\/PrivacyPolicyDialog'/);
  assert.match(dialog, /onClick=\{\(\) => setPrivacyOpen\(true\)\}/);
  assert.match(dialog, /\{privacyOpen && <PrivacyPolicyDialog closeLabel=\{t\('pricing\.checkout\.privacyClose'\)\} onClose=\{\(\) => setPrivacyOpen\(false\)\} \/>\}/);
  // no navigation of any kind from the checkout, and the old "leave to the legal page" hook is gone everywhere
  assert.ok(!/onOpenLegal|onOpenPrivacy|window\.open|location\.(href|assign|replace)\s*=|history\./.test(dialog.replace(/window\.location\.assign\(result\.paymentUrl\)/, '')));
  assert.equal((dialog.match(/window\.location\.assign\(/g) ?? []).length, 1, 'the ONLY navigation is the validated payment redirect');
  const pricing = strip(read('src/pricing/PricingPage.tsx'));
  assert.ok(!/onOpenPrivacy/.test(pricing));
  assert.ok(!/setCheckoutFor\(null\);\s*onOpenLegal/.test(pricing), 'opening the policy no longer closes the checkout');
  // the form's state lives in CheckoutDialog, which stays mounted while the modal is open
  assert.match(dialog, /inert=\{privacyOpen\}/);
});

test('privacy link: the checkout steps aside while the policy is open, and Escape closes ONLY the policy', () => {
  const dialog = strip(read('src/payments/CheckoutDialog.tsx'));
  assert.match(dialog, /if \(privacyOpenRef\.current\) return;/);
  const policy = strip(read('src/legal/PrivacyPolicyDialog.tsx'));
  assert.match(policy, /e\.key === 'Escape'[\s\S]*stopImmediatePropagation\(\)[\s\S]*onCloseRef\.current\(\)/);
  assert.match(policy, /role="dialog"/);
  assert.match(policy, /aria-modal="true"/);
  assert.match(policy, /opener\.focus\(\)/, 'focus returns to the link that opened it');
  assert.match(policy, /onClick=\{\(e\) => \{\s*if \(e\.target === e\.currentTarget\) onClose\(\);/);
});

test('privacy link: the modal shows the project\'s EXISTING Privacy Policy text (no invented URL, no external page)', () => {
  const policy = strip(read('src/legal/PrivacyPolicyDialog.tsx'));
  assert.match(policy, /getLegalDocument\(language, 'privacy'\)/);
  assert.ok(!/https?:\/\//.test(policy), 'no URL in the component');
  assert.ok(!/<iframe|dangerouslySetInnerHTML|window\.open|target="_blank"/.test(policy));
  // same renderer for emails as the Privacy page, now shared
  assert.match(policy, /linkifyEmails\(paragraph\)/);
  assert.match(strip(read('src/legal/LegalPage.tsx')), /import \{ linkifyEmails \} from '\.\/linkifyEmails'/);
  // the return button is translated in both languages
  assert.equal(en.pricing.checkout.privacyClose, 'Close and return to payment');
  assert.equal(he.pricing.checkout.privacyClose, 'סגירה וחזרה לתשלום');
});

test('privacy link: it sits above the checkout (z-index) and fits small screens', () => {
  const css = read('src/legal/PrivacyPolicyDialog.css');
  assert.match(css, /\.pp-backdrop \{[^}]*z-index: 210/);
  assert.match(read('src/archive/DeleteDreamDialog.css'), /\.dd-dialog-backdrop \{[^}]*z-index: 200/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /overflow-y: auto/);
});
