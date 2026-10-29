import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getLegalDocument, type LegalKey } from '../src/legal/legalContent';
import { BUSINESS } from '../src/legal/businessDetails';

/**
 * THE DOCUMENTS SAY WHAT THE SYSTEM DOES (2026-10-29). Each sentence corrected in this round, locked to the code it describes, in Hebrew and
 * in English: when a credit comes back, the one free dream, the two cookies, what is sent to OpenAI, the hashed password, the transaction
 * document sent in addition to the invoice, and no description of a journey store the site never writes. The business details stay the
 * city only (the owner's decision; a known legal risk recorded in docs/legal-drafts-2026-10/business-address-risk-2026-10-29.md).
 */

const read = (p: string) => readFileSync(p, 'utf8');
const all = (lang: 'he' | 'en', key: LegalKey) => {
  const d = getLegalDocument(lang, key);
  return [d.title, d.intro, ...d.sections.flatMap((s) => [s.heading, s.body]), d.draftNotice ?? ''].join('\n');
};
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(p) ? [p.replace(/\\/g, '/')] : [];
  });

test('a credit comes back when the first stage fails; a later step is tried again within the same dream', () => {
  for (const [lang, first, later] of [
    ['en', /first stage of a new dream \(reading and reconstructing it\) fails[^.]*, the credit is returned/, /later step, such as the image or the reflection,[^.]*tried again within the same dream without using another credit/],
    ['he', /השלב הראשון של חלום חדש \(קריאת החלום ושחזורו\) נכשל[^.]*הקרדיט מוחזר/, /שלב מאוחר יותר, כמו התמונה או ההתבוננות,[^.]*אפשר לנסות אותו שוב בתוך אותו חלום בלי לנצל קרדיט נוסף/],
  ] as const) {
    assert.match(all(lang, 'terms'), first);
    assert.match(all(lang, 'terms'), later);
    assert.doesNotMatch(all(lang, 'terms'), /If creating a dream fails|אם יצירת החלום נכשלת/);
    assert.match(all(lang, 'cancellation'), lang === 'en' ? /returned to the account automatically if the first stage of a dream fails/ : /קרדיט מוחזר לחשבון אוטומטית אם השלב הראשון של החלום נכשל/);
  }
  // the code: the credit is refunded by cancelling the attempt (analysis); a failed image only frees its own retry slot
  const attempts = read('server/dreamAttempts.ts');
  assert.match(attempts, /cancel_user_attempt/);
  assert.match(attempts, /refund_image_attempt/);
});

test('one free dream: before an account, or as the first dream of a confirmed account', () => {
  assert.match(all('en', 'terms'), /The first dream is free, once: either before you create an account, or as the first dream of an account with a confirmed email address\./);
  assert.match(all('he', 'terms'), /החלום הראשון ללא תשלום, פעם אחת: לפני פתיחת חשבון, או כחלום הראשון של חשבון עם כתובת אימייל מאומתת\./);
  assert.doesNotMatch(all('en', 'terms'), /Every account's first dream is free/);
});

test('privacy: two technical cookies, the hashed password, what is sent to OpenAI, and no store the site never writes', () => {
  const en = all('en', 'privacy');
  const he = all('he', 'privacy');
  assert.match(en, /Technical data: two technical cookies/);
  assert.match(he, /מידע טכני: שתי עוגיות טכניות/);
  assert.match(read('server/ageGate.ts'), /dare_age/, 'the second cookie exists');
  assert.match(he, /נשמרת אצל Supabase רק בצורה מגובבת \(hash\)/);
  assert.doesNotMatch(he, /בצורה מוצפנת/);
  for (const text of [en, he]) assert.match(text, /OpenAI/);
  assert.match(en, /the questions and the conversation about the dream's moments[\s\S]*the conversation so far[\s\S]*Your name and email address are not sent\./);
  assert.match(he, /השאלות והשיחה על רגעי החלום[\s\S]*והשיחה עד אותו רגע[\s\S]*השם וכתובת האימייל שלכם אינם נשלחים\./);
  // the dream routes never read the account's name or email
  for (const f of files('server/routes').filter((p) => /dream|pattern/i.test(p))) assert.doesNotMatch(read(f), /displayName|user\.email|\.email\b/, f);
  // the unfinished-journey store is written only by the prototype page, so the policy does not describe it
  const writers = files('src').filter((f) => /store\.save\(/.test(read(f)));
  assert.deepEqual(writers, ['src/map/DreamMapPrototype.tsx']);
  for (const text of [en, he]) assert.doesNotMatch(text, /IndexedDB/);
});

test('terms: the transaction details document comes in addition to the invoice', () => {
  assert.match(all('en', 'terms'), /In addition you will receive a transaction details document/);
  assert.match(all('he', 'terms'), /בנוסף תקבלו מסמך פרטי העסקה/);
});

test('business details: the city only, as the owner decided; no street or residential address anywhere', () => {
  assert.equal(BUSINESS.locationHe, 'קריית אונו, ישראל');
  assert.equal(BUSINESS.locationEn, 'Kiryat Ono, Israel');
  assert.equal(BUSINESS.fullAddress, null);
  // nothing on the site claims full compliance with the disclosure duties
  for (const lang of ['he', 'en'] as const) for (const key of ['terms', 'privacy', 'cancellation'] as LegalKey[]) {
    assert.doesNotMatch(all(lang, key), /fully compl|complies with all|עומד(ת|ים)? בכל (הדרישות|דרישות)/i);
  }
});

test('Hebrew and English carry the same corrections (each language has every corrected sentence)', () => {
  const pairs: [LegalKey, RegExp, RegExp][] = [
    ['terms', /first stage of a new dream/, /השלב הראשון של חלום חדש/],
    ['terms', /The first dream is free, once/, /החלום הראשון ללא תשלום, פעם אחת/],
    ['terms', /In addition you will receive/, /בנוסף תקבלו/],
    ['privacy', /two technical cookies/, /שתי עוגיות טכניות/],
    ['privacy', /Your name and email address are not sent/, /השם וכתובת האימייל שלכם אינם נשלחים/],
    ['cancellation', /if the first stage of a dream fails/, /אם השלב הראשון של החלום נכשל/],
  ];
  for (const [key, en, he] of pairs) {
    assert.match(all('en', key), en);
    assert.match(all('he', key), he);
  }
});
