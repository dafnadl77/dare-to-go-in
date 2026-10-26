/**
 * Before the acceptance run (doc 73, her request): every whole view and every insight the model wrote in the stored runs of the journey
 * (acc-1, p2dev-1, p3dev-1, p4dev-1), decided again by today's code with no model call. Part A: the whole views, before and after, with
 * every line and what would be shown. Part B: every insight possibility that would be shown today. Part B (with part A's shown text) is
 * what the independent safety review reads. Writes docs/upgrade-2026-10/75-whole-view-audit.md.   Run: npx tsx scripts/wholeViewAudit.ts
 *
 * Older runs kept the whole view's texts, not the model's full answer: their "dream"/"user" opening lines (factual) are left out, and
 * their "recurring" and "contrast" were kept without quotes, so they cannot be checked again and are reported as they were.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as I from '../src/hero/interpretationCheck.ts';
import * as C from '../src/hero/claimCheck.ts';
import * as S from '../src/hero/explorationSchema.ts';
import { segmentDream } from '../src/hero/dreamSegments.ts';
import { isUnsureAnswer } from '../src/hero/hebrewText.ts';

const DOCS = new URL('../docs/upgrade-2026-10/', import.meta.url);
const load = (f: string) => JSON.parse(readFileSync(new URL(f, DOCS), 'utf8'));
const out: string[] = [];
const say = (s = '') => out.push(s);
type Step = { moment: string; momentText: string; answer: string; question: { text: string }; insight?: { observation: string; reflection: string; possibility: string } | null; insightReport?: Record<string, unknown> | null };
type Report = { cards?: (I.SourceCard | null)[]; texts?: { possibilities: string[] } };
const reportsOf = (ir: Record<string, unknown> | null | undefined): Report[] =>
  !ir ? [] : 'texts' in ir ? [ir as Report] : Object.values(ir).filter((v) => v && typeof v === 'object' && 'texts' in (v as object)) as Report[];
const KIND: Record<string, string> = { whole: 'מבט שלם', 'first-look': 'מבט ראשון', 'no-link': 'בלי קשר', 'factual-summary': 'סיכום עובדתי' };
const tally: Record<string, [number, number]> = {};
const count = (before: string, after: string) => {
  tally[before] ??= [0, 0];
  tally[after] ??= [0, 0];
  tally[before][0] += 1;
  tally[after][1] += 1;
};
const shownWhole: string[] = [];

/**
 * When a run kept every model response (doc 62 on), the FIRST answer of each step's reply and of each whole view, which is what today's
 * code decides on (a retry happened only because the code of that day refused the first one). Each step starts at its simulated answer.
 */
function firstResponses(run: { responses?: { stage: string; text: string }[] }) {
  if (!run.responses?.length) return null;
  const replies: NonNullable<ReturnType<typeof S.parseMomentReply>>[] = [];
  const wholes: { afterMoments: number; raw: unknown }[] = [];
  let steps = 0;
  let replyTaken = true;
  let wholeTaken = -1;
  for (const r of run.responses) {
    if (r.stage === 'simulated-dreamer') (steps += 1), (replyTaken = false);
    else if (r.stage.startsWith('moment-reply') && !replyTaken) {
      const p = S.parseMomentReply(JSON.parse(r.text));
      if (p) replies.push(p), (replyTaken = true);
    } else if (r.stage === 'whole-view' && wholeTaken !== steps) wholes.push({ afterMoments: steps, raw: JSON.parse(r.text) }), (wholeTaken = steps);
  }
  return { replies, wholes };
}
const shownInsights: string[] = [];

say('# 75. לפני בדיקת הקבלה: כל מבט שלם וכל תובנה מהריצות השמורות, בקוד של היום (בלי AI)');
say();
say('נוצר על ידי `scripts/wholeViewAudit.ts`. "לפני" הוא מה שהריצה הציגה. "אחרי" הוא מה שהקוד של היום מחליט על אותו טקסט בדיוק.');
say('- **ב-p4dev-1 נבדקה התשובה הראשונה של המודל בכל צעד ובכל מבט**, כי על זה הקוד של היום מחליט. בריצה ניסיון חוזר קרה רק כי הקוד של אז פסל את הראשונה.');
say('- **מה לא נבדק שוב בריצות הישנות:** שורות הפתיחה העובדתיות ("dream", "user"), וחלקי "חוזר" ו"ניגוד", כי הציטוטים שלהם לא נשמרו. ב-p4dev-1 התשובה המלאה נשמרה.');
say();
say('## א. המבטים');
say();

for (const name of ['acc-1', 'p2dev-1', 'p4dev-1']) {
  const run = load(`33-stage3b-fix-eval-${name}.json`);
  for (const J of run.journeys) {
    const segs = segmentDream(J.text);
    const segOf = (t: string) => segs.filter((s) => t.includes(s.text) || s.text.includes(t)).map((s) => s.id);
    const idOf = (label: string) => (J.moments as { id: string; label: string }[]).find((m) => m.label === label)?.id ?? label;
    const firstAnswers = firstResponses(run);
    const views = (firstAnswers ? [] : [...(J.wholeViews ?? [])]) as { afterMoments: number; kind: string; report: { texts: { overview: string[]; connections: string[]; readings: string[]; closing: string; recurring: string; contrast: string } } }[];
    // p4dev-1's last whole view never finished (the cap stopped its retry): its first attempt is in the run's responses
    const storedKind = (after: number) => (J.wholeViews ?? []).find((w: { afterMoments: number }) => w.afterMoments === after)?.kind ?? 'factual-summary (הניסיון החוזר נעצר בתקרה)';
    const all = [
      ...views.map((v) => ({ v, raw: null as unknown })),
      ...(firstAnswers?.wholes ?? []).map((w) => ({ v: { afterMoments: w.afterMoments, kind: storedKind(w.afterMoments), report: null }, raw: w.raw })),
    ];
    for (const { v, raw } of all) {
      const steps = (J.steps as Step[]).slice(0, v.afterMoments);
      const explored = steps.map((st) => ({ id: idOf(st.moment), label: st.moment, segments: segOf(st.momentText), answers: [st.answer].filter((a) => a && !isUnsureAnswer(a)), question: st.question.text, insight: st.insight ?? null }));
      const ids = explored.map((m) => m.id);
      const t = (v as { report: { texts: (typeof views)[number]['report']['texts'] } | null }).report?.texts;
      const rebuilt = raw ?? {
        overview: (t?.overview ?? []).filter((o) => o.startsWith('[interpretation]')).map((o) => ({ source: 'interpretation', segment: 0, action: '', actor: '', target: '', moment: '', quote: '', basis: ids, text: o.replace('[interpretation] ', '') })),
        connections: (t?.connections ?? []).map((c) => {
          const m = /^(m\d+)→(m\d+) "([^"]*)" «(.*?)» · «(.*?)» — (.*)$/s.exec(c);
          return m ? { from: m[1], to: m[2], title: m[3], fromQuote: m[4], toQuote: m[5], link: m[6] } : { from: '', to: '', title: '', fromQuote: '', toQuote: '', link: c };
        }),
        recurring: { element: '', quotes: [], text: '' },
        contrast: { quotes: [], text: '' },
        readings: (t?.readings ?? []).map((r) => ({ segment: Number(/^s(\d+):/.exec(r)?.[1] ?? -1), text: r.replace(/^s\d+: /, '') })),
        closing: { text: t?.closing ?? '', moment: '', quote: '' },
      };
      const parsed = S.parseWholeView(rebuilt);
      if (!parsed) continue;
      const { view, report } = C.assembleWhole(parsed, { language: 'he', sourceText: J.text, segments: segs, explored, unexplored: [], previous: null, maxReadings: 2 } as never);
      const before = v.kind.split(' ')[0];
      count(before, view.kind);
      say(`### ${name} / ${J.plan}, אחרי ${v.afterMoments} רגעים: לפני **${KIND[before] ?? before}**, אחרי **${KIND[view.kind]}**`);
      say();
      report.texts.overview.forEach((x, n) => say(`- פתיחה: "${x.replace('[interpretation] ', '')}" — ${report.overview[n]?.ok ? '**מוצגת**' : `נפסלת: ${report.overview[n]?.reasons.join('; ')}`}`));
      report.texts.connections.forEach((x, n) => say(`- קשר: "${x.replace(/^.* — /s, '')}" — ${report.connections[n]?.length ? `נפסל: ${report.connections[n].join('; ')}` : '**מוצג**'}`));
      report.texts.readings.forEach((x, n) => say(`- קריאה: "${x.replace(/^s\d+: /, '')}" — ${report.readings[n]?.length ? `נפסלת: ${report.readings[n].join('; ')}` : '**מוצגת**'}`));
      say(`- שאלת סיום: "${report.texts.closing}" — ${report.closing.length ? `נפסלת: ${report.closing.join('; ')} (במקומה: "${view.closingQuestion}")` : '**מוצגת**'}`);
      if (t?.recurring) say(`- חוזר (לא נבדק שוב, הציטוטים לא נשמרו; לפני הוצג): "${t.recurring}"`);
      if (t?.contrast) say(`- ניגוד (לא נבדק שוב, הציטוטים לא נשמרו; לפני הוצג): "${t.contrast}"`);
      say();
      if (view.kind !== 'factual-summary') {
        shownWhole.push(`- **${name}/${J.plan}, מבט אחרי ${v.afterMoments}:** פתיחה: "${view.overview}"${view.connections.length ? `; קשרים: ${view.connections.map((c) => `"${c.basis}"`).join(' | ')}` : ''}${view.readings.length ? `; קריאות: ${view.readings.map((r) => `"${r.reading}"`).join(' | ')}` : ''}; שאלת סיום: "${view.closingQuestion}"`);
      }
    }
  }
}

say('**סיכום, לפי סוג המבט:**');
say();
say('| סוג | לפני | אחרי |');
say('|---|---|---|');
for (const [k, [b, a]] of Object.entries(tally)) say(`| ${KIND[k] ?? k} | ${b} | ${a} |`);
say();

// ------------------------------------------------------------------------------------------------ B. every insight shown today

say('## ב. כל אפשרות פרשנית שהייתה מוצגת היום, מהריצות השמורות');
say();
for (const name of ['acc-1', 'p2dev-1', 'p3dev-1', 'p4dev-1']) {
  const run = load(`33-stage3b-fix-eval-${name}.json`);
  for (const J of run.journeys) {
    const segs = segmentDream(J.text);
    const segOf = (t: string) => segs.filter((s) => t.includes(s.text) || s.text.includes(t)).map((s) => s.id);
    (J.steps as Step[]).forEach((st, k) => {
      if (isUnsureAnswer(st.answer ?? '')) return;
      const first = firstResponses(run)?.replies[k];
      const reps = reportsOf(st.insightReport);
      const last = reps[reps.length - 1];
      if (!first && !last?.texts) return;
      const cands = first ? first.possibilities.map((p) => ({ text: p.text, card: p.card ?? null })) : last!.texts!.possibilities.map((x, i) => ({ text: x, card: last!.cards?.[i] ?? null }));
      const s = { language: 'he' as const, sourceText: J.text, segments: segs, allowed: segOf(st.momentText), answers: [st.answer] };
      const pick = I.selectPossibility(cands, s, { exploredCount: 1, earlier: (J.steps as Step[]).slice(0, k).map((b) => b.insight?.possibility ?? '').filter(Boolean), exchanges: [{ question: st.question.text, answer: st.answer }] });
      if (pick.index === null) return;
      shownInsights.push(`- **${name}/${J.plan}, צעד ${k + 1}** («${st.moment}»; החלק בחלום: "${st.momentText}"; התשובה שלה: "${st.answer}"): "${cands[pick.index].text}" (רמה ${pick.verdicts[pick.index].quality.level})`);
    });
  }
}
say(shownInsights.join('\n') || '(אין)');
say();
say('## ג. מה שהיה מוצג היום מהמבטים (לבדיקת הבטיחות)');
say();
say(shownWhole.join('\n') || '(אין)');

writeFileSync(new URL('75-whole-view-audit.md', DOCS), out.join('\n') + '\n');
console.log(`wrote docs/upgrade-2026-10/75-whole-view-audit.md (${out.length} lines)`);
