import type { DreamFragment, DreamFragmentType } from './dreamFragmentTypes';

/**
 * Deterministic, lexicon-based fragment extraction. This is deliberately
 * NOT machine learning / AI classification — it is a literal word/phrase
 * lookup against the actual transcript. That is the whole point: a fragment
 * can only ever be emitted if its trigger text is really present in what
 * the user said or typed, so the system is structurally incapable of
 * hallucinating a fragment the user never said.
 *
 * Coverage is necessarily limited to what's curated below. That's an
 * intentional trade-off: better to miss a fragment than invent one.
 */

interface LexiconEntry {
  label: string;
  type: DreamFragmentType;
  /** Base confidence for a clean, unambiguous match. */
  confidence: number;
  /** Literal words/phrases to look for — Hebrew base forms and English forms mixed. */
  patterns: string[];
}

const LEXICON: LexiconEntry[] = [
  // ---- person ----
  { label: 'MOTHER', type: 'person', confidence: 0.95, patterns: ['אמא', 'אימא', 'mother', 'mom', 'mommy'] },
  { label: 'FATHER', type: 'person', confidence: 0.95, patterns: ['אבא', 'father', 'dad', 'daddy'] },
  { label: 'SISTER', type: 'person', confidence: 0.93, patterns: ['אחות', 'sister'] },
  { label: 'BROTHER', type: 'person', confidence: 0.88, patterns: ['אח', 'brother'] },
  { label: 'CHILD', type: 'person', confidence: 0.85, patterns: ['ילד', 'ילדה', 'ילדים', 'child', 'kid'] },
  { label: 'FRIEND', type: 'person', confidence: 0.85, patterns: ['חבר', 'חברה', 'חברים', 'friend'] },
  { label: 'STRANGER', type: 'person', confidence: 0.85, patterns: ['זר', 'זרה', 'stranger'] },
  { label: 'BABY', type: 'person', confidence: 0.9, patterns: ['תינוק', 'תינוקת', 'baby'] },

  // ---- action ----
  {
    label: 'FALLING',
    type: 'action',
    confidence: 0.92,
    patterns: ['נופל', 'נופלת', 'נופלים', 'נופלות', 'נפלתי', 'נפלה', 'נפל', 'falling', 'fell', 'fall'],
  },
  { label: 'RUNNING', type: 'action', confidence: 0.88, patterns: ['רץ', 'רצה', 'רצים', 'running', 'ran', 'run'] },
  { label: 'FLYING', type: 'action', confidence: 0.9, patterns: ['עף', 'עפה', 'טס', 'טסה', 'flying', 'flew', 'fly'] },
  { label: 'SWIMMING', type: 'action', confidence: 0.88, patterns: ['שוחה', 'swimming', 'swim'] },
  { label: 'DROWNING', type: 'action', confidence: 0.9, patterns: ['טובע', 'טובעת', 'drowning', 'drown'] },
  { label: 'CHASING', type: 'action', confidence: 0.85, patterns: ['רודף', 'רודפת', 'chasing', 'chased', 'chase'] },
  { label: 'HIDING', type: 'action', confidence: 0.85, patterns: ['מתחבא', 'מתחבאת', 'hiding', 'hid', 'hide'] },
  { label: 'SCREAMING', type: 'action', confidence: 0.88, patterns: ['צועק', 'צועקת', 'screaming', 'scream'] },
  { label: 'CRYING', type: 'action', confidence: 0.88, patterns: ['בוכה', 'crying', 'cry'] },
  { label: 'WALKING', type: 'action', confidence: 0.78, patterns: ['הולך', 'הולכת', 'walking', 'walked', 'walk'] },
  { label: 'JUMPING', type: 'action', confidence: 0.85, patterns: ['קופץ', 'קופצת', 'jumping', 'jumped', 'jump'] },
  { label: 'SEARCHING', type: 'action', confidence: 0.82, patterns: ['מחפש', 'מחפשת', 'searching', 'search'] },
  { label: 'STANDING', type: 'action', confidence: 0.75, patterns: ['עומד', 'עומדת', 'standing', 'stood', 'stand'] },
  { label: 'DRIVING', type: 'action', confidence: 0.82, patterns: ['נוהג', 'נוהגת', 'driving', 'drove', 'drive'] },

  // ---- place ----
  { label: 'BUILDING', type: 'place', confidence: 0.9, patterns: ['בניין', 'building'] },
  { label: 'HOTEL', type: 'place', confidence: 0.92, patterns: ['מלון', 'hotel'] },
  { label: 'HOUSE', type: 'place', confidence: 0.85, patterns: ['בית', 'house', 'home'] },
  { label: 'SCHOOL', type: 'place', confidence: 0.9, patterns: ['בית ספר', 'school'] },
  { label: 'CITY', type: 'place', confidence: 0.85, patterns: ['עיר', 'city'] },
  { label: 'FOREST', type: 'place', confidence: 0.9, patterns: ['יער', 'forest', 'woods'] },
  { label: 'BEACH', type: 'place', confidence: 0.9, patterns: ['חוף', 'beach'] },
  { label: 'SEA', type: 'place', confidence: 0.9, patterns: ['ים', 'sea'] },
  { label: 'OCEAN', type: 'place', confidence: 0.9, patterns: ['אוקיינוס', 'ocean'] },
  { label: 'ROOM', type: 'place', confidence: 0.82, patterns: ['חדר', 'room'] },
  { label: 'STREET', type: 'place', confidence: 0.85, patterns: ['רחוב', 'street'] },
  { label: 'HOSPITAL', type: 'place', confidence: 0.92, patterns: ['בית חולים', 'hospital'] },
  { label: 'MOUNTAIN', type: 'place', confidence: 0.9, patterns: ['הר', 'mountain'] },
  { label: 'BRIDGE', type: 'place', confidence: 0.9, patterns: ['גשר', 'bridge'] },
  { label: 'STATION', type: 'place', confidence: 0.85, patterns: ['תחנה', 'station'] },

  // ---- object ----
  { label: 'DOOR', type: 'object', confidence: 0.88, patterns: ['דלת', 'door'] },
  { label: 'WINDOW', type: 'object', confidence: 0.88, patterns: ['חלון', 'window'] },
  { label: 'KEY', type: 'object', confidence: 0.85, patterns: ['מפתח', 'key'] },
  { label: 'MIRROR', type: 'object', confidence: 0.9, patterns: ['מראה', 'mirror'] },
  { label: 'PHONE', type: 'object', confidence: 0.85, patterns: ['טלפון', 'phone'] },
  { label: 'BOOK', type: 'object', confidence: 0.85, patterns: ['ספר', 'book'] },
  { label: 'TABLE', type: 'object', confidence: 0.8, patterns: ['שולחן', 'table'] },
  { label: 'BED', type: 'object', confidence: 0.85, patterns: ['מיטה', 'bed'] },
  { label: 'CAR', type: 'object', confidence: 0.85, patterns: ['מכונית', 'רכב', 'car'] },
  { label: 'KNIFE', type: 'object', confidence: 0.88, patterns: ['סכין', 'knife'] },
  { label: 'LETTER', type: 'object', confidence: 0.82, patterns: ['מכתב', 'letter'] },
  { label: 'CLOCK', type: 'object', confidence: 0.85, patterns: ['שעון', 'clock'] },
  { label: 'STAIRS', type: 'object', confidence: 0.85, patterns: ['מדרגות', 'stairs'] },

  // ---- emotion ----
  { label: 'FEAR', type: 'emotion', confidence: 0.9, patterns: ['פחד', 'מפחד', 'מפחדת', 'fear', 'afraid', 'scared'] },
  { label: 'HAPPINESS', type: 'emotion', confidence: 0.88, patterns: ['שמחה', 'happiness', 'happy'] },
  { label: 'SADNESS', type: 'emotion', confidence: 0.88, patterns: ['עצב', 'עצוב', 'עצובה', 'sadness', 'sad'] },
  { label: 'LOVE', type: 'emotion', confidence: 0.9, patterns: ['אהבה', 'love'] },
  { label: 'ANGER', type: 'emotion', confidence: 0.88, patterns: ['כעס', 'anger', 'angry'] },
  { label: 'ANXIETY', type: 'emotion', confidence: 0.88, patterns: ['חרדה', 'anxiety', 'anxious'] },
  { label: 'PEACE', type: 'emotion', confidence: 0.85, patterns: ['שלווה', 'peace', 'peaceful'] },
  { label: 'CONFUSION', type: 'emotion', confidence: 0.82, patterns: ['בלבול', 'confusion', 'confused'] },

  // ---- transition ----
  { label: 'APPEARING', type: 'transition', confidence: 0.85, patterns: ['מופיע', 'מופיעה', 'appearing', 'appeared', 'appear'] },
  { label: 'DISAPPEARING', type: 'transition', confidence: 0.88, patterns: ['נעלם', 'נעלמת', 'disappearing', 'disappeared', 'disappear'] },
  { label: 'CHANGING', type: 'transition', confidence: 0.78, patterns: ['משתנה', 'changing', 'changed'] },
  { label: 'WAKING', type: 'transition', confidence: 0.88, patterns: ['מתעורר', 'מתעוררת', 'waking', 'woke', 'wake'] },
  { label: 'OPENING', type: 'transition', confidence: 0.78, patterns: ['נפתח', 'נפתחת', 'פותח', 'opening', 'opened'] },
  { label: 'CLOSING', type: 'transition', confidence: 0.78, patterns: ['נסגר', 'נסגרת', 'סוגר', 'closing', 'closed'] },

  // ---- environment ----
  { label: 'WATER', type: 'environment', confidence: 0.92, patterns: ['מים', 'water'] },
  { label: 'RAIN', type: 'environment', confidence: 0.9, patterns: ['גשם', 'rain'] },
  { label: 'STORM', type: 'environment', confidence: 0.9, patterns: ['סערה', 'storm'] },
  { label: 'FIRE', type: 'environment', confidence: 0.92, patterns: ['אש', 'fire'] },
  { label: 'SNOW', type: 'environment', confidence: 0.9, patterns: ['שלג', 'snow'] },
  { label: 'WIND', type: 'environment', confidence: 0.85, patterns: ['רוח', 'wind'] },
  { label: 'DARKNESS', type: 'environment', confidence: 0.85, patterns: ['חושך', 'darkness', 'dark'] },
  { label: 'FOG', type: 'environment', confidence: 0.88, patterns: ['ערפל', 'fog'] },
  { label: 'NIGHT', type: 'environment', confidence: 0.8, patterns: ['לילה', 'night'] },
  { label: 'SKY', type: 'environment', confidence: 0.82, patterns: ['שמיים', 'sky'] },
  { label: 'CLOUD', type: 'environment', confidence: 0.85, patterns: ['ענן', 'cloud'] },
  { label: 'THUNDER', type: 'environment', confidence: 0.9, patterns: ['רעם', 'thunder'] },
  { label: 'LIGHT', type: 'environment', confidence: 0.75, patterns: ['אור', 'light'] },
];

/** Common one-letter (and doubled) Hebrew prefixes that attach directly to the next word. */
const HEBREW_PREFIXES = ['וכש', 'מש', 'וש', 'כש', 'וה', 'מה', 'ב', 'כ', 'ל', 'מ', 'ו', 'ה', 'ש'];

/** Possessive-suffix words worth folding into the captured phrase, e.g. "אמא" + "שלי" -> "אמא שלי". */
const HEBREW_POSSESSIVES = new Set(['שלי', 'שלך', 'שלו', 'שלה', 'שלנו', 'שלכם', 'שלכן', 'שלהם', 'שלהן']);

const HEBREW_RE = /[֐-׿]/;

function tokenize(text: string): string[] {
  return text
    .split(/[\s,.!?;:'"()،؛]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Given a Hebrew token, returns candidate base forms: itself, and itself with a common prefix stripped. */
function hebrewCandidates(token: string): string[] {
  const candidates = [token];
  for (const prefix of HEBREW_PREFIXES) {
    if (token.startsWith(prefix) && token.length > prefix.length + 1) {
      candidates.push(token.slice(prefix.length));
    }
  }
  return candidates;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

const MIN_CONFIDENCE = 0.55;

/**
 * Extracts real dream fragments from a transcript. Pure and deterministic:
 * given the same text, always returns the same result. A label only ever
 * appears if one of its literal trigger patterns was found in `transcript`.
 */
export function extractDreamFragments(transcript: string, maxFragments = 6): DreamFragment[] {
  const trimmed = transcript.trim();
  if (!trimmed) return [];

  const lower = trimmed.toLowerCase();
  const tokens = tokenize(trimmed);
  const lowerTokens = tokenize(lower);

  const found = new Map<string, DreamFragment>();

  for (const entry of LEXICON) {
    for (const pattern of entry.patterns) {
      if (HEBREW_RE.test(pattern)) {
        for (let i = 0; i < tokens.length; i++) {
          const candidates = hebrewCandidates(tokens[i]);
          const exact = candidates[0] === pattern;
          const prefixed = !exact && candidates.slice(1).includes(pattern);
          if (!exact && !prefixed) continue;

          let original = tokens[i];
          const next = tokens[i + 1];
          if (next && HEBREW_POSSESSIVES.has(next)) {
            original = `${tokens[i]} ${next}`;
          }

          const confidence = clamp01(entry.confidence - (prefixed ? 0.1 : 0));
          registerMatch(found, entry, original, confidence);
          break;
        }
      } else if (pattern.includes(' ')) {
        if (lower.includes(pattern)) {
          registerMatch(found, entry, pattern, entry.confidence);
        }
      } else if (lowerTokens.includes(pattern)) {
        registerMatch(found, entry, pattern, entry.confidence);
      }
    }
  }

  return Array.from(found.values())
    .filter((f) => f.confidence >= MIN_CONFIDENCE)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxFragments);
}

function registerMatch(found: Map<string, DreamFragment>, entry: LexiconEntry, original: string, confidence: number) {
  const existing = found.get(entry.label);
  if (!existing || confidence > existing.confidence) {
    found.set(entry.label, { original, label: entry.label, type: entry.type, confidence });
  }
}
