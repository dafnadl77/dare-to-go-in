import { basedOnKey, exploredInOrder, exploringId, type Exploration } from '../hero/exploration';
import type { MapDream, MapLanguage, MapMoment, WholeView } from './mapTypes';

/**
 * Turns the real journey (exploration.ts) into the data the approved map components already read (mapTypes.ts), so the map itself
 * does not change. Only what exists is shown: a moment that was not explored has no question, answer or insight to show, and the
 * whole view's links are the ones it kept (both ends explored, with what they rest on).
 */
export interface MapFromExploration {
  dream: MapDream;
  explored: string[];
  exploringId: string | null;
  wholeView: WholeView | null;
  wholeViewStale: boolean;
}

export function mapFromExploration(
  e: Exploration,
  info: { key: string; language: MapLanguage; date: string; sourceText: string; imageSrc: string; sensitive?: boolean },
): MapFromExploration {
  const moments: MapMoment[] = e.moments.map((m) => {
    const entry = e.explored[m.id];
    return {
      id: m.id,
      title: m.label,
      excerpt: m.excerpt,
      question: entry?.question ?? '',
      answer: entry?.answer ?? '',
      ...(entry?.followUp ? { followUp: { question: entry.followUp.question, answer: entry.followUp.skipped ? null : entry.followUp.answer } } : {}),
      insight: entry?.insight
        ? { headline: entry.insight.possibility, full: [entry.insight.observation, entry.insight.reflection, entry.insight.possibility].join(' ') }
        : { headline: '', full: '' },
    };
  });
  const explored = exploredInOrder(e).map((x) => x.moment.id);
  const w = e.wholeView;
  const wholeView: WholeView | null = w
    ? {
        basedOn: w.momentIds,
        overview: w.overview,
        recurring: w.recurring,
        contrast: w.contrast,
        readings: w.readings,
        closingQuestion: w.closingQuestion,
        connections: w.connections.map((c, i) => ({ id: `c${i + 1}`, from: c.from, to: c.to, title: c.title, basis: c.basis })),
      }
    : null;
  return {
    dream: {
      key: info.key,
      label: info.key,
      language: info.language,
      date: info.date,
      sourceText: info.sourceText,
      imageSrc: info.imageSrc,
      sensitive: info.sensitive,
      moments,
      initiallyExplored: explored,
      wholeViews: wholeView ? [wholeView] : [],
    },
    explored,
    exploringId: exploringId(e),
    wholeView,
    wholeViewStale: w !== null && w.basedOn !== basedOnKey(e),
  };
}
