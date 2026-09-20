import OpenAI from 'openai';
import { getOpenAIClient } from '../openaiClient.js';
import { okResult, errorResult, type HandlerResult } from '../httpResult.js';
import {
  buildDreamTranslationSystemPrompt,
  DREAM_TRANSLATION_JSON_SCHEMA,
  validateTranslations,
  type TranslationTarget,
} from '../../src/archive/dreamTranslationSchema.js';
import { runWithLanguageIntegrity } from '../languageGuard.js';
import { resolveCallerIdentity, type RequestHeaders } from '../callerIdentity.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

/** New, isolated route — does not modify dreamAnalysis/dreamReflection/
    dreamElementLabels or the OpenAI client itself, only reuses them.
    Archive-only and always reached post-sign-in in the real UI, so —
    unlike every other route here — this one requires a genuinely
    authenticated user specifically; an anonymous trial identity is not
    enough (there is no such thing as an anonymous archive). */
export async function handleDreamTranslation(rawBody: unknown, requestHeaders: RequestHeaders): Promise<HandlerResult> {
  const resolved = await resolveCallerIdentity(requestHeaders);
  if (!resolved.ok) {
    return errorResult(resolved.status, resolved.reason, resolved.message);
  }
  if (resolved.identity.kind !== 'user') {
    return errorResult(401, 'not_authenticated', 'Dream translation requires a signed-in account.');
  }

  const body = (rawBody ?? {}) as { texts?: unknown; targetLanguage?: unknown };
  const target: TranslationTarget = body.targetLanguage === 'he' ? 'he' : 'en';
  const texts = Array.isArray(body.texts) ? body.texts.filter((t): t is string => typeof t === 'string' && t.trim().length > 0) : [];

  if (texts.length === 0) {
    return errorResult(400, 'empty_input', 'texts must be a non-empty array of strings.');
  }

  const client = getOpenAIClient();
  if (!client) {
    return errorResult(503, 'not_configured', 'The Dream Translation backend is missing OPENAI_API_KEY.');
  }

  const input = `PASSAGES TO TRANSLATE, IN ORDER:
${texts.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;

  try {
    const outcome = await runWithLanguageIntegrity(
      async (retryNote) => {
        const response = await client.responses.create({
          model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
          instructions: buildDreamTranslationSystemPrompt(target) + retryNote,
          input,
          text: {
            format: {
              type: 'json_schema',
              name: 'dream_translations',
              schema: DREAM_TRANSLATION_JSON_SCHEMA,
              strict: true,
            },
          },
        });
        try {
          return validateTranslations(JSON.parse(response.output_text), texts.length);
        } catch {
          return null;
        }
      },
      (translations) => translations,
      // Output in the target language; the source passages are the dreamer's
      // own text, so scripts they use are excused (only unrelated ones are
      // intrusions).
      { route: 'dream-translation', language: target, context: texts.join('\n') },
    );
    if (outcome.status !== 'ok') {
      return errorResult(
        502,
        'invalid_response',
        outcome.status === 'language_intrusion'
          ? 'The AI response did not stay in the required language.'
          : 'The AI response was not valid JSON matching the expected translations schema.',
      );
    }

    return okResult({ translations: outcome.value });
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      if (err.status === 401 || err.status === 403) {
        return errorResult(502, 'not_configured', 'The configured OPENAI_API_KEY was rejected by OpenAI.');
      }
      if (err.status === 429) {
        return errorResult(429, 'rate_limited', 'The OpenAI API rate limit was reached. Please try again shortly.');
      }
      if (err.status === 402 || (typeof err.message === 'string' && /billing|quota|credit/i.test(err.message))) {
        return errorResult(402, 'billing_issue', 'The OpenAI account has a billing or quota issue.');
      }
      return errorResult(502, 'request_failed', 'The OpenAI API request failed.');
    }
    return errorResult(500, 'request_failed', 'An unexpected error occurred while translating the dream.');
  }
}
