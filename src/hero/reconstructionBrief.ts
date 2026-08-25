import type { DreamAnalysis } from './dreamAnalysisSchema.js';

/**
 * A deterministic, non-generative bridge between the real DreamAnalysis
 * and whatever eventually renders/generates the dream image. Every field
 * here is derived directly from analysis fields already marked explicit
 * or inferred by the AI — nothing here invents new content. Unknown
 * details are listed as unknown, never filled with a plausible guess.
 */
export interface ReconstructionPerson {
  identity: string;
  appearanceKnown: boolean;
  knownAppearanceDetails: string[];
}

export interface ReconstructionBrief {
  setting: {
    known: string[];
    unknown: string[];
    surrealRules: string[];
  };
  people: ReconstructionPerson[];
  actions: string[];
  atmosphere: {
    explicit: string[];
    inferred: string[];
  };
  visualCertainty: {
    setting: number;
    people: number;
    environment: number;
  };
  /** Free-text corrections the dreamer gave after "NOT QUITE" — stored verbatim, never interpreted. */
  corrections: string[];
  imagePrompt: string;
  negativePrompt: string;
}

const GENERIC_UNKNOWNS = ['exact architecture/style', 'time of day', 'lighting source', 'furniture detail not mentioned'];

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function actionPhrase(a: DreamAnalysis['actions'][number]): string {
  return [a.subject, a.action, a.target].filter(Boolean).join(' ').trim();
}

export function buildReconstructionBrief(analysis: DreamAnalysis, corrections: string[] = []): ReconstructionBrief {
  const explicitPlaces = analysis.places.filter((p) => p.explicit);
  const inferredPlaces = analysis.places.filter((p) => !p.explicit);

  const known: string[] = explicitPlaces.map((p) => p.name);
  if (analysis.reconstruction.primarySetting && !known.includes(analysis.reconstruction.primarySetting)) {
    known.push(analysis.reconstruction.primarySetting);
  }
  const unknown: string[] = [...inferredPlaces.map((p) => p.name), ...GENERIC_UNKNOWNS];

  const people: ReconstructionPerson[] = analysis.people.map((p) => ({
    identity: p.nameOrRole,
    appearanceKnown: !!p.description,
    knownAppearanceDetails: p.description ? [p.description] : [],
  }));

  const actions = analysis.actions.map(actionPhrase).filter(Boolean);

  const atmosphereExplicit = [
    ...analysis.emotions.filter((e) => e.explicit).map((e) => e.emotion),
    ...analysis.sensoryDetails.atmosphere,
  ];
  const atmosphereInferred = analysis.emotions.filter((e) => !e.explicit).map((e) => e.emotion);

  const visualCertainty = {
    setting: average(analysis.places.map((p) => p.confidence)),
    people: average(analysis.people.map((p) => p.confidence)),
    environment: average([...analysis.places.map((p) => p.confidence), ...analysis.objects.map((o) => o.confidence)]),
  };

  const knownDetailLines: string[] = [
    ...known,
    ...people
      .filter((p) => p.appearanceKnown)
      .map((p) => `${p.identity}: ${p.knownAppearanceDetails.join('; ')}`),
    ...people.filter((p) => p.appearanceKnown === false).map((p) => `${p.identity} is present`),
    ...actions,
    ...analysis.unusualElements,
  ];
  const knownLines = knownDetailLines.length ? knownDetailLines.map((k) => `- ${k}`).join('\n') : '- (nothing explicit was said)';

  const unknownDetailLines: string[] = [
    ...unknown,
    ...people.filter((p) => !p.appearanceKnown).map((p) => `${p.identity}'s face and appearance`),
  ];
  const unknownLines = unknownDetailLines.map((u) => `- ${u}`).join('\n');

  const atmosphereLines = [...atmosphereExplicit, ...atmosphereInferred];
  const atmosphereText = atmosphereLines.length ? atmosphereLines.join(', ') : 'emotionally distant, quiet, unresolved';

  const correctionLines = corrections.length ? `\n\nUSER CORRECTIONS (apply literally, do not reinterpret):\n${corrections.map((c) => `- ${c}`).join('\n')}` : '';

  const imagePrompt = `KNOWN DREAM DETAILS:
${knownLines}

UNKNOWN / DO NOT SPECIFY (render obscured, minimal, silhouetted, fogged, or visually unresolved — never invent specifics):
${unknownLines}${correctionLines}

VISUAL ATMOSPHERE:
- surreal but photorealistic
- cinematic, dreamlike
- ${atmosphereText}
- ambiguous / soft-focus wherever memory is incomplete

COMPOSITION:
- widescreen landscape framing
- no text, no UI, no watermark
- no fantasy clichés, no purple AI aesthetic, no glowing magical effects
- do not depict a hotel, child, fire, door, car, or falling unless explicitly listed above under KNOWN DREAM DETAILS`;

  const negativePrompt =
    'no invented people, no invented objects, no invented locations beyond what is listed as known, no fully detailed faces for people marked appearance-unknown, no specific architecture for unknown settings, no text, no watermark, no genre clichés, no symbolic or psychological imagery not present in the source, no hotel, no child, no fire, no door, no car, no falling unless explicitly known.';

  return {
    setting: { known, unknown, surrealRules: analysis.unusualElements },
    people,
    actions,
    atmosphere: { explicit: atmosphereExplicit, inferred: atmosphereInferred },
    visualCertainty,
    corrections,
    imagePrompt,
    negativePrompt,
  };
}
