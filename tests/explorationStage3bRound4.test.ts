import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/hero/claimCheck.ts';
import * as S from '../src/hero/dreamSegments.ts';
import * as H from '../src/hero/hebrewText.ts';

/**
 * STAGE 3B, ROUND 4 (after docs/upgrade-2026-10/39-stage3b-quality-report.md): focused tests written BEFORE the fix, from the sentences
 * the sealed-dream run (q-final) really produced. Run first against the code as committed in 2770e29 (see
 * docs/upgrade-2026-10/40-stage3b-round4-tests-before.txt), then against the fix. New functions through namespace imports.
 */

const SEALED2 =
  'הייתי בדירה של אמא שלי, והיא ארזה את כל הבית לקרטונים כי היא עוברת לגור במקום אחר. אחי עמד בפינה ולא עזר, ורק אמר לי בשקט שאני תמיד מגיעה כשכבר מאוחר מדי. דודה שלי, שלא דיברנו כבר שנים, נתנה לי צעיף צמר אדום ואמרה שהוא היה שלי כשהייתי קטנה. כשכרכתי אותו על הצוואר הוא התחיל להיות חם וכבד, ולאט לאט הפך לחול רטוב שנזל לי בין האצבעות. אמא שלי המשיכה לארוז כאילו כלום לא קרה. אני עמדתי שם מבולבלת וניסיתי לאסוף את החול לתוך אחד הקרטונים, ולא הצלחתי לבכות למרות שרציתי.';
const SEALED3 =
  'אני בגינה ציבורית ליד הבית שגדלתי בו ויושבת על ספסל עם השכנה מהקומה למטה וחברה שלי מהתיכון ויש שם כלב לבן גדול שהולך אחורה כל הזמן ולא מסתובב אף פעם ומה שהיה קודם זה שהייתי בכיתה שלי מבית הספר והמורה ביקשה ממני לקרוא משהו מול כולם ולא הצלחתי למצוא את הדף ובגינה פתאום אני רואה שמישהו פתח את השער והכלב יצא החוצה ואני לא בטוחה אם זאת השכנה או החברה שלי או אולי אני בעצמי כי היד שלי הייתה על הבריח ושתיהן מסתכלות עליי ושותקות והכלב עומד ברחוב וממשיך ללכת אחורה עד שהוא נעלם מאחורי פינה ואני רוצה לרוץ אחריו אבל הרגליים שלי נשארות דבוקות לחול';
const SEALED1 = 'חלמתי שחיכיתי בתור ארוך לקופה בסופר, ובכל פעם שהגיע תורי הקופאית קמה והלכה. בסוף התור נגמר, ואף אחד לא חזר לשבת מאחורי הקופה.';

const S2 = S.segmentDream(SEALED2);
const S3 = S.segmentDream(SEALED3);
const S1 = S.segmentDream(SEALED1);
const at = (segs: S.DreamSegment[], piece: string) => segs.find((s) => s.text.includes(piece))!.id;
const src = (segs: S.DreamSegment[], text: string, answers: string[], allowed?: number[]) => ({ language: 'he' as const, sourceText: text, segments: segs, allowed: allowed ?? segs.map((s) => s.id), answers });
const interp = (text: string, answers: string[], segs = S2, dream = SEALED2) => C.verifyInterpretation(text, ['d0'], new Set(['d0']), src(segs, dream, answers));

const SAND = ['כי ניסיתי לה抓 את מה שנשאר, כאילו יש לי שליטה על מה שקורה. החול היה סימן לגעגועים ולמה שהלך לאיבוד.'];
const BROTHER = ['הדבר הראשון שנשמע זה את אמא שלי מארזת את הבית בלי לשים לב אליי.'];
const GARDEN = ['זה מקום מוכר ומשמעותי עבורי, ואולי הייתי רוצה לחזור לתחושות של תמיכה וחברויות מהעבר.'];

// ------------------------------------------------------------------------------------------------ 1. causes, wishes and therapy she did not say

test('1. a possibility may not explain WHY with a cause she did not give ("כי", "גרם לך"), even hedged', () => {
  assert.ok(interp('ייתכן שלא הצלחת לבכות למרות שרצית כי היה לך חשוב להרגיש שיש לך שליטה כלשהי בתוך הבלבול.', SAND).length > 0, 'כי … (sealed-2)');
  assert.ok(interp('אולי העובדה שאמא שלך לא שמה לב אלייך ברקע בלטה במיוחד כי אחיך עמד בצד ולא עזר.', BROTHER).length > 0, 'כי אחיך (sealed-2)');
  assert.ok(interp('ייתכן שהתחושה שאחיך לא עזר והאמירה שלו גרמו לך להבחין במיוחד במה שאמא שלך עושה ברקע.', BROTHER).length > 0, 'גרמו לך');
});

test('1. a possibility may not give her a wish or a therapy aim she did not say ("מרמז על רצון", "מבטא רצון", "לעבד תחושות")', () => {
  assert.ok(interp('אולי המפגש עם השכנה והחברה בגינה מרמז על רצון שלך להיזכר בתחושת קירבה ותמיכה מפעם.', ['זה מקום מוכר ומשמעותי עבורי'], S3, SEALED3).length > 0, 'מרמז על רצון');
  assert.ok(interp('אולי הניסיון לאסוף את החול מבטא רצון להחזיק בזיכרונות או רגשות מהעבר גם כשהם חומקים.', SAND).length > 0, 'מבטא רצון');
  assert.ok(interp('אפשר לראות את הישיבה בגינה עם אנשים מהעבר כרגע שבו את מחפשת מרחב מוכר, אולי כדי לעבד תחושות עכשוויות.', GARDEN, S3, SEALED3).length > 0, 'לעבד תחושות');
});

test('1. her own cause or wish may be given back: when she said "הייתי רוצה" or "כי", the possibility may use it', () => {
  assert.deepEqual(interp('אולי הגינה מחזיקה את מה שתיארת, שהיית רוצה לחזור לתחושות של תמיכה מהעבר.', GARDEN, S3, SEALED3), []);
  assert.deepEqual(interp('אולי הניסיון לאסוף את החול פוגש את מה שאמרת, שהחול היה סימן לגעגועים.', SAND), []);
});

// ------------------------------------------------------------------------------------------------ 2. never assume the dream's people or events are her real life

const closing = (q: string, answers: string[], segs = S2) => C.verifyQuestion({ question: q, focus: 'memory', subject: '' }, { language: 'he', segments: segs, momentSegments: segs.map((s) => s.id), answers, prior: [], closing: true });

test('2. a question may not take a dream relationship as her real life ("מה את מרגישה כלפי אמא שלך ברגעים שבהם…")', () => {
  assert.ok(closing('מה את מרגישה כלפי אמא שלך ברגעים שבהם היא עסוקה או לא שמה לב אלייך?', BROTHER).reasons.length > 0);
  assert.ok(closing('איך את מתמודדת היום עם אחיך כשהוא לא עוזר לך?', BROTHER).reasons.length > 0);
});

test('2. asking whether the dream reminds her of something in her life is welcome', () => {
  assert.deepEqual(closing('מה הרגע עם אמא שלך בחלום מזכיר לך מהחיים שלך, אם בכלל?', BROTHER).reasons, []);
  // changed in round 4b (her decision, docs/upgrade-2026-10/44): "where in your life do you feel…" assumes she does; asked openly it is welcome
  assert.ok(closing('איפה בחיים שלך את מרגישה געגוע שמתערבב עם רצון לשלוט במה שהולך לאיבוד?', SAND).reasons.length > 0);
  assert.deepEqual(closing('איפה בחיים שלך, אם בכלל, את מרגישה געגוע שמתערבב עם רצון לשלוט במה שהולך לאיבוד?', SAND).reasons, []);
});

// ------------------------------------------------------------------------------------------------ 3. dictated dreams: events not swallowed, no duplicates

test('3. a dictated dream: the garden, the dog walking backwards and the school memory are separate, with no duplicate moments', () => {
  const parts = S3.map((s) => s.text);
  const holding = (w: string) => parts.filter((p) => p.includes(w));
  assert.ok(!holding('ספסל')[0].includes('כלב'), `the bench and the dog are apart: ${holding('ספסל')[0]}`);
  assert.ok(!holding('כלב לבן')[0].includes('בכיתה'), `the dog and the school memory are apart: ${holding('כלב לבן')[0]}`);
  assert.ok(parts.some((p) => p.startsWith('ומה שהיה קודם')), `the look back opens its own part: ${parts.join(' | ')}`);
  const groups = S.momentGroups(SEALED3);
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) assert.ok(!groups[i].segmentIds.some((x) => groups[j].segmentIds.includes(x)), 'no part in two moments');
  assert.ok(parts.every((p) => p.split(/\s+/).length >= 3));
});

// ------------------------------------------------------------------------------------------------ 4. the different question after "I don't know"

test('4. after "I don\'t know", a question about the same moment from another angle is not refused as a repeat', () => {
  const ctx = {
    language: 'he' as const,
    segments: S2,
    momentSegments: [at(S2, 'אחי עמד')],
    answers: [],
    prior: [{ question: 'מה הדבר הראשון ששמת לב אליו בזה שאחיך עמד בפינה ולא עזר?', focus: 'salience' as const, subject: 'האח', sameMoment: true }],
  };
  assert.deepEqual(C.verifyQuestion({ question: 'איזו הבעת פנים הייתה לאחיך כשעמד בפינה?', focus: 'sense', subject: 'אחיך' }, ctx as never).reasons, []);
  assert.ok(C.verifyQuestion({ question: 'מה בלט לך בזה שאחיך עמד בפינה ולא עזר?', focus: 'salience', subject: 'האח' }, ctx as never).reasons.length > 0, 'the same angle again is still refused');
});

// ------------------------------------------------------------------------------------------------ 5. labels, Hebrew matching, natural reflection

test('5. a good label from the labels model is kept even with one paraphrase word ("סיום התור ללא קופאית", "חום ונפילה לחול")', () => {
  assert.equal(C.checkLabel('סיום התור ללא קופאית', 'בסוף התור נגמר, ואף אחד לא חזר לשבת מאחורי הקופה', [], SEALED1), 'סיום התור ללא קופאית');
  assert.equal(C.checkLabel('חום ונפילה לחול', 'כשכרכתי אותו על הצוואר הוא התחיל להיות חם וכבד, ולאט לאט הפך לחול רטוב שנזל לי בין האצבעות', [], SEALED2), 'חום ונפילה לחול');
  const fallback = C.checkLabel('חיכיתי בתור', 'בסוף התור נגמר, ואף אחד לא חזר לשבת מאחורי הקופה', [], SEALED1);
  assert.ok(!/ו?אף$|לא$|ו$/.test(fallback.trim()), `a rebuilt label never ends mid-phrase: "${fallback}"`);
});

test('5. Hebrew read correctly: "באילו" asks a question; "ואף אחד לא" is one negation; "ראית" is the dream\'s "רואה"', () => {
  assert.ok(!closing('באילו מצבים בחיים שלך את פוגשת רצון לתמיכה?', ['הייתי רוצה לחזור לתחושות של תמיכה'], S3).reasons.some((r) => /yes\/no/.test(r)));
  const v = C.verifyDreamClaim({ segment: at(S1, 'ואף אחד'), action: 'חזר', actor: 'unknown', target: '', text: 'אף אחד לא חזר לשבת מאחורי הקופה.' }, src(S1, SEALED1, []));
  assert.equal(v.status, 'checked', v.reasons.join('; '));
  assert.equal(H.sameWord('ראית', 'רואה'), true);
  assert.equal(H.sameWord('עשית', 'עושה'), true);
});

test('5. her own first-person sentence is given back naturally in the second person, not pasted as a quote', () => {
  const give = (C as unknown as Record<string, (q: string, a: string) => string | null>).giveBack;
  assert.equal(typeof give, 'function');
  assert.equal(give('הרגשתי אכזבה וכעס', 'feminine'), 'הרגשת אכזבה וכעס');
  assert.equal(give('אני מרגישה לבד', 'feminine'), 'את מרגישה לבד');
  assert.equal(give('זה מקום מוכר ומשמעותי עבורי', 'neutral'), 'זה מקום מוכר ומשמעותי עבורך');
  assert.equal(give('אני מרגישה לבד', 'neutral'), null, 'a present-tense "I" is not turned into a gendered "you" for a neutral address');
  const r = C.assembleReply(
    { dream: [], user: [{ quote: 'הרגשתי אכזבה וכעס', text: "אמרת ש'הרגשתי אכזבה וכעס'" }], possibilities: [] },
    { ...src(S1, SEALED1, ['הרגשתי אכזבה וכעס, כי זה היה כאילו כל ההמתנה הייתה לשווא.'], [at(S1, 'ואף')]), address: 'neutral' } as never,
  );
  assert.equal(r.insight.reflection, 'אמרת שהרגשת אכזבה וכעס.');
});

// ------------------------------------------------------------------------------------------------ 6. plural feelings (the bug fixed after the sealed run), both ways

test('6. plural feelings are feelings; plural ordinary nouns are not', () => {
  for (const w of ['המאמצים', 'פחדים', 'געגועים', 'האכזבות', 'והגעגועים', 'בפחדים', 'החששות']) assert.equal(H.isFeelingWord(w), true, w);
  for (const w of ['ימים', 'המים', 'שירים', 'מפתחות', 'הדלתות', 'מעצבים', 'קרטונים', 'מגבות', 'הדפים', 'צעיפים']) assert.equal(H.isFeelingWord(w), false, w);
  assert.ok(interp('אולי יש כאן אפשרות לחשוב על רגע שבו כל המאמצים וההמתנה לא קיבלו תשובה.', ['הרגשתי אכזבה וכעס'], S1, SEALED1).length > 0, 'a plural feeling she did not name is refused');
  assert.deepEqual(interp('אולי החול נושא את הגעגועים שתיארת.', SAND), [], 'a plural feeling she did name is fine');
});

// ------------------------------------------------------------------------------------------------ added AFTER the fix, from the offline before/after (doc 41)

test('5. (after the fix) her sentence is given back only as one whole clause; otherwise her words stay quoted', () => {
  const give = (C as unknown as Record<string, (q: string, a: string) => string | null>).giveBack;
  assert.equal(give('כי ניסיתי לאסוף את מה שנשאר', 'feminine'), null, 'no "אמרת שכי"');
  assert.equal(give('מקום מוכר ומשמעותי עבורי', 'feminine'), null, 'a noun fragment is not a clause after "אמרת ש"');
  assert.equal(give('התחושה של חום וגעגוע. זה היה כמו לקשר אותי לעבר', 'feminine'), null, 'two sentences');
  assert.equal(give('הדבר הראשון שנשמע זה את אמא שלי מארזת את הבית בלי לשים לב אליי', 'feminine'), 'הדבר הראשון שנשמע זה את אמא שלך מארזת את הבית בלי לשים לב אלייך');
});

test('4. (after the fix) another angle on the same moment is not a repeat for sharing the moment\'s words; the same angle still is', () => {
  const ctx = { language: 'he' as const, segments: S2, momentSegments: [at(S2, 'אחי עמד')], answers: [], prior: [{ question: 'מה הדבר הראשון ששמת לב אליו בזה שאחיך עמד בפינה ולא עזר?', focus: 'salience' as const, subject: 'האח', sameMoment: true }] };
  assert.deepEqual(C.verifyQuestion({ question: 'איך הוא נראה שם בפינה כשעמד ולא עזר?', focus: 'detail', subject: 'אחיך' }, ctx as never).reasons, []);
  assert.ok(C.verifyQuestion({ question: 'מה הדבר הראשון ששמת לב אליו כשאחיך עמד בפינה?', focus: 'detail', subject: 'אחיך' }, ctx as never).reasons.length > 0, 'the same question in other words');
});
