/**
 * The money guard of the live conversation test (scripts/conversationBridge.ts). Every request to the model is checked BEFORE it is
 * sent, against its own worst case (every input character a third of a token — Hebrew measured at 3.3–3.4 characters a token in the
 * pfi-1 run, so this is on the safe side — and the full output bound): it is sent only if the run's spent plus that worst case stays
 * within the run's hard cap AND within what is left of the stage. A request with no output bound is never sent.
 */

export const LIVE_RUN = 'cv-live-1';
export const PRICES: Record<string, [number, number]> = { 'gpt-4.1-mini': [0.4, 1.6], 'gpt-4.1': [2, 8], 'gpt-4o-mini': [0.15, 0.6], 'gpt-4o': [2.5, 10] };
export const priceOf = (model: string): [number, number] => PRICES[Object.keys(PRICES).sort((a, b) => b.length - a.length).find((k) => model.startsWith(k)) ?? ''] ?? [2.5, 10];

export function requestWorstUsd(params: { model: string; instructions?: unknown; input?: unknown; max_output_tokens?: unknown }): number | null {
  const maxOut = typeof params.max_output_tokens === 'number' ? params.max_output_tokens : null;
  if (!maxOut) return null;
  const chars = String(params.instructions ?? '').length + (typeof params.input === 'string' ? params.input.length : JSON.stringify(params.input ?? '').length);
  const [pin, pout] = priceOf(params.model);
  return ((chars / 3) * pin + maxOut * pout) / 1_000_000;
}

export function mayCall(b: { worst: number | null; spentRun: number; runCap: number; stageSpent: number; stageStop: number }): { ok: boolean; why: string } {
  if (b.worst === null) return { ok: false, why: 'a request with no output bound is never sent' };
  if (!(b.runCap > 0)) return { ok: false, why: 'no approved cap for the live test' };
  if (b.spentRun + b.worst > b.runCap) return { ok: false, why: `the run's hard cap: spent $${b.spentRun.toFixed(4)}, next up to $${b.worst.toFixed(4)}, cap $${b.runCap}` };
  if (b.stageSpent + b.worst > b.stageStop) return { ok: false, why: `stage 3 has $${(b.stageStop - b.stageSpent).toFixed(4)} left` };
  return { ok: true, why: '' };
}

export const usdOf = (model: string, input: number, output: number) => {
  const [pin, pout] = priceOf(model);
  return (input * pin + output * pout) / 1_000_000;
};
