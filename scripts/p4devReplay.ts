/**
 * The run p4dev-1, every model response in order, decided again by the code after the fix round of doc 70, with no model call: what the
 * run decided, what the code decides now, and which paid calls the run would not have needed. Writes docs/upgrade-2026-10/72-p4dev-replay.md.
 * Run: npx tsx scripts/p4devReplay.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as I from '../src/hero/interpretationCheck.ts';
import * as C from '../src/hero/claimCheck.ts';
import * as S from '../src/hero/explorationSchema.ts';
import { segmentDream } from '../src/hero/dreamSegments.ts';

const DOCS = new URL('../docs/upgrade-2026-10/', import.meta.url);
const run = JSON.parse(readFileSync(new URL('33-stage3b-fix-eval-p4dev-1.json', DOCS), 'utf8'));
const J = run.journeys[0];
const SEGS = segmentDream(J.text);
const segOf = (t: string) => SEGS.filter((s) => t.includes(s.text) || s.text.includes(t)).map((s) => s.id);
const R = run.responses as { stage: string; text: string }[];
const cost = (run.calls as { usd: number }[]).map((c) => c.usd);
const out: string[] = [];
const say = (s = '') => out.push(s);
const LEVEL = ['0', '1', '2', '3'];
let saved = 0;
const savedCalls: string[] = [];

const ask = (i: number, k: number) => {
  const st = J.steps[k];
  const before = J.steps.slice(0, k);
  const ctx = { language: 'he' as const, segments: SEGS, momentSegments: segOf(st.momentText), answers: before.map((b: { answer: string }) => b.answer), prior: before.map((b: { question: { text: string; focus: string } }) => ({ question: b.question.text, focus: b.question.focus as never, subject: null })), explored: before.flatMap((b: { momentText: string }) => segOf(b.momentText)) };
  const cands = JSON.parse(R[i].text).candidates as { question: string; focus: string; subject: string }[];
  return cands.map((c) => {
    const v = C.verifyQuestion(c, ctx);
    const q = I.questionQuality(c.question, { momentText: st.momentText, prior: before.map((b: { question: { text: string } }) => b.question.text), focus: v.focus, answers: ctx.answers });
    return { c, reasons: v.reasons, score: q.score, ok: v.reasons.length === 0 && q.score >= I.QUESTION_FLOOR };
  });
};
const replyPick = (i: number, k: number) => {
  const st = J.steps[k];
  const raw = S.parseMomentReply(JSON.parse(R[i].text))!;
  const s = { language: 'he' as const, sourceText: J.text, segments: SEGS, allowed: segOf(st.momentText), answers: [st.answer] };
  const cands = raw.possibilities.map((p) => ({ text: p.text, card: p.card ?? null }));
  return { cands, pick: I.selectPossibility(cands, s, { exploredCount: 1, earlier: J.steps.slice(0, k).map((b: { insight: { possibility: string } }) => b.insight.possibility), exchanges: [{ question: st.question.text, answer: st.answer }] }) };
};
const wholeOf = (i: number, n: number) => {
  const explored = J.steps.slice(0, n).map((st: { moment: string; momentText: string; answer: string; question: { text: string }; insight: unknown }, k: number) => ({ id: `m${k + 1}`, label: st.moment, segments: segOf(st.momentText), answers: [st.answer], question: st.question.text, insight: st.insight }));
  return C.assembleWhole(S.parseWholeView(JSON.parse(R[i].text))!, { language: 'he', sourceText: J.text, segments: SEGS, explored, unexplored: [], previous: null, maxReadings: 2 } as never);
};
const qLine = (x: ReturnType<typeof ask>[number]) => `"${x.c.question}" — ${x.ok ? `**עוברת** (ציון ${x.score})` : x.reasons.length ? `נפסלת: ${x.reasons.join('; ')}` : `מתחת לרצפה (ציון ${x.score})`}`;

say('# 72. הריצה p4dev-1, כל תשובה של המודל, לפני ואחרי סבב התיקון של doc 70 (בלי AI)');
say();
say('נוצר על ידי `scripts/p4devReplay.ts`. "לפני": מה שהריצה החליטה. "אחרי": מה שהקוד המתוקן מחליט על אותן תשובות בדיוק.');
say('- **מה לא אפשר לדעת מזה:** מה המודל היה כותב בקריאות שלא היו נדרשות. כאן רואים רק את ההחלטות על מה שהוא כבר כתב.');
say();

// step 1
say('## צעד 1: «חיפוש מתנה בשוק»');
say();
const q1 = ask(2, 0);
say('**השאלה (תשובה 3):**');
q1.forEach((x) => say(`- ${qLine(x)}`));
say(`- **לפני:** נשאלה "${J.steps[0].question.text}". **אחרי:** ${q1.filter((x) => x.ok).sort((a, b) => b.score - a.score)[0]?.c.question ?? '(אין)'}.`);
say();
const r1 = replyPick(4, 0);
say('**התובנה (תשובה 5):**');
r1.cands.forEach((c, n) => say(`- "${c.text}" — ${r1.pick.verdicts[n].safety.ok ? `מותרת, רמה ${LEVEL[r1.pick.verdicts[n].quality.level]}` : `נפסלת: ${r1.pick.verdicts[n].safety.reasons.join('; ')}`}`));
say(`- **לפני:** הוצגה "${J.steps[0].insight.possibility}". **אחרי:** ${r1.pick.index === null ? '(אין אפשרות)' : `"${r1.cands[r1.pick.index].text}"`}.`);
say();
const w1 = wholeOf(5, 1);
say('**המבט הראשון (תשובה 6):**');
w1.report.texts.overview.forEach((t, n) => say(`- פתיחה: "${t}" — ${w1.report.overview[n]?.ok ? 'מותרת' : `נפסלת: ${w1.report.overview[n]?.reasons.join('; ')}`}`));
w1.report.texts.readings.forEach((t, n) => say(`- קריאה: "${t}" — ${w1.report.readings[n]?.length ? `נפסלת: ${w1.report.readings[n].join('; ')}` : 'מותרת'}`));
say(`- שאלת סיום: "${w1.report.texts.closing}" — ${w1.report.closing.length ? `נפסלת: ${w1.report.closing.join('; ')}` : 'מותרת'}`);
say(`- **לפני:** ${J.wholeViews[0].kind}, הוצגה הפתיחה, ושאלת הסיום של הקוד "${J.wholeViews[0].closingQuestion}". **אחרי:** ${w1.view.kind}${w1.view.kind === 'factual-summary' ? '' : `; פתיחה: "${w1.view.overview}"; שאלת סיום: "${w1.view.closingQuestion}"`}.`);
say();

// step 2
say('## צעד 2: «מציאת חברה עם כד»');
say();
const q2a = ask(6, 1);
say('**השאלה, הניסיון הראשון (תשובה 7):**');
q2a.forEach((x) => say(`- ${qLine(x)}`));
if (q2a.some((x) => x.ok)) {
  saved += cost[6];
  savedCalls.push(`הניסיון השני של השאלה בצעד 2 ($${cost[6].toFixed(4)})`);
  say(`- **אחרי:** כבר הניסיון הראשון עובר ("${q2a.filter((x) => x.ok).sort((a, b) => b.score - a.score)[0].c.question}"), ולכן **הקריאה השנייה (תשובה 8) לא הייתה נדרשת.**`);
} else say('- **אחרי:** גם עכשיו אף מועמדת לא עוברת, והניסיון השני עדיין נדרש.');
say();
const r2a = replyPick(9, 1);
say('**התובנה, הניסיון הראשון (תשובה 10):**');
r2a.cands.forEach((c, n) => say(`- "${c.text}" — ${r2a.pick.verdicts[n].safety.ok ? `מותרת, רמה ${LEVEL[r2a.pick.verdicts[n].quality.level]}` : `נפסלת: ${r2a.pick.verdicts[n].safety.reasons.join('; ')}`}`));
if (r2a.pick.index !== null) {
  saved += cost[9];
  savedCalls.push(`הניסיון השני של התובנה בצעד 2 ($${cost[9].toFixed(4)})`);
  say(`- **לפני:** כל השלוש נפסלו, ונדרש ניסיון שני, שבו הוצגה "${J.steps[1].insight.possibility}". **אחרי:** כבר מהניסיון הראשון מוצגת "${r2a.cands[r2a.pick.index].text}", ו**הקריאה השנייה (תשובה 11) לא הייתה נדרשת.**`);
} else say('- **אחרי:** גם עכשיו אין אפשרות שעוברת בניסיון הראשון.');
say();

// the whole view
const w2 = wholeOf(11, 2);
say('## המבט השלם אחרי שני רגעים (תשובה 12)');
say();
w2.report.texts.overview.forEach((t, n) => say(`- פתיחה: "${t}" — ${w2.report.overview[n]?.ok ? '**מותרת**' : `נפסלת: ${w2.report.overview[n]?.reasons.join('; ')}`}`));
w2.report.texts.connections.forEach((t, n) => say(`- קשר: "${t}" — ${w2.report.connections[n]?.length ? `נפסל: ${w2.report.connections[n].join('; ')}` : '**מותר**'}`));
w2.report.texts.readings.forEach((t, n) => say(`- קריאה: "${t}" — ${w2.report.readings[n]?.length ? `נפסלת: ${w2.report.readings[n].join('; ')}` : '**מותרת**'}`));
say(`- שאלת סיום: "${w2.report.texts.closing}" — ${w2.report.closing.length ? `נפסלת: ${w2.report.closing.join('; ')}` : '**מותרת**'}`);
say();
say(`- **לפני:** factual-summary (סיכום עובדתי). הניסיון החוזר לא נשלח, כי התקרה עצרה אותו.`);
say(`- **אחרי:** **${w2.view.kind}**${w2.view.notice ? ` ("${w2.view.notice}")` : ''}`);
say(`  - פתיחה: "${w2.view.overview}"`);
say(`  - שאלת סיום: "${w2.view.closingQuestion}"`);
say(`  - ניסיון חוזר: ${S.wholeRetryNote(w2.report, w2.view.kind) ? 'נדרש' : '**לא נדרש**'} (${w2.view.kind === 'no-link' ? 'הוצג מבט כנה בלי קשר, ולכן אין ניסיון חוזר בתשלום' : 'יש בו קשר, חזרה או ניגוד'})`);
say();

say('## כמה קריאות בתשלום היו נחסכות על אותן תשובות');
say();
say(`- ${savedCalls.length ? savedCalls.join('\n- ') : '(אין)'}`);
say(`- **המבט השלם:** לא היה נדרש ניסיון חוזר. בריצה הוא נעצר בגלל התקרה, ולכן הוא לא נכלל בעלות.`);
say(`- **סך החיסכון על התשובות האלה:** $${saved.toFixed(4)}, מתוך $${cost.reduce((a, b) => a + b, 0).toFixed(4)} שהריצה עלתה.`);
say(`- **המבט האחרון בקוד של היום:** ${w2.view.kind === 'factual-summary' ? 'סיכום עובדתי, כי הפתיחה שלו נפסלת בצדק. במוצר יינתן לו ניסיון חוזר אחד עם הערת תיקון; בריצה הזו הניסיון החוזר לא נשלח בגלל התקרה.' : `${w2.view.kind}, ולא סיכום עובדתי.`}`);

writeFileSync(new URL('72-p4dev-replay.md', DOCS), out.join('\n') + '\n');
console.log(`wrote docs/upgrade-2026-10/72-p4dev-replay.md (${out.length} lines)`);
