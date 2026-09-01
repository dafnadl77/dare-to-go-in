import type { SavedDream } from '../hero/dreamStorage';
import { getDreams } from '../hero/dreamStorage';
import { containsHebrew } from '../hero/appLanguage';
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
 * dreamer's own selectedElement when it's safely English, otherwise the
 * saved DreamReflectionResult's `observation` (the one field the reflection
 * engine's own system prompt guarantees is always English, regardless of
 * what language the dream was described in — see keywordsFromSavedDream's
 * comment for why selectedElement itself isn't guaranteed that).
 */
export type ArchiveEntry =
  | {
      kind: 'real';
      id: string;
      date: Date;
      title: string;
      keywords: string[];
      image: string;
      stoodOut: string;
      savedDream: SavedDream;
    }
  | { kind: 'mock'; id: string; date: Date; title: string; keywords: string[]; image: string; mock: MockDream };

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
 * The rest of DARE TO GO IN's interface is entirely English, but
 * DreamAnalysis (unlike DreamReflectionResult) is never forced into
 * English by its own extraction prompt — it naturally mirrors whatever
 * language the dreamer described their dream in (see
 * dreamReflectionSchema.ts's own system prompt for the explicit contrast:
 * the reflection is guaranteed English, "the dream itself and the
 * dreamer's original words are never translated"). So a title/keyword
 * candidate straight from DreamAnalysis can legitimately be Hebrew. This
 * project has no translation step and must not invent one silently, so a
 * Hebrew candidate is simply skipped in favor of a real, already-English
 * fallback rather than displayed as-is or machine-translated.
 */
function isDisplaySafe(text: string): boolean {
  return text.trim().length > 0 && !containsHebrew(text);
}

/**
 * A real saved dream has no dedicated "title" field (see SavedDream) — the
 * live journey never asked the dreamer to name their dream. This derives a
 * short, editorial-feeling title purely from data that already exists
 * (never a new API call, never invented text, never a translation): the
 * dream's own primary setting or the first clause of its summary, when
 * either is safely English; otherwise the first few words of the saved
 * DreamReflectionResult's `observation`, which the reflection engine's own
 * system prompt guarantees is always English regardless of source
 * language. Only if neither exists does this fall back to a generic
 * label — real saved dreams always have a reflection, so this last case is
 * expected to be unreachable in practice.
 */
function titleFromSavedDream(dream: SavedDream): string {
  const setting = dream.dreamAnalysis.reconstruction.primarySetting;
  if (setting && isDisplaySafe(setting)) return titleCase(setting.trim().slice(0, 34));
  const firstClause = dream.dreamAnalysis.summary.split(/[.!?]/)[0]?.trim();
  if (firstClause && isDisplaySafe(firstClause)) return titleCase(firstClause.slice(0, 34));
  const fromObservation = dream.dreamReflection.observation.split(/[.!?]/)[0]?.trim();
  if (fromObservation && isDisplaySafe(fromObservation)) return titleCase(fromObservation.slice(0, 34));
  return 'A Saved Dream';
}

/**
 * Up to 3 short keywords, drawn only from fields the extraction step
 * already populated (emotions first, since they read closest to the
 * reference's single-word evocative labels; the dream's own broader
 * atmosphere/objects fill in when there aren't enough emotions) — any
 * candidate containing Hebrew is skipped rather than shown or translated,
 * same reasoning as titleFromSavedDream. This can honestly leave fewer
 * than 3 keywords (even zero) for a dream described entirely in another
 * language; nothing pads the list back out with invented words.
 */
function keywordsFromSavedDream(dream: SavedDream): string[] {
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
    if (!w || seen.has(w) || !isDisplaySafe(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length === 3) break;
  }
  return out;
}

/** See the `stoodOut` doc on ArchiveEntry above. */
function stoodOutFromSavedDream(dream: SavedDream): string {
  if (isDisplaySafe(dream.selectedElement)) return dream.selectedElement;
  return dream.dreamReflection.observation;
}

function toEntry(dream: SavedDream, fallbackIndex: number): ArchiveEntry {
  return {
    kind: 'real',
    id: dream.id,
    date: new Date(dream.createdAt),
    title: titleFromSavedDream(dream),
    keywords: keywordsFromSavedDream(dream),
    image: dream.dreamImageDataUrl ?? FALLBACK_IMAGES[fallbackIndex % FALLBACK_IMAGES.length],
    stoodOut: stoodOutFromSavedDream(dream),
    savedDream: dream,
  };
}

function mockToEntry(mock: MockDream): ArchiveEntry {
  return {
    kind: 'mock',
    id: mock.id,
    date: new Date(`${mock.date}T00:00:00`),
    title: mock.title,
    keywords: mock.keywords,
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
 */
export function getArchiveEntries(): ArchiveEntry[] {
  const real = getDreams().map(toEntry);
  const mock = MOCK_DREAMS.map(mockToEntry);
  return [...real, ...mock].sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function formatEntryDayMonth(date: Date): string {
  return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }).toUpperCase();
}

export function formatEntryMonth(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
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
