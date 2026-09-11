import type { SavedDream } from '../hero/dreamStorage';
import { getDreams } from '../hero/dreamStorage';
import { containsHebrew, getAppLanguage, type AppLanguage } from '../hero/appLanguage';
import { dateLocale } from '../i18n/locale';
import { MOCK_DREAMS, type MockDream } from './mockDreams';

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
  };
}

function mockToEntry(mock: MockDream, language: AppLanguage): ArchiveEntry {
  const copy = mock[language];
  return {
    kind: 'mock',
    id: mock.id,
    date: new Date(`${mock.date}T00:00:00`),
    title: copy.title,
    excerpt: copy.excerpt,
    keywords: copy.keywords,
    image: mock.image,
    mock,
  };
}

/**
 * The archive's full, real, chronologically-sorted entry list (newest
 * first) — real saved dreams from this browser's localStorage, plus the
 * mock dreams filling out the rest of the timeline for design purposes.
 * Never hardcoded to "6 items": any number of real saved dreams merges in
 * correctly by date, and the mock dreams stop mattering entirely once a
 * dreamer has saved enough of their own.
 *
 * Takes `language` explicitly (defaulting to the live appLanguage) so a
 * caller that re-derives this on every language change (see
 * DreamArchive.tsx's own useMemo dependency) gets genuinely re-localized
 * titles/excerpts/keywords for both real and mock entries, rather than
 * whatever language was active the one time this ran.
 */
export function getArchiveEntries(language: AppLanguage = getAppLanguage()): ArchiveEntry[] {
  const real = getDreams().map((dream, i) => toEntry(dream, i, language));
  const mock = MOCK_DREAMS.map((m) => mockToEntry(m, language));
  return [...real, ...mock].sort((a, b) => b.date.getTime() - a.date.getTime());
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
