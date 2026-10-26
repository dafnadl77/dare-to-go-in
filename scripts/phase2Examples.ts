/**
 * Stage 3b, interpretation layer phase 2 (doc 50 v2): BEFORE / AFTER without any model call. Every sentence below is either what the
 * system really showed in a run (q-final, acc-1) or a golden-set example of doc 50 v2; "after" is what the current code decides.
 * Writes docs/upgrade-2026-10/54-phase2-examples.md.   Run: npx tsx scripts/phase2Examples.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as I from '../src/hero/interpretationCheck.ts';
import * as C from '../src/hero/claimCheck.ts';
import { momentGroups, segmentDream } from '../src/hero/dreamSegments.ts';
import * as G from '../tests/fixtures/goldenSet.ts';

const DOCS = new URL('../docs/upgrade-2026-10/', import.meta.url);
const acc = JSON.parse(readFileSync(new URL('33-stage3b-fix-eval-acc-1.json', DOCS), 'utf8'));
const out: string[] = [];
const say = (s = '') => out.push(s);
const LEVEL = ['0 (הד או ריק)', '1 (שיקוף)', '2 (הבחנה)', '3 (תובנה מעוררת מחשבה)'];
const verdictLine = (v: I.CandidateVerdict) =>
  v.safety.ok ? `**מותר להציג.** רמה ${LEVEL[v.quality.level]}, ציון ${v.quality.score}. ${v.quality.notes.join('; ')}` : `**נפסל (בטיחות):** ${v.safety.reasons.join('; ')}`;

say('# 54. שכבת הפרשנות, שלב 2: לפני ואחרי, בלי קריאות AI');
say();
say('נוצר על ידי `scripts/phase2Examples.ts`.');
say('- **"לפני":** מה שהמערכת הציגה בפועל בריצות q-final ו-acc-1, או דוגמה מסט הזהב של doc 50 v2.');
say('- **"אחרי":** מה שהקוד הנוכחי מחליט.');
say('- **פסילה** היא החלטת בטיחות: טענה בלי בסיס.');
say('- **רמה וציון** הם דירוג איכות, ואינם פסילה (הדגש השלישי שלך).');
say();

say('## 1. משפטים שהוצגו בפועל, ועכשיו');
say();
for (const e of [...G.R_UNSAFE, ...G.R_EMPTY]) {
  say(`- **${e.id}** (${e.dream}): "${e.text}"`);
  say(`  - לפני: הוצג.`);
  say(`  - אחרי: ${verdictLine(I.verifyCandidate({ text: e.text, card: null }, G.sourcesOf(e.dream), { exchanges: e.exchange ? [e.exchange] : [] }))}`);
}
say();
say('**משמעות פסיכולוגית בגוף שלישי** (דוגמאות בנויות R15–R20, גם עם "אולי"):');
for (const e of G.R_PSYCH) say(`- **${e.id}:** "אולי ${e.text}" — ${verdictLine(I.verifyCandidate({ text: `אולי ${e.text}`, card: null }, G.sourcesOf(e.dream)))}`);
say();
say('**טובות מהריצות:**');
for (const e of G.G_REAL) say(`- **${e.id}:** "${e.text}" — ${verdictLine(I.verifyCandidate({ text: e.text, card: null }, G.sourcesOf(e.dream)))}`);
say();

say('## 2. הדוגמאות שכתבתי, עם כרטיס מקורות');
say();
for (const e of G.WRITTEN) {
  const rel = I.relationBasis(e.card as never, G.sourcesOf(e.dream) as never);
  say(`- **${e.id}** (${e.dream}; לפי doc 50: רמה ${e.level}): "${e.text}"`);
  say(`  - הקשר: ${e.card!.relation}; ${rel.verified ? 'מאומת בעוגנים' : 'לא מאומת, ולכן מוצע כשאלה פתוחה'} (${rel.why}).`);
  say(`  - ${verdictLine(I.verifyCandidate({ text: e.text, card: e.card as never }, G.sourcesOf(e.dream)))}`);
}
say();
say('**הבחירה בין גרסאות** (נבחרת לפי איכות ולא לפי הסדר):');
for (const id of ['W3', 'W13']) {
  const now = G.WRITTEN.find((w) => w.id === id)!;
  const old = G.OLDER[id];
  const pick = I.selectPossibility([old, now].map((e) => ({ text: e.text, card: e.card as never })), G.sourcesOf(now.dream));
  say(`- **${id}:** הישנה, "${old.text}"`);
  say(`  - ${verdictLine(pick.verdicts[0])}`);
  say(`  - החדשה: ${verdictLine(pick.verdicts[1])}`);
  say(`  - **נבחרה:** ${pick.index === 1 ? 'החדשה' : pick.index === 0 ? 'הישנה' : 'אף אחת'}.`);
}
say();

say('## 3. שאלות');
say();
const qq = (q: string, moment: string, prior: string[] = []) => I.questionQuality(q, { momentText: moment, prior });
say('**רצף השאלות של acc-3** (R13, הוצג בפועל):');
G.R13.sequence.forEach((q, i) => {
  const v = qq(q, '', G.R13.sequence.slice(0, i));
  say(`- "${q}" — ציון ${v.score} ${v.score >= I.QUESTION_FLOOR ? '(יכולה להישאל)' : '(מתחת לרף: לא תישאל, תיבחר מועמדת אחרת או שאלת גיבוי)'}. ${v.notes.join('; ')}`);
});
say();
say('**שאלות יצירתיות:**');
for (const [name, q] of [['R21', G.R21], ['R22', G.R22], ['W2', G.QUESTIONS.W2], ['W14', G.QUESTIONS.W14]] as const) {
  const v = qq(q.question, q.moment);
  say(`- **${name}:** "${q.question}" — ציון ${v.score}. ${v.notes.join('; ') || 'שאלה רגילה'}`);
}
say();
say('**סוג השאלה שמתוכנן לכל רגע:**');
for (const [name, m] of [['acc-1, ההתנצלות', G.QUESTIONS.W2.moment], ['acc-2, יוסי אומר', G.QUESTIONS.W6.moment], ['acc-2, המברג', 'כשהסתכלתי על היד, המברג כבר היה מזלג עץ ארוך, כמו של מנגל'], ['sealed-3, מי פתח', G.QUESTIONS.W14.moment]] as const)
  say(`- ${name}: **${I.planQuestionFocus(m, [])}**`);
say();

say('## 4. חלוקת החלום והצעת הרגעים (acc-1)');
say();
const before = (acc.journeys[0].segments as string[]).map((x) => x.replace(/^s\d+: /, ''));
const after = segmentDream(G.DREAM.acc1).map((s) => s.text);
say('**לפני:**');
before.forEach((t, i) => say(`${i + 1}. ${t}`));
say();
say('**אחרי:**');
after.forEach((t, i) => say(`${i + 1}. ${t}`));
say();
say('**סדר ההצעה:**');
say();
say('לפני:');
for (const m of acc.journeys[0].moments) say(`- ${m.text.slice(0, 70)}… — עדיפות ${m.priority}`);
say();
say('אחרי:');
for (const g of momentGroups(G.DREAM.acc1)) say(`- ${g.text.slice(0, 70)}… — עדיפות ${g.priority}`);
say();

say('## 5. המבט השלם: פתיחה ושאלת סיום צנועות');
say();
const wholeOf = (k: G.DreamKey): C.WholeSources => ({ language: 'he', sourceText: G.DREAM[k], segments: segmentDream(G.DREAM[k]), explored: G.ANSWERS[k].map((a, i) => ({ id: `m${i + 1}`, label: `m${i + 1}`, segments: [i], answers: [a], question: 'q', insight: null })), unexplored: [], previous: null, maxReadings: 1 });
say('- **acc-3, שאלת סיום:**');
say('  - לפני: "מה עוד עולה כשחוזרים למילה «והבדידות»?"');
say(`  - אחרי: "${C.modestClosing(wholeOf('acc3'))}"`);
say('- **acc-2, פתיחה:**');
say('  - לפני: "ברגעים שנחקרו עלו במילים שלך: «מופתע», «מצחיק», «ומבולבל»."');
say(`  - אחרי: "${C.modestOpening(wholeOf('acc2'))}"`);
say();

writeFileSync(new URL('54-phase2-examples.md', DOCS), out.join('\n') + '\n');
console.log(`wrote docs/upgrade-2026-10/54-phase2-examples.md (${out.length} lines)`);
