import OpenAI from 'openai';
import { getOpenAIClient } from '../openaiClient.js';
import { okResult, errorResult, type HandlerResult } from '../httpResult.js';
import { getSupabaseUserScopedClient } from '../supabaseUserScopedClient.js';
import { resolveCallerIdentity, type RequestHeaders } from '../callerIdentity.js';
import { runWithLanguageIntegrity } from '../languageGuard.js';
import { collectStrings } from '../../src/hero/languageIntegrity.js';
import { CONCEPTS, type ConceptId } from '../../src/hero/conceptTaxonomy.js';
import type { DreamAnalysis } from '../../src/hero/dreamAnalysisSchema.js';
import {
  buildPatternReflectionSystemPrompt,
  PATTERN_REFLECTION_JSON_SCHEMA,
  validatePatternReflectionResult,
  type PatternReflectionResult,
} from '../../src/archive/patternReflectionSchema.js';
import { buildPatternReflectionInput, type DreamEvidence } from '../../src/archive/patternReflectionInput.js';
import { findReflectionProblems, buildReflectionRepairNote } from '../../src/archive/patternReflectionQuality.js';
import { normalizeAddressPreference } from '../../src/hero/addressPreference.js';
import { runPatternReflection, type OwnedDreamForReflection, type PatternReflectionDeps } from '../patternReflectionCore.js';

const DEFAULT_MODEL = 'gpt-4o-mini';

/** Never trusted for anything but keeping one `IN (...)` query small — the
    real ownership/relevance filtering happens after the query returns
    (RLS + conceptsOfDream, see patternReflectionCore.ts). */
const MAX_REQUESTED_DREAM_IDS = 500;

function extractBearerToken(authorizationHeader: string): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  return match ? match[1].trim() || null : null;
}

interface DreamRow {
  id: string;
  created_at: string;
  payload: { dreamAnalysis: DreamAnalysis; selectedElement: string; dreamReflection: { observation: string } };
}

/**
 * Pattern Reflection — a quiet, grounded reflection on how ONE recurring
 * SEMANTIC CONCEPT (never a literal motif — see conceptTaxonomy.ts) appears
 * across at least 2 of the authenticated dreamer's own DISTINCT saved
 * dreams. Archive-only, always reached post-sign-in, so — like
 * dream-translation.ts — this requires a genuinely authenticated user; an
 * anonymous trial identity is never enough (there is no anonymous archive).
 *
 * SECURITY: never trusts the client-claimed `dreamIds` for ownership OR for
 * actually containing the requested concept. Every dream this route ever
 * reads comes back through a bearer-token-scoped Supabase client (see
 * supabaseUserScopedClient.ts) — RLS alone decides which of the requested
 * ids are genuinely this caller's own, exactly as it does for the browser's
 * own reads — and runPatternReflection() independently re-derives which of
 * those returned dreams actually contain the concept from their own stored
 * dreamAnalysis.concepts. No service-role key is ever touched by this route.
 */
export async function handlePatternReflection(rawBody: unknown, requestHeaders: RequestHeaders): Promise<HandlerResult> {
  const resolved = await resolveCallerIdentity(requestHeaders);
  if (!resolved.ok) {
    return errorResult(resolved.status, resolved.reason, resolved.message);
  }
  if (resolved.identity.kind !== 'user') {
    return errorResult(401, 'not_authenticated', 'Pattern Reflection requires a signed-in account.');
  }
  const token = requestHeaders.authorization ? extractBearerToken(requestHeaders.authorization) : null;
  if (!token) {
    // Unreachable in practice — resolveCallerIdentity already required a
    // valid bearer token to reach `kind === 'user'` — but never assume.
    return errorResult(401, 'not_authenticated', 'A valid session token is required.');
  }
  const scoped = getSupabaseUserScopedClient(token);
  if (!scoped) {
    return errorResult(503, 'not_configured', 'Pattern Reflection is missing its Supabase configuration.');
  }

  const client = getOpenAIClient();
  if (!client) {
    return errorResult(503, 'not_configured', 'The Pattern Reflection backend is missing OPENAI_API_KEY.');
  }

  // The dreamer's own explicit, optional address preference (see
  // addressPreference.ts) — read from the SAME verified user record this
  // route already has via its own scoped client, never a second table and
  // never inferred from anything else. Missing/invalid normalizes to
  // 'neutral' (normalizeAddressPreference's own default), exactly matching
  // "existing users who never chose one use Neutral."
  const { data: userData } = await scoped.auth.getUser();
  const addressPreference = normalizeAddressPreference(userData.user?.user_metadata?.addressPreference);

  const body = (rawBody ?? {}) as { conceptId?: unknown; dreamIds?: unknown; language?: unknown };
  const requestedIds = Array.isArray(body.dreamIds) ? body.dreamIds.filter((d): d is string => typeof d === 'string').slice(0, MAX_REQUESTED_DREAM_IDS) : [];

  const deps: PatternReflectionDeps = {
    async fetchOwnedDreams(dreamIds) {
      if (dreamIds.length === 0) return [];
      const { data, error } = await scoped.from('dreams').select('id, created_at, payload').in('id', dreamIds);
      if (error || !data) return [];
      return (data as DreamRow[]).map(
        (row): OwnedDreamForReflection => ({
          id: row.id,
          createdAt: row.created_at,
          dreamAnalysis: row.payload.dreamAnalysis,
          selectedElement: row.payload.selectedElement ?? '',
          dreamReflectionObservation: row.payload.dreamReflection?.observation ?? '',
        }),
      );
    },

    async getCachedReflection(key) {
      const { data, error } = await scoped
        .from('pattern_reflections')
        .select('reflection, total_dream_count, synthesized_dream_count')
        .eq('owner_id', key.ownerId)
        .eq('concept_id', key.conceptId)
        .eq('concept_version', key.conceptVersion)
        .eq('prompt_version', key.promptVersion)
        .eq('address_preference', key.addressPreference)
        .eq('dream_ids_key', key.dreamIdsKey)
        .eq('language', key.language)
        .maybeSingle();
      if (error || !data) return null;
      return {
        reflection: data.reflection as PatternReflectionResult,
        totalDreamCount: data.total_dream_count as number,
        synthesizedDreamCount: data.synthesized_dream_count as number,
      };
    },

    async generateReflection({ dreams, totalDreamCount, conceptId, language, addressPreference: pref }) {
      const concept = CONCEPTS[conceptId as ConceptId];
      const evidence: DreamEvidence[] = dreams.map((d) => ({
        id: d.id,
        createdAt: d.createdAt,
        sourceText: d.dreamAnalysis.sourceText ?? '',
        summary: d.dreamAnalysis.summary ?? '',
        emotions: (d.dreamAnalysis.emotions ?? []).map((e) => e.emotion).filter(Boolean),
        selectedElement: d.selectedElement,
        observation: d.dreamReflectionObservation,
      }));
      const input = buildPatternReflectionInput({ label: concept.en, definition: concept.definition }, evidence, totalDreamCount);
      const dreamerText = evidence.map((e) => [e.sourceText, e.selectedElement, e.observation].join('\n')).join('\n');
      const instructions = buildPatternReflectionSystemPrompt(language, pref);

      // Deterministic quality gate (see patternReflectionQuality.ts) —
      // mirrors dreamElementLabels.ts's own one-repair-pass shape exactly:
      // the repair happens INSIDE this produce callback (so it doesn't
      // consume one of runWithLanguageIntegrity's own script-intrusion
      // attempts), and a result that's STILL structurally malformed after
      // one repair pass is reported as unusable (null) rather than ever
      // being returned — that in turn makes the OUTER language-integrity
      // loop retry the whole generation again (up to its own bound), and a
      // final same check runs again just below after this returns, so a
      // malformed reflection can never silently reach persistence.
      const outcome = await runWithLanguageIntegrity(
        async (retryNote) => {
          const generate = async (note: string): Promise<PatternReflectionResult | null> => {
            const response = await client.responses.create({
              model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
              instructions: instructions + retryNote + note,
              input,
              text: {
                format: { type: 'json_schema', name: 'pattern_reflection', schema: PATTERN_REFLECTION_JSON_SCHEMA, strict: true },
              },
            });
            try {
              return validatePatternReflectionResult(JSON.parse(response.output_text));
            } catch {
              return null;
            }
          };

          const first = await generate('');
          if (!first) return null;
          const problems = findReflectionProblems(first);
          if (problems.length === 0) return first;

          const second = await generate(buildReflectionRepairNote(problems));
          if (second && findReflectionProblems(second).length === 0) return second;
          return null;
        },
        (result) => collectStrings(result),
        { route: 'pattern-reflection', language, context: dreamerText },
      );
      if (outcome.status !== 'ok') {
        return { status: outcome.status === 'language_intrusion' ? 'language_intrusion' : 'invalid' };
      }
      // Final safety net: whatever produced this (including the outer
      // retry loop's own last attempt) must still pass the same
      // deterministic check right before the caller ever considers
      // persisting it.
      if (findReflectionProblems(outcome.value).length > 0) {
        return { status: 'invalid' };
      }
      return { status: 'ok', value: outcome.value };
    },

    async persistReflection(key, reflection, totalDreamCount, synthesizedDreamCount) {
      const { error } = await scoped.from('pattern_reflections').insert({
        owner_id: key.ownerId,
        concept_id: key.conceptId,
        concept_version: key.conceptVersion,
        prompt_version: key.promptVersion,
        address_preference: key.addressPreference,
        dream_ids: key.dreamIds,
        dream_ids_key: key.dreamIdsKey,
        language: key.language,
        reflection,
        total_dream_count: totalDreamCount,
        synthesized_dream_count: synthesizedDreamCount,
      });
      if (!error) return { status: 'inserted' };
      // 23505 = unique_violation (Postgres) — another concurrent request for
      // the exact same identity already won; never a security or data issue.
      if (error.code === '23505') return { status: 'conflict' };
      console.error('[pattern-reflection] cache write failed (reflection still returned this session):', error.message);
      return { status: 'failed', error };
    },
  };

  try {
    const outcome = await runPatternReflection(
      { ownerId: resolved.identity.userId, conceptId: body.conceptId, dreamIds: requestedIds, language: body.language, addressPreference },
      deps,
    );

    switch (outcome.status) {
      case 'ok':
        return okResult({ reflection: outcome.reflection, totalDreamCount: outcome.totalDreamCount, synthesizedDreamCount: outcome.synthesizedDreamCount });
      case 'invalid_concept':
        return errorResult(400, 'invalid_concept', 'conceptId must be a known concept from the DARE taxonomy.');
      case 'invalid_input':
        return errorResult(400, 'invalid_response', 'dreamIds must be a non-empty array of dream ids.');
      case 'insufficient_evidence':
        return errorResult(400, 'insufficient_evidence', 'This concept does not currently occur in at least 2 of your saved dreams.');
      case 'generation_failed':
        return errorResult(
          502,
          'invalid_response',
          outcome.reason === 'language_intrusion'
            ? 'The AI response did not stay in the required language.'
            : 'The AI response was not valid JSON matching the expected Pattern Reflection schema.',
        );
    }
  } catch (err) {
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
    return errorResult(500, 'request_failed', 'An unexpected error occurred while generating the Pattern Reflection.');
  }
}
