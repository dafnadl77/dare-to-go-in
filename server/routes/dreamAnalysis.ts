import OpenAI from 'openai';
import { getOpenAIClient } from '../openaiClient.js';
import { okResult, errorResult, type HandlerResult } from '../httpResult.js';
import { DREAM_EXTRACTION_SYSTEM_PROMPT, DREAM_ANALYSIS_JSON_SCHEMA, validateDreamAnalysis } from '../../src/hero/dreamAnalysisSchema.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * Core POST /api/dream-analysis logic — framework-agnostic (no Express
 * Request/Response, no Vercel types) so it can be called identically from
 * the local Express server and from the Vercel serverless function.
 */
export async function handleDreamAnalysis(rawBody: unknown): Promise<HandlerResult> {
  const body = (rawBody ?? {}) as { sourceText?: unknown; inputMode?: unknown };
  const sourceText = typeof body.sourceText === 'string' ? body.sourceText.trim() : '';
  const inputMode = body.inputMode === 'voice' || body.inputMode === 'text' ? body.inputMode : null;

  if (!sourceText) {
    return errorResult(400, 'empty_input', 'sourceText must be a non-empty string.');
  }
  if (!inputMode) {
    return errorResult(400, 'invalid_response', 'inputMode must be "text" or "voice".');
  }

  const client = getOpenAIClient();
  if (!client) {
    return errorResult(
      503,
      'not_configured',
      'The Dream Analysis backend is missing OPENAI_API_KEY. Set it in a server-side .env file (see .env.example).',
    );
  }

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      instructions: DREAM_EXTRACTION_SYSTEM_PROMPT,
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

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.output_text);
    } catch {
      return errorResult(502, 'invalid_response', 'The AI response was not valid JSON.');
    }

    const validated = validateDreamAnalysis(parsed);
    if (!validated) {
      return errorResult(502, 'invalid_response', 'The AI response did not match the expected DreamAnalysis schema.');
    }

    return okResult(validated);
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
    return errorResult(500, 'request_failed', 'An unexpected error occurred while analyzing the dream.');
  }
}
