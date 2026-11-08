/** Pure: no network, no storage (2026-11-08). Used by dreamTranslationEngine.ts, tested on its own. */
/** The browser's own batch bounds, kept under the server's caps (40 texts, 24k characters a request; see server/extrasLimits.ts). */
export const CLIENT_MAX_TEXTS_PER_REQUEST = 40;
export const CLIENT_MAX_CHARS_PER_REQUEST = 20_000;

/** Splits texts, in order, into batches within the bounds above. A single text longer than the character bound is its own batch. */
export function batchTexts(texts: readonly string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let chars = 0;
  for (const text of texts) {
    if (current.length > 0 && (current.length >= CLIENT_MAX_TEXTS_PER_REQUEST || chars + text.length > CLIENT_MAX_CHARS_PER_REQUEST)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(text);
    chars += text.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
