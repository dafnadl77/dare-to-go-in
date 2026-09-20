import { useEffect, useMemo, useRef, useState } from 'react';
import { containsHebrew, type AppLanguage } from '../hero/appLanguage';
import { titleCase, titleFromSavedDream, type ArchiveEntry } from './archiveData';
import { translateTexts } from './dreamTranslationEngine';
import type { SavedDream } from '../hero/dreamStorage';

/**
 * Display-only translation of a saved dream's DERIVED title, shared by the
 * archive list (DreamArchive) and DreamDetail so both always show the same
 * title for the same dream in the same UI language. Nothing here ever
 * touches the saved dream: it is unchanged, this only fills a cache of
 * translated title strings (in memory, mirrored to sessionStorage).
 *
 * Cost control: a title is translated at most once per (language, text)
 * per browser tab — everything that needs a translation is sent in ONE
 * request per archive visit (chunked only if the archive is very large),
 * results are cached at module level so re-renders, list ↔ detail
 * navigation and remounts never re-request it, and a title that is already
 * in the active language is never sent at all.
 */

/** Whether an AI-generated/derived string is in the wrong script for the
    active UI language and so needs a real translation: any Hebrew on the
    English UI; Latin-only prose (no Hebrew at all) on the Hebrew UI. */
export function needsTranslation(text: string, language: AppLanguage): boolean {
  if (language === 'en') return containsHebrew(text);
  return !containsHebrew(text) && /[A-Za-z]{3}/.test(text);
}

/** The title exactly as derived from the saved record, in the language the
    dream was SAVED in — the source that gets translated, never the
    current-language fallback ("A Saved Dream"). */
export function savedTitleSource(dream: SavedDream): string {
  return titleFromSavedDream(dream, dream.appLanguage);
}

// Survives a refresh within the tab (so wording stays stable and nothing is
// re-requested), never leaves the browser, cleared when the tab closes.
const STORAGE_KEY = 'dare.titleTranslations.v1';
function loadCache(): Map<string, string> {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}');
    if (raw && typeof raw === 'object') {
      return new Map(Object.entries(raw as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'));
    }
  } catch {
    /* storage unavailable — in-memory only */
  }
  return new Map();
}
const cache = loadCache();
const inFlight = new Set<string>();
const MAX_PER_REQUEST = 30;

const keyOf = (text: string, language: AppLanguage) => `${language}:${text}`;

export function getCachedTitle(text: string, language: AppLanguage): string | null {
  return cache.get(keyOf(text, language)) ?? null;
}

/** Stores a translated title in its final display form (English titles get
    the archive's usual Title Case). */
export function cacheTitle(text: string, language: AppLanguage, translated: string): void {
  // A title is a name, not a sentence: drop trailing sentence punctuation the
  // model sometimes adds.
  const clean = translated.trim().replace(/[\s.,;:!?…]+$/u, '');
  if (!clean) return;
  cache.set(keyOf(text, language), language === 'en' ? titleCase(clean) : clean);
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(cache)));
  } catch {
    /* storage unavailable — in-memory only */
  }
}

/**
 * For the archive list: makes sure every real dream whose saved title is in
 * the other language has a translation on its way, and returns a map of
 * entry id → translated title for the ones that are ready. Entries without
 * a ready translation keep whatever title they already have.
 */
export function useTranslatedEntryTitles(entries: ArchiveEntry[], language: AppLanguage): Record<string, string> {
  const [version, setVersion] = useState(0);
  const mounted = useRef(true);
  const failed = useRef(new Set<string>());
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const pending = new Set<string>();
    for (const entry of entries) {
      if (entry.kind !== 'real') continue;
      const source = savedTitleSource(entry.savedDream);
      const key = keyOf(source, language);
      if (needsTranslation(source, language) && !cache.has(key) && !inFlight.has(key) && !failed.current.has(key)) {
        pending.add(source);
      }
    }
    const texts = [...pending];
    for (let i = 0; i < texts.length; i += MAX_PER_REQUEST) {
      const chunk = texts.slice(i, i + MAX_PER_REQUEST);
      chunk.forEach((text) => inFlight.add(keyOf(text, language)));
      translateTexts(chunk, language).then((result) => {
        chunk.forEach((text, j) => {
          inFlight.delete(keyOf(text, language));
          if (result.status === 'ok') cacheTitle(text, language, result.translations[j]);
          else failed.current.add(keyOf(text, language));
        });
        if (mounted.current) setVersion((v) => v + 1);
      });
    }
  }, [entries, language]);

  return useMemo(() => {
    const out: Record<string, string> = {};
    for (const entry of entries) {
      if (entry.kind !== 'real') continue;
      const source = savedTitleSource(entry.savedDream);
      if (!needsTranslation(source, language)) continue;
      const hit = getCachedTitle(source, language);
      if (hit) out[entry.id] = hit;
    }
    return out;
    // `version` re-reads the module cache after a batch resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, language, version]);
}
