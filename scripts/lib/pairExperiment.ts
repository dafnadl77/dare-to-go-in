/**
 * The pure parts of the pair fixed-input test (doc 90 §5, stage 1): the eight saved moments of acc2-1 rebuilt as the product's own
 * reply plans, the budget rule, the pacing applied to what would be shown, the automatic measures, and the packet for the blind judge.
 * Nothing here calls a model or writes a file: scripts/pairFixedInputTest.ts does, and tests/pairExperiment.test.ts checks this.
 */
import { segmentDream, segmentsForMoment, type DreamSegment } from '../../src/hero/dreamSegments';
import type { PriorMoment } from '../../src/hero/explorationSchema';
import type { PairReplyValue } from '../../server/routes/dreamExploration';

export const RUN = 'pfi-1';
/** One response per moment, never a retry; its output is bounded so the worst case is known before any call. */
export const MAX_OUTPUT_TOKENS = 900;
export const PRICES: Record<string, [number, number]> = { 'gpt-4.1-mini': [0.4, 1.6], 'gpt-4.1': [2, 8], 'gpt-4o-mini': [0.15, 0.6], 'gpt-4o': [2.5, 10] };
export const priceOf = (model: string): [number, number] => PRICES[Object.keys(PRICES).sort((a, b) => b.length - a.length).find((k) => model.startsWith(k)) ?? ''] ?? [2.5, 10];

type Address = 'feminine' | 'masculine' | 'neutral';
type Step = { moment: string; question: { text: string; focus: string | null; subject: string | null }; answer: string; alternative?: { question: string; answer: string; focus?: string | null } | null; insight: { observation: string; reflection: string; possibility: string } | null };

export interface FixedMoment {
  key: string;
  plan: string;
  index: number;
  label: string;
  momentText: string;
  question: string;
  answer: string;
  address: Address;
  /** What the route builds from (a DreamContext and a reply plan), with no network. */
  ctx: Record<string, unknown> & { sourceText: string; segments: DreamSegment[] };
  p: Record<string, unknown> & { prior: PriorMoment[] };
}

/**
 * The eight moments, exactly as acc2-1 asked them (the question actually answered, after an "I don't know" the different one), with the
 * moments before each one as context. The earlier moments' insights are given back as a listening journey would have them: what the
 * dream showed and what she said, never the interpretive possibility of that run (it would not exist in this journey).
 */
export function fixedMoments(run: { journeys: { plan: string; moments: { id: string; label: string; text: string }[]; steps: Step[] }[]; responses: { stage: string; text: string }[] }, dreams: { key: string; address: Address }[]): FixedMoment[] {
  const sources = run.responses.filter((r) => r.stage === 'analysis').map((r) => JSON.parse(r.text).sourceText as string);
  const out: FixedMoment[] = [];
  run.journeys.forEach((J, ji) => {
    const sourceText = sources[ji];
    const segments = segmentDream(sourceText);
    const address = dreams.find((d) => d.key === J.plan)!.address;
    const momentOf = (label: string) => J.moments.find((m) => m.label === label)!;
    const segsOf = (label: string) => segmentsForMoment(segments, { excerpt: momentOf(label).text, label });
    const asked = (st: Step) => (st.alternative ? { question: st.alternative.question, answer: st.alternative.answer, focus: st.alternative.focus ?? null } : { question: st.question.text, answer: st.answer, focus: st.question.focus });
    const answersSoFar: string[] = [];
    J.steps.forEach((st, k) => {
      const prior: PriorMoment[] = J.steps.slice(0, k).map((b) => ({
        id: momentOf(b.moment).id,
        label: b.moment,
        segments: segsOf(b.moment),
        question: asked(b).question,
        answer: asked(b).answer,
        followUp: null,
        insight: b.insight ? { observation: b.insight.observation, reflection: b.insight.reflection, possibility: '', kind: 'listening' } : null,
        focus: asked(b).focus as never,
        subject: b.question.subject,
        firstTry: null,
      }));
      const m = momentOf(st.moment);
      const { question, answer } = asked(st);
      answersSoFar.push(answer);
      const ctx = {
        sourceText,
        segments,
        depth: 'medium',
        language: 'he',
        addressPreference: address,
        feelings: '',
        emotions: [],
        dreamerText: [sourceText, ...answersSoFar].join('\n'),
        segmentsOf: () => [],
      };
      const p = {
        kind: 'reply',
        moment: { id: m.id, label: m.label, segments: segsOf(st.moment), excerpt: m.text },
        momentId: m.id,
        momentLabel: m.label,
        prior,
        question,
        answer,
        followUp: null,
        first: k === 0,
        retry: false,
      };
      out.push({ key: `${J.plan}#${k + 1}`, plan: J.plan, index: k + 1, label: st.moment, momentText: m.text, question, answer, address, ctx, p });
    });
  });
  return out;
}

/** The cost of one call at most: every input character a token's third, the full output bound. */
export function worstCaseUsd(instructions: string, input: string, model = 'gpt-4.1'): number {
  const [pin, pout] = priceOf(model);
  return (((instructions.length + input.length) / 3) * pin + MAX_OUTPUT_TOKENS * pout) / 1_000_000;
}

/** All or nothing: the whole test must fit the run's cap and the stage's stop before the first call, or nothing is sent. */
export function budgetVerdict(b: { worstTotal: number; runCap: number; spentInStage: number; stageStop: number; alreadyRun: boolean }): { ok: boolean; why: string } {
  if (b.alreadyRun) return { ok: false, why: `${RUN} is already in the ledger: no rerun` };
  if (b.worstTotal > b.runCap) return { ok: false, why: `the worst case $${b.worstTotal.toFixed(4)} is above the run's cap $${b.runCap}` };
  if (b.spentInStage + b.worstTotal > b.stageStop) return { ok: false, why: `stage 3 has $${(b.stageStop - b.spentInStage).toFixed(4)} left; the worst case is $${b.worstTotal.toFixed(4)} — a raise needs her approval` };
  return { ok: true, why: '' };
}

export interface MomentResult {
  key: string;
  plan: string;
  label: string;
  momentText: string;
  question: string;
  answer: string;
  /** The model's reply could not be read. */
  invalid: boolean;
  /** What the route shows here, with the pacing she approved (the earlier moments' pairs as they were shown in this run). */
  value: PairReplyValue | null;
  /** Every pair the checker approved (all three may), with the question as it would be asked. */
  approved: { a: { quote: string; from: string }; b: { quote: string; from: string }; question: string; questionReplaced: boolean; differentImages: boolean }[];
  refused: { a: string; b: string; reasons: string[] }[];
}

/** What each journey shows, under the pacing she approved: the route's own decision (`value` is made with the real pacing). */
export function shownUnderPacing(results: readonly MomentResult[]): Map<string, boolean> {
  return new Map(results.map((r) => [r.key, Boolean(r.value?.insight.pair)]));
}

/** The measures the code can take itself (the judge takes the rest). */
export function automaticMeasures(results: readonly MomentResult[]) {
  const shown = shownUnderPacing(results);
  const eligible = results.filter((r) => !r.key.endsWith('#1'));
  return {
    moments: results.length,
    invalid: results.filter((r) => r.invalid).length,
    candidates: results.reduce((a, r) => a + r.approved.length + r.refused.length, 0),
    approved: results.reduce((a, r) => a + r.approved.length, 0),
    questionsReplaced: results.reduce((a, r) => a + r.approved.filter((x) => x.questionReplaced).length, 0),
    eligibleWithPair: eligible.filter((r) => r.approved.length > 0).length,
    eligible: eligible.length,
    shownUnderPacing: [...shown.values()].filter(Boolean).length,
    consecutiveShown: results.filter((r, i) => i > 0 && results[i - 1].plan === r.plan && shown.get(r.key) && shown.get(results[i - 1].key)).length,
  };
}

const q = (t: string) => `«${t}»`;
const side = (s: { quote: string; from: string }) => `${q(s.quote)} · ${s.from === 'dream' ? 'מהחלום' : 'מהמילים שלך'}`;

/**
 * The blind judge's packet. Part A: every pair the checker approved, moment by moment (judged without the pacing, as doc 90 §5
 * sets). Part B: the candidates the checker refused (to see what it lost). Part C: each journey as it would read under the pacing,
 * judged as a conversation. The judge is not told which pair the route chose, nor the relation the code verified.
 */
export function judgePacket(results: readonly MomentResult[]): string {
  const shown = shownUnderPacing(results);
  const L: string[] = ['# 98. חבילה לשופט עיוור: שני פרטים ושאלה', '', 'אתה שופט עצמאי. אינך יודע איך נבחרו הזוגות. ענה על כל שאלה ב"כן" / "לא" ובמשפט נימוק אחד. אל תנחש: אם משהו לא כתוב בחלום או בתשובה, הוא לא שם.', ''];
  L.push('## חלק א: כל זוג שהבודק אישר', '', 'לכל זוג ענה:', '1. **מדויק:** שני הציטוטים כתובים כך בחלום או בתשובה?', '2. **שווה מחשבה:** האם הזוג פותח משהו שהחולם/ת עוד לא אמר/ה?', '3. **מלאכותי:** האם הקשר בין השניים מאולץ, או נשען רק על מילה שחוזרת?', '4. **הד במשמעות:** האם הזוג רק מחזיר, במילים אחרות, משהו שהחולם/ת כבר אמר/ה או חיבר/ה?', '5. **שאלה מובילה:** האם השאלה מרמזת על תשובה, או מניחה רגש או פרט שלא נאמרו?', '6. **עברית טבעית:** האם הזוג והשאלה נקראים כמו עברית של אדם?', '7. **התקדמות:** האם הזוג מקדם את החקירה, כלומר מוביל למקום שעוד לא היה בשיחה?', '');
  results.forEach((r, i) => {
    L.push(`### רגע ${i + 1}`, '', `- **החלק בחלום:** ${q(r.momentText)}`, `- **השאלה:** ${q(r.question)}`, `- **התשובה:** ${q(r.answer)}`, '');
    if (r.invalid) L.push('(התשובה של המודל לא נקראה: אין זוג)', '');
    else if (!r.approved.length) L.push('(הבודק לא אישר זוג ברגע הזה)', '');
    r.approved.forEach((x, n) => L.push(`**זוג ${i + 1}.${n + 1}**`, `- ${side(x.a)}`, `- ${side(x.b)}`, `- **השאלה:** ${q(x.question)}`, ''));
  });
  L.push('## חלק ב: מועמדות שהבודק פסל (למידע)', '', 'לכל אחת: האם הייתה שווה מחשבה, כך שהפסילה הפסידה משהו?', '');
  results.forEach((r, i) => r.refused.forEach((x, n) => L.push(`- **${i + 1}.ר${n + 1}:** ${q(x.a)} / ${q(x.b)}`)));
  L.push('', '## חלק ג: המסע כשיחה (עם חוקי הקצב)', '', 'לכל מסע ענה:', '1. **שיחה מקשיבה ולא שאלון:** האם זה נקרא כך?', '2. **המסע מתקדם:** האם יש בו רגע שמוביל למקום חדש, או שהוא מסתובב במקום?', '3. **חזרתיות:** האם משהו נאמר שוב, באותה משמעות?', '', '**שימו לב:** השאלות לכל רגע והתשובות הן מהריצה הקודמת, ואינן חלק מהבדיקה. שופטים את מה ש-DARE אומרת אחרי כל תשובה: השיקוף, והזוג כשהוא מוצג.', '');
  const plans = [...new Set(results.map((r) => r.plan))];
  plans.forEach((plan, pi) => {
    L.push(`### מסע ${pi + 1}`, '');
    for (const r of results.filter((x) => x.plan === plan)) {
      L.push(`**DARE:** ${q(r.question)}`, `**החולם/ת:** ${q(r.answer)}`);
      if (r.value) L.push(`**DARE:** ${[r.value.insight.observation, r.value.insight.reflection].filter(Boolean).join(' ')}`);
      const x = r.value?.insight.pair;
      if (shown.get(r.key) && x) {
        L.push('שני דברים מהרגע הזה, זה ליד זה:', `- ${side(x.a)}`, `- ${side(x.b)}`, `**DARE:** ${x.question}`, '(התשובה לשאלה הזו אינה חלק מהניסוי)');
      }
      L.push('');
    }
  });
  return `${L.join('\n')}\n`;
}

/** Her decision rule, set before any call (doc 90 §5, with the measures she asked for on 2026-10-23). */
export const DECISION_RULE = [
  { id: 1, he: 'ציטוט לא מדויק (בודק ושופט)', pass: '0' },
  { id: 2, he: 'זוג שהקשר בו מלאכותי, או שנשען רק על מילה שחוזרת', pass: '0' },
  { id: 3, he: 'שאלה שמובילה, או מניחה רגש או פרט', pass: '0' },
  { id: 4, he: 'מהזוגות שהבודק אישר: שווים מחשבה', pass: '80% לפחות' },
  { id: 5, he: 'רגעים שאפשר להציע בהם זוג (לא רגע ראשון) עם זוג מאושר', pass: '2 מתוך 5 לפחות' },
  { id: 6, he: 'עברית טבעית בזוג ובשאלה', pass: 'בכולם' },
  { id: 7, he: 'הד במשמעות בזוג שמוצג בפועל (אחרי חוקי הקצב)', pass: '0' },
  { id: 8, he: 'שיחה מקשיבה ולא שאלון (שופט, לכל מסע)', pass: '3 מתוך 3' },
  { id: 9, he: 'התקדמות: כל זוג שמוצג בפועל מוביל למקום חדש, ואף מסע לא חוזר על עצמו במשמעות', pass: 'בכולם' },
  { id: 10, he: 'זוג בשני רגעים רצופים', pass: '0 (נבדק בקוד)' },
] as const;
