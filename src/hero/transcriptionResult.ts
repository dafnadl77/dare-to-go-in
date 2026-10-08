/**
 * What came back from the transcription step, named by the stage that failed. Pure (no browser objects, no Supabase), so the
 * mapping from "what the network and the server did" to "what to tell the dreamer" is tested directly.
 *
 *   free_dream_used / credits_required / not_authenticated / limit_reached   the server refused (sign-in, credit or allowance)
 *   too_large                      the recording is too big to upload (HTTP 413)
 *   network / timeout              the upload did not reach the server / did not finish in time
 *   rate_limited / billing_issue / not_configured / request_failed / invalid_response   the service side
 */
export type TranscriptionErrorReason =
  | 'not_configured'
  | 'invalid_response'
  | 'request_failed'
  | 'empty_input'
  | 'rate_limited'
  | 'billing_issue'
  | 'not_authenticated'
  | 'free_dream_used'
  | 'credits_required'
  | 'limit_reached'
  | 'too_large'
  | 'network'
  | 'timeout';

export type TranscriptionResult =
  | { status: 'ok'; transcript: string }
  | { status: 'error'; reason: TranscriptionErrorReason; message: string };

/** The reasons a server answer may carry (everything else becomes request_failed). */
const SERVER_REASONS: readonly TranscriptionErrorReason[] = [
  'not_configured',
  'invalid_response',
  'request_failed',
  'empty_input',
  'rate_limited',
  'billing_issue',
  'not_authenticated',
  'free_dream_used',
  'credits_required',
  'limit_reached',
];

/** A completed HTTP exchange: its status and its body (null when the body was not JSON). */
export function interpretTranscriptionResponse(status: number, data: unknown): TranscriptionResult {
  if (status >= 200 && status < 300) {
    const transcript =
      data && typeof data === 'object' && 'transcript' in data && typeof (data as { transcript: unknown }).transcript === 'string'
        ? (data as { transcript: string }).transcript.trim()
        : '';
    if (!transcript) return { status: 'error', reason: 'invalid_response', message: 'Transcription backend returned no text.' };
    return { status: 'ok', transcript };
  }
  // Too large for the platform: the server answers 413 itself, and the platform answers 413 without our JSON.
  if (status === 413) return { status: 'error', reason: 'too_large', message: 'The recording is too large to upload.' };
  if (data && typeof data === 'object' && 'reason' in data && 'message' in data) {
    const errData = data as { reason: unknown; message: unknown };
    const reason =
      typeof errData.reason === 'string' && (SERVER_REASONS as readonly string[]).includes(errData.reason)
        ? (errData.reason as TranscriptionErrorReason)
        : 'request_failed';
    return {
      status: 'error',
      reason,
      message: typeof errData.message === 'string' ? errData.message : `Transcription backend responded with HTTP ${status}.`,
    };
  }
  return { status: 'error', reason: 'request_failed', message: `Transcription backend responded with HTTP ${status}.` };
}

/** The request itself threw: the caller's own deadline aborts it (AbortError); anything else is the upload not reaching the server. */
export function interpretTranscriptionThrow(err: unknown): TranscriptionResult {
  const aborted = err instanceof Error && err.name === 'AbortError';
  return {
    status: 'error',
    reason: aborted ? 'timeout' : 'network',
    message: err instanceof Error ? err.message : 'Unknown network error while transcribing the recording.',
  };
}
