/**
 * THE PAIR FIXED-INPUT TEST (doc 90 §5, stage 1): the new "two details and a question" reply on EXACTLY the eight saved moments of
 * acc2-1, one call per moment, through the product's own code (pairReplySetup in the route: the same instructions, input, schema,
 * checks and pacing). Each answer is used twice, with no second call:
 *  - every pair the checker approves, in every moment, without the pacing — what the blind judge rates for quality (doc 90 §5);
 *  - what the route would show, with the pacing she approved (never two moments in a row) — what the judge reads as a conversation.
 *
 *   npx tsx scripts/pairFixedInputTest.ts         → dry: builds the eight inputs, prints the worst-case cost and the budget verdict
 *   npx tsx scripts/pairFixedInputTest.ts stub    → offline check of the whole pipeline: the doc-83 run's saved answers stand in for
 *                                                   the model (no network); writes only to the temp folder
 *   npx tsx scripts/pairFixedInputTest.ts send    → the real test: refused unless ALL eight worst cases fit the run's cap and what is
 *                                                   left of stage 3, and refused if pfi-1 is already in the ledger; never a retry
 *
 * The run's cap is set by her approval; until then `send` refuses (stage 3 has $0.036579 left). Writes, on `send`:
 * docs/upgrade-2026-10/97-pair-fixed-input-test.json, 97-pair-fixed-input-raw.md and 98-pair-judge-packet.md.
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const MODE = (process.argv[2] ?? 'dry') as 'dry' | 'stub' | 'send';
if (!['dry', 'stub', 'send'].includes(MODE)) {
  console.error('pairFixedInputTest: mode must be dry, stub or send. Nothing was sent.');
  process.exit(1);
}
/** The run's own cap: her decision. Set here only after she approves the test and its budget. */
const RUN_CAP = Number(process.env.PFI_RUN_CAP ?? '0');
const DOCS = new URL('../docs/upgrade-2026-10/', import.meta.url);
const LEDGER = new URL('27-eval-cost-ledger.json', DOCS);
type Ledger = { totalUsd: number; capUsd: number; stopAtUsd: number; entries: { at: string; run: string; stage: string; model: string; input: number; output: number; usd: number; ms: number }[] };
const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as Ledger;

process.env.OPENAI_REFLECTION_MODEL ||= 'gpt-4.1';
const X = await import('./lib/pairExperiment.ts');
const S = await import('../src/hero/explorationSchema.ts');
const R = await import('../server/routes/dreamExploration.ts');
const { resolveStageModel } = await import('../server/stageModel.ts');

const run = JSON.parse(readFileSync(new URL('33-stage3b-fix-eval-acc2-1.json', DOCS), 'utf8'));
const dreams = JSON.parse(readFileSync(new URL('74-acceptance-dreams-2.json', DOCS), 'utf8'));
const moments = X.fixedMoments(run, dreams);
if (moments.length !== 8) throw new Error(`expected the 8 moments of acc2-1, got ${moments.length}`);

const model = resolveStageModel('OPENAI_REFLECTION_MODEL');
const forced = moments.map((m) => R.pairReplySetup(m.ctx as never, m.p as never, { pairsNow: true }));
const worst = forced.map((f) => X.worstCaseUsd(f.instructions, f.input, model));
const worstTotal = worst.reduce((a, b) => a + b, 0);
const verdict = X.budgetVerdict({ worstTotal, runCap: RUN_CAP, spentInStage: ledger.totalUsd, stageStop: ledger.stopAtUsd, alreadyRun: ledger.entries.some((e) => e.run === X.RUN) });

console.log(`model ${model}; 8 calls, one each, no retry; output bound ${X.MAX_OUTPUT_TOKENS} tokens`);
moments.forEach((m, i) => console.log(`  ${m.key} «${m.label}»: input ${forced[i].instructions.length + forced[i].input.length} chars, worst $${worst[i].toFixed(4)}`));
console.log(`worst case in all: $${worstTotal.toFixed(4)}; stage 3 spent $${ledger.totalUsd.toFixed(6)} of $${ledger.stopAtUsd}; run cap $${RUN_CAP}`);
console.log(verdict.ok ? 'budget: fits' : `budget: does NOT fit — ${verdict.why}`);
if (MODE === 'dry') process.exit(0);
if (MODE === 'send' && !verdict.ok) {
  console.error(`pairFixedInputTest: refused, nothing was sent (${verdict.why}).`);
  process.exit(1);
}

// ------------------------------------------------------------------------------------------------ the answers

/** stub: the doc-83 run's saved answers for the same moments, their anchors made into pairs (no network, no cost). */
function stubRaw(key: string): string {
  const saved = (JSON.parse(readFileSync(new URL('85-fixed-input-test.json', DOCS), 'utf8')) as { results: { key: string; new: { raw: string } }[] }).results.find((r) => r.key === key)!;
  const j = JSON.parse(saved.new.raw) as { dream: unknown[]; user: unknown[]; possibilities: { anchors: { quote: string; from: string }[]; relation: string }[] };
  const map: Record<string, string> = { contrast: 'negation', missing: 'negation', change: 'change', 'want-vs-cannot': 'wanted-not-managed' };
  const pairs = j.possibilities.filter((p) => p.anchors.length >= 2).map((p) => ({ a: p.anchors[0], b: p.anchors[1], relation: map[p.relation] ?? p.relation, question: '' }));
  return JSON.stringify({ dream: j.dream, user: j.user, pairs, missingInformation: '', followUpQuestion: '' });
}

const raws: (string | null)[] = moments.map(() => null);
const calls: { key: string; usd: number; input: number; output: number; ms: number }[] = [];
let stopped: string | null = null;
if (MODE === 'stub') moments.forEach((m, i) => (raws[i] = stubRaw(m.key)));
else {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  for (let i = 0; i < moments.length; i += 1) {
    // a second guard, with what was really spent: the next call's worst case must still fit the run's hard cap
    const spent = calls.reduce((a, c) => a + c.usd, 0);
    if (spent + worst[i] > RUN_CAP) {
      stopped = `cap: spent $${spent.toFixed(4)}, next call up to $${worst[i].toFixed(4)}, cap $${RUN_CAP}`;
      break;
    }
    const t0 = Date.now();
    try {
      // the product's call (callModel): same model, temperature, store and schema; the output bounded for the budget
      const res = await client.responses.create({ model, store: false, instructions: forced[i].instructions, input: forced[i].input, temperature: 0.7, max_output_tokens: X.MAX_OUTPUT_TOKENS, text: { format: { type: 'json_schema', name: 'pair_reply', schema: S.PAIR_REPLY_JSON_SCHEMA as Record<string, unknown>, strict: true } } });
      const input = res.usage?.input_tokens ?? 0;
      const output = res.usage?.output_tokens ?? 0;
      const [pin, pout] = X.priceOf(res.model || model);
      const usd = (input * pin + output * pout) / 1_000_000;
      calls.push({ key: moments[i].key, usd, input, output, ms: Date.now() - t0 });
      ledger.entries.push({ at: new Date().toISOString(), run: X.RUN, stage: 'pair-reply-fixed-input', model: res.model || model, input, output, usd, ms: Date.now() - t0 });
      ledger.totalUsd = Number((ledger.totalUsd + usd).toFixed(6));
      writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
      raws[i] = res.output_text;
      console.log(`${moments[i].key}: $${usd.toFixed(4)} (${input} in, ${output} out)`);
    } catch (err) {
      stopped = `${moments[i].key}: ${(err as Error).message}`; // no retry: the test stops here
      break;
    }
  }
}

// ------------------------------------------------------------------------------------------------ what each answer gives

const results: import('./lib/pairExperiment.ts').MomentResult[] = [];
const shownSoFar = new Map<string, { insight: unknown; followUp: { question: string; answer: null } | null }[]>();
moments.forEach((m, i) => {
  const base = { key: m.key, plan: m.plan, label: m.label, momentText: m.momentText, question: m.question, answer: m.answer };
  const parsed = raws[i] ? S.parsePairReply(JSON.parse(raws[i] as string)) : null;
  if (!parsed) {
    results.push({ ...base, invalid: true, value: null, approved: [], refused: [] });
    return;
  }
  // without the pacing: every pair the checker approves
  const all = forced[i].finish(parsed, false).pairs.verdicts;
  const approved = all.flatMap((v) => (v.pair ? [{ a: v.pair.a, b: v.pair.b, question: v.pair.question, questionReplaced: v.reasons.some((r) => r.startsWith('question replaced')), differentImages: v.pair.differentImages }] : []));
  const refused = all.flatMap((v, k) => (v.pair ? [] : [{ a: parsed.pairs[k].a.quote, b: parsed.pairs[k].b.quote, reasons: v.reasons }]));
  // with the pacing: the earlier moments of this journey as this run showed them
  const before = shownSoFar.get(m.plan) ?? [];
  const prior = m.p.prior.map((pm, k) => ({ ...pm, insight: (before[k]?.insight as never) ?? pm.insight, followUp: before[k]?.followUp ?? pm.followUp }));
  const value = R.pairReplySetup(m.ctx as never, { ...m.p, prior } as never).finish(parsed, false);
  shownSoFar.set(m.plan, [...before, { insight: value.insight, followUp: value.insight.pair ? { question: value.insight.pair.question, answer: null } : null }]);
  results.push({ ...base, invalid: false, value, approved, refused });
});

const measures = X.automaticMeasures(results);
const out = MODE === 'stub' ? join(tmpdir(), 'pairfit-stub') : new URL('.', DOCS).pathname.replace(/^\/([A-Za-z]:)/, '$1');
mkdirSync(out, { recursive: true });
const name = (f: string) => join(out, f);
writeFileSync(name('97-pair-fixed-input-test.json'), JSON.stringify({ run: X.RUN, mode: MODE, stopped, runCap: RUN_CAP, spentUsd: Number(calls.reduce((a, c) => a + c.usd, 0).toFixed(6)), calls, measures, decisionRule: X.DECISION_RULE, results: results.map((r, i) => ({ ...r, raw: raws[i] })) }, null, 2));

const L: string[] = [`# 97. ניסוי הקלט הקבוע לזוגות: הפלט הגולמי (${MODE === 'stub' ? 'בדיקה מקומית, בלי AI' : `${calls.length} קריאות, $${calls.reduce((a, c) => a + c.usd, 0).toFixed(6)}`})`, ''];
if (stopped) L.push(`**נעצר:** ${stopped}`, '');
results.forEach((r) => {
  L.push(`## ${r.key} «${r.label}»`, '', `- **החלק בחלום:** «${r.momentText}»`, `- **השאלה:** «${r.question}»`, `- **התשובה:** «${r.answer}»`);
  if (r.invalid) L.push('- **התשובה של המודל לא נקראה.**');
  r.approved.forEach((x) => L.push(`- **אושר:** «${x.a.quote}» (${x.a.from}) / «${x.b.quote}» (${x.b.from}) — "${x.question}"${x.questionReplaced ? ' (השאלה הוחלפה)' : ''}`));
  r.refused.forEach((x) => L.push(`- **נפסל:** «${x.a}» / «${x.b}» — ${x.reasons.join('; ')}`));
  L.push(`- **מה מוצג עם חוקי הקצב:** ${r.value?.insight.pair ? 'זוג ושאלה' : `הקשבה בלבד (${r.value?.pairs.why || 'אין זוג מאושר'})`}`, `- **השיקוף:** ${[r.value?.insight.observation, r.value?.insight.reflection].filter(Boolean).join(' ')}`, '');
});
L.push('## מדדים אוטומטיים', '', '```json', JSON.stringify(measures, null, 2), '```');
writeFileSync(name('97-pair-fixed-input-raw.md'), `${L.join('\n')}\n`);
writeFileSync(name('98-pair-judge-packet.md'), X.judgePacket(results));
console.log(`${MODE === 'stub' ? 'stub (no network)' : `sent ${calls.length}, $${calls.reduce((a, c) => a + c.usd, 0).toFixed(4)}`}; wrote 97 and 98 to ${out}`);
console.log(JSON.stringify(measures));
