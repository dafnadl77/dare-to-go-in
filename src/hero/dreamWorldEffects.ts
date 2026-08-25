import type { DreamAnalysis } from './dreamAnalysisSchema';

/**
 * Which subtle environmental motions DreamWorld should switch on — a
 * mapping from real DreamAnalysis content to a visual treatment, never
 * content generation. Every flag defaults to false; an effect only
 * activates when the dream itself actually mentions it.
 */
export interface DreamWorldEffects {
  water: boolean;
  rain: boolean;
  fog: boolean;
  wind: boolean;
  /** Darkness or light was explicitly described — breathe the light very slowly. */
  lightBreathing: boolean;
  /** Falling or continuous directional movement was explicitly described. */
  falling: boolean;
}

const WATER_WORDS = ['הים', 'בים', 'לים', 'מים', 'ימה', 'אגם', 'נהר', 'אוקיינוס', 'sea', 'ocean', 'water', 'wave', 'lake', 'river', 'pool'];
const RAIN_WORDS = ['גשם', 'rain', 'raining', 'drizzle', 'downpour'];
const FOG_WORDS = ['ערפל', 'אובך', 'fog', 'mist', 'haze'];
const WIND_WORDS = ['רוח', 'wind', 'breeze', 'gust'];
const LIGHT_WORDS = ['חושך', 'אפל', 'אור', 'dark', 'darkness', 'light', 'dim', 'glow', 'bright'];
const FALLING_WORDS = ['נופל', 'נפיל', 'fall', 'falling'];

function includesAny(text: string, words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w.toLowerCase()));
}

function analysisText(analysis: DreamAnalysis): string {
  return [
    ...analysis.places.map((p) => `${p.name} ${p.description ?? ''}`),
    ...analysis.sensoryDetails.visual,
    ...analysis.sensoryDetails.sounds,
    ...analysis.sensoryDetails.physicalSensations,
    ...analysis.sensoryDetails.atmosphere,
    ...analysis.unusualElements,
    ...analysis.actions.map((a) => a.action),
    analysis.emotionalTone ?? '',
  ].join(' ');
}

export function deriveDreamWorldEffects(analysis: DreamAnalysis): DreamWorldEffects {
  const text = analysisText(analysis);
  const actionText = analysis.actions.map((a) => a.action).join(' ');
  return {
    water: includesAny(text, WATER_WORDS),
    rain: includesAny(text, RAIN_WORDS),
    fog: includesAny(text, FOG_WORDS),
    wind: includesAny(text, WIND_WORDS),
    lightBreathing: includesAny(text, LIGHT_WORDS),
    falling: includesAny(actionText, FALLING_WORDS),
  };
}
