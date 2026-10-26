import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as X from '../src/hero/exploration.ts';
import * as C from '../src/hero/claimCheck.ts';
import * as S from '../src/hero/dreamSegments.ts';
import * as H from '../src/hero/hebrewText.ts';
import * as Q from '../src/hero/explorationSchema.ts';

/**
 * STAGE 3B QUALITY ROUND: the problems found in the final fix run (docs/upgrade-2026-10/35-stage3b-fix-report.md), as tests written
 * BEFORE the fix. Every sentence below is copied from that run or built the same way. Run first against the code as it was (they fail,
 * see docs/upgrade-2026-10/38-stage3b-quality-tests-before.txt), then against the fix. New functions are reached through namespace
 * imports, so a missing one fails its own test only.
 */

const T = new Date('2026-10-21T12:00:00Z');
const RICH = 'הייתי בחתונה של חברה. כולם לבשו לבן ואני לבשתי שחור. אחי הקטן נתן לי מפתח ואמר שזה למקום שעוד לא הייתי בו. הלכנו לאורך החוף, והים התרחק ולא חזר. מישהו שר שיר שלא הכרתי, אבל ידעתי את כל המילים. כשהגענו לדלת, המפתח היה קטן מדי.';
const SENSITIVE = 'רדפו אחריי במסדרון ארוך בבית חולים. הדלתות נסגרו אחת אחרי השנייה. בסוף הגעתי לחדר שבו אבא שלי ישן במיטה, ולא הצלחתי להעיר אותו.';
const DICTATED =
  'אני הייתי בבית של סבתא שלי אבל הבית היה יותר גבוה כאילו עוד קומות שלא היו שם אף פעם ואמא שלי עמדה במטבח וקיפלה מגבות ולא דיברה איתי ואז השכנה מלמטה עלתה ונתנה לי צנצנת עם ריבה ואמרה שזה בשבילך תשמרי את זה ופתאום שמתי לב שמישהו ערך את השולחן לשישה אנשים ואני לא יודעת מי אבל היו רק שתינו ואז ניסיתי להדליק את האור בסלון והמתג לא עשה כלום הוא הסתובב בידיים שלי כמו בורג רפוי ואמא שלי חיבקה אותי מאחורה בלי להגיד מילה ואני הרגשתי שאני רוצה לבכות ולא יכולה ומה שהיה לפני זה אני זוכרת שעמדתי למטה בחצר והחלון של סבתא היה פתוח ומישהו קרא בשם שלי אבל לא בקול של אף אחד שאני מכירה';

const fn = <T>(mod: unknown, name: string): T => {
  const f = (mod as Record<string, unknown>)[name];
  assert.equal(typeof f, 'function', `${name} exists`);
  return f as T;
};

// ------------------------------------------------------------------------------------------------ 1. a new whole view never wipes a valid one

function twoExplored() {
  let e = X.createExploration('att', [{ label: 'המפתח הקטן', excerpt: 'כשהגענו לדלת, המפתח היה קטן מדי' }, { label: 'הים', excerpt: 'הלכנו לאורך החוף, והים התרחק ולא חזר' }, { label: 'השמלה', excerpt: 'כולם לבשו לבן ואני לבשתי שחור' }]);
  const go = (id: string, answer: string) => {
    e = X.beginMoment(e, id, 'q?', 'adaptive', T);
    e = X.answerMoment(e, id, answer);
    e = X.receiveReply(e, id, { observation: 'ת', reflection: 'ש', possibility: 'אולי פ' }, null);
    e = X.completeMoment(e, id, T);
  };
  go('m1', 'הרגשתי אכזבה כשניסיתי לדחוף אותו');
  go('m2', 'הכל נראה שומם יותר, כאילו משהו חסר');
  return { e: () => e, go };
}
const link = { from: 'm2', to: 'm1', title: 'חסר ואכזבה', basis: '«כאילו משהו חסר» · «הרגשתי אכזבה» — אולי יש דמיון', fromQuote: 'כאילו משהו חסר', toQuote: 'הרגשתי אכזבה' };

test('an update that finds no new link keeps the valid links already shown, and the earlier view stays in the history', () => {
  const j = twoExplored();
  let e = X.receiveWholeView(j.e(), { kind: 'whole', overview: 'אולי שני הרגעים נוגעים בחסר.', recurring: null, contrast: null, readings: [], closingQuestion: 'איפה את פוגשת חסר?', connections: [link] } as never, X.basedOnKey(j.e()), T);
  j.go('m3', 'הרגשתי זרה בין כולם');
  const before = e;
  e = X.receiveWholeView(Object.assign(before, j.e(), { wholeView: before.wholeView, wholeViewCount: before.wholeViewCount }), { kind: 'no-link', overview: 'עוד לא נמצא קשר חדש.', recurring: null, contrast: null, readings: [], closingQuestion: '', connections: [] } as never, X.basedOnKey(j.e()), T);
  assert.deepEqual(e.wholeView?.connections.map((c) => c.title), ['חסר ואכזבה'], 'the earlier valid link is still shown');
  assert.ok(e.wholeView?.closingQuestion, 'and its closing question');
  const history = (e as unknown as { wholeViewHistory?: unknown[] }).wholeViewHistory;
  assert.equal(history?.length, 1, 'the earlier view is kept in the history');
});

test('an earlier link whose words are no longer in the answers is not carried into the update', () => {
  const j = twoExplored();
  const stale = { ...link, title: 'ישן', fromQuote: 'משפט שהיא לא אמרה', toQuote: 'הרגשתי אכזבה' };
  let e = X.receiveWholeView(j.e(), { kind: 'whole', overview: 'אולי.', recurring: null, contrast: null, readings: [], closingQuestion: 'מה?', connections: [stale] } as never, X.basedOnKey(j.e()), T);
  j.go('m3', 'הרגשתי זרה בין כולם');
  e = X.receiveWholeView(Object.assign(e, j.e(), { wholeView: e.wholeView, wholeViewCount: e.wholeViewCount }), { kind: 'no-link', overview: 'עוד לא נמצא קשר חדש.', recurring: null, contrast: null, readings: [], closingQuestion: '', connections: [] } as never, X.basedOnKey(j.e()), T);
  assert.deepEqual(e.wholeView?.connections ?? [], []);
});

// ------------------------------------------------------------------------------------------------ 2. no empty opening, no missing closing, no long quote for a short description

const SEGS = S.segmentDream(RICH);
const seg = (piece: string) => SEGS.find((s) => s.text.includes(piece))!.id;
const explored2 = [
  { id: 'm1', label: 'המפתח', segments: [seg('קטן מדי')], answers: ['גיליתי שהוא קטן ודק. הרגשתי אכזבה כשניסיתי לדחוף אותו.'], question: 'q1?', insight: null },
  { id: 'm2', label: 'הים', segments: [seg('הלכנו'), seg('הים התרחק')], answers: ['הכל נראה שומם יותר, כאילו משהו חסר.'], question: 'q2?', insight: null },
];
const bad = (text: string) => ({ source: 'interpretation', segment: -1, action: '', actor: '', target: '', moment: '', quote: '', basis: ['m1'], text });

test('when every opening sentence is refused, a short opening is built from her own words (not left empty)', () => {
  const r = C.assembleWhole(
    {
      overview: [bad('השממה והאכזבה הן התמונה השלמה של החלום.')],
      connections: [{ from: 'm2', to: 'm1', title: 'חסר ואכזבה', fromQuote: 'כאילו משהו חסר', toQuote: 'הרגשתי אכזבה', link: 'אולי יש דמיון בין משהו חסר לאכזבה מהמפתח.' }],
      recurring: { element: '', text: '', quotes: [] },
      contrast: { text: '', quotes: [] },
      readings: [],
      closing: { text: '', moment: '', quote: '' },
    },
    { language: 'he', sourceText: RICH, segments: SEGS, explored: explored2, unexplored: [], previous: null, maxReadings: 2 },
  );
  assert.equal(r.view.kind, 'whole');
  assert.ok(r.view.overview.trim().length > 0, 'an opening is shown');
  assert.ok(/חסר|אכזבה/.test(r.view.overview), `built from her words: ${r.view.overview}`);
  assert.ok(!r.view.overview.includes('התמונה השלמה'));
  assert.ok(r.view.closingQuestion.trim().endsWith('?'), `a closing question is shown: "${r.view.closingQuestion}"`);
});

const LONG = S.segmentDream(DICTATED);
test('a dream sentence that cannot be checked is replaced by a SHORT quote, never the whole long part', () => {
  const part = LONG.find((s) => s.text.includes('המתג'))!;
  const r = C.assembleReply(
    { dream: [{ segment: part.id, action: '', actor: 'dreamer', target: '', text: 'המתג הסתובב בידיים שלך כמו בורג רפוי.' }], user: [], possibilities: [] },
    { language: 'he', sourceText: DICTATED, segments: LONG, allowed: [part.id], answers: ['הרגשתי תסכול'] },
  );
  const quotedWords = r.insight.observation.replace(/[«»…]/g, ' ').trim().split(/\s+/).length;
  assert.ok(quotedWords <= 14, `${quotedWords} words: ${r.insight.observation}`);
  assert.ok(r.insight.observation.includes('בורג רפוי'), 'the quote is the piece the sentence was about');
});

test('a verb written as two words ("ניסיתי להדליק") is still checked as the event', () => {
  const part = LONG.find((s) => s.text.includes('להדליק'))!;
  const v = C.verifyDreamClaim({ segment: part.id, action: 'ניסיתי להדליק', actor: 'dreamer', target: '', text: 'ניסית להדליק את האור בסלון.' }, { language: 'he', sourceText: DICTATED, segments: LONG, allowed: [part.id], answers: [] });
  assert.equal(v.status, 'checked', v.reasons.join('; '));
});

// ------------------------------------------------------------------------------------------------ 3. a dictated dream: different events stay apart

test('a dictated dream: the switch, the hug and wanting to cry are separate parts; "ומה שהיה לפני זה" is never cut in two', () => {
  const parts = S.segmentDream(DICTATED).map((s) => s.text);
  const holding = (w: string) => parts.filter((p) => p.includes(w));
  assert.equal(holding('המתג').length, 1);
  assert.ok(!holding('המתג')[0].includes('חיבקה'), `the switch and the hug are apart: ${holding('המתג')[0]}`);
  assert.ok(!holding('חיבקה')[0].includes('לבכות'), `the hug and wanting to cry are apart: ${holding('חיבקה')[0]}`);
  assert.ok(!holding('קומות')[0].includes('קיפלה'), 'the taller house and mother folding towels are apart');
  assert.ok(parts.some((p) => p.includes('ומה שהיה לפני זה')), `the flashback opening stays whole: ${parts.join(' | ')}`);
  assert.ok(parts.every((p) => p.split(/\s+/).length >= 3), 'no fragment shorter than three words');
});

// ------------------------------------------------------------------------------------------------ 4. Hebrew refused by mistake

test('words that only look like first person or a feeling are not refused ("שאינו", "שנתנו", "לשים לב", "מתרוקנת", "מעצבות", "מכשולים", "מתאימים")', () => {
  for (const w of ['שאינו', 'שנתנו', 'אינו']) assert.equal(H.isFirstPersonWord(w), false, w);
  for (const w of ['לשים', 'מתרוקנת', 'מעצבות', 'מכשולים', 'מתאימים']) assert.equal(H.isFeelingWord(w), false, w);
  for (const w of ['פחד', 'החולשה', 'לחוסר', 'מתגעגעת', 'הבדידות', 'לציפיות', 'שייכת', 'מאמץ']) assert.equal(H.isFeelingWord(w), true, w);
  for (const w of ['אחי', 'הלכתי', 'שלי', 'הגענו']) assert.equal(H.isFirstPersonWord(w), true, w);
});

test('a closing question about her life may use everyday words that also occur elsewhere in the dream ("מוכרים")', () => {
  const v = C.verifyQuestion(
    { question: 'מה עובר עלייך כשדברים מוכרים משתנים, כמו הבית שהשתנה?', focus: 'memory', subject: '' },
    { language: 'he', segments: LONG, momentSegments: [LONG.find((s) => s.text.includes('קומות'))!.id], answers: ['הכל השתנה בבית, והזיכרונות התערבבו לי'], prior: [], closing: true },
  );
  assert.deepEqual(v.reasons, []);
});

// ------------------------------------------------------------------------------------------------ 7. not in a possibility either: intentions, fixed meanings, unproven order, feelings she did not say

const SSEGS = S.segmentDream(SENSITIVE);
const src = (answers: string[], segs = SEGS, text = RICH) => ({ language: 'he' as const, sourceText: text, segments: segs, allowed: segs.map((s) => s.id), answers });
const interp = (text: string, answers: string[], segs = SEGS, dream = RICH) => C.verifyInterpretation(text, ['d0'], new Set(['d0']), src(answers, segs, dream));

test('a possibility may not give an image a fixed meaning, "indicate" something, or give a figure an intention', () => {
  assert.ok(interp('אולי הבית הגבוה מסמן שהעבר שלך מרגיש לפעמים רחוק.', ['הכל היה נראה כבד']).length > 0, 'מסמן');
  assert.ok(interp('ייתכן שהאכזבה מהמפתח הקטן מדי מצביעה על תחושת פער.', ['הרגשתי אכזבה']).length > 0, 'מצביעה על');
  assert.ok(interp('אולי אחיך רצה שתמצאי מקום חדש בעצמך.', ['הוא נראה רגוע ומחייך']).length > 0, 'an intention for the brother');
  assert.ok(interp('אולי המבט שלו מראה אמון שהוא נותן בך.', ['היה לו מבט בטוח']).length > 0, 'trust attributed to the brother');
  assert.ok(interp('אולי הים המתרחק הוא דימוי לאובדן.', ['כאילו משהו חסר']).length > 0, 'דימוי ל');
});

test('a possibility may not give her a feeling she did not say, in any wording ("מחסום רגשי", "שבריריות" for "פגיע"), nor broken Hebrew ("שלבד")', () => {
  assert.ok(interp('אולי יש כאן מחסום רגשי מול אבא שלך.', ['זה היה קשה לראות אותו ככה'], SSEGS, SENSITIVE).length > 0, 'מחסום רגשי');
  assert.ok(interp('אולי יש כאן רוגע וגם שבריריות.', ['אבא שלי נראה רגוע, אבל גם פגיע'], SSEGS, SENSITIVE).length > 0, 'שבריריות');
  assert.ok(interp('אולי כשהים נסוג, התחושה שלך שלבד וגעגוע לאחיך מדגישה את מה שנשאר.', ['הרגשתי לבד ושאני מתגעגעת אליו']).length > 0, 'שלבד');
});

test('a link or opening may not put moments in an order the dream does not state ("רצף", "מוביל", "מתחילה כבר")', () => {
  const ex = [
    { id: 'm1', label: 'רדיפה', segments: [0], answers: ['ניסיתי לברוח, הדלתות נסגרו מולי'], question: 'q?', insight: null },
    { id: 'm2', label: 'דלתות', segments: [1], answers: ['היה שקט, חוץ מהדפיקות שלי'], question: 'q?', insight: null },
  ];
  const r = C.assembleWhole(
    {
      overview: [bad('אולי אפשר לראות רצף של מצבים שבהם משהו חוסם.'), { ...bad('אולי השקט מוביל לתחושה של קושי.'), basis: ['m1', 'm2'] }],
      connections: [{ from: 'm1', to: 'm2', title: 'הדלתות', fromQuote: 'הדלתות נסגרו מולי', toQuote: 'היה שקט', link: 'ייתכן שהתחושה במסדרון מתחילה כבר בשקט של הדלתות.' }],
      recurring: { element: '', text: '', quotes: [] },
      contrast: { text: '', quotes: [] },
      readings: [],
      closing: { text: '', moment: '', quote: '' },
    },
    { language: 'he', sourceText: SENSITIVE, segments: SSEGS, explored: ex, unexplored: [], previous: null, maxReadings: 2 },
  );
  const shown = [r.view.overview, ...r.view.connections.map((c) => c.basis)].join(' ');
  assert.ok(!/רצף|מוביל|מתחילה כבר/.test(shown), shown);
});

test('the guards are not "refuse everything": careful possibilities still pass', () => {
  assert.deepEqual(interp('אולי הים שהתרחק ולא חזר נותן מקום לחסר ולגעגוע שתיארת.', ['כאילו משהו חסר', 'הרגשתי לבד ושאני מתגעגעת אליו']), []);
  assert.deepEqual(interp('אולי אפשר לראות בדלתות שנסגרות אחת אחרי השנייה משהו שמקשה לעבור.', ['ניסיתי לברוח'], SSEGS, SENSITIVE), []);
  assert.deepEqual(interp('ייתכן שהאכזבה מהמפתח הקטן מדי פוגשת פער בין מה שיש לך למה שנדרש.', ['הרגשתי אכזבה']), []);
});

// ------------------------------------------------------------------------------------------------ 5. questions that open curiosity, not only more description

const qctx = (prior: { question: string; focus: C.QuestionFocus | null; subject: string | null }[] = []) => ({ language: 'he' as const, segments: SEGS, momentSegments: [seg('קטן מדי')], answers: [], prior });

test('questions about what stood out, what surprised her, or why she chose the moment pass', () => {
  for (const q of ['מה בלט לך ברגע הזה?', 'מה הפתיע אותך ברגע שבו המפתח היה קטן מדי?', 'מה משך אותך לבחור דווקא ברגע הזה?', 'מה הרגע הזה מזכיר לך, אם בכלל?'])
    assert.deepEqual(C.verifyQuestion({ question: q, focus: 'detail', subject: '' }, qctx()).reasons, [], q);
});

test('two questions in one sentence, or a second descriptive question in a row, are refused', () => {
  assert.ok(C.verifyQuestion({ question: 'איזו דלת נסגרה ראשונה ומה ראית עליה כשזה קרה?', focus: 'sense', subject: 'דלת' }, qctx()).reasons.length > 0, 'two questions');
  const prior = [{ question: 'איך נראתה התחנה הריקה סביבך?', focus: 'sense' as const, subject: 'תחנה' }];
  assert.ok(C.verifyQuestion({ question: 'איך נראה המפתח כשהיה קטן מדי?', focus: 'detail', subject: 'מפתח' }, qctx(prior)).reasons.length > 0, 'a second description question in a row');
});

test('the question prompt asks for curiosity and personal connection without assuming a feeling', () => {
  const p = Q.buildMomentQuestionSystemPrompt('he', 'feminine');
  assert.match(p, /stood out/);
  assert.match(p, /surprised/);
  assert.match(p, /drew (her|them) to/);
  void fn;
});

// ------------------------------------------------------------------------------------------------ found in development run q-dev-1 (added after it)

test('dev run 1: "ואני לא יודע" is the dreamer; "את תשומת ליבך" is not her action; "לאדם אחר" is not an order word; "בטוח" (sure) is not a feeling', () => {
  assert.deepEqual(S.whoActs('ואני לא יודע לאן אני צריך להגיע', 'יודע'), { kind: 'dreamer' });
  const segs = S.segmentDream('אחותי התמקחה עם מוכר על כד חרס כחול. אני עמדתי בצד.');
  const ctx = { language: 'he' as const, segments: segs, momentSegments: [0], answers: [], prior: [] };
  assert.deepEqual(C.verifyQuestion({ question: 'מה תפס את תשומת ליבך בהתמקחות עם המוכר?', focus: 'salience', subject: '' }, ctx).reasons, []);
  assert.equal(H.isTimeWord('אחר'), false);
  assert.equal(H.isFeelingWord('בטוח'), false);
  assert.ok(C.verifyInterpretation('אולי ההפתעה יכולה להצביע על כך שדברים קורים בדרכים שקשה להסביר.', ['d0'], new Set(['d0']), src(['זה היה מפתיע מאוד'])).length > 0, 'להצביע על');
});

test('dev run 1: a modest closing goes back to her feeling word or to the moment by name, never to her first three words', () => {
  const s = { language: 'he' as const, sourceText: RICH, segments: SEGS, explored: [{ id: 'm1', label: 'המפתח הקטן מדי', segments: [seg('קטן מדי')], answers: ['כשגעתי אל הדלת ראיתי שהוא קטן'], question: 'q?', insight: null }], unexplored: [], previous: null, maxReadings: 2 };
  // (doc 70: an open question about the moment, never the general "מה עוד עולה…")
  assert.equal(C.modestClosing(s), 'מה הרגע «המפתח הקטן מדי» מזכיר לך, אם בכלל?');
});

// ------------------------------------------------------------------------------------------------ found in development run q-dev-2 (added after it)

const DEV_B = 'אני נוהג באוטו ישן של אבא שלי בכביש בין שדות ואני לא יודע לאן אני צריך להגיע רק שאני מאחר ולפני זה הייתי במשרד ומישהו השאיר לי על השולחן מעטפה סגורה ולא פתחתי אותה ובכביש אני עוצר ליד תחנת דלק נטושה ויוצא מהאוטו ושומע רדיו מנגן מתוך המבנה ואני נכנס פנימה ואין שם אף אחד אבל על הדלפק יש את אותה מעטפה ואני לוקח אותה וחוזר לאוטו והוא כבר מונע ומחכה לי עם הדלת פתוחה';
const BSEGS = S.segmentDream(DEV_B);
const bseg = (piece: string) => BSEGS.find((s) => s.text.includes(piece))!.id;

test('dev run 2: a word from the neighbouring clause of the same dictated sentence is context, not "another part" ("הכביש")', () => {
  const ctx = { language: 'he' as const, segments: BSEGS, momentSegments: [bseg('מאחר')], answers: [], prior: [] };
  assert.deepEqual(C.verifyQuestion({ question: 'מה הכי בלט לך כשהרגשת שאתה מאחר על הכביש?', focus: 'salience', subject: '' }, ctx).reasons, []);
});

test('dev run 2: correct descriptions are checked, not turned into quotes ("יש" sentences, two verbs, a two-word object, "you did not know")', () => {
  const b = (piece: string) => ({ language: 'he' as const, sourceText: DEV_B, segments: BSEGS, allowed: [bseg(piece)], answers: [] });
  const ok = (piece: string, claim: { action: string; actor: string; target: string; text: string }) => {
    const v = C.verifyDreamClaim({ segment: bseg(piece), ...claim }, b(piece));
    assert.equal(v.status, 'checked', `${claim.text}: ${v.reasons.join('; ')}`);
  };
  ok('הדלפק', { action: 'יש', actor: 'מעטפה', target: '', text: 'על הדלפק יש את אותה מעטפה.' });
  ok('מאחר', { action: 'יודע', actor: 'dreamer', target: 'dreamer', text: 'לא ידעת לאן אתה צריך להגיע.' });
  ok('השאיר', { action: 'השאיר', actor: 'מישהו', target: 'מעטפה סגורה', text: 'מישהו השאיר לך על השולחן מעטפה סגורה.' });
  ok('השאיר', { action: 'השאיר', actor: 'dreamer', target: '', text: 'לא פתחת את המעטפה.' });
});

test('dev run 2: the safe question asks what was not asked yet; a modest opening quotes her voice; "ומתי" is not first person', () => {
  assert.equal(C.fallbackQuestion('he', false, ['salience']).focus, 'connection');
  assert.equal(H.isFirstPersonWord('ומתי'), false);
  assert.equal(H.isTimeWord('הראשון'), false);
  const s = { language: 'he' as const, sourceText: RICH, segments: SEGS, explored: [{ id: 'm1', label: 'השוק', segments: [0], answers: ['אני זוכרת שאחותי התמקחה עם המוכר, וזה היה ממש מצחיק.'], question: 'q?', insight: null }], unexplored: [], previous: null, maxReadings: 2 };
  assert.match(C.modestOpening(s), /«/);
});

// ------------------------------------------------------------------------------------------------ found reading the final run q-final (added after it; the run itself ran without this fix)

test('final run: a plural feeling word is a feeling too ("המאמצים", "פחדים", "געגועים")', () => {
  for (const w of ['המאמצים', 'פחדים', 'געגועים']) assert.equal(H.isFeelingWord(w), true, w);
  assert.ok(interp('אולי כל המאמצים וההמתנה לא קיבלו תשובה.', ['הרגשתי אכזבה וכעס']).length > 0, 'a feeling she did not name, in the plural');
});
