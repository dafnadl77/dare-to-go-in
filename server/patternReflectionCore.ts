import type { AppLanguage } from '../src/hero/appLanguage.js';
import { isConceptId, conceptsOfDream, CONCEPT_TAXONOMY_VERSION, type ConceptId } from '../src/hero/conceptTaxonomy.js';
import { buildDreamIdsKey, selectDreamsForSynthesis, MAX_SYNTHESIS_DREAMS } from '../src/archive/patternReflectionInput.js';
import type { DreamAnalysis } from '../src/hero/dreamAnalysisSchema.js';
import type { PatternReflectionResult } from '../src/archive/patternReflectionSchema.js';

/**
 * The orchestration core of Pattern Reflection — pure aside from the
 * injected `deps`, exactly like anonymousSafetyValves.ts's
 * createAttemptWithinSafetyValve(store, identity, limit). Every real
 * Supabase/OpenAI call happens inside a `deps` implementation built by
 * server/routes/patternReflection.ts; this function itself never touches
 * the network, which is what makes every rule below independently
 * unit-testable with fakes (see tests/patternReflection.test.ts).
 *
 * SECURITY: `deps.fetchOwnedDreams` is trusted to already be owner-scoped
 * (the real implementation uses a bearer-token-scoped Supabase client, so
 * RLS itself guarantees this — see server/supabaseUserScopedClient.ts).
 * This function additionally never trusts that the client-claimed
 * `dreamIds` actually contain the requested concept — it always
 * re-derives that from each dream's own real `dreamAnalysis.concepts` via
 * conceptsOfDream(), and only counts a concept as recurring when at least
 * 2 DISTINCT dreams (by id) genuinely contain it.
 */

export interface OwnedDreamForReflection {
  id: string;
  createdAt: string;
  dreamAnalysis: DreamAnalysis;
  selectedElement: string;
  dreamReflectionObservation: string;
}

export interface PatternReflectionCacheKey {
  ownerId: string;
  conceptId: ConceptId;
  conceptVersion: number;
  /** The exact, sorted relevant dream-id set `dreamIdsKey` was built from —
      carried alongside it (rather than re-derived by splitting the key
      string) so persistReflection always has the real array to write to
      the `dream_ids` column, with no dependency on dream ids never
      containing the key's own join character. */
  dreamIds: string[];
  dreamIdsKey: string;
  language: AppLanguage;
}

export interface CachedPatternReflection {
  reflection: PatternReflectionResult;
  totalDreamCount: number;
  synthesizedDreamCount: number;
}

export type GenerateOutcome =
  | { status: 'ok'; value: PatternReflectionResult }
  | { status: 'invalid' }
  | { status: 'language_intrusion' };

export type PersistOutcome = { status: 'inserted' } | { status: 'conflict' } | { status: 'failed'; error: unknown };

export interface PatternReflectionDeps {
  /** Returns only dreams the caller actually owns (RLS-enforced by the
      real implementation) among the requested ids — never trusted to
      also mean "contains this concept"; that's re-verified below. */
  fetchOwnedDreams(dreamIds: string[]): Promise<OwnedDreamForReflection[]>;
  getCachedReflection(key: PatternReflectionCacheKey): Promise<CachedPatternReflection | null>;
  generateReflection(input: {
    dreams: OwnedDreamForReflection[];
    totalDreamCount: number;
    conceptId: ConceptId;
    language: AppLanguage;
  }): Promise<GenerateOutcome>;
  persistReflection(
    key: PatternReflectionCacheKey,
    reflection: PatternReflectionResult,
    totalDreamCount: number,
    synthesizedDreamCount: number,
  ): Promise<PersistOutcome>;
}

export type PatternReflectionOutcome =
  | { status: 'ok'; reflection: PatternReflectionResult; totalDreamCount: number; synthesizedDreamCount: number }
  | { status: 'invalid_concept' }
  | { status: 'invalid_input' }
  | { status: 'insufficient_evidence' }
  | { status: 'generation_failed'; reason: 'invalid' | 'language_intrusion' };

export interface PatternReflectionRequest {
  ownerId: string;
  conceptId: unknown;
  dreamIds: unknown;
  language: unknown;
}

export async function runPatternReflection(request: PatternReflectionRequest, deps: PatternReflectionDeps): Promise<PatternReflectionOutcome> {
  if (typeof request.conceptId !== 'string' || !isConceptId(request.conceptId)) {
    return { status: 'invalid_concept' };
  }
  const conceptId = request.conceptId;
  const language: AppLanguage = request.language === 'he' ? 'he' : 'en';

  const requestedIds = Array.isArray(request.dreamIds)
    ? request.dreamIds.filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
    : [];
  if (requestedIds.length === 0) {
    return { status: 'invalid_input' };
  }

  const owned = await deps.fetchOwnedDreams(requestedIds);

  // Re-derive recurrence from each dream's OWN real concepts — never trust
  // the client's claim that a requested dream actually contains this
  // concept. De-duped by id defensively (distinct DREAMS, never inflated
  // by a concept appearing more than once inside the same dream — it
  // can't, conceptsOfDream already caps/dedupes per dream, but a dream is
  // still counted at most once here even so).
  const byId = new Map<string, OwnedDreamForReflection>();
  for (const dream of owned) {
    if (conceptsOfDream(dream.dreamAnalysis).includes(conceptId)) {
      byId.set(dream.id, dream);
    }
  }
  const verified = [...byId.values()];
  if (verified.length < 2) {
    return { status: 'insufficient_evidence' };
  }

  const sortedDreamIds = [...new Set(verified.map((d) => d.id))].sort();
  const dreamIdsKey = buildDreamIdsKey(sortedDreamIds);
  const key: PatternReflectionCacheKey = {
    ownerId: request.ownerId,
    conceptId,
    conceptVersion: CONCEPT_TAXONOMY_VERSION,
    dreamIds: sortedDreamIds,
    dreamIdsKey,
    language,
  };

  const cached = await deps.getCachedReflection(key);
  if (cached) {
    return { status: 'ok', reflection: cached.reflection, totalDreamCount: cached.totalDreamCount, synthesizedDreamCount: cached.synthesizedDreamCount };
  }

  const totalDreamCount = verified.length;
  const synthesized = selectDreamsForSynthesis(verified, MAX_SYNTHESIS_DREAMS);

  const generated = await deps.generateReflection({ dreams: synthesized, totalDreamCount, conceptId, language });
  if (generated.status !== 'ok') {
    return { status: 'generation_failed', reason: generated.status };
  }

  const persisted = await deps.persistReflection(key, generated.value, totalDreamCount, synthesized.length);
  if (persisted.status === 'conflict') {
    // Another concurrent request for the exact same key won the race and
    // already wrote it — read back the persisted, singular result rather
    // than serving two different reflections for the same identity.
    const existing = await deps.getCachedReflection(key);
    if (existing) {
      return { status: 'ok', reflection: existing.reflection, totalDreamCount: existing.totalDreamCount, synthesizedDreamCount: existing.synthesizedDreamCount };
    }
  }
  // 'inserted', or 'failed' (a genuine persistence error — logged by the
  // real dep, never thrown here): either way the dreamer still sees the
  // reflection that was just generated for this session; a failed cache
  // write only means the NEXT open regenerates instead of hitting cache.
  return { status: 'ok', reflection: generated.value, totalDreamCount, synthesizedDreamCount: synthesized.length };
}
