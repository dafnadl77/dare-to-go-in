import type { DreamAnalysis } from './dreamAnalysisSchema.js';

/**
 * How much there is in a dream to reflect on. Decided in code from what the analysis already holds — never by the model — so a
 * very short dream is not padded and a rich one is not squeezed into the same few lines. Used only to set the length and the
 * number of alternative readings the reflection prompt asks for.
 */
export type DreamDepth = 'brief' | 'standard' | 'rich';

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function computeDreamDepth(analysis: DreamAnalysis): DreamDepth {
  const words = wordCount(analysis.sourceText ?? '');
  const facts =
    (analysis.people?.length ?? 0) +
    (analysis.places?.length ?? 0) +
    (analysis.objects?.length ?? 0) +
    (analysis.actions?.length ?? 0) +
    (analysis.unusualElements?.length ?? 0) +
    (analysis.relationships?.length ?? 0) +
    (analysis.sequence?.length ?? 0);
  if (words < 35 && facts <= 5) return 'brief';
  if (words >= 120 || facts >= 14) return 'rich';
  return 'standard';
}

/** The most alternative readings a depth may carry. */
export function maxAlternativeReadings(depth: DreamDepth): number {
  return depth === 'brief' ? 1 : 2;
}
