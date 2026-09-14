import type { SavedDream } from '../hero/dreamStorage';
import { containsHebrew, getAppLanguage, type AppLanguage } from '../hero/appLanguage';
import { dateLocale } from '../i18n/locale';
import type { MockDream } from './mockDreams';

/**
 * One entry in the MY DREAM ARCHIVE timeline — either a real dream this
 * dreamer actually saved (see ../hero/dreamStorage.ts), or one of the
 * design-stage mock dreams (see mockDreams.ts). The timeline itself never
 * branches on which kind it's rendering (same row, same image treatment,
 * same click-through) — `kind` exists only so DreamDetail knows whether it
 * has a real DreamReflectionResult to show or should fall back to the
 * placeholder note mock dreams have always shown.
 *
 * `stoodOut` is the real "what stood out" moment for the detail view: the
 * dreamer's own selectedElement when it's safely displayable in the
 * current language, otherwise the saved DreamReflectionResult's
 * `observation` (the one field the reflection engine's own system prompt
 * guarantees is always English, regardless of what language the dream was
 * described in — see keywordsFromSavedDream's comment for why
 * selectedElement itself isn't guaranteed that).
 */
export type ArchiveEntry =
  | {
      kind: 'real';
      id: string;
      date: Date;
      title: string;
      excerpt: string;
      keywords: string[];
      image: string;
      stoodOut: string;
      savedDream: SavedDream;
      /** Only real saved dreams can be favorited — see toggleFavorite in
          dreamStorage.ts. Mock entries have no persistent identity worth
          toggling, so they simply don't carry this field. */
      favorite: boolean;
    }
  | { kind: 'mock'; id: string; date: Date; title: string; excerpt: string; keywords: string[]; image: string; mock: MockDream };

/** Local placeholder photos — the same honest 3-photo limitation documented
    in mockDreams.ts, used here only as a fallback for a real saved dream
    whose own generated image failed to save (dreamImageDataUrl is null). */
const FALLBACK_IMAGES = ['/dream-assets/dream-art-alt.jpg', '/dream-assets/dream-bed-alt.jpg', '/dream-assets/dream-mirror-alt.jpg'];

function titleCase(text: string): string {
  return text
    .split(' ')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Whether a candidate string derived from the dreamer's own saved data is
 * safe to display as-is in the CURRENT app language — never a translation
 * decision, only a "would this look like a mismatched-language mistake"
 * one. The rest of DARE TO GO IN's interface is otherwise entirely
 * whatever the current language is, but DreamAnalysis (unlike
 * DreamReflectionResult) is never forced into English by its own
 * extraction prompt — it naturally mirrors whatever language the dreamer
 * described their dream in (see dreamReflectionSchema.ts's own system
 * prompt for the explicit contrast: the reflection is guaranteed English,
 * "the dream itself and the dreamer's original words are never
 * translated"). So a title/excerpt/keyword candidate straight from
 * DreamAnalysis can legitimately be Hebrew OR English depending on how
 * the dream was actually described — showing it in whichever language it
 * already is is exactly right, in either UI language: a Hebrew-described
 * dream should read as Hebrew inside a Hebrew archive just as much as an
 * English one should read as English inside an English archive. The one
 * real mismatch this guards against is the ENGLISH UI specifically:
 * showing raw, undisplayed-as-such Hebrew there would read as broken (no
 * translation step exists, and inventing one here would silently
 * translate the dreamer's own words, which is explicitly out of scope) —
 * so Hebrew candidates are skipped only when the active language is 'en'.
 * This project has no translation step and must not invent one silently,
 * so a Hebrew candidate is simply skipped in favor of a real,
 * already-English fallback rather than displayed as-is or
 * machine-translated when the UI itself is English. */
function isDisplaySafe(text: string, language: AppLanguage): boolean {
  if (!text.trim()) return false;
  if (language === 'en' && containsHebrew(text)) return false;
  return true;
}

/** Localized, generic fallback — used only when nothing on the saved dream
    itself was safe to show (see isDisplaySafe) — real saved dreams almost
    always have a reflection, so this is expected to be rare in practice,
    but when it happens it must still follow the current UI language
    rather than silently falling back to English text inside a Hebrew
    archive (the exact class of bug this whole module was reworked for). */
function fallbackTitle(language: AppLanguage): string {
  return language === 'he' ? 'חלום שמור' : 'A Saved Dream';
}

function fallbackExcerpt(language: AppLanguage): string {
  return language === 'he' ? 'ההשתקפות של החלום הזה נשמרה.' : "This dream's reflection has been saved.";
}

/**
 * A real saved dream has no dedicated "title" field (see SavedDream) — the
 * live journey never asked the dreamer to name their dream. This derives a
 * short, editorial-feeling title purely from data that already exists
 * (never a new API call, never invented text, never a translation): the
 * dream's own primary setting or the first clause of its summary, when
 * either is safely displayable in the current language; otherwise the
 * first few words of the saved DreamReflectionResult's `observation`,
 * which the reflection engine's own system prompt guarantees is always
 * English regardless of source language. Only if none of those apply does
 * this fall back to a generic, language-appropriate label.
 */
function titleFromSavedDream(dream: SavedDream, language: AppLanguage): string {
  const setting = dream.dreamAnalysis.reconstruction.primarySetting;
  if (setting && isDisplaySafe(setting, language)) return titleCase(setting.trim().slice(0, 34));
  const firstClause = dream.dreamAnalysis.summary.split(/[.!?]/)[0]?.trim();
  if (firstClause && isDisplaySafe(firstClause, language)) return titleCase(firstClause.slice(0, 34));
  const fromObservation = dream.dreamReflection.observation.split(/[.!?]/)[0]?.trim();
  if (fromObservation && isDisplaySafe(fromObservation, language)) return titleCase(fromObservation.slice(0, 34));
  return fallbackTitle(language);
}

/** The card's short excerpt line — one real sentence from the dream's own
    summary when it's safely displayable, otherwise the reflection's own
    observation (see titleFromSavedDream for the same reasoning), otherwise
    a generic localized note. Truncated to a card-friendly length; never a
    second/duplicate of the title itself. */
function excerptFromSavedDream(dream: SavedDream, language: AppLanguage): string {
  const truncate = (text: string) => (text.length > 110 ? `${text.slice(0, 109).trimEnd()}…` : text);
  const summary = dream.dreamAnalysis.summary.trim();
  if (summary && isDisplaySafe(summary, language)) return truncate(summary);
  const observation = dream.dreamReflection.observation.trim();
  if (observation && isDisplaySafe(observation, language)) return truncate(observation);
  return fallbackExcerpt(language);
}

/**
 * Up to 3 short keywords, drawn only from fields the extraction step
 * already populated (emotions first, since they read closest to the
 * reference's single-word evocative labels; the dream's own broader
 * atmosphere/objects fill in when there aren't enough emotions) — any
 * candidate that isn't safely displayable in the current language (see
 * isDisplaySafe) is skipped rather than shown or translated. This can
 * honestly leave fewer than 3 keywords (even zero) for a dream described
 * entirely in the other language while the UI is English; nothing pads
 * the list back out with invented words.
 */
function keywordsFromSavedDream(dream: SavedDream, language: AppLanguage): string[] {
  const a = dream.dreamAnalysis;
  const pool = [
    ...a.emotions.filter((e) => e.explicit).map((e) => e.emotion),
    ...a.emotions.map((e) => e.emotion),
    ...a.reconstruction.emotionalAtmosphere,
    ...a.reconstruction.keyObjects,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of pool) {
    const w = word.trim().toLowerCase();
    if (!w || seen.has(w) || !isDisplaySafe(w, language)) continue;
    seen.add(w);
    out.push(w);
    if (out.length === 3) break;
  }
  return out;
}

/** See the `stoodOut` doc on ArchiveEntry above. */
function stoodOutFromSavedDream(dream: SavedDream, language: AppLanguage): string {
  if (isDisplaySafe(dream.selectedElement, language)) return dream.selectedElement;
  return dream.dreamReflection.observation;
}

function toEntry(dream: SavedDream, fallbackIndex: number, language: AppLanguage): ArchiveEntry {
  return {
    kind: 'real',
    id: dream.id,
    date: new Date(dream.createdAt),
    title: titleFromSavedDream(dream, language),
    excerpt: excerptFromSavedDream(dream, language),
    keywords: keywordsFromSavedDream(dream, language),
    image: dream.dreamImageDataUrl ?? FALLBACK_IMAGES[fallbackIndex % FALLBACK_IMAGES.length],
    stoodOut: stoodOutFromSavedDream(dream, language),
    savedDream: dream,
    favorite: dream.favorite === true,
  };
}

/**
 * The archive's full, real, chronologically-sorted entry list (newest
 * first) — ONLY the dreamer's own real saved dreams, newest first. Never
 * hardcoded to "6 items": any number of real saved dreams merges in
 * correctly by date.
 *
 * Deliberately storage-agnostic: `dreams` is passed in rather than read
 * from localStorage directly, so this same formatter works whether the
 * caller sourced them from dreamStorage.ts (anonymous/local) or
 * dreamRemoteStorage.ts (an authenticated Supabase user's own rows) —
 * DreamArchive.tsx (the only real caller) is always the latter, since it
 * only ever renders for a signed-in user.
 *
 * Deliberately does NOT fall back to mockDreams.ts's design-stage
 * placeholder content when `dreams` is empty — a previous version
 * concatenated MOCK_DREAMS onto every result unconditionally, which meant
 * a genuinely new authenticated account with zero real Supabase rows saw
 * four fake "saved" dreams (The Open Door, The Ocean, Grandmother, The
 * Empty City) presented as its own archive. mockDreams.ts's MOCK_DREAMS/
 * MockDream stay in the repo for future dev/preview use, but this
 * function — the one real production data path DreamArchive.tsx renders
 * — must return exactly what the authenticated user actually owns,
 * including a genuinely empty array. See ArchiveEntry's own `kind: 'mock'`
 * variant, still declared in this file for that type's history/possible
 * future dev use, but no longer ever constructed here.
 *
 * Takes `language` explicitly (defaulting to the live appLanguage) so a
 * caller that re-derives this on every language change (see
 * DreamArchive.tsx's own useMemo dependency) gets genuinely re-localized
 * titles/excerpts/keywords, rather than whatever language was active the
 * one time this ran.
 */
export function getArchiveEntries(dreams: SavedDream[], language: AppLanguage = getAppLanguage()): ArchiveEntry[] {
  return dreams.map((dream, i) => toEntry(dream, i, language)).sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** Both date formatters default to the current app language (read from
    appLanguage.ts, which the active LanguageProvider keeps in sync — see
    LanguageContext.tsx) so existing call sites needed no change; an
    explicit `language` is accepted for the one call site (DreamDetail's
    header) that already had it in scope and can skip the extra read. */
export function formatEntryDayMonth(date: Date, language: AppLanguage = getAppLanguage()): string {
  const formatted = date.toLocaleDateString(dateLocale(language), { day: '2-digit', month: 'short' });
  // .toUpperCase() only matters for Latin script (English month
  // abbreviations); it's a harmless no-op on Hebrew, which has no case.
  return formatted.toUpperCase();
}

export function formatEntryMonth(date: Date, language: AppLanguage = getAppLanguage()): string {
  const formatted = date.toLocaleDateString(dateLocale(language), { month: 'long' });
  return formatted.toUpperCase();
}

export function formatEntryYear(date: Date): string {
  return String(date.getFullYear());
}

/**
 * One saved dream a recurring motif was actually found in — enough for
 * INSIGHTS to optionally show which dreams, never more than what's
 * already on the entry (no new lookup, no dream text repeated here).
 */
export interface RecurringMotifDream {
  id: string;
  title: string;
  date: Date;
}

/** A single recurring motif/entity across this dreamer's own real saved
    dreams — a person, place, object or action that the extraction step
    already found in at least two SEPARATE dreams (never a repeat count
    within one dream). `label` is the nicest-looking original casing seen
    for it; `key` is the normalized form used for matching. */
export interface RecurringMotif {
  key: string;
  label: string;
  count: number;
  dreams: RecurringMotifDream[];
}

/** Generic/pronoun words too vague to mean anything as a "recurring
    motif" even if the extraction step happened to output one verbatim
    (e.g. an action's subject/target field, or a low-confidence object
    name) — kept short and unopinionated on purpose, this is not a full
    stop-word list, just enough to filter obvious noise in both of DARE's
    supported languages. */
const GENERIC_MOTIF_WORDS = new Set([
  'it',
  'this',
  'that',
  'these',
  'those',
  'something',
  'someone',
  'somewhere',
  'someplace',
  'anything',
  'anyone',
  'anywhere',
  'everything',
  'everyone',
  'nothing',
  'nobody',
  'somebody',
  'anybody',
  'thing',
  'things',
  'person',
  'people',
  'place',
  'stuff',
  'me',
  'i',
  'you',
  'we',
  'he',
  'she',
  'they',
  'him',
  'her',
  'them',
  'unknown',
  'unclear',
  'זה',
  'זאת',
  'אלה',
  'משהו',
  'מישהו',
  'איפשהו',
  'מקום כלשהו',
  'כלום',
  'דבר',
  'דברים',
  'אדם',
  'אנשים',
  'מקום',
  'הוא',
  'היא',
  'הם',
  'הן',
  'אני',
  'אתה',
  'את',
  'אנחנו',
  'לא ידוע',
  'לא ברור',
]);

/** Strips exactly one leading English possessive/article before matching
    — "my grandmother" and "grandmother" are the same recurring person,
    but this is deliberately a single, cheap prefix strip, not stemming
    or NLP: good enough for the common case, never invents a match that
    isn't there. Hebrew has no equivalent single-token prefix to strip
    (possession is usually a full separate word or a suffix), so Hebrew
    candidates pass through untouched other than trimming/casing below. */
const LEADING_ARTICLE_OR_POSSESSIVE = /^(my|his|her|their|our|your|the|a|an|some)\s+/i;

function toTitleCaseIfPlainLatin(text: string): string {
  if (!/^[a-z][a-z\s'-]*$/.test(text)) return text;
  return text
    .split(' ')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Normalizes one raw candidate string (a person's nameOrRole, a place
    name, an action, ...) into a matchable key + a display label, or null
    if it isn't a safe/meaningful motif candidate at all. Case-insensitive
    and punctuation-trimmed per the spec; never translates and never
    matches across languages — a Hebrew candidate only ever matches
    another occurrence of the same Hebrew text. */
function normalizeMotifCandidate(raw: string | null | undefined): { key: string; label: string } | null {
  if (!raw) return null;
  let text = raw.trim();
  if (!text) return null;
  text = text.replace(LEADING_ARTICLE_OR_POSSESSIVE, '').trim();
  // Trim surrounding punctuation/quotes without touching internal
  // characters (so "David Bowie's" only loses the trailing quote/nothing
  // here, not the whole word — the possessive "'s" is rare enough in
  // extracted entity names that leaving it is safer than guessing at
  // stemming rules).
  text = text.replace(/^["'.,:;!?()\-–—\s]+|["'.,:;!?()\-–—\s]+$/g, '');
  if (!text) return null;
  // A real recurring motif is a short entity/action, not a sentence —
  // this also naturally excludes most of the sourceText/summary fallback
  // (see motifCandidatesFromSavedDream) unless it happens to already be
  // short.
  if (text.length > 40) return null;
  if (!/[a-zA-Zא-ת]/.test(text)) return null;
  const key = text.toLowerCase().replace(/\s+/g, ' ');
  if (key.length < 2 || GENERIC_MOTIF_WORDS.has(key)) return null;
  return { key, label: toTitleCaseIfPlainLatin(text) };
}

/**
 * Every real, already-extracted candidate motif for one saved dream —
 * never a new AI call, never invented. Pulled from the SAME
 * DreamAnalysis/SavedDream fields the live journey already produced,
 * prioritized per spec:
 *   1. Extracted entities: dreamAnalysis.people/places/objects/actions
 *      (the detailed, per-entity arrays — this is where a named
 *      character like "David Bowie" or "my grandmother", or an action
 *      like "falling", actually lives) plus their reconstruction digests
 *      (keyPeople/keyObjects/keyActions), which cover the odd case where
 *      the detailed arrays came back sparse but the digest didn't.
 *   2. Saved keywords/themes: the same emotions/emotionalAtmosphere pool
 *      keywordsFromSavedDream already uses for the card chips.
 *   3. The dreamer's own saved standout element (selectedElement).
 *   4. Title/dream text — ONLY when a dream contributes nothing at all
 *      from 1-3 (an edge case for a very old or unusually sparse saved
 *      record); normalizeMotifCandidate's own length cap keeps this from
 *      turning a whole sentence into a fake "motif."
 * Every candidate goes through normalizeMotifCandidate, so duplicates,
 * generic words, and sentence-length text are already filtered by the
 * time this reaches the cross-dream counting step below.
 */
function motifCandidatesFromSavedDream(dream: SavedDream): string[] {
  const a = dream.dreamAnalysis;
  const structured = [
    ...a.people.map((p) => p.nameOrRole),
    ...a.places.map((p) => p.name),
    ...a.objects.map((o) => o.name),
    ...a.actions.map((ac) => ac.action),
    ...a.reconstruction.keyPeople,
    ...a.reconstruction.keyObjects,
    ...a.reconstruction.keyActions,
    ...a.emotions.map((e) => e.emotion),
    ...a.reconstruction.emotionalAtmosphere,
  ];
  if (dream.selectedElement) structured.push(dream.selectedElement);

  const hasAnyStructuredText = structured.some((c) => c && c.trim());
  if (hasAnyStructuredText) return structured;

  // Fallback only — see doc comment above. The dream's own title-source
  // fields, never a new interpretation of them.
  const fallback: string[] = [];
  const firstClause = a.summary?.split(/[.!?]/)[0]?.trim();
  if (firstClause) fallback.push(firstClause);
  if (a.reconstruction.primarySetting) fallback.push(a.reconstruction.primarySetting);
  return fallback;
}

/** The real, data-derived thing INSIGHTS shows: which motifs/entities the
    extraction step already found recur across at least TWO SEPARATE real
    saved dreams (never a repeat count within the same dream — each
    dream's own candidates are de-duplicated before counting). Never
    invents a theme, never calls any AI to interpret anything — pure
    matching over data that already exists. Returns null (not an empty
    array) only when fewer than 2 real dreams exist at all, since no
    cross-dream recurrence is even possible yet — NOT an arbitrary
    "need 3+ dreams" gate.

    Deliberately NOT language-aware: a motif candidate extracted from a
    dream described in Hebrew stays Hebrew (dreamAnalysis mirrors
    whatever language the dream was actually described in), and this
    always counts/returns it regardless of the current UI language — an
    earlier version filtered out script-mismatched motifs here, which
    just made English Insights go empty whenever the underlying dreams
    were Hebrew. Matching/counting identity is ALWAYS the original
    normalized motif; language-appropriate DISPLAY (translating a
    Hebrew-only label for an English UI, or vice versa) is a separate,
    display-only concern handled by the caller (see DreamArchive.tsx's
    own motif-label localization) — it never changes what's counted or
    which dreams a motif points at. */
export function getRecurringMotifs(entries: ArchiveEntry[]): RecurringMotif[] | null {
  const real = entries.filter((e): e is Extract<ArchiveEntry, { kind: 'real' }> => e.kind === 'real');
  if (real.length < 2) return null;

  const byKey = new Map<string, { label: string; dreams: RecurringMotifDream[] }>();
  for (const entry of real) {
    const candidates = motifCandidatesFromSavedDream(entry.savedDream);
    // De-dupe WITHIN this one dream first — mentioning "falling" three
    // times in one dream must still only count as one dream toward
    // cross-dream recurrence.
    const perDream = new Map<string, string>();
    for (const raw of candidates) {
      const norm = normalizeMotifCandidate(raw);
      if (norm && !perDream.has(norm.key)) perDream.set(norm.key, norm.label);
    }
    for (const [key, label] of perDream) {
      const existing = byKey.get(key);
      const dreamRef: RecurringMotifDream = { id: entry.id, title: entry.title, date: entry.date };
      if (existing) existing.dreams.push(dreamRef);
      else byKey.set(key, { label, dreams: [dreamRef] });
    }
  }

  const recurring = Array.from(byKey.entries())
    .filter(([, v]) => v.dreams.length >= 2)
    .map(([key, v]) => ({
      key,
      label: v.label,
      count: v.dreams.length,
      dreams: [...v.dreams].sort((a, b) => b.date.getTime() - a.date.getTime()),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 12);
  return recurring;
}

/**
 * Remembers the archive's own scroll position across a visit to
 * DreamDetail, so "← BACK TO MY DREAMS" can restore it — a plain
 * module-level value (not React state) since it only needs to survive one
 * DreamArchive unmount/remount within the same page load, never persisted
 * or shared beyond that.
 */
let lastArchiveScrollTop = 0;
export function setLastArchiveScrollTop(value: number): void {
  lastArchiveScrollTop = value;
}
export function getLastArchiveScrollTop(): number {
  return lastArchiveScrollTop;
}
