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
  const single = groups.length === 1 ? { text: groups[0].text, segmentIds: groups[0].segmentIds } : src.trim() ? { text: src.trim(), segmentIds: [] } : null;
  if (!single) return [];
  // one scene can still hold several things to explore ("a missile war, hiding in the bunker, the people I love most"): the analysis's
  // own explicit elements, each only where the dream says it in its own words, become the moments (2026-10-28)
  const foci = momentFoci(analysis, single.text);
  if (foci.length >= 2) return foci.map((text) => ({ text, segmentIds: single.segmentIds }));
  return [single];
}

/** At most this many foci within one scene. */
const MAX_FOCI = 4;
/** Words that never make a focus on their own (the dreamer, small function words). */
const NOT_A_FOCUS = new Set(['אני', 'אנחנו', 'הוא', 'היא', 'הם', 'הן', 'את', 'של', 'עם', 'על', 'כל', 'גם', 'רק', 'i', 'me', 'my', 'we', 'us', 'our', 'the', 'a', 'an', 'of', 'with', 'and', 'to', 'in', 'on', 'at', 'all']);
/** Hebrew letters that may be joined to the front of a word: "בבונקר" is "בונקר". */
const HE_PREFIX = /^[ובכלמשה]{0,3}$/;

interface SourceWord {
  key: string;
  start: number;
  end: number;
}

const wordsIn = (text: string): SourceWord[] =>
  [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'׳״-]*/gu)].map((m) => ({ key: m[0].toLowerCase(), start: m.index!, end: m.index! + m[0].length }));

/** A word of an element is the dream's word: the same, or with joined Hebrew letters in front ("הבונקר" / "בבונקר"). */
function sameWord(dreamWord: string, elementWord: string): boolean {
  if (dreamWord === elementWord) return true;
  const cores = [elementWord, /^ה[א-ת]{2,}/.test(elementWord) ? elementWord.slice(1) : null].filter((c): c is string => Boolean(c && /^[א-ת]{2,}$/.test(c)));
  return cores.some((core) => dreamWord.endsWith(core) && HE_PREFIX.test(dreamWord.slice(0, dreamWord.length - core.length)));
}

/** Where the dream says this element, as its own words (start, end), or null when it does not say it close together. */
function spanOf(dream: SourceWord[], element: string): [number, number] | null {
  const words = wordsIn(element).map((w) => w.key);
  const content = words.filter((w) => !NOT_A_FOCUS.has(w) && w.length >= 2);
  if (content.length === 0) return null;
  const at = content.map((w) => dream.flatMap((d, i) => (sameWord(d.key, w) ? [i] : [])));
  if (at.some((list) => list.length === 0)) return null;
  let best: [number, number] | null = null;
  for (const first of at[0]) {
    let lo = first;
    let hi = first;
    for (const list of at.slice(1)) {
      const near = list.reduce((a, b) => (Math.abs(b - first) < Math.abs(a - first) ? b : a));
      lo = Math.min(lo, near);
      hi = Math.max(hi, near);
    }
    // the element's words together, in one place in the dream: at most a few of the dream's words between them
    if (hi - lo + 1 > words.length + 3) continue;
    if (!best || hi - lo < best[1] - best[0]) best = [lo, hi];
  }
  return best;
}

/**
 * The foci within one scene: the analysis's explicit elements (unusual elements, people, objects, places, actions — in that order), each
 * as the dream's own words where it says it. Nothing the dream does not say, never the same words twice, never the whole scene again.
 * A focus that holds two others gives way to them (each is a focus of its own); one that holds a single other one replaces it with
 * more of the dream's words ("בבונקר" → "אני מתחבאת בבונקר"). In the dream's order, at most MAX_FOCI.
 */
export function momentFoci(analysis: DreamAnalysis, scene: string): string[] {
  const dream = wordsIn(scene);
  if (dream.length < 4) return [];
  const a = analysis as Partial<DreamAnalysis>;
  const candidates = [
    ...(a.unusualElements ?? []),
    ...(a.people ?? []).filter((p) => p.explicit).map((p) => p.nameOrRole),
    ...(a.objects ?? []).filter((o) => o.explicit).map((o) => o.name),
    ...(a.places ?? []).filter((p) => p.explicit).map((p) => p.name),
    ...(a.actions ?? []).filter((x) => x.explicit).map((x) => [x.subject, x.action, x.target].filter(Boolean).join(' ')),
  ].filter((c): c is string => typeof c === 'string' && c.trim().length > 0);
  let kept: [number, number][] = [];
  for (const c of candidates) {
    const span = spanOf(dream, c);
    // a focus is part of the scene, not all of it
    if (!span || span[1] - span[0] + 1 >= dream.length - 1) continue;
    const overlapping = kept.filter(([lo, hi]) => !(hi < span[0] || lo > span[1]));
    if (overlapping.length === 0) kept.push(span);
    else if (overlapping.length === 1 && overlapping[0][0] >= span[0] && overlapping[0][1] <= span[1]) kept = kept.map((k) => (k === overlapping[0] ? span : k));
  }
  return kept
    .sort((x, y) => x[0] - y[0])
    .slice(0, MAX_FOCI)
    .map(([lo, hi]) => scene.slice(dream[lo].start, dream[hi].end));
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
