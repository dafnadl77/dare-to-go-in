/**
 * Pure, isomorphic helpers for Pattern Reflection's cache identity and AI
 * input shaping — no Supabase, no OpenAI, no Vite-only code, so both
 * patternReflectionCore.ts (server) and the archive UI (client, for its own
 * direct cache-read pre-check) can share the exact same logic instead of
 * two implementations silently drifting apart.
 */

/** At most this many of a concept's relevant dreams are ever sent to the
    model as AI input — cost/payload control for a heavily recurring
    concept. Never a cap on what counts toward recurrence or the cache
    identity (see buildDreamIdsKey): a dream outside this window still
    changes the cache key if it's added or removed, it just isn't quoted
    to the model. */
export const MAX_SYNTHESIS_DREAMS = 8;

/** The deterministic, order-independent identity of a set of dream ids —
    the real cache key component (together with owner/concept/version/
    language). Plain lexicographic sort + join: no hashing needed, and
    unlike a date-based order this never changes just because a dream's
    synthesis-window position moved. De-duped defensively (a dream can only
    belong to a recurring set once, but this never trusts that blindly). */
export function buildDreamIdsKey(dreamIds: string[]): string {
  return [...new Set(dreamIds)].sort().join(',');
}

/** The newest `cap` of a relevant dream set, for the AI prompt only —
    never mutates or reorders the caller's own array. Sorted purely by
    date, independent of buildDreamIdsKey's own lexicographic order. */
export function selectDreamsForSynthesis<T extends { createdAt: string }>(dreams: T[], cap: number = MAX_SYNTHESIS_DREAMS): T[] {
  return [...dreams].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, cap);
}

/** One dream's already-flattened evidence for the Pattern Reflection
    prompt — deliberately lean (sourceText + a short digest), never the
    full DreamAnalysis object repeated per dream (see the "do not send
    giant payloads" requirement). */
export interface DreamEvidence {
  id: string;
  createdAt: string;
  sourceText: string;
  summary: string;
  emotions: string[];
  selectedElement: string;
  observation: string;
}

/** The per-request AI input: which theme, how many dreams total vs. how
    many are actually quoted, and each quoted dream's own grounded
    evidence — verbatim sourceText first and marked canonical, matching
    the hard grounding rule (sourceText wins over any structured field). */
export function buildPatternReflectionInput(
  concept: { label: string; definition: string },
  dreams: DreamEvidence[],
  totalDreamCount: number,
): string {
  const coverageLine =
    dreams.length < totalDreamCount
      ? `This theme occurs in ${totalDreamCount} of the dreamer's saved dreams in total. Below are only the ${dreams.length} most recent of those, provided as your evidence — do not imply you have seen the rest, but you may mention the true total (${totalDreamCount}) as context.`
      : `This theme occurs in exactly these ${totalDreamCount} of the dreamer's saved dreams — all of them are shown below.`;
  const groundingLine =
    'The dreams below are grouped only because each one happens to contain this theme — that alone does not mean they share anything else. Base every claim only on what these specific dreams actually contain.';

  const dreamBlocks = dreams
    .map(
      (d, i) => `DREAM ${i + 1} (saved ${d.createdAt.slice(0, 10)}):
Original text, verbatim and CANONICAL (if anything below conflicts with this, this wins): "${d.sourceText}"
Summary: ${d.summary || 'none'}
Emotions noted: ${d.emotions.join(', ') || 'none'}
What stood out to the dreamer: ${d.selectedElement || 'none'}
The dreamer's own earlier reflection on it: ${d.observation || 'none'}`,
    )
    .join('\n\n');

  return `THEME: ${concept.label} — ${concept.definition}

${coverageLine}
${groundingLine}

${dreamBlocks}`;
}
