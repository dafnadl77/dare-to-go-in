import type { Language } from '../i18n/LanguageContext';

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
  privacy: {
    title: 'Privacy Policy',
    updated: 'Last updated: October 2026',
    intro:
      'DARE TO GO IN ("DARE", "we", "the app") is a small, independent dream-journaling app. This page explains, in plain language, what information the app handles and why. It is written for people using DARE, not for lawyers — a fuller, formally reviewed version will replace it before any commercial launch.',
    sections: [
      {
        heading: 'Who is responsible for your data',
        body: 'DARE TO GO IN is a brand operated by Dafna Dalmada, a licensed dealer (osek murshe), business number 033868969, Kiryat Ono, Israel. That business holds the information described in this policy. Privacy enquiries: daretogoin@gmail.com.',
      },
      {
        heading: 'Account & authentication',
        body: 'Creating an archive uses Supabase, a third-party authentication and database provider, to manage your account. You can sign in with an email address and password, or with your Google account — DARE never sees or stores your Google password, only the confirmation that you signed in. Your session is managed by Supabase; DARE does not keep a separate, parallel record of whether you are logged in.',
      },
      {
        heading: 'What you share with DARE',
        body: 'When you record or type a dream, that text (and, where voice input is used, the audio captured to transcribe it) is submitted so DARE can reconstruct and reflect on it. If you save a dream to your archive, the dream text, any correction you make to it, the elements you choose to focus on, your own written associations, the feelings you choose to name (if you choose any), and the reflection generated for you are stored against your account.',
      },
      {
        heading: 'AI processing',
        body: 'Turning what you share into a reconstructed dream, an image, and a reflection involves sending that text (and transcribed audio) to OpenAI, a third-party AI provider, for processing. OpenAI processes this content to generate the results DARE shows you; DARE does not control OpenAI\'s own retention practices beyond what OpenAI publishes, and does not use your dream content to train any model of our own. Any feelings you choose to name are sent with your dream in the same request, and are stored with it only if you save the dream.',
      },
      {
        heading: 'Generated content',
        body: 'The reconstructed dream text, dream image, and reflection (observations, associations, and questions) DARE generates are a creative, AI-assisted interpretation — never a factual record of what actually happened in your sleep, and never a diagnosis. They are stored as part of your saved dream, in the language your interface was set to at the time you saved it.',
      },
      {
        heading: 'How your data is stored, and for how long',
        body: '- Account and dreams: account data and saved dreams are stored in the Supabase database, linked to your account, for as long as the account exists or until you delete the dream.\n- Dreams before an account: dreams saved before a real account exists stay only on your device (the browser\'s local storage) and are not uploaded automatically; a separate, clearly stated step would be required before any such transfer.\n- Temporary analysis result: when a dream is sent for analysis we may keep the result temporarily, up to about two hours, only for technical recovery, retrying a request and preventing double charging. It is then deleted, and it is not part of your archive unless you saved the dream.\n- Credits: the credit balance stays on the account until you use it or the account is deleted. Credits do not expire.\n- Deleting the account: removes the account, all saved dreams and images, reflections and patterns, and any unused credit balance.\n- What remains after deletion: a minimal record, with no link to you, that the first free dream was already used from a given browser, so the free-dream limit cannot be bypassed by deleting an account; payment records that are not linked to an account; and tax documents and bookkeeping records, kept for the period required by law.',
      },
      {
        heading: 'Payments and tax documents',
        body: 'When you choose to buy credits, DARE asks for your full name and an Israeli mobile phone number, only when a payment begins. These details are sent to Make (an automation service) and to Grow (our payment provider) so a payment page can be created and the payment processed. We do not keep the name or phone in our payment records, and we do not receive or store card details: they are entered on Grow\'s payment page and handled by Grow. Make and Grow process the details under their own terms and privacy policies. Payment is one-time; there is no subscription and no recurring charge.\n\nWe keep limited information about the order and payment: the package, the amount, the payment status and the transaction reference, linked to your account, so the credits can be added.\n\nA tax invoice / receipt for each payment is issued by the business manually using the Morning system and sent to the email address of your account. For this we enter into Morning the details needed to issue the document as required by law, and they are kept there as required by law. Morning processes the details under its own terms and privacy policy.\n\nThe link between the payment record and your account is removed if you delete the account. Tax documents and bookkeeping records are kept for accounting, fraud prevention and support, for the period required by law.',
      },
      {
        heading: 'Technical & session data',
        body: 'DARE uses your browser\'s local storage for a small number of technical purposes: remembering your chosen interface language, and (if you use the browser-based dream player) which screen you were on. Supabase sets its own session storage to keep you signed in. DARE does not use third-party advertising trackers or sell any browsing data.',
      },
      {
        heading: 'Your choices',
        body: 'You can sign out of the archive at any time. You can also delete your account permanently yourself: in Settings choose "Delete account" and confirm. The action removes the account, all saved dreams and their images, reflections and patterns, and any unused dream credit, and cannot be undone. What remains after deletion is described in "How your data is stored, and for how long". To request an export or a copy of your information, or if you cannot use Settings, use the contact details below.',
      },
      {
        heading: 'We do not sell your data',
        body: 'DARE does not sell, rent, or trade your personal information or dream content to third parties, and has no advertising business built on your data.',
      },
      {
        heading: 'Not medical or psychological advice',
        body: 'Nothing DARE generates is a medical, psychiatric, or psychological diagnosis, assessment, or treatment, and none of it should be treated as such. If you are in crisis or need real support, please reach out to a licensed professional or your local emergency services.',
      },
      {
        heading: 'Contact',
        body: 'Questions about this policy or a request about personal information: daretogoin@gmail.com. Location: Kiryat Ono, Israel.',
      },
    ],
    draftNotice:
      'This is a draft privacy policy written for a small, early-stage app. It has not yet been reviewed by a lawyer and should not be relied on as a complete or final legal document — a properly reviewed policy will replace this before any commercial launch.',
  },
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
  terms: {
    title: 'Terms of Use',
    updated: 'Last updated: October 2026',
    intro:
      'These terms apply to using DARE TO GO IN and to buying dream packages. Using the site, creating an account or making a purchase means you agree to them. Please read them before you buy. They are written in plain language — a fuller, formally reviewed version will replace them before any commercial launch.',
    sections: [
      {
        heading: 'Introduction',
        body: 'These terms apply to using DARE TO GO IN and to buying dream packages. Using the site, creating an account or making a purchase means you agree to them. Please read them before you buy.',
      },
      {
        heading: 'Who runs DARE',
        body: 'DARE TO GO IN ("DARE") is a brand operated by Dafna Dalmada, a licensed dealer (osek murshe), business number 033868969. Location: Kiryat Ono, Israel. Contact: daretogoin@gmail.com. In these terms "we" means that business.',
      },
      {
        heading: 'What DARE is for',
        body: 'DARE is a reflective, personal-wellness journaling tool for exploring your dreams. It is offered for personal reflection and curiosity — not as a service you should depend on for anything time-critical or high-stakes.',
      },
      {
        heading: 'Not medical, psychiatric, psychological, legal, or emergency advice',
        body: 'Nothing in DARE — the reconstructed dream, the generated image, or the reflection — is medical, psychiatric, psychological, legal, or emergency advice, and none of it should be treated as such. If you are in crisis, experiencing a medical emergency, or need professional support, please contact a licensed professional or your local emergency services directly.',
      },
      {
        heading: 'AI output may be incomplete or inaccurate',
        body: 'Dream reconstructions, images, and reflections are generated by AI models and may be incomplete, imprecise, or simply wrong — about details, tone, or interpretation. Treat every generated result as a starting point for your own reflection, not a fact.',
      },
      {
        heading: 'Your content and your responsibility',
        body: 'You are responsible for what you submit to DARE — your dream descriptions, corrections, and written associations. Please do not submit anyone else\'s private information, or content you don\'t have the right to share.',
      },
      {
        heading: 'Acceptable use',
        body: 'Please use DARE for its intended, personal purpose. Don\'t try to disrupt the service, access other people\'s accounts or data, or use the app to generate or store unlawful content.',
      },
      {
        heading: 'Your account',
        body: 'You are responsible for keeping your sign-in credentials secure and for activity that happens through your account. Tell us if you believe your account has been accessed without your permission.',
      },
      {
        heading: 'Intellectual property',
        body: 'DARE\'s design, code, and branding belong to their respective owners. Your own dream text and associations remain yours. Generated images and reflections are produced by AI on your behalf for your personal use within the app.',
      },
      {
        heading: 'Availability & changes',
        body: 'DARE is an early-stage, independently-run app. Features, availability, and these terms may change as it develops, and the service may occasionally be unavailable, including for maintenance.',
      },
      {
        heading: 'Packages, credits and prices',
        body: 'A dream credit lets you create one full dream: the dream journey, an image and a reflection, saved to your archive. Every account\'s first dream is free (once per account), as described on the Packages page.\n\nPaid packages, at the prices on the Packages page on the day of purchase: 3 dreams for ₪59, 10 dreams for ₪149, 25 dreams for ₪279. All prices include VAT. Prices and packages may change; a purchase already made and the credits you bought are not affected by a later change.\n\nPayment is one-time. There is no subscription and no recurring or automatic charge. Each purchase is a separate transaction.\n\nCredits are personal, belong to the account that bought them, and cannot be transferred to another account.',
      },
      {
        heading: 'Payment',
        body: 'Payment is made on a secure payment page run by Grow, and appears under the brand name DARE TO GO IN. We do not receive or store card details. Once the payment is confirmed, the credits are added to your account automatically, usually within minutes. If time has passed and they have not appeared, write to us with your account email and the reference number shown when you return from payment, and we will check.',
      },
      {
        heading: 'Tax documents and the transaction details document',
        body: 'For each payment a tax invoice / receipt is issued as required by law, by Dafna Dalmada (licensed dealer 033868969), using the Morning system, and sent to the email address of the account that made the purchase, within the times required by law. At this stage the documents are issued and sent manually. If you do not receive the document, contact us at daretogoin@gmail.com.\n\nTogether with it you will receive a transaction details document: a summary of the dealer\'s details, what was bought, the price and payment terms, how the credits are delivered, and how to exercise the right to cancel under the law, as required for a remote sale.',
      },
      {
        heading: 'Credit validity and use',
        body: 'Credits do not expire. They stay in your account until you use them or the account is deleted. One credit is used when a new dream begins. If creating a dream fails because of a fault on our side or at a provider, the credit is returned to your account automatically. Credits cannot be exchanged for money, subject to your rights under law.',
      },
      {
        heading: 'Cancellation and refunds',
        body: 'We do not have a voluntary refund policy beyond the rights set by law. Nothing here limits your rights as a consumer under any law, including the right to cancel a remote transaction under the Consumer Protection Law, where it applies to the purchase. The full explanation, how to cancel, and the cancellation fees the law allows are set out in the "Cancellation and Refund Policy".',
      },
      {
        heading: 'Saved dreams',
        body: 'A saved dream stays in your archive for as long as your account exists, or until you delete it, subject to the Privacy Policy (information retention). We work to keep the information secure, but we do not promise uninterrupted availability of the service.',
      },
      {
        heading: 'Termination & deletion',
        body: 'You may stop using DARE and delete your account at any time, in Settings ("Delete account"). Deleting the account permanently removes the account, saved dreams and their images, reflections and patterns, and any unused credit balance, and none of it can be restored. Deleting an account is not a cancellation request and does not entitle you to a refund beyond what the law provides. We may also suspend or end access for use that violates these terms.',
      },
      {
        heading: 'Contact',
        body: 'Questions, requests and enquiries about a purchase, cancellation or these terms: daretogoin@gmail.com. Location: Kiryat Ono, Israel.',
      },
      {
        heading: 'Governing law',
        body: 'These terms are governed by Israeli law. Nothing here limits your right to turn to the competent court under the law.',
      },
    ],
    draftNotice:
      'This is a draft, written for a small, early-stage app. It has not yet been reviewed by a lawyer and should not be relied on as a complete or final legal document — a properly reviewed version will replace this before any commercial launch.',
  },
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
  privacy: {
    title: 'מדיניות פרטיות',
    updated: 'עודכן לאחרונה: אוקטובר 2026',
    intro:
      'DARE TO GO IN ("דיר", "האפליקציה") היא אפליקציית יומן חלומות קטנה ועצמאית. הדף הזה מסביר, בשפה פשוטה, אילו מידע האפליקציה מטפלת בו ולמה. הוא נכתב עבור מי שמשתמש ב-DARE, לא עבור עורכי דין — גרסה מלאה ומאושרת משפטית תחליף אותו לפני השקה מסחרית.',
    sections: [
      {
        heading: 'מי אחראית על המידע',
        body: 'DARE TO GO IN הוא מותג הפועל תחת דפנה דלמדה, עוסק מורשה, מספר עוסק 033868969, קריית אונו, ישראל. העוסק הוא המחזיק במידע שמתואר במדיניות זו. פניות בנושא פרטיות: daretogoin@gmail.com.',
      },
      {
        heading: 'חשבון והתחברות',
        body: 'יצירת ארכיון משתמשת ב-Supabase, ספק חיצוני לאימות ולניהול מסדי נתונים, לניהול החשבון. אפשר להתחבר עם כתובת אימייל וסיסמה, או עם חשבון Google — DARE אף פעם לא רואה או שומרת את סיסמת ה-Google, רק את האישור שההתחברות הצליחה. הסשן מנוהל על ידי Supabase; DARE לא שומרת רישום נפרד ומקביל של מצב ההתחברות.',
      },
      {
        heading: 'מה משתפים עם DARE',
        body: 'כשמקליטים או מקלידים חלום, הטקסט הזה (ובמקרה של קלט קולי, גם ההקלטה שמשמשת לתמלול) נשלח כדי ש-DARE תוכל לשחזר את החלום ולהציע התבוננות עליו. שמירת חלום בארכיון שומרת את טקסט החלום, כל תיקון שנעשה בו, האלמנטים שנבחרו, האסוציאציות הכתובות, התחושות שבחרתם לציין (אם בחרתם), וההתבוננות שנוצרה — משויכים לחשבון.',
      },
      {
        heading: 'עיבוד באמצעות בינה מלאכותית',
        body: 'הפיכת מה ששיתפתם לחלום משוחזר, לתמונה ולהתבוננות כרוכה בשליחת הטקסט (וההקלטה המתומללת) אל OpenAI, ספק בינה מלאכותית חיצוני, לעיבוד. OpenAI מעבדת את התוכן כדי ליצור את התוצאות שמוצגות באפליקציה; DARE לא שולטת במדיניות השמירה של OpenAI מעבר למה שהיא עצמה מפרסמת, ולא משתמשת בתוכן החלומות לאימון מודל כלשהו משלה. התחושות שבחרתם לציין נשלחות יחד עם החלום באותה בקשה, ונשמרות איתו רק אם שומרים את החלום.',
      },
      {
        heading: 'תוכן שנוצר',
        body: 'טקסט החלום המשוחזר, תמונת החלום וההתבוננות (מה שבולט, אסוציאציות ושאלות) שנוצרים על ידי DARE הם פרשנות יצירתית בסיוע בינה מלאכותית — לעולם לא רישום עובדתי של מה שקרה בפועל בשינה, ולעולם לא אבחנה. הם נשמרים כחלק מהחלום השמור, בשפה שהייתה פעילה בממשק בזמן השמירה.',
      },
      {
        heading: 'איך המידע נשמר, וכמה זמן',
        body: '- חשבון וחלומות: נתוני החשבון והחלומות השמורים נשמרים במסד הנתונים של Supabase, משויכים לחשבון, כל עוד החשבון קיים או עד שתמחקו את החלום.\n- חלומות לפני חשבון: חלומות שנשמרו לפני קיום חשבון אמיתי נשמרים מקומית במכשיר בלבד (באחסון המקומי של הדפדפן) ואינם מועלים אוטומטית; יידרש צעד נפרד ומוצהר בבירור לפני כל העברה כזו.\n- תוצאת ניתוח זמנית: כששולחים חלום לניתוח, אנחנו עשויים לשמור זמנית את התוצאה, עד כשעתיים בערך, רק לצורך התאוששות טכנית, ניסיון חוזר ומניעת חיוב כפול. לאחר מכן היא נמחקת, והיא אינה חלק מהארכיון אלא אם שמרתם את החלום.\n- קרדיטים: יתרת הקרדיטים נשמרת בחשבון עד שמנצלים אותה או עד שהחשבון נמחק. הקרדיטים אינם פגי תוקף.\n- מחיקת חשבון: מוחקת את החשבון, את כל החלומות והתמונות, ההרהורים והדפוסים וכל יתרת קרדיטים שלא נוצלה.\n- מה נשמר גם אחרי המחיקה: רישום מינימלי, ללא כל קישור אליכם, על כך שהחלום הראשון החינמי כבר נוצל מדפדפן מסוים, כדי שלא יהיה אפשר לעקוף את מגבלת החלום החינמי באמצעות מחיקת חשבון; רישומי תשלום שאינם מקושרים לחשבון; ומסמכי מס ורישומי הנהלת חשבונות, שנשמרים לתקופה הנדרשת בדין.',
      },
      {
        heading: 'תשלומים ומסמכי מס',
        body: 'כשבוחרים לרכוש קרדיטים, DARE מבקשת שם מלא ומספר טלפון נייד ישראלי, ורק כשמתחילים תשלום. הפרטים נשלחים אל Make (שירות אוטומציה) ואל Grow (ספקית התשלומים) כדי ליצור דף תשלום ולעבד את התשלום. אנחנו לא שומרים את השם ואת הטלפון ברשומות התשלום שלנו, ולא מקבלים או שומרים פרטי כרטיס אשראי: הם מוזנים בדף התשלום של Grow ומטופלים אצלה. Make ו-Grow מעבדות את הפרטים לפי התנאים ומדיניות הפרטיות שלהן. התשלום חד־פעמי; אין מנוי ואין חיוב חוזר.\n\nאנחנו שומרים מידע מוגבל על ההזמנה והתשלום: החבילה, הסכום, סטטוס התשלום ואסמכתת העסקה, בקישור לחשבון, כדי להוסיף את הקרדיטים.\n\nחשבונית מס / קבלה על כל תשלום מופקת על ידי העוסק באופן ידני באמצעות מערכת Morning, ונשלחת לכתובת הדוא"ל של החשבון. לצורך זה אנחנו מזינים במערכת Morning את הפרטים הנדרשים להפקת המסמך לפי דין, והם נשמרים שם ולפי הנדרש בדין. Morning מעבדת את הפרטים לפי התנאים ומדיניות הפרטיות שלה.\n\nהקישור בין רשומת התשלום לחשבון מוסר אם תמחקו את החשבון. מסמכי מס ורישומי הנהלת חשבונות נשמרים לצורכי חשבונאות, מניעת הונאות ותמיכה, לתקופה הנדרשת בדין.',
      },
      {
        heading: 'מידע טכני וסשן',
        body: 'DARE משתמשת באחסון המקומי של הדפדפן למספר מצומצם של מטרות טכניות: זכירת שפת הממשק שנבחרה, ו(אם נעשה שימוש בנגן החלומות בדפדפן) באיזה מסך הייתם. Supabase מגדירה אחסון סשן משלה כדי לשמור על מצב ההתחברות. DARE לא משתמשת בכלי מעקב פרסומיים חיצוניים ולא מוכרת נתוני גלישה כלשהם.',
      },
      {
        heading: 'הבחירות שלכם',
        body: 'אפשר להתנתק בכל עת מהארכיון. אפשר גם למחוק את החשבון בעצמכם לצמיתות: בהגדרות בוחרים "מחיקת חשבון" ומאשרים. הפעולה מסירה את החשבון, את כל החלומות השמורים והתמונות שלהם, את ההרהורים והדפוסים ואת כל קרדיט חלום שלא נוצל, ואי אפשר לבטל אותה. מה שנשאר אחרי מחיקה מפורט ב"איך המידע נשמר, וכמה זמן". לבקשת ייצוא או עיון במידע, או אם אי אפשר להשתמש בהגדרות, פנו לפרטי הקשר למטה.',
      },
      {
        heading: 'אין מכירת מידע',
        body: 'DARE לא מוכרת, משכירה או סוחרת במידע האישי או בתוכן החלומות שלכם לצדדים שלישיים, ואין לה מודל עסקי המבוסס על פרסום התלוי בנתונים שלכם.',
      },
      {
        heading: 'לא ייעוץ רפואי או פסיכולוגי',
        body: 'שום דבר שנוצר על ידי DARE אינו אבחנה, הערכה או טיפול רפואי, פסיכיאטרי או פסיכולוגי, ואין להתייחס אליו ככזה. במצב משבר או צורך בתמיכה אמיתית, יש לפנות לאיש מקצוע מוסמך או לשירותי החירום המקומיים.',
      },
      {
        heading: 'יצירת קשר',
        body: 'שאלות על מדיניות זו או בקשה בנוגע למידע אישי: daretogoin@gmail.com. מיקום: קריית אונו, ישראל.',
      },
    ],
    draftNotice:
      'זוהי טיוטת מדיניות פרטיות שנכתבה עבור אפליקציה קטנה בשלב מוקדם. היא טרם נבדקה על ידי עורך דין ואין להסתמך עליה כמסמך משפטי סופי ומלא — מדיניות שעברה בדיקה משפטית מסודרת תחליף אותה לפני השקה מסחרית.',
  },
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
  terms: {
    title: 'תנאי שימוש',
    updated: 'עודכן לאחרונה: אוקטובר 2026',
    intro:
      'תנאים אלו חלים על השימוש ב-DARE TO GO IN וגם על רכישת חבילות חלומות. שימוש באתר, פתיחת חשבון או רכישה מהווים הסכמה להם. נא לקרוא אותם לפני רכישה. הם נכתבו בשפה פשוטה — גרסה מלאה ומאושרת משפטית תחליף אותם לפני השקה מסחרית.',
    sections: [
      {
        heading: 'פתיח',
        body: 'תנאים אלו חלים על השימוש ב-DARE TO GO IN וגם על רכישת חבילות חלומות. שימוש באתר, פתיחת חשבון או רכישה מהווים הסכמה להם. נא לקרוא אותם לפני רכישה.',
      },
      {
        heading: 'מי מפעילה את DARE',
        body: 'DARE TO GO IN ("DARE") הוא מותג הפועל תחת דפנה דלמדה, עוסק מורשה, מספר עוסק 033868969. מיקום: קריית אונו, ישראל. פניות: daretogoin@gmail.com. בתנאים אלו "אנחנו" הוא העוסק הנזכר.',
      },
      {
        heading: 'מטרת DARE',
        body: 'DARE הוא כלי יומן אישי, מיועד להתבוננות ולרווחה אישית, לחקירת חלומות. הוא מוצע לצורך התבוננות אישית וסקרנות — לא כשירות שיש להסתמך עליו לצרכים דחופים או קריטיים.',
      },
      {
        heading: 'לא ייעוץ רפואי, פסיכיאטרי, פסיכולוגי, משפטי או חירום',
        body: 'שום דבר ב-DARE — החלום המשוחזר, התמונה שנוצרה, או ההתבוננות — אינו ייעוץ רפואי, פסיכיאטרי, פסיכולוגי, משפטי או חירום, ואין להתייחס אליו ככזה. במצב משבר, חירום רפואי, או צורך בתמיכה מקצועית, יש לפנות ישירות לאיש מקצוע מוסמך או לשירותי החירום המקומיים.',
      },
      {
        heading: 'תוצרי בינה מלאכותית עשויים להיות חלקיים או שגויים',
        body: 'שחזורי חלומות, תמונות והתבוננויות נוצרים על ידי מודלים של בינה מלאכותית ועשויים להיות חלקיים, לא מדויקים, או פשוט שגויים — בפרטים, בטון או בפרשנות. יש להתייחס לכל תוצאה שנוצרה כנקודת פתיחה להתבוננות אישית, לא כעובדה.',
      },
      {
        heading: 'התוכן שלכם והאחריות שלכם',
        body: 'האחריות על מה שנשלח ל-DARE — תיאורי החלומות, התיקונים והאסוציאציות הכתובות — היא עליכם. נא לא לשלוח מידע פרטי של אדם אחר, או תוכן שאין לכם זכות לשתף.',
      },
      {
        heading: 'שימוש מקובל',
        body: 'נא להשתמש ב-DARE למטרתה האישית המיועדת. אין לנסות לשבש את השירות, לגשת לחשבונות או נתונים של אחרים, או להשתמש באפליקציה ליצירה או שמירה של תוכן בלתי חוקי.',
      },
      {
        heading: 'החשבון שלכם',
        body: 'האחריות על שמירת פרטי ההתחברות בבטחה ועל פעילות שמתבצעת דרך החשבון היא עליכם. יש לעדכן אותנו אם יש חשד לגישה לחשבון ללא רשות.',
      },
      {
        heading: 'קניין רוחני',
        body: 'העיצוב, הקוד והמיתוג של DARE שייכים לבעליהם. טקסט החלומות והאסוציאציות שלכם נשארים שלכם. התמונות וההתבוננויות שנוצרות מופקות על ידי בינה מלאכותית עבורכם, לשימושכם האישי בתוך האפליקציה.',
      },
      {
        heading: 'זמינות ושינויים',
        body: 'DARE היא אפליקציה עצמאית בשלב מוקדם. תכונות, זמינות ותנאים אלו עשויים להשתנות ככל שהיא מתפתחת, והשירות עשוי להיות בלתי זמין מדי פעם, לרבות לצורכי תחזוקה.',
      },
      {
        heading: 'חבילות, קרדיטים ומחירים',
        body: 'קרדיט חלום מאפשר ליצור חלום אחד מלא: מסע חלום, תמונה והתבוננות, ושמירה בארכיון. בכל חשבון, החלום הראשון ללא תשלום (פעם אחת לחשבון), כמפורט בדף החבילות.\n\nחבילות בתשלום, לפי המחירים בדף החבילות ביום הרכישה: 3 חלומות ב-59 ₪, 10 חלומות ב-149 ₪, 25 חלומות ב-279 ₪. כל המחירים כוללים מע"מ. אפשר לעדכן מחירים וחבילות; רכישה שבוצעה והקרדיטים שנרכשו לא יושפעו משינוי כזה.\n\nהתשלום חד־פעמי. אין מנוי, אין חיוב חוזר ואין חיוב אוטומטי. כל רכישה היא עסקה נפרדת.\n\nהקרדיטים אישיים, משויכים לחשבון שרכש אותם ואינם ניתנים להעברה לחשבון אחר.',
      },
      {
        heading: 'תשלום',
        body: 'התשלום מתבצע בדף תשלום מאובטח של Grow, והוא מופיע בשם המותג DARE TO GO IN. אנחנו לא מקבלים ולא שומרים פרטי כרטיס אשראי. לאחר אישור התשלום הקרדיטים מתווספים לחשבון אוטומטית, בדרך כלל תוך דקות. אם עבר זמן והם לא הופיעו, אפשר לפנות אלינו עם כתובת המייל של החשבון ועם מספר האסמכתא שמוצג בחזרה מהתשלום, ונבדוק.',
      },
      {
        heading: 'מסמכי מס ומסמך פרטי העסקה',
        body: 'על כל תשלום מופקת חשבונית מס / קבלה בהתאם לדין, על ידי דפנה דלמדה (עוסק מורשה 033868969), באמצעות מערכת Morning, ונשלחת אל כתובת הדוא"ל של החשבון שבו בוצעה הרכישה, בהתאם למועדים הנדרשים בדין. בשלב זה המסמכים מופקים ונשלחים באופן ידני. אם לא קיבלתם את המסמך, פנו אלינו ל-daretogoin@gmail.com.\n\nיחד עם המסמך תקבלו מסמך פרטי העסקה: סיכום של פרטי העוסק, מה נרכש, המחיר ותנאי התשלום, אופן אספקת הקרדיטים, ואופן מימוש זכות הביטול לפי הדין, כנדרש בעסקה מרחוק.',
      },
      {
        heading: 'תוקף הקרדיטים ושימוש בהם',
        body: 'הקרדיטים אינם פגי תוקף. הם נשמרים בחשבון עד שמנצלים אותם או עד שהחשבון נמחק. קרדיט אחד מנוצל בתחילת חלום חדש. אם יצירת החלום נכשלת בשל תקלה אצלנו או אצל ספק, הקרדיט מוחזר לחשבון אוטומטית. אין המרה של קרדיטים לכסף, בכפוף לזכויותיכם על פי דין.',
      },
      {
        heading: 'ביטול עסקה והחזרים',
        body: 'אין לנו מדיניות החזרים מרצון מעבר לזכויות הקבועות בדין. אין באמור כדי לפגוע בזכויותיכם כצרכנים לפי כל דין, ובכלל זה זכות ביטול עסקה מרחוק לפי חוק הגנת הצרכן, ככל שהיא חלה על הרכישה. ההסבר המלא, אופן הביטול ודמי הביטול המותרים לפי הדין מפורטים ב"מדיניות ביטולים והחזרים".',
      },
      {
        heading: 'חלומות שנשמרו',
        body: 'חלום שנשמר נשאר בארכיון שלכם כל עוד החשבון קיים, או עד שתמחקו אותו, בכפוף למדיניות הפרטיות (שמירת מידע). אנחנו פועלים לשמור את המידע באופן מאובטח, אך אין התחייבות לזמינות רציפה של השירות.',
      },
      {
        heading: 'הפסקת שימוש ומחיקה',
        body: 'אפשר להפסיק להשתמש ב-DARE ולמחוק את החשבון בכל עת, בהגדרות ("מחיקת חשבון"). המחיקה מסירה לצמיתות את החשבון, את החלומות השמורים והתמונות שלהם, את ההרהורים והדפוסים ואת כל יתרת קרדיטים שלא נוצלה, ואי אפשר לשחזר אותם. מחיקת חשבון אינה בקשת ביטול עסקה ואינה מקנה החזר כספי מעבר למה שהדין קובע. אנחנו עשויים להשעות או להפסיק גישה עבור שימוש המפר תנאים אלו.',
      },
      {
        heading: 'יצירת קשר',
        body: 'שאלות, בקשות ופניות לגבי רכישה, ביטול או תנאים אלו: daretogoin@gmail.com. מיקום: קריית אונו, ישראל.',
      },
      {
        heading: 'דין חל',
        body: 'על תנאים אלו יחול הדין הישראלי. אין בכך כדי לפגוע בזכותכם לפנות לערכאה המוסמכת לפי הדין.',
      },
    ],
    draftNotice:
      'זוהי טיוטה, שנכתבה עבור אפליקציה קטנה בשלב מוקדם. היא טרם נבדקה על ידי עורך דין ואין להסתמך עליה כמסמך משפטי סופי ומלא — גרסה שעברה בדיקה משפטית מסודרת תחליף אותה לפני השקה מסחרית.',
  },
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
