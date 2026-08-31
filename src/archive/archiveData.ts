import type { SavedDream } from '../hero/dreamStorage';
import { getDreams } from '../hero/dreamStorage';
import { MOCK_DREAMS, type MockDream } from './mockDreams';

/**
 * One entry in the MY DREAM ARCHIVE timeline — either a real dream this
 * dreamer actually saved (see ../hero/dreamStorage.ts), or one of the
 * design-stage mock dreams (see mockDreams.ts). The timeline itself never
 * branches on which kind it's rendering (same row, same image treatment,
 * same click-through) — `kind` exists only so DreamDetail knows whether it
 * has a real DreamReflectionResult to show or should fall back to the
 * placeholder note mock dreams have always shown.
 */
export type ArchiveEntry =
  | { kind: 'real'; id: string; date: Date; title: string; keywords: string[]; image: string; savedDream: SavedDream }
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
 * A real saved dream has no dedicated "title" field (see SavedDream) — the
 * live journey never asked the dreamer to name their dream. This derives a
 * short, editorial-feeling title purely from data the extraction step
 * already produced (never a new API call, never invented text): the
 * dream's own primary setting when one was found, otherwise the first
 * clause of its factual summary.
 */
function titleFromSavedDream(dream: SavedDream): string {
  const setting = dream.dreamAnalysis.reconstruction.primarySetting;
  if (setting && setting.trim()) return titleCase(setting.trim().slice(0, 34));
  const firstClause = dream.dreamAnalysis.summary.split(/[.!?]/)[0]?.trim();
  if (firstClause) return titleCase(firstClause.slice(0, 34));
  return 'Untitled Dream';
}

/**
 * Up to 3 short keywords, derived the same way — drawn only from fields
 * the extraction step already populated (emotions first, since they read
 * closest to the reference's single-word evocative labels; the dream's own
 * broader atmosphere/objects fill in when there aren't enough emotions).
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
    if (!w || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length === 3) break;
  }
  return out;
}

function toEntry(dream: SavedDream, fallbackIndex: number): ArchiveEntry {
  return {
    kind: 'real',
    id: dream.id,
    date: new Date(dream.createdAt),
    title: titleFromSavedDream(dream),
    keywords: keywordsFromSavedDream(dream),
    image: dream.dreamImageDataUrl ?? FALLBACK_IMAGES[fallbackIndex % FALLBACK_IMAGES.length],
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
