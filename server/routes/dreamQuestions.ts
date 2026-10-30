import OpenAI from 'openai';
import { getOpenAIClient } from '../openaiClient.js';
import { okResult, errorResult, withHeaders, type HandlerResult } from '../httpResult.js';
import {
  buildDreamQuestionsInput,
  buildDreamQuestionsSystemPrompt,
  DREAM_QUESTIONS_JSON_SCHEMA,
  questionsRetryNote,
  sanitizeDreamQuestions,
  validateDreamQuestionFacts,
  validateRawDreamQuestions,
  type DreamQuestions,
} from '../../src/hero/dreamQuestionsSchema.js';
import type { AppLanguage } from '../../src/hero/appLanguage.js';
import { collectStrings, findAddressViolation, findHebrewSlashForm } from '../../src/hero/languageIntegrity.js';
import { runWithLanguageIntegrity } from '../languageGuard.js';
import { type RequestHeaders } from '../callerIdentity.js';
import { resolveAdultCaller } from '../ageGate.js';
import { realModerate } from '../safety/moderation.js';
import { dareWordsSafe } from '../safety/routeSafety.js';
import { reserveLabelsAttempt, refundLabelsAttempt, getTrialAttemptState } from '../dreamAttempts.js';
import { laterStepBudgetResult } from '../budgetExhausted.js';
import { FREE_DREAM_USED_MESSAGE } from '../trialAllowance.js';
import { resolveAddressPreference } from './dreamReflection.js';
import { logModelUsed, resolveStageModel } from '../stageModel.js';
import type { AddressPreference } from '../../src/hero/addressPreference.js';
import type { DreamQuestionFacts } from '../../src/hero/dreamQuestionsSchema.js';

/** The most moments a dream offers (see deriveDreamElements). */
const MAX_MOMENTS = 6;

export interface GenerateQuestionsParams {
  sourceText: string;
  moments: string[];
  facts: DreamQuestionFacts;
  language: AppLanguage;
  addressPreference: AddressPreference;
  /** Reports the token usage of every model call (the quality-test script measures cost with it). */
  onUsage?: (usage: { input: number; output: number; model: string }) => void;
}

/** The model call plus every check, with no request handling around it. The route and scripts/aiJourneyEval.ts both use exactly this. */
export function generateDreamQuestions(client: OpenAI, p: GenerateQuestionsParams) {
  const instructions = buildDreamQuestionsSystemPrompt(p.language, p.addressPreference);
  const input = buildDreamQuestionsInput(p.sourceText, p.moments, p.facts);
  // The moments are the labels the dreamer sees; the dream text is the dreamer's own words.
  const context = [p.sourceText, ...p.moments].join('\n');
  return runWithLanguageIntegrity<{ raw: DreamQuestions; kept: DreamQuestions }>(
    async (retryNote) => {
      // OPENAI_QUESTIONS_MODEL is optional; unset, this uses the shared OPENAI_MODEL exactly like every other route. No other model is ever tried.
      const requestedModel = resolveStageModel('OPENAI_QUESTIONS_MODEL');
      const response = await client.responses.create({
        model: requestedModel,
        store: false,
        instructions: instructions + retryNote,
        input,
        text: {
          format: { type: 'json_schema', name: 'dream_questions', schema: DREAM_QUESTIONS_JSON_SCHEMA, strict: true },
        },
      });
      logModelUsed('dream-questions', requestedModel, response.model);
      if (response.usage) p.onUsage?.({ input: response.usage.input_tokens, output: response.usage.output_tokens, model: response.model });
      try {
        const raw = validateRawDreamQuestions(JSON.parse(response.output_text), p.moments.length);
        return raw ? { raw, kept: sanitizeDreamQuestions(raw, p.moments, p.sourceText, p.language) } : null;
      } catch {
        return null;
      }
    },
    (v) => collectStrings(v.kept),
    {
      route: 'dream-questions',
      language: p.language,
      context,
      strictLatin: true,
      extraCheck: (v) => {
        // Most moments need a usable association question; otherwise write them again (the link questions may be blank).
        const usable = v.kept.associationQuestions.filter(Boolean).length;
        if (usable < Math.ceil(p.moments.length / 2)) return questionsRetryNote(v.raw, v.kept) ?? '\n\nCORRECTION: write one association question for every moment.';
        return findAddressViolation(collectStrings(v.kept), p.language, p.addressPreference) ?? findHebrewSlashForm(collectStrings(v.kept), p.language);
      },
    },
  );
}

/**
 * Questions written for this dream (see dreamQuestionsSchema.ts). Reached through the existing /api/dream-element-labels
 * endpoint (mode 'questions'), so no new serverless function is needed, and it draws on the SAME per-dream allowance as the
 * labels (an attempt that is not the caller's own, or is used up, is refused). It is a convenience layer: any failure here means
 * the interface simply keeps its fixed questions, so a failure refunds its allowance and never blocks the journey.
 */
export async function handleDreamQuestions(rawBody: unknown, requestHeaders: RequestHeaders): Promise<HandlerResult> {
  const resolved = await resolveAdultCaller(requestHeaders);
  if (!resolved.ok) {
    return errorResult(resolved.status, resolved.reason, resolved.message);
  }
  const cookieHeaders = resolved.setCookieHeader ? { 'Set-Cookie': resolved.setCookieHeader } : undefined;

  const body = (rawBody ?? {}) as { sourceText?: unknown; elements?: unknown; language?: unknown; attemptId?: unknown; facts?: unknown };
  const sourceText = typeof body.sourceText === 'string' ? body.sourceText : '';
  const moments = (Array.isArray(body.elements) ? body.elements : [])
    .filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
    .slice(0, MAX_MOMENTS)
    .map((e) => e.trim().slice(0, 200));
  const language: AppLanguage = body.language === 'he' ? 'he' : 'en';
  const facts = validateDreamQuestionFacts(body.facts);

  if (moments.length === 0) {
    return withHeaders(errorResult(400, 'empty_input', 'elements must be a non-empty array of strings.'), cookieHeaders);
  }
  const attemptId = typeof body.attemptId === 'string' ? body.attemptId : '';
  if (!attemptId) {
    return withHeaders(errorResult(400, 'invalid_response', 'attemptId is required.'), cookieHeaders);
  }

  const client = getOpenAIClient();
  if (!client) {
    return withHeaders(errorResult(503, 'not_configured', 'The Dream Questions backend is missing OPENAI_API_KEY.'), cookieHeaders);
  }

  if (resolved.identity.kind === 'trial') {
    const state = await getTrialAttemptState(attemptId, resolved.identity.trialId);
    if (state === null) {
      return withHeaders(errorResult(503, 'not_configured', 'Question usage tracking is not configured.'), cookieHeaders);
    }
    if (state === 'consumed_elsewhere') {
      return withHeaders(errorResult(403, 'free_dream_used', FREE_DREAM_USED_MESSAGE), cookieHeaders);
    }
  }
  const reservation = await reserveLabelsAttempt(attemptId, resolved.identity);
  if (reservation === null) {
    return withHeaders(errorResult(503, 'not_configured', 'Question usage tracking is not configured.'), cookieHeaders);
  }
  if (reservation === 'rejected') {
    return withHeaders(errorResult(403, 'limit_reached', 'This dream has already used its label requests, or the attempt is invalid.'), cookieHeaders);
  }

  const addressPreference = await resolveAddressPreference(resolved.identity, requestHeaders);

  try {
    const outcome = await generateDreamQuestions(client, { sourceText, moments, facts, language, addressPreference });
    if (outcome.status !== 'ok') {
      await refundLabelsAttempt(attemptId);
      return withHeaders(errorResult(502, 'invalid_response', 'The AI response was not usable for dream questions.'), cookieHeaders);
    }
    // Checked before shown (DARE's own check + moderation); not passing, or moderation down, = not shown.
    if (!(await dareWordsSafe(outcome.value.kept, realModerate))) {
      await refundLabelsAttempt(attemptId);
      return withHeaders(errorResult(502, 'invalid_response', 'The AI response was not usable for dream questions.'), cookieHeaders);
    }
    return withHeaders(okResult(outcome.value.kept), cookieHeaders);
  } catch (err) {
    await refundLabelsAttempt(attemptId);
    // DARE's AI budget ran out (2026-10-30): once, the dream's credit comes back
    const budget = await laterStepBudgetResult(err, attemptId, resolved.identity);
    if (budget) return withHeaders(budget, cookieHeaders);
    if (err instanceof OpenAI.APIError) {
      if (err.status === 429) return withHeaders(errorResult(429, 'rate_limited', 'The OpenAI API rate limit was reached.'), cookieHeaders);
      return withHeaders(errorResult(502, 'request_failed', 'The OpenAI API request failed.'), cookieHeaders);
    }
    return withHeaders(errorResult(500, 'request_failed', 'An unexpected error occurred while writing dream questions.'), cookieHeaders);
  }
}
