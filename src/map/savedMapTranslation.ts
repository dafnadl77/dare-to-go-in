import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppLanguage } from '../hero/appLanguage';
import type { Exploration } from '../hero/exploration';
import { cacheMapText, getCachedMapText, readsAs } from '../archive/dreamTitleTranslation';
import { translateTexts } from '../archive/dreamTranslationEngine';
import { savedMapTextsToTranslate, translatedSavedMap } from './savedMapTexts';

/** The saved map's content in the interface language: what to translate and how it is put back is in savedMapTexts.ts (pure). */

// One request per (language, texts) at a time, shared by every mount (a remount or React's double effect waits for it, never sends it again).
const inFlight = new Map<string, Promise<boolean>>();
// A request the allowance or the service refused is not sent again from this tab for a while.
const refusedUntil = new Map<string, number>();
const REFUSED_PAUSE_MS = 10 * 60 * 1000;
// Texts whose answer was not a translation (empty, unchanged, still in the other language): not asked for again in this tab.
const untranslatable = new Set<string>();
const keyOf = (text: string, language: AppLanguage) => `${language}\u0000${text}`;

async function requestTranslations(texts: string[], language: AppLanguage): Promise<boolean> {
  const key = `${language}\u0000${texts.join('\u0000')}`;
  const running = inFlight.get(key);
  if (running) return running;
  if ((refusedUntil.get(key) ?? 0) > Date.now()) return false;
  const job = translateTexts(texts, language)
    .then((result) => {
      if (result.status !== 'ok') {
        refusedUntil.set(key, Date.now() + REFUSED_PAUSE_MS);
        return false;
      }
      texts.forEach((t, i) => {
        const value = result.translations[i]?.trim() ?? '';
        if (readsAs(value, language)) cacheMapText(t, language, value);
        else untranslatable.add(keyOf(t, language));
      });
      return true;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

export type SavedMapTranslationState = 'ready' | 'translating' | 'unavailable';

/**
 * The saved map's content in the interface language. 'translating' while a translation is on its way (nothing half-translated is shown);
 * 'ready' once every text is in the interface language. A text whose translation cannot be had is never shown in the other language
 * (her rule, 2026-11-12): `unavailable` (the interface's own "translation unavailable" line) stands in its place, and the state is
 * 'unavailable' when the whole request was refused.
 */
export function useSavedMapTranslation(
  e: Exploration,
  sourceText: string,
  language: AppLanguage,
  unavailable: string,
): { state: SavedMapTranslationState; exploration: Exploration; sourceText: string } {
  const [version, setVersion] = useState(0);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const texts = useMemo(() => savedMapTextsToTranslate(e, sourceText, language), [e, sourceText, language]);
  // only what this tab has not translated (or found untranslatable) already
  const missing = useMemo(() => texts.filter((t) => getCachedMapText(t, language) === null && !untranslatable.has(keyOf(t, language))), [texts, language, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const requestKey = `${e.attemptId}|${language}|${missing.length}`;
  const refused = missing.length > 0 && failedFor === requestKey;

  useEffect(() => {
    if (missing.length === 0) return;
    let live = true;
    void requestTranslations(missing, language).then((ok) => {
      if (!live || !mounted.current) return;
      if (ok) setVersion((v) => v + 1);
      else setFailedFor(requestKey);
    });
    return () => {
      live = false;
    };
    // `missing` changes only with the dream, the language, or a finished translation
  }, [requestKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(
    () =>
      translatedSavedMap(e, sourceText, language, (t) => {
        const hit = getCachedMapText(t, language);
        if (hit) return hit;
        return untranslatable.has(keyOf(t, language)) || refused ? unavailable : null;
      }),
    [e, sourceText, language, version, refused, unavailable], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const state: SavedMapTranslationState = missing.length === 0 ? 'ready' : refused ? 'unavailable' : 'translating';
  return { state, ...shown };
}
