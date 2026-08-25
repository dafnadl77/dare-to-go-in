import type { DreamAnalysis } from './dreamAnalysisSchema';

/**
 * Picks a handful of short real fragments straight out of the analysis —
 * never demo words, never invented. Deterministic ordering: explicit
 * places, then explicit people, then unusual/surreal elements, then
 * explicit actions, so the room's most concrete facts surface first.
 * Falls back to the primary setting only when no place was explicit.
 */
export function pickMemoryFragments(analysis: DreamAnalysis, max = 5): string[] {
  const candidates: string[] = [];

  const explicitPlaces = analysis.places.filter((p) => p.explicit).map((p) => p.name);
  candidates.push(...explicitPlaces);
  if (explicitPlaces.length === 0 && analysis.reconstruction.primarySetting) {
    candidates.push(analysis.reconstruction.primarySetting);
  }

  candidates.push(...analysis.people.filter((p) => p.explicit).map((p) => p.nameOrRole));
  candidates.push(...analysis.unusualElements);
  candidates.push(
    ...analysis.actions
      .filter((a) => a.explicit)
      .map((a) => [a.subject, a.action, a.target].filter(Boolean).join(' ').trim())
      .filter(Boolean),
  );

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const c of candidates) {
    const key = c.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(c.trim());
  }
  return unique.slice(0, max);
}
