import OpenAI, { toFile } from 'openai';
import { getOpenAIClient } from '../openaiClient.js';
import { okResult, errorResult, withHeaders, type HandlerResult } from '../httpResult.js';
import { resolveCallerIdentity, type RequestHeaders } from '../callerIdentity.js';

// Was gpt-4o-mini-transcribe. Root-caused a real production report of a
// Hebrew recording ("חלמתי שאני סופרוומן ועפתי מעל העיר.") coming back as
// Latin-transliterated gibberish ("Halamty je superwoman") even though
// `language: 'he'` was — and still is — correctly threaded through from
// LanguageContext/appLanguage.ts all the way to this call (verified: the
// client always sends the plain 'en'/'he' code, resolveLanguage() above
// re-validates it against the same allowlist regardless of what arrives,
// and the request never reaches OpenAI without an explicit language).
// Directly A/B tested both models against real Hebrew TTS audio,
// including sentences with an English loanword ("סופרוומן"/superwoman —
// exactly the kind of word that pushes a transcription model toward
// language drift): gpt-4o-mini-transcribe was measurably less reliable
// and less accurate on the loanword across repeated runs (e.g. hearing
// "סוגרת"/"סוברן"/"סוברת" for the same word run to run), while whisper-1
// consistently produced accurate, stable Hebrew script (correctly
// splitting the loanword into "סופר וומן"), with identical quality on
// English test audio. gpt-4o-mini-transcribe is optimized for low-latency
// streaming use cases, not multilingual transcription accuracy — whisper-1
// is the long-established, extensively-validated model for this.
const DEFAULT_TRANSCRIPTION_MODEL = 'whisper-1';

// A `prompt` biases the model's expected vocabulary/style — never a
// translation instruction, and the transcriptions endpoint always
// transcribes the language actually spoken regardless of this hint. Extra
// reinforcement alongside the explicit `language` parameter to further
// anchor the model to the expected script for a given language, on top of
// the already-more-reliable model switch above.
const TRANSCRIPTION_PROMPT: Record<'en' | 'he', string> = {
  he: 'תמלול של תיאור חלום בעברית.',
  en: 'Transcription of a dream description in English.',
};

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
// instead of letting the platform itself fail the request). Doubles as
// this route's cost-abuse backstop against the ~10-minute recording limit
// (see HoldToRemember.tsx's RECORDING_MAX_DURATION_MS, the real, primary
// enforcement): an upper bound on plausible audio size for that duration,
// not a proof of exact duration — a client could send less data than a
// real 10-minute recording and stay under this ceiling, which is fine,
// since the actual OpenAI transcription cost scales with the audio
// actually sent, not with a claimed duration. Never trusts any
// client-supplied duration field; nothing here even accepts one.
const MAX_AUDIO_BASE64_CHARS = 6_000_000;

// The client only ever sends 'audio/webm' or 'audio/mp4' today (see
// useDreamRecorder.ts's own mimeType negotiation) — mp3/mpeg is handled
// here defensively (found while directly A/B-testing the model switch
// above with real audio files) so any future/unexpected mimeType never
// silently mismatches the actual file bytes against a wrong extension.
function extensionFor(mimeType: string): string {
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return 'mp3';
  return 'webm';
}

export async function handleDreamTranscription(rawBody: unknown, requestHeaders: RequestHeaders): Promise<HandlerResult> {
  const resolved = await resolveCallerIdentity(requestHeaders);
  if (!resolved.ok) {
    return errorResult(resolved.status, resolved.reason, resolved.message);
  }
  const cookieHeaders = resolved.setCookieHeader ? { 'Set-Cookie': resolved.setCookieHeader } : undefined;

  const body = (rawBody ?? {}) as { audioBase64?: unknown; mimeType?: unknown; language?: unknown };

  const audioBase64 = typeof body.audioBase64 === 'string' ? body.audioBase64 : '';
  if (!audioBase64) {
    return withHeaders(errorResult(400, 'empty_input', 'audioBase64 must be a non-empty base64-encoded audio string.'), cookieHeaders);
  }
  if (audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
    return withHeaders(errorResult(413, 'request_failed', 'The recorded audio is too large to transcribe.'), cookieHeaders);
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
    return withHeaders(errorResult(400, 'invalid_response', 'audioBase64 could not be decoded.'), cookieHeaders);
  }
  if (buffer.length === 0) {
    return withHeaders(errorResult(400, 'empty_input', 'The decoded audio was empty.'), cookieHeaders);
  }

  const client = getOpenAIClient();
  if (!client) {
    return withHeaders(errorResult(503, 'not_configured', 'The Dream Transcription backend is missing OPENAI_API_KEY.'), cookieHeaders);
  }

  try {
    const file = await toFile(buffer, `dream.${extensionFor(mimeType)}`, { type: mimeType });

    const response = await client.audio.transcriptions.create({
      file,
      model: process.env.OPENAI_TRANSCRIPTION_MODEL || DEFAULT_TRANSCRIPTION_MODEL,
      language,
      prompt: TRANSCRIPTION_PROMPT[language],
    });

    const transcript = typeof response.text === 'string' ? response.text.trim() : '';
    if (!transcript) {
      return withHeaders(errorResult(502, 'invalid_response', 'The transcription provider returned no text.'), cookieHeaders);
    }

    return withHeaders(okResult({ transcript }), cookieHeaders);
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
      return withHeaders(errorResult(502, 'request_failed', 'The transcription request failed.'), cookieHeaders);
    }
    return withHeaders(errorResult(500, 'request_failed', 'An unexpected error occurred while transcribing the recording.'), cookieHeaders);
  }
}
