import { supabase } from '../auth/supabaseClient';
import type { AppLanguage } from '../hero/appLanguage';
import type { ConceptId } from '../hero/conceptTaxonomy';
import type { PatternReflectionResult } from './patternReflectionSchema';

/**
 * Direct, RLS-protected read of a previously-generated Pattern Reflection —
 * the fast path: when a match exists, opening a pattern is instant and
 * costs no network round-trip to the AI backend, mirroring how
 * dreamRemoteStorage.ts's getDreamsRemote reads `dreams` directly rather
 * than through a server route. `owner_id` is filtered defensively (same
 * style as getDreamsRemote) even though RLS (`auth.uid() = owner_id`)
 * already makes any other owner's row unreachable.
 *
 * A miss (null) is the expected, normal case for a genuinely new pattern
 * or dream set — the caller falls back to patternReflectionEngine.ts's
 * fetchPatternReflection, which is authoritative (it re-checks the cache
 * server-side too, see patternReflectionCore.ts) and persists the result.
 */
export async function getCachedPatternReflection(params: {
  ownerId: string;
  conceptId: ConceptId;
  conceptVersion: number;
  dreamIdsKey: string;
  language: AppLanguage;
}): Promise<{ reflection: PatternReflectionResult; totalDreamCount: number; synthesizedDreamCount: number } | null> {
  const { data, error } = await supabase
    .from('pattern_reflections')
    .select('reflection, total_dream_count, synthesized_dream_count')
    .eq('owner_id', params.ownerId)
    .eq('concept_id', params.conceptId)
    .eq('concept_version', params.conceptVersion)
    .eq('dream_ids_key', params.dreamIdsKey)
    .eq('language', params.language)
    .maybeSingle();
  if (error || !data) return null;
  return {
    reflection: data.reflection as PatternReflectionResult,
    totalDreamCount: data.total_dream_count as number,
    synthesizedDreamCount: data.synthesized_dream_count as number,
  };
}
