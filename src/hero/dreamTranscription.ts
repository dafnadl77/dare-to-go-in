/**
 * Calls the local backend to turn a recorded dream clip into text — the
 * backend holds the OpenAI key, this only ever talks to the same-origin
 * proxy (mirrors dreamReflectionEngine.ts's exact shape/pattern). Never
 * fabricates a transcript on failure; always returns a controlled error
 * result instead.
 */
export type TranscriptionErrorReason =
  | 'not_configured'
  | 'invalid_response'
  | 'request_failed'
  | 'empty_input'
  | 'rate_limited'
  | 'billing_issue';

export type TranscriptionResult =
  | { status: 'ok'; transcript: string }
  | { status: 'error'; reason: TranscriptionErrorReason; message: string };

const KNOWN_REASONS: TranscriptionErrorReason[] = [
  'not_configured',
  'invalid_response',
  'request_failed',
  'empty_input',
  'rate_limited',
  'billing_issue',
];

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
 * @param language the app's current 2-letter language ('en' | 'he') — a
 *   hint to the transcription model for accuracy, never a translation
 *   instruction. The spoken language is what comes back, always.
 * @param signal lets the caller cancel an in-flight request (a deliberate
 *   Close, or the caller's own timeout).
 */
export async function transcribeDreamAudio(
  audioBlob: Blob,
  language: string | null,
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
    const res = await fetch('/api/dream-transcription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64, mimeType: audioBlob.type || 'audio/webm', language }),
      signal,
    });

    const data: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      if (data && typeof data === 'object' && 'reason' in data && 'message' in data) {
        const errData = data as { reason: unknown; message: unknown };
        const reason =
          typeof errData.reason === 'string' && KNOWN_REASONS.includes(errData.reason as TranscriptionErrorReason)
            ? (errData.reason as TranscriptionErrorReason)
            : 'request_failed';
        return {
          status: 'error',
          reason,
          message: typeof errData.message === 'string' ? errData.message : `Transcription backend responded with HTTP ${res.status}.`,
        };
      }
      return { status: 'error', reason: 'request_failed', message: `Transcription backend responded with HTTP ${res.status}.` };
    }

    const transcript =
      data && typeof data === 'object' && 'transcript' in data && typeof (data as { transcript: unknown }).transcript === 'string'
        ? (data as { transcript: string }).transcript.trim()
        : '';
    if (!transcript) {
      return { status: 'error', reason: 'invalid_response', message: 'Transcription backend returned no text.' };
    }
    return { status: 'ok', transcript };
  } catch (err) {
    return {
      status: 'error',
      reason: 'request_failed',
      message: err instanceof Error ? err.message : 'Unknown network error while transcribing the recording.',
    };
  }
}
