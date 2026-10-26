import type { Exploration, ExploredMoment, MomentId } from '../exploration.js';
import { safetyGate, type RiskKind, type RiskLevel, type SafetyAck } from './riskDetector.js';

/**
 * Her words in a journey, for the distress path (doc 106): the words this request answers (`latest`), and every word she said before.
 * The same on both sides — the browser checks before sending, the route checks before anything else. Nothing here is stored.
 */
export type SafetyMode = 'conversation-turn' | 'conversation-summary' | 'moment-question' | 'moment-reply' | 'whole-view';

export function herWordsForSafety(e: Exploration, mode: string, momentId: MomentId | null): { latest: string | null; earlier: string[] } {
  const all: { id: MomentId; text: string }[] = [];
  for (const [id, x] of Object.entries(e.explored) as [MomentId, ExploredMoment][]) {
    for (const t of x.turns ?? []) if (t.role === 'dreamer') all.push({ id, text: t.text });
    for (const a of [x.firstTry?.answer, x.answer, x.followUp?.answer]) if (a) all.push({ id, text: a });
  }
  const entry = momentId ? e.explored[momentId] : undefined;
  let latest: string | null = null;
  if (entry && mode === 'conversation-turn') {
    const last = entry.turns?.[entry.turns.length - 1];
    latest = last?.role === 'dreamer' ? last.text : null;
  } else if (entry && mode === 'moment-reply') latest = entry.followUp?.answer ?? entry.answer ?? null;
  // her latest words once, as "latest"; any other copy of them (an answer is also her first turn) stays among the earlier ones
  let skipped = latest === null;
  const earlier = all.filter((w) => (!skipped && w.id === momentId && w.text === latest ? ((skipped = true), false) : true)).map((w) => w.text);
  return { latest, earlier };
}

/** The gate for one request. Fails closed: if the check itself cannot run, nothing is sent and nothing is shown. */
export function journeyGate(e: Exploration, mode: string, momentId: MomentId | null, ack: SafetyAck | null): { allowed: boolean; level: RiskLevel; kinds: RiskKind[] } {
  try {
    return safetyGate({ ...herWordsForSafety(e, mode, momentId), ack });
  } catch {
    return { allowed: false, level: 'concern', kinds: [] };
  }
}

export const safetyAckOf = (v: unknown): SafetyAck | null => (v === 'dream' || v === 'not-immediate' ? v : null);
