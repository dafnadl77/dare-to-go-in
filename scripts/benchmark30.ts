/**
 * THE 30 QUALITY PROBLEMS OF RUN final-5, AGAINST THE NEW CHECKS (stage 3b fix round, doc 30). No model call, no network.
 *
 * Each problem sentence is taken word for word from docs/upgrade-2026-10/29-stage3b-eval-final-5.json (the answers too), and run
 * through the check that would now see it, with the MOST FAVOURABLE declaration a model could give (the right part of the dream, the
 * part's real verb and doer, a real quote). So a sentence counts as "caught" only when the problem itself makes it fail. What the
 * checks cannot see is reported as "not caught", with the reason. Output: docs/upgrade-2026-10/34-stage3b-benchmark-30.md.
 *
 * Run:  npx tsx scripts/benchmark30.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { segmentDream, momentGroups } from '../src/hero/dreamSegments.ts';
import { checkLabel, verifyDreamClaim, verifyInterpretation, verifyQuestion, verifyUserClaim, assembleWhole, type Sources } from '../src/hero/claimCheck.ts';

const run = JSON.parse(readFileSync(new URL('../docs/upgrade-2026-10/29-stage3b-eval-final-5.json', import.meta.url), 'utf8')) as {
  journeys: { plan: string; text: string; steps: { answer: string; followUp: { answer: string | null } | null }[] }[];
};
const J = Object.fromEntries(run.journeys.map((j) => [j.plan, j]));
const segs = (key: string) => segmentDream(J[key].text);
const seg = (key: string, piece: string) => segs(key).find((s) => s.text.includes(piece))!.id;
const answersOf = (key: string, step: number) => {
  const s = J[key].steps[step];
  return [s.answer, s.followUp?.answer ?? ''].filter(Boolean);
};
const src = (key: string, allowed: number[], answers: string[]): Sources => ({ language: 'he', sourceText: J[key].text, segments: segs(key), allowed, answers });

type Row = { id: number; layer: string; text: string; caught: 'נתפס' | 'לא נתפס' | 'חלקית'; why: string };
const rows: Row[] = [];
const add = (id: number, layer: string, text: string, reasons: string[], note = '') =>
  rows.push({ id, layer, text, caught: reasons.length ? 'נתפס' : 'לא נתפס', why: reasons.length ? reasons.slice(0, 3).join('; ') : note });
const dream = (key: string, piece: string, action: string, actor: string, target: string, text: string, step: number) =>
  verifyDreamClaim({ segment: seg(key, piece), action, actor, target, text }, src(key, [seg(key, piece)], answersOf(key, step)));
const dreamReasons = (v: { status: string; reasons: string[] }) => (v.status === 'checked' ? [] : v.reasons);

// ---------------------------------------------------------------------------------------- moments (1–3)
{
  const problems: string[] = [];
  for (const key of ['short', 'rich', 'sensitive']) {
    const g = momentGroups(J[key].text);
    for (let i = 0; i < g.length; i++) for (let k = i + 1; k < g.length; k++) if (g[i].segmentIds.some((x) => g[k].segmentIds.includes(x))) problems.push(`${key}: shared part`);
  }
  rows.push({ id: 1, layer: 'בחירת רגעים', text: 'רגעים כפולים על אותו משפט (אבא / חדר / לא הצלחתי להעיר)', caught: problems.length ? 'לא נתפס' : 'נתפס', why: problems.length ? problems.join(', ') : 'רגע הוא משפט של החלום; שני רגעים לא חולקים חלק (מבני, לא בדיקת ניסוח)' });
  const need = [['short', 'הרכבת לא הגיעה'], ['rich', 'מישהו שר שיר'], ['rich', 'כולם לבשו לבן'], ['sensitive', 'הדלתות נסגרו']];
  const missing = need.filter(([k, p]) => !momentGroups(J[k].text).some((g) => g.text.includes(p)));
  rows.push({ id: 2, layer: 'בחירת רגעים', text: 'רגעים מרכזיים חסרים (הרכבת שלא הגיעה, השיר, הלבן מול השחור, הדלתות)', caught: missing.length ? 'לא נתפס' : 'נתפס', why: missing.length ? `חסר: ${missing.map((m) => m[1]).join(', ')}` : 'כל אחד מהם הוא עכשיו רגע משלו' });
  const labels = [['חיכיתי לרכבת', 'עמדתי בתחנת רכבת ריקה וחיכיתי'], ['אחי הקטן', 'אחי הקטן נתן לי מפתח ואמר שזה למקום שעוד לא הייתי בו'], ['לא הצלחתי להעיר', 'בסוף הגעתי לחדר שבו אבא שלי ישן במיטה, ולא הצלחתי להעיר אותו']];
  const fixed = labels.map(([c, m]) => `${c} → ${checkLabel(c, m, [])}`);
  rows.push({ id: 3, layer: 'תוויות', text: 'תוויות בגוף ראשון: חיכיתי לרכבת, אחי הקטן, לא הצלחתי להעיר', caught: 'נתפס', why: fixed.join('; ') });
}

// ---------------------------------------------------------------------------------------- questions (4–8)
const q = (key: string, piece: string, question: string, answers: string[] = [], prior: { question: string; focus: null; subject: null }[] = []) =>
  verifyQuestion({ question, focus: 'detail', subject: '' }, { language: 'he', segments: segs(key), momentSegments: segs(key).filter((s) => s.sentence === segs(key)[seg(key, piece)].sentence).map((s) => s.id), answers, prior }).reasons;
add(4, 'שאלה', 'מה מזכיר הרגע שבו המפתח שניתן בדלת מתגלה כקטן מדי?', q('rich', 'קטן מדי', 'מה מזכיר הרגע שבו המפתח שניתן בדלת מתגלה כקטן מדי?'));
add(5, 'שאלה', 'כשאחי הקטן נתן לך את המפתח למקום שעוד לא היית בו, מה היה הרגע הזה בשבילך בשיחה או בקשר ביניכם?', q('rich', 'נתן לי מפתח', 'כשאחי הקטן נתן לך את המפתח למקום שעוד לא היית בו, מה היה הרגע הזה בשבילך בשיחה או בקשר ביניכם?', answersOf('rich', 0).concat(answersOf('rich', 1))));
{
  const a = q('short', 'תחנת רכבת', 'מה עולה כשחושבים על זה שתיארת את תחנת הרכבת כתחנת רכבת ריקה?');
  const b = q('sensitive', 'אבא שלי', 'מה עולה כשחושבים על אבא כשהוא ישן בחדר בבית החולים, אחרי כל מה שקרה במסדרון?');
  rows.push({ id: 6, layer: 'שאלה שנכתבה מראש', text: 'מה עולה כשחושבים על זה שתיארת את תחנת הרכבת כתחנת רכבת ריקה? / מה עולה כשחושבים על אבא כשהוא ישן בחדר בבית החולים...', caught: a.length && b.length ? 'נתפס' : b.length ? 'חלקית' : 'לא נתפס', why: `הראשונה: ${a.length ? a.join('; ') : 'עוברת (מסורבלת, אבל כל מילה שלה מהרגע: סגנון אינו נבדק)'}; השנייה: ${b.slice(0, 2).join('; ') || 'עוברת'}. ובכל מקרה שאלות שנכתבו מראש כבר לא נשאלות.` });
}
{
  const a = q('rich', 'הים התרחק', 'כשהים התרחק ולא חזר, מה ראית שנשאר במקום שבו המים היו קודם?', answersOf('rich', 0));
  const b = q('rich', 'כולם לבשו', 'בחתונה של החברה, כשכולם לבשו לבן ואת לבשת שחור, מה שמעת או ראית שם שגרם לך לשים לב להבדל הזה?');
  rows.push({ id: 7, layer: 'שאלה מזמינה פרטים', text: 'מה ראית שנשאר במקום שבו המים היו קודם? / מה שמעת או ראית שם שגרם לך לשים לב להבדל הזה?', caught: a.length && b.length ? 'חלקית' : 'לא נתפס', why: `השאלות נפסלות (${[...a, ...b].slice(0, 2).join('; ')}), אבל לא בגלל ש"הן מזמינות פרטים". ההגנה האמיתית היא בשכבות: פרט מהתשובה לא יכול להפוך לעובדת חלום (שורות 10, 12, 15)` });
}
add(8, 'שאלה', 'מה נשאר פתוח או לא פתור בשבילך ברגע שבו לא הצלחת להעיר את אבא, אחרי כל מה שקרה במסדרון?', q('sensitive', 'אבא שלי', 'מה נשאר פתוח או לא פתור בשבילך ברגע שבו לא הצלחת להעיר את אבא, אחרי כל מה שקרה במסדרון?', answersOf('sensitive', 0)));

// ---------------------------------------------------------------------------------------- the dream layer (9–15)
add(9, 'מה החלום מראה', 'המפתח הגיע בסוף הדרך אחרי הליכה משותפת לאורך החוף, והוא לא התאים לדלת.', dreamReasons(dream('rich', 'קטן מדי', 'היה', 'מפתח', '', 'המפתח הגיע בסוף הדרך אחרי הליכה משותפת לאורך החוף, והוא לא התאים לדלת.', 0)));
add(10, 'מה החלום מראה', 'הים התרחק והשאיר רק חול רטוב עם שלוליות קטנות, במקום שהיה מלא מים קודם. זה קרה אחרי הליכה משותפת עם אחיך לאורך החוף.', dreamReasons(dream('rich', 'הים התרחק', 'התרחק', 'ים', '', 'הים התרחק והשאיר רק חול רטוב עם שלוליות קטנות, במקום שהיה מלא מים קודם. זה קרה אחרי הליכה משותפת עם אחיך לאורך החוף.', 1)));
add(11, 'מה החלום מראה', 'המפתח ניתן לפני תחילת המסע לאורך החוף, ובידי אחיך היה תפקיד בפתיחת הדרך למקום חדש.', dreamReasons(dream('rich', 'נתן לי מפתח', 'נתן', 'אח', 'dreamer', 'המפתח ניתן לפני תחילת המסע לאורך החוף, ובידי אחיך היה תפקיד בפתיחת הדרך למקום חדש.', 2)));
add(12, 'מה החלום מראה', 'הייתה חתונה שבה כל הנוכחים לבשו לבן ורק את לבשת שחור, ובזמן הזה התנגנה מוזיקה לא מוכרת שידעת את המילים שלה.', dreamReasons(dream('rich', 'כולם לבשו', 'לבשו', 'כולם', '', 'הייתה חתונה שבה כל הנוכחים לבשו לבן ורק את לבשת שחור, ובזמן הזה התנגנה מוזיקה לא מוכרת שידעת את המילים שלה.', 3)));
add(13, 'מה החלום מראה', 'אחרי כל הריצה והדלתות הנסגרות, רק בחדר של אבא היה שקט והוא לא התעורר, גם כשניסית להעיר אותו.', dreamReasons(dream('sensitive', 'אבא שלי', 'ישן', 'אבא', '', 'אחרי כל הריצה והדלתות הנסגרות, רק בחדר של אבא היה שקט והוא לא התעורר, גם כשניסית להעיר אותו.', 0)));
add(14, 'מה החלום מראה', 'הדלתות במסדרון נסגרות בזו אחר זו לפני שהגעת לחדר של אבא, וברגע הזה לא מתרחש שינוי – אבא ממשיך לישון.', dreamReasons(dream('sensitive', 'אבא שלי', 'ישן', 'אבא', '', 'הדלתות במסדרון נסגרות בזו אחר זו לפני שהגעת לחדר של אבא, וברגע הזה לא מתרחש שינוי – אבא ממשיך לישון.', 1)));
add(15, 'מה החלום מראה', 'בבית החולים עברת במסדרון ארוך ומאיים לפני שהגעת לחדר של אבא, וכל הזמן הזה רדפו אחריך.', dreamReasons(dream('sensitive', 'רדפו', 'רדפו', 'unknown', 'dreamer', 'בבית החולים עברת במסדרון ארוך ומאיים לפני שהגעת לחדר של אבא, וכל הזמן הזה רדפו אחריך.', 2)));

// ---------------------------------------------------------------------------------------- her layer (16–17)
{
  const v = verifyUserClaim({ quote: 'אני מרגיש חרדה ולחץ', text: 'אמרת שחשבת על חרדה ולחץ, זה הזכיר לך תקופה קשה ורצית לדעת שהוא בסדר.' }, src('sensitive', [seg('sensitive', 'אבא שלי')], answersOf('sensitive', 0)));
  add(16, 'מה אמרת', 'אמרת שחשבת על חרדה ולחץ, זה הזכיר לך תקופה קשה ורצית לדעת שהוא בסדר.', v.status === 'checked' ? [] : v.reasons);
  const w = verifyUserClaim({ quote: 'הרגשתי פחד ונעימות של חוסר אונים', text: 'אמרת שהרגשת פחד ונעימות של חוסר אונים, והמסדרון היה כמו חזרה לתקופה קשה.' }, src('sensitive', [seg('sensitive', 'רדפו')], answersOf('sensitive', 2)));
  add(17, 'מה אמרת', 'אמרת שהרגשת פחד ונעימות של חוסר אונים...', w.status === 'checked' ? [] : w.reasons, 'כל מילה שלה (הצירוף המוזר "נעימות" בא מהסימולטור). הבודק לא יודע שצירוף אינו הגיוני');
}

// ---------------------------------------------------------------------------------------- possibilities (18–20)
const interp = (key: string, piece: string, step: number, text: string) => verifyInterpretation(text, ['d0'], new Set(['d0']), src(key, [seg(key, piece)], answersOf(key, step)));
add(18, 'אפשרות', 'אולי כשהים נסוג ונשאר רק חול רטוב, התחושה שלך שלבד וגעגוע לאחיך מדגישה...', interp('rich', 'הים התרחק', 1, 'אולי כשהים נסוג ונשאר רק חול רטוב, התחושה שלך שלבד וגעגוע לאחיך מדגישה את מה שנשאר איתך כשמשהו יקר מתרחק—סימנים קטנים, תחושת חסר, ולא שלמות.'), 'עברית שבורה ("שלבד"): אין לה בדיקה. הרגשות בה הם שלה, הניסוח מסויג');
{
  const a = interp('rich', 'קטן מדי', 0, 'אולי עצם זה שהגעת עד הדלת עם מפתח לא מתאים מדגיש תחושת מאמץ והשתתפות, אבל גם את הרגע שבו משהו חיצוני עוצר אותך מלהיכנס פנימה.');
  const b = interp('sensitive', 'רדפו', 2, 'אולי הדרך הארוכה והמאיימת בבית החולים, עם תחושת הרדיפה, הדגישה את החולשה או הפחד שחווית אז, והחזירה אותך לרגעים שבהם הרגשת שאין לך שליטה.');
  rows.push({ id: 19, layer: 'אפשרות', text: '"מדגיש תחושת מאמץ" / "הדגישה את החולשה"', caught: a.length && b.length ? 'נתפס' : 'חלקית', why: [...a, ...b].slice(0, 3).join('; ') });
}
add(20, 'אפשרות', 'אולי עצם זה שאחיך נתן לך את המפתח מדגיש... המפתח פותח מסע, אבל גם מדגיש את הכאב על מה שחסר.', interp('rich', 'נתן לי מפתח', 2, 'אולי עצם זה שאחיך נתן לך את המפתח מדגיש את המקום שהקשר ביניכם תופס, גם כשיש מרחק. המפתח פותח מסע, אבל גם מדגיש את הכאב על מה שחסר.'));

// ---------------------------------------------------------------------------------------- whole views (21–30)
const richExplored = (n: number) =>
  [
    { piece: 'קטן מדי', step: 0 },
    { piece: 'הים התרחק', step: 1 },
    { piece: 'נתן לי מפתח', step: 2 },
    { piece: 'כולם לבשו', step: 3 },
  ]
    .slice(0, n)
    .map((x, i) => ({ id: `m${i + 1}`, label: x.piece, segments: segs('rich').filter((s) => s.sentence === segs('rich')[seg('rich', x.piece)].sentence).map((s) => s.id), answers: answersOf('rich', x.step), question: '', insight: null }));
const emptyWhole = { connections: [], recurring: { element: '', text: '', quotes: [] }, contrast: { text: '', quotes: [] }, readings: [], closing: { text: '', moment: '', quote: '' } };
const wholeSrc = (key: string, explored: ReturnType<typeof richExplored>) => ({ language: 'he' as const, sourceText: J[key].text, segments: segs(key), explored, unexplored: [], previous: null, maxReadings: 2 });
{
  // 21: a first look after one moment that adds little: every sentence now needs a source; one that only restates is dropped
  const ex = [{ id: 'm1', label: 'תחנה', segments: [0], answers: answersOf('short', 0), question: '', insight: { observation: 'הרכבת לא הגיעה למרות שעמדת במקום שמיועד להמתנה לה.', reflection: 'אמרת שזו תחושה של חוסר ודאות וציפייה ממושכת, של המתנה למשהו שלא מגיע.', possibility: 'אולי יש כאן תחושה של לעמוד בנקודה בחיים שמיועדת להתקדמות, אבל משהו שמצפים לו מתעכב או לא קורה בפועל.' } }];
  const r = assembleWhole({ overview: [{ source: 'dream', segment: 0, action: 'עמדתי', actor: 'dreamer', target: '', moment: '', quote: '', basis: [], text: 'עמדת במקום שמיועד לתנועה, בלי תנועה או דמויות אחרות.' }, { source: 'user', segment: -1, action: '', actor: '', target: '', moment: 'm1', quote: 'חוסר ודאות וציפייה ממושכת', basis: [], text: 'ציינת ששם עלה בך חוסר ודאות וציפייה ממושכת.' }], ...emptyWhole }, { ...wholeSrc('short', []), explored: ex });
  rows.push({ id: 21, layer: 'מבט שלם (רגע אחד)', text: 'מבט ראשון שחוזר על התובנה ומוסיף "בלי תנועה"', caught: r.view.kind === 'factual-summary' ? 'חלקית' : 'לא נתפס', why: `התוצאה: ${r.view.kind}. "בלי תנועה" נפסל כעובדה שלא בחלום; משפט שחוזר על התובנה נפסל; בלי אפשרות חדשה אין "התבוננות ראשונה". אבל "ערך מוסף" עצמו לא נמדד: אפשרות מסויגת חדשה ודלה עוברת` });
}
add(22, 'מבט שלם', 'שני רגעים שמופיעים אחרי דרך משותפת עם אחיך.', verifyDreamClaim({ segment: seg('rich', 'הלכנו'), action: 'הלכנו', actor: 'dreamer', target: '', text: 'שני רגעים שמופיעים אחרי דרך משותפת עם אחיך.' }, src('rich', richExplored(2).flatMap((m) => m.segments), richExplored(2).flatMap((m) => m.answers))).reasons);
{
  const r = assembleWhole({ ...emptyWhole, overview: [{ source: 'interpretation', segment: -1, action: '', actor: '', target: '', moment: '', quote: '', basis: [], text: 'אולי.' }], readings: [{ segment: seg('rich', 'כולם לבשו'), text: 'אולי הבגדים השונים בתחילת החלום מרמזים מראש לתחושת הבדל או אי-שייכות.' }] }, wholeSrc('rich', richExplored(2)));
  add(23, 'מבט שלם', 'קריאה על "כולם לבשו לבן, אני לבשתי שחור" כשהרגע לא נחקר', r.report.readings[0] ?? []);
}
{
  const r = assembleWhole({ ...emptyWhole, overview: [{ source: 'interpretation', segment: -1, action: '', actor: '', target: '', moment: '', quote: '', basis: [], text: 'אולי.' }], closing: { text: 'איך את פוגשת היום את המקומות שבהם "אין לך מקום" כמו שהרגשת בדלת?', moment: 'm1', quote: 'אין לי מקום' } }, wholeSrc('rich', richExplored(2)));
  add(24, 'מבט שלם', 'איך את פוגשת היום את המקומות שבהם "אין לך מקום" כמו שהרגשת בדלת?', r.report.closing, 'הציטוט שלה מאותו רגע, והדלת היא אותו רגע. בקריאה חוזרת, הליקוי עצמו מוטל בספק');
}
{
  const ex = richExplored(4);
  const s4 = src('rich', ex[3].segments, ex[3].answers);
  const v = verifyUserClaim({ quote: 'זרה בתוך כל השמחה', text: 'בחתונה, את בלבוש אחר ושרה שיר לא מוכר, זרה מתוך שמחה.' }, s4);
  add(25, 'מבט שלם', 'בחתונה, את בלבוש אחר ושרה שיר לא מוכר, זרה מתוך שמחה.', v.status === 'checked' ? [] : v.reasons);
  const i = verifyInterpretation('אלה רגעים של ביחד שמתערבבים תמיד עם תחושת חוץ או חסר, מתחילת המסע ועד סופו.', ['o0'], new Set(['o0']), src('rich', ex.flatMap((m) => m.segments), ex.flatMap((m) => m.answers)));
  const u = verifyUserClaim({ quote: 'זרה בתוך כל השמחה', text: 'אמרת שהרגשת זרה מתוך שמחה.' }, s4);
  rows.push({ id: 26, layer: 'מבט שלם', text: '"זרה מתוך שמחה", "תמיד", "מתחילת המסע ועד סופו"', caught: i.length && u.status === 'checked' ? 'חלקית' : i.length ? 'נתפס' : 'לא נתפס', why: `"תמיד" ו"מתחילת המסע ועד סופו": ${i.slice(0, 2).join('; ')}. "מתוך" במקום "בתוך" ${u.status === 'checked' ? 'עובר (אותן מילים, משמעות אחרת)' : 'נפסל'}` });
  const r = assembleWhole({ ...emptyWhole, overview: [{ source: 'interpretation', segment: -1, action: '', actor: '', target: '', moment: '', quote: '', basis: [], text: 'אולי.' }], recurring: { element: 'זרות', text: 'תחושת זרות חוזרת: בחתונה, מול הדלת, וגם מול אחיך.', quotes: [{ moment: 'm4', quote: 'זרה בתוך כל השמחה' }, { moment: 'm1', quote: 'אני לא משתלבת' }, { moment: 'm3', quote: ex[2].answers[0].split(/\s+/).slice(0, 4).join(' ') }] } }, wholeSrc('rich', ex));
  add(27, 'מבט שלם', 'תחושת זרות חוזרת: בחתונה, מול הדלת, וגם מול אחיך.', r.report.recurring);
  const c = assembleWhole({ ...emptyWhole, overview: [{ source: 'interpretation', segment: -1, action: '', actor: '', target: '', moment: '', quote: '', basis: [], text: 'אולי.' }], contrast: { text: 'בחתונה הרגשת זרה אבל שייכת פנימה דרך השיר, מול אחיך התחושות נעות בין חיבור לכאב של מרחק.', quotes: [{ moment: 'm4', quote: 'זרה בתוך כל השמחה' }, { moment: 'm3', quote: ex[2].answers[0].split(/\s+/).slice(0, 4).join(' ') }] } }, wholeSrc('rich', ex));
  add(28, 'מבט שלם', 'בחתונה הרגשת זרה אבל שייכת פנימה דרך השיר...', c.report.contrast);
}
{
  const sx = [
    { id: 'm1', label: 'אבא', segments: [seg('sensitive', 'אבא שלי')], answers: answersOf('sensitive', 0), question: '', insight: null },
    { id: 'm2', label: 'לא הצלחתי להעיר', segments: [seg('sensitive', 'אבא שלי')], answers: answersOf('sensitive', 1), question: '', insight: null },
    { id: 'm3', label: 'בית חולים', segments: [seg('sensitive', 'רדפו')], answers: answersOf('sensitive', 2), question: '', insight: null },
  ];
  const r = assembleWhole({ ...emptyWhole, overview: [{ source: 'user', segment: -1, action: '', actor: '', target: '', moment: 'm1', quote: 'רוצה לדעת שהוא בסדר', basis: [], text: 'הרצון לדעת שהוא בסדר פגש שקט בלתי משתנה.' }], connections: [{ from: 'm1', to: 'm2', title: 'המעבר לבלי מענה', fromQuote: 'רוצה לדעת שהוא בסדר', toQuote: 'לא יודעת', link: 'אולי הרצון לדעת פוגש כאן את מה שאין עליו תשובה.' }] }, { ...wholeSrc('sensitive', []), explored: sx });
  add(29, 'מבט שלם', 'קשר "המעבר לבלי מענה" על בסיס "לא יודעת"', r.report.connections[0] ?? []);
  add(30, 'מבט שלם', 'הרצון לדעת שהוא בסדר פגש שקט בלתי משתנה.', r.report.overview[0]?.reasons ?? []);
}

rows.sort((a, b) => a.id - b.id);
const count = (c: Row['caught']) => rows.filter((r) => r.caught === c).length;
const esc = (t: string) => t.replace(/\|/g, '/').replace(/\n/g, ' ');
const md = `# 34. מדד: 30 הליקויים של final-5 מול הבדיקות החדשות

נוצר אוטומטית (scripts/benchmark30.ts), בלי קריאת מודל. כל משפט נלקח מילה במילה מ-29-stage3b-eval-final-5.json, ונבדק בבדיקה שתראה אותו עכשיו, עם ההצהרה הנוחה ביותר שמודל יכול לתת (החלק הנכון בחלום, הפועל והמבצע האמיתיים, ציטוט אמיתי). "נתפס" פירושו שהבעיה עצמה מכשילה את המשפט, ולכן הוא לא יוצג כפי שהוא. אימות מילים ודקדוק אינו הוכחה לנכונות.

**נתפס: ${count('נתפס')} · חלקית: ${count('חלקית')} · לא נתפס: ${count('לא נתפס')}** (מתוך ${rows.length})

| # | שכבה | המשפט / הליקוי | תוצאה | למה |
|---|---|---|---|---|
${rows.map((r) => `| ${r.id} | ${r.layer} | ${esc(r.text)} | ${r.caught} | ${esc(r.why)} |`).join('\n')}
`;
writeFileSync(new URL('../docs/upgrade-2026-10/34-stage3b-benchmark-30.md', import.meta.url), md);
console.log(`caught ${count('נתפס')}, partly ${count('חלקית')}, not caught ${count('לא נתפס')} of ${rows.length}`);
