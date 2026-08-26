import type { DreamAnalysis } from './dreamAnalysisSchema';
import type { DreamReflectionResult } from './dreamReflectionSchema';
import { getAppLanguage, type AppLanguage } from './appLanguage';

/**
 * A single saved dream, capturing everything a future MY DREAMS area (and
 * future recurring-pattern detection across THIS dreamer's own saved
 * dreams — never a generic symbol dictionary) will need. Persistence for
 * this stage is localStorage only (see below), but every consumer of this
 * module talks to it purely through saveDream/getDreams/getDream/
 * deleteDream, so swapping in a real authenticated backend later never
 * requires touching the experience code that calls these functions.
 */
export interface SavedDream {
  id: string;
  createdAt: string;
  sourceText: string;
  inputMode: 'voice' | 'text';
  dreamAnalysis: DreamAnalysis;
  /** The generated dream image as a data URL, or null if none was available. */
  dreamImageDataUrl: string | null;
  selectedElement: string;
  reflectionResponse: string;
  dreamReflection: DreamReflectionResult;
  corrections: string[];
  appLanguage: AppLanguage;
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
