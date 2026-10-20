import type { MapConnection, MapDream, WholeView } from './mapTypes';

/**
 * SYNTHETIC DATA FOR THE PROTOTYPE ONLY. Every dream, answer, insight and whole view below was written by hand for the design review.
 * None of it is a real dreamer's dream and none of it was produced by a model: the real texts will come from the journey and pass its
 * checks. The one picture is the sample already in public/dream-assets (no new image is generated).
 */
const SAMPLE_IMAGE = '/dream-assets/dream-art-alt.jpg';

// ---------------------------------------------------------------------------
// Rich Hebrew dream: six moments offered, four explored when the map opens.
// ---------------------------------------------------------------------------

const RICH_HE_C: Record<string, MapConnection> = {
  c1: { id: 'c1', from: 'm1', to: 'm3', title: 'אותם מים, שני מקומות', basis: 'אמרת שהים היה במקום הנכון, והמים בתקרה לא.' },
  c2: { id: 'c2', from: 'm1', to: 'm5', title: 'מתחת לתקרה, אל הדלת', basis: 'המים תלויים מעל המיטה, והדלת היא "היציאה היחידה".' },
  c3: { id: 'c3', from: 'm2', to: 'm5', title: 'מהמוכר אל הלא ידוע', basis: 'המיטה הרגישה כמו שלך, והדלת מובילה למקום שלא ידעת.' },
  c4: { id: 'c4', from: 'm4', to: 'm1', title: 'המים גם בתוך התמונה', basis: 'בתמונה שעל הקיר יש מסדרון של מים, כמו התקרה שמעל.' },
  c5: { id: 'c5', from: 'm6', to: 'm5', title: 'לרצות לצאת ולפחד לזוז', basis: '"היציאה היחידה" מול התחושה שכל תזוזה תפיל הכול.' },
};

const RICH_HE_BASE_READINGS: WholeView['readings'] = [
  {
    basis: 'הים במקום הנכון והמים בתקרה לא',
    reading: 'אפשר לקרוא את החלום כשאלה על דברים שנמצאים במקום הלא נכון, ועל מה שקורה כשהם קרובים מדי.',
  },
  {
    basis: 'המיטה המוכרת בתוך החדר הזר',
    reading: 'ייתכן שהחלום עוסק במעבר: נקודה אחת מוכרת, ומסביבה מקום חדש שעוד לא נעשה שלך.',
  },
];

const richHe: MapDream = {
  key: 'rich-he',
  label: 'עשיר · 6 רגעים · עברית',
  language: 'he',
  date: '2026-10-20',
  sourceText:
    'התעוררתי בחדר שינה שלא הכרתי. התקרה הייתה עשויה ממים שזזו מעליי, ואור כחול ריצד על הקירות. מבעד לחלון ראיתי ים שקט ועננים. על הקיר הייתה תמונה של דמות קטנה שעומדת בתוך מסדרון של מים. הדלת בצד החדר הייתה פתוחה, אבל לא ידעתי לאן היא מובילה. רציתי לקום וללכת אליה, ופחדתי שהתקרה תיפול עליי.',
  imageSrc: SAMPLE_IMAGE,
  moments: [
    {
      id: 'm1',
      title: 'תקרה של מים',
      excerpt: 'התקרה הייתה עשויה ממים שזזו מעליי, ואור כחול ריצד על הקירות.',
      question: 'מה עולה כשחושבים על המים שזזו מעל המיטה, במקום תקרה?',
      answer: 'זה היה יפה ומפחיד באותו זמן. הרגשתי שמשהו גדול תלוי מעליי ואין לי שליטה עליו.',
      followUp: { question: 'כתבת שמשהו גדול היה תלוי מעל המיטה. היה רגע בחלום שבו זה השתנה?', answer: 'לא, זה נשאר ככה עד הסוף.' },
      insight: {
        headline: 'יופי ואיום באותו מקום, מעל המיטה',
        full: 'בחלום המים מחליפים את התקרה וזזים כל הזמן. כתבת שזה היה יפה ומפחיד באותו זמן, ושמשהו גדול היה תלוי מעל בלי שליטה, עד הסוף. אפשר לראות כאן רגע שבו מה שאמור לסגור ולהגן הופך לדבר חי ולא צפוי.',
      },
    },
    {
      id: 'm2',
      title: 'החדר שלא הכרתי',
      excerpt: 'התעוררתי בחדר שינה שלא הכרתי.',
      question: 'אחרי המים שמעל, מה היה מוכר ומה היה זר בחדר עצמו?',
      answer: 'המיטה הרגישה כמו שלי, אבל כל השאר היה של מישהו אחר.',
      insight: {
        headline: 'מיטה מוכרת בתוך חדר זר',
        full: 'התעוררת בחדר שלא הכרת, ואמרת שהמיטה הרגישה כמו שלך וכל השאר כמו של מישהו אחר. ייתכן שהחלום מחזיק כאן שני דברים יחד: נקודה אחת של בית, ומסביבה מקום שעוד לא שייך.',
      },
    },
    {
      id: 'm3',
      title: 'הים מבעד לחלון',
      excerpt: 'מבעד לחלון ראיתי ים שקט ועננים.',
      question: 'כתבת שהים מחוץ לחלון היה שקט. איך הוא נראה לעומת המים שבתקרה?',
      answer: 'הוא היה רגוע. כאילו הוא במקום הנכון, והמים בתקרה לא.',
      insight: {
        headline: 'אותם מים, פעם במקומם ופעם לא',
        full: 'בחלון הים שקט, ובתקרה המים זזים. אמרת שהים היה במקום הנכון והמים בתקרה לא. אפשר לשאול אם החלום מבחין בין משהו שנמצא במקומו לבין אותו דבר עצמו כשהוא מגיע למקום שלא מתאים לו.',
      },
    },
    {
      id: 'm4',
      title: 'התמונה על הקיר',
      excerpt: 'על הקיר הייתה תמונה של דמות קטנה שעומדת בתוך מסדרון של מים.',
      question: 'מה עולה כשחושבים על הדמות הקטנה שבתמונה, בתוך מסדרון המים?',
      answer: 'היא נראתה רחוקה. כאילו היא מחכה למשהו.',
      followUp: { question: 'לחכות למשהו: היה בחלום עוד מקום שבו מישהו חיכה?', answer: null },
      insight: {
        headline: 'דמות קטנה שעומדת בתוך המים',
        full: 'בתמונה שעל הקיר יש דמות קטנה במסדרון של מים. אמרת שהיא נראתה רחוקה, כאילו היא מחכה. ייתכן שהתמונה חוזרת על מה שקורה בחדר: גם שם יש מים, וגם שם מישהו עומד ולא זז.',
      },
    },
    {
      id: 'm5',
      title: 'הדלת הפתוחה',
      excerpt: 'הדלת בצד החדר הייתה פתוחה, אבל לא ידעתי לאן היא מובילה.',
      question: 'הדלת הייתה פתוחה ולא היה ידוע לאן היא מובילה. מה משך אליה, למרות הפחד מהתקרה?',
      answer: 'שהיא הייתה היציאה היחידה. לא היה לי אכפת לאן, רק לצאת.',
      insight: {
        headline: 'יציאה פתוחה, בלי לדעת לאן',
        full: 'הדלת פתוחה, ולא ידעת לאן היא מובילה. אמרת שהיא הייתה היציאה היחידה, ושלא היה חשוב לאן. נדמה שברגע הזה הכיוון חשוב פחות מעצם האפשרות לצאת.',
      },
    },
    {
      id: 'm6',
      title: 'הפחד לקום',
      excerpt: 'רציתי לקום וללכת אליה, ופחדתי שהתקרה תיפול עליי.',
      question: 'כתבת שרצית ללכת אל הדלת. מה עצר יותר: הפחד מהתקרה או משהו אחר?',
      answer: 'הפחד. הרגשתי שאם אזוז, הכול ייפול.',
      insight: {
        headline: 'כשהתנועה עצמה מרגישה מסוכנת',
        full: 'רצית לקום וללכת אל הדלת, ופחדת שהתקרה תיפול. אמרת שהייתה תחושה שכל תזוזה תפיל הכול. אפשר לראות כאן רגע שבו הרצון לצאת והפחד מהתנועה עומדים זה מול זה.',
      },
    },
  ],
  initiallyExplored: ['m1', 'm2', 'm3', 'm5'],
  wholeViews: [
    {
      basedOn: ['m1', 'm2', 'm3', 'm5'],
      overview:
        'ארבעת הרגעים שנחקרו נעים בין שני מקומות: חדר שהמים תלויים בו מעל, ויציאה פתוחה החוצה. במים שבתקרה תיארת יופי ואיום יחד, בחדר מצאת מיטה מוכרת בתוך מקום זר, בחלון ראית את אותם מים שקטים ובמקומם, ובדלת חיפשת רק לצאת.',
      recurring: 'מים מופיעים בשלושה מהרגעים: מעל המיטה, בחלון ובאור שעל הקירות. בכל פעם אמרת עליהם משהו אחר: מפחידים, רגועים, במקום ולא במקום.',
      contrast: 'בתקרה אין שליטה, ובדלת יש בחירה. החלום מציב את שניהם באותו חדר.',
      readings: RICH_HE_BASE_READINGS,
      closingQuestion: 'איפה בחיים עכשיו יש משהו יפה שגם מרגיש קרוב מדי, ואיפה נמצאת הדלת?',
      connections: [RICH_HE_C.c1, RICH_HE_C.c2, RICH_HE_C.c3],
    },
    {
      basedOn: ['m1', 'm2', 'm3', 'm4', 'm5'],
      overview:
        'חמישה רגעים, ובכולם החדר מחזיק משהו שאינו במקומו: מים במקום תקרה, מיטה מוכרת בתוך חדר זר, ודמות קטנה שעומדת בתוך מסדרון של מים. מולם עומדים הים השקט שבחלון והדלת הפתוחה, שני מקומות שאמרת עליהם שהם "במקום הנכון" ו"היציאה היחידה".',
      recurring: 'מים מופיעים עכשיו בארבעה רגעים, גם בתוך התמונה שעל הקיר. גם העמידה במקום חוזרת: הדמות בתמונה מחכה, וגם בחדר מישהו עוד לא זז.',
      contrast: 'בתקרה אין שליטה, ובדלת יש בחירה. החלום מציב את שניהם באותו חדר.',
      readings: RICH_HE_BASE_READINGS,
      closingQuestion: 'מה מחכה עכשיו, כמו הדמות שבתמונה, לרגע שבו אפשר יהיה לצאת?',
      connections: [RICH_HE_C.c1, RICH_HE_C.c2, RICH_HE_C.c3, RICH_HE_C.c4],
    },
    {
      basedOn: ['m1', 'm2', 'm3', 'm5', 'm6'],
      overview:
        'חמישה רגעים, ובמרכזם מתח אחד: הדלת פתוחה, ואמרת שהיא "היציאה היחידה", אבל כל תזוזה הרגישה כאילו תפיל את התקרה. מסביב, המיטה המוכרת והים השקט הם המקומות היחידים בחלום שבהם המים או החדר הרגישו במקומם.',
      recurring: 'מים מופיעים בשלושה מהרגעים, ובכל פעם אמרת עליהם משהו אחר: מפחידים, רגועים, במקום ולא במקום.',
      contrast: 'הרצון לצאת והפחד לזוז מופיעים באותו רגע, ואף אחד מהם לא מנצח עד סוף החלום.',
      readings: RICH_HE_BASE_READINGS,
      closingQuestion: 'מה היה עוזר לקום ולגשת אל הדלת, אם התקרה הייתה נשארת במקומה?',
      connections: [RICH_HE_C.c1, RICH_HE_C.c2, RICH_HE_C.c3, RICH_HE_C.c5],
    },
    {
      basedOn: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'],
      overview:
        'כל ששת הרגעים נחקרו. החלום נבנה סביב חדר אחד: מעל המים זזים, על הקיר דמות קטנה עומדת בתוך מים, ובחלון הים שקט. הדלת פתוחה ונראית כמו היציאה היחידה, אבל התנועה אליה הרגישה מסוכנת. התשובות שלך חוזרות שוב ושוב לשאלה מה נמצא במקומו ומה לא.',
      recurring: 'מים בארבעה רגעים, ועמידה במקום בשניים: הדמות שמחכה בתמונה, והפחד לקום מהמיטה.',
      contrast: 'הים השקט "במקום הנכון" מול התקרה שעלולה ליפול. הדלת הפתוחה מול הגוף שלא זז.',
      readings: RICH_HE_BASE_READINGS,
      closingQuestion: 'אם הדמות שבתמונה הייתה יכולה לצאת מהמסדרון, לאן הייתה הולכת?',
      connections: Object.values(RICH_HE_C),
    },
  ],
};

// ---------------------------------------------------------------------------
// Short Hebrew dream: one moment only (no links between moments are possible).
// ---------------------------------------------------------------------------

const shortHe: MapDream = {
  key: 'short-he',
  label: 'קצר · רגע 1 · עברית',
  language: 'he',
  date: '2026-10-18',
  sourceText: 'התעוררתי בחדר, והתקרה הייתה עשויה ממים.',
  imageSrc: SAMPLE_IMAGE,
  moments: [
    {
      id: 'm1',
      title: 'תקרה של מים',
      excerpt: 'התקרה הייתה עשויה ממים.',
      question: 'מה עולה כשחושבים על התקרה שהייתה עשויה ממים?',
      answer: 'שקט. כמו להיות מתחת לים בלי להיחנק.',
      insight: {
        headline: 'שקט מתחת למים',
        full: 'בחלום התקרה עשויה ממים. אמרת שזה היה שקט, כמו להיות מתחת לים בלי להיחנק. אפשר לראות כאן רגע שבו מה שהיה יכול להפחיד מורגש דווקא כרגוע.',
      },
    },
  ],
  initiallyExplored: ['m1'],
  wholeViews: [
    {
      basedOn: ['m1'],
      overview: 'בחלום יש רגע אחד: התקרה שעשויה ממים. התשובה שלך מוסיפה לו שקט, כמו להיות מתחת לים בלי להיחנק.',
      recurring: null,
      contrast: 'מים מעל הראש יכולים להפחיד, ותיארת אותם כשקטים.',
      readings: [{ basis: 'מתחת לים בלי להיחנק', reading: 'ייתכן שהחלום מציע רגע של מנוחה בתוך משהו שבדרך כלל מרגיש כבד.' }],
      closingQuestion: 'איפה בחיים עכשיו משהו שהיה אמור להפחיד מרגיש דווקא שקט?',
      connections: [],
    },
  ],
};

// ---------------------------------------------------------------------------
// Two Hebrew moments.
// ---------------------------------------------------------------------------

const twoHe: MapDream = {
  key: 'two-he',
  label: 'שני רגעים · עברית',
  language: 'he',
  date: '2026-10-17',
  sourceText: 'הייתי בחדר שינה, והתקרה הייתה עשויה ממים. מבעד לחלון ראיתי ים שקט.',
  imageSrc: SAMPLE_IMAGE,
  moments: [
    {
      id: 'm1',
      title: 'תקרה של מים',
      excerpt: 'התקרה הייתה עשויה ממים.',
      question: 'מה עולה כשחושבים על התקרה שהייתה עשויה ממים?',
      answer: 'שזה יכול ליפול כל רגע.',
      insight: {
        headline: 'משהו מעל שיכול ליפול',
        full: 'בחלום התקרה עשויה ממים. אמרת שזה יכול ליפול כל רגע. אפשר לראות כאן רגע שבו מה שמעל הראש לא מרגיש יציב.',
      },
    },
    {
      id: 'm2',
      title: 'הים מבעד לחלון',
      excerpt: 'מבעד לחלון ראיתי ים שקט.',
      question: 'אחרי התקרה שיכולה ליפול, מה עשה הים שמחוץ לחלון?',
      answer: 'הוא לא זז בכלל. זה הרגיע אותי.',
      insight: {
        headline: 'ים שקט שמרגיע',
        full: 'מבעד לחלון ראית ים שקט, ואמרת שהוא לא זז בכלל ושזה הרגיע. ייתכן שהחלום שם ליד התקרה הלא יציבה מקום אחד של יציבות.',
      },
    },
  ],
  initiallyExplored: ['m1', 'm2'],
  wholeViews: [
    {
      basedOn: ['m1', 'm2'],
      overview: 'שני הרגעים עשויים מאותם מים, ופועלים הפוך: מעל, מים שיכולים ליפול בכל רגע, ובחוץ, ים שלא זז ומרגיע.',
      recurring: null,
      contrast: 'אותם מים, פעם כאיום ופעם כמנוחה. ההבדל הוא איפה הם נמצאים.',
      readings: [{ basis: 'הים שלא זז והרגיע', reading: 'אפשר לקרוא את החלום כחיפוש אחרי נקודה יציבה כשמשהו קרוב מרגיש לא יציב.' }],
      closingQuestion: 'מה עכשיו בחיים הוא "הים שמבעד לחלון", המקום שלא זז?',
      connections: [{ id: 'c1', from: 'm1', to: 'm2', title: 'אותם מים, שני מקומות', basis: 'אמרת שהתקרה יכולה ליפול, ושהים שלא זז הרגיע.' }],
    },
  ],
};

// ---------------------------------------------------------------------------
// A charged dream: the reveal stays quiet; the wording never draws a conclusion about real life.
// ---------------------------------------------------------------------------

const SENSITIVE_C: MapConnection[] = [
  { id: 'c1', from: 'm1', to: 'm2', title: 'הטפטוף והשקט', basis: 'המים טפטפו על המיטה, ואמא לא התעוררה.' },
  { id: 'c2', from: 'm2', to: 'm3', title: 'להישאר ליד', basis: 'הדלת הייתה פתוחה, וכתבת שלא יכולת לעזוב אותה שם.' },
];

const sensitiveHe: MapDream = {
  key: 'sensitive-he',
  label: 'רגיש · 3 רגעים · עברית',
  language: 'he',
  date: '2026-10-16',
  sensitive: true,
  sourceText: 'חלמתי שהמים בתקרה התחילו לטפטף על המיטה שבה אמא שלי ישנה. ניסיתי להעיר אותה והיא לא התעוררה. הדלת הייתה פתוחה, אבל לא יכולתי לעזוב אותה שם.',
  imageSrc: SAMPLE_IMAGE,
  moments: [
    {
      id: 'm1',
      title: 'המים שטפטפו',
      excerpt: 'המים בתקרה התחילו לטפטף על המיטה שבה אמא שלי ישנה.',
      question: 'מה עולה כשחושבים על הטיפות שנפלו על המיטה?',
      answer: 'שזה מתחיל לאט, ואף אחד לא שם לב חוץ ממני.',
      insight: {
        headline: 'משהו שמתחיל לאט, ואף אחד אחר לא רואה',
        full: 'בחלום המים התחילו לטפטף על המיטה. אמרת שזה התחיל לאט, ושאף אחד לא שם לב חוץ ממך. אפשר לראות כאן רגע שבו רק מי שחולם את החלום רואה את מה שקורה.',
      },
    },
    {
      id: 'm2',
      title: 'אמא שלא התעוררה',
      excerpt: 'ניסיתי להעיר אותה והיא לא התעוררה.',
      question: 'מה היה ברגע שבו ניסית להעיר אותה?',
      answer: 'בהלה. רציתי שהיא תפתח את העיניים ותגיד שהכול בסדר.',
      insight: {
        headline: 'לקרוא למישהו ולא לקבל תשובה',
        full: 'ניסית להעיר את אמא שלך והיא לא התעוררה. אמרת שהייתה בהלה, ורצון שהיא תפתח את העיניים ותגיד שהכול בסדר. זה רגע קשה בחלום, והוא נשאר כאן כפי שתיארת אותו, בלי להסיק ממנו דבר על המציאות.',
      },
    },
    {
      id: 'm3',
      title: 'הדלת הפתוחה',
      excerpt: 'הדלת הייתה פתוחה, אבל לא יכולתי לעזוב אותה שם.',
      question: 'הדלת הייתה פתוחה. מה החזיק אותך בחדר?',
      answer: 'לא יכולתי להשאיר אותה. גם אם המים ממשיכים.',
      insight: {
        headline: 'להישאר, גם כשהדלת פתוחה',
        full: 'הדלת הייתה פתוחה, וכתבת שלא יכולת להשאיר אותה שם, גם אם המים ממשיכים. בחלום, ההישארות היא בחירה, לא חוסר אפשרות.',
      },
    },
  ],
  initiallyExplored: ['m1', 'm2'],
  wholeViews: [
    {
      basedOn: ['m1', 'm2'],
      overview: 'שני הרגעים קרובים זה לזה: המים מתחילים לטפטף לאט ואף אחד אחר לא שם לב, ואז הניסיון להעיר את אמא לא מצליח. בתשובות שלך יש בהלה ורצון לשמוע שהכול בסדר.',
      recurring: null,
      contrast: null,
      readings: [],
      closingQuestion: 'מה היה משתנה בחלום, אילו עוד מישהו היה שם לב לטיפות?',
      connections: [SENSITIVE_C[0]],
    },
    {
      basedOn: ['m1', 'm2', 'm3'],
      overview: 'שלושת הרגעים שומרים על אותו חדר: מים שמטפטפים, אמא שלא מתעוררת, ודלת פתוחה שלא יוצאים דרכה. כתבת שלא יכולת להשאיר אותה, גם כשהמים ממשיכים.',
      recurring: null,
      contrast: 'הדלת פתוחה, וההחלטה בחלום היא להישאר.',
      readings: [],
      closingQuestion: 'מה עוד היה צריך להיות בחדר, כדי שיהיה פחות קשה להישאר בו?',
      connections: SENSITIVE_C,
    },
  ],
};

// ---------------------------------------------------------------------------
// English, left to right: five moments offered, three explored.
// ---------------------------------------------------------------------------

const EN_C: Record<string, MapConnection> = {
  c1: { id: 'c1', from: 'm1', to: 'm3', title: 'The same water, two places', basis: 'You said the sea was where it belonged, and the water above the bed was not.' },
  c2: { id: 'c2', from: 'm1', to: 'm4', title: 'Under the ceiling, toward the door', basis: 'The water hangs over the bed; the door is "the only way out".' },
  c3: { id: 'c3', from: 'm5', to: 'm4', title: 'Wanting to leave, afraid to move', basis: '"The only way out", against the feeling that any movement would bring it all down.' },
};

const richEn: MapDream = {
  key: 'rich-en',
  label: 'English · 5 moments · LTR',
  language: 'en',
  date: '2026-10-19',
  sourceText:
    'I woke up in a bedroom I did not know. The ceiling was made of water moving above me, and blue light rippled over the walls. Through the window I saw a calm sea and clouds. The door at the side of the room was open, but I did not know where it led. I wanted to get up and go to it, and I was afraid the ceiling would fall on me.',
  imageSrc: SAMPLE_IMAGE,
  moments: [
    {
      id: 'm1',
      title: 'A ceiling of water',
      excerpt: 'The ceiling was made of water moving above me, and blue light rippled over the walls.',
      question: 'What comes up when you think of the water moving above the bed, where the ceiling should be?',
      answer: 'It was beautiful and frightening at once. Something huge was hanging over me and I had no control over it.',
      insight: {
        headline: 'Beauty and threat in the same place',
        full: 'In the dream, water takes the place of the ceiling and never stops moving. You said it was beautiful and frightening at once, something huge hanging over you with no control. One possibility: what should close a room and protect it becomes something alive and unpredictable.',
      },
    },
    {
      id: 'm2',
      title: 'A room I did not know',
      excerpt: 'I woke up in a bedroom I did not know.',
      question: 'Beyond the water above, what in the room itself felt familiar, and what felt foreign?',
      answer: 'The bed felt like mine. Everything else belonged to someone else.',
      insight: {
        headline: 'A familiar bed in a foreign room',
        full: 'You woke in a room you did not know, and said the bed felt like yours while everything else belonged to someone else. The dream may be holding two things together: one point of home, and around it a place that is not yet yours.',
      },
    },
    {
      id: 'm3',
      title: 'The sea through the window',
      excerpt: 'Through the window I saw a calm sea and clouds.',
      question: 'You wrote that the sea outside was calm. How did it look next to the water above you?',
      answer: 'Peaceful. Like it was where it belonged, and the water in the ceiling was not.',
      insight: {
        headline: 'The same water, in place and out of place',
        full: 'Through the window the sea is calm; above the bed the water moves. You said the sea was where it belonged and the ceiling water was not. It is worth asking whether the dream separates something in its place from the same thing arriving where it does not fit.',
      },
    },
    {
      id: 'm4',
      title: 'The open door',
      excerpt: 'The door at the side of the room was open, but I did not know where it led.',
      question: 'The door was open and its destination unknown. What drew you to it, despite the fear of the ceiling?',
      answer: 'It was the only way out. I did not care where, just out.',
      followUp: { question: 'Was there anything on the other side of the door that you could see or hear?', answer: 'No. Just dark.' },
      insight: {
        headline: 'A way out, without knowing where',
        full: 'The door is open and you did not know where it led; beyond it there was only dark. You said it was the only way out and the direction did not matter. In this moment, being able to leave seems to matter more than where to.',
      },
    },
    {
      id: 'm5',
      title: 'Afraid to get up',
      excerpt: 'I wanted to get up and go to it, and I was afraid the ceiling would fall on me.',
      question: 'You wanted to go to the door. What held you back more: the ceiling, or something else?',
      answer: 'The fear. If I moved, it would all come down.',
      insight: {
        headline: 'When moving itself feels dangerous',
        full: 'You wanted to get up and go to the door, and you were afraid the ceiling would fall. You said any movement felt like it would bring everything down. Here the wish to leave and the fear of moving stand face to face.',
      },
    },
  ],
  initiallyExplored: ['m1', 'm3', 'm4'],
  wholeViews: [
    {
      basedOn: ['m1', 'm3', 'm4'],
      overview:
        'The three moments you explored move between the room and what lies outside it. Above the bed, water you called beautiful and frightening; through the window, the same water calm and "where it belonged"; at the side, an open door that was "the only way out".',
      recurring: 'Water appears in two of the moments, and you described it differently each time: out of control above, peaceful outside.',
      contrast: 'No control over the ceiling, a choice at the door. The dream puts both in the same room.',
      readings: [
        { basis: 'the sea where it belonged', reading: 'One reading: the dream asks what happens when something is in the wrong place and too close.' },
      ],
      closingQuestion: 'Where in your life right now is something beautiful that also feels too close, and where is the door?',
      connections: [EN_C.c1, EN_C.c2],
    },
    {
      basedOn: ['m1', 'm2', 'm3', 'm4', 'm5'],
      overview:
        'All five moments are explored. One room holds everything: moving water above, a bed that felt like yours in a room that did not, a calm sea outside, and an open door you could not reach because moving felt dangerous.',
      recurring: 'Water in two moments; staying still in two: the familiar bed and the fear of getting up.',
      contrast: 'The sea "where it belonged" against a ceiling that might fall; an open door against a body that does not move.',
      readings: [
        { basis: 'the sea where it belonged', reading: 'One reading: the dream asks what happens when something is in the wrong place and too close.' },
        { basis: 'a familiar bed in a foreign room', reading: 'Another: a transition, one familiar point inside a place that is not yet yours.' },
      ],
      closingQuestion: 'If the ceiling stayed where it was, what would make it possible to get up and walk to the door?',
      connections: Object.values(EN_C),
    },
  ],
};

export const SYNTHETIC_DREAMS: MapDream[] = [richHe, shortHe, twoHe, sensitiveHe, richEn];
