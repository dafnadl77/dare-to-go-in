import { BUSINESS } from '../legal/businessDetails';

/**
 * The transaction-details document ("מסמך פרטי העסקה") that a remote seller must give the consumer in writing, no later than delivery
 * (Consumer Protection Law, section 14C(b)). Until invoices are automated, the owner sends it by hand to the email of the account that
 * bought, together with the tax invoice / receipt issued in Morning. This builds the text from one completed order; it holds no data of its
 * own and invents none. The wording is the approved "transaction details document" template (docs/legal-drafts-2026-10/launch-documents-v3.md).
 */

export type DocumentLanguage = 'he' | 'en';
export type PurchasablePackage = 'go_deeper_3' | 'explore_10' | 'dive_in_25';

export interface DocumentOrder {
  orderId: string;
  /** null = the account was deleted: there is no address to send to. */
  accountEmail: string | null;
  packageId: PurchasablePackage;
  credits: number;
  amountIls: number;
  paidAt: string | null;
}

const PACKAGE_NAME: Record<DocumentLanguage, Record<PurchasablePackage, string>> = {
  he: { go_deeper_3: 'להעמיק', explore_10: 'לחקור', dive_in_25: 'לצלול פנימה' },
  en: { go_deeper_3: 'Go Deeper', explore_10: 'Explore', dive_in_25: 'Dive In' },
};

/** The reference the customer sees on the screen after paying (the first eight characters of the order id, upper case). */
export function orderReference(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase();
}

function formatDate(iso: string | null, language: DocumentLanguage): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(language === 'he' ? 'he-IL' : 'en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Jerusalem' });
}

export function buildTransactionDocument(order: DocumentOrder, language: DocumentLanguage): { subject: string; body: string } {
  const ref = orderReference(order.orderId);
  const date = formatDate(order.paidAt, language);
  const pkg = PACKAGE_NAME[language][order.packageId];
  if (language === 'he') {
    const email = order.accountEmail ?? '[החשבון נמחק]';
    return {
      subject: `${BUSINESS.brand} — מסמך פרטי העסקה (אסמכתא ${ref})`,
      body: [
        `מסמך פרטי העסקה — ${BUSINESS.brand}`,
        `מספר אסמכתא: ${ref}`,
        `תאריך התשלום: ${date}`,
        '',
        `- המוכרת: ${BUSINESS.operatorHe}, ${BUSINESS.dealerTypeHe} ${BUSINESS.dealerNumber}, ${BUSINESS.locationHe}, ${BUSINESS.email}. המותג: ${BUSINESS.brand}.`,
        `- מה נרכש: חבילת "${pkg}", ${order.credits} קרדיטים. קרדיט אחד מאפשר ליצור חלום אחד מלא (מסע חלום, תמונה והתבוננות, ושמירה בארכיון).`,
        `- המחיר ותנאי התשלום: ${order.amountIls} ₪, כולל מע"מ, בתשלום חד־פעמי אחד בדף התשלום של Grow. אין מנוי ואין חיוב חוזר.`,
        `- אספקה: הקרדיטים נוספו לחשבון ${email} אוטומטית לאחר אישור התשלום, ואינם פגי תוקף.`,
        '- תוקף ההצעה: המחיר הנקוב היה תקף ליום הרכישה.',
        `- ביטול: אפשר לבקש ביטול או בירור בהודעה אל ${BUSINESS.email}, עם מספר האסמכתא. זכויות הביטול נקבעות לפי חוק הגנת הצרכן, כמפורט במדיניות ביטולים והחזרים באתר.`,
        '- אחריות / יצרן / ארץ ייצור: אינם רלוונטיים לשירות דיגיטלי זה.',
        '',
        'חשבונית המס / הקבלה על התשלום מופקת ונשלחת אליכם בנפרד על ידי העוסקת, בהתאם למועדים הקבועים בדין.',
      ].join('\n'),
    };
  }
  const email = order.accountEmail ?? '[account deleted]';
  return {
    subject: `${BUSINESS.brand} — Transaction details (reference ${ref})`,
    body: [
      `Transaction details document — ${BUSINESS.brand}`,
      `Reference: ${ref}`,
      `Payment date: ${date}`,
      '',
      `- Seller: ${BUSINESS.operatorEn}, ${BUSINESS.dealerTypeEn} ${BUSINESS.dealerNumber}, ${BUSINESS.locationEn}, ${BUSINESS.email}. Brand: ${BUSINESS.brand}.`,
      `- What was bought: the "${pkg}" package, ${order.credits} credits. One credit lets you create one full dream (a dream journey, an image and a reflection, saved to your archive).`,
      `- Price and payment terms: ₪${order.amountIls}, including VAT, in a single one-time payment on Grow's payment page. No subscription and no recurring charge.`,
      `- Delivery: the credits were added to the account ${email} automatically once the payment was confirmed, and do not expire.`,
      '- Offer validity: the stated price applied on the day of purchase.',
      `- Cancellation: you may ask to cancel or check something by writing to ${BUSINESS.email} with the reference. The right to cancel is set by the Consumer Protection Law, as described in the Cancellation and Refund Policy on the site.`,
      '- Warranty / manufacturer / country of manufacture: not applicable to this digital service.',
      '',
      'The tax invoice / receipt for the payment is issued and sent to you separately by the dealer, within the times the law sets.',
    ].join('\n'),
  };
}

/** A mailto: link to the account's address with the document filled in; null when there is no address (the account was deleted). */
export function transactionDocumentMailto(order: DocumentOrder, language: DocumentLanguage): string | null {
  if (!order.accountEmail || /[\r\n<>,;]/.test(order.accountEmail)) return null;
  const { subject, body } = buildTransactionDocument(order, language);
  return `mailto:${encodeURIComponent(order.accountEmail).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
