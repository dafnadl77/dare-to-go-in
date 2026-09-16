import OpenAI from 'openai';
import { getOpenAIClient } from '../openaiClient.js';
import { okResult, errorResult, withHeaders, type HandlerResult } from '../httpResult.js';
import type { ReconstructionBrief } from '../../src/hero/reconstructionBrief.js';
import { resolveCallerIdentity, type RequestHeaders } from '../callerIdentity.js';
import { reserveImageAttempt, refundImageAttempt } from '../dreamAttempts.js';

const IMAGE_MODEL = 'gpt-image-1';

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

export async function handleDreamImage(rawBody: unknown, requestHeaders: RequestHeaders): Promise<HandlerResult> {
  const resolved = await resolveCallerIdentity(requestHeaders);
  if (!resolved.ok) {
    return errorResult(resolved.status, resolved.reason, resolved.message);
  }
  const cookieHeaders = resolved.setCookieHeader ? { 'Set-Cookie': resolved.setCookieHeader } : undefined;

  const body = (rawBody ?? {}) as { reconstructionBrief?: unknown; attemptId?: unknown };

  if (!isPlausibleBrief(body.reconstructionBrief)) {
    return withHeaders(
      errorResult(400, 'invalid_response', 'reconstructionBrief is missing or does not match the expected shape.'),
      cookieHeaders,
    );
  }
  const brief = body.reconstructionBrief;

  const attemptId = typeof body.attemptId === 'string' ? body.attemptId : '';
  if (!attemptId) {
    return withHeaders(errorResult(400, 'invalid_response', 'attemptId is required.'), cookieHeaders);
  }

  const client = getOpenAIClient();
  if (!client) {
    return withHeaders(errorResult(503, 'not_configured', 'The Dream Image backend is missing OPENAI_API_KEY.'), cookieHeaders);
  }

  // Atomically checks ownership of attemptId AND the max-3 cap AND reserves
  // the slot in one statement (see server/dreamAttempts.ts / the
  // reserve_image_attempt migration) — this happens BEFORE the OpenAI call,
  // never after, so a rejected/unowned/exhausted attempt never reaches
  // OpenAI at all.
  const reservation = await reserveImageAttempt(attemptId, resolved.identity);
  if (reservation === null) {
    return withHeaders(errorResult(503, 'not_configured', 'Image usage tracking is not configured.'), cookieHeaders);
  }
  if (reservation === 'rejected') {
    return withHeaders(
      errorResult(403, 'limit_reached', 'This dream has already used its image generation attempts, or the attempt is invalid.'),
      cookieHeaders,
    );
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
      await refundImageAttempt(attemptId);
      return withHeaders(errorResult(502, 'invalid_response', 'The image provider returned no image data.'), cookieHeaders);
    }

    return withHeaders(okResult({ imageDataUrl: `data:image/jpeg;base64,${image.b64_json}` }), cookieHeaders);
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      if (err.status === 401 || err.status === 403) {
        await refundImageAttempt(attemptId);
        return withHeaders(errorResult(502, 'not_configured', 'The configured OPENAI_API_KEY was rejected by OpenAI.'), cookieHeaders);
      }
      if (err.status === 429) {
        await refundImageAttempt(attemptId);
        return withHeaders(
          errorResult(429, 'rate_limited', 'The image provider rate limit was reached. Please try again shortly.'),
          cookieHeaders,
        );
      }
      if (err.status === 402 || (typeof err.message === 'string' && /billing|quota|credit/i.test(err.message))) {
        await refundImageAttempt(attemptId);
        return withHeaders(errorResult(402, 'billing_issue', 'The OpenAI account has a billing or quota issue.'), cookieHeaders);
      }
      if (typeof err.message === 'string' && /safety|moderation|content policy/i.test(err.message)) {
        // NOT refunded — content moderation is a real, evaluated outcome
        // of the reservation actually being used, not an infra fault.
        return withHeaders(errorResult(422, 'invalid_response', 'The image request was rejected by content moderation.'), cookieHeaders);
      }
      await refundImageAttempt(attemptId);
      return withHeaders(errorResult(502, 'request_failed', 'The image generation request failed.'), cookieHeaders);
    }
    await refundImageAttempt(attemptId);
    return withHeaders(errorResult(500, 'request_failed', 'An unexpected error occurred while generating the dream image.'), cookieHeaders);
  }
}
