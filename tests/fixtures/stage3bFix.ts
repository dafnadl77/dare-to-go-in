/**
 * FAILURE CASES FOR THE STAGE 3B FIX ROUND (docs/upgrade-2026-10/30-stage3b-fix-plan.md). Written BEFORE the fix, and not edited
 * after it: the same cases are run against the old pipeline (they must fail there) and against the new one (they must pass).
 *
 * Most "bad" sentences are copied word for word from the last real run (docs/upgrade-2026-10/29-stage3b-final-5-raw.md); the others
 * are new cases of the same kinds (a flashback, a swapped actor, a flipped negation, a repeated question in other words). Each case
 * also carries what a model would DECLARE about its sentence (which part of the dream it rests on, its verb, who acted, on whom):
 * the declarations may be wrong on purpose, the checks must not trust them.
 *
 * "model" is what the model returned; "mustNotShow" are pieces of text that must never reach the dreamer; "mustShow" are correct
 * pieces that must survive (so a check that refuses everything fails too).
 */

export const DREAMS = {
  short: 'עמדתי בתחנת רכבת ריקה וחיכיתי. הרכבת לא הגיעה.',
  rich: 'הייתי בחתונה של חברה. כולם לבשו לבן ואני לבשתי שחור. אחי הקטן נתן לי מפתח ואמר שזה למקום שעוד לא הייתי בו. הלכנו לאורך החוף, והים התרחק ולא חזר. מישהו שר שיר שלא הכרתי, אבל ידעתי את כל המילים. כשהגענו לדלת, המפתח היה קטן מדי.',
  sensitive: 'רדפו אחריי במסדרון ארוך בבית חולים. הדלתות נסגרו אחת אחרי השנייה. בסוף הגעתי לחדר שבו אבא שלי ישן במיטה, ולא הצלחתי להעיר אותו.',
  /** Told out of order: the forest walk happened BEFORE the kitchen. */
  flashback: 'ישבתי במטבח עם סבתא שלי. לפני זה הלכתי לבד ביער. בסוף שתינו תה.',
  /** The same event twice in other words. */
  repeat: 'הדלת נסגרה מולי. ניסיתי לפתוח אותה. ושוב הדלת נסגרה מולי.',
  /** One event only: one moment, never padded. */
  single: 'ראיתי ציפור לבנה על חלון של בית ישן.',
} as const;
export type DreamKey = keyof typeof DREAMS;

/** "dreamer" = the one who dreamt; "unknown" = no one is named (an impersonal verb); "" = no one / not stated. */
export interface DreamClaimCase {
  /** A verbatim piece of the dream this sentence claims to rest on. */
  segmentText: string;
  /** The verb as the model copied it from the dream. */
  action: string;
  actor: string;
  target: string;
  text: string;
}
export interface UserClaimCase {
  quote: string;
  text: string;
}
/** basis: "d0" = model.dream[0], "u1" = model.user[1]. */
export interface PossibilityCase {
  basis: string[];
  text: string;
}

export interface ReplyCase {
  name: string;
  dream: DreamKey;
  momentText: string;
  question: string;
  answer: string;
  followUp?: { question: string; answer: string };
  model: { dream: DreamClaimCase[]; user: UserClaimCase[]; possibilities: PossibilityCase[] };
  mustNotShow: string[];
  mustShow: string[];
  /** interpretive = a possibility was shown; factual = only verified facts (no interpretation passed). */
  expectKind?: 'interpretive' | 'factual';
}

export const REPLY_CASES: ReplyCase[] = [
  {
    name: 'order invented: the key "came at the end, after the walk" (final-5, rich, step 1)',
    dream: 'rich',
    momentText: 'כשהגענו לדלת, המפתח היה קטן מדי',
    question: 'מה עולה ברגע שבו המפתח היה קטן מדי לדלת?',
    answer: 'זה מזכיר לי את התחושה של חוסר יכולת להשתתף במשהו חשוב, כמו כשאני מרגישה שאין לי מקום או שאני לא משתלבת.',
    model: {
      dream: [{ segmentText: 'המפתח היה קטן מדי', action: 'היה', actor: 'מפתח', target: '', text: 'המפתח הגיע בסוף הדרך אחרי הליכה משותפת לאורך החוף, והוא לא התאים לדלת.' }],
      user: [{ quote: 'אין לי מקום או שאני לא משתלבת', text: 'אמרת שזה הזכיר לך תחושה שאין לך מקום או שאת לא משתלבת.' }],
      possibilities: [{ basis: ['d0', 'u0'], text: 'אולי עצם זה שהגעת עד הדלת עם מפתח לא מתאים מדגיש תחושת מאמץ והשתתפות, אבל גם את הרגע שבו משהו חיצוני עוצר אותך מלהיכנס פנימה.' }],
    },
    mustNotShow: ['בסוף הדרך', 'אחרי הליכה', 'תחושת מאמץ'],
    mustShow: ['אין לך מקום'],
    expectKind: 'factual',
  },
  {
    name: 'the dreamer\'s own detail turned into the dream, and an invented "after" (final-5, rich, step 2)',
    dream: 'rich',
    momentText: 'הלכנו לאורך החוף, והים התרחק ולא חזר',
    question: 'כשהים התרחק ולא חזר, מה ראית שנשאר במקום שבו המים היו קודם?',
    answer: 'ראיתי חול רטוב עם שלוליות קטנות, כאילו משהו חשוב נעלם. זה מזכיר לי את התחושה שהייתה לי עם אחי, פעם.',
    followUp: { question: 'איזו תחושה בדיוק עלתה לך כשנזכרת במה שהיה עם אחיך?', answer: 'הרגשתי לבד ושאני מתגעגעת אליו. זה כמו שעוד חלק ממני חסר, במיוחד כשאני רואה חוויות שהוא לא חלק מהן.' },
    model: {
      dream: [
        { segmentText: 'והים התרחק ולא חזר', action: 'התרחק', actor: 'ים', target: '', text: 'הים התרחק והשאיר רק חול רטוב עם שלוליות קטנות, במקום שהיה מלא מים קודם.' },
        { segmentText: 'הלכנו לאורך החוף', action: 'הלכנו', actor: 'dreamer', target: '', text: 'זה קרה אחרי הליכה משותפת עם אחיך לאורך החוף.' },
      ],
      user: [
        { quote: 'ראיתי חול רטוב עם שלוליות קטנות', text: 'אמרת שראית חול רטוב ושלוליות' },
        { quote: 'הרגשתי לבד ושאני מתגעגעת אליו', text: 'ושהרגשת לבד וגעגוע לאחיך, כאילו משהו חסר.' },
      ],
      possibilities: [{ basis: ['d0', 'u1'], text: 'אולי הים שהתרחק ולא חזר נותן מקום לחסר ולגעגוע שתיארת.' }],
    },
    mustNotShow: ['והשאיר רק חול רטוב', 'אחרי הליכה משותפת', 'עם אחיך לאורך'],
    mustShow: ['חול רטוב ושלוליות', 'אולי הים שהתרחק'],
    expectKind: 'interpretive',
  },
  {
    name: 'the song moved to the wedding, and the singer swapped to the dreamer (final-5, rich, step 4)',
    dream: 'rich',
    momentText: 'כולם לבשו לבן ואני לבשתי שחור',
    question: 'כשכולם לבשו לבן ואת לבשת שחור, מה שמעת או ראית שם?',
    answer: 'שמתי לב שאני היחידה בשחור, וזה גרם לי להרגיש זרה בתוך כל השמחה.',
    model: {
      dream: [
        { segmentText: 'כולם לבשו לבן ואני לבשתי שחור', action: 'לבשו', actor: 'כולם', target: '', text: 'הייתה חתונה שבה כל הנוכחים לבשו לבן ורק את לבשת שחור, ובזמן הזה התנגנה מוזיקה לא מוכרת שידעת את המילים שלה.' },
        { segmentText: 'מישהו שר שיר שלא הכרתי', action: 'שר', actor: 'dreamer', target: '', text: 'בחתונה שרת שיר לא מוכר.' },
      ],
      user: [{ quote: 'זה גרם לי להרגיש זרה בתוך כל השמחה', text: 'אמרת שזה גרם לך להרגיש זרה בתוך כל השמחה.' }],
      possibilities: [{ basis: ['d0', 'u0'], text: 'אולי הלבן של כולם מול השחור שלך מבליט את התחושה שתיארת, להיות זרה בתוך השמחה.' }],
    },
    mustNotShow: ['התנגנה מוזיקה', 'שרת שיר'],
    mustShow: ['זרה בתוך כל השמחה', 'אולי הלבן של כולם'],
    expectKind: 'interpretive',
  },
  {
    name: 'invented silence, a flipped "could not wake him", "thought" for "felt", a diagnosis (final-5, sensitive, step 1)',
    dream: 'sensitive',
    momentText: 'בסוף הגעתי לחדר שבו אבא שלי ישן במיטה, ולא הצלחתי להעיר אותו',
    question: 'מה עולה כשחוזרים לרגע שבו אבא ישן ולא התעורר?',
    answer: 'אני מרגישה חרדה ולחץ. זה מזכיר לי את התקופה הקשה, ואני רוצה לדעת שהוא בסדר.',
    model: {
      dream: [
        { segmentText: 'בסוף הגעתי לחדר שבו אבא שלי ישן במיטה', action: 'ישן', actor: 'אבא', target: '', text: 'אחרי כל הריצה והדלתות הנסגרות, רק בחדר של אבא היה שקט והוא לא התעורר.' },
        { segmentText: 'ולא הצלחתי להעיר אותו', action: 'הצלחתי', actor: 'dreamer', target: 'אבא', text: 'הצלחת להעיר אותו בסוף.' },
        { segmentText: 'בסוף הגעתי לחדר שבו אבא שלי ישן במיטה', action: 'הגעתי', actor: 'dreamer', target: '', text: 'בסוף הגעת לחדר שבו אבא שלך ישן במיטה.' },
      ],
      user: [{ quote: 'אני מרגישה חרדה ולחץ', text: 'אמרת שחשבת על חרדה ולחץ.' }],
      possibilities: [
        { basis: ['d0'], text: 'אולי הרגע הזה הוא סימן לטראומה שלא טופלה.' },
        { basis: ['d2', 'u0'], text: 'אולי החרדה שתיארת פוגשת כאן את אבא שלא מתעורר, בלי דרך לדעת אם הוא בסדר.' },
      ],
    },
    mustNotShow: ['היה שקט', 'הצלחת להעיר אותו בסוף', 'חשבת על', 'טראומה'],
    mustShow: ['בסוף הגעת לחדר', 'חרדה ולחץ', 'אולי החרדה שתיארת'],
    expectKind: 'interpretive',
  },
  {
    name: 'the dreamer\'s "threatening" put into the dream, the chase swapped, an invented "weakness" (final-5, sensitive, step 3)',
    dream: 'sensitive',
    momentText: 'רדפו אחריי במסדרון ארוך בבית חולים',
    question: 'איך הרגיש בית החולים עצמו, כשעברת בו במסדרון הארוך?',
    answer: 'הרגשתי פחד וחוסר אונים. המסדרון היה כל כך ארוך ומאיים, כמו חזרה לתקופה קשה.',
    model: {
      dream: [
        { segmentText: 'רדפו אחריי במסדרון ארוך בבית חולים', action: 'רדפו', actor: 'unknown', target: 'dreamer', text: 'עברת במסדרון ארוך ומאיים בבית החולים, וכל הזמן הזה רדפו אחרייך.' },
        { segmentText: 'רדפו אחריי במסדרון ארוך בבית חולים', action: 'רדפו', actor: 'dreamer', target: 'unknown', text: 'רדפת אחרי מישהו במסדרון ארוך.' },
      ],
      user: [{ quote: 'המסדרון היה כל כך ארוך ומאיים', text: 'אמרת שהמסדרון היה ארוך ומאיים, כמו חזרה לתקופה קשה.' }],
      possibilities: [
        { basis: ['u0'], text: 'אולי הדרך הארוכה הדגישה את החולשה שחווית אז.' },
        { basis: ['d0', 'u0'], text: 'אולי האורך של המסדרון, כשרודפים אחרייך, נותן מקום לפחד ולחוסר האונים שתיארת.' },
      ],
    },
    mustNotShow: ['ארוך ומאיים בבית', 'וכל הזמן הזה', 'רדפת אחרי מישהו', 'החולשה'],
    mustShow: ['אמרת שהמסדרון היה ארוך ומאיים', 'אולי האורך של המסדרון'],
    expectKind: 'interpretive',
  },
  {
    name: 'who gave the key to whom (swapped), and a second sentence that states a "fact" (final-5, rich, step 3)',
    dream: 'rich',
    momentText: 'אחי הקטן נתן לי מפתח ואמר שזה למקום שעוד לא הייתי בו',
    question: 'מה עלה בך כשאחיך הקטן נתן לך את המפתח?',
    answer: 'הרגע הזה היה כמו חיבור מחדש, אבל גם כאב לי בגלל המרחק.',
    model: {
      dream: [
        { segmentText: 'אחי הקטן נתן לי מפתח', action: 'נתן', actor: 'אח', target: 'dreamer', text: 'אחיך הקטן נתן לך מפתח למקום שעוד לא היית בו.' },
        { segmentText: 'אחי הקטן נתן לי מפתח', action: 'נתן', actor: 'dreamer', target: 'אח', text: 'נתת לאחיך מפתח.' },
      ],
      user: [{ quote: 'היה כמו חיבור מחדש', text: 'אמרת שזה היה כמו חיבור מחדש, וגם כאב בגלל המרחק.' }],
      possibilities: [
        { basis: ['d0', 'u0'], text: 'אולי המפתח מדגיש את הקשר ביניכם. המפתח פותח מסע אל מקום חדש.' },
        { basis: ['d0', 'u0'], text: 'אולי המפתח מאחיך מחזיק גם את החיבור וגם את המרחק שתיארת.' },
      ],
    },
    mustNotShow: ['נתת לאחיך', 'פותח מסע'],
    mustShow: ['אחיך הקטן נתן לך מפתח', 'אולי המפתח מאחיך'],
    expectKind: 'interpretive',
  },
  {
    name: 'a feeling she never said ("belonging"), given back as hers',
    dream: 'rich',
    momentText: 'מישהו שר שיר שלא הכרתי, אבל ידעתי את כל המילים',
    question: 'מה היה בשיר שלא הכרת, כשבכל זאת ידעת את כל המילים?',
    answer: 'זה הרגיש מוכר וזר בבת אחת.',
    model: {
      dream: [{ segmentText: 'מישהו שר שיר שלא הכרתי', action: 'שר', actor: 'מישהו', target: '', text: 'מישהו שר שיר שלא הכרת.' }],
      user: [{ quote: 'זה הרגיש מוכר וזר בבת אחת', text: 'אמרת שהשיר גרם לך להרגיש שייכת.' }],
      possibilities: [{ basis: ['d0'], text: 'אולי השיר שלא הכרת, כשאת יודעת את כל המילים, מחזיק יחד את המוכר ואת הזר.' }],
    },
    mustNotShow: ['שייכת'],
    mustShow: ['מישהו שר שיר', 'אולי השיר'],
    expectKind: 'interpretive',
  },
  {
    name: 'a flashback: the story order is not the order of events (new case)',
    dream: 'flashback',
    momentText: 'לפני זה הלכתי לבד ביער',
    question: 'מה היה ביער כשהלכת בו לבד?',
    answer: 'היה ביער שקט ונעים, הרגשתי חופשייה.',
    model: {
      dream: [{ segmentText: 'לפני זה הלכתי לבד ביער', action: 'הלכתי', actor: 'dreamer', target: '', text: 'אחרי שישבת במטבח עם סבתא שלך, הלכת לבד ביער.' }],
      user: [{ quote: 'הרגשתי חופשייה', text: 'אמרת שהרגשת חופשייה.' }],
      possibilities: [{ basis: ['u0'], text: 'אולי ההליכה לבד ביער נותנת מקום לחופש שתיארת.' }],
    },
    mustNotShow: ['אחרי שישבת'],
    mustShow: ['אמרת שהרגשת חופשייה'],
    expectKind: 'interpretive',
  },
  {
    name: 'a flipped negation: the train "came late" (new case)',
    dream: 'short',
    momentText: 'הרכבת לא הגיעה',
    question: 'מה עולה ברגע שבו הרכבת לא הגיעה?',
    answer: 'תסכול, כמו לחכות לתשובה שלא מגיעה.',
    model: {
      dream: [{ segmentText: 'הרכבת לא הגיעה', action: 'הגיעה', actor: 'רכבת', target: '', text: 'הרכבת הגיעה באיחור.' }],
      user: [{ quote: 'תסכול, כמו לחכות לתשובה שלא מגיעה', text: 'אמרת שזה תסכול, כמו לחכות לתשובה שלא מגיעה.' }],
      possibilities: [{ basis: ['u0'], text: 'אולי הרכבת שלא הגיעה פוגשת את התסכול שתיארת, של תשובה שלא מגיעה.' }],
    },
    mustNotShow: ['באיחור'],
    mustShow: ['תשובה שלא מגיעה'],
    expectKind: 'interpretive',
  },
];

// ------------------------------------------------------------------------------------------------ whole views

export interface ExploredCase {
  momentText: string;
  question: string;
  answer: string;
  followUp?: { question: string; answer: string };
}
export interface OverviewClaimCase {
  source: 'dream' | 'user' | 'interpretation';
  /** dream */
  segmentText?: string;
  action?: string;
  actor?: string;
  target?: string;
  /** user: the index of the explored moment and a verbatim piece of what she said there */
  moment?: number;
  quote?: string;
  /** interpretation: "o0" = overview[0] */
  basis?: string[];
  text: string;
}
export interface WholeCase {
  name: string;
  dream: DreamKey;
  explored: ExploredCase[];
  /** Moments offered but not explored (by their dream text). */
  unexplored: string[];
  model: {
    overview: OverviewClaimCase[];
    connections: { from: number; to: number; title: string; fromQuote: string; toQuote: string; link: string }[];
    recurring: { element: string; text: string; quotes: { moment: number; quote: string }[] } | null;
    contrast: { text: string; quotes: { moment: number; quote: string }[] } | null;
    readings: { segmentText: string; text: string }[];
    closing: { text: string; moment: number | null; quote: string };
  };
  mustNotShow: string[];
  mustShow: string[];
  expectKind?: 'whole' | 'first-look' | 'no-link' | 'factual-summary';
}

const RICH_KEY: ExploredCase = {
  momentText: 'כשהגענו לדלת, המפתח היה קטן מדי',
  question: 'מה עולה ברגע שבו המפתח היה קטן מדי לדלת?',
  answer: 'זה מזכיר לי את התחושה של חוסר יכולת להשתתף במשהו חשוב, כמו כשאני מרגישה שאין לי מקום או שאני לא משתלבת.',
};
const RICH_SEA: ExploredCase = {
  momentText: 'הלכנו לאורך החוף, והים התרחק ולא חזר',
  question: 'כשהים התרחק ולא חזר, מה ראית שנשאר במקום שבו המים היו קודם?',
  answer: 'ראיתי חול רטוב עם שלוליות קטנות, כאילו משהו חשוב נעלם. זה מזכיר לי את התחושה שהייתה לי עם אחי, פעם.',
  followUp: { question: 'איזו תחושה בדיוק עלתה לך כשנזכרת במה שהיה עם אחיך?', answer: 'הרגשתי לבד ושאני מתגעגעת אליו. זה כמו שעוד חלק ממני חסר, במיוחד כשאני רואה חוויות שהוא לא חלק מהן.' },
};
const RICH_CLOTHES: ExploredCase = {
  momentText: 'כולם לבשו לבן ואני לבשתי שחור',
  question: 'כשכולם לבשו לבן ואת לבשת שחור, מה שמעת או ראית שם?',
  answer: 'שמתי לב שאני היחידה בשחור, וזה גרם לי להרגיש זרה בתוך כל השמחה.',
};
const RICH_BROTHER: ExploredCase = {
  momentText: 'אחי הקטן נתן לי מפתח ואמר שזה למקום שעוד לא הייתי בו',
  question: 'מה עלה בך כשאחיך הקטן נתן לך את המפתח?',
  answer: 'הרגע הזה היה כמו חיבור מחדש, אבל גם כאב לי בגלל המרחק.',
};

export const WHOLE_CASES: WholeCase[] = [
  {
    name: 'two moments: an invented "after" and "with your brother", a contrast with invented words, a reading on a moment not explored (final-5, rich, first whole view)',
    dream: 'rich',
    explored: [RICH_KEY, RICH_SEA],
    unexplored: ['הייתי בחתונה של חברה', 'כולם לבשו לבן ואני לבשתי שחור', 'אחי הקטן נתן לי מפתח ואמר שזה למקום שעוד לא הייתי בו', 'מישהו שר שיר שלא הכרתי, אבל ידעתי את כל המילים'],
    model: {
      overview: [
        { source: 'dream', segmentText: 'הלכנו לאורך החוף', action: 'הלכנו', actor: 'dreamer', target: '', text: 'שני הרגעים מופיעים אחרי דרך משותפת עם אחיך.' },
        { source: 'user', moment: 0, quote: 'אין לי מקום', text: 'ברגע של המפתח אמרת שאין לך מקום.' },
        { source: 'interpretation', basis: ['o1'], text: 'אולי בשני הרגעים משהו נעצר באמצע הדרך.' },
      ],
      connections: [{ from: 0, to: 1, title: 'חסר ושייכות', fromQuote: 'אין לי מקום', toQuote: 'הרגשתי לבד', link: 'אולי בשני הרגעים עולה חסר: מקום שאין לך, ואח שחסר לך.' }],
      recurring: null,
      contrast: { text: 'רגע הים נשאר עם שלוליות, ואילו המפתח הקטן עוצר אותך כולך.', quotes: [{ moment: 1, quote: 'שלוליות קטנות' }, { moment: 0, quote: 'המפתח היה קטן מדי' }] },
      readings: [{ segmentText: 'כולם לבשו לבן ואני לבשתי שחור', text: 'אולי הבגדים השונים בתחילת החלום מרמזים מראש לתחושת הבדל.' }],
      closing: { text: 'איפה את פוגשת היום מקומות שבהם אין לך מקום?', moment: 0, quote: 'אין לי מקום' },
    },
    // Corrected before the fix was written (and reported): the first version required the title "חסר ושייכות" to be shown, but
    // "שייכות" is a feeling the dreamer never named ("אין לי מקום", "לא משתלבת"), so the title must not be shown as it is.
    mustNotShow: ['אחרי דרך משותפת', 'עוצר אותך כולך', 'הבגדים השונים', 'שייכות'],
    mustShow: ['עולה חסר', 'אין לך מקום'],
    expectKind: 'whole',
  },
  {
    name: 'four moments: "you sang", a forced "always", foreignness attributed to the brother, belonging she never said (final-5, rich, update)',
    dream: 'rich',
    explored: [RICH_KEY, RICH_SEA, RICH_CLOTHES, RICH_BROTHER],
    unexplored: ['הייתי בחתונה של חברה', 'מישהו שר שיר שלא הכרתי, אבל ידעתי את כל המילים'],
    model: {
      overview: [
        { source: 'user', moment: 2, quote: 'זרה בתוך כל השמחה', text: 'בחתונה את בלבוש אחר ושרה שיר לא מוכר, זרה מתוך שמחה.' },
        { source: 'interpretation', basis: [], text: 'אלה רגעים של ביחד שמתערבבים תמיד עם תחושת חוץ או חסר, מתחילת המסע ועד סופו.' },
        { source: 'user', moment: 3, quote: 'היה כמו חיבור מחדש', text: 'עם אחיך אמרת שזה היה כמו חיבור מחדש.' },
      ],
      connections: [{ from: 2, to: 3, title: 'חיבור ומרחק', fromQuote: 'זרה בתוך כל השמחה', toQuote: 'כאב לי בגלל המרחק', link: 'אולי גם בחתונה וגם עם אחיך יש זרות או מרחק לצד השמחה והחיבור.' }],
      recurring: { element: 'זרות', text: 'תחושת זרות חוזרת: בחתונה, מול הדלת, וגם מול אחיך.', quotes: [{ moment: 2, quote: 'זרה בתוך כל השמחה' }, { moment: 0, quote: 'שאני לא משתלבת' }, { moment: 3, quote: 'כאב לי בגלל המרחק' }] },
      contrast: { text: 'בחתונה הרגשת זרה אבל שייכת פנימה דרך השיר.', quotes: [{ moment: 2, quote: 'זרה בתוך כל השמחה' }] },
      readings: [],
      closing: { text: 'איפה את מרגישה היום חיבור שיש בו גם כאב, כמו שתיארת עם אחיך?', moment: 3, quote: 'כאב לי' },
    },
    mustNotShow: ['ושרה שיר', 'מתחילת המסע ועד סופו', 'וגם מול אחיך', 'שייכת פנימה'],
    mustShow: ['חיבור ומרחק', 'חיבור שיש בו גם כאב'],
    expectKind: 'whole',
  },
  {
    name: '"I don\'t know" used as evidence, and invented silence (final-5, sensitive)',
    dream: 'sensitive',
    explored: [
      { momentText: 'רדפו אחריי במסדרון ארוך בבית חולים', question: 'איך הרגיש המסדרון שבו רדפו אחרייך?', answer: 'הרגשתי פחד וחוסר אונים. המסדרון היה כל כך ארוך ומאיים, כמו חזרה לתקופה קשה.' },
      { momentText: 'הדלתות נסגרו אחת אחרי השנייה', question: 'מה נשאר פתוח בשבילך כשהדלתות נסגרו?', answer: 'לא יודעת.' },
      { momentText: 'בסוף הגעתי לחדר שבו אבא שלי ישן במיטה, ולא הצלחתי להעיר אותו', question: 'מה עולה כשחוזרים לרגע שבו אבא ישן ולא התעורר?', answer: 'אני מרגישה חרדה ולחץ. זה מזכיר לי את התקופה הקשה, ואני רוצה לדעת שהוא בסדר.' },
    ],
    unexplored: [],
    model: {
      overview: [
        { source: 'user', moment: 2, quote: 'רוצה לדעת שהוא בסדר', text: 'הרצון לדעת שהוא בסדר פגש שקט בלתי משתנה.' },
        { source: 'dream', segmentText: 'הדלתות נסגרו אחת אחרי השנייה', action: 'נסגרו', actor: 'דלתות', target: '', text: 'הדלתות נסגרו אחת אחרי השנייה.' },
      ],
      connections: [
        { from: 2, to: 1, title: 'המעבר לבלי מענה', fromQuote: 'רוצה לדעת שהוא בסדר', toQuote: 'לא יודעת', link: 'אולי מה שלא ידעת ברגע הדלתות הוא מה שחיפשת אצל אבא.' },
        { from: 0, to: 2, title: 'התקופה הקשה', fromQuote: 'כמו חזרה לתקופה קשה', toQuote: 'מזכיר לי את התקופה הקשה', link: 'אולי המסדרון והחדר של אבא מחזירים שניהם לאותה תקופה קשה.' },
      ],
      recurring: { element: 'תקופה קשה', text: 'התקופה הקשה חוזרת גם במסדרון וגם בחדר של אבא.', quotes: [{ moment: 0, quote: 'כמו חזרה לתקופה קשה' }, { moment: 2, quote: 'מזכיר לי את התקופה הקשה' }] },
      contrast: null,
      readings: [{ segmentText: 'הדלתות נסגרו אחת אחרי השנייה', text: 'אפשר לראות בדלתות שנסגרות אחת אחרי השנייה דרך שהולכת ונעשית צרה.' }],
      closing: { text: 'כשחוזרים לתקופה הקשה שתיארת, מה עומד שם במרכז?', moment: 0, quote: 'חזרה לתקופה קשה' },
    },
    mustNotShow: ['המעבר לבלי מענה', 'פגש שקט'],
    mustShow: ['התקופה הקשה חוזרת', 'מה עומד שם במרכז'],
    expectKind: 'whole',
  },
  {
    name: 'one moment: never "the whole picture", never a link, and an invitation to go on (final-5, short)',
    dream: 'short',
    explored: [{ momentText: 'עמדתי בתחנת רכבת ריקה וחיכיתי', question: 'איך היה לעמוד ולחכות בתחנה הריקה?', answer: 'זה מרגיש כמו חוסר ודאות וציפייה ממושכת.' }],
    unexplored: ['הרכבת לא הגיעה'],
    model: {
      overview: [
        { source: 'interpretation', basis: [], text: 'זו התמונה השלמה של החלום: חיכית למשהו שלא בא.' },
        { source: 'user', moment: 0, quote: 'חוסר ודאות וציפייה ממושכת', text: 'אמרת שזה מרגיש כמו חוסר ודאות וציפייה ממושכת.' },
        { source: 'interpretation', basis: ['o1'], text: 'אולי ההמתנה בתחנה הריקה נותנת מקום לחוסר הוודאות שתיארת.' },
      ],
      connections: [{ from: 0, to: 0, title: 'המתנה', fromQuote: 'ציפייה ממושכת', toQuote: 'ציפייה ממושכת', link: 'אולי ההמתנה חוזרת.' }],
      recurring: null,
      contrast: null,
      readings: [],
      closing: { text: 'מה עולה כשחושבים על ציפייה ממושכת?', moment: 0, quote: 'ציפייה ממושכת' },
    },
    mustNotShow: ['התמונה השלמה'],
    mustShow: ['אולי ההמתנה בתחנה הריקה', 'הרכבת לא הגיעה'],
    expectKind: 'first-look',
  },
  {
    name: 'every part fails: a verified factual summary, clearly not the whole view (new case)',
    dream: 'rich',
    explored: [RICH_KEY, RICH_SEA],
    unexplored: [],
    model: {
      overview: [{ source: 'dream', segmentText: 'הלכנו לאורך החוף', action: 'הלכנו', actor: 'dreamer', target: '', text: 'אחרי שהלכתם עם אחיך, הים נעלם לתמיד.' }],
      connections: [{ from: 0, to: 1, title: 'נטישה', fromQuote: 'הרגשתי נטושה', toQuote: 'הוא עזב אותי', link: 'שני הרגעים הם נטישה.' }],
      recurring: null,
      contrast: null,
      readings: [],
      closing: { text: 'מתי נטשו אותך?', moment: null, quote: '' },
    },
    mustNotShow: ['נטישה', 'הים נעלם לתמיד', 'מתי נטשו אותך'],
    mustShow: ['לא המבט השלם', 'אין לי מקום'],
    expectKind: 'factual-summary',
  },
];

// ------------------------------------------------------------------------------------------------ questions

export type Focus = 'feeling' | 'sense' | 'figure' | 'action' | 'detail' | 'change' | 'memory';
export interface QuestionCase {
  name: string;
  dream: DreamKey;
  momentText: string;
  prior: { momentText: string; question: string; answer: string; focus?: Focus; subject?: string }[];
  /** The candidates the model returned, in order. */
  model: { question: string; focus: Focus; subject: string; buildsOn: string }[];
  mustNotShow: string[];
  mustShow: string[];
}

export const QUESTION_CASES: QuestionCase[] = [
  {
    name: 'presupposes the key was given at the door (final-5, rich, first question)',
    dream: 'rich',
    momentText: 'כשהגענו לדלת, המפתח היה קטן מדי',
    prior: [],
    model: [{ question: 'מה מזכיר הרגע שבו המפתח שניתן בדלת מתגלה כקטן מדי?', focus: 'memory', subject: 'מפתח', buildsOn: '' }],
    mustNotShow: ['שניתן בדלת'],
    mustShow: [],
  },
  {
    name: '"my brother" in a question to her, too long, a conversation the dream never had (final-5, rich)',
    dream: 'rich',
    momentText: 'אחי הקטן נתן לי מפתח ואמר שזה למקום שעוד לא הייתי בו',
    prior: [{ momentText: 'הלכנו לאורך החוף, והים התרחק ולא חזר', question: 'כשהים התרחק ולא חזר, מה ראית שנשאר במקום?', answer: 'חול רטוב ושלוליות, כמו משהו שנעלם.', focus: 'sense', subject: 'ים' }],
    model: [
      { question: 'כשאחי הקטן נתן לך את המפתח למקום שעוד לא היית בו, מה היה הרגע הזה בשבילך בשיחה או בקשר ביניכם?', focus: 'figure', subject: 'אח', buildsOn: '' },
      { question: 'מה עלה בך כשאחיך הקטן נתן לך את המפתח?', focus: 'figure', subject: 'אח', buildsOn: '' },
    ],
    mustNotShow: ['כשאחי הקטן'],
    mustShow: ['מה עלה בך כשאחיך הקטן נתן לך את המפתח?'],
  },
  {
    name: 'the same question in other words: a feeling about the train again (new case)',
    dream: 'short',
    momentText: 'עמדתי בתחנת רכבת ריקה וחיכיתי',
    prior: [{ momentText: 'הרכבת לא הגיעה', question: 'מה הרגשת כשהרכבת לא הגיעה?', answer: 'תסכול.', focus: 'feeling', subject: 'רכבת' }],
    model: [
      { question: 'איזו תחושה עלתה בך כשחיכית לרכבת בתחנה הריקה?', focus: 'detail', subject: 'רכבת', buildsOn: '' },
      { question: 'מה ראית סביבך בתחנה הריקה?', focus: 'sense', subject: 'תחנה', buildsOn: '' },
    ],
    mustNotShow: ['איזו תחושה עלתה בך'],
    mustShow: ['מה ראית סביבך בתחנה הריקה?'],
  },
  {
    name: 'asks what she already answered, as a yes/no question (new case)',
    dream: 'rich',
    momentText: 'אחי הקטן נתן לי מפתח ואמר שזה למקום שעוד לא הייתי בו',
    prior: [{ momentText: 'הלכנו לאורך החוף, והים התרחק ולא חזר', question: 'איזו תחושה עלתה לך כשנזכרת במה שהיה עם אחיך?', answer: 'הרגשתי לבד ושאני מתגעגעת אליו.', focus: 'feeling', subject: 'אח' }],
    model: [
      { question: 'האם הרגשת לבד כשאחיך נתן לך את המפתח?', focus: 'feeling', subject: 'אח', buildsOn: 'הרגשתי לבד' },
      { question: 'מה אחיך אמר לך כשנתן לך את המפתח?', focus: 'action', subject: 'מפתח', buildsOn: '' },
    ],
    mustNotShow: ['האם הרגשת לבד'],
    mustShow: ['מה אחיך אמר לך כשנתן לך את המפתח?'],
  },
  {
    name: 'puts the closing doors in a room the dream never placed them in (new case)',
    dream: 'sensitive',
    momentText: 'הדלתות נסגרו אחת אחרי השנייה',
    prior: [],
    model: [
      { question: 'מה ראית בחדר כשהדלתות נסגרו?', focus: 'sense', subject: 'דלתות', buildsOn: '' },
      { question: 'מה שמעת או ראית כשהדלתות נסגרו אחת אחרי השנייה?', focus: 'sense', subject: 'דלתות', buildsOn: '' },
    ],
    mustNotShow: ['בחדר כשהדלתות'],
    mustShow: ['מה שמעת או ראית כשהדלתות נסגרו אחת אחרי השנייה?'],
  },
];

// ------------------------------------------------------------------------------------------------ moments and labels

export interface MomentCase {
  name: string;
  dream: DreamKey;
  /** The captured real analysis (tests/fixtures/analysis-<key>.json), or a minimal one built from the text for the new dreams. */
  analysis: 'short' | 'rich' | 'sensitive' | null;
  /** Pieces of the dream that some offered moment must cover. */
  mustCover: string[];
  maxMoments: number;
}

export const MOMENT_CASES: MomentCase[] = [
  { name: 'short: the train that did not arrive is a moment of its own', dream: 'short', analysis: 'short', mustCover: ['הרכבת לא הגיעה', 'עמדתי בתחנת רכבת ריקה וחיכיתי'], maxMoments: 2 },
  { name: 'rich: the unknown song and the clothes are moments; no two moments on the same sentence', dream: 'rich', analysis: 'rich', mustCover: ['מישהו שר שיר שלא הכרתי', 'כולם לבשו לבן', 'המפתח היה קטן מדי', 'הים התרחק', 'אחי הקטן נתן לי מפתח'], maxMoments: 6 },
  { name: 'sensitive: the closing doors are a moment; father, room and "could not wake him" are one moment, not three', dream: 'sensitive', analysis: 'sensitive', mustCover: ['הדלתות נסגרו אחת אחרי השנייה', 'רדפו אחריי', 'לא הצלחתי להעיר אותו'], maxMoments: 3 },
  { name: 'repeat: the same event told twice in other words is one moment', dream: 'repeat', analysis: null, mustCover: ['הדלת נסגרה מולי', 'ניסיתי לפתוח אותה'], maxMoments: 2 },
  { name: 'single: one event is one moment, never padded', dream: 'single', analysis: null, mustCover: ['ראיתי ציפור לבנה'], maxMoments: 1 },
];

export interface LabelCase {
  momentText: string;
  /** What the labels model returned. */
  candidate: string;
  mustNotShow: string[];
  /** A good label must be kept exactly. */
  keep?: boolean;
}

export const LABEL_CASES: LabelCase[] = [
  { momentText: 'עמדתי בתחנת רכבת ריקה וחיכיתי', candidate: 'חיכיתי לרכבת', mustNotShow: ['חיכיתי'] },
  { momentText: 'אחי הקטן נתן לי מפתח ואמר שזה למקום שעוד לא הייתי בו', candidate: 'אחי הקטן', mustNotShow: ['אחי '] },
  { momentText: 'בסוף הגעתי לחדר שבו אבא שלי ישן במיטה, ולא הצלחתי להעיר אותו', candidate: 'לא הצלחתי להעיר', mustNotShow: ['הצלחתי'] },
  { momentText: 'הרכבת לא הגיעה', candidate: 'הרכבת שלא הגיעה', mustNotShow: [], keep: true },
];
