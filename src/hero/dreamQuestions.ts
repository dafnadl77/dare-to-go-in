import { paidFetch } from '../auth/paidFetch';
import { getAuthHeader } from '../auth/getAccessToken';
import type { AppLanguage } from './appLanguage';
import { LABELS_TIMEOUT_MS } from './requestTimeouts';
import { factsFromAnalysis, type DreamQuestionsResult } from './dreamQuestionsSchema';
import type { DreamAnalysis } from './dreamAnalysisSchema';

/**
 * Asks the backend for questions written for THIS dream, one pair per selectable moment (see dreamQuestionsSchema.ts). It runs in
 * the background while the picture is being made, so the dreamer never waits for it. This is purely an enhancement: on ANY failure
 * it returns { status: 'error' } and the journey keeps the fixed questions it always had. Nothing is invented on failure.
 */
export async function getDreamQuestions(
  analysis: DreamAnalysis,
  moments: string[],
  attemptId: string,
  language: AppLanguage,
): Promise<DreamQuestionsResult> {
  try {
    const authHeader = await getAuthHeader();
    const res = await paidFetch(
      '/api/dream-element-labels',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          mode: 'questions',
          sourceText: analysis.sourceText,
          elements: moments,
          facts: factsFromAnalysis(analysis),
          language,
          attemptId,
        }),
      },
      { timeoutMs: LABELS_TIMEOUT_MS },
    );
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok || typeof data !== 'object' || data === null) return { status: 'error' };
    const d = data as Record<string, unknown>;
    const isList = (v: unknown): v is string[] => Array.isArray(v) && v.length === moments.length && v.every((x) => typeof x === 'string');
    if (!isList(d.associationQuestions) || !isList(d.linkQuestions)) return { status: 'error' };
    return { status: 'ok', questions: { associationQuestions: d.associationQuestions, linkQuestions: d.linkQuestions } };
  } catch {
    return { status: 'error' };
  }
}
