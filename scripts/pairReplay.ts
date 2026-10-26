/**
 * Offline replay for doc 90 v3, step 3 (no AI call, no network): every candidate the model really wrote for the eight saved moments of
 * acc2-1 (the old prompt's first answer and the doc-83 prompt's, docs/upgrade-2026-10/85-fixed-input-test.json) is turned into a pair
 * candidate — its two anchors, its relation mapped to the three of doc 90 — and run through pairCheck exactly as the route would.
 * This shows what the new checks let through on real outputs. It is NOT the stage-1 test of doc 90 §5: those outputs were written for
 * another task (possibilities, not pairs), so they say what the checker does, not how good the model's pairs would be.
 *
 *   npx tsx scripts/pairReplay.ts > docs/upgrade-2026-10/95-pair-replay.md
 */
import { readFileSync } from 'node:fs';
import { segmentDream } from '../src/hero/dreamSegments';
import { choosePair, pairAllowedHere, type PairCandidate, type PairRelation, type PairSources } from '../src/hero/pairCheck';

const run = JSON.parse(readFileSync('docs/upgrade-2026-10/85-fixed-input-test.json', 'utf8')) as { results: { key: string; label: string; momentText: string; question: string; answer: string; old: { raw: string }; new: { raw: string } }[] };
const dreams = JSON.parse(readFileSync('docs/upgrade-2026-10/74-acceptance-dreams-2.json', 'utf8')) as { key: string; text: string; address: 'masculine' | 'feminine' | 'neutral' }[];

const MAP: Record<string, PairRelation> = { contrast: 'negation', missing: 'negation', change: 'change', 'want-vs-cannot': 'wanted-not-managed' };
const cut = (t: string, n = 70) => (t.length > n ? `${t.slice(0, n)}…` : t);

function candidatesOf(raw: string): { cand: PairCandidate; label: string }[] {
  let j: { possibilities?: { anchors?: { quote: string; from: string }[]; relation?: string }[] };
  try {
    j = JSON.parse(raw);
  } catch {
    return [];
  }
  return (j.possibilities ?? []).flatMap((p) => {
    const an = (p.anchors ?? []).filter((a) => a.quote);
    if (an.length < 2) return [];
    const relation = (MAP[p.relation ?? ''] ?? p.relation) as PairRelation;
    return [{ cand: { a: { quote: an[0].quote, from: an[0].from === 'answer' ? 'answer' : 'dream' }, b: { quote: an[1].quote, from: an[1].from === 'answer' ? 'answer' : 'dream' }, relation, question: '' }, label: p.relation ?? '' }];
  });
}

const out: string[] = [];
out.push('# 95. הרצה חוזרת מקומית: מועמדות אמיתיות דרך בדיקת הזוגות', '');
out.push('**מה זה:** כל מועמדת שהמודל כתב בפועל לשמונת הרגעים השמורים של acc2-1, נבדקה בבודק הזוגות החדש (pairCheck.ts). **בלי AI.**', '');
out.push('**חשוב:** המועמדות נכתבו למשימה אחרת (אפשרויות, לא זוגות). ההרצה מראה מה הבודק מעביר ומה הוא פוסל. היא **לא** מודדת כמה טובים יהיו זוגות שהמודל יכתוב למשימה החדשה. את זה מודד ניסוי הקלט הקבוע של doc 90 סעיף 5, שדורש אישור נפרד.', '');

let total = 0;
let passed = 0;
const perDream = new Map<string, boolean[]>();
for (const r of run.results) {
  const dreamKey = r.key.split('#')[0];
  const dream = dreams.find((d) => d.key === dreamKey)!;
  const segments = segmentDream(dream.text);
  const allowed = segments.filter((s) => r.momentText.includes(s.text) || s.text.includes(r.momentText)).map((s) => s.id);
  const s: PairSources = { language: 'he', sourceText: dream.text, segments, allowed, answers: [r.answer], address: dream.address === 'neutral' ? 'feminine' : dream.address };
  const prior = perDream.get(dreamKey) ?? [];
  const pacing = pairAllowedHere({ priorPairs: prior, answer: r.answer, momentText: r.momentText, refreshing: false });
  out.push(`## ${r.key} — ${r.label}`, '');
  out.push(`- **הרגע:** «${r.momentText}»`, `- **התשובה:** «${r.answer}»`, `- **הקצב:** ${pacing.allowed ? 'מותר להציע זוג' : `אין זוג (${pacing.why})`}`, '');
  out.push('| גרסה | עוגן א | עוגן ב | יחס במקור → בבודק | החלטה |', '|---|---|---|---|---|');
  let shownHere = false;
  for (const side of ['old', 'new'] as const) {
    const cands = candidatesOf(r[side].raw);
    const pick = choosePair(cands.map((c) => c.cand), s);
    cands.forEach((c, i) => {
      total += 1;
      const v = pick.verdicts[i];
      if (v?.pair) passed += 1;
      const decision = v?.pair ? `**עובר**${pick.index === i ? ' (נבחר)' : ''}${v.pair.differentImages ? ' · בלי מילה משותפת' : ''}` : (v?.reasons ?? ['—']).join('; ');
      out.push(`| ${side === 'old' ? 'ישנה' : 'חדשה'} | ${c.cand.a.from === 'dream' ? 'חלום' : 'תשובה'}: «${cut(c.cand.a.quote)}» | ${c.cand.b.from === 'dream' ? 'חלום' : 'תשובה'}: «${cut(c.cand.b.quote)}» | ${c.label} → ${c.cand.relation} | ${decision} |`);
    });
    if (pick.pair) shownHere = true;
  }
  out.push('');
  const shown = pacing.allowed && shownHere;
  out.push(`**מה היה מוצג ברגע הזה:** ${shown ? 'זוג אחד ושאלה' : pacing.allowed ? 'הקשבה בלבד (אף מועמדת לא עברה)' : 'הקשבה בלבד (הקצב)'}`, '');
  perDream.set(dreamKey, [...prior, shown]);
}
out.push('## סיכום', '', `- **מועמדות שנבדקו:** ${total}`, `- **עברו את הבודק:** ${passed}`);
out.push(`- **רגעים עם זוג, אחרי חוקי הקצב:** ${[...perDream.values()].flat().filter(Boolean).length} מתוך ${run.results.length}`);
console.log(out.join('\n'));
