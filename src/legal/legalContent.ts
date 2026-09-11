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
    buried — since none of this has had a real legal review yet. */

export type LegalKey = 'privacy' | 'accessibility' | 'terms';

export interface LegalSection {
  heading: string;
  /** One or more paragraphs, separated by a blank line — rendered as
      separate <p> tags (see LegalPage.tsx), never as raw HTML. */
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
}

const LAST_UPDATED_EN = 'Last updated: September 2026';
const LAST_UPDATED_HE = 'עודכן לאחרונה: ספטמבר 2026';

const en: LegalContent = {
  privacy: {
    title: 'Privacy Policy',
    updated: LAST_UPDATED_EN,
    intro:
      'DARE TO GO IN ("DARE", "we", "the app") is a small, independent dream-journaling app. This page explains, in plain language, what information the app handles and why. It is written for people using DARE, not for lawyers — a fuller, formally reviewed version will replace it before any commercial launch.',
    sections: [
      {
        heading: 'Account & authentication',
        body: 'Creating an archive uses Supabase, a third-party authentication and database provider, to manage your account. You can sign in with an email address and password, or with your Google account — DARE never sees or stores your Google password, only the confirmation that you signed in. Your session is managed by Supabase; DARE does not keep a separate, parallel record of whether you are logged in.',
      },
      {
        heading: 'What you share with DARE',
        body: 'When you record or type a dream, that text (and, where voice input is used, the audio captured to transcribe it) is submitted so DARE can reconstruct and reflect on it. If you save a dream to your archive, the dream text, any correction you make to it, the elements you choose to focus on, your own written associations, and the reflection generated for you are stored against your account.',
      },
      {
        heading: 'AI processing',
        body: 'Turning what you share into a reconstructed dream, an image, and a reflection involves sending that text (and transcribed audio) to OpenAI, a third-party AI provider, for processing. OpenAI processes this content to generate the results DARE shows you; DARE does not control OpenAI\'s own retention practices beyond what OpenAI publishes, and does not use your dream content to train any model of our own.',
      },
      {
        heading: 'Generated content',
        body: 'The reconstructed dream text, dream image, and reflection (observations, associations, and questions) DARE generates are a creative, AI-assisted interpretation — never a factual record of what actually happened in your sleep, and never a diagnosis. They are stored as part of your saved dream, in the language your interface was set to at the time you saved it.',
      },
      {
        heading: 'How your data is stored',
        body: 'Account and saved-dream data live in Supabase\'s database, associated with your account. At the time of writing, dreams saved before a real account existed are stored locally on your own device only (in your browser\'s local storage) and are not uploaded automatically — a separate, clearly-announced step will be needed before any such import happens.',
      },
      {
        heading: 'Technical & session data',
        body: 'DARE uses your browser\'s local storage for a small number of technical purposes: remembering your chosen interface language, and (if you use the browser-based dream player) which screen you were on. Supabase sets its own session storage to keep you signed in. DARE does not use third-party advertising trackers or sell any browsing data.',
      },
      {
        heading: 'Your choices',
        body: 'You can sign out at any time from your archive. To request deletion or an export of your account and dream data, use the contact details below — DARE does not yet have a fully self-service deletion/export tool built in, but will honor reasonable requests manually while that is being built.',
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
        body: 'Questions about this policy, or a request about your data, can be sent to dafnadl77@gmail.com.',
      },
    ],
    draftNotice:
      'This is a draft privacy policy written for a small, early-stage app. It has not yet been reviewed by a lawyer and should not be relied on as a complete or final legal document — a properly reviewed policy will replace this before any commercial launch.',
  },
  accessibility: {
    title: 'Accessibility Statement',
    updated: LAST_UPDATED_EN,
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
        body: 'If you hit a real barrier using DARE, or have a suggestion, please tell us at dafnadl77@gmail.com — genuine reports directly shape what gets fixed next.',
      },
    ],
    draftNotice:
      'This statement reflects an honest, in-progress state, not a completed or certified audit. Accessibility review and testing is ongoing.',
  },
  terms: {
    title: 'Terms of Use',
    updated: LAST_UPDATED_EN,
    intro:
      'These terms cover using DARE TO GO IN. By using the app, you agree to them. They are written in plain language for a small, early-stage app — a fuller, formally reviewed version will replace them before any commercial launch.',
    sections: [
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
        heading: 'Termination & deletion',
        body: 'You may stop using DARE and request deletion of your account and data at any time (see the Privacy Policy for how). We may also suspend or end access for use that violates these terms.',
      },
      {
        heading: 'Contact',
        body: 'Questions about these terms can be sent to dafnadl77@gmail.com.',
      },
    ],
    draftNotice:
      'This is a draft, written for a small, early-stage app. It has not yet been reviewed by a lawyer and should not be relied on as a complete or final legal document — a properly reviewed version will replace this before any commercial launch.',
  },
};

const he: LegalContent = {
  privacy: {
    title: 'מדיניות פרטיות',
    updated: LAST_UPDATED_HE,
    intro:
      'DARE TO GO IN ("דיר", "האפליקציה") היא אפליקציית יומן חלומות קטנה ועצמאית. הדף הזה מסביר, בשפה פשוטה, אילו מידע האפליקציה מטפלת בו ולמה. הוא נכתב עבור מי שמשתמש ב-DARE, לא עבור עורכי דין — גרסה מלאה ומאושרת משפטית תחליף אותו לפני השקה מסחרית.',
    sections: [
      {
        heading: 'חשבון והתחברות',
        body: 'יצירת ארכיון משתמשת ב-Supabase, ספק חיצוני לאימות ולניהול מסדי נתונים, לניהול החשבון. אפשר להתחבר עם כתובת אימייל וסיסמה, או עם חשבון Google — DARE אף פעם לא רואה או שומרת את סיסמת ה-Google, רק את האישור שההתחברות הצליחה. הסשן מנוהל על ידי Supabase; DARE לא שומרת רישום נפרד ומקביל של מצב ההתחברות.',
      },
      {
        heading: 'מה משתפים עם DARE',
        body: 'כשמקליטים או מקלידים חלום, הטקסט הזה (ובמקרה של קלט קולי, גם ההקלטה שמשמשת לתמלול) נשלח כדי ש-DARE תוכל לשחזר את החלום ולהציע התבוננות עליו. שמירת חלום בארכיון שומרת את טקסט החלום, כל תיקון שנעשה בו, האלמנטים שנבחרו, האסוציאציות הכתובות, וההתבוננות שנוצרה — משויכים לחשבון.',
      },
      {
        heading: 'עיבוד באמצעות בינה מלאכותית',
        body: 'הפיכת מה ששיתפתם לחלום משוחזר, לתמונה ולהתבוננות כרוכה בשליחת הטקסט (וההקלטה המתומללת) אל OpenAI, ספק בינה מלאכותית חיצוני, לעיבוד. OpenAI מעבדת את התוכן כדי ליצור את התוצאות שמוצגות באפליקציה; DARE לא שולטת במדיניות השמירה של OpenAI מעבר למה שהיא עצמה מפרסמת, ולא משתמשת בתוכן החלומות לאימון מודל כלשהו משלה.',
      },
      {
        heading: 'תוכן שנוצר',
        body: 'טקסט החלום המשוחזר, תמונת החלום וההתבוננות (מה שבולט, אסוציאציות ושאלות) שנוצרים על ידי DARE הם פרשנות יצירתית בסיוע בינה מלאכותית — לעולם לא רישום עובדתי של מה שקרה בפועל בשינה, ולעולם לא אבחנה. הם נשמרים כחלק מהחלום השמור, בשפה שהייתה פעילה בממשק בזמן השמירה.',
      },
      {
        heading: 'איך המידע נשמר',
        body: 'נתוני חשבון וחלומות שמורים נשמרים במסד הנתונים של Supabase, משויכים לחשבון. נכון לכתיבת שורות אלו, חלומות שנשמרו לפני קיום חשבון אמיתי נשמרים מקומית במכשיר בלבד (באחסון המקומי של הדפדפן) ואינם מועלים באופן אוטומטי — יידרש צעד נפרד ומוצהר בבירור לפני כל העברה כזו.',
      },
      {
        heading: 'מידע טכני וסשן',
        body: 'DARE משתמשת באחסון המקומי של הדפדפן למספר מצומצם של מטרות טכניות: זכירת שפת הממשק שנבחרה, ו(אם נעשה שימוש בנגן החלומות בדפדפן) באיזה מסך הייתם. Supabase מגדירה אחסון סשן משלה כדי לשמור על מצב ההתחברות. DARE לא משתמשת בכלי מעקב פרסומיים חיצוניים ולא מוכרת נתוני גלישה כלשהם.',
      },
      {
        heading: 'הבחירות שלכם',
        body: 'ניתן להתנתק בכל עת מהארכיון. כדי לבקש מחיקה או ייצוא של החשבון ונתוני החלומות, יש להשתמש בפרטי הקשר למטה — עדיין אין ל-DARE כלי מחיקה/ייצוא עצמאי מלא, אך בקשות סבירות יטופלו באופן ידני בזמן שהכלי בפיתוח.',
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
        body: 'שאלות לגבי מדיניות זו, או בקשה בנוגע למידע האישי, ניתן לשלוח אל dafnadl77@gmail.com.',
      },
    ],
    draftNotice:
      'זוהי טיוטת מדיניות פרטיות שנכתבה עבור אפליקציה קטנה בשלב מוקדם. היא טרם נבדקה על ידי עורך דין ואין להסתמך עליה כמסמך משפטי סופי ומלא — מדיניות שעברה בדיקה משפטית מסודרת תחליף אותה לפני השקה מסחרית.',
  },
  accessibility: {
    title: 'הצהרת נגישות',
    updated: LAST_UPDATED_HE,
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
        body: 'אם נתקלתם במחסום אמיתי בשימוש ב-DARE, או שיש לכם הצעה, אנא ספרו לנו ב-dafnadl77@gmail.com — דיווחים אמיתיים משפיעים ישירות על מה שמתוקן הלאה.',
      },
    ],
    draftNotice: 'הצהרה זו משקפת מצב כן ומתמשך, לא ביקורת שהושלמה או הוסמכה. בדיקת הנגישות באפליקציה נמשכת.',
  },
  terms: {
    title: 'תנאי שימוש',
    updated: LAST_UPDATED_HE,
    intro:
      'תנאים אלו חלים על השימוש ב-DARE TO GO IN. שימוש באפליקציה מהווה הסכמה להם. הם נכתבו בשפה פשוטה עבור אפליקציה קטנה בשלב מוקדם — גרסה מלאה ומאושרת משפטית תחליף אותם לפני השקה מסחרית.',
    sections: [
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
        heading: 'הפסקת שימוש ומחיקה',
        body: 'ניתן להפסיק להשתמש ב-DARE ולבקש מחיקת חשבון ונתונים בכל עת (ראו מדיניות הפרטיות לאופן הביצוע). אנו עשויים גם להשעות או להפסיק גישה עבור שימוש המפר תנאים אלו.',
      },
      {
        heading: 'יצירת קשר',
        body: 'שאלות לגבי תנאים אלו ניתן לשלוח אל dafnadl77@gmail.com.',
      },
    ],
    draftNotice:
      'זוהי טיוטה, שנכתבה עבור אפליקציה קטנה בשלב מוקדם. היא טרם נבדקה על ידי עורך דין ואין להסתמך עליה כמסמך משפטי סופי ומלא — גרסה שעברה בדיקה משפטית מסודרת תחליף אותה לפני השקה מסחרית.',
  },
};

const CONTENT: Record<Language, LegalContent> = { en, he };

export function getLegalDocument(language: Language, key: LegalKey): LegalDocument {
  return CONTENT[language][key];
}
