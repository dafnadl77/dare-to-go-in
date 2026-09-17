import type { DreamAnalysis } from './dreamAnalysisSchema';
import type { DreamReflectionResult } from './dreamReflectionSchema';
import { getAppLanguage, type AppLanguage } from './appLanguage';

/**
 * A single saved dream, capturing everything MY DREAMS (and
 * recurring-pattern detection across THIS dreamer's own saved dreams —
 * never a generic symbol dictionary) needs. This module is the LOCAL
 * (localStorage) half of dream persistence — used for anonymous,
 * signed-out saves on Home exactly as before, and as the source for the
 * explicit local→Supabase import prompt (LocalDreamImportPrompt.tsx). An
 * authenticated session's own dreams live in Supabase instead — see
 * dreamRemoteStorage.ts, which mirrors this exact SavedDream shape so
 * both paths interchange freely. HeroDream.tsx's handleSaveDream is the
 * one place that decides which of the two a given save actually uses.
 */
export interface SavedDream {
  id: string;
  createdAt: string;
  sourceText: string;
  inputMode: 'voice' | 'text';
  dreamAnalysis: DreamAnalysis;
  /** The generated dream image as a data URL, or null if none was available.
      Legacy representation — every dream saved before Phase 2's Storage
      migration has this populated and `dreamImagePath` absent. New
      Supabase-backed saves populate `dreamImagePath` instead and never
      persist this field remotely (see dreamRemoteStorage.ts's
      saveDreamRemote) — it still flows through the anonymous/pending-save
      journey exactly as before, since Storage upload only ever happens at
      the final authenticated save, not before. */
  dreamImageDataUrl: string | null;
  /** Phase 2: the Storage object path (`{owner_id}/{dream_id}.jpg`) for a
      dream whose image lives in the private `dream-images` bucket, or
      absent/null for a legacy base64 dream. Optional so every dream saved
      before this field existed still parses fine — no migration needed
      for existing stored data (see dreamImageDataUrl's own note above).
      Never a signed URL — those are minted on demand and never
      persisted (see archive/useDreamImageSrc.ts). */
  dreamImagePath?: string | null;
  selectedElement: string;
  reflectionResponse: string;
  dreamReflection: DreamReflectionResult;
  corrections: string[];
  appLanguage: AppLanguage;
  /** Optional so every dream saved before this field existed still parses
      fine from localStorage (`undefined` reads as "not favorited") — no
      migration needed for existing stored data. */
  favorite?: boolean;
}

const STORAGE_KEY = 'dare.savedDreams.v1';

function readAll(): SavedDream[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedDream[]) : [];
  } catch {
    return [];
  }
}

function writeAll(dreams: SavedDream[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dreams));
  } catch {
    // Storage may be full or unavailable (e.g. private browsing) — saving
    // is best-effort for this stage; a real backend replaces this later.
  }
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `dream-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function saveDream(dream: SavedDream): void {
  const all = readAll();
  all.push(dream);
  writeAll(all);
}

export function getDreams(): SavedDream[] {
  return readAll();
}

export function getDream(id: string): SavedDream | null {
  return readAll().find((d) => d.id === id) ?? null;
}

export function deleteDream(id: string): void {
  writeAll(readAll().filter((d) => d.id !== id));
}

/** Flips one saved dream's favorite flag. A no-op if the id isn't found
    (e.g. it was deleted in another tab) rather than throwing. */
export function toggleFavorite(id: string): void {
  const all = readAll();
  const dream = all.find((d) => d.id === id);
  if (!dream) return;
  dream.favorite = !dream.favorite;
  writeAll(all);
}

const MIGRATION_MARKER_KEY = 'dare.localDreamMigration.v1';
type MigrationStatus = 'imported' | 'declined';

function readMigrationMarkers(): Record<string, MigrationStatus> {
  try {
    const raw = localStorage.getItem(MIGRATION_MARKER_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, MigrationStatus>) : {};
  } catch {
    return {};
  }
}

/** Whether THIS account (by Supabase user id) has already been offered
    the local→Supabase dream import — 'imported'/'declined' once they've
    answered, undefined if never asked yet. Keyed per user id (not
    global) so a second account signing into the same browser still gets
    its own, independent prompt — see LocalDreamImportPrompt.tsx, the
    only place that reads this. Never auto-set: only setMigrationStatus,
    called after an explicit Import/Not now click, writes it. */
export function getMigrationStatus(userId: string): MigrationStatus | undefined {
  return readMigrationMarkers()[userId];
}

export function setMigrationStatus(userId: string, status: MigrationStatus): void {
  try {
    const all = readMigrationMarkers();
    all[userId] = status;
    localStorage.setItem(MIGRATION_MARKER_KEY, JSON.stringify(all));
  } catch {
    // Best-effort, same as writeAll above — worst case the prompt simply
    // reappears next visit, never a lost/duplicated import.
  }
}

/**
 * Builds a complete SavedDream record from the live journey state — the
 * one place that assembles `id`/`createdAt`/`appLanguage`, so callers never
 * have to invent those themselves.
 */
export function buildSavedDream(params: {
  sourceText: string;
  inputMode: 'voice' | 'text';
  dreamAnalysis: DreamAnalysis;
  dreamImageDataUrl: string | null;
  selectedElement: string;
  reflectionResponse: string;
  dreamReflection: DreamReflectionResult;
  corrections: string[];
}): SavedDream {
  return {
    id: randomId(),
    createdAt: new Date().toISOString(),
    appLanguage: getAppLanguage(),
    ...params,
  };
}
