/**
 * The scripted conversations of the PAIR-AND-QUESTION design page (pair-conversation.html, development only; doc 90 v3). Every
 * line comes from a saved run or from doc 90, and says so in `src`; nothing here calls a model. The rules of doc 90 are checked on
 * this data by tests/pairConversationScript.test.ts (exact quotes, pacing, a whole view that adds and does not repeat).
 */

/** Where a line comes from. Shown on the page only when "sources" is switched on. */
export type LineSource =
  | 'run' //          the saved run, word for word
  | 'run-short' //    the saved run, shortened (doc 90 principle 1: one short reflection)
  | 'spec' //         the wording doc 90 set out
  | 'illustrative' // written for the illustration
  | 'demo'; //        what the viewer types on this page

export interface PairSide {
  /** Exact words, as written in the dream or in the answer. */
  quote: string;
  from: 'dream' | 'answer';
}

export type Turn =
  | { kind: 'choose'; picked: string | 'whole'; src: LineSource }
  | { kind: 'ask'; text: string; src: LineSource }
  | { kind: 'answer'; text: string; src: LineSource }
  | { kind: 'reflect'; dream?: string; her?: string; src: LineSource }
  | {
      kind: 'pair';
      intro: string;
      a: PairSide;
      b: PairSide;
      question: string;
      /** The relation the system verified and does not show (doc 90 principle 2). */
      relation: 'negation' | 'change' | 'wanted-not-managed';
      /** Different images (her emphasis, 2026-10-23): offered as an open question only, never stated as a link. */
      differentImages: boolean;
      src: LineSource;
      /** The scripted answer, or null: the viewer types her own (no reflection is invented for it). */
      answer: { text: string; reflection: string; src: LineSource } | null;
    }
  | {
      kind: 'whole';
      /** What the whole view says when the pair was answered, and when it was skipped (or there was none). */
      answered: string[];
      skipped: string[];
      question: string;
      /** Moments not explored yet; `invite` is the one the forward question points to. */
      unexplored: string[];
      invite?: string;
      src: LineSource;
    };

export interface Step {
  /** The moment explored in this step, or 'whole'. */
  moment: string | 'whole';
  turns: Turn[];
  /** Why there is, or is not, a pair here. Development note, shown only with "sources". */
  why: string;
}

export interface Scenario {
  key: 'store' | 'balcony' | 'balcony-images';
  tab: string;
  title: string;
  runRef: string;
  address: 'masculine' | 'feminine';
  dreamText: string;
  labels: string[];
  steps: Step[];
  /** Development summary of what this scenario shows. */
  shows: string;
}

const STORE_DREAM =
  'אני בחנות כלי עבודה ישנה, מחפש בורג מסוים למדף שאני בונה בבית. המוכר, איש מבוגר עם משקפיים עבים, מושיט לי קופסה מלאה ברגים, ואני מחפש ומחפש ולא מוצא את המידה הנכונה. כשאני מרים את הראש, המוכר כבר לא איש אלא עץ זית קטן בתוך עציץ, והוא אומר לי בשקט: "אתה כבר יודע איזה צריך." אולי זה היה הקול של אחי. אני יוצא מהחנות בלי כלום ביד.';

const BALCONY_DREAM =
  'ישבתי על מרפסת של דירה שלא הכרתי, ומישהו בחדר הסמוך ניגן בפסנתר את אותו משפט קצר שוב ושוב. השמיים היו ורודים, ולא רציתי לזוז משם.';

const PIANO_ASK = 'איזה צליל או תחושה מהפסנתר הכי נשארו לך בזיכרון מהרגע הזה?';
const PIANO_ANSWER = 'הצליל היה מאוד מרגיע, כאילו הוא חיבר בין השמיים הוורודים לממדי הזמן. זה היה רגע של שלווה שנשאר לי בראש.';
const SKY_ASK = 'מה עלה לך בראש כשהשמיים היו ורודים?';
const SKY_ANSWER = 'המפגש בין הצלילים לשמיים הוורודים גרם לי להרגיש כאילו אני במקום אינטימי ומיוחד, כמו חלום שמזמין רגעים יפים.';
const SKY_REFLECT: Turn = {
  kind: 'reflect',
  dream: 'השמיים היו ורודים, ולא רצית לזוז משם.',
  her: 'ואמרת שהמפגש בין הצלילים לשמיים גרם לך להרגיש כאילו את במקום אינטימי ומיוחד.',
  src: 'run-short',
};
/** Closing questions sound like a person continuing the talk (her note, 2026-10-23): her own words, then a plain question. */
const INTIMATE_QUESTION = 'אמרת שהרגשת כאילו את במקום אינטימי ומיוחד. איך היה לך שם?';

export const SCENARIOS: Scenario[] = [
  {
    key: 'store',
    tab: 'עם זוג פרטים',
    title: 'החנות',
    runRef: 'acc2-2',
    address: 'masculine',
    dreamText: STORE_DREAM,
    labels: ['המוכר לתוך העץ', 'המוכר עם הקופסה', 'יוצא מהחנות ריק', 'בחנות כלי עבודה', 'אומר בשקט', 'הקול של האח'],
    shows: 'זוג אחד, בתוך רגע, ברגע השלישי. אפשר לענות או לדלג, והמבט השלם משתנה בהתאם.',
    steps: [
      {
        moment: 'המוכר לתוך העץ',
        why: 'אין זוג: הרגע הראשון במסע הוא הקשבה בלבד.',
        turns: [
          { kind: 'choose', picked: 'המוכר לתוך העץ', src: 'run' },
          { kind: 'ask', text: 'איך נראה עץ הזית בעציץ ברגע הזה?', src: 'run' },
          { kind: 'answer', text: 'עץ הזית הקטן היה פשוט וקליל, עם עלים ירוקים כהים וגזע דק. הוא נתן תחושה של שקט ושלווה.', src: 'run' },
          {
            kind: 'reflect',
            dream: 'המוכר כבר לא איש, אלא עץ זית קטן בתוך עציץ.',
            her: 'ואצלך נשאר ממנו בעיקר השקט והשלווה שהוא נתן.',
            src: 'spec',
          },
        ],
      },
      {
        moment: 'המוכר עם הקופסה',
        why:
          'אין זוג: את הניגוד בין המגוון לבין מה שחסר הוא אמר בעצמו, ולכן זוג עליו הוא הד. (בריצה הוא ענה קודם "לא יודע", וזו השאלה האחרת שנשאלה אחרי כן. גם אחרי "לא יודע" אין זוג.)',
        turns: [
          { kind: 'choose', picked: 'המוכר עם הקופסה', src: 'run' },
          { kind: 'ask', text: 'איזה פרט בקופסה המלאה ברגים הכי תפס את העין שלך ברגע הזה?', src: 'run' },
          { kind: 'answer', text: 'מגוון הברגים. היו שם סוגים שונים, אבל אף אחד מהם לא היה מה שהייתי צריך באמת.', src: 'run-short' },
          {
            kind: 'reflect',
            dream: 'המוכר מושיט לך קופסה מלאה ברגים.',
            her: 'ואמרת שהיו שם סוגים שונים, אבל אף אחד לא היה מה שהיית צריך באמת.',
            src: 'spec',
          },
        ],
      },
      {
        moment: 'יוצא מהחנות ריק',
        why:
          'יש זוג: היחס הוא שלילה בצד אחד ("ידעתי" מול "בלי כלום ביד"), ושני הפרטים מאותו רגע. זה הזוג שהמודל כתב 6 פעמים בריצה. כאן השיקוף לא מקדים את הזוג, כדי שהשניים לא יופיעו פעמיים ברצף.',
        turns: [
          { kind: 'choose', picked: 'יוצא מהחנות ריק', src: 'run' },
          { kind: 'ask', text: 'מה עבר לך בראש כשיצאת מהחנות בלי כלום ביד?', src: 'spec' },
          { kind: 'answer', text: 'הבנתי שאני מחפש משהו, אבל בעצם ידעתי כבר מה אני צריך. הרגשתי חוסר ומוזרות.', src: 'run-short' },
          { kind: 'reflect', her: 'אמרת שהרגשת חוסר ומוזרות.', src: 'run-short' },
          {
            kind: 'pair',
            intro: 'שני דברים מהרגע הזה, זה ליד זה:',
            a: { quote: 'בעצם ידעתי כבר מה אני צריך', from: 'answer' },
            b: { quote: 'אני יוצא מהחנות בלי כלום ביד', from: 'dream' },
            question: 'מה אתה רואה כשהם עומדים יחד?',
            relation: 'negation',
            differentImages: false,
            src: 'run',
            answer: {
              text: 'אולי ידעתי, ופשוט לא לקחתי את זה.',
              reflection: 'אמרת שאולי ידעת, ופשוט לא לקחת את זה.',
              src: 'illustrative',
            },
          },
        ],
      },
      {
        moment: 'whole',
        why:
          'אין זוג בין רגעים: «אתה כבר יודע איזה צריך» מול «ידעתי כבר מה אני צריך» הוא חזרה על מילים בלבד, ו"ידעתי כבר" כבר הוצג בזוג. המבט מביא את מה שהוא גילה בעצמו, ומזמין קדימה לרגע שלא נחקר.',
        turns: [
          { kind: 'choose', picked: 'whole', src: 'run' },
          {
            kind: 'whole',
            answered: [
              'ברגעים שחקרת עלו השקט שהעץ נתן לך, הברגים שאף אחד מהם לא היה מה שהיית צריך, והמשפט שלך: "אולי ידעתי, ופשוט לא לקחתי את זה".',
            ],
            skipped: ['ברגעים שחקרת עלו השקט שהעץ נתן לך, הברגים שאף אחד מהם לא היה מה שהיית צריך, והחוסר והמוזרות שהרגשת כשיצאת.'],
            question: 'יש עוד רגע בחלום, כשהמוכר אומר לך משהו בשקט. נסתכל גם עליו?',
            unexplored: ['בחנות כלי עבודה', 'אומר בשקט', 'הקול של האח'],
            invite: 'אומר בשקט',
            src: 'illustrative',
          },
        ],
      },
    ],
  },
  {
    key: 'balcony',
    tab: 'בלי זוג',
    title: 'המרפסת',
    runRef: 'acc2-3',
    address: 'feminine',
    dreamText: BALCONY_DREAM,
    labels: ['ניגון בפסנתר', 'שמים ורודים'],
    shows: 'שיחה שלמה בלי אף זוג. אין הודעה שמכריזה על כך: המבט השלם פשוט משקף ושואל.',
    steps: [
      {
        moment: 'ניגון בפסנתר',
        why:
          'אין זוג: הרגע הראשון. (בריצה הייתה כאן מועמדת על שני דימויים שונים, «דירה שלא הכרתי» מול «מאוד מרגיע». לפי הדגש שלך היא כשירה כשאלה פתוחה, אבל לא ברגע הראשון. ראי את התרחיש "שני דימויים שונים".)',
        turns: [
          { kind: 'choose', picked: 'ניגון בפסנתר', src: 'run' },
          { kind: 'ask', text: PIANO_ASK, src: 'run' },
          { kind: 'answer', text: PIANO_ANSWER, src: 'run' },
          {
            kind: 'reflect',
            dream: 'ישבת על מרפסת של דירה שלא הכרת, ומישהו בחדר הסמוך ניגן בפסנתר את אותו משפט קצר שוב ושוב.',
            her: 'ואצלך נשאר רגע של שלווה.',
            src: 'spec',
          },
        ],
      },
      {
        moment: 'שמים ורודים',
        why:
          'אין זוג: "השמיים היו ורודים" ו"לא רציתי לזוז משם" הם אותו משפט בחלום. גם "מקום אינטימי" ליד "לא רציתי לזוז" אינו יחס: אין בהם מתח, רק המשך. והמועמדת השלישית בריצה הייתה הד.',
        turns: [
          { kind: 'choose', picked: 'שמים ורודים', src: 'run' },
          { kind: 'ask', text: SKY_ASK, src: 'illustrative' },
          { kind: 'answer', text: SKY_ANSWER, src: 'run' },
          SKY_REFLECT,
        ],
      },
      {
        moment: 'whole',
        why: 'אין זוג בין רגעים, ואין הודעה על כך. "חזרת אל הצליל" מותר: היא עצמה הזכירה את הצליל בשתי התשובות. זה שיקוף, לא קשר שהמערכת מציעה.',
        turns: [
          { kind: 'choose', picked: 'whole', src: 'run' },
          {
            kind: 'whole',
            answered: ['בשני הרגעים חזרת אל הצליל: פעם הוא היה מרגיע, ופעם הוא נפגש עם השמיים הוורודים.'],
            skipped: ['בשני הרגעים חזרת אל הצליל: פעם הוא היה מרגיע, ופעם הוא נפגש עם השמיים הוורודים.'],
            question: INTIMATE_QUESTION,
            unexplored: [],
            src: 'illustrative',
          },
        ],
      },
    ],
  },
  {
    key: 'balcony-images',
    tab: 'שני דימויים שונים',
    title: 'המרפסת, בסדר אחר',
    runRef: 'acc2-3',
    address: 'feminine',
    dreamText: BALCONY_DREAM,
    labels: ['ניגון בפסנתר', 'שמים ורודים'],
    shows:
      'הדגש שלך: מקום וצליל הם שני דימויים שונים. הזוג לא נפסל, כי יש יחס מאומת, אבל הוא מוצע רק כשאלה פתוחה. את התשובה כאן כותבת את, או מדלגת.',
    steps: [
      {
        moment: 'שמים ורודים',
        why: 'אין זוג: הרגע הראשון. (אותם שאלה, תשובה ושיקוף כמו בתרחיש "בלי זוג". רק סדר הבחירה התהפך.)',
        turns: [
          { kind: 'choose', picked: 'שמים ורודים', src: 'illustrative' },
          { kind: 'ask', text: SKY_ASK, src: 'illustrative' },
          { kind: 'answer', text: SKY_ANSWER, src: 'run' },
          SKY_REFLECT,
        ],
      },
      {
        moment: 'ניגון בפסנתר',
        why:
          'יש זוג, משני דימויים שונים (מקום וצליל). היחס מאומת: "שלא הכרתי" מול "מאוד מרגיע". לכן מוצעת שאלה פתוחה, בלי שום משפט שקובע שיש קשר. שני העוגנים הם בדיוק אלה שהמודל כתב בריצה, והשופט העיוור ב-doc 87 סימן את המועמדת הזו כמשמעותית.',
        turns: [
          { kind: 'choose', picked: 'ניגון בפסנתר', src: 'illustrative' },
          { kind: 'ask', text: PIANO_ASK, src: 'run' },
          { kind: 'answer', text: PIANO_ANSWER, src: 'run' },
          { kind: 'reflect', her: 'אמרת שזה היה רגע של שלווה שנשאר לך בראש.', src: 'run' },
          {
            kind: 'pair',
            intro: 'שני דברים מהרגע הזה, זה ליד זה:',
            a: { quote: 'ישבתי על מרפסת של דירה שלא הכרתי', from: 'dream' },
            b: { quote: 'הצליל היה מאוד מרגיע', from: 'answer' },
            question: 'מה את רואה כשהם עומדים יחד?',
            relation: 'negation',
            differentImages: true,
            src: 'run',
            answer: null,
          },
        ],
      },
      {
        moment: 'whole',
        why: 'המבט לא חוזר על "שלא הכרתי" ועל "מאוד מרגיע", שכבר הוצגו בזוג. אם ענית, הוא מביא את המילים שלך.',
        turns: [
          { kind: 'choose', picked: 'whole', src: 'illustrative' },
          {
            kind: 'whole',
            answered: ['בשני הרגעים חזרת אל הצליל: פעם הוא נפגש עם השמיים הוורודים, ופעם הוא השאיר לך רגע של שלווה.'],
            skipped: ['בשני הרגעים חזרת אל הצליל: פעם הוא נפגש עם השמיים הוורודים, ופעם הוא השאיר לך רגע של שלווה.'],
            question: INTIMATE_QUESTION,
            unexplored: [],
            src: 'illustrative',
          },
        ],
      },
    ],
  },
];

export const SOURCE_LABEL: Record<LineSource, string> = {
  run: 'מהריצה השמורה, מילה במילה',
  'run-short': 'מהריצה השמורה, מקוצר',
  spec: 'הנוסח של doc 90',
  illustrative: 'נכתב להמחשה',
  demo: 'מה שכתבת כאן, בלי AI',
};

/** The words DARE uses, by address. */
export function voice(address: Scenario['address']) {
  const m = address === 'masculine';
  return {
    first: m ? 'אלה הרגעים שעלו מהחלום שלך. בחר רגע להתחיל ממנו:' : 'אלה הרגעים שעלו מהחלום שלך. בחרי רגע להתחיל ממנו:',
    next: m ? 'בחר רגע נוסף, או בקש את המבט השלם:' : 'בחרי רגע נוסף, או בקשי את המבט השלם:',
    you: m ? 'אתה' : 'את',
    answer: m ? 'לענות' : 'לענות',
    skip: m ? 'לדלג' : 'לדלג',
    write: m ? 'כתוב כאן, במילים שלך' : 'כתבי כאן, במילים שלך',
    send: 'שליחה',
    saidPrefix: 'אמרת: ',
  };
}
