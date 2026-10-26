import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/hero/claimCheck.ts';
import * as S from '../src/hero/dreamSegments.ts';

/**
 * STAGE 3B, BEFORE THE ACCEPTANCE RUN (her decision after doc 44): a careful "אולי … מרמז על" is allowed, in context, only when what it
 * hints at rests on what the dreamer said, no image is given a fixed meaning, and no feeling, wish, need, cause or fact is added.
 * Never allowed wholesale: the sentence's content is checked. Stronger forms ("מצביע על", "מעיד על", "סימן ל") stay as they were.
 * Written BEFORE the change and run first against the code of round 4b (docs/upgrade-2026-10/46-stage3b-hint-rule-tests-before.txt).
 */

const SEALED2 =
  'הייתי בדירה של אמא שלי, והיא ארזה את כל הבית לקרטונים כי היא עוברת לגור במקום אחר. אחי עמד בפינה ולא עזר, ורק אמר לי בשקט שאני תמיד מגיעה כשכבר מאוחר מדי. דודה שלי, שלא דיברנו כבר שנים, נתנה לי צעיף צמר אדום ואמרה שהוא היה שלי כשהייתי קטנה. כשכרכתי אותו על הצוואר הוא התחיל להיות חם וכבד, ולאט לאט הפך לחול רטוב שנזל לי בין האצבעות. אמא שלי המשיכה לארוז כאילו כלום לא קרה. אני עמדתי שם מבולבלת וניסיתי לאסוף את החול לתוך אחד הקרטונים, ולא הצלחתי לבכות למרות שרציתי.';
const SEALED3 =
  'אני בגינה ציבורית ליד הבית שגדלתי בו ויושבת על ספסל עם השכנה מהקומה למטה וחברה שלי מהתיכון ויש שם כלב לבן גדול שהולך אחורה כל הזמן ולא מסתובב אף פעם ומה שהיה קודם זה שהייתי בכיתה שלי מבית הספר והמורה ביקשה ממני לקרוא משהו מול כולם ולא הצלחתי למצוא את הדף ובגינה פתאום אני רואה שמישהו פתח את השער והכלב יצא החוצה ואני לא בטוחה אם זאת השכנה או החברה שלי או אולי אני בעצמי כי היד שלי הייתה על הבריח ושתיהן מסתכלות עליי ושותקות והכלב עומד ברחוב וממשיך ללכת אחורה עד שהוא נעלם מאחורי פינה ואני רוצה לרוץ אחריו אבל הרגליים שלי נשארות דבוקות לחול';
const S2 = S.segmentDream(SEALED2);
const S3 = S.segmentDream(SEALED3);

const SAND = ['כי ניסיתי לה抓 את מה שנשאר, כאילו יש לי שליטה על מה שקורה. החול היה סימן לגעגועים ולמה שהלך לאיבוד.'];
const GARDEN = ['זה מקום מוכר ומשמעותי עבורי, ואולי הייתי רוצה לחזור לתחושות של תמיכה וחברויות מהעבר.'];
const DOG = ['שמת לב שהכלב הלך החוצה והמשיך ללכת אחורה, זה גרם לי להרגיש לא נוח ורציתי לרוץ אחריו, אבל לא הצלחתי.'];

const interp = (text: string, answers: string[], segs: S.DreamSegment[], dream: string) =>
  C.verifyInterpretation(text, ['u0'], new Set(['u0']), { language: 'he', sourceText: dream, segments: segs, allowed: segs.map((s) => s.id), answers });

test('a careful "אולי … מרמז על" is shown when what it hints at is what she said', () => {
  assert.deepEqual(interp('אולי המפגש בגינה מרמז על הרצון שתיארת, לחזור לתחושות של תמיכה מהעבר.', GARDEN, S3, SEALED3), [], 'her wish, in her words');
  assert.deepEqual(interp('ייתכן שהחול שנזל בין האצבעות רומז על מה שאמרת, הגעגועים ומה שהלך לאיבוד.', SAND, S2, SEALED2), [], 'her longing, in her words');
  assert.deepEqual(interp('אולי השער שנפתח מרמז על מה שתיארת, שהכלב הלך החוצה ולא הצלחת לרוץ אחריו.', DOG, S3, SEALED3), [], 'what she told');
});

test('…and refused when what it hints at is not what she said, even hedged', () => {
  assert.ok(interp('אולי המפגש עם השכנה והחברה בגינה מרמז על רצון שלך להיזכר בתחושת קירבה ותמיכה מפעם.', GARDEN, S3, SEALED3).length > 0, 'sealed-3 as written: "קירבה", "להיזכר", "מפעם" are not hers');
  assert.ok(interp('אולי הגינה מרמזת על הילדות שלך בשכונה.', GARDEN, S3, SEALED3).length > 0, 'a fact she never told');
  assert.ok(interp('אולי זה מרמז על כך שאת צריכה תמיכה.', GARDEN, S3, SEALED3).length > 0, 'a need she never said');
  assert.ok(interp('אולי הניסיון לאסוף את החול מרמז על רצון לשלוט במה שקורה.', SAND, S2, SEALED2).length > 0, 'a wish she never said ("כאילו יש לי שליטה" is not a wish)');
  assert.ok(interp('אולי השער הפתוח מרמז על פחד מאובדן.', DOG, S3, SEALED3).length > 0, 'a feeling she never named');
});

test('the conditions around it still hold: hedged, no fixed meaning, and the stronger forms stay as they were', () => {
  assert.ok(interp('המפגש בגינה מרמז על הרצון שתיארת, לחזור לתחושות של תמיכה מהעבר.', GARDEN, S3, SEALED3).length > 0, 'not hedged');
  assert.ok(interp('אולי הגינה מסמלת את הרצון שתיארת, לחזור לתחושות של תמיכה מהעבר.', GARDEN, S3, SEALED3).length > 0, 'a fixed meaning ("מסמלת")');
  assert.ok(interp('אולי המפגש בגינה מצביע על הרצון שתיארת, לחזור לתחושות של תמיכה מהעבר.', GARDEN, S3, SEALED3).length > 0, '"מצביע על" is not a careful form');
});
