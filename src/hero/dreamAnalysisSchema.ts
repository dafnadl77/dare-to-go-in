/**
 * Structured breakdown of a dream, derived ONLY from what the user
 * actually said or typed — reconstruction, not interpretation. Every
 * array may be empty (nothing of that kind was found, never a guess).
 * `explicit` distinguishes something the dreamer directly stated from
 * something cautiously inferred from context; inferred items must also
 * carry lower `confidence`.
 *
 * Deliberately free of any Vite/browser-only code (no `import.meta.env`,
 * no DOM APIs) so this module can be imported unchanged by both the
 * frontend and the local Node backend.
 */
export interface DreamPerson {
  nameOrRole: string;
  description: string | null;
  relationshipToDreamer: string | null;
  explicit: boolean;
  confidence: number;
}

export interface DreamPlace {
  name: string;
  description: string | null;
  explicit: boolean;
  confidence: number;
}

export interface DreamObject {
  name: string;
  description: string | null;
  explicit: boolean;
  confidence: number;
}

export interface DreamAction {
  subject: string | null;
  action: string;
  target: string | null;
  explicit: boolean;
  confidence: number;
}

export interface DreamEmotion {
  emotion: string;
  explicit: boolean;
  confidence: number;
}

export interface SensoryDetails {
  visual: string[];
  sounds: string[];
  physicalSensations: string[];
  atmosphere: string[];
}

export interface DreamRelationship {
  from: string;
  to: string;
  relationship: string;
}

export interface DreamSequenceStep {
  order: number;
  description: string;
}

/** The raw ingredients a later (not-yet-built) reconstruction stage would draw from — still just extracted facts, no imagery/interpretation. */
export interface ReconstructionFoundation {
  primarySetting: string | null;
  keyPeople: string[];
  keyObjects: string[];
  keyActions: string[];
  visualAtmosphere: string[];
  emotionalAtmosphere: string[];
}

export interface DreamAnalysis {
  /** Exactly the text that was analyzed — never translated or rewritten. */
  sourceText: string;
  language: string;
  summary: string;
  people: DreamPerson[];
  places: DreamPlace[];
  objects: DreamObject[];
  actions: DreamAction[];
  emotions: DreamEmotion[];
  sensoryDetails: SensoryDetails;
  /** Contradictions, impossible geography, shifting identities, etc. — preserved, never resolved into something cleaner than what was said. */
  unusualElements: string[];
  relationships: DreamRelationship[];
  sequence: DreamSequenceStep[];
  /** Things the dream clearly left ambiguous or unfinished. */
  unresolvedDetails: string[];
  emotionalTone: string | null;
  reconstruction: ReconstructionFoundation;
}

export type AnalysisErrorReason =
  | 'not_configured'
  | 'invalid_response'
  | 'request_failed'
  | 'empty_input'
  | 'rate_limited'
  | 'billing_issue';

export type AnalysisResult =
  | { status: 'ok'; analysis: DreamAnalysis }
  | { status: 'error'; reason: AnalysisErrorReason; message: string };

/**
 * The exact instruction the analysis backend uses. Reconstruction, not
 * interpretation — no dream-dictionary meanings, no Freud/Jung, no
 * diagnosis, no advice.
 */
export const DREAM_EXTRACTION_SYSTEM_PROMPT = `You are extracting structure from a user's dream report.

Treat the report as the only source of truth.

Do not invent people, places, objects, events or sensory details.

Preserve contradictions and surreal elements — if the dreamer says a place was two things at once, or a person looked like someone else, keep both, do not resolve the contradiction into one clean answer.

Distinguish explicit statements from cautious inference. Mark every extracted element "explicit: true" only if the dreamer directly said it; otherwise "explicit: false" with a lower confidence score.

If information is absent, leave it absent — do not fill gaps with plausible-sounding detail.

Your task is reconstruction, not interpretation. Do not provide dream-dictionary meanings, psychological interpretation (Freudian, Jungian, or otherwise), symbolic claims ("water means emotions"), diagnosis, or advice.

Respond with only the DreamAnalysis JSON object matching the provided schema — no prose outside it.`;

/**
 * Minimal structural validation of an untrusted candidate response before
 * the UI (or the server response body) ever relies on it. Deliberately
 * shallow (checks shape/types, not semantic correctness) — good enough to
 * reject garbage or a malformed response without crashing the experience.
 */
export function validateDreamAnalysis(candidate: unknown): DreamAnalysis | null {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const c = candidate as Record<string, unknown>;

  const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
  const isEntityArray = (v: unknown, requiredKeys: string[]): boolean =>
    Array.isArray(v) &&
    v.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        requiredKeys.every((k) => k in (item as Record<string, unknown>)),
    );

  if (typeof c.sourceText !== 'string') return null;
  if (typeof c.language !== 'string') return null;
  if (typeof c.summary !== 'string') return null;
  if (!isEntityArray(c.people, ['nameOrRole', 'explicit', 'confidence'])) return null;
  if (!isEntityArray(c.places, ['name', 'explicit', 'confidence'])) return null;
  if (!isEntityArray(c.objects, ['name', 'explicit', 'confidence'])) return null;
  if (!isEntityArray(c.actions, ['action', 'explicit', 'confidence'])) return null;
  if (!isEntityArray(c.emotions, ['emotion', 'explicit', 'confidence'])) return null;
  if (typeof c.sensoryDetails !== 'object' || c.sensoryDetails === null) return null;
  const sd = c.sensoryDetails as Record<string, unknown>;
  if (!isStringArray(sd.visual) || !isStringArray(sd.sounds) || !isStringArray(sd.physicalSensations) || !isStringArray(sd.atmosphere)) {
    return null;
  }
  if (!isStringArray(c.unusualElements)) return null;
  if (!isEntityArray(c.relationships, ['from', 'to', 'relationship'])) return null;
  if (!isEntityArray(c.sequence, ['order', 'description'])) return null;
  if (!isStringArray(c.unresolvedDetails)) return null;
  if (c.emotionalTone !== null && typeof c.emotionalTone !== 'string') return null;
  if (typeof c.reconstruction !== 'object' || c.reconstruction === null) return null;
  const r = c.reconstruction as Record<string, unknown>;
  if (
    !isStringArray(r.keyPeople) ||
    !isStringArray(r.keyObjects) ||
    !isStringArray(r.keyActions) ||
    !isStringArray(r.visualAtmosphere) ||
    !isStringArray(r.emotionalAtmosphere)
  ) {
    return null;
  }
  if (r.primarySetting !== null && typeof r.primarySetting !== 'string') return null;

  return candidate as DreamAnalysis;
}

/**
 * JSON Schema mirroring `DreamAnalysis` exactly, for OpenAI structured
 * outputs (`text.format` with `type: 'json_schema'`). Keep in sync with
 * the interfaces above and with `validateDreamAnalysis` by hand — there is
 * no automatic derivation from the TS types.
 */
const entitySchema = (props: Record<string, unknown>, required: string[]) => ({
  type: 'object',
  additionalProperties: false,
  required,
  properties: props,
});

const nullableString = { type: ['string', 'null'] } as const;
const stringArray = { type: 'array', items: { type: 'string' } } as const;

export const DREAM_ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'sourceText',
    'language',
    'summary',
    'people',
    'places',
    'objects',
    'actions',
    'emotions',
    'sensoryDetails',
    'unusualElements',
    'relationships',
    'sequence',
    'unresolvedDetails',
    'emotionalTone',
    'reconstruction',
  ],
  properties: {
    sourceText: { type: 'string' },
    language: { type: 'string' },
    summary: { type: 'string' },
    people: {
      type: 'array',
      items: entitySchema(
        {
          nameOrRole: { type: 'string' },
          description: nullableString,
          relationshipToDreamer: nullableString,
          explicit: { type: 'boolean' },
          confidence: { type: 'number' },
        },
        ['nameOrRole', 'description', 'relationshipToDreamer', 'explicit', 'confidence'],
      ),
    },
    places: {
      type: 'array',
      items: entitySchema(
        { name: { type: 'string' }, description: nullableString, explicit: { type: 'boolean' }, confidence: { type: 'number' } },
        ['name', 'description', 'explicit', 'confidence'],
      ),
    },
    objects: {
      type: 'array',
      items: entitySchema(
        { name: { type: 'string' }, description: nullableString, explicit: { type: 'boolean' }, confidence: { type: 'number' } },
        ['name', 'description', 'explicit', 'confidence'],
      ),
    },
    actions: {
      type: 'array',
      items: entitySchema(
        {
          subject: nullableString,
          action: { type: 'string' },
          target: nullableString,
          explicit: { type: 'boolean' },
          confidence: { type: 'number' },
        },
        ['subject', 'action', 'target', 'explicit', 'confidence'],
      ),
    },
    emotions: {
      type: 'array',
      items: entitySchema(
        { emotion: { type: 'string' }, explicit: { type: 'boolean' }, confidence: { type: 'number' } },
        ['emotion', 'explicit', 'confidence'],
      ),
    },
    sensoryDetails: entitySchema(
      { visual: stringArray, sounds: stringArray, physicalSensations: stringArray, atmosphere: stringArray },
      ['visual', 'sounds', 'physicalSensations', 'atmosphere'],
    ),
    unusualElements: stringArray,
    relationships: {
      type: 'array',
      items: entitySchema(
        { from: { type: 'string' }, to: { type: 'string' }, relationship: { type: 'string' } },
        ['from', 'to', 'relationship'],
      ),
    },
    sequence: {
      type: 'array',
      items: entitySchema({ order: { type: 'number' }, description: { type: 'string' } }, ['order', 'description']),
    },
    unresolvedDetails: stringArray,
    emotionalTone: nullableString,
    reconstruction: entitySchema(
      {
        primarySetting: nullableString,
        keyPeople: stringArray,
        keyObjects: stringArray,
        keyActions: stringArray,
        visualAtmosphere: stringArray,
        emotionalAtmosphere: stringArray,
      },
      ['primarySetting', 'keyPeople', 'keyObjects', 'keyActions', 'visualAtmosphere', 'emotionalAtmosphere'],
    ),
  },
} as const;
