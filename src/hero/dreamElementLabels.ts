import { validateElementLabels, type ElementLabelsResult, type ElementLabelErrorReason } from './dreamElementLabelsSchema';
import { getAppLanguage, type AppLanguage } from './appLanguage';

const KNOWN_REASONS: ElementLabelErrorReason[] = ['not_configured', 'invalid_response', 'request_failed', 'rate_limited', 'billing_issue'];

/**
 * Calls the local backend for short display labels for a set of real
 * dream elements (each phrase may be in any language the dream itself was
 * described in), in the requested display language. Never fabricates
 * content — a failure returns a controlled error result so the caller can
 * fall back to the raw elements rather than block.
 */
export async function getElementLabelsInLanguage(sourceText: string, elements: string[], language: AppLanguage): Promise<ElementLabelsResult> {
  try {
    const res = await fetch('/api/dream-element-labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceText, elements, language }),
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
 * hardcoding a language at every call site. Every call site (DreamReflection
 * via HeroDream) keeps calling this one function unchanged; only this
 * function needs to know appLanguage exists at all.
 */
export async function getDisplayLabels(sourceText: string, phrases: string[]): Promise<ElementLabelsResult> {
  return getElementLabelsInLanguage(sourceText, phrases, getAppLanguage());
}
