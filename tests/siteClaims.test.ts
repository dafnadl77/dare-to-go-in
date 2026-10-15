import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en, he } from '../src/i18n/translations.ts';
import { collectStrings } from '../src/hero/languageIntegrity.ts';

const all = (t: unknown) => collectStrings(t).join('\n');

test('site claims: no screen of the app promises a subscription, a PDF export or absolute secrecy', () => {
  // The purchase terms say, truthfully, that there is NO subscription: only that negated statement is allowed; any other mention fails.
  const english = all(en).replace(/\b(no|without) (a )?subscription\b/gi, '');
  const hebrew = all(he).replace(/(אין|ללא|בלי) מנוי/g, '');
  assert.doesNotMatch(english, /subscription|per month|monthly plan|auto-?renew/i);
  assert.doesNotMatch(hebrew, /מנוי|הוראת קבע|חידוש אוטומטי/);
  assert.doesNotMatch(english, /\bPDF\b/);
  assert.doesNotMatch(hebrew, /PDF/);
  assert.doesNotMatch(english, /only yours|nobody (else )?(can|will) (see|read)|no one (else )?(can|will) (see|read)|100% (private|secure)/i);
  assert.doesNotMatch(hebrew, /שלך בלבד|אף אחד לא (יכול|יראה)|פרטי לחלוטין/);
});

test('site claims: the privacy note on the opening says the same in both languages (the dream stays yours, not "only yours")', () => {
  assert.equal(en.hold.privacyNote, 'Your dream stays yours.');
  assert.equal(he.hold.privacyNote, 'החלום נשאר שלך.');
});

test('site claims: the product voice in Hebrew is the plural "we" on the recording screen (no mixed masculine/feminine singular)', () => {
  assert.equal(he.hold.listening, 'מקשיבים…');
  assert.doesNotMatch(all(he), /שאני מצליחה/);
});
