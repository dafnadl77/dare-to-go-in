import type { DreamAnalysis } from './dreamAnalysisSchema';

/**
 * A concise, deterministic list of selectable dream elements — every entry
 * comes straight from the real DreamAnalysis, never invented. Priority
 * favors the most distinctive/concrete facts (unusual elements, named
 * people, objects, places) over raw sensory detail, which is only used as
 * filler when nothing more concrete is available. Never pads to a minimum.
 */
export function deriveDreamElements(analysis: DreamAnalysis, max = 6): string[] {
  const candidates: string[] = [];

  candidates.push(...analysis.unusualElements);
  candidates.push(...analysis.people.filter((p) => p.explicit).map((p) => p.nameOrRole));
  candidates.push(...analysis.objects.filter((o) => o.explicit).map((o) => o.name));
  candidates.push(...analysis.places.filter((p) => p.explicit).map((p) => p.name));
  candidates.push(
    ...analysis.actions
      .filter((a) => a.explicit)
      .map((a) => [a.subject, a.action, a.target].filter(Boolean).join(' ').trim())
      .filter(Boolean),
  );
  // Sensory detail is the least distinctive category — only used as filler
  // once the more concrete categories above are exhausted.
  candidates.push(...analysis.sensoryDetails.visual, ...analysis.sensoryDetails.sounds, ...analysis.sensoryDetails.physicalSensations);

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

/**
 * The reflection question, generated purely from the selected real element
 * — never a hardcoded example, never reinterpreted or paraphrased.
 */
export function buildReflectionQuestion(element: string): string {
  return `WHEN YOU THINK ABOUT ${element.toUpperCase()} NOW —\nWHAT COMES UP?`;
}
