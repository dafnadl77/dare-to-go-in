import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, he, type Translations } from './translations';
import { setActiveLanguage, type AppLanguage } from '../hero/appLanguage';

export type Language = AppLanguage;

const STORAGE_KEY = 'dare-language';
const RESOURCES: Record<Language, Translations> = { en, he };

function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'he';
}

function readStoredLanguage(): Language | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    // Private browsing / storage disabled — fall through to the default.
    return null;
  }
}

/** Applies lang/dir to <html> and mirrors the value into appLanguage.ts's
    plain-function bridge — done as one function so both the lazy useState
    initializer (synchronous, avoids an LTR flash before Hebrew paints) and
    the effect (reactive, on every later change) call exactly the same
    logic. */
function applyLanguage(language: Language): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'he' ? 'rtl' : 'ltr';
  setActiveLanguage(language);
}

/** Dotted-path lookup against a Translations object, e.g. 'hold.finishDream'. */
function lookup(dict: Translations, path: string): string | undefined {
  const parts = path.split('.');
  let node: unknown = dict;
  for (const part of parts) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

interface LanguageContextValue {
  language: Language;
  /** Persists to localStorage and updates document lang/dir immediately;
      does not reset, reload, or touch any dream/recording/archive state —
      callers own their own state and simply re-render with new strings. */
  setLanguage: (language: Language) => void;
  /** Dotted-path string lookup, e.g. t('hold.finishDream'). Falls back to
      the English string (never a raw key) if a Hebrew string is somehow
      missing — the two resources are the same TypeScript shape so this
      should never happen in practice, but a missing string must never
      render as literal "hold.finishDream" text. */
  t: (path: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const initial = readStoredLanguage() ?? 'en';
    // Applied synchronously here (not just in the effect below) so the
    // very first paint already has the right dir="rtl"/lang="he" — an
    // effect-only application would flash LTR for one frame first.
    applyLanguage(initial);
    return initial;
  });

  useEffect(() => {
    applyLanguage(language);
  }, [language]);

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing / storage disabled — the switch still works for
      // this session, it just won't be remembered next visit.
    }
  };

  const t = useMemo(() => {
    const dict = RESOURCES[language];
    return (path: string): string => lookup(dict, path) ?? lookup(en, path) ?? path;
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({ language, setLanguage, t }), [language, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage() must be used within a LanguageProvider');
  return ctx;
}
