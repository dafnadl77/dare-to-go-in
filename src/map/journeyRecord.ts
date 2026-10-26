import { createExploration, exploredInOrder, MAX_MOMENTS, type Exploration } from '../hero/exploration';
import { momentGroups } from '../hero/dreamSegments';
import { checkLabel } from '../hero/claimCheck';
import { getGroundingStatement, type DreamReflectionResult } from '../hero/dreamReflectionSchema';
import type { DreamAnalysis } from '../hero/dreamAnalysisSchema';
import type { AppLanguage } from '../hero/appLanguage';

/**
 * The dream map inside the real journey: the moments it starts from, and what a finished map journey is saved as. Pure, so the rules
 * are testable exactly. A map dream is saved in the same SavedDream shape as every other dream, so the archive, the closing screen,
 * the titles and the patterns read it without change; the journey itself rides along in `exploration`.
 */

/** The moments the map offers: the dream's own events, most telling first, at most MAX_MOMENTS. A dream with no event is one moment. */
export function mapMomentTexts(analysis: DreamAnalysis): { text: string; segmentIds: number[] }[] {
  const groups = momentGroups(analysis.sourceText, analysis.unusualElements ?? []).slice(0, MAX_MOMENTS);
  if (groups.length > 0) return groups.map((g) => ({ text: g.text, segmentIds: g.segmentIds }));
  const whole = analysis.sourceText.trim();
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
  const words = herWordsByMoment(e);
  return {
    selectedElement: exploredInOrder(e).map((x) => x.moment.label).join(' · '),
    reflectionResponse: words.flatMap((x) => x.words).join('\n'),
  };
}
