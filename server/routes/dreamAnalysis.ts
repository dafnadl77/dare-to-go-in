import OpenAI from 'openai';
import { getOpenAIClient } from '../openaiClient.js';
import { okResult, errorResult, withHeaders, type HandlerResult } from '../httpResult.js';
import { DREAM_EXTRACTION_SYSTEM_PROMPT, DREAM_ANALYSIS_JSON_SCHEMA, validateDreamAnalysis } from '../../src/hero/dreamAnalysisSchema.js';
import { collectStrings } from '../../src/hero/languageIntegrity.js';
import { runWithLanguageIntegrity } from '../languageGuard.js';
import { resolveCallerIdentity, type RequestHeaders } from '../callerIdentity.js';
import { createDreamAttempt, deleteDreamAttempt } from '../dreamAttempts.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * Core POST /api/dream-analysis logic — framework-agnostic (no Express
 * Request/Response, no Vercel types) so it can be called identically from
 * the local Express server and from the Vercel serverless function.
 */
export async function handleDreamAnalysis(rawBody: unknown, requestHeaders: RequestHeaders): Promise<HandlerResult> {
  const resolved = await resolveCallerIdentity(requestHeaders);
  if (!resolved.ok) {
    return errorResult(resolved.status, resolved.reason, resolved.message);
  }
  const cookieHeaders = resolved.setCookieHeader ? { 'Set-Cookie': resolved.setCookieHeader } : undefined;

  const body = (rawBody ?? {}) as { sourceText?: unknown; inputMode?: unknown };
  const sourceText = typeof body.sourceText === 'string' ? body.sourceText.trim() : '';
  const inputMode = body.inputMode === 'voice' || body.inputMode === 'text' ? body.inputMode : null;

  if (!sourceText) {
    return withHeaders(errorResult(400, 'empty_input', 'sourceText must be a non-empty string.'), cookieHeaders);
  }
  if (!inputMode) {
    return withHeaders(errorResult(400, 'invalid_response', 'inputMode must be "text" or "voice".'), cookieHeaders);
  }

  const client = getOpenAIClient();
  if (!client) {
    return withHeaders(
      errorResult(
        503,
        'not_configured',
        'The Dream Analysis backend is missing OPENAI_API_KEY. Set it in a server-side .env file (see .env.example).',
      ),
      cookieHeaders,
    );
  }

  // Created only once the request is genuinely about to cost real money —
  // this row is both the per-dream substrate that /api/dream-image and
  // /api/dream-reflection require an attemptId against, and the future
  // lifetime-quota counting unit (never enforced yet — see the approved
  // architecture). Deleted below if the OpenAI call itself then fails, so
  // a dream that never actually produced anything never occupies a slot.
  const attemptId = await createDreamAttempt(resolved.identity);
  if (!attemptId) {
    return withHeaders(errorResult(503, 'not_configured', 'Could not start a new dream attempt.'), cookieHeaders);
  }

  try {
    const outcome = await runWithLanguageIntegrity(
      async (retryNote) => {
        const response = await client.responses.create({
          model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
          instructions: DREAM_EXTRACTION_SYSTEM_PROMPT + retryNote,
          input: sourceText,
          text: {
            format: {
              type: 'json_schema',
              name: 'dream_analysis',
              schema: DREAM_ANALYSIS_JSON_SCHEMA,
              strict: true,
            },
          },
        });
        try {
          return validateDreamAnalysis(JSON.parse(response.output_text));
        } catch {
          return null;
        }
      },
      (analysis) => collectStrings(analysis),
      // Dream analysis mirrors the dream's own language (no single "active
      // language"), so only the dream's own scripts are excused.
      { route: 'dream-analysis', language: null, context: sourceText },
    );
    if (outcome.status !== 'ok') {
      await deleteDreamAttempt(attemptId);
      return withHeaders(
        errorResult(
          502,
          'invalid_response',
          outcome.status === 'language_intrusion'
            ? 'The AI response did not stay in the dream\'s language.'
            : 'The AI response was not valid JSON matching the expected DreamAnalysis schema.',
        ),
        cookieHeaders,
      );
    }

    return withHeaders(okResult({ ...outcome.value, attemptId }), cookieHeaders);
  } catch (err) {
    await deleteDreamAttempt(attemptId);
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
    return withHeaders(errorResult(500, 'request_failed', 'An unexpected error occurred while analyzing the dream.'), cookieHeaders);
  }
}
