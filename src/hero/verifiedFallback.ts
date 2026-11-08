import type { AppLanguage } from './appLanguage.js';
import { dareFirstPerson, questionTakesForGranted, unreportedAttribution, withoutWorkContent, worksSheNamed, type AttributionContext } from './attribution.js';

/**
 * WHEN THE ONE FIX FAILS (her rule, 2026-11-08). The attribution check (attribution.ts) asks the model once for a fresh answer. When the fresh
 * answer still says as hers something she did not tell (or speaks in DARE's first person, or tells a work she named), that answer is NOT shown
 * as it is, and no sentence is cut out of it either: the answer as a whole is set aside, and what she sees is built here from verified things
 * only — her own words, the dream's own words, and a question. No third model call, nothing generic in place of content: when there is too
 * little that is verified, a gentle line says so. Nothing here is logged.
 */

/** Does this text still hold something that does not rest on her words (the same three checks that asked for the fresh answer)? */
export function stillUnverified(texts: readonly string[], ctx: AttributionContext): boolean {
  const works = worksSheNamed(ctx.herWords);
  return texts
    .flatMap((t) => t.split(/(?<=[.!?…])\s+|\n+/u))
    .map((x) => x.trim())
    .filter(Boolean)
    .some((x) => unreportedAttribution(x, ctx) !== null || dareFirstPerson(x, ctx.herWords) !== null || (works.length > 0 && withoutWorkContent(x, works) !== null));
}

const cut = (t: string, max = 160) => {
  // a closing full stop stays outside the quote ("«…».", never "«….».")
  const s = t.trim().replace(/\s+/g, ' ').replace(/\.+$/u, '');
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
};
const quote = (t: string, language: AppLanguage) => (language === 'he' ? `«${cut(t)}»` : `“${cut(t)}”`);

/** Her own words given back, nothing added ("אמרת" reads the same for every dreamer). Null when she said nothing in words. */
export function herWordsLine(words: string, language: AppLanguage): string | null {
  if (!words.trim()) return null;
  return language === 'he' ? `אמרת: ${quote(words, language)}.` : `You said: ${quote(words, language)}.`;
}

/** A clear question about the moment itself, for when the answer that failed has no single question of its own. */
export function momentQuestion(label: string, language: AppLanguage): string {
  const l = cut(label, 80);
  return language === 'he' ? `מה עוד זכור לך מהרגע «${l}»?` : `What else do you remember about “${l}”?`;
}

/**
 * A turn of the conversation when the fresh answer still failed: her last words given back, then ONE question. The question is the failed
 * answer's own, when it has exactly one sentence that asks (a question states nothing about her, so the check never finds anything in it);
 * otherwise a question about the moment. The offer of the failed answer is not shown.
 */
export function verifiedTurnText(p: { herLast: string; questions: readonly string[]; label: string; language: AppLanguage }): string {
  const question = p.questions.length === 1 ? p.questions[0].trim() : momentQuestion(p.label, p.language);
  return [herWordsLine(p.herLast, p.language), question].filter(Boolean).join(' ');
}

/** The closing line of a moment when the fresh answer still failed: her last words given back, then the usual thanks. No question. */
export function verifiedClosingText(herLast: string, closing: string, language: AppLanguage): string {
  return [herWordsLine(herLast, language), closing].filter(Boolean).join(' ');
}

/** The whole view, and nothing verified to show: said gently, never a conclusion. */
export const thinWholeViewLine = (language: AppLanguage) =>
  language === 'he'
    ? 'בשיחה נאמר עד עכשיו מעט מדי כדי לסכם אותה. אפשר לחזור לכל רגע ולהוסיף.'
    : 'Too little has been said so far to sum the conversation up. You can go back to any moment and add more.';

/** The reflection's possible thread when its fresh answer still stated something she did not tell: said gently, never a conclusion. */
export const thinThreadLine = (language: AppLanguage) =>
  language === 'he'
    ? 'מה שנאמר עד עכשיו עדיין לא מספיק כדי להצביע על חוט מקשר, ואין צורך להכריח אחד.'
    : 'What has been said so far is not yet enough to point to a thread, and there is no need to force one.';

/** A neutral question about the dream itself, for a continuity question that has to be set aside. */
export const dreamQuestion = (language: AppLanguage) => (language === 'he' ? 'מה עוד זכור לך מהחלום הזה?' : 'What else do you remember from this dream?');

/** The first sentence of the dream in its own words, for an observation that has to be set aside. */
export function dreamLine(sourceText: string, language: AppLanguage): string | null {
  const first = sourceText.trim().split(/(?<=[.!?…])\s+|\n+/u)[0]?.trim();
  if (!first) return null;
  return language === 'he' ? `בחלום: ${quote(first, language)}.` : `In the dream: ${quote(first, language)}.`;
}

/** Her answers given back, the last two at most, nothing added. */
function herAnswersLine(answers: readonly string[], language: AppLanguage): string | null {
  const said = answers.map((a) => a.trim()).filter(Boolean).slice(-2);
  if (!said.length) return null;
  const quoted = said.map((a) => quote(a, language)).join(' · ');
  return language === 'he' ? `אמרת: ${quoted}.` : `You said: ${quoted}.`;
}

interface ReflectionFields {
  observation: string;
  personalAssociation: string;
  possibleThread: string;
  continuityQuestion: string;
  lenses: { cognitive: string | null; jungian: string | null; psychodynamic: string | null };
  emotionReflection?: string | null;
  summary?: string | null;
  alternativeReadings?: { basis: string; reading: string }[] | null;
  existentialLens?: { basis: string; text: string } | null;
}

/**
 * The reflection whose fresh answer still says as hers what she did not tell (her rule, 2026-11-08). Field by field, a field that still does
 * is set aside WHOLE (never a sentence cut out of it) and, where the screen needs one, replaced by verified words:
 *   - the observation: the dream's first sentence, in its own words;
 *   - the personal association: her own answers, as she wrote them;
 *   - the possible thread: a gentle line that there is not enough yet, never a conclusion;
 *   - the summary, the feelings line, a lens, a reading or the existential angle: optional on the screen, so it is not shown.
 * The continuity question stays, unless this reflection was set aside in part AND the question itself takes for granted what she never told
 * (read strictly): then a neutral question about the dream. A field with nothing unverified is never touched. `replaced` names the
 * fields (never their words), for the log.
 */
export function verifiedReflection<T extends ReflectionFields>(r: T, ctx: AttributionContext, p: { sourceText: string; herAnswers: readonly string[] }): { value: T; replaced: string[] } {
  const bad = (t: string | null | undefined) => typeof t === 'string' && t.trim() !== '' && stillUnverified([t], ctx);
  const replaced: string[] = [];
  const out = { ...r, lenses: { ...r.lenses } } as T;
  const mark = (name: string) => replaced.push(name);
  if (bad(r.observation)) {
    out.observation = dreamLine(p.sourceText, ctx.language) ?? thinThreadLine(ctx.language);
    mark('observation');
  }
  if (bad(r.personalAssociation)) {
    out.personalAssociation = herAnswersLine(p.herAnswers, ctx.language) ?? thinThreadLine(ctx.language);
    mark('personalAssociation');
  }
  if (bad(r.possibleThread)) {
    out.possibleThread = thinThreadLine(ctx.language);
    mark('possibleThread');
  }
  if (bad(r.summary)) {
    out.summary = null;
    mark('summary');
  }
  if (bad(r.emotionReflection)) {
    out.emotionReflection = null;
    mark('emotionReflection');
  }
  for (const k of ['cognitive', 'jungian', 'psychodynamic'] as const) if (bad(r.lenses[k])) {
    out.lenses[k] = null;
    mark(`lens:${k}`);
  }
  if (r.alternativeReadings?.some((a) => bad(a.reading))) {
    out.alternativeReadings = r.alternativeReadings.filter((a) => !bad(a.reading));
    mark('alternativeReadings');
  }
  if (r.existentialLens && bad(r.existentialLens.text)) {
    out.existentialLens = null;
    mark('existentialLens');
  }
  // only in a reflection that was set aside in part: its question is kept only when it takes nothing for granted (read strictly)
  if (replaced.length && questionTakesForGranted(r.continuityQuestion, ctx)) {
    out.continuityQuestion = dreamQuestion(ctx.language);
    mark('continuityQuestion');
  }
  return { value: out, replaced };
}
