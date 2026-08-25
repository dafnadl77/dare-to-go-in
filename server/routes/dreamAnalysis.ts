import { Router, type Request, type Response } from 'express';
import OpenAI from 'openai';
import { getOpenAIClient } from '../openaiClient.js';
import {
  DREAM_EXTRACTION_SYSTEM_PROMPT,
  DREAM_ANALYSIS_JSON_SCHEMA,
  validateDreamAnalysis,
  type AnalysisErrorReason,
} from '../../src/hero/dreamAnalysisSchema.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

export const dreamAnalysisRouter = Router();

function sendError(res: Response, status: number, reason: AnalysisErrorReason, message: string) {
  res.status(status).json({ reason, message });
}

dreamAnalysisRouter.post('/dream-analysis', async (req: Request, res: Response) => {
  const body = req.body as { sourceText?: unknown; inputMode?: unknown };
  const sourceText = typeof body.sourceText === 'string' ? body.sourceText.trim() : '';
  const inputMode = body.inputMode === 'voice' || body.inputMode === 'text' ? body.inputMode : null;

  if (!sourceText) {
    sendError(res, 400, 'empty_input', 'sourceText must be a non-empty string.');
    return;
  }
  if (!inputMode) {
    sendError(res, 400, 'invalid_response', 'inputMode must be "text" or "voice".');
    return;
  }

  const client = getOpenAIClient();
  if (!client) {
    sendError(
      res,
      503,
      'not_configured',
      'The Dream Analysis backend is missing OPENAI_API_KEY. Set it in a server-side .env file (see .env.example).',
    );
    return;
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
      sendError(res, 502, 'invalid_response', 'The AI response was not valid JSON.');
      return;
    }

    const validated = validateDreamAnalysis(parsed);
    if (!validated) {
      sendError(res, 502, 'invalid_response', 'The AI response did not match the expected DreamAnalysis schema.');
      return;
    }

    res.status(200).json(validated);
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
    sendError(res, 500, 'request_failed', 'An unexpected error occurred while analyzing the dream.');
  }
});
