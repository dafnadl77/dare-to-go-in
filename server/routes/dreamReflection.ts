import OpenAI from 'openai';
import { getOpenAIClient } from '../openaiClient.js';
import { okResult, errorResult, withHeaders, type HandlerResult } from '../httpResult.js';
import { validateDreamAnalysis, type DreamAnalysis } from '../../src/hero/dreamAnalysisSchema.js';
import {
  buildDreamReflectionSystemPrompt,
  DREAM_REFLECTION_JSON_SCHEMA,
  getGroundingStatement,
  validateDreamReflectionResult,
  type DreamReflectionResult,
  feelingsTextLooksDiagnostic,
  diagnosticWordingNote,
  reflectionLengthNote,
  finalizeReflectionExtras,
} from '../../src/hero/dreamReflectionSchema.js';
import { computeDreamDepth, type DreamDepth } from '../../src/hero/dreamDepth.js';
import type { AppLanguage } from '../../src/hero/appLanguage.js';
import { emotionNamesForModel, mentionsUnlistedFeeling, normalizeEmotions, type EmotionId } from '../../src/hero/dreamEmotions.js';
import { collectStrings, findAddressViolation, findHebrewSlashForm } from '../../src/hero/languageIntegrity.js';
import { normalizeAddressPreference, type AddressPreference } from '../../src/hero/addressPreference.js';
import { runWithLanguageIntegrity } from '../languageGuard.js';
import { type RequestHeaders, type CallerIdentity, type ResolveCallerResult } from '../callerIdentity.js';
import { resolveAdultCaller } from '../ageGate.js';
import { realModerate, type Moderate } from '../safety/moderation.js';
import { checkHerAnswers, dareWordsSafe, safetyBody } from '../safety/routeSafety.js';
import { safetyAckOf } from '../../src/hero/safety/journeySafety.js';
import { reserveReflectionAttempt, refundReflectionAttempt, getTrialAttemptState, completeTrialAttempt } from '../dreamAttempts.js';
import { laterStepBudgetResult } from '../budgetExhausted.js';
import { FREE_DREAM_USED_MESSAGE } from '../trialAllowance.js';
import { getSupabaseUserScopedClient } from '../supabaseUserScopedClient.js';
import { logModelUsed, resolveStageModel } from '../stageModel.js';
import {
  attributedFeelingNote,
  descriptionVersusInterpretationNote,
  garbledTextNote,
  symbolWordingNote,
  unsupportedInsertionNote,
} from '../../src/hero/reflectionChecks.js';

function extractBearerToken(authorizationHeader: string): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match ? match[1].trim() || null : null;
}

/** The SAME persisted, optional address preference Pattern Reflection uses
    (see addressPreference.ts) — read fresh from the caller's own verified
    user record, never trusted from the request body. A trial (anonymous,
    pre-sign-in) caller has no account and therefore no preference to read
    at all — 'neutral' is not a guess in that case, it's the only thing
    that could ever be true for an identity with no metadata. */
export async function resolveAddressPreference(identity: CallerIdentity, requestHeaders: RequestHeaders): Promise<AddressPreference> {
  if (identity.kind !== 'user') return 'neutral';
  const token = requestHeaders.authorization ? extractBearerToken(requestHeaders.authorization) : null;
  if (!token) return 'neutral';
  const scoped = getSupabaseUserScopedClient(token);
  if (!scoped) return 'neutral';
  const { data } = await scoped.auth.getUser();
  return normalizeAddressPreference(data.user?.user_metadata?.addressPreference);
}

function actionPhrase(a: DreamAnalysis['actions'][number]): string {
  return [a.subject, a.action, a.target].filter(Boolean).join(' ').trim();
}

/** What the dreamer was asked and answered beyond the chosen moment. All optional: an older client sends none of it. */
export interface ReflectionInputExtras {
  /** The association question as shown (written for this dream, or the fixed one). */
  associationQuestion?: string;
  /** The optional second question, and the dreamer's answer to it; both present only when they answered. */
  linkQuestion?: string;
  linkResponse?: string;
  /** After the dream map (2026-10-30): the whole view she already read there, and the questions DARE asked her in the conversation. */
  wholeViewShown?: string;
  questionsAsked?: string[];
  /** After the dream map: her answers moment by moment, in the order of the conversation (journeyRecord.ts momentAnswersFromJourney). */
  momentAnswers?: MomentAnswerInput[];
}

export interface MomentAnswerInput {
  momentId: string;
  label: string;
  moment: string;
  question: string;
  answer: string;
  kind?: 'not-for-me' | 'change-direction' | 'keep-going';
}

const boundedText = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Her answers moment by moment as sent by the journey: bounded, and an item without its moment or her answer is dropped (never guessed). */
export function parseMomentAnswers(value: unknown): MomentAnswerInput[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const kinds = ['not-for-me', 'change-direction', 'keep-going'] as const;
  const items = value
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    .map((x) => {
      const kind = kinds.find((k) => k === x.kind);
      return { momentId: boundedText(x.momentId, 12), label: boundedText(x.label, 120), moment: boundedText(x.moment, 400), question: boundedText(x.question, 800), answer: boundedText(x.answer, 2000), ...(kind ? { kind } : {}) };
    })
    .filter((x) => x.momentId && (x.moment || x.label) && (x.answer || x.kind))
    .slice(0, 40);
  return items.length ? items : undefined;
}

/** Each answer under its own moment, in the order she gave them; what DARE said is marked as DARE's. */
function momentAnswersBlock(items: readonly MomentAnswerInput[]): string {
  const lines: string[] = [];
  let current = '';
  for (const a of items) {
    if (a.momentId !== current) {
      current = a.momentId;
      lines.push(`[${a.momentId}] "${a.label || a.moment}" — in the dream: "${a.moment || a.label}"`);
    }
    if (a.question) lines.push(`  DARE said: "${a.question}"`);
    if (a.kind === 'not-for-me') lines.push('  THE DREAMER pressed "this doesn\'t fit me" on what DARE offered just before: that possibility is REJECTED, never use it');
    else if (a.kind === 'change-direction') lines.push('  THE DREAMER pressed "change direction" (no words of theirs)');
    else if (a.kind === 'keep-going') lines.push('  THE DREAMER pressed "keep going this way" (no words of theirs)');
    else {
      const marks = [emphasizes(a.answer) && 'THE DREAMER MARKED THIS AS MORE IMPORTANT', corrects(a.answer) && 'THE DREAMER CORRECTED OR TURNED DOWN what DARE said before: use their version'].filter(Boolean);
      lines.push(`  THE DREAMER answered (their exact words): "${a.answer}"${marks.length ? ` — ${marks.join('; ')}` : ''}`);
    }
  }
  return lines.join('\n');
}

/**
 * What she herself said matters, where she corrected DARE, and whether she tied the dream to her own life (2026-10-31). Read from her own
 * words only, never inferred: when nothing is found, the model is told that nothing was said (no importance and no life link invented).
 */
const EMPHASIS = [
  /(?:יותר|הכי|בעיקר|במיוחד)\s+(?:חשוב|חשובה|חשובים|משמעותי|משמעותית|בולט|בולטת|זכור|זכורה)/,
  /(?:חשוב|חשובה|בלט|בלטה|זכור|זכורה)\s+לי\s+(?:יותר|הכי|במיוחד)/,
  /מה\s+שהכי|(?:^|\s)העיקר(?:\s|$|[,.])/,
  /\b(?:more|most)\s+important\b|\bmatters?\s+(?:more|most)\b|\bstood\s+out\s+(?:more|most)\b|\babove\s+all\b|\bmainly\b/i,
];
export const emphasizes = (answer: string) => EMPHASIS.some((r) => r.test(answer));
export const corrects = (answer: string) =>
  /^(?:לא(?!\s+(?:יודע|יודעת|זוכר|זוכרת)(?=[\s,.!?]|$))[\s,]|בעצם[\s,]|זה\s+לא\s+היה|התכוונתי|לא\s+נכון)/.test(answer.trim()) || /^(?:no\b|not\s+quite\b|actually\b|i\s+meant\b|that'?s\s+not\b)/i.test(answer.trim());
export const pointsToHerLife = (answer: string) =>
  /(?:^|[\s,.(])(?:בעבודה|בעבודה\s+שלי|בחיים|בחיים\s+שלי|בילדות|אצלי|תקופות\s+של|בתקופה\s+(?:הזאת|הזו|האחרונה)|(?:מזכיר|מזכירה|מזכירים)\s+לי)(?=[\s,.!?)]|$)/.test(answer) ||
  /\b(?:in\s+my\s+life|at\s+work|my\s+job|in\s+real\s+life|reminds\s+me|when\s+i\s+was\s+a\s+child)\b/i.test(answer);

/** The lines that tell the model what mattered to her and where (if anywhere) she tied the dream to her life. */
function herWeightLines(answers: readonly { answer: string; momentId?: string }[]): string {
  const said = answers.filter((a) => a.answer);
  const where = (a: { momentId?: string }) => (a.momentId ? `[${a.momentId}] ` : '');
  const weight = said.filter((a) => emphasizes(a.answer));
  const life = said.filter((a) => pointsToHerLife(a.answer));
  return `WHAT MATTERS MOST TO THE DREAMER (their own emphasis, give it matching weight): ${weight.length ? weight.map((a) => `${where(a)}"${a.answer}"`).join(' · ') : 'they did not say that anything matters more; do not invent an order of importance'}
THE DREAMER'S OWN LIFE: ${life.length ? `they tied the dream to their life only in these words: ${life.map((a) => `${where(a)}"${a.answer}"`).join(' · ')}. Refer to that link only as they said it, never wider` : 'they did not tie the dream to their life anywhere. The continuity question must not present such a link as given: stay with the dream, or ask gently whether there is any link at all'}`;
}

export function buildReflectionInput(
  dreamAnalysis: DreamAnalysis,
  selectedElement: string,
  reflectionResponse: string,
  reconstructionCorrections: string[],
  emotions: readonly EmotionId[] = [],
  language: AppLanguage = 'en',
  extras: ReflectionInputExtras = {},
): string {
  const correctionsLine = reconstructionCorrections.length
    ? `\n- Corrections the dreamer made to the reconstruction afterward: ${reconstructionCorrections.join('; ')}`
    : '';

  return `DREAM (original text, verbatim): ${dreamAnalysis.sourceText}

STRUCTURED FACTS FROM THE DREAM (already extracted, use only these — do not invent beyond them):
- Summary: ${dreamAnalysis.summary}
- People: ${dreamAnalysis.people.map((p) => p.nameOrRole).join(', ') || 'none'}
- Places: ${dreamAnalysis.places.map((p) => p.name).join(', ') || 'none'}
- Actions: ${dreamAnalysis.actions.map(actionPhrase).filter(Boolean).join('; ') || 'none'}
- Unusual/surreal elements: ${dreamAnalysis.unusualElements.join('; ') || 'none'}
- Emotional tone (if known): ${dreamAnalysis.emotionalTone ?? 'unknown'}${correctionsLine}
- Named objects: ${dreamAnalysis.objects.filter((o) => o.explicit).map((o) => o.name).join(', ') || 'none'}
- RELATIONSHIPS between people/things: ${dreamAnalysis.relationships.map((r) => `${r.from} -> ${r.to}: ${r.relationship}`).join('; ') || 'none'}
- ORDER OF EVENTS: ${[...dreamAnalysis.sequence].sort((a, b) => a.order - b.order).map((s) => s.description).join(' > ') || 'unknown'}
- LEFT UNRESOLVED or ambiguous in the dream: ${dreamAnalysis.unresolvedDetails.join('; ') || 'none'}

DEPTH: ${computeDreamDepth(dreamAnalysis)}

${
    extras.momentAnswers?.length
      ? `THE MOMENTS THE DREAMER TALKED ABOUT ON THE DREAM MAP, WITH THEIR ANSWERS, MOMENT BY MOMENT IN THE ORDER OF THE CONVERSATION. Each answer belongs ONLY to the moment it is listed under: never say about one moment what was said about another. "DARE said" is DARE's own words (a question, or a possibility it offered): never the dreamer's words and never a fact about the dream.
${momentAnswersBlock(extras.momentAnswers)}`
      : `THE ELEMENT THE DREAMER CHOSE AS STANDING OUT TO THEM: ${selectedElement}${extras.associationQuestion ? `

THE QUESTION THE DREAMER WAS ASKED ABOUT IT (already asked; do not repeat it): "${extras.associationQuestion}"` : ''}

THE DREAMER'S OWN ASSOCIATION WITH THAT ELEMENT (their exact words): "${reflectionResponse}"${
    extras.linkQuestion && extras.linkResponse
      ? `

A SECOND, OPTIONAL QUESTION THE DREAMER CHOSE TO ANSWER (already asked; do not repeat it): "${extras.linkQuestion}"
THEIR ANSWER (their exact words): "${extras.linkResponse}"`
      : ''
  }`
  }${
    emotions.length
      ? `\n\nFEELINGS THE DREAMER REPORTED (their own report, chosen from a fixed list after the dream; NOT part of what happened in the dream): ${emotionNamesForModel(emotions, language)}`
      : ''
  }${
    extras.wholeViewShown
      ? `

AFTER THE DREAM MAP: this dream was explored on the dream map, as a conversation. ${
          extras.momentAnswers?.length
            ? 'The dreamer\'s answers are listed above, moment by moment.'
            : '"The element" above lists the moments the dreamer talked about (separated by "·"), and "their own association" holds their answers in those conversations, across the moments. These answers are listed together, WITHOUT the moment each belongs to: never say which moment or which detail an answer was about, and never tie an answer to a moment.'
        }
THE WHOLE VIEW THE DREAMER ALREADY READ ON THE MAP (never repeat it, not even in other words; add what it did not say): "${extras.wholeViewShown}"${
          extras.questionsAsked?.length
            ? `
QUESTIONS DARE ALREADY ASKED THEM IN THE CONVERSATION (never ask them again, not even in other words):
${extras.questionsAsked.map((x) => `- "${x}"`).join('\n')}`
            : ''
        }
${herWeightLines(extras.momentAnswers?.length ? extras.momentAnswers.filter((a) => !a.kind) : reflectionResponse.split('\n').map((answer) => ({ answer: answer.trim() })))}`
      : ''
  }`;
}

/** Every sentence of model prose in a reflection. The grounding line is overwritten by the server and the existential verdict is an internal label ("clear"), so neither is prose to check. */
export const proseOf = (result: DreamReflectionResult): string[] => collectStrings({ ...result, groundingStatement: '', existentialFit: undefined });

/** The generated prose that makes claims about the dream, without the three theory lenses (labelled as theory, they may speak of symbols) and without the copied "basis" quotes. */
const claimsOf = (result: DreamReflectionResult): string[] =>
  collectStrings({
    observation: result.observation,
    personalAssociation: result.personalAssociation,
    possibleThread: result.possibleThread,
    continuityQuestion: result.continuityQuestion,
    emotionReflection: result.emotionReflection,
    summary: result.summary,
    readings: (result.alternativeReadings ?? []).map((r) => r.reading),
    existential: result.existentialLens?.text,
  });

export interface GenerateReflectionParams {
  /** The feelings the dreamer named (their own report), so a feeling nobody named can be caught. */
  emotions?: readonly EmotionId[];
  input: string;
  language: AppLanguage;
  addressPreference: AddressPreference;
  /** Everything the dreamer themselves wrote — quoting it in another script is legitimate, so it is the context the language-integrity check excuses. */
  dreamerText: string;
  /** Reports the token usage of every model call (the quality-test script measures cost with it). */
  onUsage?: (usage: { input: number; output: number; model: string }) => void;
}

/** The model call plus every regeneration check, with no request handling around it. The route and scripts/aiJourneyEval.ts both use exactly this. */
export function generateDreamReflection(client: OpenAI, p: GenerateReflectionParams) {
  const instructions = buildDreamReflectionSystemPrompt(p.language, p.addressPreference);
  return runWithLanguageIntegrity(
    async (retryNote) => {
      // OPENAI_REFLECTION_MODEL is optional; unset, this uses the shared OPENAI_MODEL exactly as before. No other model is ever tried.
      const requestedModel = resolveStageModel('OPENAI_REFLECTION_MODEL');
      const response = await client.responses.create({
        model: requestedModel,
        store: false,
        instructions: instructions + retryNote,
        input: p.input,
        text: {
          format: {
            type: 'json_schema',
            name: 'dream_reflection',
            schema: DREAM_REFLECTION_JSON_SCHEMA,
            strict: true,
          },
        },
      });
      logModelUsed('dream-reflection', requestedModel, response.model);
      if (response.usage) p.onUsage?.({ input: response.usage.input_tokens, output: response.usage.output_tokens, model: response.model });
      try {
        return validateDreamReflectionResult(JSON.parse(response.output_text));
      } catch {
        return null;
      }
    },
    // groundingStatement is overwritten by the server below, so it isn't
    // model prose worth checking.
    (result) => proseOf(result),
    {
      route: 'dream-reflection',
      language: p.language,
      context: p.dreamerText,
      // Hebrew only: an untranslated capitalised word, or the masculine "אתה" for someone who never chose masculine, regenerates (never edited).
      strictLatin: true,
      extraCheck: (result) =>
        findAddressViolation(proseOf(result), p.language, p.addressPreference) ??
        findHebrewSlashForm(proseOf(result), p.language) ??
        diagnosticWordingNote(result),
      // Quality (a fresh response is requested at most once, because every one costs a call and several seconds; the last attempt is always accepted): the five lines fit one screen, nothing the
      // dreamer did not say is added, no fixed meaning for an object, the description is kept apart from the possibility, no garbled text.
      qualityCheck: (result) =>
        reflectionLengthNote(result) ??
        unsupportedInsertionNote(claimsOf(result), [p.dreamerText], p.language) ??
        symbolWordingNote(claimsOf(result), p.language) ??
        descriptionVersusInterpretationNote(result, p.language) ??
        garbledTextNote(claimsOf(result)) ??
        attributedFeelingNote(claimsOf(result), p.emotions ?? [], [p.dreamerText], p.language),
      maxQualityRetries: 1,
    },
  );
}

/**
 * Everything the server does to an accepted reflection before it is delivered or saved. The readings and the existential angle are kept
 * only when they rest on something really in the dream or in the dreamer's words, are not diagnostic, and fit the dream's depth; the
 * grounding line is the server's own wording; feelings text exists only for feelings the dreamer named and never reads as a diagnosis.
 * Nothing is rewritten: a part that fails is dropped.
 */
export function finalizeDeliveredReflection(
  accepted: DreamReflectionResult,
  p: { emotions: readonly EmotionId[]; language: AppLanguage; depth: DreamDepth; dreamerText: string; summary: string },
): DreamReflectionResult {
  const validated = finalizeReflectionExtras(accepted, p.depth, [p.dreamerText, p.summary]);
  // The grounding line's exact wording/tone is safety-relevant — always
  // enforced by the server, never left to the model's own phrasing.
  validated.groundingStatement = getGroundingStatement(p.language);
  // The feelings section exists only when the dreamer named feelings: without them there is nothing to reflect, whatever the model wrote.
  if (p.emotions.length === 0) validated.emotionReflection = null;
  if (typeof validated.emotionReflection === 'string' && validated.emotionReflection.trim() === '') validated.emotionReflection = null;
  if (typeof validated.summary === 'string' && validated.summary.trim() === '') validated.summary = null;
  // Neither text may name a feeling the dreamer did not name (it is dropped, never rewritten).
  if (p.emotions.length > 0 && mentionsUnlistedFeeling(validated.emotionReflection, p.emotions, p.language)) validated.emotionReflection = null;
  if (p.emotions.length > 0 && mentionsUnlistedFeeling(validated.summary, p.emotions, p.language)) validated.summary = null;
  // Never keep a line that reads as a diagnosis of the dreamer's state of mind (see feelingsTextLooksDiagnostic).
  if (feelingsTextLooksDiagnostic(validated.emotionReflection)) validated.emotionReflection = null;
  if (feelingsTextLooksDiagnostic(validated.summary)) validated.summary = null;
  return validated;
}

export interface ReflectionDeps {
  resolveIdentity?: (headers: RequestHeaders) => Promise<ResolveCallerResult>;
  /** The second safety layer (moderation.ts). */
  moderate?: Moderate;
}

export async function handleDreamReflection(rawBody: unknown, requestHeaders: RequestHeaders, deps: ReflectionDeps = {}): Promise<HandlerResult> {
  // The multi-moment journey's insight for a moment and its whole view (see dreamExploration.ts). Imported lazily: that module
  // imports this one, and a static import both ways would make the order of module loading matter.
  const mode = typeof rawBody === 'object' && rawBody !== null ? (rawBody as { mode?: unknown }).mode : undefined;
  if (mode === 'moment-reply' || mode === 'whole-view' || mode === 'conversation-turn' || mode === 'conversation-summary') {
    const { handleExploration } = await import('./dreamExploration.js');
    return handleExploration(mode, rawBody, requestHeaders);
  }
  const resolved = await (deps.resolveIdentity ?? resolveAdultCaller)(requestHeaders);
  const moderate = deps.moderate ?? realModerate;
  if (!resolved.ok) {
    return errorResult(resolved.status, resolved.reason, resolved.message);
  }
  const cookieHeaders = resolved.setCookieHeader ? { 'Set-Cookie': resolved.setCookieHeader } : undefined;

  const body = (rawBody ?? {}) as {
    dreamAnalysis?: unknown;
    selectedElement?: unknown;
    reflectionResponse?: unknown;
    reconstructionCorrections?: unknown;
    /** Optional: up to three feeling ids the dreamer named. Unknown or malformed values are dropped. */
    emotions?: unknown;
    associationQuestion?: unknown;
    linkQuestion?: unknown;
    linkResponse?: unknown;
    /** After the dream map: what she already read there (optional; an older client sends none of it). */
    wholeViewShown?: unknown;
    questionsAsked?: unknown;
    momentAnswers?: unknown;
    language?: unknown;
    attemptId?: unknown;
  };
  // Defaults to English for any caller that doesn't send it — matches
  // the pre-bilingual behavior exactly.
  const language: AppLanguage = body.language === 'he' ? 'he' : 'en';

  const dreamAnalysis = validateDreamAnalysis(body.dreamAnalysis);
  if (!dreamAnalysis) {
    return withHeaders(
      errorResult(400, 'invalid_response', 'dreamAnalysis is missing or does not match the expected DreamAnalysis shape.'),
      cookieHeaders,
    );
  }
  const selectedElement = typeof body.selectedElement === 'string' ? body.selectedElement.trim() : '';
  if (!selectedElement) {
    return withHeaders(errorResult(400, 'empty_input', 'selectedElement must be a non-empty string.'), cookieHeaders);
  }
  const reflectionResponse = typeof body.reflectionResponse === 'string' ? body.reflectionResponse.trim() : '';
  if (!reflectionResponse) {
    return withHeaders(errorResult(400, 'empty_input', 'reflectionResponse must be a non-empty string.'), cookieHeaders);
  }
  const reconstructionCorrections = Array.isArray(body.reconstructionCorrections)
    ? body.reconstructionCorrections.filter((c): c is string => typeof c === 'string')
    : [];
  const emotions = normalizeEmotions(body.emotions);
  const attemptId = typeof body.attemptId === 'string' ? body.attemptId : '';
  if (!attemptId) {
    return withHeaders(errorResult(400, 'invalid_response', 'attemptId is required.'), cookieHeaders);
  }

  // The distress path (doc 106/109), before any model or slot: her words in this request, and her corrections.
  const herNow = [reflectionResponse, typeof body.linkResponse === 'string' ? body.linkResponse.trim() : ''].filter(Boolean).join('. ');
  const herCheck = await checkHerAnswers({ latest: herNow, earlier: reconstructionCorrections, ack: safetyAckOf((rawBody as { safetyAck?: unknown }).safetyAck), moderate });
  if (!herCheck.allowed) return withHeaders(okResult(safetyBody(herCheck.level)), cookieHeaders);

  const client = getOpenAIClient();
  if (!client) {
    return withHeaders(errorResult(503, 'not_configured', 'The Dream Reflection backend is missing OPENAI_API_KEY.'), cookieHeaders);
  }

  if (resolved.identity.kind === 'trial') {
    const state = await getTrialAttemptState(attemptId, resolved.identity.trialId);
    if (state === null) {
      return withHeaders(errorResult(503, 'not_configured', 'Reflection usage tracking is not configured.'), cookieHeaders);
    }
    if (state === 'consumed_elsewhere') {
      return withHeaders(errorResult(403, 'free_dream_used', FREE_DREAM_USED_MESSAGE), cookieHeaders);
    }
  }

  const reservation = await reserveReflectionAttempt(attemptId, resolved.identity);
  if (reservation === null) {
    return withHeaders(errorResult(503, 'not_configured', 'Reflection usage tracking is not configured.'), cookieHeaders);
  }
  if (reservation === 'rejected') {
    return withHeaders(
      errorResult(403, 'limit_reached', 'This dream has already used its reflection attempts, or the attempt is invalid.'),
      cookieHeaders,
    );
  }

  const linkResponse = boundedText(body.linkResponse, 2000);
  const extras: ReflectionInputExtras = {
    associationQuestion: boundedText(body.associationQuestion, 300) || undefined,
    // The answer only counts together with the question it answers.
    linkQuestion: linkResponse ? boundedText(body.linkQuestion, 300) || undefined : undefined,
    linkResponse: linkResponse && boundedText(body.linkQuestion, 300) ? linkResponse : undefined,
    wholeViewShown: boundedText(body.wholeViewShown, 3000) || undefined,
    questionsAsked: Array.isArray(body.questionsAsked) ? body.questionsAsked.map((x) => boundedText(x, 300)).filter(Boolean).slice(0, 12) : undefined,
    momentAnswers: parseMomentAnswers(body.momentAnswers),
  };
  const depth: DreamDepth = computeDreamDepth(dreamAnalysis);
  const input = buildReflectionInput(dreamAnalysis, selectedElement, reflectionResponse, reconstructionCorrections, emotions, language, extras);

  // Everything the dreamer themselves wrote — quoting it in another script
  // is legitimate, so it's the context the language-integrity check excuses.
  const dreamerText = [dreamAnalysis.sourceText, selectedElement, reflectionResponse, extras.linkResponse ?? '', ...reconstructionCorrections].join('\n');
  const addressPreference = await resolveAddressPreference(resolved.identity, requestHeaders);

  try {
    const outcome = await generateDreamReflection(client, { input, language, addressPreference, dreamerText, emotions });
    if (outcome.status !== 'ok') {
      await refundReflectionAttempt(attemptId);
      return withHeaders(
        errorResult(
          502,
          'invalid_response',
          outcome.status === 'language_intrusion'
            ? 'The AI response did not stay in the required language.'
            : 'The AI response was not valid JSON matching the expected DreamReflectionResult schema.',
        ),
        cookieHeaders,
      );
    }
    const validated = finalizeDeliveredReflection(outcome.value, { emotions, language, depth, dreamerText, summary: dreamAnalysis.summary });
    // DARE's words are checked before they are shown; not passing, or moderation down, = not delivered (the attempt is returned).
    if (!(await dareWordsSafe(validated, moderate))) {
      await refundReflectionAttempt(attemptId);
      return withHeaders(errorResult(502, 'invalid_response', 'The reflection could not be completed.'), cookieHeaders);
    }

    // THE completion point of an anonymous dreamer's ONE free dream: the
    // grounded reflection is generated and about to be delivered. Marked
    // atomically server-side BEFORE it is returned; if a concurrent attempt
    // (another tab) already completed the free dream, this one is discarded.
    // Fails closed: if completion can't be recorded, nothing is delivered.
    if (resolved.identity.kind === 'trial') {
      const completion = await completeTrialAttempt(attemptId, resolved.identity.trialId);
      if (completion !== 'completed') {
        await refundReflectionAttempt(attemptId);
        return completion === 'consumed'
          ? withHeaders(errorResult(403, 'free_dream_used', FREE_DREAM_USED_MESSAGE), cookieHeaders)
          : withHeaders(errorResult(503, 'not_configured', 'Reflection usage tracking is not configured.'), cookieHeaders);
      }
    }

    return withHeaders(okResult(validated), cookieHeaders);
  } catch (err) {
    await refundReflectionAttempt(attemptId);
    // DARE's AI budget ran out (2026-10-30): once, the dream's credit comes back
    const budget = await laterStepBudgetResult(err, attemptId, resolved.identity);
    if (budget) return withHeaders(budget, cookieHeaders);
    if (err instanceof OpenAI.APIError) {
      if (err.status === 401 || err.status === 403) {
        return withHeaders(errorResult(502, 'not_configured', 'The configured OPENAI_API_KEY was rejected by OpenAI.'), cookieHeaders);
      }
      if (err.status === 429) {
        return withHeaders(
          errorResult(429, 'rate_limited', 'The OpenAI API rate limit was reached. Please try again shortly.'),
          cookieHeaders,
        );
      }
      if (err.status === 402 || (typeof err.message === 'string' && /billing|quota|credit/i.test(err.message))) {
        return withHeaders(errorResult(402, 'billing_issue', 'The OpenAI account has a billing or quota issue.'), cookieHeaders);
      }
      return withHeaders(errorResult(502, 'request_failed', 'The OpenAI API request failed.'), cookieHeaders);
    }
    return withHeaders(
      errorResult(500, 'request_failed', 'An unexpected error occurred while generating the dream reflection.'),
      cookieHeaders,
    );
  }
}
