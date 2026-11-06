import { dreamInAccount } from '../dreamAccess.js';
import { openDreamPayload } from '../../src/hero/dreamJourneyRecord.js';
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
import { type RequestHeaders, type ResolveCallerResult } from '../callerIdentity.js';
import { resolveAdultCaller } from '../ageGate.js';
import { realModerate, type Moderate } from '../safety/moderation.js';
import { checkDreamText, dareWordsSafe, safetyBody } from '../safety/routeSafety.js';
import { safetyAckOf } from '../../src/hero/safety/journeySafety.js';
import {
  createAttemptForIdentity,
  abandonAttempt,
  startUserAttemptIdempotent,
  completeUserAnalysis,
  completeAnalysisOpenDream,
} from '../dreamAttempts.js';
import { analysisBudgetResult } from '../budgetExhausted.js';
import { startAnalysisAttempt, type AnalysisStartDeps } from '../analysisStart.js';
import { freeDreamGrantedNow } from '../freeDream.js';
import { guestDreamsAllowed, SIGN_IN_REQUIRED_MESSAGE, SIGN_IN_REQUIRED_REASON } from '../guestPolicy.js';
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
        store: false,
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
  resolveIdentity: (headers: RequestHeaders) => Promise<ResolveCallerResult>;
  getClient: () => OpenAI | null;
  start: AnalysisStartDeps;
  abandon: typeof abandonAttempt;
  complete: typeof completeUserAnalysis;
  runModel: (client: OpenAI, sourceText: string) => ReturnType<typeof runAnalysisModel>;
  /** true = the account's one free dream was given just now (see freeDream.ts). Optional: without it nothing is settled. */
  settleFreeDream?: (userId: string, cookieHeader: string | null | undefined) => Promise<boolean>;
  /** Whether a guest (cookie) may start a new dream. Default: the DARE_GUEST_DREAMS setting, which keeps that closed. */
  guestsAllowed?: () => boolean;
  /** The second safety layer (moderation.ts). Default: the real service. */
  moderate?: Moderate;
  /** The analysis recorded and the dream's row written, in one transaction. Absent in tests of the older path. */
  completeAndOpen?: typeof completeAnalysisOpenDream;
  /** Is the dream still in this account (dreamAccess.ts). Default: the real check. */
  dreamAccess?: typeof dreamInAccount;
}

const realDeps: DreamAnalysisDeps = {
  resolveIdentity: (h) => resolveAdultCaller(h),
  getClient: getOpenAIClient,
  start: {
    startLegacy: createAttemptForIdentity,
    startIdempotent: startUserAttemptIdempotent,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
  abandon: abandonAttempt,
  complete: completeUserAnalysis,
  completeAndOpen: completeAnalysisOpenDream,
  runModel: runAnalysisModel,
  settleFreeDream: freeDreamGrantedNow,
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

  // Starting a NEW dream needs an account: a guest cookie (which can still finish a dream already in progress through image, labels and
  // reflection) can no longer create the attempt everything else hangs on. Refused before anything is read or any model is called.
  if (resolved.identity.kind === 'trial' && !(deps.guestsAllowed ?? guestDreamsAllowed)()) {
    return withHeaders(errorResult(401, SIGN_IN_REQUIRED_REASON, SIGN_IN_REQUIRED_MESSAGE), cookieHeaders);
  }

  const body = (rawBody ?? {}) as { sourceText?: unknown; inputMode?: unknown; idempotencyKey?: unknown; language?: unknown };
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

  // The distress path (doc 106/109), before any credit, attempt or model: a dream is a dream unless it says it is real life now.
  const moderate = deps.moderate ?? realModerate;
  const herCheck = await checkDreamText(sourceText, safetyAckOf((rawBody as { safetyAck?: unknown } | null)?.safetyAck), moderate);
  if (!herCheck.allowed) return withHeaders(okResult(safetyBody(herCheck.level)), cookieHeaders);

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
  let started = await startAnalysisAttempt(resolved.identity, idempotencyKey, inputHash, deps.start);
  // A signed-in account that has no credit may still be owed its ONE free dream (decided once, in the database, from the request's own
  // signed guest cookie). Only when that decision has JUST given it the credit does the start run once more; otherwise nothing changes.
  if (started.kind === 'refused' && started.reason === 'credits_required' && resolved.identity.kind === 'user' && deps.settleFreeDream) {
    if (await deps.settleFreeDream(resolved.identity.userId, requestHeaders.cookie)) {
      started = await startAnalysisAttempt(resolved.identity, idempotencyKey, inputHash, deps.start);
    }
  }

  if (started.kind === 'replay') {
    // Already analyzed (e.g. the client timed out but the server finished): hand back the SAME attempt and
    // result. No credit is spent and the model is NOT called again.
    // A replay never writes a dream: the analysis wrote its row when it completed, so a row that is missing is a dream she deleted, and an
    // old key can never bring it back.
    if (resolved.identity.kind === 'user') {
      const access = await (deps.dreamAccess ?? dreamInAccount)(started.attemptId, resolved.identity.userId);
      if (access === 'missing') return withHeaders(errorResult(409, 'analysis_expired', 'The earlier analysis of this dream is no longer available.'), cookieHeaders);
      if (access === 'unavailable') return withHeaders(errorResult(503, 'temporarily_unavailable', TEMPORARILY_UNAVAILABLE_MESSAGE), cookieHeaders);
    }
    return withHeaders(okResult({ ...started.analysis, attemptId: started.attemptId, dreamOpened: resolved.identity.kind === 'user' }), cookieHeaders);
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

    // What comes back is checked before it is shown (her own dream text, already checked above, is not read again). Not passing, or
    // moderation being down, is an ordinary failure: the attempt is released, as for any failed analysis.
    if (!(await dareWordsSafe({ ...outcome.value, sourceText: '' }, moderate, 'retelling'))) {
      await deps.abandon(resolved.identity, attemptId);
      return withHeaders(errorResult(502, 'invalid_response', 'The analysis could not be completed.'), cookieHeaders);
    }

    // Record the result on its attempt so a retry of the same submission returns it instead of paying again.
    if (idempotent && resolved.identity.kind === 'user') {
      // The dream is in her account from here on, even if she closes the page now, in the same transaction that completes the analysis. An
      // attempt that was given up on and refunded never becomes a dream as well.
      const payload = openDreamPayload({ sourceText, inputMode, analysis: outcome.value, language: body.language === 'en' ? 'en' : 'he' });
      const opened = deps.completeAndOpen ? await deps.completeAndOpen(attemptId, resolved.identity.userId, outcome.value, payload) : await deps.complete(attemptId, resolved.identity.userId, outcome.value);
      if (opened !== true) {
        console.error(`dream_analysis_result_not_recorded attempt_id=${attemptId}`);
        // false: the attempt is closed, its credit settled (abandoning it again changes nothing). null: nothing is known, so nothing is undone:
        // the same key finds the dream if it was written, and the stale job returns the credit if it was not.
        if (opened === false) await deps.abandon(resolved.identity, attemptId);
        return withHeaders(errorResult(503, 'temporarily_unavailable', TEMPORARILY_UNAVAILABLE_MESSAGE), cookieHeaders);
      }
      return withHeaders(okResult({ ...outcome.value, attemptId, dreamOpened: true }), cookieHeaders);
    }

    return withHeaders(okResult({ ...outcome.value, attemptId }), cookieHeaders);
  } catch (err) {
    await deps.abandon(resolved.identity, attemptId);
    // DARE's AI budget ran out (2026-10-30): the credit came back with the abandoned attempt, as for any failure here
    const budget = analysisBudgetResult(err);
    if (budget) return withHeaders(budget, cookieHeaders);
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
