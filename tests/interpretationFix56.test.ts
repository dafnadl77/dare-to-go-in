import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as I from '../src/hero/interpretationCheck.ts';
import * as C from '../src/hero/claimCheck.ts';
import { segmentDream } from '../src/hero/dreamSegments.ts';
import * as G from './fixtures/goldenSet.ts';

/**
 * THE FIX ROUND OF doc 56 (after the development run p2dev-1). Written BEFORE the fixes and run first against the code of phase 2
 * (docs/upgrade-2026-10/57-fix56-tests-before.txt). The sentences are what the system really showed in that run (dream dev-a), copied
 * from docs/upgrade-2026-10/33-stage3b-fix-eval-p2dev-1.json; every rule is ALSO tested alone, so that no test passes "for another reason"
 * (the lesson of doc 56, problem 1).
 */

const RUN = JSON.parse(readFileSync(new URL('../docs/upgrade-2026-10/33-stage3b-fix-eval-p2dev-1.json', import.meta.url), 'utf8'));
const DEV_A: string = RUN.journeys[0].text;
const SEGS = segmentDream(DEV_A);
const STEPS = RUN.journeys[0].steps as { momentText: string; answer: string; insightReport: { cards: I.SourceCard[]; texts: { possibilities: string[] } } }[];
const ANSWERS = STEPS.map((s) => s.answer);
const segOf = (text: string) => SEGS.filter((s) => text.includes(s.text) || s.text.includes(text)).map((s) => s.id);
const momentSources = (i: number) => ({ language: 'he' as const, sourceText: DEV_A, segments: SEGS, allowed: segOf(STEPS[i].momentText), answers: [STEPS[i].answer] });
const wholeSources = () => ({ language: 'he' as const, sourceText: DEV_A, segments: SEGS, allowed: STEPS.flatMap((s) => segOf(s.momentText)), answers: ANSWERS });
const aboutHer = (reasons: string[]) => reasons.some((r) => /inner world/.test(r));
const whole = (t: string) => C.verifyInterpretation(t, [], new Set(), wholeSources(), { requireBasis: false });

// ------------------------------------------------------------------------------------------------ 1. the final-letter bug: every marker alone

test('1. each marker of a claim about her works alone ("אצלך", "בך", "בתוכך", "לעצמך", "הצורך שלך", "את חושבת", "שמרגשים אותך")', () => {
  const s = wholeSources();
  const cases = [
    'אולי השוק מבליט אצלך את הריח.',
    'אולי הריח בשוק מעורר בך משהו.',
    'אולי בתוכך השוק נשאר רועש.',
    'אולי את שומרת לעצמך את הריח בשוק.',
    // ("הרצון" would match the dream's "רצתה", the sister's wish: a limitation reported in doc 59)
    'אולי הצורך שלך הוא לחפש מתנה.',
    'אולי את חושבת על הדוכנים בשוק.',
    'אולי את מבינה את הדוכנים בשוק.',
    'אולי הדוכנים בשוק הם פרטים שמרגשים אותך.',
  ];
  for (const t of cases) assert.ok(aboutHer(C.verifyInterpretation(t, [], new Set(), s, { requireBasis: false })), t);
});

test('1. the sentences shown in the run that claim something about her are refused for that claim (first look, whole view)', () => {
  for (const t of [
    'אולי הרעש, הריחות וההתרחשות מסביב בשוק הם משהו שמבליט אצלך את היכולת להרגיש ייחודיות גם במקומות לא מוכרים.',
    'אולי החוויה בשוק משלבת אצלך מצד אחד תחושת חוויה ייחודית ומלאת גירויים, ומצד שני רגעים של בלבול והפתעה כשדברים קורים בלי הסבר ברור.',
    'אפשר לראות שהשוק נתפס אצלך גם כמקום של ייחודיות וגם כמקום שבו קורים דברים מבלבלים ובלתי צפויים.',
    'ייתכן שהשוק מעלה אצלך תחושה של התרחשות עשירה, גם אם הדברים לא לגמרי מובנים או צפויים.',
  ])
    assert.ok(aboutHer(whole(t)), t);
});

test('1. her own words given back are not refused ("אמרת שהרגשת מופתעת")', () => {
  assert.deepEqual(C.verifyInterpretation('אולי, כמו שאמרת, הרגשת מופתעת כשמצאת את החברה על המדרגות.', [], new Set(), momentSources(1), { requireBasis: false }), []);
});

// ------------------------------------------------------------------------------------------------ 2. the mental verb itself must be hers

test('2. "הרגשת" is a claim about her: it must be her word, not the one free word of the window', () => {
  const r = C.verifyInterpretation('אולי חיפשת מתנה ובכל זאת הרגשת את המיוחד שבמקומות כאלה.', [], new Set(), momentSources(0), { requireBasis: false });
  assert.ok(aboutHer(r), r.join('; '));
  assert.ok(!aboutHer(C.verifyInterpretation('אולי הרגשת מופתעת כשמצאת את החברה על המדרגות.', [], new Set(), momentSources(1), { requireBasis: false })), 'she said "הרגשתי מופתעת"');
});

// ------------------------------------------------------------------------------------------------ 3. words that claim a link

test('3. "ובכל זאת" and "גם… וגם" claim a link: stated as a fact without basis they are refused; offered openly or founded they pass', () => {
  const s = momentSources(0);
  const card = (relation: I.Relation): I.SourceCard => ({ relation, anchors: [{ quote: 'חיפשנו מתנה למישהי שאני בכלל לא מכירה', from: 'dream' }, { quote: 'זה היה המיוחד במקומות כאלה', from: 'answer' }], basis: [], aboutHer: [], openEdge: '' });
  const v = (text: string, relation: I.Relation) => I.verifyCandidate({ text, card: card(relation) }, s);
  assert.equal(v('חיפשת מתנה למישהי שאת בכלל לא מכירה, ובכל זאת אמרת שזה היה המיוחד במקומות כאלה.', 'open-link').safety.ok, false, '"ובכל זאת" as a fact, no basis');
  assert.equal(v('המתנה הייתה גם למישהי שאת לא מכירה וגם המיוחד במקומות כאלה.', 'open-link').safety.ok, false, '"גם… וגם" as a fact, no basis');
  assert.equal(v('אולי יש קשר בין המתנה למישהי שאת לא מכירה לבין מה שאמרת, שזה היה המיוחד במקומות כאלה.', 'open-link').safety.ok, true, 'offered openly');
});

// ------------------------------------------------------------------------------------------------ 4. "אפשר לראות את X כ-Y" with an inner meaning she did not give

test('4. "אפשר לראות את X כ…" that turns an image into something she never said is refused', () => {
  const r = whole('אפשר לראות את ההליכה בשוק כמפגש עם משהו חדש שמאפשר לך להבחין בפרטים הקטנים.');
  assert.ok(r.some((x) => /psychological|meaning/.test(x)), r.join('; '));
  assert.deepEqual(C.verifyInterpretation('אפשר לראות את הישיבה על המדרגות כרגע שבו הכד שאחותך רצתה כבר אצל החברה.', [], new Set(), momentSources(1), { requireBasis: false }), [], 'X as a moment of the dream itself');
});

// ------------------------------------------------------------------------------------------------ 5. the level estimate

test('5. an echo inside the moment (her answer repeats the dream anchor) is level 0, whatever "אולי יש קשר" says (possibility 2 of the run)', () => {
  const v = I.verifyCandidate({ text: STEPS[1].insightReport.texts.possibilities[0], card: STEPS[1].insightReport.cards[0] }, momentSources(1));
  assert.equal(v.quality.level, 0, v.quality.notes.join('; '));
});

test('5. a card whose "basis" is not in its anchors is not rated 3 (possibility 1 of the run, rewritten without its unfounded claims)', () => {
  const c = STEPS[0].insightReport.cards[0];
  const v = I.verifyCandidate({ text: 'אולי יש קשר בין המתנה למישהי שאת בכלל לא מכירה לבין מה שאמרת, שזה היה המיוחד במקומות כאלה.', card: c }, momentSources(0));
  assert.ok(v.quality.level <= 2, `${v.quality.level}: ${v.quality.notes.join('; ')}`);
});

test('5. the golden set keeps its levels (W1 open link with her words stays 3; W5, W7, W8 stay 2)', () => {
  for (const e of G.WRITTEN) assert.equal(I.verifyCandidate({ text: e.text, card: e.card as never }, G.sourcesOf(e.dream)).quality.level, e.level, e.id);
});
