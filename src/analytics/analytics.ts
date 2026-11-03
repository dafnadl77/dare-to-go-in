import { isDemoActive } from '../demo/demoFlag';
import type { PaidPackageId } from '../payments/checkout';

/**
 * Conversion counts with Vercel Web Analytics (cookieless; same-origin script and intake, so the CSP stays 'self').
 *
 * Only on the live site (daretogoin.com), never in development, previews or the demo. Nothing personal ever leaves here: no dream
 * text, answers, names, e-mails, user or order ids, payment details. Each event carries at most one fixed, non-personal property
 * (Pro allows 2), typed below so nothing else can be passed. Page addresses are cut to the path and one known `view` value, so a
 * Supabase sign-in code, a token in the hash or a payment order id in the address never reaches Vercel.
 *
 * Until Web Analytics is enabled for the project in the Vercel dashboard the script address does not exist (404): nothing is sent
 * and nothing is billed.
 */

export const LIVE_HOSTNAME = 'daretogoin.com';
export const ANALYTICS_SCRIPT_SRC = '/_vercel/insights/script.js';

/** The page view counts the visit itself ("entering the site"); these are the custom events and the only properties each may carry. */
export interface AnalyticsEvents {
  signup_open: { from: 'start' | 'package' | 'save' | 'free_dream_used' | 'other' };
  signup_complete: Record<string, never>;
  dream_start: Record<string, never>;
  dream_complete: Record<string, never>;
  pricing_view: { signed_in: boolean };
  checkout_start: { package: PaidPackageId };
  purchase_confirmed: Record<string, never>;
}
export type AnalyticsEventName = keyof AnalyticsEvents;

/** The `view` values that may stay in a page address (screen names only). */
const SAFE_VIEWS = new Set(['archive', 'write', 'about', 'pricing', 'terms', 'privacy', 'cancellation', 'accessibility']);

/** Keeps the path and a known `view`; drops every other query parameter and the hash. */
export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const view = url.searchParams.get('view');
    const clean = new URL(url.origin + url.pathname);
    if (view && SAFE_VIEWS.has(view)) clean.searchParams.set('view', view);
    return clean.toString();
  } catch {
    return '';
  }
}

type VaQueue = (...args: unknown[]) => void;
declare global {
  interface Window {
    va?: VaQueue;
    vaq?: unknown[][];
  }
}

export function analyticsAllowed(hostname: string = window.location.hostname, demo: boolean = isDemoActive()): boolean {
  return hostname === LIVE_HOSTNAME && !demo;
}

let started = false;

/** Loads the Vercel script once (the live site only) and redacts every page view and event before it is sent. */
export function startAnalytics(): void {
  if (started || typeof window === 'undefined' || !analyticsAllowed()) return;
  started = true;
  window.va =
    window.va ||
    function (...args: unknown[]) {
      (window.vaq = window.vaq || []).push(args);
    };
  window.va('beforeSend', (event: { url: string }) => {
    const url = redactUrl(event.url);
    return url ? { ...event, url } : null;
  });
  const script = document.createElement('script');
  script.src = ANALYTICS_SCRIPT_SRC;
  script.defer = true;
  script.dataset.sdkn = 'dare-to-go-in';
  document.head.appendChild(script);
}

/** Counts one event. Silent everywhere except the live site; never throws. */
export function track<E extends AnalyticsEventName>(name: E, ...data: AnalyticsEvents[E] extends Record<string, never> ? [] : [AnalyticsEvents[E]]): void {
  if (!started) return;
  try {
    window.va?.('event', data[0] ? { name, data: data[0] } : { name });
  } catch {
    /* counting must never disturb the product */
  }
}

/** How long after creation a first sign-in still counts as a completed sign-up (covers a confirmation e-mail opened a little later). */
export const NEW_ACCOUNT_WINDOW_MS = 30 * 60 * 1000;

/** The account was created within the window above (Supabase's created_at); an unreadable date is never counted. */
export function isNewAccount(createdAt: string | undefined, now: number = Date.now()): boolean {
  const created = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(created) && now - created >= -60_000 && now - created <= NEW_ACCOUNT_WINDOW_MS;
}
