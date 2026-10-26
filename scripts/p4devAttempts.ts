/**
 * The attempts of the run p4dev-1 whose reports the run did not keep (a reply refused and retried, and the whole view stopped by the
 * cap before its retry), checked again with no model call: every sentence the model wrote, and what the checker decided and why.
 * Writes docs/upgrade-2026-10/69-p4dev-attempts.md.   Run: npx tsx scripts/p4devAttempts.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as C from '../src/hero/claimCheck.ts';
import * as S from '../src/hero/explorationSchema.ts';
import { segmentDream } from '../src/hero/dreamSegments.ts';

const DOCS = new URL('../docs/upgrade-2026-10/', import.meta.url);
const run = JSON.parse(readFileSync(new URL('33-stage3b-fix-eval-p4dev-1.json', DOCS), 'utf8'));
const J = run.journeys[0];
const segs = segmentDream(J.text);
const segOf = (text: string) => segs.filter((s) => text.includes(s.text) || s.text.includes(text)).map((s) => s.id);
const responses = run.responses as { stage: string; text: string }[];
const out: string[] = [];
const say = (s = '') => out.push(s);

say('# 69. הריצה p4dev-1: הניסיונות שהדוח שלהם לא נשמר, נבדקים שוב (בלי AI)');
say();
say('נוצר על ידי `scripts/p4devAttempts.ts`, מתוך כל תשובות המודל שהריצה שמרה (`responses`). המשפטים הם בדיוק מה שהמודל כתב.');
say();

// the refused first reply of step 2 (response 10)
const step2 = J.steps[1];
const replyIdx = responses.map((r, i) => [r, i] as const).filter(([r]) => r.stage.startsWith('moment-reply'));
const firstOfStep2 = replyIdx[1];
if (firstOfStep2) {
  const raw = S.parseMomentReply(JSON.parse(firstOfStep2[0].text));
  const moment = segOf(step2.momentText);
  const s = { language: 'he' as const, sourceText: J.text, segments: segs, allowed: moment, answers: [step2.answer], momentSegments: moment, explored: segOf(J.steps[0].momentText), exchanges: [{ question: step2.question.text, answer: step2.answer }] };
  const { report } = C.assembleReply(raw!, s as never, [J.steps[0].insight.possibility]);
  say(`## צעד 2, הניסיון הראשון של התובנה (תשובה ${firstOfStep2[1] + 1}), שנפסל ונכתב מחדש`);
  say();
  report.texts.possibilities.forEach((t, i) => {
    const card = report.cards?.[i];
    say(`- "${t}"`);
    if (card) say(`  - כרטיס: ${card.relation}; עוגנים: ${card.anchors.map((a) => `«${a.quote}» (${a.from})`).join(', ')}`);
    say(`  - ${report.possibilities[i].length ? `נפסלה: ${report.possibilities[i].join('; ')}` : 'מותרת'}${report.quality?.[i] ? `; רמה ${report.quality[i].level}: ${report.quality[i].notes.join('; ')}` : ''}`);
  });
  say();
}

// the whole view after two moments (response 12), stopped by the cap before its retry
const wholeIdx = responses.map((r, i) => [r, i] as const).filter(([r]) => r.stage === 'whole-view');
const last = wholeIdx[wholeIdx.length - 1];
if (last) {
  const raw = S.parseWholeView(JSON.parse(last[0].text));
  const explored = J.steps.slice(0, 2).map((st: { moment: string; momentText: string; answer: string; question: { text: string }; insight: unknown }, k: number) => ({
    id: `m${k + 1}`, label: st.moment, segments: segOf(st.momentText), answers: [st.answer], question: st.question.text, insight: st.insight,
  }));
  const ws = { language: 'he' as const, sourceText: J.text, segments: segs, explored, unexplored: [], previous: null, maxReadings: 2 };
  const { view, report } = C.assembleWhole(raw!, ws as never);
  say(`## המבט השלם אחרי שני רגעים (תשובה ${last[1] + 1}): הניסיון הראשון נפסל, והתקרה עצרה את הניסיון החוזר`);
  say();
  say(`**מה היה מוצג מהניסיון הזה:** ${view.kind}. ${view.overview ? `"${view.overview}"` : '(אין פתיחה)'}`);
  say();
  report.texts.overview.forEach((t, i) => say(`- **פתיחה:** "${t}" — ${report.overview[i]?.ok ? 'מותר' : `נפסל: ${report.overview[i]?.reasons.join('; ')}`}`));
  report.texts.connections.forEach((t, i) => say(`- **קשר:** "${t}" — ${report.connections[i]?.length ? `נפסל: ${report.connections[i].join('; ')}` : 'מותר'}`));
  if (report.texts.recurring) say(`- **חוזר:** "${report.texts.recurring}" — ${report.recurring.length ? `נפסל: ${report.recurring.join('; ')}` : 'מותר'}`);
  if (report.texts.contrast) say(`- **ניגוד:** "${report.texts.contrast}" — ${report.contrast.length ? `נפסל: ${report.contrast.join('; ')}` : 'מותר'}`);
  report.texts.readings.forEach((t, i) => say(`- **קריאה:** "${t}" — ${report.readings[i]?.length ? `נפסלה: ${report.readings[i].join('; ')}` : 'מותרת'}`));
  if (report.texts.closing) say(`- **שאלת סיום:** "${report.texts.closing}" — ${report.closing.length ? `נפסלה: ${report.closing.join('; ')}` : 'מותרת'}`);
  say();
}

writeFileSync(new URL('69-p4dev-attempts.md', DOCS), out.join('\n') + '\n');
console.log(`wrote docs/upgrade-2026-10/69-p4dev-attempts.md (${out.length} lines)`);
