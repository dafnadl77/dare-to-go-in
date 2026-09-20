import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../auth/AuthContext';
import { translateTexts } from '../archive/dreamTranslationEngine';
import { cacheReflectionText, getCachedReflectionText, needsTranslation } from '../archive/dreamTitleTranslation';
import type { AppLanguage } from './appLanguage';
import type { DreamReflectionResult } from './dreamReflectionSchema';

/**
 * Language-correct display of a reflection's AI-generated text on the LIVE
 * screens. The reflection is generated once, in whichever UI language was
 * active then, and is not regenerated when the UI language changes — so after
 * a switch it can be in the wrong language. That text used to be passed
 * through sanitizeAiTextForDisplay, which deletes every letter of the wrong
 * script and left the heading with an empty (or punctuation-only) body.
 *
 * Now: text already in the UI language is shown as is; wrong-language text is
 * translated through the same protected route/cache Dream Detail uses (shown
 * as "Translating…" meanwhile); and if a translation is unavailable — request
 * failed, unusable result, or no signed-in account to translate for — the
 * ORIGINAL text is shown as generated. Valid content is never turned into
 * nothing because of its language. Display only: the result is untouched.
 */
const inFlight = new Set<string>();
const keyOf = (language: AppLanguage, text: string) => `${language}|${text}`;

function reflectionTexts(result: DreamReflectionResult | null): string[] {
  if (!result) return [];
  const texts = [result.observation, result.personalAssociation, result.possibleThread, result.continuityQuestion];
  for (const lens of Object.values(result.lenses ?? {})) if (typeof lens === 'string') texts.push(lens);
  return [...new Set(texts.filter((t) => typeof t === 'string' && t.trim().length > 0))];
}

/** For screens that only need to show what is already available (no request of their own). */
export function displayCachedReflectionText(text: string, language: AppLanguage): string {
  if (!needsTranslation(text, language)) return text;
  return getCachedReflectionText(text, language) ?? text;
}

/** Returns `show(text)`: the text to render for one reflection string. */
export function useReflectionDisplay(result: DreamReflectionResult | null): (text: string) => string {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const [, setVersion] = useState(0);
  const failed = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const signedIn = !!user;
  useEffect(() => {
    // Translation needs a signed-in account; without one nothing is requested
    // and show() returns the original text.
    if (!signedIn) return;
    const pending = reflectionTexts(result).filter((text) => {
      const key = keyOf(language, text);
      return needsTranslation(text, language) && !getCachedReflectionText(text, language) && !inFlight.has(key) && !failed.current.has(key);
    });
    if (pending.length === 0) return;
    pending.forEach((text) => inFlight.add(keyOf(language, text)));
    const request = async () => {
      const first = await translateTexts(pending, language);
      const retryable = first.status === 'error' && ['request_failed', 'invalid_response', 'rate_limited'].includes(first.reason);
      if (!retryable) return first;
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return translateTexts(pending, language);
    };
    request().then((res) => {
      pending.forEach((text, i) => {
        inFlight.delete(keyOf(language, text));
        const translated = res.status === 'ok' ? res.translations[i] : '';
        if (translated && translated.trim()) cacheReflectionText(text, language, translated);
        else failed.current.add(keyOf(language, text));
      });
      if (mounted.current) setVersion((v) => v + 1);
    });
  }, [result, language, signedIn]);

  return (text: string) => {
    if (!text || !text.trim() || !needsTranslation(text, language)) return text;
    const hit = getCachedReflectionText(text, language);
    if (hit) return hit;
    if (!signedIn || failed.current.has(keyOf(language, text))) return text;
    return t('dreamDetail.translating');
  };
}
