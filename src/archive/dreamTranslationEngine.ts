import { validateTranslations, type TranslationResult, type TranslationErrorReason, type TranslationTarget } from './dreamTranslationSchema';
import { getAuthHeader } from '../auth/getAccessToken';
import { batchTexts } from './translationBatches';

const KNOWN_REASONS: TranslationErrorReason[] = [
  'not_configured',
  'invalid_response',
  'request_failed',
  'rate_limited',
  'billing_issue',
  'empty_input',
  'not_authenticated',
  'usage_limited',
  'too_large',
  'limits_unavailable',
  'no_saved_dream',
];

/** Translates any number of texts, in order, one bounded batch at a time; the first batch that fails is the answer (no partial mix). */
export async function translateTexts(texts: string[], targetLanguage: TranslationTarget = 'en'): Promise<TranslationResult> {
  const batches = batchTexts(texts);
  if (batches.length <= 1) return translateBatch(texts, targetLanguage);
  const all: string[] = [];
  for (const batch of batches) {
    const result = await translateBatch(batch, targetLanguage);
    if (result.status !== 'ok') return result;
    all.push(...result.translations);
  }
  return { status: 'ok', translations: all };
}

/**
 * Calls the local backend for a batch of real English translations — same
 * same-origin-proxy pattern as dreamReflectionEngine.ts (the backend holds
 * the OpenAI key, this only ever talks to /api/dream-translation). Never
 * fabricates a translation on failure; always returns a controlled error
 * result instead, which DreamDetail.tsx falls back from (see its own
 * comment on what it shows while this is pending/failed).
 */
async function translateBatch(texts: string[], targetLanguage: TranslationTarget): Promise<TranslationResult> {
  try {
    const authHeader = await getAuthHeader();
    const res = await fetch('/api/dream-translation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ texts, targetLanguage }),
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
