/**
 * The minimum payment details Grow requires to create a payment link: a full name (at least two names) and an Israeli
 * mobile number. Shared by the server (the authority) and, later, the checkout form (for instant feedback only).
 *
 * These are CHECKOUT details: they are used for the payment page only. They are never an account identity, never stored
 * by DARE, never put in a Grow custom field and never logged.
 */

export type PayerField = 'fullName' | 'phone';

export interface PayerDetails {
  fullName: string;
  /** Israeli mobile in local form, e.g. 0541234567. */
  phone: string;
}

/** Invisible direction marks that keyboards and copy/paste add around names and numbers. */
const BIDI_MARKS = /[‎‏‪-‮⁦-⁩​-‍﻿]/g;
/** Hyphens and dots between names become a space (Grow rejects special characters): "בן-דוד" is "בן דוד". */
const NAME_SEPARATORS = /[‐-―-.]/g;
/** Apostrophes and geresh inside a name are dropped so the letters stay together: "O'Brien" is "OBrien". */
const NAME_APOSTROPHES = /['’‘`׳]/g;
const NAME_WORD = /^\p{L}{2,30}$/u;

/**
 * Letters only, two to five names, each at least two letters ("Dafna Dalmeida", "דפנה דלמדה", "בן-דוד" becomes "בן דוד").
 * Returns the cleaned name, or null when it is not acceptable.
 */
export function normalizeFullName(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 100) return null;
  const cleaned = raw
    .normalize('NFC')
    .replace(BIDI_MARKS, '')
    .replace(/\p{M}/gu, '') // Hebrew vowel points and other combining marks
    .replace(NAME_APOSTROPHES, '')
    .replace(NAME_SEPARATORS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = cleaned.split(' ');
  if (words.length < 2 || words.length > 5) return null;
  if (!words.every((w) => NAME_WORD.test(w))) return null;
  return cleaned.length <= 60 ? cleaned : null;
}

/**
 * An Israeli MOBILE number (05X-XXXXXXX), typed with spaces, dashes or brackets, or in international form
 * (+972 54 123 4567, 00972..., 972...). Returns the local ten-digit form, or null (landlines and foreign numbers are refused).
 */
export function normalizeIsraeliMobile(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 30) return null;
  let digits = raw.replace(BIDI_MARKS, '').replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith('972')) {
    digits = digits.slice(3);
    if (digits.startsWith('0')) digits = digits.slice(1); // +972 (0)54...
    digits = `0${digits}`;
  }
  return /^05\d{8}$/.test(digits) ? digits : null;
}

export type PayerResult = { ok: true; payer: PayerDetails } | { ok: false; field: PayerField };

export function validatePayerDetails(fullName: unknown, phone: unknown): PayerResult {
  const name = normalizeFullName(fullName);
  if (!name) return { ok: false, field: 'fullName' };
  const mobile = normalizeIsraeliMobile(phone);
  if (!mobile) return { ok: false, field: 'phone' };
  return { ok: true, payer: { fullName: name, phone: mobile } };
}
