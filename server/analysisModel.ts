const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * The model used by the dream-analysis route ONLY (structure extraction plus
 * the semantic concepts, in one request). OPENAI_ANALYSIS_MODEL wins when set;
 * otherwise it falls back to the shared OPENAI_MODEL exactly as before, so
 * leaving the new variable unset changes nothing. Reflection, translation and
 * element labels keep reading OPENAI_MODEL directly and never see this value.
 */
export function resolveAnalysisModel(): string {
  return process.env.OPENAI_ANALYSIS_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL;
}
