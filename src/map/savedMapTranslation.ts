import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppLanguage } from '../hero/appLanguage';
import type { Exploration } from '../hero/exploration';
import { cacheMapText, getCachedMapText } from '../archive/dreamTitleTranslation';
import { translateTexts } from '../archive/dreamTranslationEngine';
import { savedMapTextsToTranslate, translatedSavedMap } from './savedMapTexts';

/** The saved map's content in the interface language: what to translate and how it is put back is in savedMapTexts.ts (pure). */

// One request per (language, texts) at a time, shared by every mount (a remount or React's double effect waits for it, never sends it again).
const inFlight = new Map<string, Promise<boolean>>();
// A request the allowance or the service refused is not sent again from this tab for a while: the saved words are shown meanwhile.
const refusedUntil = new Map<string, number>();
const REFUSED_PAUSE_MS = 10 * 60 * 1000;

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
        // an empty answer for one text keeps its saved words (so it is never asked for again in a loop)
        cacheMapText(t, language, result.translations[i]?.trim() || t);
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
 * 'unavailable' when it could not be had (the saved words are shown, as everywhere else in the archive); 'ready' otherwise.
 */
export function useSavedMapTranslation(
  e: Exploration,
  sourceText: string,
  language: AppLanguage,
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
  // only what this tab has not translated already
  const missing = useMemo(() => texts.filter((t) => getCachedMapText(t, language) === null), [texts, language, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const requestKey = `${e.attemptId}|${language}|${missing.length}`;

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

  const shown = useMemo(() => translatedSavedMap(e, sourceText, language, (t) => getCachedMapText(t, language)), [e, sourceText, language, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const state: SavedMapTranslationState = missing.length === 0 ? 'ready' : failedFor === requestKey ? 'unavailable' : 'translating';
  return { state, ...shown };
}
