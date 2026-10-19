/**
 * Which model a stage asks for, and proof of which one actually answered.
 *
 * The questions written for each dream and the final reflection may use their own model (OPENAI_QUESTIONS_MODEL, OPENAI_REFLECTION_MODEL).
 * Unset, a stage uses the shared OPENAI_MODEL exactly like every other route. There is NO fallback to another model when a call fails: a
 * failed call is a failed call (the interface keeps its fixed question, or shows the existing retry), never a silent answer from an older model.
 *
 * Every response names the model that produced it. It is recorded in the server log (stage, requested model, answering model: never any
 * dream text), and a mismatch (the provider answered with a different model than the one asked for) is logged as an error.
 */
const DEFAULT_MODEL = 'gpt-4o-mini';

export type StageModelVar = 'OPENAI_QUESTIONS_MODEL' | 'OPENAI_REFLECTION_MODEL';

export function resolveStageModel(stageVar: StageModelVar): string {
  return process.env[stageVar]?.trim() || process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

/** True when `answering` is the requested model or a dated snapshot of it ("gpt-4.1" → "gpt-4.1-2025-04-14"), and not a sibling such as "gpt-4.1-mini". */
export function modelMatches(requested: string, answering: string): boolean {
  return answering === requested || new RegExp(`^${requested.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d{4}-\\d{2}-\\d{2}$`).test(answering);
}

export function logModelUsed(stage: string, requested: string, answering: string | undefined): void {
  if (!answering) {
    console.error(`[ai-model] ${stage}: requested ${requested}, the response did not name its model`);
    return;
  }
  if (modelMatches(requested, answering)) console.info(`[ai-model] ${stage}: ${answering}`);
  else console.error(`[ai-model] ${stage}: MISMATCH requested ${requested}, answered by ${answering}`);
}
