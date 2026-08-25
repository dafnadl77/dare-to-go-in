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
  /** Number of OTHER people (excluding the dreamer) the image prompt instructs the model to render — entity count is sacred, this is the ceiling, never exceeded. */
  visibleHumanCount: number;
  /** Free-text corrections the dreamer gave after "NOT QUITE" — stored verbatim, never interpreted. */
  corrections: string[];
  imagePrompt: string;
  negativePrompt: string;
}

const GENERIC_UNKNOWNS = ['exact architecture/style', 'time of day', 'lighting source', 'furniture detail not mentioned'];

// Self-referential terms a "people" entry uses when the AI extracted the
// dreamer themself as an entity. The dreamer narrates the dream but is not
// a body to render — dreams are told in first person, so by default the
// camera IS the dreamer's own eyes and no separate figure is drawn for them.
const DREAMER_SELF_TERMS = ['dreamer', 'self', 'myself', 'narrator', 'i', 'me', 'החולם', 'החולמת', 'עצמי', 'אני'];

// Words describing an actual reflective/duplicated-self visual (never
// psychological "mirroring") — used only to add a standing containment
// instruction so a described mirror/reflection never becomes a second body.
const REFLECTION_WORDS = ['מראה', 'השתקפות', 'השתקף', 'reflection', 'mirror', 'mirrored'];

// Real fear/danger/horror content the dreamer actually described — the only
// case allowed to influence tone toward anything darker than "surreal".
const FEAR_WORDS = [
  'fear',
  'afraid',
  'scared',
  'terror',
  'terrified',
  'dread',
  'danger',
  'threat',
  'horror',
  'panic',
  'anxious',
  'anxiety',
  'פחד',
  'מפחיד',
  'אימה',
  'סכנה',
  'איום',
  'בהלה',
  'חרדה',
];

function includesAny(text: string, words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w.toLowerCase()));
}

function isDreamerEntity(p: DreamAnalysis['people'][number]): boolean {
  const text = `${p.nameOrRole} ${p.relationshipToDreamer ?? ''}`.toLowerCase();
  return DREAMER_SELF_TERMS.some((term) => text.includes(term.toLowerCase()));
}

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

  // RULE 1 — entity count is sacred. The dreamer narrates but is not a body
  // to draw; only OTHER people are candidates for visible human figures.
  const otherAnalysisPeople = analysis.people.filter((p) => !isDreamerEntity(p));
  const visibleHumanCount = otherAnalysisPeople.length;

  const humanEntityLines = otherAnalysisPeople.map(
    (p, i) =>
      `${i + 1}. ${p.nameOrRole}${p.relationshipToDreamer ? ` (${p.relationshipToDreamer})` : ''}${
        p.description ? `: ${p.description}` : ' — appearance not described, keep unresolved/silhouetted/obscured'
      }`,
  );

  const entityCountBlock =
    visibleHumanCount === 0
      ? 'ZERO other people. Nobody else is described in this dream — render the scene with no visible human figures at all, from the dreamer\'s own first-person viewpoint.'
      : `EXACTLY ${visibleHumanCount} ${visibleHumanCount === 1 ? 'person' : 'people'} — no more, no fewer, no extras for composition/atmosphere/scale:\n${humanEntityLines.map((l) => `  ${l}`).join('\n')}`;

  // RULE 4 — dreams are narrated in first person; prefer that camera so no
  // separate body needs to be invented for the dreamer.
  const cameraBlock =
    "CAMERA: first-person / observer viewpoint, as if seen through the dreamer's own eyes. The dreamer is the narrator, not a visible body — never draw a separate figure for them.";

  // RULE 5 — a described reflection/mirror stays confined to that surface,
  // generically (not hardcoded to any one dream): triggered only when the
  // dream itself actually describes one.
  const mentionsReflection = includesAny(
    [...analysis.unusualElements, ...otherAnalysisPeople.map((p) => p.description ?? ''), ...analysis.actions.map((a) => a.action)].join(' '),
    REFLECTION_WORDS,
  );
  const reflectionBlock = mentionsReflection
    ? 'Any reflection, mirror surface, or duplicated self-image described in the dream must stay strictly confined to that reflective surface — it is never a second physical person standing in the scene, and it is never the dreamer\'s own body appearing elsewhere.'
    : '';

  const placeDescriptions = analysis.places.filter((p) => p.explicit && p.description).map((p) => p.description as string);

  const knownDetailLines: string[] = [
    ...known,
    ...placeDescriptions,
    ...actions,
    ...analysis.unusualElements,
    ...analysis.sensoryDetails.visual,
    ...analysis.sensoryDetails.sounds,
    ...analysis.sensoryDetails.physicalSensations,
  ];
  const knownLines = knownDetailLines.length ? knownDetailLines.map((k) => `- ${k}`).join('\n') : '- (nothing explicit was said)';

  const unknownDetailLines: string[] = [
    ...unknown,
    ...otherAnalysisPeople.filter((p) => !p.description).map((p) => `${p.nameOrRole}'s face and appearance`),
  ];
  const unknownLines = unknownDetailLines.length ? unknownDetailLines.map((u) => `- ${u}`).join('\n') : '- (nothing else is unknown)';

  const atmosphereLines = [...atmosphereExplicit, ...atmosphereInferred];
  // RULE 2/3 — emotional tone must come from data. No fear/horror unless the
  // dream itself actually said so; otherwise stay neutral/ambiguous.
  const fearIsExplicit = includesAny(atmosphereLines.join(' '), FEAR_WORDS);
  const atmosphereText = atmosphereLines.length ? atmosphereLines.join(', ') : null;

  const toneBlock = atmosphereText
    ? `Emotional atmosphere (from the dream itself): ${atmosphereText}.`
    : 'Emotional atmosphere is not stated — render it as emotionally ambiguous, quiet, observational, dreamlike. Do not substitute fear, dread, or "creepy" for missing emotional data.';

  const horrorGuardBlock = fearIsExplicit
    ? 'The dream itself expresses fear or danger — you may reflect that honestly, but stay cinematic and surreal rather than a horror-genre still.'
    : 'IMPORTANT — default is NOT horror: surreal and physically impossible is not the same as scary. This should read as a beautiful, mysterious, quietly impossible dream image, not a horror-film still — no ominous lighting, no sinister framing, no haunted-house styling, no ghosts, no monsters, unless the dream explicitly described them (it did not here).';

  const correctionLines = corrections.length ? `\n\nUSER CORRECTIONS (apply literally, do not reinterpret):\n${corrections.map((c) => `- ${c}`).join('\n')}` : '';

  // RULE 7 — forbidden list generated logically from THIS analysis, never a
  // static boilerplate list reused unchanged across every dream.
  const forbiddenLines: string[] = [
    visibleHumanCount === 0
      ? 'any visible human figure at all, including the dreamer'
      : `any people beyond the ${visibleHumanCount} listed above (no extra man, woman, child, or crowd added for composition)`,
    'a duplicate of any listed person',
    "a second physical body for the dreamer — including one that emerges from a mirror or reflection",
    'ghosts, monsters, demons, or other horror-genre creatures',
    'horror styling: ominous lighting, sinister framing, gore, blood, weapons, fire, jump-scare staging',
    'invented locations, objects, or furniture not listed under KNOWN DREAM DETAILS',
    'invented architecture style, clothing, or time of day beyond what is known',
    'text, UI, watermarks, purple AI-art gradients, glowing magical effects, generic fantasy clichés',
  ];
  const negativePrompt = forbiddenLines.join('; ') + '.';

  const imagePrompt = `KNOWN DREAM DETAILS:
${knownLines}

HUMAN ENTITIES — count is sacred, never add extras for composition, atmosphere, symbolism, scale, or storytelling:
${entityCountBlock}
${cameraBlock}
${reflectionBlock}

UNKNOWN / DO NOT SPECIFY (render obscured, minimal, silhouetted, fogged, or visually unresolved — never invent specifics):
${unknownLines}${correctionLines}

VISUAL ATMOSPHERE:
- surreal but photorealistic, cinematic, beautiful, mysterious, poetic
- ${toneBlock}
- ${horrorGuardBlock}
- ambiguous / soft-focus wherever memory is incomplete
- render the explicitly known impossible/surreal details boldly and vividly — do not soften or minimize what the dream actually described; the restraint applies only to inventing NEW content, never to how vividly the KNOWN impossible events are depicted

COMPOSITION:
- widescreen landscape framing
- no text, no UI, no watermark
- no fantasy clichés, no purple AI aesthetic, no glowing magical effects

FORBIDDEN / DO NOT ADD:
${forbiddenLines.map((f) => `- ${f}`).join('\n')}`;

  return {
    setting: { known, unknown, surrealRules: analysis.unusualElements },
    people,
    actions,
    atmosphere: { explicit: atmosphereExplicit, inferred: atmosphereInferred },
    visualCertainty,
    visibleHumanCount,
    corrections,
    imagePrompt,
    negativePrompt,
  };
}
