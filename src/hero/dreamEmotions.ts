/**
 * The feelings a dreamer can name after describing a dream (the optional "which feeling stayed with you?" step, between the
 * association and the reflection). They are stored and sent as stable ids, never as display text, so a dream saved in one
 * language reads correctly in the other. Deliberately free of any Vite/browser-only code: the backend imports this file too.
 */
export const EMOTION_IDS = [
  'fear',
  'joy',
  'calm',
  'love',
  'longing',
  'confusion',
  'anger',
  'sadness',
  'wonder',
  'freedom',
  'helplessness',
  'excitement',
] as const;

export type EmotionId = (typeof EMOTION_IDS)[number];

/** At most three, per the product spec. */
export const MAX_EMOTIONS = 3;

const KNOWN = new Set<string>(EMOTION_IDS);

/**
 * Accepts anything (a request body, a stored record) and returns only known ids: no duplicates, at most MAX_EMOTIONS, in the
 * order given. Anything else is dropped silently, so an old or malformed record can never break a dream.
 */
export function normalizeEmotions(value: unknown): EmotionId[] {
  if (!Array.isArray(value)) return [];
  const out: EmotionId[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !KNOWN.has(item)) continue;
    const id = item as EmotionId;
    if (out.includes(id)) continue;
    out.push(id);
    if (out.length === MAX_EMOTIONS) break;
  }
  return out;
}

/** English names given to the model (the model writes its answer in the dreamer's language regardless). */
const EMOTION_NAME_FOR_MODEL: Record<EmotionId, string> = {
  fear: 'fear',
  joy: 'joy',
  calm: 'calm',
  love: 'love',
  longing: 'longing',
  confusion: 'confusion',
  anger: 'anger',
  sadness: 'sadness',
  wonder: 'wonder',
  freedom: 'freedom',
  helplessness: 'helplessness',
  excitement: 'excitement',
};

/** The same words the dreamer saw on screen, so a Hebrew reading uses the Hebrew label ("פליאה") and not a free translation ("השתוממות"). */
const EMOTION_NAME_FOR_MODEL_HE: Record<EmotionId, string> = {
  fear: 'פחד',
  joy: 'שמחה',
  calm: 'שלווה',
  love: 'אהבה',
  longing: 'געגוע',
  confusion: 'בלבול',
  anger: 'כעס',
  sadness: 'עצב',
  wonder: 'פליאה',
  freedom: 'חופש',
  helplessness: 'חוסר אונים',
  excitement: 'התרגשות',
};

export function emotionNamesForModel(ids: readonly EmotionId[], language: 'en' | 'he' = 'en'): string {
  const names = language === 'he' ? EMOTION_NAME_FOR_MODEL_HE : EMOTION_NAME_FOR_MODEL;
  return ids.map((id) => names[id]).join(', ');
}
