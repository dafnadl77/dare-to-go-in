/**
 * Stage 3b, round 4b: REPLAY of the sealed-dream run (q-final) through the REAL route code, with no model and no network.
 *
 * The three sealed journeys of docs/upgrade-2026-10/33-stage3b-fix-eval-q-final.json are walked again the way scripts/explorationEval.ts
 * walks them (question → answer → "I don't know" and the other question → insight and its one retry → whole view and its one retry),
 * but every model call is answered by a stub that returns what the model returned in that run. So what runs is exactly the production
 * path of server/routes/dreamExploration.ts: the question choice with the server's checks (address, wording, plural, quoted words),
 * the insight assembly, the language guard and its retries, the whole-view assembly with its update and history, and the fallbacks.
 * The dreamer's answers are hers from the run. Writes docs/upgrade-2026-10/45-stage3b-round4b-replay.md.
 *
 *   npx tsx scripts/round4Replay.ts
 *
 * What the run did NOT store, and how the replay fills it (said in the output too):
 *  - the insight's dream sentences (stored as text only, without their part, verb and doer): not replayed; the dream line falls back
 *    to the moment's own words in quotes, as the code does when no dream sentence passes;
 *  - the quote of each sentence giving back her words: taken from the run's shown «…» when it was quoted, else her whole answer;
 *  - the "basis" of possibilities and of whole-view interpretations: the sentences / moments they could rest on;
 *  - the quotes of "recurring" and "contrast": not stored, so these two are refused in the replay (they were not shown in the run either);
 *  - the dream analysis (it sets how many readings a whole view may have): rebuilt locally, not the run's;
 *  - a retry gets the same text again (a real model would write anew after the correction note).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as X from '../src/hero/exploration.ts';
import { segmentDream, segmentsForMoment } from '../src/hero/dreamSegments.ts';
import { checkLabel, unsureLook } from '../src/hero/claimCheck.ts';
import { isUnsureAnswer } from '../src/hero/hebrewText.ts';
import { typedAnalysis } from '../src/demo/demoRouter.ts';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema.ts';
import type { AddressPreference } from '../src/hero/addressPreference.ts';
import { explorationContext, generateMomentQuestion, generateMomentReply, generateWholeView, planCall } from '../server/routes/dreamExploration.ts';

const DOCS = new URL('../docs/upgrade-2026-10/', import.meta.url);
const run = JSON.parse(readFileSync(new URL('33-stage3b-fix-eval-q-final.json', DOCS), 'utf8'));
const sealed = JSON.parse(readFileSync(new URL('37-sealed-dreams.json', DOCS), 'utf8')) as { key: string; address: AddressPreference }[];

type Q = { text: string; source: string; focus: string | null; subject: string | null; rejected: { question: string; reasons: string[] }[] };
interface Step {
  moment: string;
  momentText: string;
  question: Q;
  answer: string;
  alternative: (Q & { question: string; answer: string }) | null;
  insight: { observation: string; reflection: string; possibility: string; kind: string } | null;
  insightReport: { user: { status: string }[]; texts: { user: string[]; possibilities: string[] } } | null;
}
interface Whole {
  afterMoments: number;
  attempt: number;
  kind: string;
  overview: string;
  connections: { title: string; basis: string }[];
  readings: { reading: string }[] | string[];
  closingQuestion: string;
  report: { texts: { overview: string[]; connections: string[]; recurring: string; contrast: string; readings: string[]; closing: string } };
}
interface Journey {
  plan: string;
  text: string;
  segments: string[];
  moments: { id: string; label: string; labelCandidate: string; text: string }[];
  steps: Step[];
  wholeViews: Whole[];
}

/** A model that answers each call with the next stored output (the last one again once they run out). */
function stub(outputs: unknown[]) {
  let i = 0;
  return { responses: { create: async () => ({ model: 'replay', output_text: JSON.stringify(outputs[Math.min(i++, outputs.length - 1)]), usage: { input_tokens: 0, output_tokens: 0 } }) } } as never;
}
const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.max(1, Math.ceil(xs.length / n)) }, (_, k) => xs.slice(k * n, k * n + n));
/** The candidates of each attempt, in the order the run tried them (three per attempt), the chosen one last. */
function questionOutputs(q: { text: string; source: string; focus: string | null; subject: string | null; rejected: { question: string }[] }) {
  const all = q.rejected.map((r) => ({ question: r.question, focus: '', subject: '', buildsOn: '' }));
  if (q.source !== 'fixed') all.push({ question: q.text, focus: q.focus ?? '', subject: q.subject ?? '', buildsOn: '' });
  return chunks(all, 3).map((candidates) => ({ candidates }));
}
function replyOutput(st: Step, answers: string[]) {
  const r = st.insightReport!;
  const shownQuotes = [...(st.insight?.reflection ?? '').matchAll(/«([^»]+)»/g)].map((m) => m[1]);
  let q = 0;
  const user = r.texts.user.map((text, i) => ({ quote: r.user[i]?.status === 'quote' && shownQuotes[q] ? shownQuotes[q++] : answers[answers.length - 1], text }));
  const basis = user.length ? ['u0'] : ['d0'];
  return { dream: [], user, possibilities: r.texts.possibilities.map((text) => ({ basis, text })), followUpQuestion: '', missingInformation: '' };
}
function wholeOutput(w: Whole, explored: string[], oldSegs: string[], newSegs: ReturnType<typeof segmentDream>) {
  const t = w.report.texts;
  const segOf = (n: number) => {
    const old = (oldSegs[n] ?? '').replace(/^s\d+: /, '');
    return (newSegs.find((s) => s.text === old) ?? newSegs.find((s) => old.includes(s.text) || s.text.includes(old)))?.id ?? -1;
  };
  const conn = (c: string) => {
    const m = c.match(/^(m\d+)→(m\d+) "(.*?)" «(.*?)» · «(.*?)» — (.*)$/s);
    return m ? { from: m[1], to: m[2], title: m[3], fromQuote: m[4], toQuote: m[5], link: m[6] } : null;
  };
  return {
    overview: t.overview.map((o) => {
      const m = o.match(/^\[(\w+)\] (.*)$/s);
      return { source: m?.[1] ?? 'interpretation', segment: -1, action: '', actor: '', target: '', moment: '', quote: '', basis: explored, text: m?.[2] ?? o };
    }),
    connections: t.connections.map(conn).filter(Boolean),
    recurring: { element: t.recurring.split(':')[0] ?? '', text: t.recurring.split(':').slice(1).join(':').trim(), quotes: [] },
    contrast: { text: t.contrast, quotes: [] },
    readings: t.readings.map((r) => {
      const m = r.match(/^s(\d+): (.*)$/s);
      return { segment: m ? segOf(Number(m[1])) : -1, text: m?.[2] ?? r };
    }),
    closing: { text: t.closing, moment: '', quote: '' },
  };
}

const out: string[] = [];
const say = (s = '') => out.push(s);
const tally = { interpretiveBefore: 0, interpretiveAfter: 0, insights: 0, questionsChanged: 0, closingsBefore: 0, closingsAfter: 0, closingsRefused: 0, closingsWithFactual: 0, wholes: 0, factualBefore: 0, factualAfter: 0 };

say('# 45. שלב 3ב, סבב 4ב: הרצה חוזרת של החלומות החתומים דרך קוד השרת האמיתי, בלי AI');
say();
say('נוצר על ידי `scripts/round4Replay.ts`. שלושת המסעות של ההרצה הסופית (q-final) רצים שוב באותו סדר כמו בהרצה, דרך הפונקציות של השרת עצמו.');
say('במקום המודל עונה תחליף שמחזיר את מה שהמודל החזיר אז, ולכן רצים כאן בדיוק:');
say('- בחירת השאלה, עם בדיקות השרת: פנייה, כתיב, רבים, מילים במירכאות.');
say('- הרכבת התובנה, כולל מנגנון השפה והניסיונות החוזרים.');
say('- הרכבת המבט השלם, עם העדכון וההיסטוריה שלו.');
say('- הגיבויים.');
say();
say('התשובות הן התשובות מההרצה. **"לפני"** הוא מה שהוצג אז. **"אחרי"** הוא מה שהקוד הנוכחי מציג לאותו פלט בדיוק.');
say();
say('**מה ההרצה לא שמרה, ואיך ההרצה החוזרת משלימה את זה:**');
say('- **משפטי החלום של התובנה** נשמרו כטקסט בלבד, בלי החלק, הפועל והעושה. לכן הם לא רצים, והשורה של החלום חוזרת למילות הרגע במירכאות, כמו שהקוד עושה כשאף משפט חלום לא עובר.');
say('- **הציטוט של משפט שמחזיר את דברייך** נלקח מה-«…» שהוצג, כשהוצג ציטוט. אחרת נלקחת התשובה המלאה.');
say('- **ה"בסיס" של אפשרות ושל פרשנות במבט השלם** הוא המשפטים או הרגעים שהיא יכולה להישען עליהם.');
say('- **הציטוטים של "חוזר" ושל "ניגוד"** לא נשמרו, ולכן הם נפסלים כאן. גם בהרצה המקורית הם לא הוצגו.');
say('- **ניתוח החלום** נבנה מקומית ואינו של ההרצה. הוא קובע כמה קריאות מותרות במבט שלם.');
say('- **ניסיון חוזר** מקבל את אותו טקסט שוב. מודל אמיתי היה כותב מחדש אחרי הערת התיקון. זה המקרה הגרוע.');
say();

for (const j of run.journeys as Journey[]) {
  const address = sealed.find((d) => d.key === j.plan)?.address ?? 'neutral';
  const analysis = { ...(typedAnalysis(j.text, true) as unknown as DreamAnalysis), sourceText: j.text };
  const segments = segmentDream(j.text);
  const used: string[] = [];
  const labels = j.moments.map((m) => {
    const l = checkLabel(m.labelCandidate, m.text, used, j.text);
    used.push(l);
    return l;
  });
  let e = X.createExploration(`replay-${j.plan}`, j.moments.map((m, i) => ({ label: labels[i], excerpt: m.text })));
  const segmentsOf = (id: string) => {
    const m = e.moments.find((x) => x.id === id);
    return m ? segmentsForMoment(segments, m) : [];
  };
  const ctx = () => explorationContext(analysis, e, 'he', address, []);
  say(`## ${j.plan} (פנייה: ${address})`);
  say();
  say('| תווית לפני | תווית אחרי |');
  say('|---|---|');
  j.moments.forEach((m, i) => say(`| ${m.label} | ${labels[i]} |`));
  say();

  let w = 0;
  for (const [index, st] of j.steps.entries()) {
    const id = e.moments.find((m) => m.excerpt === st.momentText)?.id ?? `m${index + 1}`;
    say(`### צעד ${index + 1}: «${labels[e.moments.findIndex((m) => m.id === id)]}»`);
    say();
    // 1. the question
    const qPlan = planCall('moment-question', e, id, segmentsOf);
    if (!qPlan || qPlan.kind !== 'question') throw new Error(`no question plan for ${j.plan}/${id}`);
    const qr = await generateMomentQuestion(stub(questionOutputs(st.question)), ctx(), qPlan);
    if (qr.status !== 'ok') throw new Error(`question ${qr.status}`);
    const qv = qr.value;
    if (qv.question !== st.question.text) tally.questionsChanged += 1;
    say(`- **שאלה לפני:** ${st.question.text} (${st.question.source === 'fixed' ? 'גיבוי' : 'נכתבה לרגע'})`);
    say(`- **שאלה אחרי:** ${qv.question} (${qv.source === 'fixed' ? 'גיבוי' : 'נכתבה לרגע'})${qv.question === st.question.text ? ' — ללא שינוי' : ''}`);
    for (const r of qv.rejected.filter((r) => !st.question.rejected.some((x) => x.question === r.question))) say(`  - נפסלת עכשיו: ${r.question} — ${r.reasons.join('; ')}`);
    e = X.beginMoment(e, id, qv.question, qv.source === 'fixed' ? 'fixed' : 'adaptive');
    e = X.setQuestionFocus(e, id, qv.focus, qv.subject);
    let answer = st.answer;
    e = X.answerMoment(e, id, answer);
    say(`- תשובה: ${answer}`);
    // 2. "I don't know": the other question
    if (isUnsureAnswer(answer) && st.alternative) {
      const aPlan = planCall('moment-question', e, id, segmentsOf);
      if (aPlan && aPlan.kind === 'question') {
        const ar = await generateMomentQuestion(stub(questionOutputs({ ...st.alternative, text: st.alternative.question })), ctx(), aPlan);
        if (ar.status === 'ok') {
          const av = ar.value;
          if (av.question !== st.alternative.question) tally.questionsChanged += 1;
          say(`- **השאלה האחרת לפני:** ${st.alternative.question} (${st.alternative.source === 'fixed' ? 'גיבוי' : 'נכתבה לרגע'})`);
          say(`- **השאלה האחרת אחרי:** ${av.question} (${av.source === 'fixed' ? 'גיבוי' : 'נכתבה לרגע'})`);
          e = X.beginAlternativeQuestion(e, id, av.question, av.focus, av.subject);
          answer = st.alternative.answer;
          e = X.answerMoment(e, id, answer);
          say(`- תשובה: ${answer}`);
        }
      }
    }
    // 3. the insight, and its one retry when factual
    if (isUnsureAnswer(answer) || !st.insightReport) {
      e = X.receiveUnsureLook(e, id, unsureLook('he', j.text, segments, segmentsOf(id)).observation);
    } else {
      const output = replyOutput(st, [st.answer, answer].filter((a) => !isUnsureAnswer(a)));
      const rPlan = planCall('moment-reply', e, id, segmentsOf);
      if (!rPlan || rPlan.kind !== 'reply') throw new Error('no reply plan');
      const rr = await generateMomentReply(stub([output]), ctx(), rPlan);
      if (rr.status !== 'ok') throw new Error(`reply ${rr.status}`);
      e = X.receiveReply(e, id, rr.value.insight, rr.value.followUpQuestion);
      let insight = rr.value.insight;
      let retried = false;
      if (insight.kind === 'factual' && !rr.value.followUpQuestion) {
        const retryPlan = planCall('moment-reply', e, id, segmentsOf);
        if (retryPlan && retryPlan.kind === 'reply' && retryPlan.retry) {
          const rt = await generateMomentReply(stub([output]), ctx(), retryPlan);
          if (rt.status === 'ok') {
            e = X.receiveReply(e, id, rt.value.insight, null);
            insight = rt.value.insight;
            retried = true;
          }
        }
      }
      tally.insights += 1;
      if (st.insight?.possibility) tally.interpretiveBefore += 1;
      if (insight.possibility) tally.interpretiveAfter += 1;
      say();
      say(`- **אפשרות לפני:** ${st.insight?.possibility || '(אין, תובנה עובדתית)'}`);
      say(`- **אפשרות אחרי:** ${insight.possibility || `(אין, תובנה עובדתית${retried ? '; גם אחרי הניסיון החוזר, שבהרצה החוזרת קיבל את אותו טקסט' : ''})`}`);
      say(`- **שיקוף לפני:** ${st.insight?.reflection ?? ''}`);
      say(`- **שיקוף אחרי:** ${insight.reflection}`);
      say(`- שורת החלום אחרי (לא רצה מחדש, ראו למעלה): ${insight.observation}`);
    }
    e = X.completeMoment(e, id, new Date(), { keepFirstInsight: true });
    if (index === 0) e = X.markFeelingsAsked(e);
    say();

    // 4. the whole views stored after this many moments (and the retry after a factual summary)
    const here = j.wholeViews.filter((x) => x.afterMoments === X.exploredCount(e));
    if (here.length) {
      const explored = X.exploredInOrder(e).map((x) => x.moment.id);
      for (const [k, before] of here.entries()) {
        const wPlan = planCall('whole-view', e, null, segmentsOf);
        if (!wPlan || wPlan.kind !== 'whole') {
          say(`#### מבט שלם אחרי ${before.afterMoments} רגעים (ניסיון ${before.attempt}): לא נשלח — המבט הקודם כבר עומד, ואין ניסיון חוזר`);
          say(`- **לפני:** ${before.kind}: ${before.overview} / שאלת סיום: ${before.closingQuestion || '—'}`);
          say();
          continue;
        }
        const wr = await generateWholeView(stub([wholeOutput(before, explored, j.segments, segments)]), ctx(), wPlan);
        if (wr.status !== 'ok') throw new Error(`whole ${wr.status}`);
        const { report, ...view } = wr.value;
        e = X.receiveWholeView(e, view, wPlan.basedOn);
        const modelClosing = before.report.texts.closing;
        tally.wholes += 1;
        if (before.kind === 'factual-summary') tally.factualBefore += 1;
        if (view.kind === 'factual-summary') tally.factualAfter += 1;
        if (modelClosing && before.closingQuestion === modelClosing) tally.closingsBefore += 1;
        if (modelClosing && view.closingQuestion === modelClosing) tally.closingsAfter += 1;
        else if (modelClosing && report && report.closing.length) tally.closingsRefused += 1;
        else if (modelClosing && view.kind === 'factual-summary') tally.closingsWithFactual += 1;
        w += 1;
        say(`#### מבט שלם ${w}: אחרי ${before.afterMoments} רגעים${here.length > 1 ? `, ניסיון ${k + 1}` : ''}`);
        say(`- **סוג:** לפני ${before.kind} · אחרי ${view.kind}`);
        say(`- **פתיחה לפני:** ${before.overview}`);
        say(`- **פתיחה אחרי:** ${view.overview}`);
        const readingsBefore = (before.readings as unknown[]).map((r) => (typeof r === 'string' ? r : (r as { reading: string }).reading));
        say(`- **קריאות לפני:** ${readingsBefore.join(' | ') || '—'}`);
        say(`- **קריאות אחרי:** ${view.readings.map((r) => r.reading).join(' | ') || '—'}`);
        say(`- **קשרים לפני:** ${before.connections.map((c) => `${c.title}: ${c.basis}`).join(' | ') || '—'}`);
        say(`- **קשרים אחרי:** ${view.connections.map((c) => `${c.title}: ${c.basis}`).join(' | ') || '—'}`);
        say(`- **שאלת סיום שהמודל כתב:** ${before.report.texts.closing || '—'}`);
        say(`- **שאלת סיום לפני:** ${before.closingQuestion || '—'}`);
        say(`- **שאלת סיום אחרי:** ${view.closingQuestion || '—'}`);
        if (report) {
          const refused = [
            ...report.overview.flatMap((o, i) => (o.reasons.length ? [`פתיחה ${i + 1}: ${o.reasons.join('; ')}`] : [])),
            ...report.readings.flatMap((r, i) => (r.length ? [`קריאה ${i + 1}: ${r.join('; ')}`] : [])),
            ...(report.closing.length ? [`שאלת סיום: ${report.closing.join('; ')}`] : []),
          ];
          if (refused.length) say(`- מה נפסל אחרי, ולמה: ${refused.join(' · ')}`);
        }
        say();
        if (view.kind !== 'factual-summary') break;
      }
    }
  }
}

say('## סיכום');
say();
say(`- **תובנות עם אפשרות פרשנית:** לפני ${tally.interpretiveBefore} מתוך ${tally.insights}, אחרי ${tally.interpretiveAfter} מתוך ${tally.insights}. זה המקרה הגרוע: ניסיון חוזר מקבל את אותו טקסט.`);
say(`- **שאלות שהשתנו** (כולל השאלה האחרת): ${tally.questionsChanged}`);
say(`- **מבטים שלמים שהפכו לסיכום עובדתי:** לפני ${tally.factualBefore} מתוך ${tally.wholes}, אחרי ${tally.factualAfter} מתוך ${tally.wholes}. זה המקרה הגרוע.`);
say(`- **שאלות סיום שהמודל כתב והוצגו כפי שנכתבו:** לפני ${tally.closingsBefore}, אחרי ${tally.closingsAfter}.`);
say(`  - נפסלו בבדיקת השאלה: ${tally.closingsRefused}. במקומן מוצגת שאלה צנועה מהמילים שלך, כשהמבט עצמו מוצג.`);
say(`  - עברו את הבדיקה אבל לא הוצגו, כי המבט כולו הפך לסיכום עובדתי (שאין בו שאלת סיום): ${tally.closingsWithFactual}.`);

writeFileSync(new URL('45-stage3b-round4b-replay.md', DOCS), out.join('\n') + '\n');
console.log(`wrote docs/upgrade-2026-10/45-stage3b-round4b-replay.md (${out.length} lines)`, JSON.stringify(tally));
