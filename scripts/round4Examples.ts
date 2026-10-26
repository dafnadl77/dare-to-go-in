/**
 * Stage 3b, round 4: BEFORE / AFTER without any model call. Takes the sentences the sealed-dream run (q-final) really produced, as
 * stored in docs/upgrade-2026-10/33-stage3b-fix-eval-q-final.json, and runs them through the checks as they are now. "Before" is
 * what the stored run showed and the reasons it stored; "after" is what the current checks decide for the very same sentences.
 * No network, no AI, no database. Writes docs/upgrade-2026-10/41-stage3b-round4-examples.md.
 *
 *   npx tsx scripts/round4Examples.ts
 *
 * Limits (said in the output too): the model would write differently under the new rules, so "after" is not a new run; a whole view
 * is re-checked sentence by sentence (readings, interpretive overview, closing question), not re-assembled.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as C from '../src/hero/claimCheck.ts';
import { segmentDream, type DreamSegment } from '../src/hero/dreamSegments.ts';
import { isUnsureAnswer } from '../src/hero/hebrewText.ts';
import type { AddressPreference } from '../src/hero/addressPreference.ts';

const DOCS = new URL('../docs/upgrade-2026-10/', import.meta.url);
const run = JSON.parse(readFileSync(new URL('33-stage3b-fix-eval-q-final.json', DOCS), 'utf8'));
const sealed = JSON.parse(readFileSync(new URL('37-sealed-dreams.json', DOCS), 'utf8')) as { key: string; address: AddressPreference }[];

type Rejected = { question: string; reasons: string[] };
interface Step {
  moment: string;
  momentText: string;
  question: { text: string; source: string; focus: C.QuestionFocus | null; subject: string | null; rejected: Rejected[] };
  answer: string | null;
  alternative: { question: string; source: string; focus: C.QuestionFocus | null; rejected: Rejected[]; answer: string | null } | null;
  followUp: { question: string; answer: string | null } | null;
  insight: C.AssembledInsight | null;
  insightReport: C.ClaimReport | null;
}
interface Journey {
  plan: string;
  text: string;
  segments: string[];
  moments: { id: string; label: string; labelCandidate: string; text: string }[];
  steps: Step[];
  wholeViews: { afterMoments: number; kind: string; overview: string; readings: string[]; closingQuestion: string; report: { overview: { reasons: string[] }[]; readings: string[][]; closing: string[]; texts: { overview: string[]; readings: string[]; closing: string } } }[];
}

const out: string[] = [];
const say = (s = '') => out.push(s);
const verdict = (reasons: readonly string[]) => (reasons.length ? `נפסל: ${reasons.join('; ')}` : 'עובר');
const segsOf = (segs: DreamSegment[], momentText: string) => segs.filter((s) => momentText.includes(s.text)).map((s) => s.id);
const usable = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x && !isUnsureAnswer(x));

say('# 41. שלב 3ב, סבב 4: לפני ואחרי, בלי קריאות AI');
say();
say('נוצר על ידי `scripts/round4Examples.ts`. המשפטים הם מה שהמודל כתב בהרצה הסופית של סבב האיכות (q-final, שלושת החלומות החתומים), כפי שנשמרו ב-33-stage3b-fix-eval-q-final.json.');
say('"לפני" הוא מה שהוצג בהרצה והסיבות שנשמרו בה. "אחרי" הוא מה שהבדיקות הנוכחיות מחליטות על אותם משפטים בדיוק.');
say();
say('**מגבלות:**');
say('- זו לא הרצה חדשה: תחת הכללים החדשים המודל היה מקבל הוראות תיקון וכותב אחרת.');
say('- מבט שלם נבדק משפט אחר משפט (קריאות, פתיחה פרשנית, שאלת סיום). הוא לא מורכב מחדש.');
say('- הבדיקה שקריאה מדברת על החלק שהיא נשענת עליו ("does not speak about the part") נמצאת בהרכבת המבט השלם ולא רצה כאן. לכן קריאה שנפסלה רק בגללה מופיעה כאן כ"עוברת", והיא עדיין תיפסל.');
say('- שאלה נבדקת כאן בבדיקת השאלה בלבד. בדיקות הכתיב והפנייה של השרת לא הורצו כאן, והן לא השתנו בסבב הזה.');
say();

for (const j of run.journeys as Journey[]) {
  const address = sealed.find((d) => d.key === j.plan)?.address ?? 'neutral';
  const segs = segmentDream(j.text);
  say(`## ${j.plan} (פנייה: ${address})`);
  say();

  // ---- segmentation
  const before = j.segments.map((s) => s.replace(/^s\d+: /, ''));
  const after = segs.map((s) => s.text);
  if (before.join('|') !== after.join('|')) {
    say('### חלוקה לחלקים');
    say();
    say('**לפני:**');
    say();
    before.forEach((t, i) => say(`${i + 1}. ${t}`));
    say();
    say('**אחרי:**');
    say();
    after.forEach((t, i) => say(`${i + 1}. ${t}`));
    say();
  }

  // ---- labels
  const used: string[] = [];
  const labelRows: string[] = [];
  for (const m of j.moments) {
    const now = C.checkLabel(m.labelCandidate, m.text, used, j.text);
    used.push(now);
    if (now !== m.label || m.label !== m.labelCandidate) labelRows.push(`| ${m.labelCandidate} | ${m.label} | ${now} |`);
  }
  if (labelRows.length) {
    say('### תוויות');
    say();
    say('| מה שהמודל הציע | לפני | אחרי |');
    say('|---|---|---|');
    labelRows.forEach((r) => say(r));
    say();
  }

  // ---- steps
  const prior: { question: string; focus: C.QuestionFocus | null; subject: string | null; answers: string[] }[] = [];
  j.steps.forEach((st, k) => {
    const momentSegments = segsOf(segs, st.momentText);
    const said = prior.flatMap((p) => p.answers);
    const priorQ = prior.map((p) => ({ question: p.question, focus: p.focus, subject: p.subject }));
    say(`### צעד ${k + 1}: «${st.moment}»`);
    say();
    // first question
    const qNow = C.verifyQuestion({ question: st.question.text, focus: st.question.focus ?? '', subject: st.question.subject ?? '' }, { language: 'he', segments: segs, momentSegments, answers: said, prior: priorQ });
    say(`**שאלה שהוצגה:** ${st.question.text} (${st.question.source === 'fixed' ? 'גיבוי' : 'נכתבה לרגע'})`);
    say(`- אחרי: ${verdict(qNow.reasons)}`);
    for (const r of st.question.rejected) {
      const v = C.verifyQuestion({ question: r.question, focus: '', subject: '' }, { language: 'he', segments: segs, momentSegments, answers: said, prior: priorQ });
      say(`- מועמדת שנפסלה: ${r.question}`);
      say(`  - לפני: ${verdict(r.reasons)}`);
      say(`  - אחרי: ${verdict(v.reasons)}`);
    }
    say(`- תשובה: ${st.answer ?? '—'}`);
    // the different question after "I don't know"
    if (st.alternative) {
      const altPrior = [...priorQ, { question: st.question.text, focus: st.question.focus, subject: st.question.subject, sameMoment: true }];
      say();
      say(`**השאלה האחרת אחרי "לא יודעת":** הוצגה ${st.alternative.question} (${st.alternative.source === 'fixed' ? 'גיבוי' : 'נכתבה לרגע'})`);
      for (const r of st.alternative.rejected) {
        const v = C.verifyQuestion({ question: r.question, focus: '', subject: '' }, { language: 'he', segments: segs, momentSegments, answers: said, prior: altPrior });
        say(`- מועמדת: ${r.question}`);
        say(`  - לפני: ${verdict(r.reasons)}`);
        say(`  - אחרי: ${verdict(v.reasons)}`);
      }
      say(`- תשובה: ${st.alternative.answer ?? '—'}`);
    }
    if (st.followUp) say(`- שאלת המשך: ${st.followUp.question} / תשובה: ${st.followUp.answer ?? '—'}`);
    const answers = usable([st.answer, st.alternative?.answer, st.followUp?.answer]);
    // the insight
    if (st.insight && st.insightReport) {
      const s: C.Sources = { language: 'he', sourceText: j.text, segments: segs, allowed: momentSegments, answers, address };
      const verified = new Set<string>();
      st.insightReport.dream.forEach((d, i) => d.status !== 'drop' && verified.add(`d${i}`));
      st.insightReport.user.forEach((u, i) => u.status !== 'drop' && verified.add(`u${i}`));
      say();
      say('**תובנה:**');
      st.insightReport.texts.possibilities.forEach((p, i) => {
        const now = C.verifyInterpretation(p, [...verified], verified, s, { exploredCount: 1 });
        say(`- אפשרות: ${p}`);
        say(`  - לפני: ${verdict(st.insightReport!.possibilities[i] ?? [])}`);
        say(`  - אחרי: ${verdict(now)}`);
      });
      const nowPossibility = st.insightReport.texts.possibilities.find((p) => C.verifyInterpretation(p, [...verified], verified, s, { exploredCount: 1 }).length === 0) ?? '';
      say(`- הוצגה לפני: ${st.insight.possibility || '(אין אפשרות, תובנה עובדתית)'}`);
      say(`- תוצג אחרי: ${nowPossibility || '(אין אפשרות, תובנה עובדתית עם ניסיון חוזר אחד)'}`);
      // the reflection: her quoted sentence given back in the second person where that can be done without guessing
      const hadQuote = st.insightReport.user.some((u) => u.status === 'quote');
      const reflNow = hadQuote ? st.insight.reflection.replace(/אמרת: «([^»]+)»/g, (all, q: string) => { const b = C.giveBack(q, address); return b ? `אמרת ש${b}.` : all; }) : st.insight.reflection;
      say(`- שיקוף לפני: ${st.insight.reflection}`);
      say(`- שיקוף אחרי: ${reflNow}`);
    }
    say();
    prior.push({ question: st.alternative?.question ?? st.question.text, focus: st.alternative?.focus ?? st.question.focus, subject: st.question.subject, answers });
  });

  // ---- whole views
  j.wholeViews.forEach((w, n) => {
    const explored = j.steps.slice(0, w.afterMoments);
    const allSegs = [...new Set(explored.flatMap((st) => segsOf(segs, st.momentText)))];
    const answers = usable(explored.flatMap((st) => [st.answer, st.alternative?.answer, st.followUp?.answer]));
    const s: C.Sources = { language: 'he', sourceText: j.text, segments: segs, allowed: allSegs, answers, address };
    say(`### מבט שלם ${n + 1} (אחרי ${w.afterMoments} רגעים, הוצג כ-${w.kind})`);
    say();
    w.report.texts.overview.forEach((o, i) => {
      if (!o.startsWith('[interpretation]')) return;
      const text = o.replace('[interpretation] ', '');
      say(`- פתיחה פרשנית: ${text}`);
      say(`  - לפני: ${verdict(w.report.overview[i]?.reasons ?? [])}`);
      say(`  - אחרי: ${verdict(C.verifyInterpretation(text, [], new Set(), s, { exploredCount: w.afterMoments, requireBasis: false, orderKnown: false }))}`);
    });
    w.report.texts.readings.forEach((r, i) => {
      const text = r.replace(/^s\d+: /, '');
      say(`- קריאה: ${text}`);
      say(`  - לפני: ${verdict(w.report.readings[i] ?? [])}`);
      say(`  - אחרי: ${verdict(C.verifyInterpretation(text, [], new Set(), s, { exploredCount: w.afterMoments, requireBasis: false, orderKnown: false }))}`);
    });
    if (w.report.texts.closing) {
      const v = C.verifyQuestion({ question: w.report.texts.closing, focus: 'memory', subject: '' }, { language: 'he', segments: segs, momentSegments: allSegs, answers, prior: [], closing: true });
      say(`- שאלת סיום שהמודל כתב: ${w.report.texts.closing}`);
      say(`  - לפני: ${verdict(w.report.closing)}`);
      say(`  - אחרי: ${verdict(v.reasons)}`);
    }
    say(`- הוצג לפני: פתיחה: ${w.overview || '—'} / שאלת סיום: ${w.closingQuestion || '—'}`);
    say();
  });
}

writeFileSync(new URL('41-stage3b-round4-examples.md', DOCS), out.join('\n') + '\n');
console.log(`wrote docs/upgrade-2026-10/41-stage3b-round4-examples.md (${out.length} lines)`);
