import { paidFetch } from '../auth/paidFetch';
import { getAuthHeader } from '../auth/getAccessToken';
import { interpretTranscriptionResponse, interpretTranscriptionThrow, type TranscriptionResult } from './transcriptionResult';

export type { TranscriptionErrorReason, TranscriptionResult } from './transcriptionResult';

/**
 * Calls the local backend to turn a recorded dream clip into text — the
 * backend holds the OpenAI key, this only ever talks to the same-origin
 * proxy (mirrors dreamReflectionEngine.ts's exact shape/pattern). Never
 * fabricates a transcript on failure; always returns a controlled error
 * result instead, naming the stage that failed (see transcriptionResult.ts).
 */

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unexpected FileReader result reading the recorded audio.'));
        return;
      }
      // result is a data: URL ("data:audio/webm;base64,AAAA...") — the
      // server only wants the base64 payload itself.
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read the recorded audio.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * @param audioBlob the finished MediaRecorder clip.
 * @param language the app's current language ('en' | 'he', from
 *   appLanguage.ts's getAppLanguage()) — a hint to the transcription
 *   model for accuracy, never a translation instruction. The spoken
 *   language is what comes back, always. Always sent as one of exactly
 *   these two values — the server re-validates against the same
 *   allowlist regardless, but the client never leaves this to guesswork.
 * @param signal lets the caller cancel an in-flight request (a deliberate
 *   Close, or the caller's own timeout).
 */
export async function transcribeDreamAudio(
  audioBlob: Blob,
  language: 'en' | 'he',
  signal?: AbortSignal,
): Promise<TranscriptionResult> {
  if (audioBlob.size === 0) {
    return { status: 'error', reason: 'empty_input', message: 'The recording was empty.' };
  }

  let audioBase64: string;
  try {
    audioBase64 = await blobToBase64(audioBlob);
  } catch (err) {
    return {
      status: 'error',
      reason: 'request_failed',
      message: err instanceof Error ? err.message : 'Could not read the recorded audio.',
    };
  }

  try {
    const authHeader = await getAuthHeader();
    const res = await paidFetch('/api/dream-transcription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ audioBase64, mimeType: audioBlob.type || 'audio/webm', language }),
      signal,
    });

    const data: unknown = await res.json().catch(() => null);
    return interpretTranscriptionResponse(res.status, data);
  } catch (err) {
    return interpretTranscriptionThrow(err);
  }
}
