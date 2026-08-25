import { Router, type Request, type Response } from 'express';
import OpenAI from 'openai';
import { getOpenAIClient } from '../openaiClient.js';
import type { AnalysisErrorReason } from '../../src/hero/dreamAnalysisSchema.js';
import type { ReconstructionBrief } from '../../src/hero/reconstructionBrief.js';

const IMAGE_MODEL = 'gpt-image-1';

export const dreamImageRouter = Router();

function sendError(res: Response, status: number, reason: AnalysisErrorReason, message: string) {
  res.status(status).json({ reason, message });
}

/**
 * Shallow structural check of an untrusted ReconstructionBrief body —
 * enough to reject garbage before it reaches the prompt builder / OpenAI,
 * without duplicating the full DreamAnalysis validator.
 */
function isPlausibleBrief(candidate: unknown): candidate is ReconstructionBrief {
  if (typeof candidate !== 'object' || candidate === null) return false;
  const c = candidate as Record<string, unknown>;
  return (
    typeof c.imagePrompt === 'string' &&
    c.imagePrompt.trim().length > 0 &&
    typeof c.negativePrompt === 'string' &&
    typeof c.setting === 'object' &&
    c.setting !== null &&
    Array.isArray(c.people) &&
    Array.isArray(c.actions)
  );
}

dreamImageRouter.post('/dream-image', async (req: Request, res: Response) => {
  const body = req.body as { reconstructionBrief?: unknown };

  if (!isPlausibleBrief(body.reconstructionBrief)) {
    sendError(res, 400, 'invalid_response', 'reconstructionBrief is missing or does not match the expected shape.');
    return;
  }
  const brief = body.reconstructionBrief;

  const client = getOpenAIClient();
  if (!client) {
    sendError(res, 503, 'not_configured', 'The Dream Image backend is missing OPENAI_API_KEY.');
    return;
  }

  const prompt = `${brief.imagePrompt}\n\nAdditional constraints (must follow): ${brief.negativePrompt}`;

  try {
    const response = await client.images.generate({
      model: IMAGE_MODEL,
      prompt,
      size: '1536x1024',
      quality: 'medium',
      n: 1,
      output_format: 'jpeg',
    });

    const image = response.data?.[0];
    if (!image?.b64_json) {
      sendError(res, 502, 'invalid_response', 'The image provider returned no image data.');
      return;
    }

    res.status(200).json({ imageDataUrl: `data:image/jpeg;base64,${image.b64_json}` });
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      if (err.status === 401 || err.status === 403) {
        sendError(res, 502, 'not_configured', 'The configured OPENAI_API_KEY was rejected by OpenAI.');
        return;
      }
      if (err.status === 429) {
        sendError(res, 429, 'rate_limited', 'The image provider rate limit was reached. Please try again shortly.');
        return;
      }
      if (err.status === 402 || (typeof err.message === 'string' && /billing|quota|credit/i.test(err.message))) {
        sendError(res, 402, 'billing_issue', 'The OpenAI account has a billing or quota issue.');
        return;
      }
      if (typeof err.message === 'string' && /safety|moderation|content policy/i.test(err.message)) {
        sendError(res, 422, 'invalid_response', 'The image request was rejected by content moderation.');
        return;
      }
      sendError(res, 502, 'request_failed', 'The image generation request failed.');
      return;
    }
    sendError(res, 500, 'request_failed', 'An unexpected error occurred while generating the dream image.');
  }
});
