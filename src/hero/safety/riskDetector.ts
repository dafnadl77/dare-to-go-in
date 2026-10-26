/**
 * THE RISK DETECTOR (doc 106, stage א; her requirement of 2026-10-24). Code, not model instructions: it works with no model and no
 * network, the same in the browser and on the server. It finds, in Hebrew and in English:
 *   - a wish to die, or intent to harm oneself (concern);
 *   - a request for ways or means (concern, kind "instructions"), also inside a "story";
 *   - immediate danger: something already done, "going to", or intent together with means, a plan or "now" (danger);
 *   - a threat to another person (threat);
 * through the common ways of writing around a filter (vowel signs, letters spaced or dotted, repeated letters, digits for letters,
 * slang). It tells a dream apart from real life: the dream's own text is a dream unless it says otherwise ("במציאות", "לאחרונה"…);
 * in her answers, what she felt "there" or "in the dream" is asked about gently (uncertain), never assumed.
 *
 * It returns a level only — never stored, never logged (doc 106, privacy). Words that only sound like it ("מתה על", "מתתי מצחוק",
 * "למות מבושה", "הורג אותי") are not it.
 */

export type RiskLevel = 'none' | 'uncertain' | 'concern' | 'danger' | 'threat';
export type RiskKind = 'wish-to-die' | 'self-harm' | 'instructions' | 'danger' | 'threat-to-others';
export interface RiskVerdict {
  level: RiskLevel;
  kinds: RiskKind[];
}
/** What she answered on the distress path: "it was in the dream", or "I am not in immediate danger". */
export type SafetyAck = 'dream' | 'not-immediate';
export const SAFETY_ACKS: readonly SafetyAck[] = ['dream', 'not-immediate'];

const RANK: Record<RiskLevel, number> = { none: 0, uncertain: 1, concern: 2, threat: 3, danger: 4 };
export const higher = (a: RiskLevel, b: RiskLevel): RiskLevel => (RANK[a] >= RANK[b] ? a : b);

// ------------------------------------------------------------------------------------------------ writing around a filter

const FINALS: Record<string, string> = { ם: 'מ', ן: 'נ', ץ: 'צ', ף: 'פ', ך: 'כ' };
const LEET: Record<string, string> = { '1': 'i', '3': 'e', '0': 'o', '4': 'a', '@': 'a', $: 's', '5': 's', '7': 't' };
const SLANG: [RegExp, string][] = [
  [/\bkms\b/g, 'kill myself'],
  [/\bunalive\b/g, 'kill'],
  [/\bsewer ?slide\b/g, 'suicide'],
];

/** One way of writing, whatever way it was written. Exported for the tests of the output check. */
export function normalize(text: string): string {
  let t = text
    .replace(/[​-‏‪-‮⁠﻿]/g, '')
    .replace(/־/g, ' ') // maqaf
    .replace(/[֑-ׇ]/g, '') // vowel signs and cantillation
    .toLowerCase();
  // a word written with letters separated by dots or dashes: "ל.ה.ת.א.ב.ד", "ל-מ-ו-ת"
  t = t.replace(/(?<![\p{L}])(\p{L})((?:[.\-_*·]\p{L}){2,})(?![\p{L}])/gu, (m) => m.replace(/[.\-_*·]/g, ''));
  // a word written with spaced letters: "d i e", "א נ י"; two spaces or more keep words apart
  t = t
    .split(/\s{2,}/)
    .map((group) => group.replace(/(?<!\S)(\p{L})(?: (\p{L})(?!\S)){1,}/gu, (m) => m.replace(/ /g, '')))
    .join(' ');
  // digits and signs for Latin letters, only inside Latin words
  t = t.replace(/\S*[a-z]\S*/g, (w) => w.replace(/[1304@$57]/g, (c) => LEET[c] ?? c));
  for (const [re, to] of SLANG) t = t.replace(re, to);
  t = t.replace(/(\p{L})\1{2,}/gu, '$1'); // "להתאבדדדד"
  t = t.replace(/[םןץףך]/g, (c) => FINALS[c]);
  return t.replace(/\s+/g, ' ').trim();
}

/** A pattern written in ordinary Hebrew, matched against normalized text (final letters folded the same way). */
const P = (source: string) => new RegExp(source.replace(/[םןץףך]/g, (c) => FINALS[c]), 'u');
const H = '(?<![א-ת])(?:[ושכ]{0,2})'; // a Hebrew word's start, allowing "ו", "ש", "כש"…

// ------------------------------------------------------------------------------------------------ what is looked for

const IDIOM_AFTER_DIE = '(?!\\s+מ(?:בושה|צחוק|פחד|רעב|עייפות|קנאה|סקרנות|אהבה|שעמום))';
const WISH = [
  P(`${H}(?:רוצה|רוצים|רוצות|בא\\s+לי|מתחשק\\s+לי|רציתי|ארצה|הייתי\\s+רוצה|מעדיפה|מעדיף)\\s+(?:פשוט\\s+|כבר\\s+)?למות${IDIOM_AFTER_DIE}`),
  P(`${H}הלוואי\\s+(?:[שו]?הייתי\\s+(?:מת|מתה)|[שו]?(?:לא\\s+)?הייתי\\s+(?:קיים|קיימת|נולד|נולדת)|[שו]?לא\\s+נולדתי|[שו]?אמות)`),
  P(`${H}הלוואי\\s+[שו]?לא\\s+(?:אתעורר|אקום)`),
  P(`${H}אין\\s+(?:לי\\s+)?(?:בשביל\\s+מה|טעם|סיבה|כוח)\\s+(?:ל|ה)?(?:חיות|המשיך\\s+לחיות|המשיך)`),
  P(`${H}(?:לא|כבר\\s+לא)\\s+רוצה\\s+(?:להמשיך\\s+)?לחיות`),
  P(`${H}נמאס\\s+לי\\s+(?:מה)?(?:חיים|לחיות)`),
  P(`${H}(?:לסיים|לגמור)\\s+(?:עם\\s+)?(?:ה)?כל(?![א-ת])`),
  P(`${H}(?:לגמור|לסיים)\\s+עם\\s+עצמי`),
  P(`${H}לסיים\\s+את\\s+(?:ה)?חיים`),
  P(`${H}לשים\\s+(?:לזה\\s+|לכל\\s+זה\\s+|לחיים\\s+)?(?:סוף|קץ)(?![א-ת])`),
  P(`${H}(?:יהיו|יהיה|ייטב|טוב)\\s+(?:יותר\\s+)?(?:טוב\\s+)?(?:יותר\\s+)?(?:לכולם\\s+)?בלעדיי`),
  P(`${H}להיעלם\\s+(?:לתמיד|לנצח|מהעולם|מהחיים)`),
  P(`${H}(?:מקווה|מקווים)\\s+[ש]?לא\\s+(?:אתעורר|אקום)`),
  P(`${H}לא\\s+רוצה\\s+להתעורר\\s+(?:יותר|אף\\s+פעם|מחר|בבוקר|שוב)`),
  // the focused round (doc 110, section 3): indirect ways of saying it, each bound to what makes it real
  P(`${H}(?:חושב|חושבת|רוצה|הולך|הולכת|מתכנן|מתכננת)\\s+לבלוע\\s+(?:את\\s+)?(?:כל\\s+)?(?:ה)?(?:כדורים|תרופות|כדורי)`),
  P(`${H}להירדם\\s+ולא\\s+(?:לקום|להתעורר)`),
  P(`${H}(?:נרדמת|נרדם|להירדם|לישון)\\s+(?:לתמיד|לנצח)`),
  P(`${H}נטל\\s+על\\s+(?:כולם|כל\\s+העולם|המשפחה|כולכם)`),
  P(`${H}עדיף\\s+(?:ש)?(?:אעלם|לא\\s+אהיה)(?=\\s*$|\\s*[.,!?]|\\s+(?:פה|כאן|בעולם|יותר|בחיים|כבר))`),
  P(`${H}(?:אף\\s+אחד|איש)\\s+לא\\s+(?:ישים\\s+לב|יתגעגע|ירגיש|יחסר)\\s+(?:\\S+\\s+){0,2}?(?:אם|כש)\\s*(?:אני\\s+)?(?:לא\\s+אהיה|אעלם|אמות|איעלם)`),
  P(`${H}(?:לעשות|לשים)\\s+(?:סוף|קץ)\\s+(?:ל)?(?:סיפור\\s+שלי|חיים\\s+שלי|חיי|עצמי)`),
  P(`${H}נמאס\\s+לי\\s+מ(?:ה)?כל.{0,40}(?:ייגמר|ייפסק|יסתיים)`),
  P(`${H}להיעלם\\s+ולא\\s+לחזור`),
  P(`${H}(?:חילקתי|נתתי|מסרתי)\\s.{0,40}לא\\s+(?:אצטרך|אזדקק)`),
  P(`${H}(?:אספתי|אוספת|אוסף|צברתי|צוברת|שמרתי\\s+בצד)\\s+(?:\\S+\\s+){0,2}?(?:כדורים|תרופות|כדורי\\s+שינה)`),
  // Hebrew written in Latin letters
  /\b(?:rotz[ae]h?|rotsa|rotse|ba\s+li|mevakesh(?:et)?)\s+(?:lamut|lamoot|lehitabed)\b/,
  /\blo\s+rotz[ae]h?\s+li?chyot\b/,
  /\b(?:want|wanna|wanted)\s+to\s+die\b/,
  /\bwish\s+i\s+(?:was|were)\s+(?:dead|never\s+born|not\s+alive)\b/,
  /\b(?:kill|killing|end|ending)\s+(?:myself|my\s+life|it\s+all)\b/,
  /\btake\s+my\s+(?:own\s+)?life\b/,
  /\bdon'?t\s+want\s+to\s+(?:live|be\s+alive|exist)\b/,
  /\bno\s+(?:reason|point)\s+(?:to|in)\s+(?:live|living|go\s+on)\b/,
  /\bbetter\s+off\s+without\s+me\b/,
  /\bhope\s+i\s+(?:don'?t|never)\s+wake\s+up\b/,
  /\bready\s+to\s+die\b/,
];
/** The word itself: explicit enough to ask about even inside a dream. */
const SUICIDE_WORD = [P(`${H}(?:להתאבד|התאבדות|התאבדתי|מתאבד|מתאבדת|אובדני|אובדנית|אובדניות|אובדנות)(?![א-ת])`), /\bsuicid(?:e|al)\b/];
const SELF_HARM = [
  P(`${H}(?:לפגוע|פוגע|פוגעת|פגעתי|אפגע)\\s+בעצמי`),
  P(`${H}(?:לחתוך|חותך|חותכת|חתכתי|אחתוך)\\s+(?:את\\s+)?(?:עצמי|הידיים|היד|הוורידים|הורידים|הזרוע)`),
  P(`${H}(?:לשרוף|שורפת|שורף)\\s+את\\s+עצמי`),
  /\b(?:cut|cutting|hurt|hurting|harm|harming|burn|burning)\s+myself\b/,
  /\bself[- ]?harm/,
];
const INSTRUCTIONS = [
  P(`${H}(?:איך|כמה|באיזו\\s+דרך|מה\\s+הדרך|מה\\s+הכי)\\s+(?:\\S+\\s+){0,5}?(?:להתאבד|למות|לחתוך|לתלות|כדורים|כדורי\\s+(?:שינה|הרגעה)|לקפוץ|להרוג\\s+את\\s+עצמי|לפגוע\\s+בעצמי)`),
  P(`${H}כמה\\s+(?:\\S+\\s+){0,4}?(?:כדי\\s+)?לא\\s+להתעורר`),
  P(`${H}מאיזה\\s+גובה\\s+(?:\\S+\\s+){0,3}?(?:לקפוץ|ליפול)`),
  /\b(?:which|what)\s+(?:pills|meds|medications|drugs)\s+(?:are|is)\s+(?:deadly|lethal|fatal)\b/,
  /\b(?:how|what'?s\s+the\s+(?:easiest|best|quickest|fastest|least\s+painful)\s+way|how\s+many|how\s+much)\s+(?:\S+\s+){0,6}?(?:to\s+die|kill\s+(?:myself|himself|herself|yourself|oneself)|suicide|overdose|cut\s+(?:myself|deep)|hang\s+(?:myself|yourself))/,
];
const ACT_DONE = [P(`${H}(?:לקחתי|בלעתי)\\s+(?:\\S+\\s+){0,3}?(?:ה)?(?:כדורים|תרופות|גלולות|כדורי)`), /\b(?:took|swallowed)\s+(?:\S+\s+){0,4}?(?:pills|meds|tablets)\b/, /\boverdosed\b/];
const GOING_TO = [
  P(`${H}(?:הולך|הולכת|עומד|עומדת|מתכנן|מתכננת)\\s+(?:ל)?(?:התאבד|קפוץ|מות|ירות\\s+בעצמי|תלות\\s+את\\s+עצמי)`),
  /\b(?:going|gonna|about)\s+to\s+(?:kill\s+myself|jump|end\s+it|die)\b/,
];
const JUMP_INTENT = [P(`${H}(?:רוצה|הולך|הולכת|עומד|עומדת)\\s+לקפוץ`), /\b(?:want|going|gonna)\s+to\s+jump\b/];
const HIGH_PLACE = [P(`${H}(?:גג|הגג|גשר|הגשר|מרפסת|חלון|צוק)`), /\b(?:roof|bridge|balcony|window|cliff|ledge)\b/];
const READY = [P(`${H}(?:מוכן|מוכנה)(?![א-ת])`), /\bready\b/];
const MEANS = [P(`${H}(?:כדורים|כדורי|גלולות|תרופות|חבל|לתלות|סכין|אקדח|נשק|רובה|סכין\\s+גילוח)(?![א-ת])`), /\b(?:pills|rope|gun|knife|razor|blade|overdose)\b/];
/** Imminent, not ongoing: "גם עכשיו" / "now too" says it is real, not that it is happening this minute. */
const NOW = [P(`${H}(?:הלילה|היום|ממש\\s+עכשיו|כבר\\s+עכשיו|עוד\\s+מעט|בעוד\\s+(?:רגע|שעה))(?![א-ת])`), /\b(?:right\s+now|tonight|today|in\s+a\s+(?:minute|moment|few\s+minutes))\b/];
const PLAN = [P(`${H}(?:תכננתי|תוכנית|מכתב\\s+פרידה|נפרדתי\\s+מכולם|הכנתי\\s+הכל)`), /\b(?:a\s+plan|suicide\s+note|goodbye\s+(?:letter|note))\b/];
/** Letters left for everyone and an end named: a plan, said as one thing ("כתבתי לכולם מכתבים, מחר זה נגמר"). */
const LETTERS_AND_END = [P(`${H}(?:כתבתי|השארתי)\\s+(?:\\S+\\s+){0,2}?מכתב(?:ים)?.{0,40}(?:זה|הכל)\\s+(?:נגמר|ייגמר|יסתיים|הסוף)`)];
const THREAT = [
  P(`${H}(?:(?:הולך|הולכת|רוצה|מתכנן|מתכננת|אני)\\s+)?(?:להרוג|לרצוח|לפגוע|לדקור|לירות)\\s+(?:אות(?:ו|ה|ם|ן)|ב(?:ו|ה|הם|הן)(?![א-ת])|ב(?!עצמי)\\S+)`),
  P(`${H}(?:אהרוג|ארצח|אפגע|אדקור|אירה)\\s+(?:אות(?:ו|ה|ם|ן)|ב(?:ו|ה|הם|הן)(?![א-ת])|ב(?!עצמי)\\S+)`),
  /\b(?:going\s+to|gonna|will|want\s+to|i'?ll)\s+(?:kill|stab|shoot|hurt)\s+(?:him|her|them|my\s+\w+|someone|you)\b/,
];
/** Threats said without a word of killing, in the first person, about someone real (each bound to its own ending). */
const THREAT_DIRECT = [
  P(`${H}(?:אדאג|אוודא)\\s+ש\\S*\\s*(?:\\S+\\s+){0,2}?לא\\s+(?:יקום|תקום|יקומו|ינשום|תנשום|ינשמו|יחיה|תחיה|יחיו)\\s+(?:יותר|לעולם|שוב)`),
  P(`${H}אעשה\\s+ל(?:ו|ה|הם|הן)\\s+משהו\\s+ש(?:הוא\\s+|היא\\s+|הם\\s+)?לא\\s+(?:ישכח|תשכח|ישכחו)`),
  P(`${H}(?:ישלם|תשלם|ישלמו)\\s+על\\s+זה.{0,40}(?:יודע|יודעת)\\s+איפה\\s+(?:הוא|היא|הם)\\s+(?:גר|גרה|גרים)`),
  P(`${H}אשבור\\s+ל(?:ו|ה|הם|הן)\\s+את\\s+(?:ה)?(?:פנים|ראש|עצמות|רגליים|ידיים|אף)`),
];
/** The threat needs intent of hers: "הוא הרג אותה" is something seen, not a threat. */
const THREAT_INTENT = [P(`${H}(?:הולך|הולכת|רוצה|מתכנן|מתכננת|אהרוג|ארצח|אפגע|אדקור|אירה|יש\\s+לי\\s+(?:סכין|אקדח|נשק))`), /\b(?:going\s+to|gonna|will|want\s+to|i'?ll)\b/];

/** Said about real life: then a dream's words count as hers, now. */
const REALITY = [
  P(`${H}(?:במציאות|ביום[\\s-]יום|לאחרונה|בזמן\\s+האחרון|כבר\\s+(?:תקופה|זמן|שבועות|חודשים)|כל\\s+השבוע|השבוע|כל\\s+הזמן|גם\\s+עכשיו|עכשיו|גם\\s+כשאני\\s+ער(?:ה)?|כשאני\\s+ער(?:ה)?|בחיים\\s+האמיתיים|לא\\s+בחלום|האמת\\s+ש|לפני\\s+שנרדמתי|לפני\\s+שהלכתי\\s+לישון|לפני\\s+השינה|אחרי\\s+שהתעוררתי|כשהתעוררתי)`),
  // before falling asleep and after waking are real life, not the dream
  /\b(?:in\s+real\s+life|irl|lately|recently|these\s+days|for\s+(?:weeks|months)|when\s+i'?m\s+awake|all\s+the\s+time|even\s+now|right\s+now|not\s+in\s+the\s+dream|before\s+i\s+(?:fell\s+asleep|went\s+to\s+(?:bed|sleep))|(?:after|when)\s+i\s+woke\s+up)\b/,
];
/** About the dream, or about how she felt there. */
const DREAM_REF = [P(`${H}(?:בחלום|חלמתי|חולמת|חולם|בתוך\\s+החלום|ברגע\\s+ההוא|באותו\\s+רגע)(?![א-ת])|(?<![א-ת])שם(?![א-ת])`), /\b(?:in\s+the\s+dream|in\s+my\s+dream|i\s+dreamt|i\s+dreamed)\b/];
const FELT_THEN = [P(`${H}(?:הרגשתי|רציתי|חשבתי|הרגיש|הרגישה)(?![א-ת])`), /\b(?:i\s+felt|i\s+wanted|it\s+felt)\b/];

const any = (res: readonly RegExp[], t: string) => res.some((r) => r.test(t));

// ------------------------------------------------------------------------------------------------ the verdict

export function detectRisk(text: string, context: 'dream' | 'answer'): RiskVerdict {
  const all = normalize(text ?? '');
  if (!all) return { level: 'none', kinds: [] };
  const reality = any(REALITY, all);
  const sentences = all.split(/(?<=[.!?…\n])\s+|[;\n]/).map((s) => s.trim()).filter(Boolean);
  const kinds = new Set<RiskKind>();
  let level: RiskLevel = 'none';
  const raise = (l: RiskLevel, ...k: RiskKind[]) => {
    level = higher(level, l);
    for (const x of k) kinds.add(x);
  };
  for (const s of sentences) {
    const wish = any(WISH, s);
    const word = any(SUICIDE_WORD, s);
    const self = any(SELF_HARM, s);
    const asks = any(INSTRUCTIONS, s);
    const threat = (any(THREAT, s) && any(THREAT_INTENT, s)) || any(THREAT_DIRECT, s);
    const intent = wish || word || self;
    const danger =
      any(ACT_DONE, s) ||
      any(LETTERS_AND_END, s) ||
      any(GOING_TO, s) ||
      (any(JUMP_INTENT, s) && any(HIGH_PLACE, s)) ||
      (any(READY, s) && any(MEANS, s)) ||
      (intent && (any(MEANS, s) || any(NOW, s) || any(PLAN, s))) ||
      (any(PLAN, s) && any(MEANS, s));
    if (!(intent || asks || threat || danger)) continue;
    // a way or a means asked for is never answered, wherever it is asked
    if (asks) raise('concern', 'instructions');
    const aboutTheDream = context === 'dream' ? !reality : !reality && (any(DREAM_REF, s) || any(FELT_THEN, s));
    if (aboutTheDream) {
      // in the dream, or how she felt there: asked about gently when the words are explicit, never assumed
      if (context === 'answer' || word || self) raise('uncertain');
      continue;
    }
    if (danger) raise('danger', 'danger');
    else if (threat) raise('threat', 'threat-to-others');
    if (wish || word) raise('concern', 'wish-to-die');
    if (self) raise('concern', 'self-harm');
  }
  return { level, kinds: [...kinds] };
}

/**
 * The gate the server and the browser both apply before a model is asked anything (doc 106): immediate danger or a threat anywhere
 * in her words of this journey stops it for good; in her latest words, concern goes on only after "not in immediate danger", and an
 * uncertain moment after "it was in the dream" (or "not in immediate danger"). Nothing here is stored.
 */
export function safetyGate(p: { latest: string | null; earlier: readonly string[]; ack: SafetyAck | null }): { allowed: boolean; level: RiskLevel; kinds: RiskKind[] } {
  let stop: RiskVerdict = { level: 'none', kinds: [] };
  for (const t of p.earlier) {
    const v = detectRisk(t, 'answer');
    if (v.level === 'danger' || v.level === 'threat') stop = RANK[v.level] > RANK[stop.level] ? v : stop;
  }
  const now = p.latest ? detectRisk(p.latest, 'answer') : { level: 'none' as RiskLevel, kinds: [] as RiskKind[] };
  const worst = RANK[now.level] > RANK[stop.level] ? now : stop;
  if (worst.level === 'danger' || worst.level === 'threat') return { allowed: false, level: worst.level, kinds: worst.kinds };
  if (now.level === 'concern') return { allowed: p.ack === 'not-immediate', level: 'concern', kinds: now.kinds };
  if (now.level === 'uncertain') return { allowed: p.ack === 'dream' || p.ack === 'not-immediate', level: 'uncertain', kinds: now.kinds };
  return { allowed: true, level: 'none', kinds: [] };
}
