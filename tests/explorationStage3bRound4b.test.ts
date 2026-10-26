import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/hero/claimCheck.ts';
import * as S from '../src/hero/dreamSegments.ts';
import * as H from '../src/hero/hebrewText.ts';

/**
 * STAGE 3B, ROUND 4B (after docs/upgrade-2026-10/41 and 42): focused tests written BEFORE the fix, run first against the round-4 code
 * (docs/upgrade-2026-10/43-stage3b-round4b-tests-before.txt). The questions marked "sealed-N" are what the sealed run really produced.
 *  1-2. a question may not take something from the dream as happening in her waking life, with or without a person from the dream;
 *       an open question about a possible link ("אם בכלל", "מה זה מזכיר לך") stays welcome.
 *  3.   the stricter interpretation rules do not refuse possibilities that rest on her own words (her cause, her wish, her feeling).
 *  4.   her sentence given back naturally, meaning untouched: no word added beyond "אמרת ש", nothing dropped, no feeling or negation changed.
 * New functions through namespace imports.
 */

const SEALED1 = 'חלמתי שחיכיתי בתור ארוך לקופה בסופר, ובכל פעם שהגיע תורי הקופאית קמה והלכה. בסוף התור נגמר, ואף אחד לא חזר לשבת מאחורי הקופה.';
const SEALED2 =
  'הייתי בדירה של אמא שלי, והיא ארזה את כל הבית לקרטונים כי היא עוברת לגור במקום אחר. אחי עמד בפינה ולא עזר, ורק אמר לי בשקט שאני תמיד מגיעה כשכבר מאוחר מדי. דודה שלי, שלא דיברנו כבר שנים, נתנה לי צעיף צמר אדום ואמרה שהוא היה שלי כשהייתי קטנה. כשכרכתי אותו על הצוואר הוא התחיל להיות חם וכבד, ולאט לאט הפך לחול רטוב שנזל לי בין האצבעות. אמא שלי המשיכה לארוז כאילו כלום לא קרה. אני עמדתי שם מבולבלת וניסיתי לאסוף את החול לתוך אחד הקרטונים, ולא הצלחתי לבכות למרות שרציתי.';
const SEALED3 =
  'אני בגינה ציבורית ליד הבית שגדלתי בו ויושבת על ספסל עם השכנה מהקומה למטה וחברה שלי מהתיכון ויש שם כלב לבן גדול שהולך אחורה כל הזמן ולא מסתובב אף פעם ומה שהיה קודם זה שהייתי בכיתה שלי מבית הספר והמורה ביקשה ממני לקרוא משהו מול כולם ולא הצלחתי למצוא את הדף ובגינה פתאום אני רואה שמישהו פתח את השער והכלב יצא החוצה ואני לא בטוחה אם זאת השכנה או החברה שלי או אולי אני בעצמי כי היד שלי הייתה על הבריח ושתיהן מסתכלות עליי ושותקות והכלב עומד ברחוב וממשיך ללכת אחורה עד שהוא נעלם מאחורי פינה ואני רוצה לרוץ אחריו אבל הרגליים שלי נשארות דבוקות לחול';
const S1 = S.segmentDream(SEALED1);
const S2 = S.segmentDream(SEALED2);
const S3 = S.segmentDream(SEALED3);
const at = (segs: S.DreamSegment[], piece: string) => segs.find((s) => s.text.includes(piece))!.id;

const BROTHER = ['הדבר הראשון שנשמע זה את אמא שלי מארזת את הבית בלי לשים לב אליי.'];
const SAND = ['כי ניסיתי לה抓 את מה שנשאר, כאילו יש לי שליטה על מה שקורה. החול היה סימן לגעגועים ולמה שהלך לאיבוד.'];
const GARDEN = ['זה מקום מוכר ומשמעותי עבורי, ואולי הייתי רוצה לחזור לתחושות של תמיכה וחברויות מהעבר.'];
const ALONE = ['שהן פשוט שם, אבל אין קשר או תמיכה. אני מרגישה לבד, כאילו הן מצפות ממני לעשות משהו ולא מבינות את הקושי שלי.'];
const DOG = ['שמת לב שהכלב הלך החוצה והמשיך ללכת אחורה, זה גרם לי להרגיש לא נוח ורציתי לרוץ אחריו, אבל לא הצלחתי.'];
const QUEUE = ['הרגשתי אכזבה וכעס, כי זה היה כאילו כל ההמתנה הייתה לשווא ולא הייתה פתרון בסוף.'];

const closing = (q: string, answers: string[], segs: S.DreamSegment[]) =>
  C.verifyQuestion({ question: q, focus: 'memory', subject: '' }, { language: 'he', segments: segs, momentSegments: segs.map((s) => s.id), answers, prior: [], closing: true }).reasons;
const realLife = (reasons: string[]) => reasons.some((r) => /real life|waking life/.test(r));

// ------------------------------------------------------------------------------------------------ 1. the dream taken as her waking life, with no person named

test('1. a question may not assume that what happened in the dream happens in her life, even with no one from the dream named', () => {
  assert.ok(realLife(closing('מה את עושה כשאת מרגישה שאף אחד לא שם לב אלייך בבית שלך?', BROTHER, S2)), 'sealed-2: "בבית שלך"');
  assert.ok(realLife(closing('באילו מצבים בחיים שלך את פוגשת רצון לתמיכה ומולו תחושת בדידות או חוסר הבנה?', [...GARDEN, ...ALONE], S3)), 'sealed-3: assumes such situations exist');
  assert.ok(realLife(closing('איפה בחיים שלך את מרגישה געגוע שמתערבב עם רצון לשלוט במה שהולך לאיבוד?', SAND, S2)), 'sealed-2: assumes she feels it in her life');
  assert.ok(realLife(closing('איך את מגיבה בדרך כלל כשמשהו חומק לך מהידיים?', SAND, S2)), '"בדרך כלל"');
  assert.ok(realLife(closing('מה את מרגישה היום כשמישהו לא עוזר לך?', BROTHER, S2)), '"היום", someone who does not help');
});

// ------------------------------------------------------------------------------------------------ 2. an open question about a possible link stays welcome

test('2. an open question about a possible link to her life is welcome', () => {
  assert.deepEqual(closing('מה הרגע עם אמא שלך בחלום מזכיר לך מהחיים שלך, אם בכלל?', BROTHER, S2), []);
  assert.deepEqual(closing('איפה בחיים שלך, אם בכלל, את פוגשת געגוע כמו זה שתיארת?', SAND, S2), []);
  assert.deepEqual(closing('מה עולה בך היום כשאת חושבת על אמא שלך שארזה את הבית בחלום?', BROTHER, S2), [], '"היום" about the dream itself');
  assert.deepEqual(closing('אילו תחושות או זיכרונות מהעבר עולות בך כשאת חושבת על הגינה והאנשים שישבו איתך שם?', GARDEN, S3), [], 'sealed-3, as written');
  assert.deepEqual(closing('מה עובר לך בראש ברגע שבו ברור שאין יותר פתרון מבחוץ?', QUEUE, S1), [], 'sealed-1, about the dream moment');
  assert.deepEqual(closing('מה עוד עולה כשחוזרים למילה «לבד»?', ALONE, S3), [], 'the modest closing built by code');
});

// ------------------------------------------------------------------------------------------------ 3. her own cause, wish and feeling may be given back

const interp = (text: string, answers: string[], segs: S.DreamSegment[], dream: string, allowed?: number[]) =>
  C.verifyInterpretation(text, ['u0'], new Set(['u0']), { language: 'he', sourceText: dream, segments: segs, allowed: allowed ?? segs.map((s) => s.id), answers });

test('3. a possibility resting on her own cause, wish or feeling is not refused', () => {
  assert.deepEqual(interp('ייתכן שניסית לאסוף את החול כי ניסית לתפוס את מה שנשאר, כמו שאמרת.', SAND, S2, SEALED2), [], 'her cause ("כי ניסיתי…"), one word in other words');
  assert.deepEqual(interp('ייתכן שהכלב שהלך החוצה גרם לך להרגיש לא נוח, כמו שאמרת.', DOG, S3, SEALED3), [], 'she said "זה גרם לי להרגיש לא נוח"');
  assert.deepEqual(interp('אולי הגינה פוגשת את הרצון שתיארת, לחזור לתחושות של תמיכה מהעבר.', GARDEN, S3, SEALED3), [], 'she said "הייתי רוצה"');
  assert.deepEqual(interp('אולי הרצון לבכות, שלא התממש, נשאר פתוח ברגע הזה.', SAND, S2, SEALED2, [at(S2, 'ולא הצלחתי לבכות')]), [], 'the dream itself says she wanted to cry');
  assert.deepEqual(interp('אולי המבט והשתיקה שלהן מדגישים את התחושה שלך שאין ביניכן קשר או תמיכה באותו רגע.', ALONE, S3, SEALED3), [], 'sealed-3, as written');
});

test('3. …while a wish or cause that is not hers is still refused', () => {
  assert.ok(interp('אולי הניסיון לאסוף את החול נוגע ברצון שלך להחזיק בזיכרונות.', SAND, S2, SEALED2).length > 0, 'a wish she never said (the dream\'s wish is to cry)');
  assert.ok(interp('ייתכן שלא הצלחת לבכות כי אחיך לא עזר.', SAND, S2, SEALED2).length > 0, 'a dream event made her cause');
});

// ------------------------------------------------------------------------------------------------ 4. her sentence given back naturally, meaning untouched

const reflectBack = (q: string, a: string) => (C as unknown as Record<string, (q: string, a: string) => string>).reflectBack(q, a);

test('4. her answer is given back in the second person, sentence by sentence, each one said to be hers', () => {
  assert.equal(typeof reflectBack, 'function');
  assert.equal(reflectBack('שהן פשוט שם, אבל אין קשר או תמיכה.', 'feminine'), 'אמרת שהן פשוט שם, אבל אין קשר או תמיכה.');
  assert.equal(reflectBack('כי ניסיתי לאסוף את מה שנשאר, כאילו יש לי שליטה על מה שקורה.', 'feminine'), 'אמרת שזה כי ניסית לאסוף את מה שנשאר, כאילו יש לך שליטה על מה שקורה.');
  assert.equal(
    reflectBack('התחושה של חום וגעגוע. זה היה כמו לקשר אותי לעבר, אבל מהר זה הפך למשהו כואב ולא מסודר.', 'feminine'),
    'אמרת: «התחושה של חום וגעגוע.» ואמרת שזה היה כמו לקשר אותך לעבר, אבל מהר זה הפך למשהו כואב ולא מסודר.',
  );
  assert.equal(reflectBack('הרגשתי אכזבה וכעס.', 'neutral'), 'אמרת שהרגשת אכזבה וכעס.');
});

test('4. when it cannot be given back without guessing, her words stay a quote', () => {
  assert.equal(reflectBack('אני מרגישה לבד', 'neutral'), 'אמרת: «אני מרגישה לבד»', 'no gendered "you" for a neutral address');
  assert.equal(reflectBack('אני אלך הביתה', 'feminine'), 'אמרת: «אני אלך הביתה»', 'a future "I" is not turned into "את אלך"');
  assert.equal(reflectBack('מקום מוכר ומשמעותי עבורי', 'feminine'), 'אמרת: «מקום מוכר ומשמעותי עבורי»', 'a phrase, not a clause');
  assert.ok(!/לדעת /.test(reflectBack('לדעתי זה היה מוזר', 'feminine')), '"לדעתי" (in my opinion) never becomes "לדעת" (to know)');
});

test('4. giving back keeps the meaning: the same words, feelings and negations, only "I" turned to "you"', () => {
  const answers = [...QUEUE, ...SAND, ...GARDEN, ...ALONE, ...DOG, ...BROTHER, 'לא הייתי בטוחה אם זה אני או מישהו אחר.', 'אמא שלי לא הסתכלה עליי בכלל.'];
  for (const a of answers)
    for (const address of ['feminine', 'masculine', 'neutral'] as const) {
      const out = reflectBack(a, address);
      for (const sentence of out.split(/(?<=[.»])\s+/)) {
        if (sentence.includes('«')) continue; // kept as her exact words
        const said = sentence.replace(/^ו?אמרת ש(זה כי )?/, '').replace(/\.$/, '');
        const own = a.split(/(?<=[.!?])\s+/).map((s) => s.replace(/^כי /, '').replace(/^ש/, '').replace(/[.!?]$/, '')).find((s) => H.words(s).length === H.words(said).length);
        assert.ok(own, `"${sentence}" is one of her sentences, word for word in number (${a})`);
        assert.deepEqual(H.words(said).filter(H.isNegation), H.words(own!).filter(H.isNegation), `negations kept: ${sentence}`);
        assert.deepEqual(H.words(said).filter(H.isFeelingWord), H.words(own!).filter(H.isFeelingWord), `feelings kept: ${sentence}`);
        assert.ok(!H.words(said).some(H.isFirstPersonWord), `no "I" left: ${sentence}`);
      }
    }
});

// ------------------------------------------------------------------------------------------------ 5. through the whole-view assembly (sealed-2)

test('5. the whole-view assembly does not show a closing question that takes the dream as her life; it shows a modest one', () => {
  const brother = [at(S2, 'אחי עמד'), at(S2, 'ורק אמר לי')];
  const sources: C.WholeSources = {
    language: 'he',
    sourceText: SEALED2,
    segments: S2,
    explored: [{ id: 'm1', label: 'האח לא עזר', segments: brother, answers: ['לא יודעת.', ...BROTHER], question: 'מה הדבר הראשון שנראה או נשמע ברגע הזה?', insight: null }],
    unexplored: [],
    previous: null,
    maxReadings: 1,
  };
  for (const q of ['מה את עושה כשאת מרגישה שאף אחד לא שם לב אלייך בבית שלך?', 'מה את מרגישה כלפי אמא שלך ברגעים שבהם היא עסוקה או לא שמה לב אלייך?']) {
    const raw: C.WholeRaw = {
      overview: [{ source: 'interpretation', segment: -1, action: '', actor: '', target: '', moment: '', quote: '', basis: ['m1'], text: 'אולי מה שנשמע ראשון ברגע הזה הוא אמא שלך, ולא אחיך שעמד בפינה.' }],
      connections: [],
      recurring: { element: '', text: '', quotes: [] },
      contrast: { text: '', quotes: [] },
      readings: [],
      closing: { text: q, moment: '', quote: '' },
    };
    const { view } = C.assembleWhole(raw, sources);
    assert.notEqual(view.closingQuestion, q, `not shown: ${q}`);
    assert.ok(view.closingQuestion.trim().endsWith('?'), `a modest closing instead: "${view.closingQuestion}"`);
  }
});

// ------------------------------------------------------------------------------------------------ added AFTER the fix, from a probe of the rule (doc 44)

test('1. (after the fix) a general "when you…" or "when do you…" about her life is refused too; going back to the dream is not', () => {
  for (const q of ['מתי את מרגישה אכזבה וכעס כשאת מחכה?', 'עם מי את מרגישה שההמתנה שלך לשווא?', 'מה את מרגישה כשאת מחכה לשווא?', 'מה עוזר לך כשאת מרגישה אכזבה וכעס?'])
    assert.ok(realLife(closing(q, QUEUE, S1)), q);
  for (const q of ['מה ההמתנה הזאת מזכירה לך, אם בכלל?', 'מה עולה בך עכשיו כשאת חוזרת לאכזבה ולכעס מהחלום?', 'מה עולה בך כשאת חושבת על ההמתנה בתור?'])
    assert.deepEqual(closing(q, QUEUE, S1), [], q);
});

test('(after the fix) a Hebrew "why" question is refused as one; "באילו" and "במה" stay real questions (\b sees no Hebrew word boundary)', () => {
  const ask = (q: string) => C.verifyQuestion({ question: q, focus: '', subject: '' }, { language: 'he', segments: S1, momentSegments: [0], answers: [], prior: [] }).reasons;
  assert.ok(ask('למה חיכית בתור?').some((r) => /why/.test(r)), 'למה');
  assert.ok(ask('מדוע חיכית בתור?').some((r) => /why/.test(r)), 'מדוע');
  assert.ok(ask('האם חיכית בתור?').some((r) => /yes\/no/.test(r)), 'האם');
  assert.ok(!ask('באיזה תור חיכית?').some((r) => /yes\/no|why/.test(r)), 'באיזה');
});
