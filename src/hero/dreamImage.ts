import { paidFetch } from '../auth/paidFetch';
import type { ReconstructionBrief } from './reconstructionBrief';
import { getAuthHeader } from '../auth/getAccessToken';
import { IMAGE_TIMEOUT_MS } from './requestTimeouts';

export type ImageErrorReason =
  | 'not_configured'
  | 'invalid_response'
  | 'request_failed'
  | 'rate_limited'
  | 'billing_issue'
  | 'not_authenticated'
  | 'limit_reached'
  | 'content_rejected';

export type ImageResult =
  | { status: 'ok'; imageDataUrl: string }
  | { status: 'error'; reason: ImageErrorReason; message: string };

const KNOWN_REASONS: ImageErrorReason[] = [
  'not_configured',
  'invalid_response',
  'request_failed',
  'rate_limited',
  'billing_issue',
  'not_authenticated',
  'limit_reached',
  'content_rejected',
];

/**
 * Calls the local backend to generate one real dream image from a real
 * ReconstructionBrief — the backend holds the OpenAI key, this only ever
 * talks to the same-origin proxy. Never fabricates an image or a URL on
 * failure; always returns a controlled error result instead. `attemptId`
 * is the id returned by the dream's own /api/dream-analysis call (see
 * dreamAnalysis.ts) — the server rejects any image request without a
 * valid one it can charge the max-3 limit against (see
 * server/routes/dreamImage.ts).
 */
export async function generateDreamImage(brief: ReconstructionBrief, attemptId: string): Promise<ImageResult> {
  try {
    const authHeader = await getAuthHeader();
    // A timeout aborts and lands in the catch below as an ordinary request_failed.
    const res = await paidFetch(
      '/api/dream-image',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ reconstructionBrief: brief, attemptId }),
      },
      { timeoutMs: IMAGE_TIMEOUT_MS },
    );

    const data: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      if (data && typeof data === 'object' && 'reason' in data && 'message' in data) {
        const errData = data as { reason: unknown; message: unknown };
        const reason = typeof errData.reason === 'string' && KNOWN_REASONS.includes(errData.reason as ImageErrorReason)
          ? (errData.reason as ImageErrorReason)
          : 'request_failed';
        return {
          status: 'error',
          reason,
          message: typeof errData.message === 'string' ? errData.message : `Image backend responded with HTTP ${res.status}.`,
        };
      }
      return { status: 'error', reason: 'request_failed', message: `Image backend responded with HTTP ${res.status}.` };
    }

    if (data && typeof data === 'object' && 'imageDataUrl' in data && typeof (data as { imageDataUrl: unknown }).imageDataUrl === 'string') {
      return { status: 'ok', imageDataUrl: (data as { imageDataUrl: string }).imageDataUrl };
    }
    return { status: 'error', reason: 'invalid_response', message: 'Image backend returned an unexpected response shape.' };
  } catch (err) {
    return {
      status: 'error',
      reason: 'request_failed',
      message: err instanceof Error ? err.message : 'Unknown network error while requesting the dream image.',
    };
  }
}
