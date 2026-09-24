/**
 * Email addresses inside plain legal text. The local part must START with a
 * letter or digit: Hebrew attaches prefixes with a hyphen ("ב-address@example.com"),
 * and a pattern that let a leading "-" in would swallow that hyphen into the
 * address and produce a broken mailto link.
 */
export const EMAIL_PATTERN = /([A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

/** Splits text into alternating plain / email parts (odd indexes are emails). */
export function splitEmails(text: string): string[] {
  return text.split(EMAIL_PATTERN);
}
