import type { AppLanguage } from '../hero/appLanguage';
import type { ConceptId } from '../hero/conceptTaxonomy';
import { getAuthHeader } from '../auth/getAccessToken';
import type { PatternReflectionApiResult, PatternReflectionErrorReason } from './patternReflectionSchema';

const KNOWN_REASONS: PatternReflectionErrorReason[] = [
  'not_configured',
  'invalid_response',
  'request_failed',
  'rate_limited',
  'billing_issue',
  'not_authenticated',
  'invalid_concept',
  'insufficient_evidence',
];

/**
 * Calls the local backend to generate (or, on a server-side cache hit,
 * simply return) one Pattern Reflection — same same-origin-proxy pattern
 * as dreamTranslationEngine.ts/dreamReflectionEngine.ts (the backend holds
 * the OpenAI key and re-verifies ownership, this only ever talks to
 * /api/pattern-reflection). Called only after patternReflectionCache.ts's
 * own direct-read cache check has already missed — see DreamArchive.tsx's
 * usePatternReflection effect for the full flow. Never fabricates a
 * reflection on failure; always returns a controlled error result.
 */
export async function fetchPatternReflection(conceptId: ConceptId, dreamIds: string[], language: AppLanguage): Promise<PatternReflectionApiResult> {
  try {
    const authHeader = await getAuthHeader();
    const res = await fetch('/api/pattern-reflection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ conceptId, dreamIds, language }),
    });

    const data: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      if (data && typeof data === 'object' && 'reason' in data && 'message' in data) {
        const errData = data as { reason: unknown; message: unknown };
        const reason =
          typeof errData.reason === 'string' && KNOWN_REASONS.includes(errData.reason as PatternReflectionErrorReason)
            ? (errData.reason as PatternReflectionErrorReason)
            : 'request_failed';
        return {
          status: 'error',
          reason,
          message: typeof errData.message === 'string' ? errData.message : `Pattern Reflection backend responded with HTTP ${res.status}.`,
        };
      }
      return { status: 'error', reason: 'request_failed', message: `Pattern Reflection backend responded with HTTP ${res.status}.` };
    }

    if (
      data &&
      typeof data === 'object' &&
      'reflection' in data &&
      'totalDreamCount' in data &&
      'synthesizedDreamCount' in data
    ) {
      const d = data as { reflection: unknown; totalDreamCount: unknown; synthesizedDreamCount: unknown };
      const r = d.reflection as Record<string, unknown> | null;
      if (
        r &&
        typeof r.whatStandsOut === 'string' &&
        typeof r.possibleThread === 'string' &&
        typeof r.question === 'string' &&
        typeof d.totalDreamCount === 'number' &&
        typeof d.synthesizedDreamCount === 'number'
      ) {
        return {
          status: 'ok',
          reflection: { whatStandsOut: r.whatStandsOut, possibleThread: r.possibleThread, question: r.question },
          totalDreamCount: d.totalDreamCount,
          synthesizedDreamCount: d.synthesizedDreamCount,
        };
      }
    }
    return { status: 'error', reason: 'invalid_response', message: 'Pattern Reflection backend returned a response that did not match the expected schema.' };
  } catch (err) {
    return {
      status: 'error',
      reason: 'request_failed',
      message: err instanceof Error ? err.message : 'Unknown network error while requesting the Pattern Reflection.',
    };
  }
}
