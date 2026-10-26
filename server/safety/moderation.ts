import { normalize } from '../../src/hero/safety/riskDetector.js';

/**
 * OpenAI's moderation service as a SECOND layer next to DARE's own detector (doc 110, approved 2026-10-24). It can only raise a
 * level, never lower one, and it is measured, not trusted: in Hebrew it is weaker than the detector (17/22 against 22/22).
 *
 *   - Only the categories that mean intent, instructions or a threat. `violence` and the overall `flagged` are never used: on the
 *     synthetic set they stopped 30 sound sentences, most of them frightening dreams.
 *   - Each text is sent twice in one request: as written, and normalized the way the detector reads it (vowel signs, spaced letters,
 *     digits for letters), and the higher score counts.
 *   - Free; /v1/moderations keeps nothing for abuse monitoring (OpenAI "Your data", checked 2026-10-24). Nothing here is logged.
 *   - Any failure — no key, network, timeout, a rate limit, an odd answer — is 'unavailable'. The callers decide what that means:
 *     her words fall back to the detector alone; DARE's words are then not shown.
 */

export const MODERATION_MODEL = 'omni-moderation-latest';
export const MODERATION_TIMEOUT_MS = 3000;
export const MODERATION_THRESHOLD = 0.5;

/** Her words: a wish to die or to harm herself, a request for a way, a threat. */
export const HER_CATEGORIES = ['self-harm', 'self-harm/intent', 'self-harm/instructions', 'harassment/threatening', 'illicit/violent'] as const;
/** DARE's own words: the same. */
export const DARE_CATEGORIES = HER_CATEGORIES;
/** A dream retold (the analysis, a translated title): only instructions, since the retelling of a frightening dream is the dream. */
export const RETELLING_CATEGORIES = ['self-harm/instructions', 'illicit/violent'] as const;

export type ModerationVerdict = { status: 'ok'; hit: boolean } | { status: 'unavailable' };
export type Moderate = (texts: readonly string[], categories: readonly string[]) => Promise<ModerationVerdict>;

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export function createModerate(deps: { apiKey: () => string | undefined; fetch: Fetch; timeoutMs?: number }): Moderate {
  return async (texts, categories) => {
    const items = texts.map((t) => t.trim()).filter(Boolean);
    if (items.length === 0) return { status: 'ok', hit: false };
    const key = deps.apiKey();
    if (!key) return { status: 'unavailable' };
    try {
      const input = items.flatMap((t) => [t, normalize(t)]);
      const res = await deps.fetch('https://api.openai.com/v1/moderations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: MODERATION_MODEL, input }),
        signal: AbortSignal.timeout(deps.timeoutMs ?? MODERATION_TIMEOUT_MS),
      });
      if (!res.ok) return { status: 'unavailable' };
      const data = (await res.json()) as { results?: { category_scores?: Record<string, unknown> }[] } | null;
      const results = data?.results;
      if (!Array.isArray(results) || results.length !== input.length) return { status: 'unavailable' };
      const hit = results.some((r) => categories.some((c) => {
        const s = r?.category_scores?.[c];
        return typeof s === 'number' && s >= MODERATION_THRESHOLD;
      }));
      return { status: 'ok', hit };
    } catch {
      return { status: 'unavailable' };
    }
  };
}

export const realModerate: Moderate = createModerate({ apiKey: () => process.env.OPENAI_API_KEY, fetch: (url, init) => fetch(url, init) });
