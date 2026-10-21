/**
 * STAGE 3B QUALITY RUN of the multi-moment journey (reworked for the fix round, doc 30), on SYNTHETIC dreams only (never a customer's
 * dream; nothing is read from or written to Supabase; no image is generated). It runs the real server functions (analysis, the labels
 * prompt, moment questions, replies, whole views and every check around them), plays each journey step by step through the real
 * journey rules (exploration.ts), and records every model call with its measured tokens, time and cost, and what every check refused.
 *
 * The dreamer's answers are SYNTHETIC: written by a small model (gpt-4o-mini) playing a person; they are labelled as such.
 * The fourth dream ("hidden") is read from docs/upgrade-2026-10/31-hidden-dream.json, written by a separate agent and not read while
 * the fix was developed (its SHA-256 is recorded in doc 30); its moments are explored in the order offered, with no hints.
 *
 * Budget: every call of every run of stage 3 is added to docs/upgrade-2026-10/27-eval-cost-ledger.json. Before each call the script
 * adds the worst case of that call and STOPS if the stage-3 total would pass $2.85 (approved ceiling $3.00) or if this fix round
 * (runs named "fix-…") would pass $1.20 (plan: $0.90 development + about $0.30 final run). List prices, to be checked against the bill.
 *
 * Run:  npx tsx scripts/explorationEval.ts <runName> [journeyKey]
 *       npx tsx scripts/explorationEval.ts capture-analysis      (only the analysis of the three known dreams, as test fixtures)
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import OpenAI from 'openai';

process.env.OPENAI_QUESTIONS_MODEL ||= 'gpt-4.1';
process.env.OPENAI_REFLECTION_MODEL ||= 'gpt-4.1';

const { runAnalysisModel } = await import('../server/routes/dreamAnalysis.ts');
const { generateMomentQuestion, generateMomentReply, generateWholeView, explorationContext, planCall } = await import('../server/routes/dreamExploration.ts');
const { momentLabelRules } = await import('../src/hero/explorationSchema.ts');
const { momentGroups, segmentDream, segmentsForMoment } = await import('../src/hero/dreamSegments.ts');
const { checkLabel, unsureLook } = await import('../src/hero/claimCheck.ts');
const { isUnsureAnswer } = await import('../src/hero/hebrewText.ts');
const { buildDreamElementLabelSystemPrompt, DREAM_ELEMENT_LABELS_JSON_SCHEMA, validateElementLabels } = await import('../src/hero/dreamElementLabelsSchema.ts');
const { normalizeLabel } = await import('../src/hero/dreamElementLabelQuality.ts');
const X = await import('../src/hero/exploration.ts');
type Exploration = import('../src/hero/exploration.ts').Exploration;
type EmotionId = import('../src/hero/dreamEmotions.ts').EmotionId;
type AddressPreference = import('../src/hero/addressPreference.ts').AddressPreference;

// ------------------------------------------------------------------------------------------------ budget

const LEDGER = new URL('../docs/upgrade-2026-10/27-eval-cost-ledger.json', import.meta.url);
const CAP_USD = 3.0;
const STOP_AT_USD = 2.85;
/** Each round of stage-3 runs has its own cap inside the $3: the fix round ('fix-…') $1.20, the quality round ('q-…') $0.85. */
const ROUND_CAPS: Record<string, number> = { fix: 1.2, q: 0.85 };
const ROUND = (process.argv[2] ?? '').split('-')[0];
const ROUND_CAP_USD = ROUND_CAPS[ROUND] ?? 0;
const PRICES: Record<string, [number, number]> = { 'gpt-4.1-mini': [0.4, 1.6], 'gpt-4.1': [2, 8], 'gpt-4o-mini': [0.15, 0.6], 'gpt-4o': [2.5, 10] };
const priceOf = (model: string): [number, number] => {
  const key = Object.keys(PRICES).sort((a, b) => b.length - a.length).find((k) => model.startsWith(k));
  return key ? PRICES[key] : [2.5, 10]; // unknown model: the most expensive assumption
};

interface LedgerEntry { at: string; run: string; stage: string; model: string; input: number; output: number; usd: number; ms: number }
interface Ledger { capUsd: number; stopAtUsd: number; note: string; totalUsd: number; entries: LedgerEntry[] }
const ledger: Ledger = existsSync(LEDGER)
  ? JSON.parse(readFileSync(LEDGER, 'utf8'))
  : { capUsd: CAP_USD, stopAtUsd: STOP_AT_USD, note: 'Every OpenAI call of the stage-3 quality runs (synthetic dreams only). List prices; verify against the real bill.', totalUsd: 0, entries: [] };
const saveLedger = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
const roundSpent = () => ledger.entries.filter((x) => ROUND && x.run.startsWith(`${ROUND}-`)).reduce((a, x) => a + x.usd, 0);

class BudgetStop extends Error {}
const RUN = process.argv[2] || `run-${Date.now()}`;
let stage = 'setup';

/** Every model call goes through here: budget check before, measured usage after (saved at once, so a crash loses nothing). */
function meteredClient(real: OpenAI): OpenAI {
  const create = real.responses.create.bind(real.responses);
  (real.responses as unknown as { create: unknown }).create = async (params: { model: string; instructions?: string; input?: unknown }) => {
    const chars = (params.instructions?.length ?? 0) + JSON.stringify(params.input ?? '').length;
    const [pin, pout] = priceOf(params.model);
    const worst = ((chars / 2) * pin + 1800 * pout) / 1_000_000; // Hebrew tokenizes densely: chars/2 tokens is a safe upper estimate
    if (ledger.totalUsd + worst > STOP_AT_USD) throw new BudgetStop(`budget: spent $${ledger.totalUsd.toFixed(4)}, next call up to $${worst.toFixed(4)}, stop at $${STOP_AT_USD}`);
    if (ROUND_CAP_USD && roundSpent() + worst > ROUND_CAP_USD) throw new BudgetStop(`round budget: this round spent $${roundSpent().toFixed(4)}, next call up to $${worst.toFixed(4)}, round cap $${ROUND_CAP_USD}`);
    const t0 = Date.now();
    const res = (await create(params as never)) as { model: string; usage?: { input_tokens: number; output_tokens: number } };
    const ms = Date.now() - t0;
    const input = res.usage?.input_tokens ?? 0;
    const output = res.usage?.output_tokens ?? 0;
    const [ain, aout] = priceOf(res.model || params.model);
    const usd = (input * ain + output * aout) / 1_000_000;
    ledger.entries.push({ at: new Date().toISOString(), run: RUN, stage, model: res.model || params.model, input, output, usd, ms });
    ledger.totalUsd = Number((ledger.totalUsd + usd).toFixed(6));
    saveLedger();
    return res;
  };
  return real;
}

const client = meteredClient(new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));

// ------------------------------------------------------------------------------------------------ the synthetic journeys

interface Plan {
  key: string;
  kind: string;
  text: string;
  address: AddressPreference;
  emotions: EmotionId[];
  /** Which offered moments to explore, by words of the dream they contain, in this order (empty: in the order offered). */
  pick: string[];
  count: number;
  /** After how many explored moments to ask for the whole view (more than one entry = an update). */
  wholeAfter: number[];
  persona: string;
  /** Per explored index, a hint for the simulated dreamer (a vague answer, "I don't know"). */
  hints: Record<string, string>;
}

const PLANS: Plan[] = [
  {
    key: 'short',
    kind: 'קצר',
    text: 'עמדתי בתחנת רכבת ריקה וחיכיתי. הרכבת לא הגיעה.',
    address: 'neutral',
    emotions: [],
    pick: ['תחנת רכבת'],
    count: 1,
    wholeAfter: [1],
    persona: 'You are a man in his forties. Lately you have been waiting for an answer about a job you applied for weeks ago.',
    hints: {},
  },
  {
    key: 'rich',
    kind: 'עשיר',
    text: 'הייתי בחתונה של חברה. כולם לבשו לבן ואני לבשתי שחור. אחי הקטן נתן לי מפתח ואמר שזה למקום שעוד לא הייתי בו. הלכנו לאורך החוף, והים התרחק ולא חזר. מישהו שר שיר שלא הכרתי, אבל ידעתי את כל המילים. כשהגענו לדלת, המפתח היה קטן מדי.',
    address: 'feminine',
    emotions: ['wonder', 'confusion'],
    pick: ['קטן מדי', 'הים התרחק', 'אחי הקטן', 'לבשו לבן'],
    count: 4,
    wholeAfter: [2, 4],
    persona: "You are a woman of 34. Your younger brother moved abroad last year; you miss him. At your friend's real wedding last month you felt out of place.",
    hints: { 1: 'Answer vaguely: say it reminded you of "something that happened with my brother once", without saying what.' },
  },
  {
    key: 'sensitive',
    kind: 'רגיש',
    text: 'רדפו אחריי במסדרון ארוך בבית חולים. הדלתות נסגרו אחת אחרי השנייה. בסוף הגעתי לחדר שבו אבא שלי ישן במיטה, ולא הצלחתי להעיר אותו.',
    address: 'neutral',
    emotions: ['fear', 'sadness'],
    pick: ['הדלתות נסגרו', 'אבא', 'רדפו'],
    count: 3,
    wholeAfter: [3],
    persona: 'You are a person in their fifties. Your father was in hospital two years ago and recovered; you rarely talk about that time.',
    hints: { 0: 'Answer only: "לא יודעת".' },
  },
];

/** The quality round's new synthetic dreams (doc 37): "dev" = the two development dreams, "sealed" = the three not read before the final run.
    Explored in the order the moments are offered, three of them, a whole view after the first and the third. */
function newDreamPlans(which: 'dev' | 'sealed'): Plan[] {
  const url = new URL(`../docs/upgrade-2026-10/37-${which}-dreams.json`, import.meta.url);
  if (!existsSync(url)) return [];
  const list = JSON.parse(readFileSync(url, 'utf8')) as { key: string; kind: string; address: AddressPreference; text: string; persona: string; unsureAt: number | null }[];
  return list.map((d) => ({
    key: d.key,
    kind: d.kind,
    text: d.text,
    address: d.address,
    emotions: [],
    pick: [],
    count: 3,
    wholeAfter: [1, 3],
    persona: d.persona,
    hints: d.unsureAt === null || d.unsureAt === undefined ? {} : { [String(d.unsureAt)]: `Answer only: "${d.address === 'masculine' ? 'לא יודע' : 'לא יודעת'}".` },
  }));
}

function hiddenPlan(): Plan | null {
  const url = new URL('../docs/upgrade-2026-10/31-hidden-dream.json', import.meta.url);
  if (!existsSync(url)) return null;
  const d = JSON.parse(readFileSync(url, 'utf8')) as { key: string; kind: string; address: AddressPreference; text: string };
  return { key: 'hidden', kind: d.kind, text: d.text, address: d.address, emotions: [], pick: [], count: 3, wholeAfter: [1, 3], persona: 'You are a woman in her thirties.', hints: {} };
}

async function dreamerAnswer(plan: Plan, question: string, history: string[], hint?: string): Promise<string> {
  stage = 'simulated-dreamer';
  const res = await client.responses.create({
    model: 'gpt-4o-mini',
    store: false,
    instructions: `${plan.persona} You had this dream: "${plan.text}". Someone is asking you about it. Answer the question in Hebrew ONLY (no English word at all), as yourself, in one or two short spoken sentences (at most 30 words), honestly and plainly; do not interpret like a therapist. ${plan.address === 'feminine' ? 'You speak about yourself in the feminine.' : ''} ${hint ?? ''}`,
    input: `${history.length ? `What you already said earlier: ${history.join(' | ')}\n` : ''}The question: ${question}`,
  });
  return (res as unknown as { output_text: string }).output_text.trim();
}

const timed = async <T>(label: string, fn: () => Promise<T>) => {
  stage = label;
  const t0 = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - t0 };
};

interface Step {
  moment: string;
  momentText: string;
  question: { text: string; source: string; focus: string | null; subject: string | null; ms: number; rejected: { question: string; reasons: string[] }[] };
  answer: string;
  alternative: { question: string; source: string; focus: string | null; ms: number; rejected: { question: string; reasons: string[] }[]; answer: string } | null;
  followUp: { question: string; missing: string | null; answer: string | null } | null;
  insight: { observation: string; reflection: string; possibility: string; kind: string } | null;
  insightReport: unknown;
  firstInsight: { observation: string; reflection: string; possibility: string; kind: string } | null;
  replyMs: number | null;
  refreshMs: number | null;
  retryMs: number | null;
  unsureLook: boolean;
}

async function runJourney(plan: Plan) {
  const log = { plan: plan.key, kind: plan.kind, text: plan.text, segments: [] as string[], moments: [] as { id: string; label: string; labelCandidate: string; text: string; priority: number }[], steps: [] as Step[], wholeViews: [] as unknown[], avoided: 0 };
  const analysisRun = await timed('analysis', () => runAnalysisModel(client, plan.text));
  if (analysisRun.value.status !== 'ok') throw new Error(`analysis failed for ${plan.key}`);
  const analysis = analysisRun.value.value;
  const segments = segmentDream(analysis.sourceText);
  log.segments = segments.map((s) => `s${s.id}: ${s.text}`);
  const groups = momentGroups(analysis.sourceText, analysis.unusualElements ?? []).slice(0, X.MAX_MOMENTS);

  // the labels: the existing labels prompt, with the moment rules added, then the code check
  stage = 'labels';
  const labelRes = await client.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    store: false,
    instructions: buildDreamElementLabelSystemPrompt('he') + momentLabelRules('he'),
    input: `DREAM CONTEXT (for disambiguation only — do not label this line itself): ${analysis.sourceText}\n\nELEMENTS TO LABEL, IN ORDER:\n${groups.map((g, i) => `${i + 1}. ${g.text}`).join('\n')}`,
    text: { format: { type: 'json_schema', name: 'dream_element_labels', schema: DREAM_ELEMENT_LABELS_JSON_SCHEMA as never, strict: true } },
  });
  const labelled = validateElementLabels(JSON.parse((labelRes as unknown as { output_text: string }).output_text), groups.length) ?? groups.map(() => '');
  const used: string[] = [];
  const labels = groups.map((g, i) => {
    const l = checkLabel(normalizeLabel(labelled[i] ?? '') || labelled[i] || '', g.text, used, analysis.sourceText);
    used.push(l);
    return l;
  });
  let e: Exploration = X.createExploration(`eval-${plan.key}`, groups.map((g, i) => ({ label: labels[i], excerpt: g.text, segmentIds: g.segmentIds })));
  log.moments = e.moments.map((m, i) => ({ id: m.id, label: m.label, labelCandidate: labelled[i] ?? '', text: groups[i].text, priority: groups[i].priority }));
  const segmentsOf = (id: string) => {
    const m = e.moments.find((x) => x.id === id);
    return m ? segmentsForMoment(segments, m) : [];
  };

  // the moments the synthetic dreamer chooses
  const chosen: string[] = [];
  for (const word of plan.pick) {
    if (chosen.length >= plan.count) break;
    const m = e.moments.find((x) => (x.excerpt ?? '').includes(word) && !chosen.includes(x.id));
    if (m) chosen.push(m.id);
  }
  for (const m of e.moments) if (chosen.length < plan.count && !chosen.includes(m.id)) chosen.push(m.id);

  const history: string[] = [];
  let emotions: EmotionId[] = [];
  const ctx = () => explorationContext(analysis, e, 'he', plan.address, emotions);

  for (const [index, id] of chosen.entries()) {
    const moment = X.momentById(e, id)!;
    // 1. the question, written for this moment (the first one too)
    const qPlan = planCall('moment-question', e, id, segmentsOf);
    if (!qPlan || qPlan.kind !== 'question') throw new Error('unexpected question plan');
    const qr = await timed('moment-question', () => generateMomentQuestion(client, ctx(), qPlan));
    if (qr.value.status !== 'ok') throw new Error(`question failed for ${plan.key}/${id}: ${qr.value.status}`);
    const qv = qr.value.value;
    e = X.beginMoment(e, id, qv.question, qv.source === 'fixed' ? 'fixed' : 'adaptive');
    e = X.setQuestionFocus(e, id, qv.focus, qv.subject);
    if (planCall('moment-question', e, id, segmentsOf) === null) log.avoided += 1; // asking again: refused

    let answer = await dreamerAnswer(plan, qv.question, history, plan.hints[String(index)]);
    history.push(answer);
    e = X.answerMoment(e, id, answer);
    const step: Step = {
      moment: moment.label,
      momentText: moment.excerpt ?? '',
      question: { text: qv.question, source: qv.source, focus: qv.focus, subject: qv.subject, ms: qr.ms, rejected: qv.rejected },
      answer,
      alternative: null,
      followUp: null,
      insight: null,
      insightReport: null,
      firstInsight: null,
      replyMs: null,
      refreshMs: null,
      retryMs: null,
      unsureLook: false,
    };

    // 2. "I don't know": no insight call; one different question
    if (isUnsureAnswer(answer)) {
      if (planCall('moment-reply', e, id, segmentsOf) === null) log.avoided += 1;
      const aPlan = planCall('moment-question', e, id, segmentsOf);
      if (aPlan && aPlan.kind === 'question') {
        const ar = await timed('moment-question-alt', () => generateMomentQuestion(client, ctx(), aPlan));
        if (ar.value.status === 'ok') {
          const av = ar.value.value;
          e = X.beginAlternativeQuestion(e, id, av.question, av.focus, av.subject);
          const altAnswer = await dreamerAnswer(plan, av.question, history, 'Answer this one plainly and concretely.');
          history.push(altAnswer);
          e = X.answerMoment(e, id, altAnswer);
          step.alternative = { question: av.question, source: av.source, focus: av.focus, ms: ar.ms, rejected: av.rejected, answer: altAnswer };
          answer = altAnswer;
        }
      }
    }

    if (isUnsureAnswer(answer)) {
      e = X.receiveUnsureLook(e, id, unsureLook('he', analysis.sourceText, segments, segmentsOf(id)).observation);
      step.unsureLook = true;
    } else {
      // 3. the insight
      const rPlan = planCall('moment-reply', e, id, segmentsOf);
      if (!rPlan || rPlan.kind !== 'reply') throw new Error('unexpected reply plan');
      const rr = await timed('moment-reply', () => generateMomentReply(client, ctx(), rPlan));
      if (rr.value.status !== 'ok') throw new Error(`reply failed for ${plan.key}/${id}: ${rr.value.status}`);
      step.replyMs = rr.ms;
      e = X.receiveReply(e, id, rr.value.value.insight, rr.value.value.followUpQuestion);
      step.insightReport = rr.value.value.report;
      step.firstInsight = { ...rr.value.value.insight };
      const fq = rr.value.value.followUpQuestion;
      // a factual insight: its one retry
      if (rr.value.value.insight.kind === 'factual' && !fq) {
        const retryPlan = planCall('moment-reply', e, id, segmentsOf);
        if (retryPlan && retryPlan.kind === 'reply' && retryPlan.retry) {
          const rt = await timed('moment-reply-retry', () => generateMomentReply(client, ctx(), retryPlan));
          step.retryMs = rt.ms;
          if (rt.value.status === 'ok') {
            e = X.receiveReply(e, id, rt.value.value.insight, null);
            step.insightReport = { first: step.insightReport, retry: rt.value.value.report };
          }
        }
      }
      if (planCall('moment-reply', e, id, segmentsOf) === null) log.avoided += 1; // asking for the reply again: refused
      if (fq) {
        const fAnswer = await dreamerAnswer(plan, fq, history, 'Now give the concrete detail that was missing.');
        history.push(fAnswer);
        e = X.answerFollowUp(e, id, fAnswer);
        step.followUp = { question: fq, missing: rr.value.value.missingInformation, answer: fAnswer };
        const refreshPlan = planCall('moment-reply', e, id, segmentsOf);
        if (refreshPlan && refreshPlan.kind === 'reply') {
          const refreshed = await timed('moment-reply-refresh', () => generateMomentReply(client, ctx(), refreshPlan));
          step.refreshMs = refreshed.ms;
          if (refreshed.value.status === 'ok') {
            e = X.receiveRefreshedInsight(e, id, refreshed.value.value.insight);
            step.insightReport = { first: step.insightReport, refreshed: refreshed.value.value.report };
          }
        }
      }
    }
    e = X.completeMoment(e, id, new Date(), { keepFirstInsight: true });
    if (index === 0) {
      emotions = plan.emotions;
      e = X.markFeelingsAsked(e);
    }
    const ins = e.explored[id].insight!;
    step.insight = { observation: ins.observation, reflection: ins.reflection, possibility: ins.possibility, kind: ins.kind ?? 'interpretive' };
    log.steps.push(step);

    // 4. the whole view, when planned (and its one retry after a factual summary)
    if (plan.wholeAfter.includes(X.exploredCount(e))) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const wPlan = planCall('whole-view', e, null, segmentsOf);
        if (!wPlan || wPlan.kind !== 'whole') break;
        const w = await timed(attempt ? 'whole-view-retry' : 'whole-view', () => generateWholeView(client, ctx(), wPlan));
        if (w.value.status !== 'ok') throw new Error(`whole view failed for ${plan.key}: ${w.value.status}`);
        const { report, ...view } = w.value.value;
        e = X.receiveWholeView(e, view, wPlan.basedOn);
        log.wholeViews.push({ afterMoments: X.exploredCount(e), attempt: attempt + 1, ms: w.ms, ...view, invite: view.invite.map((i) => X.momentById(e, i)?.label ?? i), report });
        if (view.kind !== 'factual-summary') break;
      }
      if (planCall('whole-view', e, null, segmentsOf) === null) log.avoided += 1; // the same whole view again: refused
    }
  }
  return log;
}

// ------------------------------------------------------------------------------------------------ run

// `npx tsx scripts/explorationEval.ts capture-analysis`: only the analysis of the three known dreams, saved as test fixtures
// (real model output, so the tests of stage 3b's fixes start from what production really produces). Metered like everything else.
if (RUN === 'capture-analysis') {
  for (const plan of PLANS) {
    const r = await timed('analysis', () => runAnalysisModel(client, plan.text));
    if (r.value.status !== 'ok') throw new Error(`analysis failed for ${plan.key}`);
    writeFileSync(new URL(`../tests/fixtures/analysis-${plan.key}.json`, import.meta.url), JSON.stringify(r.value.value, null, 2));
    console.log(`analysis-${plan.key}.json (${r.ms} ms)`);
  }
  console.log(`stage-3 total $${ledger.totalUsd.toFixed(4)} of $${CAP_USD}`);
  process.exit(0);
}

const out: { run: string; journeys: unknown[]; stoppedForBudget: string | null; spentThisRunUsd: number } = { run: RUN, journeys: [], stoppedForBudget: null, spentThisRunUsd: 0 };
const before = ledger.totalUsd;
const only = process.argv[3];
const plans =
  only === 'dev' || only === 'sealed'
    ? newDreamPlans(only)
    : [...PLANS, ...(only === 'hidden' || only === 'all' ? [hiddenPlan()].filter((p): p is Plan => p !== null) : [])];
try {
  for (const plan of plans) {
    if (only && !['all', 'dev', 'sealed'].includes(only) && plan.key !== only) continue;
    console.log(`journey ${plan.key}...`);
    out.journeys.push(await runJourney(plan));
  }
} catch (err) {
  if (err instanceof BudgetStop) out.stoppedForBudget = err.message;
  else throw err;
} finally {
  out.spentThisRunUsd = Number((ledger.totalUsd - before).toFixed(6));
  writeFileSync(new URL(`../docs/upgrade-2026-10/33-stage3b-fix-eval-${RUN}.json`, import.meta.url), JSON.stringify({ ...out, calls: ledger.entries.filter((x) => x.run === RUN) }, null, 2));
  console.log(`spent this run $${out.spentThisRunUsd.toFixed(4)}; this round ${roundSpent().toFixed(4)} of ${ROUND_CAP_USD}; stage-3 total $${ledger.totalUsd.toFixed(4)} of $${CAP_USD}`);
}
