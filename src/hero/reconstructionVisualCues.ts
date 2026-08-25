import type { DreamAnalysis } from './dreamAnalysisSchema';
import type { ReconstructionBrief } from './reconstructionBrief';

/**
 * Which CSS motifs the temporary (non-generated) reconstruction visual
 * should switch on — decided purely by lexical presence of a few literal
 * words in the real analysis, never by guessing what the dream "means".
 * This picks a visual treatment, it never adds or changes displayed text.
 */
export interface VisualCues {
  water: boolean;
  falling: boolean;
  hasUnknownPerson: boolean;
  settingKnown: boolean;
}

// Plain substring keywords, not \b-anchored regex: JavaScript's \w (and so
// \b) only recognizes ASCII word characters, so a word-boundary pattern
// never fires around Hebrew text — "ים\b" silently never matches "הים".
const WATER_KEYWORDS = ['הים', 'בים', 'לים', 'מים', 'ימה', 'אוקיינוס', 'sea', 'ocean', 'water', 'wave'];
const FALLING_KEYWORDS = ['נופל', 'נפיל', 'fall'];

function containsAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

export function deriveVisualCues(analysis: DreamAnalysis, brief: ReconstructionBrief): VisualCues {
  const settingText = [...analysis.places.map((p) => p.name), ...analysis.sensoryDetails.visual, ...analysis.unusualElements].join(' ');
  const actionText = analysis.actions.map((a) => a.action).join(' ');

  return {
    water: containsAny(settingText, WATER_KEYWORDS),
    falling: containsAny(actionText, FALLING_KEYWORDS),
    hasUnknownPerson: brief.people.some((p) => !p.appearanceKnown),
    settingKnown: brief.setting.known.length > 0,
  };
}
