import { validateElementLabels, type ElementLabelsResult, type ElementLabelErrorReason } from './dreamElementLabelsSchema';
import { getAppLanguage } from './appLanguage';

const KNOWN_REASONS: ElementLabelErrorReason[] = ['not_configured', 'invalid_response', 'request_failed', 'rate_limited', 'billing_issue'];

/**
 * Calls the local backend for short English display labels for a set of
 * real dream elements (in whatever language the dream itself was in).
 * Never fabricates content — a failure returns a controlled error result
 * so the caller can fall back to the raw elements rather than block.
 */
export async function getEnglishElementLabels(sourceText: string, elements: string[]): Promise<ElementLabelsResult> {
  try {
    const res = await fetch('/api/dream-element-labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceText, elements }),
    });

    const data: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      if (data && typeof data === 'object' && 'reason' in data && 'message' in data) {
        const errData = data as { reason: unknown; message: unknown };
        const reason =
          typeof errData.reason === 'string' && KNOWN_REASONS.includes(errData.reason as ElementLabelErrorReason)
            ? (errData.reason as ElementLabelErrorReason)
            : 'request_failed';
        return {
          status: 'error',
          reason,
          message: typeof errData.message === 'string' ? errData.message : `Element-labels backend responded with HTTP ${res.status}.`,
        };
      }
      return { status: 'error', reason: 'request_failed', message: `Element-labels backend responded with HTTP ${res.status}.` };
    }

    const labels = validateElementLabels(data, elements.length);
    if (!labels) {
      return { status: 'error', reason: 'invalid_response', message: 'Element-labels backend returned an unexpected response shape.' };
    }
    return { status: 'ok', labels };
  } catch (err) {
    return {
      status: 'error',
      reason: 'request_failed',
      message: err instanceof Error ? err.message : 'Unknown network error while requesting dream element labels.',
    };
  }
}

/**
 * Language-aware entry point for short display labels of real dream
 * phrases — gated on the single appLanguage abstraction rather than
 * hardcoding "translate to English" at every call site. While appLanguage
 * is 'en' this delegates to the English-translation backend above; a
 * future non-English appLanguage would branch here instead of requiring
 * changes anywhere that currently calls this function.
 */
export async function getDisplayLabels(sourceText: string, phrases: string[]): Promise<ElementLabelsResult> {
  if (getAppLanguage() === 'en') {
    return getEnglishElementLabels(sourceText, phrases);
  }
  // No other appLanguage is implemented yet — nothing to translate to.
  return { status: 'ok', labels: phrases };
}
