import { detectRisk, safetyGate, type RiskLevel, type SafetyAck } from '../../src/hero/safety/riskDetector.js';
import { checkOutput, checkOutputSafely } from '../../src/hero/safety/outputCheck.js';
import { DARE_CATEGORIES, HER_CATEGORIES, RETELLING_CATEGORIES, type Moderate } from './moderation.js';

/**
 * The two checks every AI route makes (doc 106 / 109 / 110): her words BEFORE anything else, DARE's words BEFORE they are shown.
 * DARE's own detector decides first and works with no network; moderation can only raise a level:
 *   - on her words, moderation alone only ASKS ("from the dream, or now too?"), and when it is down the detector's answer stands;
 *   - on DARE's words, a moderation hit — or moderation being down — means the words are not shown.
 * Nothing about risk is stored or logged here.
 */

export type HerCheck = { allowed: true; level: RiskLevel } | { allowed: false; level: Exclude<RiskLevel, 'none'> };

const closed: HerCheck = { allowed: false, level: 'concern' };

/** Her answers in a journey: `latest` is what this request answers; `recent` her last words, joined, so a split sentence is read whole. */
export async function checkHerAnswers(p: { latest: string | null; earlier: readonly string[]; recent?: string; ack: SafetyAck | null; moderate: Moderate }): Promise<HerCheck> {
  let gate: ReturnType<typeof safetyGate>;
  try {
    gate = safetyGate({ latest: p.latest, earlier: p.earlier, ack: p.ack });
  } catch {
    return closed;
  }
  if (!gate.allowed) return { allowed: false, level: gate.level === 'none' ? 'concern' : gate.level };
  if (p.latest && gate.level === 'none' && p.ack === null) {
    const m = await p.moderate([p.latest, ...(p.recent && p.recent !== p.latest ? [p.recent] : [])], HER_CATEGORIES);
    if (m.status === 'ok' && m.hit) return { allowed: false, level: 'uncertain' };
  }
  return { allowed: true, level: gate.level };
}

/** The dream text itself (the analysis): a dream unless it says it is real life now; immediate danger is never acknowledged away. */
export async function checkDreamText(text: string, ack: SafetyAck | null, moderate: Moderate): Promise<HerCheck> {
  let v: ReturnType<typeof detectRisk>;
  try {
    v = detectRisk(text, 'dream');
  } catch {
    return closed;
  }
  if (v.level === 'danger' || v.level === 'threat') return { allowed: false, level: v.level };
  if (v.level === 'concern') return ack === 'not-immediate' ? { allowed: true, level: 'concern' } : { allowed: false, level: 'concern' };
  if (v.level === 'uncertain') return ack ? { allowed: true, level: 'uncertain' } : { allowed: false, level: 'uncertain' };
  if (ack === null) {
    const m = await moderate([text], HER_CATEGORIES);
    if (m.status === 'ok' && m.hit) return { allowed: false, level: 'uncertain' };
  }
  return { allowed: true, level: 'none' };
}

/** Every string a model answer would show. */
export const textsOf = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(textsOf) : v && typeof v === 'object' ? Object.values(v).flatMap(textsOf) : [];

/** DARE's words: shown only when DARE's own check AND moderation both pass. Moderation 'unavailable', or the check failing, = not shown. */
export async function dareWordsSafe(value: unknown, moderate: Moderate, kind: 'reply' | 'retelling' = 'reply'): Promise<boolean> {
  const texts = textsOf(value).filter((t) => t.trim());
  if (texts.length === 0) return true;
  const local = checkOutputSafely(() => texts.map((t) => checkOutput(t, kind)).find((c) => !c.ok) ?? { ok: true, reasons: [] });
  if (!local.ok) return false;
  const m = await moderate(texts, kind === 'retelling' ? RETELLING_CATEGORIES : DARE_CATEGORIES);
  return m.status === 'ok' && !m.hit;
}

/** The plain safety answer of a route: no detail beyond the level, nothing kept. */
export const safetyBody = (level: Exclude<RiskLevel, 'none'>) => ({ safety: { level } });
