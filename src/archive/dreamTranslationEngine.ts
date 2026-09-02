import { validateTranslations, type TranslationResult, type TranslationErrorReason } from './dreamTranslationSchema';

const KNOWN_REASONS: TranslationErrorReason[] = ['not_configured', 'invalid_response', 'request_failed', 'rate_limited', 'billing_issue', 'empty_input'];

/**
 * Calls the local backend for a batch of real English translations — same
 * same-origin-proxy pattern as dreamReflectionEngine.ts (the backend holds
 * the OpenAI key, this only ever talks to /api/dream-translation). Never
 * fabricates a translation on failure; always returns a controlled error
 * result instead, which DreamDetail.tsx falls back from (see its own
 * comment on what it shows while this is pending/failed).
 */
export async function translateTexts(texts: string[]): Promise<TranslationResult> {
  try {
    const res = await fetch('/api/dream-translation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts }),
    });

    const data: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      if (data && typeof data === 'object' && 'reason' in data && 'message' in data) {
        const errData = data as { reason: unknown; message: unknown };
        const reason =
          typeof errData.reason === 'string' && KNOWN_REASONS.includes(errData.reason as TranslationErrorReason)
            ? (errData.reason as TranslationErrorReason)
            : 'request_failed';
        return {
          status: 'error',
          reason,
          message: typeof errData.message === 'string' ? errData.message : `Translation backend responded with HTTP ${res.status}.`,
        };
      }
      return { status: 'error', reason: 'request_failed', message: `Translation backend responded with HTTP ${res.status}.` };
    }

    const translations = validateTranslations(data, texts.length);
    if (!translations) {
      return { status: 'error', reason: 'invalid_response', message: 'Translation backend returned a response that did not match the expected schema.' };
    }
    return { status: 'ok', translations };
  } catch (err) {
    return {
      status: 'error',
      reason: 'request_failed',
      message: err instanceof Error ? err.message : 'Unknown network error while requesting the dream translation.',
    };
  }
}
