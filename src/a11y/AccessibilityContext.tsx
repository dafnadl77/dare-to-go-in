import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import './accessibility.css';

/** 0 = default size, 1 = larger, 2 = largest — applied as an `html`
    font-size multiplier (see accessibility.css's .a11y-text-1/-2), which
    every `rem`-based size in the app already scales against. Never
    changes anything on its own beyond that one root value. */
export type TextScale = 0 | 1 | 2;
const MAX_TEXT_SCALE: TextScale = 2;

export interface AccessibilitySettings {
  textScale: TextScale;
  highContrast: boolean;
  underlineLinks: boolean;
  reduceMotion: boolean;
}

interface AccessibilityContextValue extends AccessibilitySettings {
  increaseText: () => void;
  decreaseText: () => void;
  setHighContrast: (value: boolean) => void;
  setUnderlineLinks: (value: boolean) => void;
  setReduceMotion: (value: boolean) => void;
  reset: () => void;
}

const STORAGE_KEY = 'dare-a11y-settings';

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** The real, only default — respects the OS/browser preference the very
    first time DARE loads on a device, before the dreamer has ever touched
    the panel. Once they explicitly choose anything here, that stored
    choice is what persists, not this. */
function defaultSettings(): AccessibilitySettings {
  return { textScale: 0, highContrast: false, underlineLinks: false, reduceMotion: prefersReducedMotion() };
}

function readStoredSettings(): AccessibilitySettings {
  if (typeof window === 'undefined') return defaultSettings();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as Partial<AccessibilitySettings>;
    const fallback = defaultSettings();
    return {
      textScale: parsed.textScale === 1 || parsed.textScale === 2 ? parsed.textScale : 0,
      highContrast: Boolean(parsed.highContrast),
      underlineLinks: Boolean(parsed.underlineLinks),
      reduceMotion: typeof parsed.reduceMotion === 'boolean' ? parsed.reduceMotion : fallback.reduceMotion,
    };
  } catch {
    // Private browsing / storage disabled / malformed JSON — fall back to
    // real OS-preference defaults rather than crashing the whole app.
    return defaultSettings();
  }
}

function persist(settings: AccessibilitySettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Same private-browsing/storage-disabled case — the setting still
    // works for this session, it just won't be remembered next visit.
  }
}

/** Applies every setting to real `html` classes/inline style — one place,
    read by accessibility.css. Never touches component files directly:
    every visual effect (text size, contrast, underlines, reduced motion)
    is a global CSS rule keyed off these classes, so nothing here reaches
    into MediaRecorder, the recording orb, or any other protected system. */
function applyToDocument(settings: AccessibilitySettings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('a11y-text-1', settings.textScale === 1);
  root.classList.toggle('a11y-text-2', settings.textScale === 2);
  root.classList.toggle('a11y-high-contrast', settings.highContrast);
  root.classList.toggle('a11y-underline-links', settings.underlineLinks);
  root.classList.toggle('a11y-reduce-motion', settings.reduceMotion);
}

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AccessibilitySettings>(() => readStoredSettings());

  useEffect(() => {
    applyToDocument(settings);
    persist(settings);
  }, [settings]);

  const increaseText = useCallback(() => {
    setSettings((s) => ({ ...s, textScale: Math.min(MAX_TEXT_SCALE, s.textScale + 1) as TextScale }));
  }, []);
  const decreaseText = useCallback(() => {
    setSettings((s) => ({ ...s, textScale: Math.max(0, s.textScale - 1) as TextScale }));
  }, []);
  const setHighContrast = useCallback((value: boolean) => {
    setSettings((s) => ({ ...s, highContrast: value }));
  }, []);
  const setUnderlineLinks = useCallback((value: boolean) => {
    setSettings((s) => ({ ...s, underlineLinks: value }));
  }, []);
  const setReduceMotion = useCallback((value: boolean) => {
    setSettings((s) => ({ ...s, reduceMotion: value }));
  }, []);
  const reset = useCallback(() => {
    setSettings(defaultSettings());
  }, []);

  const value = useMemo<AccessibilityContextValue>(
    () => ({ ...settings, increaseText, decreaseText, setHighContrast, setUnderlineLinks, setReduceMotion, reset }),
    [settings, increaseText, decreaseText, setHighContrast, setUnderlineLinks, setReduceMotion, reset],
  );

  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}

export function useAccessibility(): AccessibilityContextValue {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error('useAccessibility() must be used within an AccessibilityProvider');
  return ctx;
}
