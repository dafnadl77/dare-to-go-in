import OpenAI from 'openai';
import { getOpenAIClient } from '../openaiClient.js';
import { okResult, errorResult, withHeaders, type HandlerResult } from '../httpResult.js';
import {
  buildDreamElementLabelSystemPrompt,
  DREAM_ELEMENT_LABELS_JSON_SCHEMA,
  validateElementLabels,
} from '../../src/hero/dreamElementLabelsSchema.js';
import { buildLabelRepairNote, findLabelProblems, normalizeLabel } from '../../src/hero/dreamElementLabelQuality.js';
import { containsHebrew, type AppLanguage } from '../../src/hero/appLanguage.js';
import { momentLabelRules } from '../../src/hero/explorationSchema.js';
import { checkLabel } from '../../src/hero/claimCheck.js';
import { runWithLanguageIntegrity } from '../languageGuard.js';
import { type RequestHeaders } from '../callerIdentity.js';
import { resolveAdultCaller } from '../ageGate.js';
import { realModerate } from '../safety/moderation.js';
import { dareWordsSafe } from '../safety/routeSafety.js';
import { reserveLabelsAttempt, refundLabelsAttempt, getTrialAttemptState } from '../dreamAttempts.js';
import { laterStepBudgetResult } from '../budgetExhausted.js';
import { FREE_DREAM_USED_MESSAGE } from '../trialAllowance.js';
import { handleDreamQuestions } from './dreamQuestions.js';
import { explorationModeOf, handleExploration } from './dreamExploration.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

export async function handleDreamElementLabels(rawBody: unknown, requestHeaders: RequestHeaders): Promise<HandlerResult> {
  // Questions written for the dream share this endpoint (the serverless function limit leaves no room for another one).
  if (typeof rawBody === 'object' && rawBody !== null && (rawBody as { mode?: unknown }).mode === 'questions') {
    return handleDreamQuestions(rawBody, requestHeaders);
  }
  // The multi-moment journey's question for a newly chosen moment (see dreamExploration.ts).
  const explorationMode = explorationModeOf(rawBody, ['moment-question']);
  if (explorationMode) return handleExploration(explorationMode, rawBody, requestHeaders);
  const resolved = await resolveAdultCaller(requestHeaders);
  if (!resolved.ok) {
    return errorResult(resolved.status, resolved.reason, resolved.message);
  }
  const cookieHeaders = resolved.setCookieHeader ? { 'Set-Cookie': resolved.setCookieHeader } : undefined;

  const body = (rawBody ?? {}) as { sourceText?: unknown; elements?: unknown; language?: unknown; attemptId?: unknown; purpose?: unknown };
  const sourceText = typeof body.sourceText === 'string' ? body.sourceText : '';
  const elements = Array.isArray(body.elements) ? body.elements.filter((e): e is string => typeof e === 'string' && e.trim().length > 0) : [];
  // Defaults to English for any caller that doesn't send it (e.g. an
  // older cached client) — matches the pre-bilingual behavior exactly.
  const language: AppLanguage = body.language === 'he' ? 'he' : 'en';
  // The dream map's moments (whole events of the dream): the same labels call with the moment rules added, then the code check.
  const moments = body.purpose === 'moments';

  if (elements.length === 0) {
    return withHeaders(errorResult(400, 'empty_input', 'elements must be a non-empty array of strings.'), cookieHeaders);
  }

  const client = getOpenAIClient();
  if (!client) {
    return withHeaders(errorResult(503, 'not_configured', 'The Dream Element Labels backend is missing OPENAI_API_KEY.'), cookieHeaders);
  }

  // An anonymous trial can only ask for labels for a dream it has really
  // started: the call must name its own attempt, the attempt's free dream must
  // still be open, and each attempt gets a small fixed number of label calls —
  // this is never an independently callable, unlimited AI endpoint. The same
  // holds for a signed-in account: it must name an attempt IT owns (one that
  // already spent a credit), so a zero-credit account cannot use this route as a
  // free AI endpoint.
  const attemptId = typeof body.attemptId === 'string' ? body.attemptId : '';
  if (!attemptId) {
    return withHeaders(errorResult(400, 'invalid_response', 'attemptId is required.'), cookieHeaders);
  }
  if (resolved.identity.kind === 'trial') {
    const state = await getTrialAttemptState(attemptId, resolved.identity.trialId);
    if (state === null) {
      return withHeaders(errorResult(503, 'not_configured', 'Label usage tracking is not configured.'), cookieHeaders);
    }
    if (state === 'consumed_elsewhere') {
      return withHeaders(errorResult(403, 'free_dream_used', FREE_DREAM_USED_MESSAGE), cookieHeaders);
    }
  }
  const reservation = await reserveLabelsAttempt(attemptId, resolved.identity);
  if (reservation === null) {
    return withHeaders(errorResult(503, 'not_configured', 'Label usage tracking is not configured.'), cookieHeaders);
  }
  if (reservation === 'rejected') {
    return withHeaders(errorResult(403, 'limit_reached', 'This dream has already used its label requests, or the attempt is invalid.'), cookieHeaders);
  }
  const reservedLabels = true;

  const input = `DREAM CONTEXT (for disambiguation only — do not label this line itself): ${sourceText || '(not provided)'}

ELEMENTS TO LABEL, IN ORDER:
${elements.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;

  const instructions = buildDreamElementLabelSystemPrompt(language) + (moments ? momentLabelRules(language) : '');
  // A moment label is checked against the moment's own words only when both are in the same language (a translated label cannot be).
  const checkMoments = (labels: string[]) => {
    if (!moments || containsHebrew(sourceText) !== (language === 'he')) return labels;
    const used: string[] = [];
    return labels.map((label, i) => {
      const checked = checkLabel(label, elements[i], used, sourceText);
      used.push(checked);
      return checked;
    });
  };

  try {
    const outcome = await runWithLanguageIntegrity(
      async (retryNote) => {
        const generate = async (note: string): Promise<string[] | null> => {
          const response = await client.responses.create({
            model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
            store: false,
            instructions: instructions + retryNote + note,
            input,
            text: {
              format: {
                type: 'json_schema',
                name: 'dream_element_labels',
                schema: DREAM_ELEMENT_LABELS_JSON_SCHEMA,
                strict: true,
              },
            },
          });
          try {
            const labels = validateElementLabels(JSON.parse(response.output_text), elements.length);
            return labels ? labels.map((l, i) => normalizeLabel(l) || elements[i]) : null;
          } catch {
            return null;
          }
        };

        const first = await generate('');
        if (!first) return null;
        const rejected = first
          .map((label, i) => ({ position: i + 1, index: i, phrase: elements[i], label, problems: findLabelProblems(label, language) }))
          .filter((r) => r.problems.length > 0);
        if (rejected.length === 0) return first;

        // One repair pass for just the rejected labels. Whatever is still
        // unacceptable after it is not shown as a non-label: a wrong-script
        // label falls back to the dream's own phrase; anything else keeps the
        // repaired wording.
        const second = await generate(buildLabelRepairNote(rejected, language));
        return first.map((label, i) => {
          if (!rejected.some((r) => r.index === i)) return label;
          const candidate = second?.[i] ?? label;
          const problems = findLabelProblems(candidate, language);
          return problems.includes('wrong_script') ? elements[i] : candidate;
        });
      },
      (labels) => labels,
      { route: 'dream-element-labels', language, context: [sourceText, ...elements].join('\n') },
    );
    if (outcome.status !== 'ok') {
      if (reservedLabels) await refundLabelsAttempt(attemptId);
      return withHeaders(
        errorResult(
          502,
          'invalid_response',
          outcome.status === 'language_intrusion'
            ? 'The AI response did not stay in the required language.'
            : 'The AI response was not valid JSON matching the expected labels schema.',
        ),
        cookieHeaders,
      );
    }

    const labels = checkMoments(outcome.value);
    // Checked before shown (DARE's own check + moderation); not passing, or moderation down, = not shown.
    if (!(await dareWordsSafe(labels, realModerate, 'retelling'))) {
      if (reservedLabels) await refundLabelsAttempt(attemptId);
      return withHeaders(errorResult(502, 'invalid_response', 'The labels could not be completed.'), cookieHeaders);
    }
    return withHeaders(okResult({ labels }), cookieHeaders);
  } catch (err) {
    if (reservedLabels) await refundLabelsAttempt(attemptId);
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
    return withHeaders(errorResult(500, 'request_failed', 'An unexpected error occurred while labeling dream elements.'), cookieHeaders);
  }
}
