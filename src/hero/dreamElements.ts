import type { DreamAnalysis } from './dreamAnalysisSchema';

/**
 * A concise, deterministic list of selectable dream elements — every entry
 * comes straight from the real DreamAnalysis, never invented. Priority
 * favors the most distinctive/concrete facts (unusual elements, named
 * people, objects, places) over raw sensory detail, which is only used as
 * filler when nothing more concrete is available. Never pads to a minimum.
 */
export function deriveDreamElements(analysis: DreamAnalysis, max = 6): string[] {
  const primary = derivePrimaryDreamElements(analysis, max);
  // The normal path is exactly what it always was. ONLY when it found nothing
  // at all does the grounded fallback below run — so a dream never reaches
  // "choose the moment that stands out" with nothing to choose.
  return primary.length > 0 ? primary : deriveFallbackDreamElements(analysis, max);
}

function derivePrimaryDreamElements(analysis: DreamAnalysis, max: number): string[] {
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

/** A fallback element must read as a short label, never a sentence. */
const MAX_FALLBACK_ELEMENT_CHARS = 80;

/**
 * Used ONLY when derivePrimaryDreamElements found nothing (no explicit
 * people/places/objects/actions, no unusual elements, no sensory detail).
 * Every candidate is a value the analysis itself already holds about THIS
 * dream — never invented, never a generic dream symbol — read in this
 * order: the reconstruction's key objects, people and actions; its primary
 * setting and any named place; the emotional atmosphere and the emotions;
 * then the remaining concrete structured details (non-explicit people/
 * objects/actions, visual/atmospheric detail, unresolved details). Returns
 * fewer than max — including none — when the analysis genuinely holds
 * nothing usable; callers must handle an empty result (see
 * wholeDreamReference), never pad it.
 */
export function deriveFallbackDreamElements(analysis: DreamAnalysis, max = 6): string[] {
  const r = analysis.reconstruction;
  const candidates: (string | null | undefined)[] = [
    ...(r?.keyObjects ?? []),
    ...(r?.keyPeople ?? []),
    ...(r?.keyActions ?? []),
    r?.primarySetting,
    ...(analysis.places ?? []).map((p) => p.name),
    ...(r?.emotionalAtmosphere ?? []),
    ...(analysis.emotions ?? []).map((e) => e.emotion),
    analysis.emotionalTone,
    ...(analysis.people ?? []).map((p) => p.nameOrRole),
    ...(analysis.objects ?? []).map((o) => o.name),
    ...(analysis.actions ?? []).map((a) => [a.subject, a.action, a.target].filter(Boolean).join(' ').trim()),
    ...(r?.visualAtmosphere ?? []),
    ...(analysis.sensoryDetails?.atmosphere ?? []),
    ...(analysis.unresolvedDetails ?? []),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    const text = typeof c === 'string' ? c.trim() : '';
    const key = text.toLowerCase();
    if (!text || text.length > MAX_FALLBACK_ELEMENT_CHARS || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out.slice(0, max);
}

/**
 * The reference the reflection engine receives when a dream truly has no
 * selectable element even after the fallback: the dream ITSELF, as a whole —
 * the first clause of its own summary (else the start of the dreamer's own
 * words). It is not shown as a choice and is not presented as something the
 * dreamer picked; it only gives the existing reflection route the non-empty
 * subject it requires, so the journey can continue to Reflection instead of
 * dead-ending. Always non-empty for a real analysis (sourceText is required).
 */
export function wholeDreamReference(analysis: DreamAnalysis): string {
  const clause = (analysis.summary ?? '').split(/[.!?]/)[0]?.trim() ?? '';
  const text = clause || (analysis.sourceText ?? '').trim();
  return text.slice(0, 60).trim();
}

/**
 * The reflection question, generated purely from the selected real element
 * — never a hardcoded example, never reinterpreted or paraphrased. The
 * surrounding phrase comes from the translation resources (via `t`, the
 * caller's own useLanguage().t) so it reads in whichever language the UI
 * is currently in; only the element itself is real, dreamer-derived
 * content. `.toUpperCase()` is a harmless no-op on Hebrew (no case).
 */
export function buildReflectionQuestion(element: string, t: (path: string) => string): string {
  return `${t('reflection.reflectionQuestionPrefix')} ${element.toUpperCase()} ${t('reflection.reflectionQuestionSuffix')}`;
}
