import OpenAI, { toFile } from 'openai';
import { getOpenAIClient } from '../openaiClient.js';
import { okResult, errorResult, type HandlerResult } from '../httpResult.js';

const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe';

// The only languages DARE's interface currently supports. A hint outside
// this set (or missing/malformed) falls back to English rather than
// being passed through — never let the transcription model fall back to
// unrestricted free-form language auto-detection, which is exactly what
// let a real, plain English recording come back transcribed in Russian.
const DEFAULT_LANGUAGE = 'en';

/** Strict normalization, not just an allowlist membership check — the
    client (src/hero/dreamTranscription.ts) already only ever sends the
    plain 'en'/'he' codes today, but this route is the actual security/
    correctness boundary, so it re-derives a safe value from whatever
    arrives rather than trusting the client's shape. Recognizes the
    locale-style variants a browser API could plausibly produce (he-IL,
    en-US, en-GB, underscores, 'iw' — the old ISO 639-1 code for Hebrew)
    in case any future caller ever passes one of those instead of the
    plain code, and maps anything else — missing, malformed, or a
    genuinely different language — to the deterministic 'en' fallback.
    Never returns anything outside {'en','he'}, and never triggers the
    transcription model's free-form auto-detect. */
function resolveLanguage(value: unknown): 'en' | 'he' {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (v === 'he' || v === 'iw' || v.startsWith('he-') || v.startsWith('he_')) return 'he';
  if (v === 'en' || v.startsWith('en-') || v.startsWith('en_')) return 'en';
  return DEFAULT_LANGUAGE;
}

// Comfortably under Vercel's ~4.5MB serverless request body ceiling once
// base64's ~33% overhead is accounted for (real dream recordings — a
// spoken minute or two of opus/webm voice audio — are a small fraction
// of this; this exists to reject something wildly oversized cleanly
// instead of letting the platform itself fail the request).
const MAX_AUDIO_BASE64_CHARS = 6_000_000;

function extensionFor(mimeType: string): string {
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
}

export async function handleDreamTranscription(rawBody: unknown): Promise<HandlerResult> {
  const body = (rawBody ?? {}) as { audioBase64?: unknown; mimeType?: unknown; language?: unknown };

  const audioBase64 = typeof body.audioBase64 === 'string' ? body.audioBase64 : '';
  if (!audioBase64) {
    return errorResult(400, 'empty_input', 'audioBase64 must be a non-empty base64-encoded audio string.');
  }
  if (audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
    return errorResult(413, 'request_failed', 'The recorded audio is too large to transcribe.');
  }

  const mimeType = typeof body.mimeType === 'string' && body.mimeType.startsWith('audio/') ? body.mimeType : 'audio/webm';
  // A hint for the model's accuracy, never a translation instruction —
  // the transcriptions endpoint always returns text in the language
  // actually spoken, regardless of this value. Always a concrete,
  // allowlisted value (see resolveLanguage) — never omitted, so the
  // request is never left to freely auto-detect between unrelated
  // languages just because the client sent something unexpected.
  const language = resolveLanguage(body.language);

  let buffer: Buffer;
  try {
    buffer = Buffer.from(audioBase64, 'base64');
  } catch {
    return errorResult(400, 'invalid_response', 'audioBase64 could not be decoded.');
  }
  if (buffer.length === 0) {
    return errorResult(400, 'empty_input', 'The decoded audio was empty.');
  }

  const client = getOpenAIClient();
  if (!client) {
    return errorResult(503, 'not_configured', 'The Dream Transcription backend is missing OPENAI_API_KEY.');
  }

  try {
    const file = await toFile(buffer, `dream.${extensionFor(mimeType)}`, { type: mimeType });

    const response = await client.audio.transcriptions.create({
      file,
      model: process.env.OPENAI_TRANSCRIPTION_MODEL || DEFAULT_TRANSCRIPTION_MODEL,
      language,
    });

    const transcript = typeof response.text === 'string' ? response.text.trim() : '';
    if (!transcript) {
      return errorResult(502, 'invalid_response', 'The transcription provider returned no text.');
    }

    return okResult({ transcript });
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
      return errorResult(502, 'request_failed', 'The transcription request failed.');
    }
    return errorResult(500, 'request_failed', 'An unexpected error occurred while transcribing the recording.');
  }
}
