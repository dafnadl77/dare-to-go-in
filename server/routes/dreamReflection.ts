import OpenAI from 'openai';
import { getOpenAIClient } from '../openaiClient.js';
import { okResult, errorResult, type HandlerResult } from '../httpResult.js';
import { validateDreamAnalysis, type DreamAnalysis } from '../../src/hero/dreamAnalysisSchema.js';
import {
  DREAM_REFLECTION_SYSTEM_PROMPT,
  DREAM_REFLECTION_JSON_SCHEMA,
  GROUNDING_STATEMENT,
  validateDreamReflectionResult,
} from '../../src/hero/dreamReflectionSchema.js';

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

export async function handleDreamReflection(rawBody: unknown): Promise<HandlerResult> {
  const body = (rawBody ?? {}) as {
    dreamAnalysis?: unknown;
    selectedElement?: unknown;
    reflectionResponse?: unknown;
    reconstructionCorrections?: unknown;
  };

  const dreamAnalysis = validateDreamAnalysis(body.dreamAnalysis);
  if (!dreamAnalysis) {
    return errorResult(400, 'invalid_response', 'dreamAnalysis is missing or does not match the expected DreamAnalysis shape.');
  }
  const selectedElement = typeof body.selectedElement === 'string' ? body.selectedElement.trim() : '';
  if (!selectedElement) {
    return errorResult(400, 'empty_input', 'selectedElement must be a non-empty string.');
  }
  const reflectionResponse = typeof body.reflectionResponse === 'string' ? body.reflectionResponse.trim() : '';
  if (!reflectionResponse) {
    return errorResult(400, 'empty_input', 'reflectionResponse must be a non-empty string.');
  }
  const reconstructionCorrections = Array.isArray(body.reconstructionCorrections)
    ? body.reconstructionCorrections.filter((c): c is string => typeof c === 'string')
    : [];

  const client = getOpenAIClient();
  if (!client) {
    return errorResult(503, 'not_configured', 'The Dream Reflection backend is missing OPENAI_API_KEY.');
  }

  const input = buildReflectionInput(dreamAnalysis, selectedElement, reflectionResponse, reconstructionCorrections);

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      instructions: DREAM_REFLECTION_SYSTEM_PROMPT,
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

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.output_text);
    } catch {
      return errorResult(502, 'invalid_response', 'The AI response was not valid JSON.');
    }

    const validated = validateDreamReflectionResult(parsed);
    if (!validated) {
      return errorResult(502, 'invalid_response', 'The AI response did not match the expected DreamReflectionResult schema.');
    }

    // The grounding line's exact wording/tone is safety-relevant — always
    // enforced by the server, never left to the model's own phrasing.
    validated.groundingStatement = GROUNDING_STATEMENT;

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
    return errorResult(500, 'request_failed', 'An unexpected error occurred while generating the dream reflection.');
  }
}
