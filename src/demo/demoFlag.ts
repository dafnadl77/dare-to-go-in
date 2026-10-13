/**
 * DEMO MODE: a way to walk through the whole journey (feelings step, enriched reflection, upgraded archive) with an invented dream and
 * made-up data only. It exists ONLY in builds that are not Vercel production (vite.config.ts defines __DARE_DEMO_BUILD__ as false there,
 * so everything behind this flag is removed from the production bundle), and only runs when asked for with ?demo=1.
 *
 * This file is deliberately tiny and free of side effects: the Supabase client reads it at start-up.
 */
declare const __DARE_DEMO_BUILD__: boolean;

export const DEMO_BUILD: boolean = typeof __DARE_DEMO_BUILD__ !== 'undefined' && __DARE_DEMO_BUILD__;

const SESSION_KEY = 'dare-demo';

/** True when this page load should run in demo mode: ?demo=1 turns it on for the tab, ?demo=0 turns it off again. */
export function demoRequested(): boolean {
  if (!DEMO_BUILD || typeof window === 'undefined') return false;
  try {
    const value = new URLSearchParams(window.location.search).get('demo');
    if (value === '1') {
      window.sessionStorage.setItem(SESSION_KEY, '1');
      return true;
    }
    if (value === '0') {
      window.sessionStorage.removeItem(SESSION_KEY);
      return false;
    }
    return window.sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

/** Set by installDemo() once the network is fenced off. Everything that behaves differently in demo mode keys off this. */
export function isDemoActive(): boolean {
  return DEMO_BUILD && typeof window !== 'undefined' && (window as unknown as { __dareDemoActive?: boolean }).__dareDemoActive === true;
}

/** The "Supabase" of the demo lives on this same site under /__demo and is answered inside the browser (see demoRouter.ts). */
export function demoSupabaseUrl(): string {
  return `${window.location.origin}/__demo`;
}

export const DEMO_ANON_KEY = 'demo-mode-anon-key-not-a-real-key';
