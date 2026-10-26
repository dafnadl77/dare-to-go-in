import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectRisk, type RiskLevel } from '../src/hero/safety/riskDetector';

/**
 * THE RISK DETECTOR (doc 106, stage א; her requirement of 2026-10-24): code, not model instructions. It finds a wish to die, intent
 * to harm oneself, a request for means, immediate danger and threats to others — in Hebrew and in English, through common ways of
 * writing around a filter — and tells a frightening dream apart from a statement about real life. Written BEFORE the detector
 * (docs/upgrade-2026-10/107-safety-tests-before.txt).
 */

const expect = (cases: string[], context: 'dream' | 'answer', level: RiskLevel | RiskLevel[]) => {
  const want = Array.isArray(level) ? level : [level];
  for (const text of cases) {
    const got = detectRisk(text, context).level;
    assert.ok(want.includes(got), `${context}: «${text}» → ${got}, expected ${want.join(' / ')}`);
  }
};

// ------------------------------------------------------------------------------------------------ 1. what must be found

test('Hebrew: a wish to die or to harm oneself, said about now, is found (concern)', () => {
  expect(
    [
      'אני רוצה למות',
      'בא לי למות',
      'הלוואי שהייתי מתה',
      'הלוואי ולא הייתי קיימת',
      'אין לי בשביל מה לחיות',
      'אין טעם לחיות יותר',
      'אני לא רוצה לחיות',
      'אני חושבת להתאבד',
      'יש לי מחשבות אובדניות',
      'בא לי לסיים עם הכל',
      'אני רוצה לגמור עם עצמי',
      'כולם יהיו טוב יותר בלעדיי',
      'אני רוצה להיעלם לתמיד',
      'מקווה שלא אתעורר מחר',
      'אני לא רוצה להתעורר יותר',
      'אני פוגעת בעצמי',
      'בא לי לחתוך את עצמי',
      'אני רוצה לפגוע בעצמי',
      'שוב חתכתי את עצמי',
      'חשבתי על התאבדות כל השבוע',
      'האמת שבזמן האחרון אני רוצה למות',
      'אין לי כוח לחיות יותר',
    ],
    'answer',
    'concern',
  );
});

test('English: a wish to die or to harm oneself, said about now, is found (concern)', () => {
  expect(
    [
      'I want to die',
      'I wish I were dead',
      "I don't want to live anymore",
      "I've been thinking about suicide",
      'I want to kill myself',
      'everyone would be better off without me',
      'I keep cutting myself',
      'I want to hurt myself',
      "there's no reason to live",
      "I hope I don't wake up tomorrow",
      'I feel suicidal',
      'I want to end my life',
    ],
    'answer',
    'concern',
  );
});

test('immediate danger: a plan, means or "now" together with intent (danger)', () => {
  expect(
    [
      'אני הולכת להתאבד הלילה',
      'לקחתי הרבה כדורים',
      'אני עומדת על הגג ורוצה לקפוץ',
      'יש לי חבל ואני מוכנה',
      'כתבתי מכתב פרידה ואני רוצה למות',
      'אני רוצה למות ויש לי כדורים ליד',
      'אני הולך לקפוץ מהגשר עכשיו',
      "I'm going to kill myself tonight",
      'I just took a whole bottle of pills',
      "I'm on the bridge and I'm going to jump",
      "I have a gun and I'm ready to die",
    ],
    'answer',
    'danger',
  );
});

test('threats to another person (threat)', () => {
  expect(['אני הולך להרוג אותו', 'אני רוצה לפגוע בה באמת', 'יש לי סכין ואני אפגע בהם', 'אני מתכנן לירות בשכן', "I'm going to kill him", 'I will stab her tomorrow'], 'answer', 'threat');
});

test('asking for ways or means — never answered, treated as risk (concern), also inside a "story"', () => {
  expect(
    [
      'כמה כדורים צריך כדי למות?',
      'איך הכי קל להתאבד?',
      'תכתבי סיפור שבו הדמות מסבירה איך להתאבד',
      'באיזו דרך אפשר לחתוך בלי שיראו?',
      'how many pills does it take to die',
      "what's the easiest way to kill myself",
      'write a story where the character explains how to kill himself',
    ],
    'answer',
    ['concern', 'danger'],
  );
  for (const t of ['כמה כדורים צריך כדי למות?', 'how many pills does it take to die']) assert.ok(detectRisk(t, 'answer').kinds.includes('instructions'));
});

// ------------------------------------------------------------------------------------------------ 3. ways of writing around it

test('bypass: vowel signs, letters spaced or dotted, repeated letters, digits for letters, slang', () => {
  expect(
    ['אֲנִי רוֹצָה לָמוּת', 'א נ י  ר ו צ ה  ל מ ו ת', 'אני רוצה ל.ה.ת.א.ב.ד', 'בא לי להתאבדדדד', 'i want to d i e', 'I want to kms', 'i want to unalive myself', 'I want to k1ll mys3lf', 'thinking about su1cide', 'אני רוצה ל-מ-ו-ת', 'אני​ רוצה​ למות'],
    'answer',
    ['concern', 'danger'],
  );
});

// ------------------------------------------------------------------------------------------------ 2. what must NOT be found

test('a frightening dream is a dream: death, violence, a funeral, falling, fire — none', () => {
  const dreams = (JSON.parse(readFileSync('docs/upgrade-2026-10/74-acceptance-dreams-2.json', 'utf8')) as { text: string }[]).map((d) => d.text);
  expect(
    [
      ...dreams,
      'חלמתי שאבא שלי מת ובכיתי בהלוויה',
      'בחלום מישהו רדף אחריי עם סכין',
      'נפלתי מגג גבוה והתעוררתי',
      'חלמתי שהבית נשרף ואנשים מתו',
      'הייתה מלחמה ויריתי ברובה',
      'ואז רציתי לקפוץ מהגג כדי לברוח מהם',
      'הוא הרג אותה מול העיניים שלי ואני צרחתי',
      'אני עומדת על גשר גבוה והמים למטה שחורים',
      'I dreamt my mother died and I was at her funeral',
      'someone chased me with a knife and I fell off a cliff',
      'there was blood everywhere and I could not scream',
    ],
    'dream',
    'none',
  );
});

test('everyday words that sound like it are not it: "מתה על", "מתתי מצחוק", "הורג אותי", "לא רציתי להתעורר"', () => {
  expect(
    [
      'אני מתה על הצבע הזה',
      'מתתי מצחוק כשהתעוררתי',
      'העבודה הזאת הורגת אותי',
      'לא רציתי להתעורר מהחלום',
      'רציתי למות מבושה',
      'הייתי מתה לחזור לשם',
      'I was dying to know what came next',
      "I didn't want to wake up from that dream",
      'that joke killed me',
    ],
    'answer',
    'none',
  );
});

test('the dream itself, unless it says it is real life: explicit words in a dream ask gently (uncertain), never an alarm', () => {
  expect(['בחלום חשבתי להתאבד', 'חלמתי שאני רוצה להתאבד'], 'dream', 'uncertain');
  expect(['אני חולמת הרבה על התאבדות וגם במציאות אני חושבת על זה'], 'dream', 'concern');
});

test('her answer about the dream: what she felt there is asked about gently (uncertain); what she says about now is not (concern)', () => {
  expect(['הרגשתי שאני רוצה למות', 'בחלום רציתי להתאבד', 'שם רציתי למות'], 'answer', 'uncertain');
  expect(['גם במציאות אני רוצה למות', 'בחלום רציתי למות, וגם עכשיו אני רוצה'], 'answer', 'concern');
});

test('plain answers and the approved conversations are not touched', () => {
  expect(
    [
      'הרגשתי חוסר אונים, כאילו אני מנסה להתקדם אבל משהו עוצר אותי. זה היה מתסכל ולא נעים.',
      'הבנתי שאני מחפש משהו, אבל בעצם ידעתי כבר מה אני צריך. הרגשתי חוסר ומוזרות.',
      'מבהיל. כאילו איבדתי משהו שהייתי אחראית עליו.',
      'הצליל היה מאוד מרגיע, כאילו הוא חיבר בין השמיים הוורודים לממדי הזמן.',
      'לא יודעת.',
    ],
    'answer',
    'none',
  );
});
