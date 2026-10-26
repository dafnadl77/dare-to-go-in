/**
 * The fixed-input test of doc 83 (her approval of 2026-10-23): the ONE change (the possibility instructions of a moment's insight) on
 * EXACTLY the inputs of the acceptance run acc2-1. For each of its 8 moments, the reply input is rebuilt from the saved run with the same
 * builder the product uses, and sent ONCE with today's (new) instructions; the old side is the run's own first answer for that moment.
 * Both sides are then judged by today's checker, unchanged (the checker files are locked by tests/fix83.test.ts), and written out for a
 * blind judge. No question, no simulator, no whole view, no retry.
 *
 *   npx tsx scripts/fixedInputTest.ts            → builds and checks the inputs, sends nothing
 *   npx tsx scripts/fixedInputTest.ts send       → sends the 8 calls (once: refused if this run is already in the ledger)
 *
 * Budget: a hard $0.11 for this run, checked before every call against its worst case (input chars / 3 tokens, at most 1100 output
 * tokens); the stage-3 cap ($3.12) as well. Writes docs/upgrade-2026-10/85-fixed-input-test.json, 85-fixed-input-raw.md,
 * 86-blind-pairs.md and 86-blind-key.json (the key is not given to the judge).
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const RUN = 'fit83-1';
const CAP = 0.11;
const STAGE3_CAP = 3.12;
const SEND = process.argv[2] === 'send';
const DOCS = new URL('../docs/upgrade-2026-10/', import.meta.url);
const LEDGER = new URL('27-eval-cost-ledger.json', DOCS);
const ledger = JSON.parse(readFileSync(LEDGER, 'utf8')) as { totalUsd: number; capUsd: number; stopAtUsd: number; entries: { at: string; run: string; stage: string; model: string; input: number; output: number; usd: number; ms: number }[] };
if (SEND && ledger.entries.some((e) => e.run === RUN)) {
  console.error(`fixedInputTest: ${RUN} is already in the ledger; no rerun. Nothing was sent.`);
  process.exit(1);
}

process.env.OPENAI_REFLECTION_MODEL ||= 'gpt-4.1';
const S = await import('../src/hero/explorationSchema.ts');
const C = await import('../src/hero/claimCheck.ts');
const { segmentDream, segmentsForMoment } = await import('../src/hero/dreamSegments.ts');
const { resolveStageModel } = await import('../server/stageModel.ts');

const run = JSON.parse(readFileSync(new URL('33-stage3b-fix-eval-acc2-1.json', DOCS), 'utf8'));
type Step = { moment: string; question: { text: string; focus: string | null; subject: string | null }; answer: string; alternative?: { question: string; answer: string; focus?: string | null } | null; insight: { observation: string; reflection: string; possibility: string } | null };

// the run's responses, journey by journey: its source text (from the analysis) and the FIRST reply answer of each step
const perJourney: { sourceText: string; firstReplies: string[] }[] = [];
{
  let prev = '';
  for (const r of run.responses as { stage: string; text: string }[]) {
    if (r.stage === 'analysis') perJourney.push({ sourceText: JSON.parse(r.text).sourceText, firstReplies: [] });
    const isReply = r.stage.startsWith('moment-reply');
    if (r.stage === 'moment-reply' && prev !== 'reply') perJourney[perJourney.length - 1].firstReplies.push(r.text);
    prev = isReply ? 'reply' : r.stage;
  }
}

const address = (plan: string) => (JSON.parse(readFileSync(new URL('74-acceptance-dreams-2.json', DOCS), 'utf8')) as { key: string; address: 'feminine' | 'masculine' | 'neutral' }[]).find((d) => d.key === plan)!.address;
const moments: {
  key: string; plan: string; k: number; label: string; momentText: string; question: string; answer: string;
  instructions: string; input: string; sources: Record<string, unknown>; earlier: string[]; oldRaw: string; oldShown: string;
}[] = [];
run.journeys.forEach((J: { plan: string; moments: { id: string; label: string; text: string }[]; steps: Step[] }, ji: number) => {
  const { sourceText, firstReplies } = perJourney[ji];
  const segments = segmentDream(sourceText);
  const momentOf = (label: string) => J.moments.find((m) => m.label === label)!;
  const segsOf = (label: string) => segmentsForMoment(segments, { excerpt: momentOf(label).text, label });
  const asked = (st: Step) => (st.alternative ? { question: st.alternative.question, answer: st.alternative.answer, focus: st.alternative.focus ?? null } : { question: st.question.text, answer: st.answer, focus: st.question.focus });
  J.steps.forEach((st, k) => {
    const prior = J.steps.slice(0, k).map((b) => ({
      id: momentOf(b.moment).id, label: b.moment, segments: segsOf(b.moment), question: asked(b).question, answer: asked(b).answer,
      followUp: null, insight: b.insight, focus: asked(b).focus as never, subject: b.question.subject,
    }));
    const m = momentOf(st.moment);
    const moment = { id: m.id, label: m.label, segments: segsOf(st.moment) };
    const { question, answer } = asked(st);
    const input = S.buildMomentReplyInput({ sourceText, segments, prior, moment, question, answer, followUp: null, feelings: '' });
    const sources = {
      language: 'he', sourceText, segments, allowed: moment.segments, answers: [answer], address: address(J.plan),
      momentSegments: moment.segments, explored: [...new Set(prior.flatMap((p) => p.segments))],
      priorQuestions: [...prior.map((p) => p.question), question], exchanges: [{ question, answer }],
    };
    const earlier = prior.flatMap((p) => (p.insight ? [p.insight.possibility, p.insight.observation] : [])).filter(Boolean);
    moments.push({ key: `${J.plan}#${k + 1}`, plan: J.plan, k: k + 1, label: st.moment, momentText: m.text, question, answer, instructions: S.buildMomentReplySystemPrompt('he', address(J.plan)), input, sources, earlier, oldRaw: firstReplies[k], oldShown: st.insight?.possibility ?? '' });
  });
});
if (moments.length !== 8 || moments.some((m) => !m.oldRaw)) throw new Error(`expected 8 moments with their first answer, got ${moments.length}`);

/** Every candidate of one answer, judged by today's checker, and what it would show. */
const judge = (raw: string, m: (typeof moments)[number]) => {
  const parsed = S.parseMomentReply(JSON.parse(raw));
  if (!parsed) return { parsed: false, candidates: [], shown: null as string | null, shownLevel: null as number | null, invitation: null as string | null, kind: 'invalid' };
  const { insight, report } = C.assembleReply(parsed, m.sources as never, m.earlier);
  return {
    parsed: true,
    candidates: parsed.possibilities.map((p, i) => ({ text: p.text, relation: p.card?.relation ?? null, anchors: p.card?.anchors ?? [], refused: report.possibilities[i] ?? [], level: report.quality?.[i]?.level ?? null, notes: report.quality?.[i]?.notes ?? [] })),
    shown: insight.possibility || null,
    shownLevel: report.chosen !== undefined && report.chosen >= 0 ? (report.quality?.[report.chosen]?.level ?? null) : null,
    invitation: report.invitation?.shown ? report.invitation.question : null,
    kind: insight.kind,
  };
};

// ------------------------------------------------------------------------------------------------ the calls (only with "send")

const newRaw: (string | null)[] = moments.map(() => null);
const calls: { key: string; usd: number; input: number; output: number; ms: number }[] = [];
let stopped: string | null = null;
if (SEND) {
  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const PRICES: Record<string, [number, number]> = { 'gpt-4.1-mini': [0.4, 1.6], 'gpt-4.1': [2, 8], 'gpt-4o-mini': [0.15, 0.6], 'gpt-4o': [2.5, 10] };
  const priceOf = (model: string): [number, number] => PRICES[Object.keys(PRICES).sort((a, b) => b.length - a.length).find((k) => model.startsWith(k)) ?? ''] ?? [2.5, 10];
  const model = resolveStageModel('OPENAI_REFLECTION_MODEL');
  const spent = () => calls.reduce((a, c) => a + c.usd, 0);
  for (let i = 0; i < moments.length; i += 1) {
    const m = moments[i];
    const [pin, pout] = priceOf(model);
    const worst = (((m.instructions.length + m.input.length) / 3) * pin + 1100 * pout) / 1_000_000;
    if (spent() + worst > CAP) { stopped = `cap: spent $${spent().toFixed(4)}, next call up to $${worst.toFixed(4)}, cap $${CAP}`; break; }
    if (ledger.totalUsd + worst > STAGE3_CAP) { stopped = `stage-3 cap: total $${ledger.totalUsd.toFixed(4)}, next up to $${worst.toFixed(4)}`; break; }
    const t0 = Date.now();
    // the product's call (callModel): same model, temperature, store and schema; only the output is bounded, for the budget
    const res = await client.responses.create({ model, store: false, instructions: m.instructions, input: m.input, temperature: 0.7, max_output_tokens: 1100, text: { format: { type: 'json_schema', name: 'moment_reply', schema: S.MOMENT_REPLY_JSON_SCHEMA as Record<string, unknown>, strict: true } } });
    const input = res.usage?.input_tokens ?? 0;
    const output = res.usage?.output_tokens ?? 0;
    const [ain, aout] = priceOf(res.model || model);
    const usd = (input * ain + output * aout) / 1_000_000;
    calls.push({ key: m.key, usd, input, output, ms: Date.now() - t0 });
    ledger.entries.push({ at: new Date().toISOString(), run: RUN, stage: 'moment-reply-fixed-input', model: res.model || model, input, output, usd, ms: Date.now() - t0 });
    ledger.totalUsd = Number((ledger.totalUsd + usd).toFixed(6));
    writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
    newRaw[i] = res.output_text;
    console.log(`${m.key}: $${usd.toFixed(4)} (${input} in, ${output} out)`);
  }
}

// ------------------------------------------------------------------------------------------------ results

const results = moments.map((m, i) => ({ key: m.key, label: m.label, momentText: m.momentText, question: m.question, answer: m.answer, input: m.input, old: { raw: m.oldRaw, shownInRun: m.oldShown, today: judge(m.oldRaw, m) }, new: newRaw[i] ? { raw: newRaw[i], today: judge(newRaw[i] as string, m) } : null }));
const promptHash = createHash('sha256').update(moments[0].instructions).digest('hex');
writeFileSync(new URL('85-fixed-input-test.json', DOCS), JSON.stringify({ run: RUN, sent: SEND, stopped, cap: CAP, spentUsd: Number(calls.reduce((a, c) => a + c.usd, 0).toFixed(6)), calls, promptSha256: promptHash, newInstructions: moments.map((m) => ({ key: m.key, instructions: m.instructions })), results }, null, 2));

const L: string[] = [];
const p = (s = '') => L.push(s);
p('# 85. ניסוי הקלט הקבוע (doc 83): הפלט הגולמי, ישן מול חדש');
p();
p(`נוצר על ידי \`scripts/fixedInputTest.ts\`. ${SEND ? `נשלחו ${calls.length} קריאות, $${calls.reduce((a, c) => a + c.usd, 0).toFixed(6)}.` : 'לא נשלח דבר (בדיקת הקלטים בלבד).'}${stopped ? ` נעצר: ${stopped}.` : ''}`);
p('"ישן" היא התשובה הראשונה של המודל לרגע הזה בריצה acc2-1. "חדש" היא תשובה אחת עם ההנחיה החדשה, לאותו קלט. שתיהן נבדקות בבודק של היום, שלא השתנה.');
p();
const arm = (name: string, j: ReturnType<typeof judge>) => {
  p(`**${name}:**`);
  j.candidates.forEach((c, n) => p(`- מועמדת ${n + 1} [${c.relation}]: "${c.text}" — ${c.refused.length ? `נפסלה: ${c.refused.join('; ')}` : 'עברה'}; רמה ${c.level} (${c.notes.join('; ')})`));
  p(`- **מה היה מוצג:** ${j.shown ? `"${j.shown}" (רמה ${j.shownLevel})` : j.invitation ? `אין אפשרות; שאלה מזמינה: "${j.invitation}"` : 'אין אפשרות (תובנה עובדתית)'}`);
};
for (const r of results) {
  p(`## ${r.key}: «${r.label}»`);
  p();
  p(`- **החלק בחלום:** "${r.momentText}"`);
  p(`- **השאלה:** "${r.question}"`);
  p(`- **התשובה:** "${r.answer}"`);
  p(`- **מה הוצג בריצה עצמה (אחרי ניסיונות חוזרים):** ${r.old.shownInRun ? `"${r.old.shownInRun}"` : '(אין)'}`);
  p();
  arm('ישן (התשובה הראשונה בריצה)', r.old.today);
  p();
  if (r.new) arm('חדש (ההנחיה החדשה)', r.new.today);
  else p('**חדש:** לא נשלח.');
  p();
}
writeFileSync(new URL('85-fixed-input-raw.md', DOCS), L.join('\n') + '\n');

// blind pairs: per moment, the two sides in an order the judge does not know
if (results.every((r) => r.new)) {
  const B: string[] = [];
  const key: Record<string, { X: string; Y: string }> = {};
  results.forEach((r, i) => {
    const swap = createHash('sha256').update(`${RUN}:${r.key}`).digest()[0] % 2 === 1;
    const [X, Y] = swap ? [r.new!.today, r.old.today] : [r.old.today, r.new!.today];
    key[r.key] = swap ? { X: 'new', Y: 'old' } : { X: 'old', Y: 'new' };
    B.push(`## רגע ${i + 1}`, '', `- **החלק בחלום:** "${r.momentText}"`, `- **השאלה:** "${r.question}"`, `- **התשובה שלה:** "${r.answer}"`, '');
    for (const [name, j] of [['X', X], ['Y', Y]] as const) {
      B.push(`**גרסה ${name}: שלוש המועמדות שהמודל כתב**`);
      j.candidates.forEach((c, n) => B.push(`${n + 1}. "${c.text}"`));
      B.push(`**גרסה ${name}: מה היה מוצג:** ${j.shown ? `"${j.shown}"` : j.invitation ? `(אין אפשרות; שאלה מזמינה: "${j.invitation}")` : '(אין אפשרות)'}`, '');
    }
  });
  writeFileSync(new URL('86-blind-pairs.md', DOCS), `# 86. זוגות עיוורים לשיפוט\n\nלכל רגע: החלק בחלום, השאלה, התשובה, ושתי גרסאות בסדר לא ידוע.\n\n${B.join('\n')}\n`);
  writeFileSync(new URL('86-blind-key.json', DOCS), JSON.stringify(key, null, 2));
}
console.log(`${SEND ? `sent ${calls.length}, $${calls.reduce((a, c) => a + c.usd, 0).toFixed(4)}` : 'dry run: nothing sent'}; wrote 85-fixed-input-test.json, 85-fixed-input-raw.md${results.every((r) => r.new) ? ', 86-blind-pairs.md, 86-blind-key.json' : ''}`);
void existsSync;
