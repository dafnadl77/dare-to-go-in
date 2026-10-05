import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import { getOpenAIClient } from '../openaiClient.js';
import { okResult, errorResult, withHeaders, type HandlerResult } from '../httpResult.js';
import {
  DREAM_EXTRACTION_SYSTEM_PROMPT,
  DREAM_ANALYSIS_JSON_SCHEMA,
  validateDreamAnalysis,
  finalizeDreamAnalysis,
} from '../../src/hero/dreamAnalysisSchema.js';
import { resolveAnalysisModel } from '../analysisModel.js';
import { collectStrings } from '../../src/hero/languageIntegrity.js';
import { runWithLanguageIntegrity } from '../languageGuard.js';
import { resolveCallerIdentity, type RequestHeaders } from '../callerIdentity.js';
import {
  createAttemptForIdentity,
  abandonAttempt,
  startUserAttemptIdempotent,
  completeUserAnalysis,
} from '../dreamAttempts.js';
import { startAnalysisAttempt, type AnalysisStartDeps } from '../analysisStart.js';
import { CREDITS_REQUIRED_MESSAGE, FREE_DREAM_USED_MESSAGE, TEMPORARILY_UNAVAILABLE_MESSAGE } from '../trialAllowance.js';

/** The format a client idempotency key must have (also enforced by a CHECK constraint in the database). */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export const ANALYSIS_IN_PROGRESS_MESSAGE =
  'This dream is still being analyzed. Please try again in a moment: it will not be charged again.';

/** The one model call. Throws on provider errors (the caller maps and releases the attempt). */
export async function runAnalysisModel(client: OpenAI, sourceText: string) {
  return runWithLanguageIntegrity(
    async (retryNote) => {
      const response = await client.responses.create({
        model: resolveAnalysisModel(),
        instructions: DREAM_EXTRACTION_SYSTEM_PROMPT + retryNote,
        input: sourceText,
        text: {
          format: {
            type: 'json_schema',
            name: 'dream_analysis',
            schema: DREAM_ANALYSIS_JSON_SCHEMA,
            strict: true,
          },
        },
      });
      try {
        const validated = validateDreamAnalysis(JSON.parse(response.output_text));
        // Drops the temporary explicit-elements notes, normalizes the concepts
        // (enum-checked, deduped, capped at 4) and stamps conceptVersion; every
        // other analysis field is returned exactly as before.
        return validated ? finalizeDreamAnalysis(validated) : null;
      } catch {
        return null;
      }
    },
    (analysis) => collectStrings(analysis),
    // Dream analysis mirrors the dream's own language (no single "active
    // language"), so only the dream's own scripts are excused.
    { route: 'dream-analysis', language: null, context: sourceText },
  );
}

export interface DreamAnalysisDeps {
  resolveIdentity: typeof resolveCallerIdentity;
  getClient: () => OpenAI | null;
  start: AnalysisStartDeps;
  abandon: typeof abandonAttempt;
  complete: typeof completeUserAnalysis;
  runModel: (client: OpenAI, sourceText: string) => ReturnType<typeof runAnalysisModel>;
}

const realDeps: DreamAnalysisDeps = {
  resolveIdentity: resolveCallerIdentity,
  getClient: getOpenAIClient,
  start: {
    startLegacy: createAttemptForIdentity,
    startIdempotent: startUserAttemptIdempotent,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
  abandon: abandonAttempt,
  complete: completeUserAnalysis,
  runModel: runAnalysisModel,
};

/**
 * Core POST /api/dream-analysis logic — framework-agnostic (no Express
 * Request/Response, no Vercel types) so it can be called identically from
 * the local Express server and from the Vercel serverless function.
 *
 * IDEMPOTENT PAID START (signed-in accounts that send an `idempotencyKey`): the same submitted
 * dream sent again (timeout, dropped connection, refresh, uncertain response) never spends a
 * second credit and never runs the model a second time when its result is already known — see
 * analysisStart.ts and the start_user_attempt_idem migration. The server stays authoritative:
 * the account is the verified token's user, the key is scoped to it, and it is bound to a hash of
 * the submitted text.
 */
export async function handleDreamAnalysis(
  rawBody: unknown,
  requestHeaders: RequestHeaders,
  deps: DreamAnalysisDeps = realDeps,
): Promise<HandlerResult> {
  const resolved = await deps.resolveIdentity(requestHeaders);
  if (!resolved.ok) {
    return errorResult(resolved.status, resolved.reason, resolved.message);
  }
  const cookieHeaders = resolved.setCookieHeader ? { 'Set-Cookie': resolved.setCookieHeader } : undefined;

  const body = (rawBody ?? {}) as { sourceText?: unknown; inputMode?: unknown; idempotencyKey?: unknown };
  const sourceText = typeof body.sourceText === 'string' ? body.sourceText.trim() : '';
  const inputMode = body.inputMode === 'voice' || body.inputMode === 'text' ? body.inputMode : null;

  if (!sourceText) {
    return withHeaders(errorResult(400, 'empty_input', 'sourceText must be a non-empty string.'), cookieHeaders);
  }
  if (!inputMode) {
    return withHeaders(errorResult(400, 'invalid_response', 'inputMode must be "text" or "voice".'), cookieHeaders);
  }
  // Optional (an older cached client sends none and keeps the previous behavior); when present it must be well-formed.
  let idempotencyKey: string | null = null;
  if (body.idempotencyKey !== undefined && body.idempotencyKey !== null) {
    if (typeof body.idempotencyKey !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(body.idempotencyKey)) {
      return withHeaders(errorResult(400, 'invalid_response', 'idempotencyKey is malformed.'), cookieHeaders);
    }
    idempotencyKey = body.idempotencyKey;
  }

  const client = deps.getClient();
  if (!client) {
    return withHeaders(
      errorResult(
        503,
        'not_configured',
        'The Dream Analysis backend is missing OPENAI_API_KEY. Set it in a server-side .env file (see .env.example).',
      ),
      cookieHeaders,
    );
  }

  // The attempt row is both the per-dream substrate that /api/dream-image and /api/dream-reflection
  // require an attemptId against and the unit credits are spent on. Deleted (and its credit refunded
  // exactly once, for a signed-in account) below if the analysis genuinely fails.
  // Anonymous callers: ONE completed free dream per trial identity, for life, plus a bounded number of
  // technical attempts before it completes and a global anonymous-spend breaker, all decided atomically
  // in the database before any model call (the key is deliberately not used for them: no credit exists
  // to protect, and those rules are untouched). Signed-in accounts spend ONE credit atomically with the
  // attempt and are refused with credits_required at zero.
  const inputHash = createHash('sha256').update(sourceText).digest('hex');
  const started = await startAnalysisAttempt(resolved.identity, idempotencyKey, inputHash, deps.start);

  if (started.kind === 'replay') {
    // Already analyzed (e.g. the client timed out but the server finished): hand back the SAME attempt and
    // result. No credit is spent and the model is NOT called again.
    return withHeaders(okResult({ ...started.analysis, attemptId: started.attemptId }), cookieHeaders);
  }
  if (started.kind === 'in_progress') {
    return withHeaders(errorResult(409, 'analysis_in_progress', ANALYSIS_IN_PROGRESS_MESSAGE), cookieHeaders);
  }
  if (started.kind === 'refused') {
    switch (started.reason) {
      case 'free_dream_used':
        return withHeaders(errorResult(403, 'free_dream_used', FREE_DREAM_USED_MESSAGE), cookieHeaders);
      case 'credits_required':
        return withHeaders(errorResult(402, 'credits_required', CREDITS_REQUIRED_MESSAGE), cookieHeaders);
      case 'temporarily_unavailable':
        return withHeaders(errorResult(503, 'temporarily_unavailable', TEMPORARILY_UNAVAILABLE_MESSAGE), cookieHeaders);
      case 'conflict':
        return withHeaders(errorResult(409, 'idempotency_conflict', 'That request identifier was already used for a different dream.'), cookieHeaders);
      case 'expired':
        return withHeaders(errorResult(409, 'analysis_expired', 'The earlier analysis of this dream is no longer available.'), cookieHeaders);
      case 'invalid_key':
        return withHeaders(errorResult(400, 'invalid_response', 'idempotencyKey is malformed.'), cookieHeaders);
      default:
        return withHeaders(errorResult(503, 'not_configured', 'Could not start a new dream attempt.'), cookieHeaders);
    }
  }
  const { attemptId, idempotent } = started;

  try {
    const outcome = await deps.runModel(client, sourceText);
    if (outcome.status !== 'ok') {
      await deps.abandon(resolved.identity, attemptId);
      return withHeaders(
        errorResult(
          502,
          'invalid_response',
          outcome.status === 'language_intrusion'
            ? 'The AI response did not stay in the dream\'s language.'
            : 'The AI response was not valid JSON matching the expected DreamAnalysis schema.',
        ),
        cookieHeaders,
      );
    }

    // Record the result on its attempt so a retry of the same submission returns it instead of paying again.
    if (idempotent && resolved.identity.kind === 'user') {
      const recorded = await deps.complete(attemptId, resolved.identity.userId, outcome.value);
      if (!recorded) console.error(`dream_analysis_result_not_recorded attempt_id=${attemptId}`);
    }

    return withHeaders(okResult({ ...outcome.value, attemptId }), cookieHeaders);
  } catch (err) {
    await deps.abandon(resolved.identity, attemptId);
    if (err instanceof OpenAI.APIError) {
      if (err.status === 401 || err.status === 403) {
        return withHeaders(errorResult(502, 'not_configured', 'The configured OPENAI_API_KEY was rejected by OpenAI.'), cookieHeaders);
      }
      if (err.status === 429) {
        return withHeaders(
          errorResult(429, 'rate_limited', 'The OpenAI API rate limit was reached. Please try again shortly.'),
          cookieHeaders,
        );
      }
      if (err.status === 402 || (typeof err.message === 'string' && /billing|quota|credit/i.test(err.message))) {
        return withHeaders(errorResult(402, 'billing_issue', 'The OpenAI account has a billing or quota issue.'), cookieHeaders);
      }
      return withHeaders(errorResult(502, 'request_failed', 'The OpenAI API request failed.'), cookieHeaders);
    }
    return withHeaders(errorResult(500, 'request_failed', 'An unexpected error occurred while analyzing the dream.'), cookieHeaders);
  }
}
