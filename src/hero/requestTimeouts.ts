/**
 * Client-side deadlines for the AI-backed calls. Generous multiples of their normal
 * latency (analysis/labels/reflection take seconds; an image up to about a minute), so
 * they only ever fire when something is genuinely wrong. A timeout aborts the request and
 * surfaces as the same recoverable failure any other network error already produces.
 * Transcription is deliberately NOT here: it has its own user-facing cancel.
 */
export const IMAGE_TIMEOUT_MS = 90_000;
export const ANALYSIS_TIMEOUT_MS = 45_000;
export const REFLECTION_TIMEOUT_MS = 45_000;
export const LABELS_TIMEOUT_MS = 45_000;
