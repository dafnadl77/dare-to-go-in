import { dreamInputSourceText, type DreamInput } from './dreamInput';
import { validateDreamAnalysis, type AnalysisResult } from './dreamAnalysisSchema';

export type {
  DreamPerson,
  DreamPlace,
  DreamObject,
  DreamAction,
  DreamEmotion,
  SensoryDetails,
  DreamRelationship,
  DreamSequenceStep,
  ReconstructionFoundation,
  DreamAnalysis,
  AnalysisErrorReason,
  AnalysisResult,
} from './dreamAnalysisSchema';
export { DREAM_EXTRACTION_SYSTEM_PROMPT, validateDreamAnalysis } from './dreamAnalysisSchema';

/**
 * The Dream Analysis service boundary. Calls the local backend
 * (`/api/dream-analysis`, proxied by Vite in dev) which holds the real
 * OpenAI API key server-side — that key must never live in this frontend
 * bundle. Never fabricates a DreamAnalysis: any failure becomes a
 * controlled error result instead.
 */
export async function analyzeDream(dreamInput: DreamInput): Promise<AnalysisResult> {
  const sourceText = dreamInputSourceText(dreamInput).trim();
  if (!sourceText) {
    return {
      status: 'error',
      reason: 'empty_input',
      message: 'No dream text is available yet to analyze (empty typed text, or voice transcript not yet connected).',
    };
  }

  try {
    const res = await fetch('/api/dream-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceText, inputMode: dreamInput.inputMode }),
    });

    const data: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      if (data && typeof data === 'object' && 'reason' in data && 'message' in data) {
        const errData = data as { reason: unknown; message: unknown };
        const knownReasons = ['not_configured', 'invalid_response', 'request_failed', 'empty_input', 'rate_limited', 'billing_issue'];
        const reason = typeof errData.reason === 'string' && knownReasons.includes(errData.reason) ? errData.reason : 'request_failed';
        return {
          status: 'error',
          reason: reason as AnalysisResult extends { reason: infer R } ? R : never,
          message: typeof errData.message === 'string' ? errData.message : `Analysis backend responded with HTTP ${res.status}.`,
        };
      }
      return { status: 'error', reason: 'request_failed', message: `Analysis backend responded with HTTP ${res.status}.` };
    }

    const validated = validateDreamAnalysis(data);
    if (!validated) {
      return {
        status: 'error',
        reason: 'invalid_response',
        message: 'Analysis backend returned a response that did not match the expected DreamAnalysis schema.',
      };
    }
    return { status: 'ok', analysis: validated };
  } catch (err) {
    return {
      status: 'error',
      reason: 'request_failed',
      message: err instanceof Error ? err.message : 'Unknown network error while requesting dream analysis.',
    };
  }
}
