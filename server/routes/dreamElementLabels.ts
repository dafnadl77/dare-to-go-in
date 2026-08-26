import { Router, type Request, type Response } from 'express';
import OpenAI from 'openai';
import { getOpenAIClient } from '../openaiClient.js';
import {
  DREAM_ELEMENT_LABEL_SYSTEM_PROMPT,
  DREAM_ELEMENT_LABELS_JSON_SCHEMA,
  validateElementLabels,
} from '../../src/hero/dreamElementLabelsSchema.js';
import type { AnalysisErrorReason } from '../../src/hero/dreamAnalysisSchema.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

export const dreamElementLabelsRouter = Router();

function sendError(res: Response, status: number, reason: AnalysisErrorReason, message: string) {
  res.status(status).json({ reason, message });
}

dreamElementLabelsRouter.post('/dream-element-labels', async (req: Request, res: Response) => {
  const body = req.body as { sourceText?: unknown; elements?: unknown };
  const sourceText = typeof body.sourceText === 'string' ? body.sourceText : '';
  const elements = Array.isArray(body.elements) ? body.elements.filter((e): e is string => typeof e === 'string' && e.trim().length > 0) : [];

  if (elements.length === 0) {
    sendError(res, 400, 'empty_input', 'elements must be a non-empty array of strings.');
    return;
  }

  const client = getOpenAIClient();
  if (!client) {
    sendError(res, 503, 'not_configured', 'The Dream Element Labels backend is missing OPENAI_API_KEY.');
    return;
  }

  const input = `DREAM CONTEXT (for disambiguation only — do not label this line itself): ${sourceText || '(not provided)'}

ELEMENTS TO LABEL, IN ORDER:
${elements.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;

  try {
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      instructions: DREAM_ELEMENT_LABEL_SYSTEM_PROMPT,
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

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.output_text);
    } catch {
      sendError(res, 502, 'invalid_response', 'The AI response was not valid JSON.');
      return;
    }

    const labels = validateElementLabels(parsed, elements.length);
    if (!labels) {
      sendError(res, 502, 'invalid_response', 'The AI response did not match the expected labels schema.');
      return;
    }

    res.status(200).json({ labels });
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      if (err.status === 401 || err.status === 403) {
        sendError(res, 502, 'not_configured', 'The configured OPENAI_API_KEY was rejected by OpenAI.');
        return;
      }
      if (err.status === 429) {
        sendError(res, 429, 'rate_limited', 'The OpenAI API rate limit was reached. Please try again shortly.');
        return;
      }
      if (err.status === 402 || (typeof err.message === 'string' && /billing|quota|credit/i.test(err.message))) {
        sendError(res, 402, 'billing_issue', 'The OpenAI account has a billing or quota issue.');
        return;
      }
      sendError(res, 502, 'request_failed', 'The OpenAI API request failed.');
      return;
    }
    sendError(res, 500, 'request_failed', 'An unexpected error occurred while labeling dream elements.');
  }
});
