/**
 * The development run p2dev-1 (doc 56) replayed through the code as it is now, with no model call: every candidate the model really
 * wrote (with its source card) and every whole-view sentence it really wrote are checked again, and what would be shown is compared
 * with what was shown. Writes docs/upgrade-2026-10/58-p2dev-replay.md.   Run: npx tsx scripts/p2devReplay.ts
 *
 * Only dream dev-a: the run stopped at its cost cap during dev-b, whose output was not saved (doc 56, problem 6).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as I from '../src/hero/interpretationCheck.ts';
import * as C from '../src/hero/claimCheck.ts';
import { segmentDream } from '../src/hero/dreamSegments.ts';

const DOCS = new URL('../docs/upgrade-2026-10/', import.meta.url);
const run = JSON.parse(readFileSync(new URL('33-stage3b-fix-eval-p2dev-1.json', DOCS), 'utf8'));
const J = run.journeys[0];
const segs = segmentDream(J.text);
const segOf = (text: string) => segs.filter((s) => text.includes(s.text) || s.text.includes(text)).map((s) => s.id);
const out: string[] = [];
const say = (s = '') => out.push(s);
const LEVEL = ['0 (הד או ריק)', '1 (שיקוף)', '2 (הבחנה)', '3 (תובנה מעוררת מחשבה)'];
const line = (v: I.CandidateVerdict) => (v.safety.ok ? `**מותר.** רמה ${LEVEL[v.quality.level]}, ציון ${v.quality.score}. ${v.quality.notes.join('; ')}` : `**נפסל:** ${v.safety.reasons.join('; ')}`);

say('# 58. ריצת הפיתוח p2dev-1, מורצת שוב דרך הקוד המתוקן (בלי AI)');
say();
say('נוצר על ידי `scripts/p2devReplay.ts`.');
say('- **המשפטים:** בדיוק מה שהמודל כתב בריצה, כולל כרטיסי המקורות.');
say('- **"לפני":** מה שהוצג בריצה.');
say('- **"אחרי":** מה שהקוד המתוקן מחליט על אותם משפטים.');
say('- **מה לא רץ שוב:** רק dev-a. הפלט של dev-b לא נשמר (doc 56).');
say();

let shownBefore = 0, blockedAfter = 0;
const earlier: string[] = [];
J.steps.forEach((st: { moment: string; momentText: string; question: { text: string }; answer: string; insight: { possibility: string }; insightReport: { cards: I.SourceCard[]; texts: { possibilities: string[] } } }, k: number) => {
  const s = { language: 'he' as const, sourceText: J.text, segments: segs, allowed: segOf(st.momentText), answers: [st.answer] };
  const cands = st.insightReport.texts.possibilities.map((text, i) => ({ text, card: st.insightReport.cards[i] ?? null }));
  const pick = I.selectPossibility(cands, s, { exploredCount: 1, earlier, exchanges: [{ question: st.question.text, answer: st.answer }] });
  say(`## צעד ${k + 1}: «${st.moment}»`);
  say();
  say(`- **מה הוצג לפני:** ${st.insight.possibility || '(אין)'}`);
  cands.forEach((c, i) => say(`- **מועמדת ${i + 1}:** "${c.text}" — ${line(pick.verdicts[i])}`));
  if (st.insight.possibility) { shownBefore++; if (pick.index === null || cands[pick.index].text !== st.insight.possibility) blockedAfter++; }
  say(`- **מה יוצג אחרי:** ${pick.index === null ? 'אין אפשרות פרשנית. התובנה עובדתית, ואם הוצעה שאלה מזמינה שעוברת, היא מוצגת (בריצה לא הוצעה).' : cands[pick.index].text}`);
  say();
  if (st.insight.possibility) earlier.push(st.insight.possibility);
});

const allSegs = J.steps.flatMap((st: { momentText: string }) => segOf(st.momentText));
const answers = J.steps.map((st: { answer: string }) => st.answer);
J.wholeViews.forEach((w: { afterMoments: number; kind: string; closingQuestion: string; report: { texts: { overview: string[]; readings: string[]; connections: string[]; closing: string } } }, n: number) => {
  const explored = J.steps.slice(0, w.afterMoments);
  const s = { language: 'he' as const, sourceText: J.text, segments: segs, allowed: explored.flatMap((st: { momentText: string }) => segOf(st.momentText)), answers: explored.map((st: { answer: string }) => st.answer) };
  say(`## מבט שלם ${n + 1} (אחרי ${w.afterMoments} רגעים; הוצג לפני כ-${w.kind})`);
  say();
  const lines = [
    ...w.report.texts.overview.filter((o) => o.startsWith('[interpretation]')).map((o) => ['פתיחה', o.replace('[interpretation] ', '')]),
    ...w.report.texts.readings.map((r) => ['קריאה', r.replace(/^s\d+: /, '')]),
    ...w.report.texts.connections.map((c) => ['קשר בין רגעים', c.replace(/^.* — /s, '')]),
  ];
  for (const [what, text] of lines) {
    const r = C.verifyInterpretation(text, [], new Set(), s, { exploredCount: w.afterMoments, requireBasis: false });
    say(`- **${what}:** "${text}"`);
    shownBefore++; if (r.length) blockedAfter++;
    say(`  - לפני: הוצג.`);
    say(`  - אחרי: ${r.length ? `**נפסל:** ${r.join('; ')}` : 'מותר.'}`);
  }
  if (w.report.texts.closing) {
    const q = C.verifyQuestion({ question: w.report.texts.closing, focus: 'memory', subject: '' }, { language: 'he', segments: segs, momentSegments: s.allowed, answers: s.answers, prior: [], closing: true });
    say(`- **שאלת סיום:** "${w.report.texts.closing}"`);
    say(`  - לפני: ${w.closingQuestion === w.report.texts.closing ? 'הוצגה' : 'לא הוצגה'}.`);
    say(`  - אחרי: ${q.reasons.length ? `**נפסלת:** ${q.reasons.join('; ')}` : 'מותרת.'}`);
  }
  say();
});
void allSegs;
void answers;
out.splice(8, 0, '## בקצרה', '', `- **משפטים פרשניים שהוצגו בריצה:** ${shownBefore}.`, `- **מהם, לא יוצגו עם הקוד המתוקן:** ${blockedAfter}.`, '- **שאלות הסיום** (שתיים) עדיין מותרות.', '- **כשכל שורות המבט השלם נפסלות,** המוצר מנסה פעם אחת עם הערת תיקון. אם גם זה לא עובר, הוא מציג סיכום עובדתי ומחזיר את המשבצת. זה מה שהיה קורה כאן.', '- **מועמדות:** בדוח של הריצה נשמרה מועמדת אחת לכל צעד, אף שהמודל התבקש לשלוש. הדוח שומר עד שלוש, ולכן כנראה הגיעה רק אחת (לא בדקתי זאת מול התשובה הגולמית, שלא נשמרה). אין כאן מועמדות נוספות לבחור ביניהן.', '');

writeFileSync(new URL('58-p2dev-replay.md', DOCS), out.join('\n') + '\n');
console.log(`wrote docs/upgrade-2026-10/58-p2dev-replay.md (${out.length} lines)`);
