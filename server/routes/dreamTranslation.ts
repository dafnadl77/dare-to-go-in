import OpenAI from 'openai';
import { getOpenAIClient } from '../openaiClient.js';
import { okResult, errorResult, type HandlerResult } from '../httpResult.js';
import {
  DREAM_TRANSLATION_SYSTEM_PROMPT,
  DREAM_TRANSLATION_JSON_SCHEMA,
  validateTranslations,
} from '../../src/archive/dreamTranslationSchema.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

/** New, isolated route — does not modify dreamAnalysis/dreamReflection/
    dreamElementLabels or the OpenAI client itself, only reuses them. */
export async function handleDreamTranslation(rawBody: unknown): Promise<HandlerResult> {
  const body = (rawBody ?? {}) as { texts?: unknown };
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
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      instructions: DREAM_TRANSLATION_SYSTEM_PROMPT,
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

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.output_text);
    } catch {
      return errorResult(502, 'invalid_response', 'The AI response was not valid JSON.');
    }

    const translations = validateTranslations(parsed, texts.length);
    if (!translations) {
      return errorResult(502, 'invalid_response', 'The AI response did not match the expected translations schema.');
    }

    return okResult({ translations });
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
