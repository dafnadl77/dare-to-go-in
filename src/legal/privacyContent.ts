import type { LegalDocument } from './legalContent';
import {
  BACKUP_RETENTION_DAYS,
  BACKUP_RETENTION_VERIFIED,
  GOOGLE_FONTS_SELF_HOSTED,
  MIN_AGE,
  OPENAI_ABUSE_LOG_DAYS,
  REQUEST_ANSWER_DAYS,
  TRIAL_COOKIE_NAME,
} from './retention';

/**
 * The Privacy Policy, both languages. Every statement here is a statement about what the system really does (checked against the code, the
 * database and the providers' published terms on 18 October 2026; tests/launchLegal.test.ts pins the numbers). It is still a DRAFT: the draft
 * notice stays until the owner decides how the legal review is finished.
 */

const backupEn = BACKUP_RETENTION_VERIFIED
  ? `Backups: we keep encrypted backup copies of the database and of the saved images (with Supabase and with Backblaze B2) so that the service can be restored after a failure. Backup copies are kept for at most ${BACKUP_RETENTION_DAYS} days and are then deleted automatically. A dream or an account that you delete therefore disappears from our live systems at once, and from the backup copies within ${BACKUP_RETENTION_DAYS} days at most.`
  : `Backups: we keep encrypted backup copies of the database and of the saved images (with Supabase and with Backblaze B2) so that the service can be restored after a failure. A dream or an account that you delete disappears from our live systems at once, but a copy of it may remain in the backups. We are setting an automatic deletion period for old backups, and this policy will state it once it is in place.`;

const backupHe = BACKUP_RETENTION_VERIFIED
  ? `גיבויים: אנחנו שומרים עותקי גיבוי מוצפנים של מסד הנתונים ושל התמונות השמורות (אצל Supabase ואצל Backblaze B2) כדי שאפשר יהיה לשחזר את השירות אחרי תקלה. עותקי הגיבוי נשמרים לכל היותר ${BACKUP_RETENTION_DAYS} ימים ואז נמחקים אוטומטית. חלום או חשבון שמחקתם נעלמים אפוא מהמערכות החיות שלנו מיד, ומעותקי הגיבוי תוך ${BACKUP_RETENTION_DAYS} ימים לכל היותר.`
  : `גיבויים: אנחנו שומרים עותקי גיבוי מוצפנים של מסד הנתונים ושל התמונות השמורות (אצל Supabase ואצל Backblaze B2) כדי שאפשר יהיה לשחזר את השירות אחרי תקלה. חלום או חשבון שמחקתם נעלמים מהמערכות החיות שלנו מיד, אבל עותק שלהם עשוי להישאר בגיבויים. אנחנו קובעים כעת תקופת מחיקה אוטומטית לגיבויים ישנים, והמדיניות תציין אותה כשהיא תהיה בתוקף.`;

const fontsEn = GOOGLE_FONTS_SELF_HOSTED
  ? ' The site fonts are served from this site itself; no request goes to Google for them.'
  : ' For now your browser also loads the site fonts from Google Fonts, so Google receives your IP address and browser details when the page opens.';
const fontsHe = GOOGLE_FONTS_SELF_HOSTED
  ? ' גופני האתר מוגשים מהאתר עצמו, ואף בקשה אל Google לא נשלחת בגללם.'
  : ' בשלב זה הדפדפן שלכם טוען את גופני האתר גם מ-Google Fonts, ולכן Google מקבלת את כתובת ה-IP ופרטי הדפדפן שלכם כשהעמוד נפתח.';

export const privacyEn: LegalDocument = {
  title: 'Privacy Policy',
  updated: 'Last updated: October 2026',
  intro:
    'DARE TO GO IN ("DARE", "we", "the app") is a small, independent dream-journaling app for personal reflection and entertainment. This page explains, in plain language, what information the app handles, why, who receives it, where it is stored, for how long, and what you can do about it. It is written for people using DARE, not for lawyers — a fuller, formally reviewed version will replace it before any commercial launch.',
  sections: [
    {
      heading: 'Who is responsible for your data',
      body: 'DARE TO GO IN is a brand operated by Dafna Dalmada, a licensed dealer (osek murshe), business number 033868969, Kiryat Ono, Israel. That business holds the information described in this policy. Privacy enquiries: daretogoin@gmail.com.',
    },
    {
      heading: 'Who may use DARE',
      body: `DARE is for people aged ${MIN_AGE} or over. We do not knowingly collect information from anyone under ${MIN_AGE}, and if you are under ${MIN_AGE} please do not create an account or use the service. When you create an account you are asked to confirm that you are ${MIN_AGE} or over. If we learn that an account belongs to someone under ${MIN_AGE}, we may delete it.`,
    },
    {
      heading: 'What we collect, and why',
      body: `- Account: your email address, the name you choose, and a password (kept by Supabase in a scrambled form; we never see it). If you sign in with Google we receive only the basic details Google shares, such as your email address and name. We use them to create and protect your account, send the confirmation email and let you sign in.\n- Dream content: the text you type or the transcript of what you say, your corrections, the elements and moment you choose, your written associations, the feelings you choose to name, and what DARE generates from them (a reconstructed dream, an image and a reflection). We use them only to give you the results you ask for. They are saved to your account only if you save the dream.\n- Voice: if you record a dream, the audio is sent to be turned into text. We do not store the recording.\n- Purchases: the package, the amount, the payment status and the transaction reference, linked to your account so that the credits can be added. Your full name and mobile phone number are asked only when a payment begins (see "Payments and tax documents").\n- Technical data: one technical cookie, the browser storage described below, and the ordinary server logs of our hosting and database providers (for example IP address, time, the page requested and browser type). We use no advertising or analytics trackers.\n- Free-dream marker: a record with no personal details that says an anonymous browser has used its free dream, so the limit cannot be bypassed.`,
    },
    {
      heading: 'Sensitive information in dreams',
      body: 'Dreams can reveal sensitive information — for example about health, mental state, relationships, sexuality or other people. We do not ask for any of it; you decide what to write or say. It is handled like all dream content: used only to produce the results you ask for, sent to the AI provider as described below, stored in your account only if you save the dream, never used for advertising or profiling, and never sold. Please do not include identifying details of other people. By writing or recording a dream you ask us to process what you include in it.',
    },
    {
      heading: 'AI processing',
      body: `To turn what you share into a reconstructed dream, an image, a reflection and a transcript, we send the text (and, for transcription, the audio) to OpenAI, an AI provider whose servers are in the United States. We ask OpenAI not to keep the generated text responses (the store=false setting). OpenAI may nevertheless keep technical records of API requests for up to ${OPENAI_ABUSE_LOG_DAYS} days for abuse monitoring, under its own terms. According to OpenAI's published API terms, content sent through the API is not used to train its models by default. We do not use your dream content to train any model, and we do not use it for marketing, analytics or any purpose other than giving you the service. Any feelings you choose to name are sent with your dream in the same request.`,
    },
    {
      heading: 'Service providers, and transfers outside Israel',
      body: '- Supabase — accounts, the database and private image storage. Data region: Frankfurt, Germany (EU).\n- Vercel — hosting; the servers that process requests (including dream analysis and the payment confirmation) run in the United States (Washington, D.C. area), and pages are delivered through a global network.\n- OpenAI — AI processing, United States (see "AI processing").\n- Backblaze B2 — encrypted backup copies, in the EU. GitHub (United States) runs the automation that creates the backups; the data is encrypted before it is stored.\n- Make (automation) and Grow (payment provider) — only at purchase, see "Payments and tax documents". Morning — tax invoices, Israel.\n- Google — sign-in, if you choose it' + (GOOGLE_FONTS_SELF_HOSTED ? '.' : ', and fonts (see "Cookies and local storage").') + '\n\nSo your information is transferred and processed outside Israel, including in the United States. Where the law requires your consent for this, you give it by using DARE after reading this notice. Each provider handles the information under its own terms and privacy policy and its own data-protection commitments, which we do not control.',
    },
    {
      heading: 'Payments and tax documents',
      body: 'When you choose to buy credits, DARE asks for your full name and an Israeli mobile phone number, only when a payment begins. These details are sent to Make (an automation service) and to Grow (our payment provider) so a payment page can be created and the payment processed. We do not keep the name or phone in our payment records, and we do not receive or store card details: they are entered on Grow\'s payment page and handled by Grow. Make and Grow process the details under their own terms and privacy policies; for how long Make keeps its own execution history depends on its plan. Payment is one-time; there is no subscription and no recurring charge.\n\nWe keep limited information about the order and payment: the package, the amount, the payment status and the transaction reference, linked to your account, so the credits can be added.\n\nA tax invoice / receipt for each payment is issued by the business manually using the Morning system and sent to the email address of your account. For this we enter into Morning the details needed to issue the document as required by law, and they are kept there as required by law. Morning processes the details under its own terms and privacy policy.\n\nThe link between the payment record and your account is removed if you delete the account. Tax documents and bookkeeping records are kept for accounting, fraud prevention and support, for the period required by law.',
    },
    {
      heading: 'Cookies and local storage',
      body: `- One technical cookie, ${TRIAL_COOKIE_NAME}: set by our server for a visitor who has not created an account yet; it contains a random signed identifier (no personal details), lasts up to one year, and is used only to apply the one free dream and to limit recordings per browser. It cannot be read by scripts on the page.\n- Browser storage (local storage): your chosen interface language, accessibility settings, which screen you were on, dreams you saved before an account existed (they stay on your device and are not uploaded automatically), and the sign-in session that Supabase keeps so you stay signed in.\n- We do not use advertising or analytics cookies or trackers, and we do not sell browsing data.${fontsEn}`,
    },
    {
      heading: 'How long we keep information',
      body: `- Saved dreams, their images and reflections: for as long as your account exists, unless you delete them first. There is no automatic deletion while the account is active.\n- Pattern reflections (the reflections drawn from several dreams): deleted together with any dream they were drawn from, and in any case when you delete the account.\n- Temporary analysis result: when a dream is sent for analysis we keep the result temporarily, up to about two hours, only for technical recovery, retrying a request and preventing double charging. It is cleared automatically (a database job runs every 10 minutes) and it is not part of your archive unless you saved the dream.\n- Voice recordings: not stored by us.\n- Credits: until you use them or delete the account. Credits do not expire.\n- Order and payment records: the package, amount, status and reference are kept without any link to you after you delete the account; tax documents and bookkeeping records are kept for the period required by law.\n- Free-dream marker and cookie: the cookie for up to one year; the marker record, which has no personal details, is kept so the free-dream limit cannot be bypassed.\n- Logs: our database and hosting providers keep server logs for short periods set by their plans (currently about 7 days at Supabase and about a day at Vercel). OpenAI may keep request records for up to ${OPENAI_ABUSE_LOG_DAYS} days. Make keeps its execution history according to its plan.\n- ${backupEn}`,
    },
    {
      heading: 'Deleting a dream',
      body: 'Deleting a dream from the archive removes the saved dream, its image and the pattern reflections drawn from it from our live systems. Reflections drawn only from other dreams are not affected. A copy may remain in the backups (see "How long we keep information").',
    },
    {
      heading: 'Deleting your account',
      body: 'In Settings choose "Delete account" and type the confirmation word. We delete, in this order: your saved dreams, reflections and patterns, analysis attempts and credit balance from the database; your images from storage; and, last, the sign-in account itself. If a step fails we tell you the deletion was not completed, and you can try again. The deletion cannot be undone, and we cannot restore a deleted account.\n\nWhat remains after the deletion: order and payment records without any link to you; the free-dream marker without personal details; an internal administrative record, only if the operator granted your account unlimited use (it keeps the email address and account id); tax documents and bookkeeping records for the period required by law; copies in encrypted backups (see "How long we keep information"); server logs until they expire; and whatever our providers keep under their own policies (for example OpenAI request records, up to ' + OPENAI_ABUSE_LOG_DAYS + ' days). We do not describe a deletion as final for copies that still exist in those places.',
    },
    {
      heading: 'Your rights',
      body: `You can ask to see the information we hold about you, to correct it, to receive a copy, or to delete it. You can delete dreams and your account yourself in the app. For other requests, or if you cannot use Settings, write to daretogoin@gmail.com from your account's email address. We will answer as soon as we can, and aim to do so within ${REQUEST_ANSWER_DAYS} days. We may need to verify your identity, and we cannot delete what the law requires us to keep. You may also turn to the Privacy Protection Authority.`,
    },
    {
      heading: 'Security',
      body: 'Dreams and images are stored in a database and a private storage bucket; each account can reach only its own data (row-level security); connections use HTTPS; backups are encrypted; and administrative access is limited to the operator. We do not routinely read dream content: the operator may access it only where needed for security, to fix a fault, at your request, or where the law requires. No system is perfectly secure, and we do not promise that it cannot be breached; if a serious incident happens we will act as the law requires.',
    },
    {
      heading: 'We do not sell your data',
      body: 'DARE does not sell, rent, or trade your personal information or dream content to third parties, and has no advertising business built on your data.',
    },
    {
      heading: 'Not medical or psychological advice',
      body: 'DARE is for personal reflection and entertainment. Nothing DARE generates is a medical, psychiatric, or psychological diagnosis, assessment, or treatment, and none of it should be treated as such. If you are in distress or need real support, please reach out to a licensed professional or your local emergency services.',
    },
    {
      heading: 'Changes to this policy',
      body: 'We may update this policy. The date at the top shows the latest version, and significant changes will be announced in the app.',
    },
    {
      heading: 'Contact',
      body: 'Questions about this policy or a request about personal information: daretogoin@gmail.com. Location: Kiryat Ono, Israel.',
    },
  ],
  draftNotice:
    'This is a draft privacy policy written for a small, early-stage app. It has not yet been reviewed by a lawyer and should not be relied on as a complete or final legal document — a properly reviewed policy will replace this before any commercial launch.',
};

export const privacyHe: LegalDocument = {
  title: 'מדיניות פרטיות',
  updated: 'עודכן לאחרונה: אוקטובר 2026',
  intro:
    'DARE TO GO IN ("דיר", "האפליקציה") היא אפליקציית יומן חלומות קטנה ועצמאית, להתבוננות אישית ולבידור. הדף הזה מסביר, בשפה פשוטה, איזה מידע האפליקציה מטפלת בו, למה, מי מקבל אותו, איפה הוא נשמר, כמה זמן, ומה אפשר לעשות לגביו. הוא נכתב עבור מי שמשתמש ב-DARE, לא עבור עורכי דין — גרסה מלאה ומאושרת משפטית תחליף אותו לפני השקה מסחרית.',
  sections: [
    {
      heading: 'מי אחראית על המידע',
      body: 'DARE TO GO IN הוא מותג הפועל תחת דפנה דלמדה, עוסק מורשה, מספר עוסק 033868969, קריית אונו, ישראל. העוסק הוא המחזיק במידע שמתואר במדיניות זו. פניות בנושא פרטיות: daretogoin@gmail.com.',
    },
    {
      heading: 'מי רשאי להשתמש ב-DARE',
      body: `DARE מיועדת לבני ${MIN_AGE} ומעלה. אנחנו לא אוספים ביודעין מידע מילדים ובני נוער מתחת לגיל ${MIN_AGE}, ומי שגילו נמוך מ-${MIN_AGE} מתבקש לא לפתוח חשבון ולא להשתמש בשירות. בעת פתיחת חשבון מתבקשים לאשר שגילכם ${MIN_AGE} ומעלה. אם נגלה שחשבון שייך למי שמתחת לגיל ${MIN_AGE}, אנחנו עשויים למחוק אותו.`,
    },
    {
      heading: 'מה אנחנו אוספים, ולמה',
      body: `- חשבון: כתובת האימייל, השם שבחרתם וסיסמה (נשמרת אצל Supabase בצורה מוצפנת; אנחנו אף פעם לא רואים אותה). אם מתחברים עם Google אנחנו מקבלים רק את הפרטים הבסיסיים ש-Google משתפת, כמו כתובת האימייל והשם. אנחנו משתמשים בהם כדי ליצור ולהגן על החשבון, לשלוח את אימייל האישור ולאפשר התחברות.\n- תוכן החלום: הטקסט שהקלדתם או התמלול של מה שאמרתם, התיקונים, האלמנטים והרגע שבחרתם, האסוציאציות הכתובות, התחושות שבחרתם לציין, ומה ש-DARE יוצרת מהם (חלום משוחזר, תמונה והתבוננות). אנחנו משתמשים בהם רק כדי לתת לכם את התוצאות שביקשתם. הם נשמרים בחשבון רק אם שומרים את החלום.\n- קול: אם מקליטים חלום, ההקלטה נשלחת כדי להפוך אותה לטקסט. אנחנו לא שומרים את ההקלטה.\n- רכישות: החבילה, הסכום, סטטוס התשלום ואסמכתת העסקה, בקישור לחשבון כדי להוסיף את הקרדיטים. שם מלא ומספר טלפון נייד נדרשים רק כשמתחילים תשלום (ראו "תשלומים ומסמכי מס").\n- מידע טכני: עוגייה טכנית אחת, אחסון הדפדפן המתואר בהמשך, ויומני השרתים הרגילים של ספקי האחסון ומסד הנתונים (למשל כתובת IP, זמן, העמוד שנתבקש וסוג הדפדפן). איננו משתמשים בכלי מעקב פרסומיים או אנליטיים.\n- סימון חלום חינמי: רישום ללא פרטים אישיים שאומר שדפדפן אנונימי כבר ניצל את החלום החינמי שלו, כדי שאי אפשר יהיה לעקוף את המגבלה.`,
    },
    {
      heading: 'מידע רגיש בחלומות',
      body: 'חלומות עשויים לחשוף מידע רגיש — למשל על בריאות, מצב נפשי, יחסים, מיניות או אנשים אחרים. אנחנו לא מבקשים מידע כזה; אתם מחליטים מה לכתוב או לומר. הוא מטופל כמו כל תוכן חלום: משמש רק ליצירת התוצאות שביקשתם, נשלח לספק הבינה המלאכותית כמתואר בהמשך, נשמר בחשבון רק אם שומרים את החלום, אף פעם לא משמש לפרסום או לפרופיילינג, ואף פעם לא נמכר. נא לא לכלול פרטים מזהים של אנשים אחרים. בכתיבה או בהקלטה של חלום אתם מבקשים מאיתנו לעבד את מה שכללתם בו.',
    },
    {
      heading: 'עיבוד באמצעות בינה מלאכותית',
      body: `כדי להפוך את מה ששיתפתם לחלום משוחזר, לתמונה, להתבוננות ולתמלול, אנחנו שולחים את הטקסט (ולצורך תמלול, גם את ההקלטה) אל OpenAI, ספק בינה מלאכותית ששרתיו בארצות הברית. אנחנו מבקשים מ-OpenAI לא לשמור את הטקסטים שנוצרו (ההגדרה store=false). עם זאת, OpenAI עשויה לשמור רישומים טכניים של בקשות API עד ${OPENAI_ABUSE_LOG_DAYS} ימים לצורך איתור שימוש לרעה, לפי התנאים שלה. לפי תנאי ה-API שפורסמו על ידי OpenAI, תוכן שנשלח דרך ה-API אינו משמש לאימון המודלים שלה כברירת מחדל. אנחנו לא משתמשים בתוכן החלומות שלכם לאימון מודל כלשהו, ולא לשיווק, לאנליטיקה או לכל מטרה אחרת מלבד מתן השירות. תחושות שבחרתם לציין נשלחות יחד עם החלום באותה בקשה.`,
    },
    {
      heading: 'ספקי שירות, והעברות מידע אל מחוץ לישראל',
      body: '- Supabase — חשבונות, מסד הנתונים ואחסון תמונות פרטי. אזור הנתונים: פרנקפורט, גרמניה (האיחוד האירופי).\n- Vercel — אחסון; השרתים שמעבדים בקשות (כולל ניתוח חלומות ואישור תשלום) פועלים בארצות הברית (אזור וושינגטון די.סי.), והעמודים מוגשים דרך רשת גלובלית.\n- OpenAI — עיבוד בינה מלאכותית, ארצות הברית (ראו "עיבוד באמצעות בינה מלאכותית").\n- Backblaze B2 — עותקי גיבוי מוצפנים, באיחוד האירופי. GitHub (ארצות הברית) מפעילה את האוטומציה שיוצרת את הגיבויים; המידע מוצפן לפני שהוא נשמר.\n- Make (אוטומציה) ו-Grow (ספקית התשלומים) — רק בעת רכישה, ראו "תשלומים ומסמכי מס". Morning — חשבוניות מס, ישראל.\n- Google — התחברות, אם בוחרים בה' + (GOOGLE_FONTS_SELF_HOSTED ? '.' : ', וגופנים (ראו "עוגיות ואחסון מקומי").') + '\n\nלכן המידע שלכם מועבר ומעובד מחוץ לישראל, כולל בארצות הברית. במקום שבו הדין דורש את הסכמתכם לכך, אתם נותנים אותה בשימוש ב-DARE לאחר קריאת הודעה זו. כל ספק מטפל במידע לפי התנאים ומדיניות הפרטיות שלו ולפי התחייבויות הגנת המידע שלו, שאינן בשליטתנו.',
    },
    {
      heading: 'תשלומים ומסמכי מס',
      body: 'כשבוחרים לרכוש קרדיטים, DARE מבקשת שם מלא ומספר טלפון נייד ישראלי, ורק כשמתחילים תשלום. הפרטים נשלחים אל Make (שירות אוטומציה) ואל Grow (ספקית התשלומים) כדי ליצור דף תשלום ולעבד את התשלום. אנחנו לא שומרים את השם ואת הטלפון ברשומות התשלום שלנו, ולא מקבלים או שומרים פרטי כרטיס אשראי: הם מוזנים בדף התשלום של Grow ומטופלים אצלה. Make ו-Grow מעבדות את הפרטים לפי התנאים ומדיניות הפרטיות שלהן; משך השמירה של היסטוריית ההרצות אצל Make תלוי בתוכנית שלה. התשלום חד־פעמי; אין מנוי ואין חיוב חוזר.\n\nאנחנו שומרים מידע מוגבל על ההזמנה והתשלום: החבילה, הסכום, סטטוס התשלום ואסמכתת העסקה, בקישור לחשבון, כדי להוסיף את הקרדיטים.\n\nחשבונית מס / קבלה על כל תשלום מופקת על ידי העוסק באופן ידני באמצעות מערכת Morning, ונשלחת לכתובת הדוא"ל של החשבון. לצורך זה אנחנו מזינים במערכת Morning את הפרטים הנדרשים להפקת המסמך לפי דין, והם נשמרים שם ולפי הנדרש בדין. Morning מעבדת את הפרטים לפי התנאים ומדיניות הפרטיות שלה.\n\nהקישור בין רשומת התשלום לחשבון מוסר אם תמחקו את החשבון. מסמכי מס ורישומי הנהלת חשבונות נשמרים לצורכי חשבונאות, מניעת הונאות ותמיכה, לתקופה הנדרשת בדין.',
    },
    {
      heading: 'עוגיות ואחסון מקומי',
      body: `- עוגייה טכנית אחת, ${TRIAL_COOKIE_NAME}: נקבעת על ידי השרת שלנו למבקר שעוד לא פתח חשבון; היא מכילה מזהה אקראי חתום (ללא פרטים אישיים), נשמרת עד שנה, ומשמשת רק להחלת החלום החינמי האחד ולהגבלת הקלטות לדפדפן. סקריפטים בעמוד אינם יכולים לקרוא אותה.\n- אחסון הדפדפן (local storage): שפת הממשק שבחרתם, הגדרות נגישות, באיזה מסך הייתם, חלומות ששמרתם לפני שהיה חשבון (הם נשארים במכשיר ואינם מועלים אוטומטית), והסשן ש-Supabase שומרת כדי שתישארו מחוברים.\n- איננו משתמשים בעוגיות או בכלי מעקב פרסומיים או אנליטיים, ואיננו מוכרים נתוני גלישה.${fontsHe}`,
    },
    {
      heading: 'כמה זמן אנחנו שומרים מידע',
      body: `- חלומות שמורים, התמונות וההתבוננויות שלהם: כל עוד החשבון קיים, אלא אם מחקתם אותם קודם. אין מחיקה אוטומטית כל עוד החשבון פעיל.\n- הרהורי דפוסים (התבוננויות שנוצרות מכמה חלומות): נמחקים יחד עם כל חלום שהם נוצרו ממנו, ובכל מקרה עם מחיקת החשבון.\n- תוצאת ניתוח זמנית: כששולחים חלום לניתוח, אנחנו שומרים זמנית את התוצאה, עד כשעתיים בערך, רק לצורך התאוששות טכנית, ניסיון חוזר ומניעת חיוב כפול. היא נמחקת אוטומטית (משימה במסד הנתונים רצה כל 10 דקות), והיא אינה חלק מהארכיון אלא אם שמרתם את החלום.\n- הקלטות קול: אינן נשמרות אצלנו.\n- קרדיטים: עד שמנצלים אותם או עד מחיקת החשבון. הקרדיטים אינם פגי תוקף.\n- רישומי הזמנות ותשלומים: החבילה, הסכום, הסטטוס והאסמכתא נשמרים ללא כל קישור אליכם אחרי מחיקת החשבון; מסמכי מס ורישומי הנהלת חשבונות נשמרים לתקופה הנדרשת בדין.\n- סימון חלום חינמי ועוגייה: העוגייה עד שנה; רשומת הסימון, שאין בה פרטים אישיים, נשמרת כדי שלא יהיה אפשר לעקוף את מגבלת החלום החינמי.\n- יומנים: ספקי מסד הנתונים והאחסון שלנו שומרים יומני שרתים לתקופות קצרות שנקבעות בתוכניות שלהם (כרגע כ-7 ימים אצל Supabase וכיום אחד אצל Vercel). OpenAI עשויה לשמור רישומי בקשות עד ${OPENAI_ABUSE_LOG_DAYS} ימים. Make שומרת היסטוריית הרצות לפי התוכנית שלה.\n- ${backupHe}`,
    },
    {
      heading: 'מחיקת חלום',
      body: 'מחיקת חלום מהארכיון מסירה מהמערכות החיות שלנו את החלום השמור, את התמונה שלו ואת הרהורי הדפוסים שנוצרו ממנו. הרהורים שנוצרו רק מחלומות אחרים אינם מושפעים. עותק עשוי להישאר בגיבויים (ראו "כמה זמן אנחנו שומרים מידע").',
    },
    {
      heading: 'מחיקת חשבון',
      body: 'בהגדרות בוחרים "מחיקת חשבון" ומקלידים את מילת האישור. אנחנו מוחקים, לפי הסדר הזה: את החלומות השמורים, ההרהורים והדפוסים, ניסיונות הניתוח ויתרת הקרדיטים ממסד הנתונים; את התמונות מהאחסון; ולבסוף את חשבון ההתחברות עצמו. אם שלב נכשל, אנחנו אומרים לכם שהמחיקה לא הושלמה, ואפשר לנסות שוב. אי אפשר לבטל את המחיקה, ואיננו יכולים לשחזר חשבון שנמחק.\n\nמה נשאר אחרי המחיקה: רישומי הזמנות ותשלומים ללא כל קישור אליכם; סימון החלום החינמי ללא פרטים אישיים; רישום ניהולי פנימי, רק אם העוסקת העניקה לחשבון שימוש בלתי מוגבל (הוא שומר כתובת אימייל ומזהה חשבון); מסמכי מס ורישומי הנהלת חשבונות לתקופה הנדרשת בדין; עותקים בגיבויים מוצפנים (ראו "כמה זמן אנחנו שומרים מידע"); יומני שרתים עד שהם פוקעים; ומה שהספקים שלנו שומרים לפי המדיניות שלהם (למשל רישומי בקשות אצל OpenAI, עד ' + OPENAI_ABUSE_LOG_DAYS + ' ימים). איננו מתארים מחיקה כסופית לגבי עותקים שעדיין קיימים במקומות האלה.',
    },
    {
      heading: 'הזכויות שלכם',
      body: `אפשר לבקש לעיין במידע שאנחנו מחזיקים עליכם, לתקן אותו, לקבל עותק ממנו או למחוק אותו. חלומות והחשבון אפשר למחוק בעצמכם באפליקציה. לבקשות אחרות, או אם אי אפשר להשתמש בהגדרות, כתבו אל daretogoin@gmail.com מכתובת האימייל של החשבון. נשיב בהקדם האפשרי, ונשתדל לעשות זאת בתוך ${REQUEST_ANSWER_DAYS} ימים. ייתכן שנצטרך לאמת את זהותכם, ואיננו יכולים למחוק מה שהדין מחייב אותנו לשמור. אפשר גם לפנות לרשות להגנת הפרטיות.`,
    },
    {
      heading: 'אבטחת מידע',
      body: 'חלומות ותמונות נשמרים במסד נתונים ובדלי אחסון פרטי; לכל חשבון יש גישה רק למידע שלו (הרשאות ברמת שורה); החיבורים הם באמצעות HTTPS; הגיבויים מוצפנים; והגישה הניהולית מוגבלת לעוסקת. איננו קוראים תוכן חלומות באופן שגרתי: העוסקת עשויה לגשת אליו רק כשנדרש לצורכי אבטחה, לתיקון תקלה, לפי בקשתכם, או כשהדין מחייב. אין מערכת מאובטחת לחלוטין, ואיננו מתחייבים שאי אפשר לפרוץ אליה; אם יקרה אירוע חמור, נפעל כפי שהדין מחייב.',
    },
    {
      heading: 'אין מכירת מידע',
      body: 'DARE לא מוכרת, משכירה או סוחרת במידע האישי או בתוכן החלומות שלכם לצדדים שלישיים, ואין לה מודל עסקי המבוסס על פרסום התלוי בנתונים שלכם.',
    },
    {
      heading: 'לא ייעוץ רפואי או פסיכולוגי',
      body: 'DARE מיועדת להתבוננות אישית ולבידור. שום דבר שנוצר על ידי DARE אינו אבחנה, הערכה או טיפול רפואי, פסיכיאטרי או פסיכולוגי, ואין להתייחס אליו ככזה. במצוקה או בצורך בתמיכה אמיתית, יש לפנות לאיש מקצוע מוסמך או לשירותי החירום המקומיים.',
    },
    {
      heading: 'שינויים במדיניות',
      body: 'אנחנו עשויים לעדכן את המדיניות. התאריך בראש הדף מציג את הגרסה האחרונה, ושינויים משמעותיים יפורסמו באפליקציה.',
    },
    {
      heading: 'יצירת קשר',
      body: 'שאלות על מדיניות זו או בקשה בנוגע למידע אישי: daretogoin@gmail.com. מיקום: קריית אונו, ישראל.',
    },
  ],
  draftNotice:
    'זוהי טיוטת מדיניות פרטיות שנכתבה עבור אפליקציה קטנה בשלב מוקדם. היא טרם נבדקה על ידי עורך דין ואין להסתמך עליה כמסמך משפטי סופי ומלא — מדיניות שעברה בדיקה משפטית מסודרת תחליף אותה לפני השקה מסחרית.',
};
