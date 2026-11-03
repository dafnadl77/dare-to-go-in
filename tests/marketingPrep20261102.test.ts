import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { en, he } from '../src/i18n/translations.ts';
import { privacyEn, privacyHe } from '../src/legal/privacyContent.ts';
import {
  PENDING_PACKAGE_KEY,
  PENDING_PACKAGE_TTL_MS,
  getPendingPackage,
  setPendingPackage,
  takePendingPackage,
  type PackageStore,
} from '../src/pricing/pendingPackage.ts';

/**
 * Before marketing (2026-11-02): link previews in the static page, conversion counts with Vercel Web Analytics (nothing personal),
 * the free first dream on the opening, and a package chosen while signed out that comes back after sign-up / sign-in.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// analytics.ts imports demoFlag, which reads a build-time constant; give it the browser globals it expects.
(globalThis as { __DARE_DEMO_BUILD__?: boolean }).__DARE_DEMO_BUILD__ = false;
const { redactUrl, analyticsAllowed, isNewAccount, NEW_ACCOUNT_WINDOW_MS, track } = await import('../src/analytics/analytics.ts');

function memoryStore(): PackageStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

/* ---------- 1. Link previews ---------- */

test('index.html carries Open Graph and Twitter tags with absolute addresses, Hebrew first and English as the alternate', () => {
  const html = read('index.html');
  const meta = (attr: 'property' | 'name', key: string) => new RegExp(`<meta ${attr}="${key.replace(/[:.]/g, '\\$&')}" content="([^"]+)"`).exec(html)?.[1];
  assert.equal(meta('property', 'og:url'), 'https://daretogoin.com/');
  assert.equal(meta('property', 'og:image'), 'https://daretogoin.com/og-image.jpg');
  assert.equal(meta('property', 'og:image:width'), '1200');
  assert.equal(meta('property', 'og:image:height'), '630');
  assert.equal(meta('property', 'og:locale'), 'he_IL');
  assert.equal(meta('property', 'og:locale:alternate'), 'en_US');
  assert.equal(meta('name', 'twitter:card'), 'summary_large_image');
  assert.equal(meta('name', 'twitter:image'), 'https://daretogoin.com/og-image.jpg');
  for (const key of ['og:title', 'og:description']) {
    const value = meta('property', key) ?? '';
    assert.match(value, /[֐-׿]/, `${key} has Hebrew`);
  }
  assert.match(meta('property', 'og:description') ?? '', /A private space for the dreams that stay/, 'and English');
  // the tags are in the static <head>, before the app's script, so crawlers that run no JavaScript see them
  assert.ok(html.indexOf('og:image') < html.indexOf('<script type="module"'));
  // the html element and the general description are unchanged
  assert.match(html, /<html lang="he" dir="rtl">/);
});

test('the share image is a real 1200x630 JPEG in public/ and small enough for WhatsApp and Facebook', () => {
  const buf = readFileSync(new URL('../public/og-image.jpg', import.meta.url));
  assert.equal(buf[0], 0xff);
  assert.equal(buf[1], 0xd8);
  let i = 2;
  let size: { w: number; h: number } | null = null;
  while (i < buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc2) {
      size = { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      break;
    }
    i += 2 + len;
  }
  assert.deepEqual(size, { w: 1200, h: 630 });
  assert.ok(statSync(new URL('../public/og-image.jpg', import.meta.url)).size < 300_000, 'under 300 KB');
});

/* ---------- 2. Measurement ---------- */

test('analytics runs only on the live address and never in the demo', () => {
  assert.equal(analyticsAllowed('daretogoin.com', false), true);
  assert.equal(analyticsAllowed('daretogoin.com', true), false);
  for (const host of ['localhost', '127.0.0.1', 'dare-to-go-in.vercel.app', 'dare-to-go-1rtgfgz61-dafna1.vercel.app', 'www.daretogoin.com.evil.test']) {
    assert.equal(analyticsAllowed(host, false), false, host);
  }
  // not started -> track is a silent no-op (and never throws)
  assert.doesNotThrow(() => track('dream_start'));
});

test('every page address is cut to its path and one known screen name: no sign-in code, token, payment order or anything else', () => {
  assert.equal(redactUrl('https://daretogoin.com/?view=pricing&code=abc123'), 'https://daretogoin.com/?view=pricing');
  assert.equal(redactUrl('https://daretogoin.com/?view=archive#access_token=xyz&refresh_token=q'), 'https://daretogoin.com/?view=archive');
  assert.equal(redactUrl('https://daretogoin.com/?payment=0123456789abcdef0123456789abcdef'), 'https://daretogoin.com/');
  assert.equal(redactUrl('https://daretogoin.com/?view=someone@example.com'), 'https://daretogoin.com/');
  assert.equal(redactUrl('https://daretogoin.com/faq/?q=dream'), 'https://daretogoin.com/faq/');
  assert.equal(redactUrl('not a url'), '');
  const src = code('src/analytics/analytics.ts');
  assert.match(src, /window\.va\('beforeSend'/, 'every event passes through the redaction');
});

test('the only events and properties: no content, names, e-mails, ids or payment details can be sent', () => {
  const src = read('src/analytics/analytics.ts');
  const block = /export interface AnalyticsEvents \{([\s\S]*?)\n\}/.exec(src)?.[1] ?? '';
  const names = [...block.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);
  assert.deepEqual(names, ['signup_open', 'signup_complete', 'dream_start', 'dream_complete', 'pricing_view', 'checkout_start', 'purchase_confirmed']);
  // each call site passes a fixed value, never a variable holding user data
  const files = ['src/App.tsx', 'src/pricing/PricingPage.tsx', 'src/payments/CheckoutDialog.tsx', 'src/payments/PaymentReturnNotice.tsx', 'src/hero/HeroDream.tsx'];
  const calls = files.flatMap((f) => [...code(f).matchAll(/\btrack\('(\w+)'(?:,\s*([\s\S]*?\}))?\)/g)].map((m) => ({ f, name: m[1], data: m[2] ?? '' })));
  assert.deepEqual(calls.map((c) => c.name).sort(), ['checkout_start', 'dream_complete', 'dream_start', 'pricing_view', 'purchase_confirmed', 'signup_complete', 'signup_open'].sort());
  for (const { f, data } of calls) {
    // only the three allowed property names, and no user, account, order or text values
    for (const key of data.matchAll(/(\w+):/g)) assert.ok(['from', 'signed_in', 'package'].includes(key[1]), `${f}: ${key[1]}`);
    assert.doesNotMatch(data, /user\.|email|phone|fullName|orderId|\btext\b|answer/i, `${f}: ${data}`);
  }
  assert.match(code('src/App.tsx'), /from: startDreamIntent \? 'start' : returnToPricingAfterAuth \? 'package' : pendingSaveState === 'awaiting-auth' \? 'save' : authFreeDreamNotice \? 'free_dream_used' : 'other'/);
  assert.match(code('src/pricing/PricingPage.tsx'), /track\('pricing_view', \{ signed_in: signedIn \}\)/);
  // the package property is the package id (a fixed list), never the customer's details
  assert.match(code('src/payments/CheckoutDialog.tsx'), /track\('checkout_start', \{ package: packageId \}\)/);
  // a new account is counted only once it really signs in, and only if it was created moments ago
  const now = Date.parse('2026-11-02T12:00:00Z');
  assert.equal(isNewAccount('2026-11-02T11:59:00Z', now), true);
  assert.equal(isNewAccount(new Date(now - NEW_ACCOUNT_WINDOW_MS - 1000).toISOString(), now), false);
  assert.equal(isNewAccount(undefined, now), false);
  assert.equal(isNewAccount('garbage', now), false);
});

test('the analytics script and its intake are on our own address: the CSP stays closed to third parties', () => {
  const src = code('src/analytics/analytics.ts');
  assert.match(src, /ANALYTICS_SCRIPT_SRC = '\/_vercel\/insights\/script\.js'/);
  const csp = JSON.parse(read('vercel.json')).headers[0].headers.find((h: { key: string }) => h.key === 'Content-Security-Policy').value as string;
  assert.match(csp, /script-src 'self';/);
  assert.match(csp, /connect-src 'self' https:\/\/eijfvsktvfplccolqdpp\.supabase\.co wss:\/\/eijfvsktvfplccolqdpp\.supabase\.co;/);
  assert.match(code('src/main.tsx'), /startAnalytics\(\)/);
});

test('the privacy policy says what is measured, in Hebrew and English, and no longer says there is no analytics', () => {
  for (const lang of ['en', 'he'] as const) {
    const all = (lang === 'en' ? privacyEn : privacyHe).sections.map((s) => s.body).join('\n');
    assert.match(all, /Vercel Web Analytics/);
    assert.match(all, lang === 'en' ? /uses no cookies/ : /אינו משתמש בעוגיות/);
    assert.match(all, lang === 'en' ? /never send the content of dreams/ : /לעולם איננו שולחים את תוכן החלומות/);
    assert.match(all, lang === 'en' ? /12 months/ : /12 חודשים/);
    assert.match(all, lang === 'en' ? /a package you chose before signing in/ : /חבילה שבחרתם לפני שהתחברתם/);
    assert.doesNotMatch(all, lang === 'en' ? /no advertising or analytics trackers|advertising or analytics cookies/ : /פרסומיים או אנליטיים/);
  }
});

/* ---------- 3. The free first dream on the opening ---------- */

test('the opening says the first dream is a gift with a new account, only to a visitor who is not signed in', () => {
  assert.equal(he.howItWorks.freeFirstDream, 'החלום הראשון במתנה, עם פתיחת חשבון.');
  assert.equal(en.howItWorks.freeFirstDream, 'Your first dream is on us when you create an account.');
  assert.match(code('src/hero/HeroDream.tsx'), /<HowItWorksTagline shown=\{[^}]*\} freeFirstDream=\{!user && !authLoading\} \/>/);
  const tsx = code('src/hero/HowItWorks.tsx');
  assert.match(tsx, /\{t\('howItWorks\.tagline'\)\}\s*\{freeFirstDream && <span className="hiw-gift">\{t\('howItWorks\.freeFirstDream'\)\}<\/span>\}/);
  // the approved explanation is unchanged and the note is part of its block (the opening's column keeps its items)
  assert.equal(he.howItWorks.tagline, 'DARE TO GO IN הוא מרחב פרטי לחזור אל חלומות שנשארים: מספרים אותם, רואים אותם ושואלים אותם שאלות.');
  const css = read('src/hero/HowItWorks.css');
  assert.match(css, /\.hiw-gift \{\s*display: block;/);
  // visually hidden (still read by screen readers) where the opening's column is already full (measured), so the approved layout never moves there
  for (const media of [
    /@media \(min-width: 641px\) and \(max-height: 849px\) \{\s*\.hiw-gift \{([^}]*)\}/,
    /@media \(max-width: 640px\) and \(max-height: 779px\) \{\s*\.hiw-gift \{([^}]*)\}/,
    /@media \(max-width: 640px\) and \(max-height: 869px\) \{\s*html:not\(\[lang='he'\]\) \.hiw-gift \{([^}]*)\}/,
    /@media \(max-height: 480px\) and \(orientation: landscape\) \{\s*\.hiw-gift \{([^}]*)\}/,
  ]) {
    const body = media.exec(css)?.[1] ?? '';
    assert.match(body, /position: absolute;[\s\S]*clip-path: inset\(50%\);/, String(media));
    assert.doesNotMatch(body, /display:\s*none/, 'never removed for screen readers');
  }
  // and visible on every screen inside the "How it works" section, for a visitor who is not signed in
  assert.match(tsx, /\{freeFirstDream && <p className="hiw-gift-note">\{t\('howItWorks\.freeFirstDream'\)\}<\/p>\}/);
  assert.match(code('src/hero/HeroDream.tsx'), /<HowItWorksPanel\s+freeFirstDream=\{!user && !authLoading\}/);
});

/* ---------- 4. A package chosen while signed out ---------- */

test('the chosen package is kept briefly, only its id, used once, and dropped when expired or malformed', () => {
  const store = memoryStore();
  const t0 = 1_800_000_000_000;
  setPendingPackage('explore_10', store, t0);
  assert.deepEqual(JSON.parse(store.data.get(PENDING_PACKAGE_KEY)!), { id: 'explore_10', savedAt: t0 }, 'only the id and the time');
  assert.equal(getPendingPackage(store, t0 + 1000), 'explore_10');
  assert.equal(takePendingPackage(store, t0 + 1000), 'explore_10');
  assert.equal(takePendingPackage(store, t0 + 2000), null, 'offered back once');

  setPendingPackage('dive_in_25', store, t0);
  assert.equal(getPendingPackage(store, t0 + PENDING_PACKAGE_TTL_MS + 1), null, 'expires after two hours');
  assert.equal(store.data.has(PENDING_PACKAGE_KEY), false, 'and the expired record is removed');

  store.setItem(PENDING_PACKAGE_KEY, '{"id":"first_dream","savedAt":1}');
  assert.equal(getPendingPackage(store, 2), null, 'the free dream is not a package to buy');
  store.setItem(PENDING_PACKAGE_KEY, 'not json');
  assert.equal(getPendingPackage(store, 2), null);
  assert.equal(getPendingPackage(null), null, 'blocked storage is harmless');
});

test('a signed-out visitor who chooses a package gets SIGN-UP (not sign-in), with the package kept for the way back', () => {
  const app = code('src/App.tsx');
  const handler = /onRequireSignIn=\{\(packageId: PaidPackageId\) => \{([\s\S]*?)\}\}/.exec(app)?.[1] ?? '';
  assert.match(handler, /setPendingPackage\(packageId\)/);
  assert.match(handler, /setAuthMode\('signup'\)/);
  assert.doesNotMatch(handler, /setAuthMode\('signin'\)/);
  assert.match(handler, /setReturnToPricingAfterAuth\(true\)/);
  assert.match(app, /packageIntent=\{returnToPricingAfterAuth\}/);
  // a confirmation link (another tab) or Google returns to Pricing; and any signed-in landing with a waiting package goes there too
  const auth = code('src/archive/DreamAuth.tsx');
  assert.match(auth, /const afterAuth = startDream \? WRITE_VIEW_VALUE : packageIntent \? PRICING_VIEW_VALUE : undefined;/);
  assert.match(auth, /signUpWithPassword\(trimmedEmail, password, name, afterAuth\)/);
  assert.match(auth, /signInWithGoogle\(afterAuth\)/);
  assert.match(app, /if \(getPendingPackage\(\)\) setView\('pricing'\);/);
  // the screen says why, in both languages
  assert.match(he.auth.packageTagline, /חבילה שבחרתם/);
  assert.match(en.auth.packageTagline, /package you chose/);
  // sign-out and account deletion remove the record
  assert.match(read('src/auth/localAccountState.ts'), /SIGN_OUT_LOCAL_STORAGE_KEYS = \[[^\]]*'dare\.pendingPackage\.v1'/);
});

test('back on Pricing, the package opens through the same path as a click: the checkout dialog, never a charge', () => {
  const pricing = code('src/pricing/PricingPage.tsx');
  assert.match(pricing, /onRequireSignIn\?\.\(id\);/);
  const resume = /const plansKnown = [\s\S]*?\}, \[signedIn, plansKnown\]\);/.exec(pricing)?.[0] ?? '';
  assert.match(resume, /takePendingPackage\(\)/);
  assert.match(resume, /handleSelectPaidPackage\(pending\)/, 'the held-package popup and the checkout dialog decide, as for a click');
  assert.match(resume, /!isOwner/);
  assert.doesNotMatch(resume, /startCheckout|location\.assign/, 'nothing is sent to the payment provider from here');
  // the only way to the payment page is still the customer's own submit in the dialog
  const dirs = ['src'];
  const offenders: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(new URL(`../${d}`, import.meta.url))) {
      const p = `${d}/${name}`;
      if (statSync(new URL(`../${p}`, import.meta.url)).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && /\bstartCheckout\(/.test(code(p)) && !/payments\/(checkout|CheckoutDialog)\.tsx?$/.test(p)) offenders.push(p);
    }
  };
  dirs.forEach(walk);
  assert.deepEqual(offenders, []);
});
