import OpenAI from 'openai';
import { getExtrasOpenAIClient, extrasModel } from '../openaiClient.js';
import { okResult, errorResult, type HandlerResult } from '../httpResult.js';
import {
  buildDreamTranslationSystemPrompt,
  DREAM_TRANSLATION_JSON_SCHEMA,
  validateTranslations,
  type TranslationTarget,
} from '../../src/archive/dreamTranslationSchema.js';
import { runWithLanguageIntegrity } from '../languageGuard.js';
import { type RequestHeaders } from '../callerIdentity.js';
import { resolveAdultCaller } from '../ageGate.js';
import { realModerate } from '../safety/moderation.js';
import { dareWordsSafe } from '../safety/routeSafety.js';
import { isBudgetExhausted } from '../budgetExhausted.js';
import {
  accountHasSavedDream,
  checkDuplicateTranslation,
  checkExtrasAllowance,
  databaseExtrasStore,
  translationPolicy,
  TRANSLATE_MAX_OUTPUT_TOKENS,
  TRANSLATE_MAX_TEXT_CHARS,
  TRANSLATE_MAX_TEXTS,
  TRANSLATE_MAX_TOTAL_CHARS,
  type ExtrasDecision,
  type ExtrasStore,
} from '../extrasLimits.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

/** Everything the route reaches outside itself, so tests can stand in for each (no network, no AI, no database). */
export interface TranslationDeps {
  resolveCaller: typeof resolveAdultCaller;
  openai: () => Pick<OpenAI, 'responses'> | null;
  store: ExtrasStore;
  hasSavedDream: (ownerId: string) => Promise<boolean | null>;
  moderate: typeof realModerate;
  env: Record<string, string | undefined>;
}

export const realTranslationDeps: TranslationDeps = {
  // the identity check with the 18+ check (ageGate.ts), exactly as before
  resolveCaller: (headers) => resolveAdultCaller(headers),
  openai: getExtrasOpenAIClient,
  store: databaseExtrasStore,
  hasSavedDream: accountHasSavedDream,
  moderate: realModerate,
  env: process.env,
};

function refused(decision: Exclude<ExtrasDecision, { allowed: true }>): HandlerResult {
  const message =
    decision.reason === 'limits_unavailable'
      ? 'Translation is not available right now.'
      : 'The translation allowance for now has been used. The original text is shown.';
  const result = errorResult(decision.status, decision.reason, message);
  return { ...result, headers: { ...(result.headers ?? {}), 'Retry-After': String(decision.retryAfterSeconds) } };
}

/** Archive-only and always reached post-sign-in in the real UI, so this route requires a genuinely authenticated user; an anonymous
    trial identity is not enough (there is no such thing as an anonymous archive).
    2026-11-08: bounded. Size caps first, then "an account with a saved dream", then the duplicate guard and the allowance
    (extrasLimits.ts) — all BEFORE any AI call; a refusal is never a model call. */
export async function handleDreamTranslation(rawBody: unknown, requestHeaders: RequestHeaders, deps: TranslationDeps = realTranslationDeps): Promise<HandlerResult> {
  const resolved = await deps.resolveCaller(requestHeaders);
  if (!resolved.ok) {
    return errorResult(resolved.status, resolved.reason, resolved.message);
  }
  if (resolved.identity.kind !== 'user') {
    return errorResult(401, 'not_authenticated', 'Dream translation requires a signed-in account.');
  }
  const ownerId = resolved.identity.userId;

  const body = (rawBody ?? {}) as { texts?: unknown; targetLanguage?: unknown };
  const target: TranslationTarget = body.targetLanguage === 'he' ? 'he' : 'en';
  const texts = Array.isArray(body.texts) ? body.texts.filter((t): t is string => typeof t === 'string' && t.trim().length > 0) : [];

  if (texts.length === 0) {
    return errorResult(400, 'empty_input', 'texts must be a non-empty array of strings.');
  }
  const totalChars = texts.reduce((n, t) => n + t.length, 0);
  if (texts.length > TRANSLATE_MAX_TEXTS || texts.some((t) => t.length > TRANSLATE_MAX_TEXT_CHARS) || totalChars > TRANSLATE_MAX_TOTAL_CHARS) {
    return errorResult(413, 'too_large', 'Too much text to translate at once.');
  }

  const client = deps.openai();
  if (!client) {
    return errorResult(503, 'not_configured', 'The Dream Translation backend is missing OPENAI_API_KEY.');
  }

  const hasDream = await deps.hasSavedDream(ownerId);
  if (hasDream === null) return refused({ allowed: false, status: 503, reason: 'limits_unavailable', retryAfterSeconds: 60, scope: 'store' });
  if (!hasDream) return errorResult(403, 'no_saved_dream', 'Translation is for the dreams saved in this account.');

  const duplicate = await checkDuplicateTranslation(deps.store, ownerId, target, texts);
  if (!duplicate.allowed) return refused(duplicate);
  const allowance = await checkExtrasAllowance(deps.store, translationPolicy(deps.env), ownerId, totalChars);
  if (!allowance.allowed) return refused(allowance);

  const input = `PASSAGES TO TRANSLATE, IN ORDER:
${texts.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;

  try {
    const outcome = await runWithLanguageIntegrity(
      async (retryNote) => {
        const response = await client.responses.create({
          model: extrasModel(DEFAULT_MODEL),
          store: false,
          max_output_tokens: TRANSLATE_MAX_OUTPUT_TOKENS,
          instructions: buildDreamTranslationSystemPrompt(target) + retryNote,
          input,
          text: {
            format: {
              type: 'json_schema',
              name: 'dream_translations',
              schema: DREAM_TRANSLATION_JSON_SCHEMA,
              strict: true,
            },
          },
        });
        try {
          return validateTranslations(JSON.parse(response.output_text), texts.length);
        } catch {
          return null;
        }
      },
      (translations) => translations,
      // Output in the target language; the source passages are the dreamer's
      // own text, so scripts they use are excused (only unrelated ones are
      // intrusions).
      { route: 'dream-translation', language: target, context: texts.join('\n') },
    );
    if (outcome.status !== 'ok') {
      return errorResult(
        502,
        'invalid_response',
        outcome.status === 'language_intrusion'
          ? 'The AI response did not stay in the required language.'
          : 'The AI response was not valid JSON matching the expected translations schema.',
      );
    }

    // Checked before shown (DARE's own check + moderation); not passing, or moderation down, = not shown.
    if (!(await dareWordsSafe(outcome.value, deps.moderate, 'retelling'))) return errorResult(502, 'invalid_response', 'The translation could not be completed.');
    return okResult({ translations: outcome.value });
  } catch (err) {
    // The extras' budget ran out (its own project's hard limit, or the shared one): not retried by the browser, original text shown.
    if (isBudgetExhausted(err)) return refused({ allowed: false, status: 429, reason: 'usage_limited', retryAfterSeconds: 3600, scope: 'site' });
    if (err instanceof OpenAI.APIError) {
      if (err.status === 401 || err.status === 403) {
        return errorResult(502, 'not_configured', 'The configured OPENAI_API_KEY was rejected by OpenAI.');
      }
      if (err.status === 429) {
        return errorResult(429, 'rate_limited', 'The OpenAI API rate limit was reached. Please try again shortly.');
      }
      if (err.status === 402 || (typeof err.message === 'string' && /billing|quota|credit/i.test(err.message))) {
        return errorResult(402, 'billing_issue', 'The OpenAI account has a billing or quota issue.');
      }
      return errorResult(502, 'request_failed', 'The OpenAI API request failed.');
    }
    return errorResult(500, 'request_failed', 'An unexpected error occurred while translating the dream.');
  }
}
