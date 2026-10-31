import type { AppLanguage } from './appLanguage.js';
import { buildLanguageIntegrityInstruction } from './languageIntegrity.js';
import { buildHebrewAddressInstruction, type AddressPreference } from './addressPreference.js';
import { maxAlternativeReadings, type DreamDepth } from './dreamDepth.js';
import { mostlyGrounded, sharesContentWord } from './groundedText.js';

/**
 * A single grounded reflection on one real dream — never dream-dictionary
 * interpretation, never diagnosis, never therapy. Every field is a
 * possibility offered to the dreamer, never a stated fact about them.
 * Deliberately free of any Vite/browser-only code so this module can be
 * imported unchanged by both the frontend and the local Node backend.
 */
export interface DreamReflectionLenses {
  cognitive: string | null;
  jungian: string | null;
  psychodynamic: string | null;
}

/** Another plausible way to read the same dream, resting on a different detail than the possible thread: a possibility, never a conclusion. */
export interface AlternativeReading {
  /** The specific detail of the dream (or of the dreamer's own words) this reading rests on. */
  basis: string;
  reading: string;
}

/** An optional existential angle (time, waiting, loss, choice, thresholds, belonging): offered as a question to contemplate, only when the dream's own content carries such a theme. */
export interface ExistentialLens {
  basis: string;
  text: string;
}

export interface DreamReflectionResult {
  /** What actually happened in the dream — factual, traceable to the dream itself. */
  observation: string;
  /** The dreamer's own stated association with the element they chose, reflected back accurately. */
  personalAssociation: string;
  /** Exactly one concise thematic possibility — a possibility, never a conclusion. */
  possibleThread: string;
  /** Exactly one question connecting the dream's pattern to the dreamer's waking life. */
  continuityQuestion: string;
  /** Up to three optional perspectives — never truths. Null when a lens doesn't meaningfully apply. */
  lenses: DreamReflectionLenses;
  confidenceNotes: string[];
  /** Only when the dreamer named feelings: how those REPORTED feelings colour the reading, kept apart from what happened in the dream. Null or absent otherwise (and absent on every dream saved before this existed). */
  emotionReflection?: string | null;
  /** One short, personal sentence that gathers the reading. Absent on dreams saved before this existed. */
  summary?: string | null;
  /** Up to two other plausible readings, each on its own detail (one at most for a very short dream). Absent on dreams saved before this existed. */
  alternativeReadings?: AlternativeReading[] | null;
  /** Optional existential angle; null when the dream does not clearly carry such a theme. Absent on dreams saved before this existed. */
  existentialLens?: ExistentialLens | null;
  /** The model's own verdict on whether the dream's central event is itself an existential theme. Only 'clear' lets the lens through, and it is removed before the reflection is delivered or saved. */
  existentialFit?: 'clear' | 'partial' | 'none';
  /** Fixed, non-alarmist grounding line — the server always enforces the exact required wording. */
  groundingStatement: string;
}

export type ReflectionErrorReason =
  | 'not_configured'
  | 'invalid_response'
  | 'request_failed'
  | 'rate_limited'
  | 'billing_issue'
  | 'not_authenticated'
  | 'limit_reached'
  /** DARE's AI budget ran out (2026-10-30): with or without the dream's credit returned now. */
  | 'service_unavailable'
  | 'service_unavailable_refunded';

export type ReflectionResult =
  | { status: 'ok'; reflection: DreamReflectionResult }
  | { status: 'error'; reason: ReflectionErrorReason; message: string }
  /** The distress path (doc 106/109): nothing was generated; the screen shows the fixed safety words. */
  | { status: 'safety'; level: 'uncertain' | 'concern' | 'danger' | 'threat' };

/**
 * The exact grounding line the UI must always show, verbatim per language
 * — enforced server-side regardless of what the model returns for that
 * field, so its wording and calm tone can never drift. Hebrew phrasing
 * chosen to read naturally, not as a literal word-for-word translation.
 */
const GROUNDING_STATEMENT_EN = 'This is a reflection, not a diagnosis or a definitive interpretation.';
const GROUNDING_STATEMENT_HE = 'זו השתקפות, לא אבחנה או פרשנות חד-משמעית.';

export function getGroundingStatement(language: AppLanguage): string {
  return language === 'he' ? GROUNDING_STATEMENT_HE : GROUNDING_STATEMENT_EN;
}

/**
 * Hebrew only. A language model's Hebrew reads like a translation unless it is told otherwise: stiff noun chains, calques ("הדימוי כולל",
 * "התקבלה תחושה"), mixed grammatical address, and the odd untranslated English word. This is guidance for the one generation that already
 * happens; the output checks (findScriptIntrusion with strictLatin, findAddressViolation) regenerate when it is not followed.
 */
export function buildHebrewNeutralSingularInstruction(): string {
  return 'HEBREW GRAMMATICAL ADDRESS: this dreamer\'s grammatical gender is unknown and was never provided, so do NOT guess it, and do NOT default to masculine Hebrew (a real, fixed past failure this rule exists to prevent). Address the dreamer in the SINGULAR, in a way that reads the same for a man and a woman: never the plural "אתם"/"שלכם", and never "אתה" or "את". Use only forms that are spelled identically for both: the past tense of the second person ("בחרת לציין", "אמרת ש...", "תיארת"), "לך", "שלך", "איתך", plus infinitives and plain impersonal wording ("אפשר לשאול", "כדאי לשים לב", "יש כאן"). Do not address the dreamer with a present-tense, future-tense or imperative verb, because those are gendered ("מרגיש" and "מרגישה", "תרגיש", "חשוב על"). NEVER use an awkward slash form such as "את/ה", "מרגיש/ה" or "שלך/שלך". The dreamer\'s OWN words may use a masculine or a feminine form ("אני חושב", "לא בטוחה"): that is not permission to use it. Never copy their gender into the way you address them, and never write "אתה" or "את" followed by a present-tense verb or adjective ("אתה לא בטוח", "את פוגשת", "שאתה מרגיש"). When you refer to what they said, use the past tense of the second person ("אמרת", "כתבת", "ציינת"); when you need a present-tense idea about them, restructure it with an infinitive or impersonal wording ("לא ברור אם להיכנס", "כשחושבים על..."). It must still read as natural, everyday Hebrew, not as a workaround, and not as a chain of abstract nouns ("במפגש עם...", "התקבלה תחושה של...").';
}

function buildHebrewStyleInstruction(preference: AddressPreference): string {
  const address =
    preference === 'neutral'
      ? 'Address the dreamer in the singular, gender-neutral way described in the grammatical-address instruction below (the past tense of the second person, "לך", "שלך", infinitives and impersonal wording); never the plural "אתם"/"שלכם".'
      : 'Address the dreamer in the singular, exactly as the grammatical-address instruction below requires; do not use the plural "אתם"/"שלכם".';
  const example =
    preference === 'feminine'
      ? '{"observation": "בחלום עלית במדרגות ארוכות, ובקצה חיכתה דלת סגורה.", "personalAssociation": "אמרת שהמדרגות מזכירות לך את הבית של סבא.", "emotionReflection": "בחרת לציין געגוע ופחד. אפשר לשאול אם הם יושבים זה לצד זה כשמתקרבים לדלת.", "possibleThread": "ייתכן שהדלת הסגורה והגעגוע שבחרת לציין נפגשים כאן, ואפשר לראות בכך קרבה למשהו שעוד לא נפתח.", "continuityQuestion": "איזו דלת סגורה בחיים כרגע את מתקרבת אליה ועוד לא פותחת, כמו זו שבסוף המדרגות?", "summary": "מדרגות, דלת סגורה, וגעגוע שבחרת לציין."}'
      : preference === 'masculine'
        ? '{"observation": "בחלום עלית במדרגות ארוכות, ובקצה חיכתה דלת סגורה.", "personalAssociation": "אמרת שהמדרגות מזכירות לך את הבית של סבא.", "emotionReflection": "בחרת לציין געגוע ופחד. אפשר לשאול אם הם יושבים זה לצד זה כשמתקרבים לדלת.", "possibleThread": "ייתכן שהדלת הסגורה והגעגוע שבחרת לציין נפגשים כאן, ואפשר לראות בכך קרבה למשהו שעוד לא נפתח.", "continuityQuestion": "איזו דלת סגורה בחיים כרגע אתה מתקרב אליה ועוד לא פותח, כמו זו שבסוף המדרגות?", "summary": "מדרגות, דלת סגורה, וגעגוע שבחרת לציין."}'
        : '{"observation": "בחלום עלית במדרגות ארוכות, ובקצה חיכתה דלת סגורה.", "personalAssociation": "אמרת שהמדרגות מזכירות לך את הבית של סבא.", "emotionReflection": "בחרת לציין געגוע ופחד. אפשר לשאול אם הם יושבים זה לצד זה כשמתקרבים לדלת.", "possibleThread": "ייתכן שהדלת הסגורה והגעגוע שבחרת לציין נפגשים כאן, ואפשר לראות בכך קרבה למשהו שעוד לא נפתח.", "continuityQuestion": "מה בדלת הסגורה שבסוף המדרגות מוכר לך מהחיים כרגע?", "summary": "מדרגות, דלת סגורה, וגעגוע שבחרת לציין."}';
  return `HEBREW STYLE (Hebrew output only): write the way a thoughtful Hebrew speaker would say it aloud, never as a translation from English. Use short, plain, active sentences (about 20 words at most, one idea each) and ordinary everyday words; if a phrase does not sound like something a Hebrew speaker would really say, rewrite it simply. Avoid stiff noun chains and calques such as "הדימוי כולל", "התקבלה תחושה", "מה שיכול להוות מקור ל", "להשתף פעולה עם", and do not repeat "במהלך החלום" or "מייצג". Check every verb and noun: use only real Hebrew words with their correct meaning, and never invent an institution, person or event that is not in the dream. ${address} Write the feelings with exactly the Hebrew words given in the input and say who named them ("בחרתם לציין פחד וגעגוע"); in the summary, if you mention the feelings, say that the dreamer named them, never that the dreamer is "experiencing" or "feeling" them now. Use Hebrew letters only: no English word anywhere, not even in parentheses, and no English word written in Hebrew letters either (for example "מיינד"); the only Latin letters allowed are a name taken from the dreamer's own text. Mention only the feelings the dreamer named, never another one. Natural Hebrew, checked word by word: sentences of at most 16 words, one idea each; no chains of nouns or of "ש..." clauses; no filler such as "סוג של" or "מין"; use a word only when you are sure it is a real everyday Hebrew word with that meaning (never "מערב" for "מערבב", never "שיקוף" for "השתקפות"); keep the dream's own nouns and verbs for what happened (if it says "עליתי למעלה", write "עלית למעלה", not "במדרגות"); and never put two Hebrew words that mean the same thing side by side. Keep the dreamer's own actions exactly as told: if the dreamer got lost walking, say "הלכת לאיבוד" or "איבדת את הדרך"; never change the verb of what the dreamer did and never add a movement that is not in the dream (real samples turned "was in a field" into "wanted in a field" and then into "running"). Name the chosen feelings with the given words and say only that the dreamer named them; do not explain what a feeling "is", "shows" or "means". Every reading stays a possibility: use "אולי", "ייתכן", "אפשר לשאול", and never "זה אומר", "זה מעיד", "זה משקף", and never present a psychological explanation as a fact. Make the reading personal to THIS dream: every field names something concrete from it (the chosen moment, an object, a place, an action, or the feelings the dreamer named), and a sentence that could be pasted unchanged into another dream is not allowed. The continuity question is built from a detail of this dream (for example the chosen moment); it asks about the dreamer's life only as the CONTINUITY QUESTION rule allows (only a link the dreamer made, or gently "אם בכלל"), never presuming that the dream echoes something in their life now; do not open it with the stock line "האם יש משהו בחיים...". Do not open the possible thread every time with "אולי יש כאן": vary the hedge ("ייתכן ש...", "אפשר לראות ב...", "נדמה ש...") and stay tentative. Write the continuity question as ONE short, plain sentence (about 15 words) using only common everyday Hebrew words, with the dream's and the dreamer's own words copied exactly as they were written: never coin, derive or conjugate an unusual verb, noun or adjective, and never write a word that a Hebrew speaker would not recognise (real samples produced the non-words "ממעלית" and "המבעיר"); if you are unsure of a word, use a simpler one. Never say the dreamer "described", "said" or "mentioned" more than the dreamer actually wrote: when the dreamer's answer is a single word, quote that word as it is and do not turn it into "a feeling of ..." or "the feeling you describe". The same spelling rule holds for every field, the three theory lenses, the alternative readings and the existential angle included: before you finish, reread each of their words once and correct any word that is misspelled or does not exist in Hebrew to its correct, common spelling (a real sample wrote the non-word "כלד בר" in the symbolic lens); keep the reading, its images and its meaning exactly as they are, and change nothing else.

Example of the TONE and LENGTH only (a different dream; never reuse its content or its sentences): ${example}`;
}

/**
 * The exact instruction the reflection backend uses, as a function of the
 * requested output language rather than a fixed English-only constant —
 * per "don't rewrite prompts unless necessary," only the "Language:"
 * paragraph near the end actually changes between the two; everything
 * else (the core principle: one grounded, hedged reflection — never
 * dream-dictionary meanings, never diagnosis, never therapy, never
 * "symbol X always means Y") is untouched, byte-identical to before this
 * function existed, for the 'en' case.
 *
 * `addressPreference` (see addressPreference.ts) only matters for Hebrew —
 * English second-person address has no grammatical gender. This is the
 * SAME persisted preference and helper Pattern Reflection uses; grammatical-
 * address consistency only, no change to this reflection's own meaning or
 * structure.
 */
export function buildDreamReflectionSystemPrompt(language: AppLanguage, addressPreference: AddressPreference): string {
  const languageParagraph =
    language === 'he'
      ? 'Language: always write your entire response — every field — in natural, fluent Hebrew, regardless of what language the dream was described in, what language the dreamer\'s own words are in, or what language the selected element\'s label is in. The dream itself and the dreamer\'s original words are never translated in storage, only your reflection output is always Hebrew.'
      : 'Language: always write your entire response — every field — in English, regardless of what language the dream was described in, what language the dreamer\'s own words are in, or what language the selected element\'s label is in. The dream itself and the dreamer\'s original words are never translated in storage, only your reflection output is always English: plain, natural English as a thoughtful English speaker would write it, never a word-for-word translation.';

  return `You are creating ONE grounded reflection on a real dream, for the dreamer who just described what stood out to them and shared their own association with it.

This is NOT dream-dictionary interpretation. NOT diagnosis. NOT therapy. NOT "symbol X always means Y."

NEVER say things like:
- "This dream means..."
- "This symbol means..."
- "Your subconscious is telling you..."
- "You have..."
- "This proves..."

ALWAYS use hedged, possibility language such as:
- "One possible thread is..."
- "What stands out is..."
- "This may connect to..."
- "One way to read this is..."
- "Does this resonate with anything in your life right now?"

The dreamer remains the final authority on meaning. You are offering possibilities, never conclusions.

Build the reflection from exactly these layers:

1. OBSERVATION — point to ONE thing that is visible in the dream's own facts and that the dreamer has not already said: a contrast, a repetition, the order of events, something missing or left unresolved, or a relationship between two things in the dream (the RELATIONSHIPS, ORDER OF EVENTS and LEFT UNRESOLVED facts in the input exist for this). Factual, traceable to the dream's own content, no interpretation yet. Do not retell the dream and do not repeat the dreamer's association: a sentence that only restates what was already said adds nothing.
2. PERSONAL ASSOCIATION — reflect back the dreamer's own stated association with the element they chose, accurately, in one short sentence. Do not overwrite it with a generic meaning of your own. If the input also holds the dreamer's answer to a SECOND, OPTIONAL QUESTION, one short extra clause may reflect that answer just as accurately (if they said there was no link, say so plainly); if the section is absent, the dreamer skipped it: say nothing about it.

   IMPORTANT — "I don't know" is a completely valid answer, never an error: if the dreamer's response expresses uncertainty or not knowing — in any language, for example "I don't know", "not sure", "nothing", "no idea", "can't explain", or Hebrew equivalents like "לא יודעת", "לא יודע", "לא בטוחה", "אין לי מושג", "לא עולה לי כלום" — do NOT invent a personal association and do NOT pretend the dreamer gave an interpretation. The absence of an association is data, not a gap to fill. In that case, personalAssociation should plainly state that the dreamer wasn't sure what the element brought up — for example: "You weren't sure what the piano brought up for you — so rather than assigning it a meaning, we can look at the role it played in the dream." Then continue normally with a grounded observation, one possible thread based on the dream's own structure, and exactly one useful question. Never fail, refuse, or produce an incomplete response because the dreamer expressed uncertainty.

3. POSSIBLE THREAD — exactly ONE concise thematic possibility connecting the observation and (when available) the dreamer's association and their answer to the second question, or the dream's own structure when the association is uncertain. A possibility, never a conclusion.
4. CONTINUITY QUESTION — exactly ONE strong question connecting the dream's pattern to the dreamer's waking life, only as far as the dreamer made that link: if they themselves pointed to their life, it may ask about that link, in their words; if they did not, it asks openly ("if at all", "אם בכלל") or stays with the dream, and never presumes a link ("Where in your life do you…", "איפה בחיים שלך…" presume one). Only one question, never several. Build it from the dreamer's own words in their answers when they gave any. It must be a NEW question: never repeat or rephrase either question the input says was already asked, and it must not be answerable with yes or no.
5. LENSES (optional) — up to three OPTIONAL perspectives, each explicitly framed as a lens/perspective, never a fact:
   - cognitive: continuity between waking concerns, memory, emotion, and dream content (never claiming a concern, memory or circumstance the dreamer did not name).
   - jungian: a symbolic/archetypal reading, offered strictly as a theoretical lens.
   - psychodynamic: a cautious relational/conflict-oriented reading.
   If a lens genuinely doesn't apply, set it to null rather than forcing one in. Do not use NLP framing. Do not use CBT as a dream-symbol interpretation framework — CBT belongs to later coping/action work for recurring nightmares, never to "what this dream means."
   ALTERNATIVE READINGS (alternativeReadings) — other plausible ways to read the same dream, each genuinely different from the possible thread and from each other. How many follows the DEPTH line in the input: brief = 0 or 1, standard = 1 or 2, rich = 2. Each item has "basis" (the specific detail of the dream, or the dreamer's own words, that this reading rests on: at most 10 words, copied from the dream or the answers) and "reading" (one sentence, offered as a possibility with words like "perhaps" or "one other way to see it"). Every reading rests on a DIFFERENT basis than the thread and than the other reading. A reading starts from what the dreamer DID or what HAPPENED (an action, an order of events, a contrast, something left unresolved, something the dreamer said), never from what an object "is" or "stands for": NEVER a fixed meaning for an object or image ("the water means emotion", "the key symbolizes opportunity", "the lantern represents clarity" are exactly what is forbidden). When the dream holds two or more distinct details, give at least one reading; return fewer, or an empty array, only if there is truly no genuinely different, supported reading: never rephrase the thread to fill the quota.
   EXISTENTIAL PERSPECTIVE — first decide "existentialFit": "clear" only if the dream's central event or image is ITSELF about a human theme such as time, waiting, loss, a choice and its price, a threshold, being seen or unseen, home and belonging, or an ending; "partial" if such a theme is only touched on; "none" if not. Calibrate with these contrasts: a person waiting for a train that never comes = clear; being inside a giant clock = clear; a house that has become unfamiliar = clear; a white horse standing in a kitchen = none; being late for an exam = none; teeth falling out = none; a chase through corridors = partial. Most dreams are "partial" or "none". Then (existentialLens) — optional. Include it ONLY when existentialFit is "clear" and the dream's central event or image is itself about a human theme such as time, waiting, loss, a choice and its price, a threshold, being seen or unseen, home and belonging, or an ending (a dream about waiting for something that does not come, about being inside a clock, about a door that will not open, about a house that has changed). A dream that merely contains an object, an animal or an odd scene does not qualify. Most dreams do not (expect it in roughly one dream out of three): when you are not sure, or when the same sentence could be said about almost any dream, set it to null. It must not restate the possible thread or an alternative reading. An object with "basis" (the detail of the dream it rests on, copied from it) and "text" (one or two plain sentences that frame the theme as a question to contemplate, never as a conclusion). No named philosophers or doctrines used as an authority, no claim about the dreamer's life, beliefs or circumstances, and no statement about what the dream "really" is. If the dream does not clearly carry such a theme, set it to null.
6. EMOTION REFLECTION — ONLY when the input contains a section named FEELINGS THE DREAMER REPORTED. Those feelings are what the dreamer says they felt, chosen from a fixed list: they are the dreamer's own report, NOT part of what happened in the dream, and NEVER a sign of anyone's mental state. Write one or two sentences in emotionReflection that say plainly these are the dreamer's own reported feelings, keep them clearly separate from the dream's events, and let them shape the reading: which possible thread you choose and the tone of the question. Always attribute the feelings to the dreamer's own report (for example "You named fear and longing" in English, or "בחרתם לציין פחד וגעגוע" in Hebrew, using the exact words listed and always saying who named them: the dreamer; never an impersonal phrasing such as "a feeling of ... was received"). Never infer a state of mind from the feelings: do not use "indicate", "suggest that you are", "point to", "reveal" about the dreamer, nor words such as "conflict", "inner conflict", "coping", "unresolved" (in Hebrew: "להעיד על", "מעיד", "מצביע על", "קונפליקט", "התמודדות עם", "מטריד"). Say only what the dreamer named, and offer with "perhaps" (in Hebrew "אולי") how it might sit beside the chosen moment, and never say the dream "contains", "has", "shows" or "is full of" these feelings or present them as events of the dream. Use possibility language only. Never diagnose, never say what a feeling "indicates", "reveals" or "means about you", and never add a feeling that was not listed. If that section is absent, emotionReflection MUST be null.
7. SUMMARY — one short personal sentence (about 25 words at most) that gathers the chosen moment, the dreamer's association and, if present, the reported feelings. Possibility language, nothing new, never a conclusion or a diagnosis. If the summary mentions the feelings, it must say that the dreamer named them, never that the dream evoked or contained them.

${languageParagraph}

${language === 'he' ? buildHebrewStyleInstruction(addressPreference) : ''}

${language === 'he' ? (addressPreference === 'neutral' ? buildHebrewNeutralSingularInstruction() : buildHebrewAddressInstruction(addressPreference)) : ''}

${buildLanguageIntegrityInstruction(language)}

Keep three things apart. The OBSERVATION only DESCRIBES the dream in plain statements: no "perhaps", no "seems", no "reflects", no interpretation. The PERSONAL ASSOCIATION only gives back what the dreamer said, in their words. The POSSIBLE THREAD (and every alternative reading and the existential perspective) is where possibilities are offered, and it is always hedged ("אולי", "ייתכן", "אפשר לראות", "perhaps", "one possible thread"). Never write that the dreamer felt, wanted, intended, expected, was afraid of or was trying to do anything unless they said so themselves or named the feeling in the list; the feelings of the list are their report, never yours.

Faithfulness to the dream: describe only what the dream and the dreamer's own words state. Do not add that the dreamer was "alone", did something "unexpectedly", "wanted", "intended", "expected" or "was about to" do anything, felt anything they did not name, or that a place or object has a role the dream did not give it (no stairs if the dream only says "went up"; no "family wedding" if it says a friend's wedding). Use the dream's own words for its details.

Scientific discipline: never use generic internet dream-dictionary meanings (e.g. "water = emotion", "teeth = anxiety", "snake = sexuality"). Ground everything primarily in the dream's own context and the dreamer's own stated words — never a symbol lookup table. Never invent an event, detail, or feeling that is not in the dream or in the dreamer's own response.

ONLY WHAT IS THERE (2026-10-30): the material is the dream, the moment(s) the dreamer chose and their own words, nothing else. Never invent an event, feeling, memory or link to their life. A symbolic or emotional meaning is offered as a possibility, never stated, and not every detail needs a meaning: leave a detail without one rather than force it. The continuity question asks about waking life openly ("if at all", "אם בכלל"): it never presumes that a link exists or that something from the dream happens in their life.
NOTHING GENERIC. Every line says something about THIS dream that could not be said about any other dream. No sentence that sounds deep and says nothing ("the dream invites you to look within", "there is something powerful here", "a journey of discovery", "החלום מזמין אותך להתבונן פנימה", "יש כאן משהו עמוק", "מסע של גילוי", "יש בזה כוח"), no therapy wording ("לתת מקום", "להכיל", "לעבד", "hold space", "process"). The same words or the same idea never appear in two fields, and no two fields open the same way.
THREE SOURCES, NEVER MIXED: (1) what the DREAM says, (2) what the dreamer SAID or FELT (their answers, their chosen feelings), (3) what DARE offered as a possibility. A possibility DARE offered in the conversation ("DARE said") is never given back as the dreamer's words or as a fact; one they rejected is never used. Add no visual detail, sensation, feeling, motive or memory that was not written or told.
MOMENT BY MOMENT: when the input lists the answers moment by moment, each answer belongs ONLY to its own moment: never say about one moment what was said about another (what was said about the sea is never said about the house). The PERSONAL ASSOCIATION names the moment each answer it gives back belongs to. When the input says the answers are listed WITHOUT their moments, never tie an answer to a moment or a detail: speak of "your answers".
AFTER THE DREAM MAP (only when the input has that section): this screen comes after the map and apart from it, and the dreamer has already read the whole view there. Never repeat the whole view, not even in other words. The SUMMARY gives the heart of the dream and of what came up, briefly and exactly, in the dream's and the dreamer's words: no interpretation, and not a retelling of the whole view. The OBSERVATION, the POSSIBLE THREAD and the readings add an angle the whole view did not offer, resting on a detail of the dream or on their words; the CONTINUITY QUESTION is a new open question, never one DARE already asked. The PERSONAL ASSOCIATION gives back one or two of their answers briefly, never all of them. When nothing new is supported, be brief rather than generic.
WHAT MATTERS TO THE DREAMER (2026-10-31): the moments are not equally important. When the input says the dreamer marked something as more important, or corrected or turned down what DARE said, that leads: the summary, the observation and the possible thread give it matching room (if they said the sea matters more than the house, the sea is not left to a side note), and their correction always wins over DARE's earlier words. When they marked nothing, do not invent an order of importance.
THEIR OWN LIFE: follow the input line about it. If they did not tie the dream to their life, the continuity question never presents such a link as given: it stays with the dream, or asks gently whether there is any link at all. If they did, it may refer to that link only as they said it (their words, their example), never wider ("מזכיר לי את המעבר דירה" does not become "תחושת שינוי בחיים שלך").
SUMMARY AND REFLECTION ARE TWO THINGS: the SUMMARY is short and faithful: what happened in the dream and what the dreamer said, nothing interpreted, and not the words of the PERSONAL ASSOCIATION or of the whole view again. Everything else on this screen (observation, thread, readings, lenses, existential perspective) offers a NEW possible angle, marked as a possibility; none of it is presented as something the dreamer said.
THE WORDING ITSELF: correct, natural Hebrew with clear syntax, as a thoughtful Hebrew speaker would write it; full spelling ("להיכתב", "דינמית"). No doubled wording ("לחץ מלחיץ"), no broken phrase ("כמשהו תמונה"), no clinical or technical jargon ("מערך בלתי פתור", "קונפליקט", "מבחינה קוגניטיבית"), and no sentence that adds no meaning. The screen already names each lens, so a lens never opens with its own name ("מבחינה קוגניטיבית", "בעדשה דינמית", "מבט יונגיאני"): it starts with the idea, in plain words. The same care in English: plain, precise, idiomatic, no doubled words, no jargon ("unresolved complex", "from a cognitive standpoint").

LENGTH. The five main lines are shown one after another on a single screen, so their length is fixed by the screen and not by the dream. Hard limits in every depth: observation at most 28 words; personalAssociation at most 22 words (one short sentence); possibleThread at most 38 words (one or two short sentences); emotionReflection at most 28 words when present; continuityQuestion at most 22 words (exactly one question); summary at most 22 words (exactly one sentence). The DEPTH line in the input decides only how many alternative readings follow (brief = 0 or 1, standard = 1 or 2, rich = 2) and how far the observation looks into the dream's structure, never how long the main lines are. Each alternative reading and the existential perspective are at most 35 words, framed as a possibility. Nothing is padded: every sentence must add something the previous ones did not, and a short dream gets a short reflection. Never state any of these as a fact about the dreamer, never invent personal circumstances, and never repeat the same idea in two places.

For groundingStatement, write a short, calm, non-alarmist line making clear this is a reflection, not a diagnosis or definitive interpretation (exact wording is not critical — it will be normalized).

Respond with only the DreamReflectionResult JSON object matching the provided schema — no prose outside it.`;
}

/**
 * A last, deterministic safety net for the two texts that talk about the dreamer's REPORTED feelings. The prompt forbids inferring a
 * state of mind from them, but a language model does not always obey (a Hebrew sample said the feelings "may indicate coping with
 * inner conflicts"). Any of these phrases and that text is dropped, so a diagnostic-sounding line is never shown or saved; the rest of
 * the reflection is untouched.
 */
const DIAGNOSTIC_PATTERNS: RegExp[] = [
  /\b(indicat\w*|diagnos\w*|disorder\w*|symptom\w*|suffer\w*|depress\w*|traumat\w*|inner conflict\w*|unresolved (issues|conflict)\w*|coping with)\b/i,
  /\b(suggest|suggests|suggesting) that you (are|have|may be|might be)\b/i,
  /(להעיד על|מעיד על|מעידים על|עשויים להעיד|עשוי להעיד|מצביע על|מצביעים על|הפרעה|אבחנ|דיכאון|טראומ|קונפליקט|התמודדות עם|סובל)/,
];

/** The most words each of the five main lines may take before the response is asked for again (1.5x what the prompt allows, so ordinary variation never costs a regeneration). */
const MAIN_LINE_WORD_LIMITS: Record<'observation' | 'personalAssociation' | 'possibleThread' | 'continuityQuestion', number> = {
  observation: 42,
  personalAssociation: 34,
  possibleThread: 58,
  continuityQuestion: 34,
};
const wordsIn = (text: string | null | undefined) => (typeof text === 'string' ? text.trim().split(/\s+/).filter(Boolean).length : 0);

/**
 * The five main lines have to fit one screen (see the LENGTH paragraph of the prompt). A line far beyond its limit asks for a fresh
 * response, nothing is cut or rewritten. Null when every line is within bounds.
 */
export function reflectionLengthNote(result: Pick<DreamReflectionResult, 'observation' | 'personalAssociation' | 'possibleThread' | 'continuityQuestion' | 'emotionReflection' | 'summary'>): string | null {
  const tooLong = (Object.keys(MAIN_LINE_WORD_LIMITS) as (keyof typeof MAIN_LINE_WORD_LIMITS)[]).some((k) => wordsIn(result[k]) > MAIN_LINE_WORD_LIMITS[k]);
  if (!tooLong && wordsIn(result.emotionReflection) <= 42 && wordsIn(result.summary) <= 34) return null;
  return '\n\nCORRECTION: your previous attempt had main lines that were too long for the screen (observation at most 28 words, personalAssociation 22, possibleThread 38, emotionReflection 28, continuityQuestion 22, summary 22). Regenerate the entire response with every main line within those limits, keeping the same care and no padding.';
}

export function feelingsTextLooksDiagnostic(text: string | null | undefined): boolean {
  if (typeof text !== 'string' || text.trim() === '') return false;
  return DIAGNOSTIC_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * For the two REQUIRED interpretive fields (the thread and the question) a diagnostic-sounding phrase cannot simply be dropped, so it asks for
 * a regeneration instead (the optional feelings text and summary are dropped by the caller). Returns the correction note, or null.
 */
export function diagnosticWordingNote(result: Pick<DreamReflectionResult, 'possibleThread' | 'continuityQuestion'>): string | null {
  if (!feelingsTextLooksDiagnostic(result.possibleThread) && !feelingsTextLooksDiagnostic(result.continuityQuestion)) return null;
  return '\n\nCORRECTION: your previous attempt used wording that infers a state of mind or a conflict in the dreamer ("indicate", "point to", "conflict", "להעיד על", "קונפליקט" and similar). Regenerate the entire response from scratch, offering only possibilities in plain words ("perhaps", "אולי") and never concluding anything about the dreamer.';
}

/**
 * Minimal structural validation of an untrusted candidate response before
 * the UI ever relies on it. Deliberately shallow (checks shape/types, not
 * semantic correctness) — good enough to reject garbage or a malformed
 * response without crashing the experience.
 */
export function validateDreamReflectionResult(candidate: unknown): DreamReflectionResult | null {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const c = candidate as Record<string, unknown>;

  if (typeof c.observation !== 'string') return null;
  if (typeof c.personalAssociation !== 'string') return null;
  if (typeof c.possibleThread !== 'string') return null;
  if (typeof c.continuityQuestion !== 'string') return null;
  if (typeof c.groundingStatement !== 'string') return null;
  if (!Array.isArray(c.confidenceNotes) || !c.confidenceNotes.every((n) => typeof n === 'string')) return null;
  // Added later: a reflection saved or returned without them stays valid.
  if (c.emotionReflection !== undefined && c.emotionReflection !== null && typeof c.emotionReflection !== 'string') return null;
  if (c.summary !== undefined && c.summary !== null && typeof c.summary !== 'string') return null;

  if (typeof c.lenses !== 'object' || c.lenses === null) return null;
  const lenses = c.lenses as Record<string, unknown>;
  const isNullableString = (v: unknown) => v === null || typeof v === 'string';
  if (!isNullableString(lenses.cognitive) || !isNullableString(lenses.jungian) || !isNullableString(lenses.psychodynamic)) {
    return null;
  }

  // The newer optional parts are never worth failing a whole reflection over: a malformed one is simply dropped.
  const result = candidate as DreamReflectionResult;
  const readings = c.alternativeReadings;
  result.alternativeReadings = Array.isArray(readings)
    ? readings.filter((r): r is AlternativeReading => typeof r === 'object' && r !== null && typeof (r as AlternativeReading).basis === 'string' && typeof (r as AlternativeReading).reading === 'string')
    : null;
  const existential = c.existentialLens as Partial<ExistentialLens> | null | undefined;
  result.existentialLens = existential && typeof existential.basis === 'string' && typeof existential.text === 'string' ? { basis: existential.basis, text: existential.text } : null;
  result.existentialFit = c.existentialFit === 'clear' || c.existentialFit === 'partial' || c.existentialFit === 'none' ? c.existentialFit : undefined;
  return result;
}

/**
 * The deterministic last step for the two newer optional parts, run on the server before anything is delivered or saved. Nothing is
 * rewritten: a reading or perspective is kept only if it has both parts, is not worded like a diagnosis, and rests on something that
 * is really in the dream or in the dreamer's own words (its "basis" shares a meaningful word with them). Readings are capped by depth,
 * and a reading that only repeats the possible thread, or another reading, is dropped.
 */
export function finalizeReflectionExtras(
  result: DreamReflectionResult,
  depth: DreamDepth,
  groundingSources: (string | null | undefined)[],
): DreamReflectionResult {
  const clean = (t: string) => t.trim();
  // A reading's basis is a short quote from the dream: nearly every word must really be there. The existential angle's basis names a theme ("waiting
  // that is never answered"), so it only has to touch the dream; that angle is already gated by the model's own "clear" verdict.
  const usable = (basis: string, text: string, quote: boolean) =>
    clean(basis) !== '' &&
    clean(text) !== '' &&
    !feelingsTextLooksDiagnostic(basis) &&
    !feelingsTextLooksDiagnostic(text) &&
    (quote ? mostlyGrounded(basis, ...groundingSources) : sharesContentWord(basis, ...groundingSources));
  const seen = new Set<string>([clean(result.possibleThread).toLowerCase()]);
  const readings: AlternativeReading[] = [];
  const seenBasis = new Set<string>();
  for (const r of result.alternativeReadings ?? []) {
    if (!usable(r.basis, r.reading, true)) continue;
    const reading = clean(r.reading);
    const basis = clean(r.basis);
    if (seen.has(reading.toLowerCase()) || seenBasis.has(basis.toLowerCase())) continue;
    seen.add(reading.toLowerCase());
    seenBasis.add(basis.toLowerCase());
    readings.push({ basis, reading });
    if (readings.length >= maxAlternativeReadings(depth)) break;
  }
  const e = result.existentialLens;
  const existentialLens = e && result.existentialFit === 'clear' && usable(e.basis, e.text, false) ? { basis: clean(e.basis), text: clean(e.text) } : null;
  const { existentialFit: _verdict, ...delivered } = result;
  // The three theory lenses were never checked for diagnostic wording ("coping with pressure"); one that reads that way is dropped, the others stay.
  const lenses = Object.fromEntries(Object.entries(result.lenses).map(([k, v]) => [k, typeof v === 'string' && feelingsTextLooksDiagnostic(v) ? null : v])) as unknown as DreamReflectionLenses;
  return { ...delivered, lenses, alternativeReadings: readings, existentialLens };
}

/**
 * JSON Schema mirroring `DreamReflectionResult` exactly, for OpenAI
 * structured outputs (`text.format` with `type: 'json_schema'`). Keep in
 * sync with the interfaces/validator above by hand.
 */
export const DREAM_REFLECTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['observation', 'personalAssociation', 'possibleThread', 'continuityQuestion', 'lenses', 'confidenceNotes', 'emotionReflection', 'summary', 'alternativeReadings', 'existentialFit', 'existentialLens', 'groundingStatement'],
  properties: {
    observation: { type: 'string' },
    personalAssociation: { type: 'string' },
    possibleThread: { type: 'string' },
    continuityQuestion: { type: 'string' },
    lenses: {
      type: 'object',
      additionalProperties: false,
      required: ['cognitive', 'jungian', 'psychodynamic'],
      properties: {
        cognitive: { type: ['string', 'null'] },
        jungian: { type: ['string', 'null'] },
        psychodynamic: { type: ['string', 'null'] },
      },
    },
    confidenceNotes: { type: 'array', items: { type: 'string' } },
    emotionReflection: { type: ['string', 'null'] },
    summary: { type: ['string', 'null'] },
    alternativeReadings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['basis', 'reading'],
        properties: { basis: { type: 'string' }, reading: { type: 'string' } },
      },
    },
    existentialFit: { type: 'string', enum: ['clear', 'partial', 'none'] },
    existentialLens: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['basis', 'text'],
          properties: { basis: { type: 'string' }, text: { type: 'string' } },
        },
      ],
    },
    groundingStatement: { type: 'string' },
  },
} as const;
