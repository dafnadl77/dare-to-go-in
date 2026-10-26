import { detectRisk, normalize } from './riskDetector.js';

/**
 * DARE's own words, checked before they are shown (doc 106; her requirement 3 of 2026-10-24). Code, not model instructions. A model
 * answer is not shown when it:
 *   - gives a way or a means, says it is something she wants now, or threatens (the risk detector, on the answer itself);
 *   - encourages ("go ahead", "you should end it", "תתאבדי");
 *   - names means together with "forever" / dying ("כדורי שינה… להירדם לתמיד");
 *   - presents DARE as a therapist, psychologist, psychiatrist, doctor or counsellor.
 * And when the check itself fails for any reason, the answer is not shown (fail closed, requirement 5).
 */

const ENCOURAGE = [
  /(?<![א-ת])(?:תתאבד|תתאבדי|תתאבדו|לך\s+תמות|לכי\s+תמותי|תמות|תמותי)(?![א-ת])/,
  /(?<![א-ת])(?:כדאי|הגיע\s+הזמן|מותר)\s+(?:לך\s+|ל)?(?:\S+\s+){0,3}?(?:לסיים\s+(?:עם\s+)?(?:ה)?(?:כל|חיים)|למות|להתאבד|לפגוע\s+בעצמ)/,
  /\b(?:kill\s+yourself|kys|you\s+should\s+(?:die|end\s+it|end\s+your\s+life|kill)|go\s+ahead\s+and\s+(?:do\s+it|end\s+it)|end\s+it\b)/,
  // the focused round (doc 110): a way offered on her own terms, harm to another justified, her absence endorsed, the act unseen
  /(?<![א-ת])אמ\s+(?:את|אתה|אתמ)\s+באמת\s+(?:רוצה|רוצימ)\S*\s+(?:ה)?דרכ/,
  /(?<![א-ת])(?:מגיע\s+ל(?:ו|ה|המ|הנ)|(?:הרוויח|הרוויחה|הרוויחו)\s+(?:את\s+)?זה)\s+ש(?:ת|י)?(?:פגע|רביצ|הרג|הכ)/,
  /(?<![א-ת])עדיפ\s+(?:ש(?:לא\s+)?(?:תמותי|תמות|תיעלמי|תיעלמ)|שלא\s+(?:תהיי|תהיה|תהיו)\s+(?:כאנ|פה|בעולמ|בחיימ))/,
  /(?<![א-ת])לעשות\s+את\s+זה\s+(?:\S+\s+){0,2}?בלי\s+ש(?:אפ\s+אחד|איש)\s+(?:ישימ\s+לב|יראה|ידע)/,
];
const MEANS_FOREVER = [
  /(?<![א-ת])(?:כדורי|כדורים|תרופות|גלולות)(?![א-ת])[^.!?]{0,40}(?:לתמיד|לנצח|למות|לא\s+להתעורר)/,
  /\b(?:pills|meds|overdose)\b[^.!?]{0,40}\b(?:forever|to\s+die|never\s+wake)\b/,
  // an amount of pills, in DARE's words
  /(?<![א-ת])(?:כדורימ|כדורי|תרופות)\S*\s+(?:יספיקו|מספיקימ|יספיק|צריכ)/,
];
const POSES_AS = [
  /(?<![א-ת])אני\s+(?:ה)?(?:מטפלת|מטפל|פסיכולוגית|פסיכולוג|פסיכיאטרית|פסיכיאטר|רופאה|רופא|יועצת|יועץ|פסיכותרפיסטית|פסיכותרפיסט)(?![א-ת])/,
  /(?<![א-ת])כ(?:מטפלת|מטפל|פסיכולוגית|פסיכולוג|רופאה|רופא)\s+(?:שלך|אני)/,
  /\b(?:i'?m|i\s+am)\s+(?:your\s+|a\s+)?(?:therapist|psychologist|psychiatrist|doctor|counsel?l?or)\b/,
  /\bas\s+(?:a|your)\s+(?:therapist|psychologist|psychiatrist|doctor|counsel?l?or)\b/,
];

/** `retelling`: the dream told back (the analysis): a frightening dream retold is the dream, so it is read as a dream. */
export function checkOutput(text: string, kind: 'reply' | 'retelling' = 'reply'): { ok: boolean; reasons: string[] } {
  const t = normalize(text);
  const reasons: string[] = [];
  const risk = detectRisk(text, kind === 'retelling' ? 'dream' : 'answer');
  if (risk.kinds.includes('instructions')) reasons.push('gives or discusses a way or a means');
  // a retelling echoes her own dream, already checked (and acknowledged) on the way in; only means, encouragement or a pose stop it
  if (kind === 'reply' && (risk.level === 'concern' || risk.level === 'danger' || risk.level === 'threat')) reasons.push('speaks of dying, self-harm or a threat as something real now');
  if (ENCOURAGE.some((r) => r.test(t))) reasons.push('encourages harm');
  if (MEANS_FOREVER.some((r) => r.test(t))) reasons.push('names a means');
  if (POSES_AS.some((r) => r.test(t))) reasons.push('presents DARE as a therapist or a doctor');
  return { ok: reasons.length === 0, reasons };
}

/** The check, failing closed: if it cannot run, the answer is not shown. */
export function checkOutputSafely(run: () => { ok: boolean; reasons: string[] }): { ok: boolean; reasons: string[] } {
  try {
    return run();
  } catch {
    return { ok: false, reasons: ['the check could not run'] };
  }
}
