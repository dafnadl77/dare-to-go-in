import OpenAI from 'openai';
import { getOpenAIClient } from '../openaiClient.js';
import { okResult, errorResult, withHeaders, type HandlerResult } from '../httpResult.js';
import {
  buildDreamElementLabelSystemPrompt,
  DREAM_ELEMENT_LABELS_JSON_SCHEMA,
  validateElementLabels,
} from '../../src/hero/dreamElementLabelsSchema.js';
import type { AppLanguage } from '../../src/hero/appLanguage.js';
import { runWithLanguageIntegrity } from '../languageGuard.js';
import { resolveCallerIdentity, type RequestHeaders } from '../callerIdentity.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

export async function handleDreamElementLabels(rawBody: unknown, requestHeaders: RequestHeaders): Promise<HandlerResult> {
  const resolved = await resolveCallerIdentity(requestHeaders);
  if (!resolved.ok) {
    return errorResult(resolved.status, resolved.reason, resolved.message);
  }
  const cookieHeaders = resolved.setCookieHeader ? { 'Set-Cookie': resolved.setCookieHeader } : undefined;

  const body = (rawBody ?? {}) as { sourceText?: unknown; elements?: unknown; language?: unknown };
  const sourceText = typeof body.sourceText === 'string' ? body.sourceText : '';
  const elements = Array.isArray(body.elements) ? body.elements.filter((e): e is string => typeof e === 'string' && e.trim().length > 0) : [];
  // Defaults to English for any caller that doesn't send it (e.g. an
  // older cached client) — matches the pre-bilingual behavior exactly.
  const language: AppLanguage = body.language === 'he' ? 'he' : 'en';

  if (elements.length === 0) {
    return withHeaders(errorResult(400, 'empty_input', 'elements must be a non-empty array of strings.'), cookieHeaders);
  }

  const client = getOpenAIClient();
  if (!client) {
    return withHeaders(errorResult(503, 'not_configured', 'The Dream Element Labels backend is missing OPENAI_API_KEY.'), cookieHeaders);
  }

  const input = `DREAM CONTEXT (for disambiguation only — do not label this line itself): ${sourceText || '(not provided)'}

ELEMENTS TO LABEL, IN ORDER:
${elements.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;

  const instructions = buildDreamElementLabelSystemPrompt(language);

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
              name: 'dream_element_labels',
              schema: DREAM_ELEMENT_LABELS_JSON_SCHEMA,
              strict: true,
            },
          },
        });
        try {
          return validateElementLabels(JSON.parse(response.output_text), elements.length);
        } catch {
          return null;
        }
      },
      (labels) => labels,
      { route: 'dream-element-labels', language, context: [sourceText, ...elements].join('\n') },
    );
    if (outcome.status !== 'ok') {
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

    return withHeaders(okResult({ labels: outcome.value }), cookieHeaders);
  } catch (err) {
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
