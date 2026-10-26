/**
 * The conversation page's one way out (development only): the local conversation bridge on this computer's loopback address
 * (scripts/conversationBridge.ts), used ONLY when "שיחה אמיתית" is chosen. It never reaches the site, Supabase or any other host.
 */
export const LIVE_BRIDGE = 'http://127.0.0.1:8788';

export async function livePost(url: string, body: unknown, timeoutMs: number): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${LIVE_BRIDGE}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  return { status: res.status, data: await res.json().catch(() => null) };
}

/** What the live test spent so far, its cap, and what is left of the stage; null when the bridge is not running. */
export async function liveSpent(): Promise<{ spent: number; cap: number; stageLeft: number } | null> {
  try {
    const res = await fetch(`${LIVE_BRIDGE}/__live/spent`, { signal: AbortSignal.timeout(2000) });
    return res.ok ? ((await res.json()) as { spent: number; cap: number; stageLeft: number }) : null;
  } catch {
    return null;
  }
}
