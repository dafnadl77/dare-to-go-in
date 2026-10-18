import type { Language } from '../i18n/LanguageContext';
import { privacyEn, privacyHe } from './privacyContent';
import { termsEn, termsHe } from './termsContent';

/** Long-form legal/accessibility documents — deliberately kept OUTSIDE
    translations.ts's flat dotted-string `t()` system: that system is built
    for short UI labels (see LanguageContext.tsx's `lookup()`, which only
    ever returns a single string per key), not multi-section documents.
    This module is still "the existing i18n system" in every way that
    matters — keyed by the same `Language` type, selected via the same
    `language` value `useLanguage()` already exposes — it's just a
    dedicated shape for long-form content instead of one-off flat keys.

    Every document ends with its own draftNotice — plain, visible, never
    buried — since none of this has had a real legal review yet. The business
    details quoted in the Terms, the Privacy Policy and the Cancellation Policy
    are the ones in businessDetails.ts (a test keeps them identical). */

export type LegalKey = 'privacy' | 'accessibility' | 'terms' | 'cancellation';

export interface LegalSection {
  heading: string;
  /** One or more paragraphs, separated by a blank line — rendered as
      separate <p> tags (see LegalPage.tsx), never as raw HTML. A paragraph
      whose lines all start with "- " is rendered as a bulleted list. */
  body: string;
}

export interface LegalDocument {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
  draftNotice: string;
}

export interface LegalContent {
  privacy: LegalDocument;
  accessibility: LegalDocument;
  terms: LegalDocument;
  cancellation: LegalDocument;
}

const en: LegalContent = {
  privacy: privacyEn,
  accessibility: {
    title: 'Accessibility Statement',
    updated: 'Last updated: September 2026',
    intro:
      'DARE TO GO IN is built to be usable by as many people as reasonably possible, including people who rely on assistive technology, keyboard navigation, or adjusted text and contrast settings. This statement describes where things stand today, honestly — including what still needs work.',
    sections: [
      {
        heading: 'Our commitment',
        body: 'We care about making DARE usable regardless of how someone navigates the web — by mouse, touch, keyboard, or assistive technology — and treat accessibility as ongoing work, not a box to check once.',
      },
      {
        heading: 'Keyboard navigation',
        body: 'Buttons, links, and form fields throughout DARE are built as real, focusable elements and are intended to be reachable and operable by keyboard. Some of the more cinematic, animation-driven screens (the dream recording and reconstruction sequence in particular) have not yet had a full manual keyboard-only pass, and may have rough edges there.',
      },
      {
        heading: 'Contrast & responsive design',
        body: 'Text throughout the app is set against DARE\'s cinematic cloud/night backgrounds with a deliberate combination of color, weight, and shadow chosen for readability, and the layout is designed to work across desktop and mobile screen sizes. This is checked by eye on an ongoing basis, not yet against a formal contrast-ratio tool for every screen.',
      },
      {
        heading: 'Language & direction support',
        body: 'DARE is available in English and Hebrew, with full right-to-left (RTL) layout support in Hebrew — including form fields, navigation, and the accessibility panel itself.',
      },
      {
        heading: 'The accessibility panel',
        body: 'A floating accessibility control (bottom-left of the screen) offers real, working adjustments: text size, a higher-contrast mode, underlined links, and reduced motion, on top of whatever your operating system or browser already prefers. Your choices are remembered on your own device.',
      },
      {
        heading: 'Known limitations',
        body: 'DARE has not been formally audited or certified against any accessibility standard (such as WCAG), and we do not claim such compliance. Screen-reader behavior on the more animated, immersive screens has not been extensively tested. Accessibility review and testing here is ongoing, and this statement will be updated as that work continues.',
      },
      {
        heading: 'Contact us about accessibility',
        body: 'If you hit a real barrier using DARE, or have a suggestion, please tell us at daretogoin@gmail.com — genuine reports directly shape what gets fixed next.',
      },
    ],
    draftNotice:
      'This statement reflects an honest, in-progress state, not a completed or certified audit. Accessibility review and testing is ongoing.',
  },
  terms: termsEn,
  cancellation: {
    title: 'Cancellation and Refund Policy',
    updated: 'Last updated: October 2026',
    intro:
      'This document explains what happens if you want to cancel a purchase on DARE, and the rights the law gives you as a consumer. It is written in plain language — a fuller, formally reviewed version will replace it before any commercial launch.',
    sections: [
      {
        heading: 'In short',
        body: 'Buying on DARE is a one-time payment, with no subscription and no recurring charge. We do not have a voluntary refund policy beyond the rights set by law. The rights the law gives you as a consumer remain in force, and we will act on them.',
      },
      {
        heading: 'What the law provides (summary, under the Consumer Protection Law, 5741-1981)',
        body: '- For a transaction concluded remotely (for example through a website) you may, as a rule, cancel within 14 days, counted from the later of the day of the transaction and the day you receive the transaction details document (section 14C).\n- The right to cancel has exceptions set by law, including information as defined in the Computers Law (section 14C(d)). If a particular purchase falls within such an exception under the law, the right does not apply to it.\n- On an ordinary cancellation a cancellation fee may be charged of no more than 5% of the transaction price or ₪100, whichever is lower (section 14E; the Consumer Protection (Cancellation of Transaction) Regulations, 5771-2010).\n- On cancellation because of a defect, a mismatch with what was promised, or non-delivery, no cancellation fee is charged.\n- Consumers who are persons with disabilities, senior citizens or new immigrants may, on the conditions set by law, cancel within four months (section 14C1).',
      },
      {
        heading: 'How to ask for a cancellation or to check something',
        body: 'Send a message to daretogoin@gmail.com from your account\'s email address, with the payment reference number (shown on the screen you return to after paying, and on the invoice). Please write "cancellation" in the subject. We will reply and handle the request within the times the law sets. Where the law requires a refund, it will be made by the payment method used, less a cancellation fee where the law allows.',
      },
      {
        heading: 'Credits used and unused',
        body: 'A credit used to create a dream has already been provided, and we will handle it as the law requires. A credit deducted because of a technical failure on our side or at a provider is returned to the account automatically. If you paid and the credits were not added, we will add them or refund the payment.',
      },
      {
        heading: 'Deleting an account and not using credits',
        body: 'Deleting an account or not using credits is not a cancellation request. An unused credit balance is deleted with the account and is not refundable voluntarily; your rights under the law are not affected. If you are considering cancelling a purchase, please contact us before deleting the account.',
      },
    ],
    draftNotice:
      'This is a draft cancellation policy, written for a small, early-stage app. It has not yet been reviewed by a lawyer and should not be relied on as a complete or final legal document — a properly reviewed policy will replace this before any commercial launch.',
  },
};

const he: LegalContent = {
  privacy: privacyHe,
  accessibility: {
    title: 'הצהרת נגישות',
    updated: 'עודכן לאחרונה: ספטמבר 2026',
    intro:
      'DARE TO GO IN נבנתה כך שתהיה שמישה עבור כמה שיותר אנשים, כולל מי שנעזר בטכנולוגיה מסייעת, בניווט מקלדת, או בהתאמות טקסט וניגודיות. ההצהרה הזו מתארת את המצב הנוכחי בכנות — כולל מה שעדיין דורש עבודה.',
    sections: [
      {
        heading: 'המחויבות שלנו',
        body: 'חשוב לנו ש-DARE תהיה שמישה בלי קשר לאופן שבו גולשים בה — עכבר, מגע, מקלדת או טכנולוגיה מסייעת — ואנחנו מתייחסים לנגישות כעבודה מתמשכת, לא כמשימה חד-פעמית.',
      },
      {
        heading: 'ניווט מקלדת',
        body: 'כפתורים, קישורים ושדות טופס באפליקציה נבנים כאלמנטים אמיתיים הניתנים למיקוד, ומיועדים להיות נגישים ותפעוליים באמצעות מקלדת. חלק מהמסכים הקולנועיים והעשירים באנימציה (ברצף ההקלטה והשחזור של החלום בפרט) עדיין לא עברו בדיקה ידנית מלאה של ניווט מקלדת בלבד, וייתכנו שם קשיים.',
      },
      {
        heading: 'ניגודיות ועיצוב רספונסיבי',
        body: 'הטקסט באפליקציה מוצג על רקעי העננים והלילה הקולנועיים של DARE בשילוב מכוון של צבע, משקל וצל שנבחר לשם קריאות, והעיצוב מותאם לעבודה במסכי מחשב ומובייל כאחד. הבדיקה נעשית כרגע לפי התרשמות שוטפת, לא עדיין באמצעות כלי מדידת ניגודיות פורמלי לכל מסך.',
      },
      {
        heading: 'תמיכה בשפה וכיווניות',
        body: 'DARE זמינה בעברית ובאנגלית, עם תמיכה מלאה בפריסה מימין לשמאל (RTL) בעברית — כולל שדות טופס, ניווט, ולוח הנגישות עצמו.',
      },
      {
        heading: 'לוח הנגישות',
        body: 'פקד נגישות צף (בפינה השמאלית התחתונה של המסך) מציע התאמות אמיתיות ופועלות: גודל טקסט, מצב ניגודיות גבוהה, קו תחתון לקישורים, והפחתת תנועה — בנוסף למה שמערכת ההפעלה או הדפדפן כבר מעדיפים. הבחירות נשמרות על המכשיר שלכם בלבד.',
      },
      {
        heading: 'מגבלות ידועות',
        body: 'DARE לא עברה ביקורת או הסמכה פורמלית מול תקן נגישות כלשהו (כגון WCAG), ואיננו טוענים לעמידה כזו. התנהגות קורא מסך במסכים העשירים באנימציה לא נבדקה לעומק. בדיקת הנגישות באפליקציה היא עבודה מתמשכת, וההצהרה הזו תתעדכן ככל שהעבודה תתקדם.',
      },
      {
        heading: 'יצירת קשר בנושא נגישות',
        body: 'אם נתקלתם במחסום אמיתי בשימוש ב-DARE, או שיש לכם הצעה, אנא ספרו לנו ב-daretogoin@gmail.com — דיווחים אמיתיים משפיעים ישירות על מה שמתוקן הלאה.',
      },
    ],
    draftNotice:
      'הצהרה זו משקפת מצב כן ומתמשך, לא ביקורת שהושלמה או הוסמכה. בדיקת הנגישות באפליקציה נמשכת.',
  },
  terms: termsHe,
  cancellation: {
    title: 'מדיניות ביטולים והחזרים',
    updated: 'עודכן לאחרונה: אוקטובר 2026',
    intro:
      'המסמך הזה מסביר מה קורה אם רוצים לבטל רכישה ב-DARE, ומה הזכויות שהדין נותן לכם כצרכנים. הוא נכתב בשפה פשוטה — גרסה מלאה ומאושרת משפטית תחליף אותו לפני השקה מסחרית.',
    sections: [
      {
        heading: 'בקצרה',
        body: 'הרכישה ב-DARE חד־פעמית, ללא מנוי וללא חיוב חוזר. אין לנו מדיניות החזרים מרצון מעבר לזכויות הקבועות בדין. הזכויות שהדין מקנה לכם כצרכנים נשארות בתוקף, ואנחנו נפעל לפיהן.',
      },
      {
        heading: 'מה הדין קובע (תמצית, לפי חוק הגנת הצרכן, התשמ"א–1981)',
        body: '- בעסקה שנעשתה מרחוק (למשל דרך אתר) ניתן, ככלל, לבטל את העסקה בתוך 14 ימים, לפי המועד המאוחר בין יום העסקה ליום קבלת מסמך פרטי העסקה (סעיף 14ג).\n- לזכות הביטול יש חריגים שקבועים בדין, ובהם מידע כהגדרתו בחוק המחשבים (סעיף 14ג(ד)). אם רכישה מסוימת נכללת בחריג כזה לפי הדין, הזכות לא חלה עליה.\n- בביטול רגיל ניתן לגבות דמי ביטול בשיעור שלא יעלה על 5% ממחיר העסקה או 100 ₪, הנמוך מביניהם (סעיף 14ה; תקנות הגנת הצרכן (ביטול עסקה), התשע"א–2010).\n- בביטול עקב פגם, אי־התאמה למה שהובטח או אי־אספקה, לא נגבים דמי ביטול.\n- צרכנים שהם אנשים עם מוגבלות, אזרחים ותיקים או עולים חדשים רשאים, בתנאים שהדין קובע, לבטל בתוך ארבעה חודשים (סעיף 14ג1).',
      },
      {
        heading: 'איך מבקשים ביטול או בירור',
        body: 'שולחים הודעה אל daretogoin@gmail.com מכתובת המייל של החשבון, עם מספר האסמכתא של התשלום (מופיע במסך החזרה מהתשלום ובחשבונית). מומלץ לציין את המילה "ביטול" בנושא ההודעה. נשיב ונטפל בבקשה בהתאם למועדים שקובע הדין. אם הדין מחייב החזר, הוא יינתן באמצעי התשלום שבו שולם, בניכוי דמי ביטול אם הדין מתיר.',
      },
      {
        heading: 'קרדיטים שנוצלו ושלא נוצלו',
        body: 'קרדיט שנוצל ליצירת חלום כבר סופק, ואת הטיפול בו נבצע לפי הדין. קרדיט שהופחת בשל כשל טכני אצלנו או אצל ספק מוחזר אוטומטית לחשבון. אם שילמתם והקרדיטים לא נוספו, נוסיף אותם או נחזיר את התשלום.',
      },
      {
        heading: 'מחיקת חשבון ואי־שימוש',
        body: 'מחיקת חשבון או אי־שימוש בקרדיטים אינם בקשת ביטול. יתרת קרדיטים שלא נוצלה נמחקת עם מחיקת החשבון, ואינה ניתנת להחזר מרצון; זכויותיכם לפי הדין לא נפגעות. אם אתם שוקלים לבטל רכישה, מומלץ לפנות אלינו לפני מחיקת החשבון.',
      },
    ],
    draftNotice:
      'זוהי טיוטת מדיניות ביטולים שנכתבה עבור אפליקציה קטנה בשלב מוקדם. היא טרם נבדקה על ידי עורך דין ואין להסתמך עליה כמסמך משפטי סופי ומלא — מדיניות שעברה בדיקה משפטית מסודרת תחליף אותה לפני השקה מסחרית.',
  },
};

const CONTENT: Record<Language, LegalContent> = { en, he };

export function getLegalDocument(language: Language, key: LegalKey): LegalDocument {
  return CONTENT[language][key];
}
