import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { en, he } from '../src/i18n/translations.ts';
import { getLegalDocument, type LegalKey } from '../src/legal/legalContent.ts';
import { BUSINESS, operatorLine } from '../src/legal/businessDetails.ts';
import { DREAM_PACKAGES } from '../src/pricing/packages.ts';

/**
 * What the customer is told before paying (Packages page, payment window, Terms, Privacy Policy, Cancellation Policy) matches the approved
 * business facts and what the system really does. The legal texts are DRAFTS: nothing here asserts or implies a lawyer approved them, the
 * draft notices stay, and the business address stays an open item.
 */

// the test runner compiles JSX with the classic transform: give it React, then load the component
(globalThis as unknown as { React: unknown }).React = await import('react');
const { default: LegalBody } = await import('../src/legal/LegalBody.tsx');

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const KEYS: LegalKey[] = ['terms', 'privacy', 'cancellation'];
const text = (lang: 'he' | 'en', key: LegalKey) => {
  const d = getLegalDocument(lang, key);
  return [d.title, d.intro, ...d.sections.flatMap((s) => [s.heading, s.body]), d.draftNotice].join('\n');
};

test('the approved business details appear in the Terms, the Privacy Policy and the Cancellation Policy, in both languages', () => {
  for (const key of ['terms', 'privacy'] as const) {
    assert.ok(text('he', key).includes(`${BUSINESS.operatorHe}, ${BUSINESS.dealerTypeHe}, מספר עוסק ${BUSINESS.dealerNumber}`) || text('he', key).includes(`${BUSINESS.operatorHe}, ${BUSINESS.dealerTypeHe}`), `he/${key} operator`);
    assert.ok(text('he', key).includes(BUSINESS.dealerNumber), `he/${key} number`);
    assert.ok(text('he', key).includes(BUSINESS.locationHe), `he/${key} location`);
    assert.ok(text('en', key).includes(BUSINESS.operatorEn) && text('en', key).includes(BUSINESS.dealerNumber) && text('en', key).includes(BUSINESS.locationEn), `en/${key}`);
  }
  for (const lang of ['he', 'en'] as const) for (const key of KEYS) assert.ok(text(lang, key).includes(BUSINESS.email) || key === 'privacy' || key === 'terms', `${lang}/${key} email`);
  for (const lang of ['he', 'en'] as const) {
    assert.ok(text(lang, 'terms').includes(BUSINESS.email) && text(lang, 'privacy').includes(BUSINESS.email) && text(lang, 'cancellation').includes(BUSINESS.email), `${lang}: contact email in all three`);
    assert.ok(text(lang, 'terms').includes('DARE TO GO IN'));
  }
  assert.equal(BUSINESS.dealerNumber, '033868969');
  assert.equal(BUSINESS.email, 'daretogoin@gmail.com');
});

test('the business ADDRESS is an open item: only the city is published, no street is invented, and it is recorded as open in code', () => {
  assert.equal(BUSINESS.fullAddress, null);
  assert.equal(BUSINESS.addressStatus, 'open');
  for (const lang of ['he', 'en'] as const) for (const key of KEYS) assert.ok(!/רחוב|רח'|\bstreet\b|\bSt\.\b|P\.?O\.? ?Box|ת\.ד/i.test(text(lang, key)), `${lang}/${key}: no street or box`);
  // the open note is internal: it never appears on a public page
  for (const lang of ['he', 'en'] as const) for (const key of KEYS) assert.ok(!/Decision needed|נדרשת החלטה|\[להשלמה|\[TO COMPLETE/.test(text(lang, key)), `${lang}/${key}: no internal marker on the public page`);
  assert.ok(operatorLine('he').includes(BUSINESS.locationHe) && operatorLine('en').includes(BUSINESS.locationEn));
});

test('no draft notice and no "will be replaced before launch" (removed by decision of the owner, 2026-10-29); nothing says who wrote or reviewed the documents', () => {
  for (const lang of ['he', 'en'] as const) {
    for (const key of KEYS) {
      const d = getLegalDocument(lang, key);
      assert.equal(d.draftNotice, undefined, `${lang}/${key}: no closing draft notice`);
      const all = text(lang, key);
      assert.ok(!/is a draft|draft (privacy|cancellation)|טיוטה,|טיוטת (מדיניות|תנאי)|זוהי טיוטה/i.test(all), `${lang}/${key}: not presented as a draft`);
      assert.ok(!/will replace (it|them)|before any commercial launch|תחליף אות(ו|ם)|לפני השקה מסחרית|formally reviewed|מאושרת משפטית/i.test(all), `${lang}/${key}: no promise of a replacement`);
      assert.ok(!/lawyer|עורך דין|עורכי דין|reviewed by|approved by|נבדק(ה)? (על ידי|בידי)|אושר(ה|ו)? (על ידי|בידי)/i.test(all), `${lang}/${key}: says nothing about who reviewed it`);
    }
    // the accessibility statement keeps its own, accurate note about the ongoing accessibility review
    assert.ok(getLegalDocument(lang, 'accessibility').draftNotice?.trim());
  }
});

test('the policies say the approved things: one-time, no subscription, no expiry, no voluntary refunds beyond the law, unused balance deleted with the account, prices incl. VAT', () => {
  const heTerms = text('he', 'terms');
  const enTerms = text('en', 'terms');
  assert.match(heTerms, /התשלום חד־פעמי\. אין מנוי, אין חיוב חוזר/);
  assert.match(enTerms, /Payment is one-time\. There is no subscription and no recurring or automatic charge/);
  assert.match(heTerms, /הקרדיטים אינם פגי תוקף/);
  assert.match(enTerms, /Credits do not expire/);
  assert.match(heTerms, /אין לנו מדיניות החזרים מרצון מעבר לזכויות הקבועות בדין/);
  assert.match(enTerms, /We do not have a voluntary refund policy beyond the rights set by law/);
  assert.match(heTerms, /כל יתרת קרדיטים שלא נוצלה/);
  assert.match(enTerms, /any unused credit balance/);
  assert.match(heTerms, /כל המחירים כוללים מע"מ/);
  assert.match(enTerms, /All prices include VAT/);
  // not a blanket denial of consumer rights, and not a claim about which rights apply
  for (const lang of ['he', 'en'] as const) {
    const c = text(lang, 'cancellation');
    assert.match(c, lang === 'he' ? /הזכויות שהדין מקנה לכם כצרכנים נשארות בתוקף/ : /rights the law gives you as a consumer remain in force/);
    assert.match(c, lang === 'he' ? /מידע כהגדרתו בחוק המחשבים/ : /information as defined in the Computers Law/);
    assert.match(c, lang === 'he' ? /5% ממחיר העסקה או 100 ₪, הנמוך מביניהם/ : /5% of the transaction price or ₪100, whichever is lower/);
    assert.ok(!/אין (שום )?זכות ביטול|no right to cancel|cannot be cancelled|non-refundable/i.test(c), `${lang}: no blanket denial`);
  }
});

test('the figures in the documents match the real packages: 3 / 10 / 25 dreams for 59 / 149 / 279 ILS', () => {
  const paid = DREAM_PACKAGES.filter((p) => p.priceIls !== null);
  assert.deepEqual(paid.map((p) => [p.dreamCount, p.priceIls]), [[3, 59], [10, 149], [25, 279]]);
  assert.match(text('he', 'terms'), /3 חלומות ב-59 ₪, 10 חלומות ב-149 ₪, 25 חלומות ב-279 ₪/);
  assert.match(text('en', 'terms'), /3 dreams for ₪59, 10 dreams for ₪149, 25 dreams for ₪279/);
});

test('what the documents say about the system is true: credits never expire in the database, and deleting an account removes the balance', () => {
  const migrations = readdirSync(new URL('../supabase/migrations', import.meta.url)).map((f) => ({ f, s: read(`supabase/migrations/${f}`) }));
  const creditsDef = migrations.find((m) => m.f === '20260924_credits_entitlement.sql')!.s;
  assert.doesNotMatch(creditsDef.replace(/--.*$/gm, ''), /expires?_at|valid_until|expiry/i, 'no expiry column on the credit tables');
  const deletion = migrations.find((m) => m.f === '20260924_account_deletion.sql')!.s;
  assert.match(deletion, /delete from public\.dream_credits where owner_id = p_user/);
  assert.match(deletion, /delete from public\.dreams where owner_id = p_user/);
  assert.match(deletion, /update public\.credit_ledger set owner_id = null where owner_id = p_user/, 'purchase records are kept unlinked');
  assert.match(read('supabase/migrations/20261007_payment_orders.sql'), /owner_id\s+uuid references auth\.users \(id\) on delete set null/, 'payment orders are kept unlinked');
});

test('the Packages page states the purchase terms: final price incl. VAT on every card, one-time, no expiry, documents, seller, and links to all three documents', () => {
  const page = strip(read('src/pricing/PricingPage.tsx'));
  assert.match(page, /\{t\('pricing\.vatIncluded'\)\}/, 'VAT label next to each price');
  assert.match(page, /<section className="pr-info" aria-labelledby="pr-info-title">/);
  for (const key of ['infoOneTime', 'infoVat', 'infoNoExpiry', 'infoCredit', 'infoPayment', 'infoInvoice', 'infoRefunds', 'infoDeletion']) assert.match(page, new RegExp(`t\\('pricing\\.${key}'\\)`), key);
  for (const key of ['terms', 'privacy', 'cancellation']) assert.match(page, new RegExp(`onClick=\\{\\(\\) => onOpenLegal\\('${key}'\\)\\}`), `link to ${key}`);
  assert.match(page, /operatorLine\(language\)/);
  assert.match(page, /\{!isOwner && \(\s*<section className="pr-info"/, 'shown wherever the packages are shown');
  assert.match(strip(read('src/App.tsx')), /LEGAL_VIEWS: LegalKey\[\] = \['privacy', 'accessibility', 'terms', 'cancellation'\]/, 'the Cancellation Policy has its own page');
  // both languages say the same things
  assert.equal(en.pricing.vatIncluded, 'incl. VAT');
  assert.equal(he.pricing.vatIncluded, 'כולל מע"מ');
  assert.match(en.pricing.infoOneTime, /No subscription and no recurring charge/);
  assert.match(he.pricing.infoOneTime, /אין מנוי ואין חיוב חוזר/);
  assert.match(en.pricing.infoNoExpiry, /do not expire/);
  assert.match(he.pricing.infoNoExpiry, /אינם פגי תוקף/);
  assert.match(en.pricing.infoRefunds, /voluntary refund policy beyond your rights under law/);
  assert.match(he.pricing.infoRefunds, /מדיניות החזרים מרצון מעבר לזכויותיכם לפי דין/);
  assert.match(en.pricing.infoInvoice, /Morning/);
  assert.match(he.pricing.infoInvoice, /Morning/);
  assert.match(he.pricing.infoDeletion, /יתרת קרדיטים שלא נוצלה/);
  assert.match(operatorLine('he'), /דפנה דלמדה, עוסק מורשה 033868969, קריית אונו, ישראל · daretogoin@gmail\.com/);
  assert.match(operatorLine('en'), /Dafna Dalmada, licensed dealer 033868969, Kiryat Ono, Israel · daretogoin@gmail\.com/);
});

test('the payment window shows the terms and asks for acceptance BEFORE anything is sent: price incl. VAT, the three documents, an accessible checkbox, an error, and no request without it', () => {
  const dialog = strip(read('src/payments/CheckoutDialog.tsx'));
  for (const key of ['vatIncluded', 'termsOneTime', 'termsVat', 'termsNoExpiry', 'termsInvoice', 'docsLead', 'linkTerms', 'linkPrivacy', 'linkCancellation', 'consent', 'errConsent']) assert.match(dialog, new RegExp(`t\\('pricing\\.checkout\\.${key}'\\)`), key);
  assert.match(dialog, /operatorLine\(language\)/);
  // the checkbox: a real checkbox with a label, required, announced when missing, focusable
  assert.match(dialog, /type="checkbox"/);
  assert.match(dialog, /<label htmlFor=\{`\$\{titleId\}-consent`\} className="co-consent-label">/);
  assert.match(dialog, /aria-required="true"/);
  assert.match(dialog, /aria-invalid=\{consentInvalid\}/);
  assert.match(dialog, /<p id=\{consentErrorId\} className="co-error" role="alert">/);
  // the gate: consent is checked in the same step as the other fields and returns BEFORE the request
  const submit = dialog.slice(dialog.indexOf('const submit = async'), dialog.indexOf('return (', dialog.indexOf('const submit = async')));
  assert.ok(submit.indexOf('const consentBad = !consent;') > -1);
  assert.ok(submit.indexOf('if (nameBad || phoneBad || consentBad)') < submit.indexOf('startCheckout('), 'no request before every check passes');
  assert.match(submit, /\(nameBad \? nameRef : phoneBad \? phoneRef : consentRef\)\.current\?\.focus\(\)/);
  // the request itself is unchanged: only the package id, the name and the phone
  assert.match(submit, /startCheckout\(packageId, fullName\.trim\(\), phone\.trim\(\)\)/);
  assert.match(read('server/payments/checkoutStart.ts'), /const REQUEST_KEYS = \['fullName', 'packageId', 'phone'\];/);
  // nothing in the dialog stores the acceptance or the form
  assert.ok(!/localStorage|sessionStorage|document\.cookie/.test(dialog));
  // both languages
  assert.match(en.pricing.checkout.consent, /I have read the Terms of Use, the Privacy Policy and the Cancellation and Refund Policy, and I accept the purchase terms/);
  assert.match(he.pricing.checkout.consent, /קראתי את תנאי השימוש, מדיניות הפרטיות ומדיניות הביטולים והחזרים, ואני מאשר\/ת את תנאי הרכישה/);
  assert.match(en.pricing.checkout.errConsent, /please accept the purchase terms/);
  assert.match(he.pricing.checkout.errConsent, /יש לאשר את תנאי הרכישה/);
});

test('mobile and accessibility: the dialog scrolls on small screens, the checkbox is large, focus is visible, and there is no wash, blur or shadow in the new styles', () => {
  const css = read('src/payments/CheckoutDialog.css');
  assert.match(read('src/archive/DeleteDreamDialog.css'), /\.dd-dialog \{[^}]*max-height: 100%;[^}]*overflow-y: auto;/);
  assert.match(css, /\.co-consent-box \{[^}]*width: 1\.4rem;[^}]*height: 1\.4rem;/);
  assert.match(css, /\.co-consent-box:focus-visible/);
  for (const file of ['src/payments/CheckoutDialog.css', 'src/pricing/PricingPage.css', 'src/archive/TransactionDocumentsPanel.css', 'src/legal/LegalPage.css', 'src/legal/PrivacyPolicyDialog.css']) {
    const added = read(file).split('\n').slice(-120).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
    const block = file.includes('PricingPage') ? added.slice(added.indexOf('.pr-card-vat')) : file.includes('CheckoutDialog') ? added.slice(added.indexOf('.co-vat')) : added;
    if (file.includes('PricingPage') || file.includes('CheckoutDialog') || file.includes('TransactionDocumentsPanel')) assert.doesNotMatch(block, /blur\(|box-shadow|text-shadow|filter:/, `${file}: nothing soft in the new rules`);
  }
});

test('the documents render as readable lists: lines starting with "- " become a bulleted list, other paragraphs stay paragraphs, emails stay links', () => {
  const html = renderToStaticMarkup(createElement(LegalBody, { body: '- first\n- second with daretogoin@gmail.com\n\nA plain paragraph.', paragraphClass: 'p', listClass: 'l' }));
  assert.match(html, /<ul class="l"><li>first<\/li><li>second with <a [^>]*mailto:daretogoin@gmail\.com[^>]*>daretogoin@gmail\.com<\/a><\/li><\/ul>/);
  assert.match(html, /<p class="p">A plain paragraph\.<\/p>/);
  assert.doesNotMatch(html, /dangerouslySetInnerHTML/);
});

test('Hebrew and English carry the same keys for everything added, and the documents have the same sections in both languages', () => {
  for (const key of ['terms', 'privacy', 'cancellation'] as LegalKey[]) {
    assert.equal(getLegalDocument('he', key).sections.length, getLegalDocument('en', key).sections.length, `${key}: same number of sections`);
  }
  for (const k of Object.keys(en.pricing.checkout)) assert.ok(k in he.pricing.checkout, `checkout.${k}`);
  for (const k of Object.keys(en.pricing).filter((x) => /^(info|link|vat)/.test(x))) assert.ok(k in he.pricing, `pricing.${k}`);
  for (const k of Object.keys(en.archive).filter((x) => x.startsWith('purchases'))) assert.ok(k in he.archive, `archive.${k}`);
});

test('invoice wording: issued and sent by the dealer within the times the law sets; never promised as automatic or instant', () => {
  const surfaces: Array<[string, string]> = [
    ['en pricing', en.pricing.infoInvoice], ['en checkout', en.pricing.checkout.termsInvoice],
    ['he pricing', he.pricing.infoInvoice], ['he checkout', he.pricing.checkout.termsInvoice],
  ];
  for (const [name, s] of surfaces) {
    assert.match(s, /Dafna Dalmada|דפנה דלמדה/, `${name}: names the dealer who issues it`);
    assert.match(s, /times the law sets|למועדים הקבועים בדין/, `${name}: within the legal times`);
    assert.match(s, /not sent automatically or instantly|אינה נשלחת אוטומטית או מיידית|אינה נשלחת אוטומטית או מיידית/, `${name}: not automatic or instant`);
  }
  for (const lang of ['he', 'en'] as const) {
    const t = text(lang, 'terms');
    assert.match(t, lang === 'he' ? /ולכן אינם נשלחים אוטומטית או מיידית/ : /not sent automatically or instantly/);
  }
  const doc = read('src/payments/transactionDocument.ts');
  assert.match(doc, /issued and sent to you separately by the dealer, within the times the law sets/);
  assert.match(doc, /מופקת ונשלחת אליכם בנפרד על ידי העוסקת, בהתאם למועדים הקבועים בדין/);
  // nothing in customer-facing text promises an immediate or automatic invoice
  for (const s of [en.pricing.infoInvoice, en.pricing.checkout.termsInvoice]) assert.doesNotMatch(s.replace(/not sent automatically or instantly/, ''), /immediately|instantly|automatically/i);
});
