import { createDemoRouter, type DemoNetStats } from './demoRouter';
import { demoSupabaseUrl } from './demoFlag';

/**
 * Turns the page into the demo: fences off the network, signs in an invented demo account, and shows a small "demo" label.
 * Called once, synchronously, before the app (and its Supabase client) is loaded. See demoRouter.ts for the safety rules.
 */
export function installDemo(): void {
  const w = window as unknown as { __dareDemoActive?: boolean; __demoNet?: DemoNetStats };
  if (w.__dareDemoActive) return;
  w.__dareDemoActive = true;

  const realFetch = window.fetch.bind(window);
  const router = createDemoRouter({ realFetch, origin: window.location.origin });
  w.__demoNet = router.stats;
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => router.handle(input, init);

  // Nothing else may reach a server either: no sockets, no beacons, no XHR to anywhere but this site's own static files.
  const blocked = (what: string) => () => {
    router.stats.blocked += 1;
    router.stats.log.push(`blocked ${what}`);
    throw new Error(`Blocked in demo mode: ${what}`);
  };
  window.WebSocket = class {
    constructor() {
      blocked('WebSocket')();
    }
  } as unknown as typeof WebSocket;
  navigator.sendBeacon = () => {
    router.stats.blocked += 1;
    return false;
  };
  const realOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    const target = new URL(String(url), window.location.origin);
    if (target.origin !== window.location.origin || method.toUpperCase() !== 'GET') blocked(`XHR ${method} ${target.origin}`)();
    return (realOpen as (...args: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof XMLHttpRequest.prototype.open;

  // An invented demo account, already signed in, in the exact place the Supabase client reads its session from.
  try {
    const host = new URL(demoSupabaseUrl()).hostname.split('.')[0];
    window.localStorage.setItem(`sb-${host}-auth-token`, JSON.stringify(router.seedSession()));
  } catch {
    /* without storage the demo simply opens signed out */
  }

  mountBadge();
}

const BADGE_TEXT = {
  he: { short: 'הדגמה · נתונים מדומים', full: 'הדגמה: חלום מומצא, נתונים מדומים וטקסטים שנכתבו מראש. שום דבר לא נשמר, לא נשלח ולא נחשב בתשלום.' },
  en: { short: 'Demo · made-up data', full: 'Demo: an invented dream, made-up data and pre-written texts. Nothing is saved, sent or charged.' },
} as const;

function mountBadge(): void {
  const el = document.createElement('div');
  el.id = 'demo-badge';
  el.setAttribute('role', 'status');
  Object.assign(el.style, {
    position: 'fixed',
    right: '10px',
    bottom: '10px',
    zIndex: '70',
    padding: '6px 12px',
    borderRadius: '999px',
    background: 'rgba(5, 7, 16, 0.86)',
    border: '1px solid rgba(244, 240, 232, 0.45)',
    color: '#f4f0e8',
    font: "500 15px/1.2 'Heebo', 'Assistant', system-ui, sans-serif",
    pointerEvents: 'none',
    maxWidth: 'calc(100vw - 80px)',
  } satisfies Partial<CSSStyleDeclaration>);
  const apply = () => {
    const lang = document.documentElement.lang === 'en' ? 'en' : 'he';
    el.textContent = BADGE_TEXT[lang].short;
    el.setAttribute('aria-label', BADGE_TEXT[lang].full);
    el.title = BADGE_TEXT[lang].full;
  };
  apply();
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  document.body.appendChild(el);
}
