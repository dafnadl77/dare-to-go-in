import OpenAI from 'openai';
import { getOpenAIClient } from '../openaiClient.js';
import { okResult, errorResult, withHeaders, type HandlerResult } from '../httpResult.js';
import { validateDreamAnalysis, type DreamAnalysis } from '../../src/hero/dreamAnalysisSchema.js';
import {
  buildDreamReflectionSystemPrompt,
  DREAM_REFLECTION_JSON_SCHEMA,
  getGroundingStatement,
  validateDreamReflectionResult,
} from '../../src/hero/dreamReflectionSchema.js';
import type { AppLanguage } from '../../src/hero/appLanguage.js';
import { collectStrings } from '../../src/hero/languageIntegrity.js';
import { runWithLanguageIntegrity } from '../languageGuard.js';
import { resolveCallerIdentity, type RequestHeaders } from '../callerIdentity.js';
import { reserveReflectionAttempt, refundReflectionAttempt } from '../dreamAttempts.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

function actionPhrase(a: DreamAnalysis['actions'][number]): string {
  return [a.subject, a.action, a.target].filter(Boolean).join(' ').trim();
}

function buildReflectionInput(
  dreamAnalysis: DreamAnalysis,
  selectedElement: string,
  reflectionResponse: string,
  reconstructionCorrections: string[],
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

THE ELEMENT THE DREAMER CHOSE AS STANDING OUT TO THEM: ${selectedElement}

THE DREAMER'S OWN ASSOCIATION WITH THAT ELEMENT (their exact words): "${reflectionResponse}"`;
}

export async function handleDreamReflection(rawBody: unknown, requestHeaders: RequestHeaders): Promise<HandlerResult> {
  const resolved = await resolveCallerIdentity(requestHeaders);
  if (!resolved.ok) {
    return errorResult(resolved.status, resolved.reason, resolved.message);
  }
  const cookieHeaders = resolved.setCookieHeader ? { 'Set-Cookie': resolved.setCookieHeader } : undefined;

  const body = (rawBody ?? {}) as {
    dreamAnalysis?: unknown;
    selectedElement?: unknown;
    reflectionResponse?: unknown;
    reconstructionCorrections?: unknown;
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
  const attemptId = typeof body.attemptId === 'string' ? body.attemptId : '';
  if (!attemptId) {
    return withHeaders(errorResult(400, 'invalid_response', 'attemptId is required.'), cookieHeaders);
  }

  const client = getOpenAIClient();
  if (!client) {
    return withHeaders(errorResult(503, 'not_configured', 'The Dream Reflection backend is missing OPENAI_API_KEY.'), cookieHeaders);
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

  const input = buildReflectionInput(dreamAnalysis, selectedElement, reflectionResponse, reconstructionCorrections);

  // Everything the dreamer themselves wrote — quoting it in another script
  // is legitimate, so it's the context the language-integrity check excuses.
  const dreamerText = [dreamAnalysis.sourceText, selectedElement, reflectionResponse, ...reconstructionCorrections].join('\n');
  const instructions = buildDreamReflectionSystemPrompt(language);

  try {
    const outcome = await runWithLanguageIntegrity(
      async (retryNote) => {
        const response = await client.responses.create({
          model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
          instructions: instructions + retryNote,
          input,
          text: {
            format: {
              type: 'json_schema',
              name: 'dream_reflection',
              schema: DREAM_REFLECTION_JSON_SCHEMA,
              strict: true,
            },
          },
        });
        try {
          return validateDreamReflectionResult(JSON.parse(response.output_text));
        } catch {
          return null;
        }
      },
      // groundingStatement is overwritten by the server below, so it isn't
      // model prose worth checking.
      (result) => collectStrings({ ...result, groundingStatement: '' }),
      { route: 'dream-reflection', language, context: dreamerText },
    );
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
    const validated = outcome.value;

    // The grounding line's exact wording/tone is safety-relevant — always
    // enforced by the server, never left to the model's own phrasing.
    validated.groundingStatement = getGroundingStatement(language);

    return withHeaders(okResult(validated), cookieHeaders);
  } catch (err) {
    await refundReflectionAttempt(attemptId);
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
