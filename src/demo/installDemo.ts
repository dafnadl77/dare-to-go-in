import { createDemoRouter, type DemoNetStats } from './demoRouter';
import { demoSupabaseUrl } from './demoFlag';
import { mountDemoPanel } from './demoPanel';

/**
 * Turns the page into the demo: fences off the network, signs in an invented demo account, and shows a small "demo" label.
 * Called once, synchronously, before the app (and its Supabase client) is loaded. See demoRouter.ts for the safety rules.
 */
export function installDemo(): void {
  const w = window as unknown as { __dareDemoActive?: boolean; __demoNet?: DemoNetStats };
  if (w.__dareDemoActive) return;
  w.__dareDemoActive = true;

  const realFetch = window.fetch.bind(window);
  // LOCAL TEST JOURNEY: only the exact local bridge address, only on a page served from this computer, only in a build that is not Vercel production.
  const bridgeUrl = import.meta.env.VITE_DEMO_BRIDGE_URL;
  const onThisComputer = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const bridge = bridgeUrl === 'http://127.0.0.1:8787' && onThisComputer ? { url: bridgeUrl, fetch: realFetch } : undefined;
  const router = createDemoRouter({ realFetch, origin: window.location.origin, bridge });
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

  // ?lang=en|he opens the demo in that language (the app reads this same key when it starts).
  try {
    const lang = new URLSearchParams(window.location.search).get('lang');
    if (lang === 'en' || lang === 'he') window.localStorage.setItem('dare-language', lang);
  } catch {
    /* the app then keeps its own default */
  }

  // An invented demo account, already signed in, in the exact place the Supabase client reads its session from.
  try {
    const host = new URL(demoSupabaseUrl()).hostname.split('.')[0];
    window.localStorage.setItem(`sb-${host}-auth-token`, JSON.stringify(router.seedSession()));
  } catch {
    /* without storage the demo simply opens signed out */
  }

  mountDemoPanel({ bridge: !!bridge });
}
