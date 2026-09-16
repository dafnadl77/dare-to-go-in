import type { DreamAnalysis } from './dreamAnalysisSchema';
import { validateDreamReflectionResult, type ReflectionResult, type ReflectionErrorReason } from './dreamReflectionSchema';
import { getAppLanguage } from './appLanguage';
import { getAuthHeader } from '../auth/getAccessToken';

const KNOWN_REASONS: ReflectionErrorReason[] = [
  'not_configured',
  'invalid_response',
  'request_failed',
  'rate_limited',
  'billing_issue',
  'not_authenticated',
  'limit_reached',
];

export interface DreamReflectionRequest {
  dreamAnalysis: DreamAnalysis;
  selectedElement: string;
  reflectionResponse: string;
  reconstructionCorrections: string[];
  /** The dream's own /api/dream-analysis attemptId — required so the
      server can enforce the max-3 reflection limit against the right
      dream (see server/routes/dreamReflection.ts). */
  attemptId: string;
}

/**
 * Calls the local backend for one grounded reflection — the backend holds
 * the OpenAI key, this only ever talks to the same-origin proxy. Never
 * fabricates a reflection on failure; always returns a controlled error
 * result instead.
 */
export async function getDreamReflection(request: DreamReflectionRequest): Promise<ReflectionResult> {
  try {
    const authHeader = await getAuthHeader();
    const res = await fetch('/api/dream-reflection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ ...request, language: getAppLanguage() }),
    });

    const data: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      if (data && typeof data === 'object' && 'reason' in data && 'message' in data) {
        const errData = data as { reason: unknown; message: unknown };
        const reason =
          typeof errData.reason === 'string' && KNOWN_REASONS.includes(errData.reason as ReflectionErrorReason)
            ? (errData.reason as ReflectionErrorReason)
            : 'request_failed';
        return {
          status: 'error',
          reason,
          message: typeof errData.message === 'string' ? errData.message : `Reflection backend responded with HTTP ${res.status}.`,
        };
      }
      return { status: 'error', reason: 'request_failed', message: `Reflection backend responded with HTTP ${res.status}.` };
    }

    const validated = validateDreamReflectionResult(data);
    if (!validated) {
      return {
        status: 'error',
        reason: 'invalid_response',
        message: 'Reflection backend returned a response that did not match the expected schema.',
      };
    }
    return { status: 'ok', reflection: validated };
  } catch (err) {
    return {
      status: 'error',
      reason: 'request_failed',
      message: err instanceof Error ? err.message : 'Unknown network error while requesting the dream reflection.',
    };
  }
}
