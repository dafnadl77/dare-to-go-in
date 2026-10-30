import OpenAI from 'openai';
import { getOpenAIClient } from '../openaiClient.js';
import { okResult, errorResult, withHeaders, type HandlerResult } from '../httpResult.js';
import type { ReconstructionBrief } from '../../src/hero/reconstructionBrief.js';
import { type RequestHeaders } from '../callerIdentity.js';
import { resolveAdultCaller } from '../ageGate.js';
import { reserveImageAttempt, refundImageAttempt, getTrialAttemptState } from '../dreamAttempts.js';
import { laterStepBudgetResult } from '../budgetExhausted.js';
import { FREE_DREAM_USED_MESSAGE } from '../trialAllowance.js';

/**
 * The image model: the server setting OPENAI_IMAGE_MODEL (Vercel), so a model OpenAI retires is replaced without a code change.
 * Without the setting: gpt-image-2.5-flare, OpenAI's recommended replacement (gpt-image-1 was shut down on 2026-10-23 and answers
 * "The model does not exist"; gpt-image-1.5 and gpt-image-1-mini shut down on 2026-12-01). The size, quality, format and the
 * response (data[0].b64_json) are the same for it.
 */
export const DEFAULT_IMAGE_MODEL = 'gpt-image-2.5-flare';
export function imageModel(env: Record<string, string | undefined> = process.env): string {
  const set = env.OPENAI_IMAGE_MODEL?.trim();
  return set && /^[\w.-]{1,60}$/.test(set) ? set : DEFAULT_IMAGE_MODEL;
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

/**
 * One line in the server log for every image that was not made (2026-10-28: production images failed and the log said nothing).
 * Codes only: never the dream, the prompt, the provider's message or any key.
 */
export function imageFailureLine(stage: string, err?: unknown): string {
  const e = err instanceof OpenAI.APIError ? err : null;
  const safe = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/[^\w.-]/g, '').slice(0, 60) : 'none');
  const name = err instanceof Error ? safe(err.name) : 'none';
  return `dream_image_failed stage=${safe(stage)} status=${safe(e?.status)} code=${safe(e?.code)} type=${safe(e?.type)} param=${safe(e?.param)} model=${safe(imageModel())} error=${name}`;
}

export async function handleDreamImage(rawBody: unknown, requestHeaders: RequestHeaders): Promise<HandlerResult> {
  const resolved = await resolveAdultCaller(requestHeaders);
  if (!resolved.ok) {
    console.error(imageFailureLine(`identity_${resolved.reason}`));
    return errorResult(resolved.status, resolved.reason, resolved.message);
  }
  const cookieHeaders = resolved.setCookieHeader ? { 'Set-Cookie': resolved.setCookieHeader } : undefined;

  const body = (rawBody ?? {}) as { reconstructionBrief?: unknown; attemptId?: unknown };

  if (!isPlausibleBrief(body.reconstructionBrief)) {
    console.error(imageFailureLine('brief_shape'));
    return withHeaders(
      errorResult(400, 'invalid_response', 'reconstructionBrief is missing or does not match the expected shape.'),
      cookieHeaders,
    );
  }
  const brief = body.reconstructionBrief;

  const attemptId = typeof body.attemptId === 'string' ? body.attemptId : '';
  if (!attemptId) {
    console.error(imageFailureLine('no_attempt'));
    return withHeaders(errorResult(400, 'invalid_response', 'attemptId is required.'), cookieHeaders);
  }

  const client = getOpenAIClient();
  if (!client) {
    console.error(imageFailureLine('no_api_key'));
    return withHeaders(errorResult(503, 'not_configured', 'The Dream Image backend is missing OPENAI_API_KEY.'), cookieHeaders);
  }

  // An anonymous trial whose ONE free dream was already completed (by another
  // attempt/tab) gets no further paid work on its leftover attempts.
  if (resolved.identity.kind === 'trial') {
    const state = await getTrialAttemptState(attemptId, resolved.identity.trialId);
    if (state === null) {
      return withHeaders(errorResult(503, 'not_configured', 'Image usage tracking is not configured.'), cookieHeaders);
    }
    if (state === 'consumed_elsewhere') {
      return withHeaders(errorResult(403, 'free_dream_used', FREE_DREAM_USED_MESSAGE), cookieHeaders);
    }
  }

  // Atomically checks ownership of attemptId AND the max-3 cap AND reserves
  // the slot in one statement (see server/dreamAttempts.ts / the
  // reserve_image_attempt migration) — this happens BEFORE the OpenAI call,
  // never after, so a rejected/unowned/exhausted attempt never reaches
  // OpenAI at all.
  const reservation = await reserveImageAttempt(attemptId, resolved.identity);
  if (reservation === null) {
    console.error(imageFailureLine('reserve_unavailable'));
    return withHeaders(errorResult(503, 'not_configured', 'Image usage tracking is not configured.'), cookieHeaders);
  }
  if (reservation === 'rejected') {
    console.error(imageFailureLine('reserve_rejected'));
    return withHeaders(
      errorResult(403, 'limit_reached', 'This dream has already used its image generation attempts, or the attempt is invalid.'),
      cookieHeaders,
    );
  }

  const prompt = `${brief.imagePrompt}\n\nAdditional constraints (must follow): ${brief.negativePrompt}`;

  const startedAt = Date.now();
  try {
    const response = await client.images.generate({
      model: imageModel(),
      prompt,
      size: '1536x1024',
      quality: 'medium',
      n: 1,
      output_format: 'jpeg',
    });

    const image = response.data?.[0];
    if (!image?.b64_json) {
      console.error(imageFailureLine('no_image_data'));
      await refundImageAttempt(attemptId);
      return withHeaders(errorResult(502, 'invalid_response', 'The image provider returned no image data.'), cookieHeaders);
    }

    // the browser stops waiting at 90 s (IMAGE_TIMEOUT_MS): a picture that took longer reached no one, so it is said here
    const ms = Date.now() - startedAt;
    if (ms > 60_000) console.warn(`dream_image_slow ms=${ms} kb=${Math.round(image.b64_json.length / 1024)}`);
    return withHeaders(okResult({ imageDataUrl: `data:image/jpeg;base64,${image.b64_json}` }), cookieHeaders);
  } catch (err) {
    console.error(`${imageFailureLine('provider', err)} ms=${Date.now() - startedAt}`);
    // DARE's AI budget ran out (2026-10-30): the image slot and, once, the dream's credit come back; the dream stays open
    const budget = await laterStepBudgetResult(err, attemptId, resolved.identity);
    if (budget) {
      await refundImageAttempt(attemptId);
      return withHeaders(budget, cookieHeaders);
    }
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
        // Deliberately NOT refunded (concrete abuse reason): there is no
        // server-side counter of rejections, so refunding would let a caller
        // probe the provider's safety system an unbounded number of times per
        // attempt (each probe counts against OUR provider account). The slot
        // is the price of a real, evaluated request. The client is told via a
        // distinct 'content_rejected' reason so the dreamer keeps their
        // existing image and can rephrase (see HeroDream regeneration).
        return withHeaders(errorResult(422, 'content_rejected', 'The image request was rejected by content moderation.'), cookieHeaders);
      }
      await refundImageAttempt(attemptId);
      return withHeaders(errorResult(502, 'request_failed', 'The image generation request failed.'), cookieHeaders);
    }
    await refundImageAttempt(attemptId);
    return withHeaders(errorResult(500, 'request_failed', 'An unexpected error occurred while generating the dream image.'), cookieHeaders);
  }
}
