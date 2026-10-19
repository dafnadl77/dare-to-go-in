/**
 * Quality check of the AI dream journey on SYNTHETIC dreams only (never a customer's dream, nothing is read from or written to Supabase).
 * For each dream it runs the journey twice with real model calls:
 *   BEFORE: the fixed question and the reflection prompt/schema exactly as they were on main (read from git, never edited here);
 *   AFTER:  questions written for the dream, the optional link question, and the upgraded reflection (the production functions).
 * The dreamer's answers are written by a model playing a person (clearly synthetic) and are recorded in the output.
 * Cost and time are measured per call. Run:  npx tsx scripts/aiJourneyEval.ts <outFile.json> [onlyDreamNumber]
 * Needs OPENAI_API_KEY in .env. It spends real (small) model usage, so it is run only with the owner's approval.
 */
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import OpenAI from 'openai';
import { runAnalysisModel } from '../server/routes/dreamAnalysis.ts';
import { generateDreamReflection, buildReflectionInput, finalizeDeliveredReflection } from '../server/routes/dreamReflection.ts';
import { generateDreamQuestions } from '../server/routes/dreamQuestions.ts';
import { deriveDreamElements } from '../src/hero/dreamElements.ts';
import { buildDreamElementLabelSystemPrompt, DREAM_ELEMENT_LABELS_JSON_SCHEMA, validateElementLabels } from '../src/hero/dreamElementLabelsSchema.ts';
import { normalizeLabel } from '../src/hero/dreamElementLabelQuality.ts';
import { factsFromAnalysis } from '../src/hero/dreamQuestionsSchema.ts';
import { computeDreamDepth } from '../src/hero/dreamDepth.ts';
import { runWithLanguageIntegrity } from '../server/languageGuard.ts';
import { collectStrings, findAddressViolation } from '../src/hero/languageIntegrity.ts';
import { emotionNamesForModel, type EmotionId } from '../src/hero/dreamEmotions.ts';
import { feelingsTextLooksDiagnostic, getGroundingStatement } from '../src/hero/dreamReflectionSchema.ts';
import { en, he } from '../src/i18n/translations.ts';
import type { AppLanguage } from '../src/hero/appLanguage.ts';
import type { AddressPreference } from '../src/hero/addressPreference.ts';

// ---- assumptions printed with the results (list prices of the default model, per million tokens; verify before relying on the cost) ----
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const INPUT_USD_PER_M = 0.15;
const OUTPUT_USD_PER_M = 0.6;
// Other models: pass their assumed list prices (USD per million tokens, "input,output") for the stage that uses them.
const reflectionRates = process.env.EVAL_REFLECTION_RATES ? process.env.EVAL_REFLECTION_RATES.split(',').map(Number) : null;
const questionsRates = process.env.EVAL_QUESTIONS_RATES ? process.env.EVAL_QUESTIONS_RATES.split(',').map(Number) : null;
const costOf = (u: { input: number; output: number }) => (u.input * INPUT_USD_PER_M + u.output * OUTPUT_USD_PER_M) / 1_000_000;

interface SyntheticDream {
  id: number;
  language: AppLanguage;
  kind: string;
  text: string;
  address: AddressPreference;
  emotions: EmotionId[];
  /** The simulated dreamer answers the association question with this instead of a model-written answer. */
  fixedAssociation?: string;
  skipLink?: boolean;
}

const DREAMS: SyntheticDream[] = [
  { id: 1, language: 'he', kind: 'קצר', address: 'neutral', emotions: [], text: 'עמדתי בתחנת רכבת ריקה וחיכיתי. הרכבת לא הגיעה.', skipLink: true },
  { id: 2, language: 'he', kind: 'קצר, מלכודת מילון חלומות', address: 'neutral', emotions: [], fixedAssociation: 'לא יודעת', skipLink: true, text: 'חלמתי שהשיניים שלי נושרות אחת אחת לתוך היד, ואף אחד בחדר לא שם לב.' },
  { id: 3, language: 'he', kind: 'מפורט', address: 'feminine', emotions: ['helplessness', 'longing'], text: 'הייתי בבית ילדותי, אבל החדרים היו גדולים יותר. אמא שלי עמדה במטבח ובישלה, ולא הסתכלה עליי. עליתי למעלה וגיליתי חדר שלא הכרתי, ובו מים עד הקרסוליים ומנורה דולקת. מישהו קרא לי בשמי מלמטה, אבל לא ידעתי אם לרדת. בסוף הלכתי עם כוס מים ביד, והמים נשפכו.' },
  { id: 4, language: 'he', kind: 'בינוני, עמימות', address: 'neutral', emotions: [], text: 'רצתי לתפוס טיסה. התיק נשאר פתוח ודברים נפלו ממנו בדרך. בשער הודיעו שהטיסה היא ליעד אחר מזה שרציתי, ועליתי עליה בכל זאת.' },
  { id: 5, language: 'en', kind: 'detailed', address: 'neutral', emotions: [], text: 'I was swimming in a dark lake at night while my old teacher watched from a rowing boat. The water was warm, then suddenly freezing. She handed me a lantern but it had no flame. I woke up as I tried to say her name.' },
  { id: 6, language: 'en', kind: 'short', address: 'neutral', emotions: [], skipLink: true, text: 'I was late for an exam in a school I had never seen. The door was locked.' },
  { id: 7, language: 'he', kind: 'עשיר, כמה דמויות', address: 'feminine', emotions: ['wonder', 'confusion'], text: 'הייתי בחתונה של חברה. כולם לבשו לבן ואני לבשתי שחור. אחי הקטן נתן לי מפתח ואמר שזה למקום שעוד לא הייתי בו. הלכנו לאורך החוף, והים התרחק ולא חזר. מישהו שר שיר שלא הכרתי, אבל ידעתי את כל המילים. כשהגענו לדלת, המפתח היה קטן מדי.' },
  { id: 8, language: 'he', kind: 'סוריאליסטי', address: 'neutral', emotions: [], text: 'הייתי בתוך שעון ענק. הגלגלים נעו לאט והזמן נשמע כמו נשימה. ראיתי את עצמי מבחוץ, יושבת ועובדת ליד שולחן, ולא יכולתי לצעוק.' },
  { id: 9, language: 'he', kind: 'סיוט, נושא רגיש', address: 'feminine', emotions: ['fear', 'sadness'], text: 'רדפו אחריי במסדרון ארוך בבית חולים. הדלתות נסגרו אחת אחרי השנייה. בסוף הגעתי לחדר שבו אבא שלי ישן במיטה, ולא הצלחתי להעיר אותו.' },
  { id: 10, language: 'en', kind: 'fragment', address: 'neutral', emotions: [], skipLink: true, text: 'A white horse in a kitchen.' },
];

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const usageLog: { stage: string; input: number; output: number; model?: string }[] = [];
const track = (stage: string) => (u: { input: number; output: number; model?: string }) => usageLog.push({ stage, ...u });

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t0 = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - t0 };
}

// ---- BEFORE: read the unchanged code from main so the baseline is genuinely the old behaviour ----
function loadBaseline() {
  const dir = new URL('./.baseline/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const old = execSync('git show main:src/hero/dreamReflectionSchema.ts', { cwd: new URL('..', import.meta.url), encoding: 'utf8', maxBuffer: 10_000_000 });
  const rewritten = old.replace(/from '\.\/([A-Za-z]+)\.js'/g, "from '../../src/hero/$1.ts'");
  writeFileSync(new URL('dreamReflectionSchema.baseline.ts', dir), rewritten);
  return () => rmSync(dir, { recursive: true, force: true });
}

/** The reflection input exactly as main built it. */
function oldReflectionInput(a: ReturnType<typeof Object>, element: string, answer: string, emotions: EmotionId[], language: AppLanguage): string {
  const an = a as unknown as import('../src/hero/dreamAnalysisSchema.ts').DreamAnalysis;
  const actionPhrase = (x: { subject: string | null; action: string; target: string | null }) => [x.subject, x.action, x.target].filter(Boolean).join(' ').trim();
  return `DREAM (original text, verbatim): ${an.sourceText}

STRUCTURED FACTS FROM THE DREAM (already extracted, use only these — do not invent beyond them):
- Summary: ${an.summary}
- People: ${an.people.map((p) => p.nameOrRole).join(', ') || 'none'}
- Places: ${an.places.map((p) => p.name).join(', ') || 'none'}
- Actions: ${an.actions.map(actionPhrase).filter(Boolean).join('; ') || 'none'}
- Unusual/surreal elements: ${an.unusualElements.join('; ') || 'none'}
- Emotional tone (if known): ${an.emotionalTone ?? 'unknown'}

THE ELEMENT THE DREAMER CHOSE AS STANDING OUT TO THEM: ${element}

THE DREAMER'S OWN ASSOCIATION WITH THAT ELEMENT (their exact words): "${answer}"${
    emotions.length ? `\n\nFEELINGS THE DREAMER REPORTED (their own report, chosen from a fixed list after the dream; NOT part of what happened in the dream): ${emotionNamesForModel(emotions, language)}` : ''
  }`;
}

async function simulateDreamer(language: AppLanguage, dream: string, question: string, persona: string): Promise<string> {
  const response = await client.responses.create({
    model: MODEL,
    store: false,
    instructions: `You are role-playing a real person who has just told a dream and is now asked ONE question about it. Reply in ${language === 'he' ? 'Hebrew' : 'English'}, in first person, in one or two short natural sentences (at most 25 words), the way a person types on a phone. Persona: ${persona}. Do not analyze or interpret the dream, do not thank, do not ask anything back. Invent no more than a small personal association.`,
    input: `Your dream: ${dream}\n\nThe question: ${question}`,
  });
  return response.output_text.trim();
}

const PERSONAS = ['hesitant and a little unsure', 'reflective and open', 'brief and plain-spoken'];

async function runLabels(language: AppLanguage, dreamText: string, elements: string[]): Promise<string[]> {
  const input = `DREAM CONTEXT (for disambiguation only — do not label this line itself): ${dreamText}\n\nELEMENTS TO LABEL, IN ORDER:\n${elements.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;
  const response = await client.responses.create({
    model: MODEL,
    store: false,
    instructions: buildDreamElementLabelSystemPrompt(language),
    input,
    text: { format: { type: 'json_schema', name: 'dream_element_labels', schema: DREAM_ELEMENT_LABELS_JSON_SCHEMA as never, strict: true } },
  });
  const labels = validateElementLabels(JSON.parse(response.output_text), elements.length);
  return labels ? labels.map((l, i) => normalizeLabel(l) || elements[i]) : elements;
}

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
function novelty(text: string, sources: string[]): number {
  const known = new Set(sources.join(' ').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
  const mine = text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  return mine.length === 0 ? 0 : mine.filter((w) => !known.has(w)).length / mine.length;
}

async function main() {
  const out = process.argv[2];
  const only = process.argv[3] ? Number(process.argv[3]) : null;
  if (!out) throw new Error('usage: tsx scripts/aiJourneyEval.ts <outFile.json> [dreamNumber]');
  const cleanup = loadBaseline();
  const baseline = (await import('./.baseline/dreamReflectionSchema.baseline.ts')) as typeof import('../src/hero/dreamReflectionSchema.ts');
  const results: unknown[] = [];
  try {
    for (const d of DREAMS) {
      if (only && d.id !== only) continue;
      const persona = PERSONAS[d.id % PERSONAS.length];
      const t = (d.language === 'he' ? he : en).reflection;
      const template = (el: string) => `${t.reflectionQuestionPrefix} ${el.toUpperCase()} ${t.reflectionQuestionSuffix}`.replace(/\n/g, ' ');
      const sharedUsageStart = usageLog.length;

      const analysisOutcome = await runAnalysisModel(client, d.text);
      if (analysisOutcome.status !== 'ok') {
        results.push({ id: d.id, error: 'analysis ' + analysisOutcome.status });
        continue;
      }
      const analysis = analysisOutcome.value;
      const rawElements = deriveDreamElements(analysis);
      const labels = rawElements.length ? await runLabels(d.language, d.text, rawElements) : [];
      const idx = labels.length ? d.id % labels.length : -1;
      const element = idx >= 0 ? labels[idx] : analysis.summary.split(/[.!?]/)[0];
      const depth = computeDreamDepth(analysis);
      const dreamerBase = [analysis.sourceText];

      // ---------- BEFORE ----------
      const assocQ1 = template(element);
      const ans1 = d.fixedAssociation ?? (await simulateDreamer(d.language, d.text, assocQ1, persona));
      const beforeInput = oldReflectionInput(analysis, element, ans1, d.emotions, d.language);
      const beforeRun = await timed(() =>
        runWithLanguageIntegrity(
          async (retryNote) => {
            const response = await client.responses.create({
              model: MODEL,
              store: false,
              instructions: baseline.buildDreamReflectionSystemPrompt(d.language, d.address) + retryNote,
              input: beforeInput,
              text: { format: { type: 'json_schema', name: 'dream_reflection', schema: baseline.DREAM_REFLECTION_JSON_SCHEMA as never, strict: true } },
            });
            if (response.usage) track('reflection-before')({ input: response.usage.input_tokens, output: response.usage.output_tokens });
            try {
              return baseline.validateDreamReflectionResult(JSON.parse(response.output_text));
            } catch {
              return null;
            }
          },
          (r) => collectStrings({ ...r, groundingStatement: '' }),
          {
            route: 'eval-before',
            language: d.language,
            context: [...dreamerBase, element, ans1].join('\n'),
            strictLatin: true,
            extraCheck: (r) => findAddressViolation(collectStrings({ ...r, groundingStatement: '' }), d.language, d.address) ?? baseline.diagnosticWordingNote(r),
          },
        ),
      );
      const before = beforeRun.value.status === 'ok' ? { ...beforeRun.value.value, emotionReflection: d.emotions.length ? beforeRun.value.value.emotionReflection : null, groundingStatement: getGroundingStatement(d.language) } : null;

      // ---------- AFTER ----------
      let questions: { associationQuestions: string[]; linkQuestions: string[] } | null = null;
      let questionsMs = 0;
      let questionsOutcome = 'skipped';
      if (labels.length) {
        const run = await timed(() => generateDreamQuestions(client, { sourceText: d.text, moments: labels, facts: factsFromAnalysis(analysis), language: d.language, addressPreference: d.address, onUsage: track('questions') }));
        questionsMs = run.ms;
        questionsOutcome = run.value.status;
        questions = run.value.status === 'ok' ? run.value.value.kept : null;
      }
      const assocQ2 = (questions && idx >= 0 ? questions.associationQuestions[idx] : '') || assocQ1;
      const linkQ = d.skipLink ? '' : (questions && idx >= 0 ? questions.linkQuestions[idx] : '') || '';
      const ans2 = d.fixedAssociation ?? (assocQ2 === assocQ1 ? ans1 : await simulateDreamer(d.language, d.text, assocQ2, persona));
      const linkAns = linkQ ? await simulateDreamer(d.language, d.text, linkQ, persona) : '';
      const extras = { associationQuestion: assocQ2 === assocQ1 ? undefined : assocQ2, ...(linkQ && linkAns ? { linkQuestion: linkQ, linkResponse: linkAns } : {}) };
      const afterInput = buildReflectionInput(analysis, element, ans2, [], d.emotions, d.language, extras);
      const dreamerText = [...dreamerBase, element, ans2, extras.linkResponse ?? ''].join('\n');
      const afterRun = await timed(() => generateDreamReflection(client, { input: afterInput, language: d.language, addressPreference: d.address, dreamerText, onUsage: track('reflection-after') }));
      const rawAfter = afterRun.value.status === 'ok' ? afterRun.value.value : null;
      const after = rawAfter ? finalizeDeliveredReflection(rawAfter, { emotions: d.emotions, language: d.language, depth, dreamerText, summary: analysis.summary }) : null;

      const modelsOf = (stage: string) => [...new Set(usageLog.slice(sharedUsageStart).filter((u) => u.stage === stage && u.model).map((u) => u.model as string))];
      const sumUsage = (stage: string) => usageLog.slice(sharedUsageStart).filter((u) => u.stage === stage).reduce((a, u) => ({ input: a.input + u.input, output: a.output + u.output }), { input: 0, output: 0 });
      const textsOf = (r: typeof after) => (r ? [r.observation, r.personalAssociation, r.possibleThread, r.continuityQuestion, r.emotionReflection ?? '', r.summary ?? '', ...(r.alternativeReadings ?? []).flatMap((x) => [x.reading]), r.existentialLens?.text ?? '', ...Object.values(r.lenses).map((x) => x ?? '')] : []);
      const sources = [d.text, element, ans2, linkAns];
      results.push({
        id: d.id,
        kind: d.kind,
        language: d.language,
        text: d.text,
        depth,
        moments: labels,
        chosen: element,
        emotions: d.emotions,
        before: { question: assocQ1, answer: ans1, reflection: before, ms: beforeRun.ms, usage: sumUsage('reflection-before'), usd: costOf(sumUsage('reflection-before')) },
        after: {
          questionsOutcome,
          questionsMs,
          questionsUsage: sumUsage('questions'),
          questionsModels: modelsOf('questions'),
          reflectionModels: modelsOf('reflection-after'),
          associationQuestion: assocQ2,
          associationWasFixedFallback: assocQ2 === assocQ1,
          linkQuestion: linkQ,
          linkAnswer: linkAns,
          answer: ans2,
          reflection: after,
          readingsBeforeFinalize: rawAfter?.alternativeReadings?.length ?? 0,
          readingsAfterFinalize: after?.alternativeReadings?.length ?? 0,
          existentialBeforeFinalize: !!rawAfter?.existentialLens,
          existentialAfterFinalize: !!after?.existentialLens,
          ms: afterRun.ms,
          usage: sumUsage('reflection-after'),
          usd: (questionsRates ? (sumUsage('questions').input * questionsRates[0] + sumUsage('questions').output * questionsRates[1]) / 1_000_000 : costOf(sumUsage('questions'))) + (reflectionRates ? (sumUsage('reflection-after').input * reflectionRates[0] + sumUsage('reflection-after').output * reflectionRates[1]) / 1_000_000 : costOf(sumUsage('reflection-after'))),
        },
        metrics: {
          wordsBefore: textsOf(before as never).reduce((n, x) => n + words(x), 0),
          wordsAfter: textsOf(after).reduce((n, x) => n + words(x), 0),
          noveltyObservationBefore: before ? novelty(before.observation, [d.text, ans1]) : null,
          noveltyObservationAfter: after ? novelty(after.observation, sources) : null,
          noveltyQuestionBefore: before ? novelty(before.continuityQuestion, [d.text, ans1]) : null,
          noveltyQuestionAfter: after ? novelty(after.continuityQuestion, sources) : null,
          diagnosticHitsAfter: textsOf(after).filter((x) => feelingsTextLooksDiagnostic(x)).length,
          diagnosticHitsBefore: textsOf(before as never).filter((x) => feelingsTextLooksDiagnostic(x)).length,
        },
      });
      console.log(`dream ${d.id} done`);
      writeFileSync(out, JSON.stringify({ model: MODEL, reflectionModelAfter: process.env.OPENAI_REFLECTION_MODEL ?? MODEL, questionsModelAfter: process.env.OPENAI_QUESTIONS_MODEL ?? MODEL, pricing: { inputUsdPerMillion: INPUT_USD_PER_M, outputUsdPerMillion: OUTPUT_USD_PER_M, note: 'assumed list prices, verify' }, results }, null, 2));
    }
  } finally {
    cleanup();
  }
  console.log('finished; wrote', out);
}

main().catch((e) => {
  console.error('eval failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});

