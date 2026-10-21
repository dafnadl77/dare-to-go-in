/**
 * The raw output of a fix-round quality run, written mechanically from docs/upgrade-2026-10/33-stage3b-fix-eval-<run>.json: every text
 * exactly as the system produced it (nothing rewritten or improved), every refused candidate with the check's reasons, and the measured
 * cost, model responses, rewrites and response times. The headings and field names are the script's; everything else is the run's.
 *
 * Run:  npx tsx scripts/explorationEvalRaw.ts <runName>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const RUN = process.argv[2];
if (!RUN) throw new Error('run name required');
const d = JSON.parse(readFileSync(new URL(`../docs/upgrade-2026-10/33-stage3b-fix-eval-${RUN}.json`, import.meta.url), 'utf8'));

const L: string[] = [];
const p = (s = '') => L.push(s);
const ms = (n: number | null | undefined) => (n == null ? '—' : `${n} ms`);
type Rep = { status?: string; reasons?: string[] };
const repLine = (label: string, r: Rep[] | undefined) =>
  r && r.length ? `${label}: ${r.map((x, i) => `${i}=${x.status}${x.reasons && x.reasons.length ? ` (${x.reasons.join('; ')})` : ''}`).join(' | ')}` : `${label}: —`;
function report(r: unknown, indent = '  ') {
  if (!r || typeof r !== 'object') return;
  const o = r as Record<string, unknown>;
  if ('first' in o || 'retry' in o || 'refreshed' in o) {
    for (const k of ['first', 'retry', 'refreshed']) if (o[k]) (p(`${indent}- [${k}]`), report(o[k], indent + '  '));
    return;
  }
  const c = o as { dream?: Rep[]; user?: Rep[]; possibilities?: string[][]; texts?: { dream: string[]; user: string[]; possibilities: string[] } };
  const t = c.texts;
  if (!t) {
    p(`${indent}- ${repLine('dream sentences', c.dream)}`);
    p(`${indent}- ${repLine('her sentences', c.user)}`);
    p(`${indent}- possibilities: ${(c.possibilities ?? []).map((x, i) => `${i}=${x.length ? `refused (${x.join('; ')})` : 'passed'}`).join(' | ') || '—'}`);
    return;
  }
  (c.dream ?? []).forEach((x, i) => p(`${indent}- dream ${i} [${x.status}]: ${t.dream[i] ?? ''}${x.reasons?.length ? ` — ${x.reasons.join('; ')}` : ''}`));
  (c.user ?? []).forEach((x, i) => p(`${indent}- her ${i} [${x.status}]: ${t.user[i] ?? ''}${x.reasons?.length ? ` — ${x.reasons.join('; ')}` : ''}`));
  (c.possibilities ?? []).forEach((x, i) => p(`${indent}- possibility ${i} [${x.length ? 'refused' : 'passed'}]: ${t.possibilities[i] ?? ''}${x.length ? ` — ${x.join('; ')}` : ''}`));
}

p(`# הריצה ${RUN}: הפלט של המערכת כפי שנשמר, בלי שום עריכה`);
p();
p(`נוצר אוטומטית מתוך docs/upgrade-2026-10/33-stage3b-fix-eval-${RUN}.json (scripts/explorationEvalRaw.ts). כל טקסט כאן מועתק משם מילה במילה; הכותרות ושמות השדות הם של הסקריפט. התשובות של "החולמת" סינתטיות (gpt-4o-mini).`);
if (d.stoppedForBudget) p(`\n**הריצה נעצרה בגלל התקציב:** ${d.stoppedForBudget}`);

for (const j of d.journeys) {
  p();
  p(`## ${j.plan} (${j.kind})`);
  p();
  p(`**טקסט החלום:** ${j.text}`);
  p();
  p(`**חלקי החלום (כפי שהקוד חילק):** ${j.segments.join(' · ')}`);
  p();
  p('**הרגעים שהוצעו, לפי סדר ההצעה (התווית המוצגת ← מה שמודל התוויות החזיר | הטקסט מהחלום | עדיפות):**');
  for (const m of j.moments) p(`${m.id}. ${m.label} ← ${m.labelCandidate || '(ריק)'} | ${m.text} | ${m.priority}`);
  for (const [i, s] of j.steps.entries()) {
    p();
    p(`### צעד ${i + 1}: רגע "${s.moment}"`);
    p(`- שאלה (${s.question.source === 'fixed' ? 'גיבוי שנכתב בקוד' : 'נכתבה לרגע הזה'}; מוקד: ${s.question.focus ?? '—'}; נושא: ${s.question.subject ?? '—'}; ${ms(s.question.ms)}): ${s.question.text}`);
    for (const r of s.question.rejected) p(`  - מועמדת שנפסלה: ${r.question} — ${r.reasons.join('; ')}`);
    p(`- תשובה סינתטית: ${s.answer}`);
    if (s.alternative) {
      p(`- שאלה אחרת אחרי "לא יודעת" (${s.alternative.source === 'fixed' ? 'גיבוי שנכתב בקוד' : 'נכתבה עכשיו'}; מוקד: ${s.alternative.focus ?? '—'}; ${ms(s.alternative.ms)}): ${s.alternative.question}`);
      for (const r of s.alternative.rejected) p(`  - מועמדת שנפסלה: ${r.question} — ${r.reasons.join('; ')}`);
      p(`- תשובה סינתטית: ${s.alternative.answer}`);
    }
    if (s.unsureLook) p('- אין קריאת תובנה ("לא יודעת"): הרגע קיבל את מילות החלום בלבד.');
    if (s.followUp) {
      p(`- שאלת הבהרה: ${s.followUp.question}`);
      p(`  - מה חסר (פנימי): ${s.followUp.missing ?? '—'}`);
      p(`  - תשובה סינתטית להבהרה: ${s.followUp.answer ?? '(דולגה)'}`);
    } else p('- שאלת הבהרה: לא נשאלה');
    if (s.firstInsight && (s.retryMs != null || s.refreshMs != null)) {
      p(`- התובנה הראשונה (${s.firstInsight.kind}):`);
      p(`  - observation: ${s.firstInsight.observation}`);
      p(`  - reflection: ${s.firstInsight.reflection || '—'}`);
      p(`  - possibility: ${s.firstInsight.possibility || '—'}`);
    }
    p(`- התובנה שנשמרה (${s.insight?.kind ?? '—'}${s.retryMs != null ? ', אחרי ניסיון חוזר' : ''}${s.refreshMs != null ? ', אחרי ההבהרה' : ''}):`);
    p(`  - observation: ${s.insight?.observation ?? '—'}`);
    p(`  - reflection: ${s.insight?.reflection || '—'}`);
    p(`  - possibility: ${s.insight?.possibility || '—'}`);
    p(`- זמני תגובה: תובנה ${ms(s.replyMs)}${s.retryMs != null ? `, ניסיון חוזר ${ms(s.retryMs)}` : ''}${s.refreshMs != null ? `, תובנה מעודכנת ${ms(s.refreshMs)}` : ''}`);
    if (s.insightReport) {
      p('- מה הבודק עשה בכל משפט (checked = הוצג כפי שנכתב, quote = הוחלף בציטוט מדויק, drop = הושמט):');
      report(s.insightReport);
    }
  }
  for (const w of j.wholeViews) {
    p();
    p(`### מבט שלם אחרי ${w.afterMoments} רגעים (ניסיון ${w.attempt}; ${ms(w.ms)}; סוג: ${w.kind})`);
    if (w.notice) p(`- הודעה: ${w.notice}`);
    p(`- overview: ${w.overview}`);
    p(`- connections: ${w.connections.length ? w.connections.map((c: { from: string; to: string; title: string; basis: string }) => `[${c.from}→${c.to}] ${c.title} | ${c.basis}`).join(' ;; ') : '[]'}`);
    p(`- recurring: ${w.recurring ?? 'null'}`);
    p(`- contrast: ${w.contrast ?? 'null'}`);
    p(`- readings: ${w.readings.length ? w.readings.map((r: { basis: string; reading: string }) => `basis: ${r.basis} | reading: ${r.reading}`).join(' ;; ') : '[]'}`);
    p(`- closingQuestion: ${w.closingQuestion || '(אין: לא עברה את הבדיקות)'}`);
    p(`- invite: ${w.invite.length ? w.invite.join(', ') : '—'}`);
    const r = w.report;
    if (r && r.texts) {
      p('- מה הבודק עשה (המשפט כפי שהמודל כתב, ומה נקבע):');
      r.overview.forEach((x: { source: string; ok: boolean; reasons: string[] }, i: number) => p(`  - overview ${i} [${x.ok ? 'passed' : 'refused'}]: ${r.texts.overview[i] ?? ''}${x.reasons.length ? ` — ${x.reasons.join('; ')}` : ''}`));
      r.connections.forEach((x: string[], i: number) => p(`  - connection ${i} [${x.length ? 'refused' : 'passed'}]: ${r.texts.connections[i] ?? ''}${x.length ? ` — ${x.join('; ')}` : ''}`));
      if (r.texts.recurring) p(`  - recurring [${r.recurring.length ? 'refused' : 'passed'}]: ${r.texts.recurring}${r.recurring.length ? ` — ${r.recurring.join('; ')}` : ''}`);
      if (r.texts.contrast) p(`  - contrast [${r.contrast.length ? 'refused' : 'passed'}]: ${r.texts.contrast}${r.contrast.length ? ` — ${r.contrast.join('; ')}` : ''}`);
      r.readings.forEach((x: string[], i: number) => p(`  - reading ${i} [${x.length ? 'refused' : 'passed'}]: ${r.texts.readings[i] ?? ''}${x.length ? ` — ${x.join('; ')}` : ''}`));
      if (r.texts.closing) p(`  - closing [${r.closing.length ? 'refused' : 'passed'}]: ${r.texts.closing}${r.closing.length ? ` — ${r.closing.join('; ')}` : ''}`);
    } else if (r) {
      p('- מה הבודק עשה:');
      p(`  - overview: ${r.overview.map((x: { source: string; ok: boolean; reasons: string[] }, i: number) => `o${i} ${x.source} ${x.ok ? 'passed' : `refused (${x.reasons.join('; ')})`}`).join(' | ') || '—'}`);
      p(`  - connections: ${r.connections.map((x: string[], i: number) => `${i} ${x.length ? `refused (${x.join('; ')})` : 'passed'}`).join(' | ') || '—'}`);
      p(`  - recurring: ${r.recurring.length ? `refused (${r.recurring.join('; ')})` : '—/passed'}; contrast: ${r.contrast.length ? `refused (${r.contrast.join('; ')})` : '—/passed'}`);
      p(`  - readings: ${r.readings.map((x: string[], i: number) => `${i} ${x.length ? `refused (${x.join('; ')})` : 'passed'}`).join(' | ') || '—'}`);
      p(`  - closing: ${r.closing.length ? `refused (${r.closing.join('; ')})` : 'passed'}`);
    }
  }
  p();
  p(`קריאות כפולות שהסקריפט ניסה בכוונה והמערכת סירבה להן (בלי קריאה למודל): ${j.avoided}`);
}

// ------------------------------------------------------------------------------------------------ cost, responses, rewrites, times
type Call = { stage: string; model: string; input: number; output: number; usd: number; ms: number };
const calls: Call[] = d.calls;
const byStage = new Map<string, Call[]>();
for (const c of calls) byStage.set(c.stage, [...(byStage.get(c.stage) ?? []), c]);
const journeysSteps = d.journeys.flatMap((j: { steps: unknown[] }) => j.steps) as { question: { ms: number }; alternative: { ms: number } | null; replyMs: number | null; retryMs: number | null; refreshMs: number | null }[];
const userCalls: Record<string, number[]> = {
  'moment-question': journeysSteps.map((s) => s.question.ms),
  'moment-question-alt': journeysSteps.flatMap((s) => (s.alternative ? [s.alternative.ms] : [])),
  'moment-reply': journeysSteps.flatMap((s) => (s.replyMs != null ? [s.replyMs] : [])),
  'moment-reply-retry': journeysSteps.flatMap((s) => (s.retryMs != null ? [s.retryMs] : [])),
  'moment-reply-refresh': journeysSteps.flatMap((s) => (s.refreshMs != null ? [s.refreshMs] : [])),
  'whole-view': d.journeys.flatMap((j: { wholeViews: { attempt: number; ms: number }[] }) => j.wholeViews.filter((w) => w.attempt === 1).map((w) => w.ms)),
  'whole-view-retry': d.journeys.flatMap((j: { wholeViews: { attempt: number; ms: number }[] }) => j.wholeViews.filter((w) => w.attempt === 2).map((w) => w.ms)),
};
const median = (a: number[]) => {
  if (!a.length) return 0;
  const x = [...a].sort((m, n) => m - n);
  return x.length % 2 ? x[(x.length - 1) / 2] : Math.round((x[x.length / 2 - 1] + x[x.length / 2]) / 2);
};
p();
p('## עלות, קריאות, ניסיונות כתיבה מחדש וזמנים (נמדד)');
p();
p('| שלב | קריאות שהמשתמשת מחכה להן | תשובות מהמודל | כתיבות מחדש | חציון המתנה | מקסימום | עלות |');
p('|---|---|---|---|---|---|---|');
for (const [stage, list] of byStage) {
  const uc = userCalls[stage];
  const usd = list.reduce((a, c) => a + c.usd, 0);
  p(`| ${stage} | ${uc ? uc.length : '—'} | ${list.length} | ${uc ? list.length - uc.length : '—'} | ${uc && uc.length ? `${median(uc)} ms` : '—'} | ${uc && uc.length ? `${Math.max(...uc)} ms` : '—'} | $${usd.toFixed(4)} |`);
}
const total = calls.reduce((a, c) => a + c.usd, 0);
p();
p(`**סך הכול בריצה:** $${total.toFixed(4)} (${calls.length} תשובות מהמודל). מתוך זה הסימולטור: $${(byStage.get('simulated-dreamer') ?? []).reduce((a, c) => a + c.usd, 0).toFixed(4)}.`);
let i = 0;
const perJourney: string[] = [];
let current: string | null = null;
let sum = 0;
let prevStage = '';
for (const c of calls) {
  const startsJourney = c.stage === 'analysis' && prevStage !== 'analysis';
  prevStage = c.stage;
  if (startsJourney) {
    if (current !== null) perJourney.push(`${current}: $${sum.toFixed(4)}`);
    current = d.journeys[i]?.plan ?? `#${i}`;
    i += 1;
    sum = 0;
  }
  sum += c.usd;
}
if (current !== null) perJourney.push(`${current}: $${sum.toFixed(4)}`);
p(`**לפי מסע:** ${perJourney.join(' · ')}`);
writeFileSync(new URL(`../docs/upgrade-2026-10/33-stage3b-fix-${RUN}-raw.md`, import.meta.url), L.join('\n') + '\n');
console.log(`written 33-stage3b-fix-${RUN}-raw.md (${L.length} lines)`);
