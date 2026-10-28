import { createExploration, exploredInOrder, MAX_MOMENTS, type Exploration } from '../hero/exploration';
import { momentGroups, segmentDream, textOfSegments } from '../hero/dreamSegments';
import { checkLabel } from '../hero/claimCheck';
import { getGroundingStatement, type DreamReflectionResult } from '../hero/dreamReflectionSchema';
import type { DreamAnalysis } from '../hero/dreamAnalysisSchema';
import type { AppLanguage } from '../hero/appLanguage';

/**
 * The dream map inside the real journey: the moments it starts from, and what a finished map journey is saved as. Pure, so the rules
 * are testable exactly. A map dream is saved in the same SavedDream shape as every other dream, so the archive, the closing screen,
 * the titles and the patterns read it without change; the journey itself rides along in `exploration`.
 */

/** At most this many moments when the dream does not split into steps and its own clauses are used instead. */
const FALLBACK_MOMENTS = 4;

/**
 * The moments the map offers: the dream's own events, most telling first, at most MAX_MOMENTS. When the dream does not split into
 * steps (one long sentence of scenes joined by commas), its own clauses are used, in order, 2 to 4 of them (neighbours joined), never
 * the same words twice. Only a dream of one clause is one moment.
 */
export function mapMomentTexts(analysis: DreamAnalysis): { text: string; segmentIds: number[] }[] {
  const src = analysis.sourceText;
  const groups = momentGroups(src, analysis.unusualElements ?? []).slice(0, MAX_MOMENTS);
  if (groups.length >= 2) return groups.map((g) => ({ text: g.text, segmentIds: g.segmentIds }));
  const segments = segmentDream(src);
  const seen = new Set<string>();
  const distinct = segments.filter((s) => {
    const key = s.text.replace(/[\s,.;:!?…]+/g, ' ').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (distinct.length >= 2) {
    const n = Math.min(FALLBACK_MOMENTS, distinct.length);
    const chunks = Array.from({ length: n }, (_, k) => distinct.slice(Math.floor((k * distinct.length) / n), Math.floor(((k + 1) * distinct.length) / n)).map((s) => s.id));
    return chunks.map((ids) => ({ text: textOfSegments(src, segments, ids).replace(/[\s,;]+$/, ''), segmentIds: ids }));
  }
  if (groups.length === 1) return [{ text: groups[0].text, segmentIds: groups[0].segmentIds }];
  const whole = src.trim();
  return whole ? [{ text: whole, segmentIds: [] }] : [];
}

/**
 * The journey's starting point. `labels` are the titles the labels call wrote (one per moment, same order); a missing or empty title,
 * or no labels at all (the call failed), falls back to a title built from the moment's own words by the same code check.
 */
export function mapJourneyFrom(attemptId: string, analysis: DreamAnalysis, labels: readonly string[] | null): Exploration {
  const moments = mapMomentTexts(analysis);
  const used: string[] = [];
  const seeds = moments.map((m, i) => {
    const given = labels?.[i]?.trim() ?? '';
    const label = given || checkLabel('', m.text, used, analysis.sourceText);
    used.push(label);
    return { label, excerpt: m.text, segmentIds: m.segmentIds };
  });
  return createExploration(attemptId, seeds);
}

/** Her own words in the conversation (not the bubbles the buttons wrote), moment by moment, in the order she explored them. */
export function herWordsByMoment(e: Exploration): { label: string; words: string[] }[] {
  return exploredInOrder(e)
    .map(({ moment, entry }) => ({ label: moment.label, words: (entry.turns ?? []).filter((t) => t.role === 'dreamer' && !t.rejection && !t.steer).map((t) => t.text) }))
    .filter((x) => x.words.length > 0);
}

/** True once the map journey can close: a whole view of what she explored is there. */
export const mapJourneyComplete = (e: Exploration | null): e is Exploration => Boolean(e && e.wholeView && exploredInOrder(e).length > 0);

/**
 * The reflection-shaped record of a finished map journey, built only from what the journey holds (nothing invented): what came up is the
 * whole view's own text, the question to keep is its closing question or the first question left open, and an idea DARE offered (that
 * she did not turn down) is the possible thread. Fields with nothing behind them stay empty.
 */
export function reflectionFromJourney(e: Exploration, language: AppLanguage): DreamReflectionResult | null {
  if (!mapJourneyComplete(e)) return null;
  const w = e.wholeView!;
  const words = herWordsByMoment(e);
  return {
    observation: w.overview,
    personalAssociation: words.flatMap((x) => x.words).join(' '),
    possibleThread: w.takeaways?.ideas[0] ?? '',
    continuityQuestion: w.closingQuestion || w.takeaways?.open?.[0] || '',
    lenses: { cognitive: null, jungian: null, psychodynamic: null },
    confidenceNotes: [],
    groundingStatement: getGroundingStatement(language),
    summary: null,
  };
}

/** What the saved record's older fields hold for a map dream: the moments she explored, and her own words in them. */
export function savedFieldsFromJourney(e: Exploration): { selectedElement: string; reflectionResponse: string } {
  const words = herWordsByMoment(e).flatMap((x) => x.words);
  // she may have answered only with the buttons: then what the buttons said, so the reflection is never asked without her answers
  const anyTurn = exploredInOrder(e).flatMap(({ entry }) => (entry.turns ?? []).filter((t) => t.role === 'dreamer').map((t) => t.text));
  const labels = exploredInOrder(e).map((x) => x.moment.label);
  return {
    selectedElement: labels.join(' · '),
    reflectionResponse: (words.length ? words : anyTurn.length ? anyTurn : labels).join('\n'),
  };
}
