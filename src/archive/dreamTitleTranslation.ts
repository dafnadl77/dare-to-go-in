import { useEffect, useMemo, useRef, useState } from 'react';
import { containsHebrew, type AppLanguage } from '../hero/appLanguage';
import {
  excerptText,
  keywordsFromSavedDream,
  titleCase,
  titleFromSavedDream,
  truncateExcerpt,
  type ArchiveEntry,
} from './archiveData';
import { translateTexts } from './dreamTranslationEngine';
import type { SavedDream } from '../hero/dreamStorage';

/**
 * Display-only translation of the metadata a saved dream's archive CARD
 * shows — title, excerpt and keywords — shared with DreamDetail (which
 * uses the title) so both screens agree. Nothing here ever touches the
 * saved dream: it is unchanged, this only fills a cache of translated
 * strings (in memory, mirrored to sessionStorage).
 *
 * Cost control: each distinct string is translated at most once per
 * (field kind, language) per browser tab. Everything a visit needs — every
 * card's title, excerpt and keywords — goes out in ONE request (chunked
 * only if the archive is very large), results are cached so re-renders,
 * language toggles, list ↔ detail navigation, remounts and refreshes never
 * re-request them, and text already in the active language is never sent.
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

type Kind = 'title' | 'excerpt' | 'keyword';

// Survives a refresh within the tab, never leaves the browser, cleared when
// the tab closes.
const STORAGE_KEY = 'dare.archiveTranslations.v2';
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
const MAX_PER_REQUEST = 40;

const keyOf = (kind: Kind, text: string, language: AppLanguage) => `${kind}|${language}|${text}`;

/** A title/keyword is a name, not a sentence: drop trailing sentence
    punctuation the model sometimes adds. */
const stripTrailing = (text: string) => text.trim().replace(/[\s.,;:!?…]+$/u, '');

function finalize(kind: Kind, language: AppLanguage, translated: string): string {
  if (kind === 'excerpt') return translated.trim();
  const clean = stripTrailing(translated);
  if (kind === 'keyword') return clean.toLowerCase();
  return language === 'en' ? titleCase(clean) : clean;
}

function getCached(kind: Kind, text: string, language: AppLanguage): string | null {
  return cache.get(keyOf(kind, text, language)) ?? null;
}

function store(kind: Kind, text: string, language: AppLanguage, translated: string): void {
  const value = finalize(kind, language, translated);
  if (!value) return;
  cache.set(keyOf(kind, text, language), value);
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(cache)));
  } catch {
    /* storage unavailable — in-memory only */
  }
}

/** Title cache, used by DreamDetail so it and the list share one translation. */
export function getCachedTitle(text: string, language: AppLanguage): string | null {
  return getCached('title', text, language);
}
export function cacheTitle(text: string, language: AppLanguage, translated: string): void {
  store('title', text, language, translated);
}

/** What the card needs translated for one entry: the saved-language source
    text per field, or nothing when that field is already fine as is. */
interface CardSources {
  title: string | null;
  excerpt: string | null;
  keywords: string[];
}

function cardSources(dream: SavedDream, language: AppLanguage): CardSources {
  const title = savedTitleSource(dream);

  // The excerpt: keep what the list already derives for this language when
  // that is real text in the right script; otherwise translate the summary
  // (or observation) as saved.
  const native = excerptText(dream, language);
  const anyLanguage = excerptText(dream, 'he');
  const excerpt =
    native !== null && !needsTranslation(native, language)
      ? null
      : anyLanguage && needsTranslation(anyLanguage, language)
        ? anyLanguage
        : null;

  // Keywords as saved (first three, any language); only the ones in the
  // wrong script are translated.
  const keywords = keywordsFromSavedDream(dream, 'he').filter((w) => needsTranslation(w, language));

  return { title: needsTranslation(title, language) ? title : null, excerpt, keywords };
}

export interface CardOverrides {
  title?: string;
  excerpt?: string;
  keywords?: string[];
}

/**
 * For the archive list: makes sure every real dream whose card text is in
 * the other language has its translation on its way, and returns per-entry
 * overrides for whatever is ready. A field without a ready translation
 * keeps whatever the entry already shows.
 */
export function useTranslatedCards(entries: ArchiveEntry[], language: AppLanguage): Record<string, CardOverrides> {
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
    // Deduplicated across every card, so the same word or title is sent once.
    const pending = new Map<string, { kind: Kind; text: string }>();
    const want = (kind: Kind, text: string | null) => {
      if (!text) return;
      const key = keyOf(kind, text, language);
      if (cache.has(key) || inFlight.has(key) || failed.current.has(key)) return;
      pending.set(key, { kind, text });
    };
    for (const entry of entries) {
      if (entry.kind !== 'real') continue;
      const s = cardSources(entry.savedDream, language);
      want('title', s.title);
      want('excerpt', s.excerpt);
      s.keywords.forEach((w) => want('keyword', w));
    }
    const items = [...pending.entries()];
    for (let i = 0; i < items.length; i += MAX_PER_REQUEST) {
      const chunk = items.slice(i, i + MAX_PER_REQUEST);
      chunk.forEach(([key]) => inFlight.add(key));
      translateTexts(
        chunk.map(([, item]) => item.text),
        language,
      ).then((result) => {
        chunk.forEach(([key, item], j) => {
          inFlight.delete(key);
          if (result.status === 'ok') store(item.kind, item.text, language, result.translations[j]);
          else failed.current.add(key);
        });
        if (mounted.current) setVersion((v) => v + 1);
      });
    }
  }, [entries, language]);

  return useMemo(() => {
    const out: Record<string, CardOverrides> = {};
    for (const entry of entries) {
      if (entry.kind !== 'real') continue;
      const s = cardSources(entry.savedDream, language);
      const o: CardOverrides = {};
      if (s.title) {
        const hit = getCached('title', s.title, language);
        if (hit) o.title = hit;
      }
      if (s.excerpt) {
        const hit = getCached('excerpt', s.excerpt, language);
        if (hit) o.excerpt = truncateExcerpt(hit);
      }
      if (s.keywords.length > 0) {
        // Only once every keyword that needs it is ready, so a card never
        // shows a half-translated tag list.
        const all = keywordsFromSavedDream(entry.savedDream, 'he');
        const resolved = all.map((w) => (needsTranslation(w, language) ? getCached('keyword', w, language) : w));
        const ready = resolved.filter((w): w is string => w !== null);
        if (ready.length === resolved.length) o.keywords = [...new Set(ready)];
      }
      if (o.title !== undefined || o.excerpt !== undefined || o.keywords !== undefined) out[entry.id] = o;
    }
    return out;
    // `version` re-reads the module cache after a batch resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, language, version]);
}
