/**
 * The fix round of doc 62, replayed with no model call: (A) the run p3dev-1 before and after the fixes; (B) every stored run of the
 * journey (acc-1, p2dev-1, p3dev-1) re-checked with the fixed code, to see that nothing that was shown is now refused and to list every
 * decision that changed; (C) every pronoun of the development, sealed and acceptance dreams with the word it is now taken to refer to
 * (the hidden dream is not read). Writes docs/upgrade-2026-10/64-fix62-replay.md.   Run: npx tsx scripts/fix62Replay.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as I from '../src/hero/interpretationCheck.ts';
import * as C from '../src/hero/claimCheck.ts';
import * as S from '../src/hero/explorationSchema.ts';
import { segmentDream, type DreamSegment } from '../src/hero/dreamSegments.ts';
import { isUnsureAnswer } from '../src/hero/hebrewText.ts';

const DOCS = new URL('../docs/upgrade-2026-10/', import.meta.url);
const load = (f: string) => JSON.parse(readFileSync(new URL(f, DOCS), 'utf8'));
const out: string[] = [];
const say = (s = '') => out.push(s);
const segOf = (segs: DreamSegment[], text: string) => segs.filter((s) => text.includes(s.text) || s.text.includes(text)).map((s) => s.id);
const LEVEL = ['0 (הד)', '1 (שיקוף)', '2 (הבחנה)', '3 (מעוררת מחשבה)'];
const verdictLine = (v: I.CandidateVerdict) => (v.safety.ok ? `מותרת, רמה ${LEVEL[v.quality.level]}` : `נפסלת: ${v.safety.reasons.join('; ')}`);

type Step = {
  moment: string; momentText: string; answer: string;
  question: { text: string; source: string; focus: string | null; rejected?: { question: string; reasons: string[] }[] };
  insight?: { possibility?: string } | null;
  insightReport?: Record<string, unknown> | null;
};
type Report = { cards?: (I.SourceCard | null)[]; texts?: { dream: string[]; possibilities: string[] } };
const reportsOf = (ir: Record<string, unknown> | null | undefined): [string, Report][] =>
  !ir ? [] : 'texts' in ir ? [['', ir as Report]] : Object.entries(ir).filter(([, v]) => v && typeof v === 'object' && 'texts' in (v as object)).map(([k, v]) => [k, v as Report]);

say('# 64. סבב התיקון של doc 62, מורץ שוב על הפלטים האמיתיים (בלי AI)');
say();
say('נוצר על ידי `scripts/fix62Replay.ts`. "לפני" הוא מה שהריצה החליטה. "אחרי" הוא מה שהקוד המתוקן מחליט, על אותם משפטים בדיוק.');
say();

// ------------------------------------------------------------------------------------------------ A. p3dev-1

{
  const run = load('33-stage3b-fix-eval-p3dev-1.json');
  const J = run.journeys[0];
  const segs = segmentDream(J.text);
  const st = J.steps[0] as Step;
  const moment = segOf(segs, st.momentText);
  const ctx = { language: 'he' as const, segments: segs, momentSegments: moment, answers: [] as string[], prior: [] };
  say('## א. הריצה p3dev-1: הרגע «המטריה נקרעה בידיים»');
  say();
  say(`**החלק בחלום:** "${st.momentText}". **מה הקוד מבין עכשיו ש"אותה" מתייחסת אליו:** ${C.antecedents(segs, moment).map((w) => `"${w}"`).join(', ') || '(אין)'}.`);
  say();
  say('### השאלות');
  say();
  say('| # | המועמדת | לפני | אחרי | ציון איכות |');
  say('|---|---|---|---|---|');
  (st.question.rejected ?? []).forEach((r, i) => {
    const now = C.verifyQuestion({ question: r.question, focus: 'salience', subject: '' }, ctx).reasons;
    const q = I.questionQuality(r.question, { momentText: st.momentText, prior: [] });
    say(`| ${i + 1} | ${r.question} | נפסלה: ${r.reasons.join('; ')} | ${now.length ? `נפסלת: ${now.join('; ')}` : '**עוברת**'} | ${now.length ? '—' : q.score} |`);
  });
  say();
  say(`- **מה הוצג לפני:** שאלת הגיבוי "${st.question.text}".`);
  say('- **הניסיון הראשון** (מועמדות 1–3): עכשיו לפחות אחת עוברת, ולכן לא היו נדרשים שני הניסיונות הנוספים.');
  say();
  say('### שאלת ההבהרה');
  say();
  say(`- **התשובה:** "${st.answer}"`);
  say(`- **לפני:** ${S.clarificationNote({ followUpQuestion: null }, st.answer) ? 'הבודק דרש שאלת הבהרה, ובזבז ניסיון' : 'לא נדרשה'}.`);
  say(`- **אחרי:** ${S.clarificationNote({ followUpQuestion: null }, st.answer, J.text) ? 'עדיין נדרשת' : 'לא נדרשת: "מישהו שאני לא מכירה" הן מילות החלום עצמו'}.`);
  say();
  say('### התובנה');
  say();
  const reply = { language: 'he' as const, sourceText: J.text, segments: segs, allowed: moment, answers: [st.answer] };
  for (const [k, r] of reportsOf(st.insightReport)) {
    say(`**${k === 'first' ? 'הניסיון הראשון ששמור' : 'הניסיון החוזר (מה שהוצג)'}:**`);
    (r.texts?.possibilities ?? []).forEach((t, i) => {
      const card = r.cards?.[i] ?? null;
      const v = I.verifyCandidate({ text: t, card }, reply, { exploredCount: 1, exchanges: [{ question: st.question.text, answer: st.answer }] });
      say(`- "${t}"`);
      if (card) say(`  - העוגנים ככתבם: ${card.anchors.map((a) => `«${a.quote}» (${a.from})`).join(', ')}. אחרי שחזור: ${I.restoreAnchors(card, reply).anchors.map((a) => `«${a.quote}»`).join(', ')}`);
      say(`  - אחרי התיקון: ${verdictLine(v)}`);
    });
    const d = r.texts?.dream?.[0];
    if (d) {
      const v = C.verifyDreamClaim({ text: d, segment: moment[0], action: 'ניסיתי', actor: 'dreamer', target: '' }, reply);
      say(`- משפט החלום "${d}": ${v.reasons.length ? `עדיין: ${v.reasons.join('; ')}` : 'עובר כפי שנכתב (קודם הוחלף בציטוט)'} (הפועל והעושה שוחזרו לבדיקה; הם לא נשמרו בדוח)`);
    }
    say();
  }
}

// ------------------------------------------------------------------------------------------------ B. regression over every stored run

say('## ב. בדיקת רגרסיה: כל הריצות השמורות של המסע, דרך הקוד המתוקן');
say();
say('- **שאלות:** כל שאלה שהוצגה (שנכתבה על ידי המודל) צריכה לעבור גם עכשיו. כל מועמדת שנפסלה, ועכשיו עוברת, מופיעה כאן לבדיקה בעין.');
say('- **תובנות:** לכל צעד, האפשרות שהוצגה מול מה שהקוד המתוקן היה בוחר מאותן מועמדות.');
say('- **מגבלה:** ההקשר של השאלה (שאלות קודמות, רגעים שנחקרו) משוחזר מהריצה, ולכן הוא קירוב.');
say();
let shown = 0, shownStill = 0, nowPass = 0, stepsChecked = 0, insightChanged = 0;
const changes: string[] = [];
for (const name of ['acc-1', 'p2dev-1', 'p3dev-1']) {
  const run = load(`33-stage3b-fix-eval-${name}.json`);
  for (const J of run.journeys) {
    const segs = segmentDream(J.text);
    const steps = J.steps as Step[];
    steps.forEach((st, k) => {
      const moment = segOf(segs, st.momentText);
      const before = steps.slice(0, k);
      const ctx = {
        language: 'he' as const, segments: segs, momentSegments: moment,
        answers: before.map((b) => b.answer).filter((a) => a && !isUnsureAnswer(a)),
        prior: before.map((b) => ({ question: b.question.text, focus: (b.question.focus ?? null) as never, subject: null })),
        explored: before.flatMap((b) => segOf(segs, b.momentText)),
      };
      if (st.question.source !== 'fixed') {
        shown += 1;
        const r = C.verifyQuestion({ question: st.question.text, focus: st.question.focus ?? 'salience', subject: '' }, ctx).reasons;
        if (r.length === 0) shownStill += 1;
        else changes.push(`- **${name}/${J.plan}, צעד ${k + 1}, שאלה שהוצגה ועכשיו נפסלת:** "${st.question.text}" — ${r.join('; ')}`);
      }
      for (const rj of st.question.rejected ?? []) {
        const r = C.verifyQuestion({ question: rj.question, focus: 'salience', subject: '' }, ctx).reasons;
        if (r.length === 0) {
          nowPass += 1;
          changes.push(`- **${name}/${J.plan}, צעד ${k + 1}, מועמדת שנפסלה ועכשיו עוברת:** "${rj.question}" (נפסלה בגלל: ${rj.reasons.join('; ')})`);
        }
      }
      const reply = { language: 'he' as const, sourceText: J.text, segments: segs, allowed: moment, answers: [st.answer] };
      const reps = reportsOf(st.insightReport);
      const last = reps[reps.length - 1]?.[1];
      if (!last?.texts || isUnsureAnswer(st.answer ?? '')) return;
      stepsChecked += 1;
      const cands = last.texts.possibilities.map((t, i) => ({ text: t, card: last.cards?.[i] ?? null }));
      const earlier = before.map((b) => b.insight?.possibility ?? '').filter(Boolean);
      const pick = I.selectPossibility(cands, reply, { exploredCount: 1, earlier, exchanges: [{ question: st.question.text, answer: st.answer }] });
      const nowText = pick.index === null ? '' : cands[pick.index].text;
      const wasText = st.insight?.possibility ?? '';
      if (nowText !== wasText) {
        insightChanged += 1;
        changes.push(`- **${name}/${J.plan}, צעד ${k + 1}, התובנה:** לפני: "${wasText || '(אין אפשרות)'}" · אחרי: "${nowText || '(אין אפשרות)'}"${pick.index === null && cands.length ? ` — ${pick.verdicts.map(verdictLine).join(' | ')}` : ''}`);
      }
    });
  }
}
say(`- **שאלות שהוצגו ועדיין עוברות:** ${shownStill} מתוך ${shown}.`);
say(`- **מועמדות שנפסלו ועכשיו עוברות:** ${nowPass}.`);
say(`- **תובנות שההחלטה עליהן השתנתה:** ${insightChanged} מתוך ${stepsChecked} צעדים.`);
say();
say(changes.length ? changes.join('\n') : '- אין שינויים.');
say();

// ------------------------------------------------------------------------------------------------ C. every pronoun

say('## ג. כל כינוי בחלומות הפיתוח, החתומים וחלומות הקבלה: למה הקוד מבין שהוא מתייחס');
say();
say('החלום הנסתר (doc 31) לא נקרא. "(אין)" אומר שהקוד לא מצא שם, ולכן ההתנהגות המחמירה הקודמת נשארת.');
say();
const PRONOUN = /(?<![א-ת])(?:ו|ש|וש|כש|וכש)?(?:אותה|היא|אותו|הוא)(?![א-ת])/;
for (const f of ['37-dev-dreams.json', '37-sealed-dreams.json', '47-acceptance-dreams.json']) {
  for (const dream of load(f) as { key: string; text: string }[]) {
    const segs = segmentDream(dream.text);
    for (const seg of segs.filter((x) => PRONOUN.test(x.text))) {
      const before = segs.filter((x) => x.id < seg.id && x.id >= seg.id - 2).map((x) => x.text).join(' / ');
      say(`- **${dream.key}:** "${seg.text}" → ${C.antecedents(segs, [seg.id]).map((w) => `"${w}"`).join(', ') || '(אין)'}  ·  לפניו: "${before}"`);
    }
  }
}

writeFileSync(new URL('64-fix62-replay.md', DOCS), out.join('\n') + '\n');
console.log(`wrote docs/upgrade-2026-10/64-fix62-replay.md (${out.length} lines)`);
