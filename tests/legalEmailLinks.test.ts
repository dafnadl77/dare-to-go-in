import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitEmails } from '../src/legal/emailPattern.ts';
import { getLegalDocument } from '../src/legal/legalContent.ts';

const emailsIn = (text: string) => splitEmails(text).filter((_, i) => i % 2 === 1);

test('a Hebrew hyphen prefix is never swallowed into the address (the live mailto:-address bug)', () => {
  assert.deepEqual(emailsIn('אנא ספרו לנו ב-daretogoin@gmail.com — דיווחים'), ['daretogoin@gmail.com']);
  assert.deepEqual(emailsIn('שלחו אל daretogoin@gmail.com.'), ['daretogoin@gmail.com']);
  assert.deepEqual(emailsIn('write to daretogoin@gmail.com — thanks'), ['daretogoin@gmail.com']);
  assert.deepEqual(emailsIn('a.b+c_d@sub.example.co.il, next'), ['a.b+c_d@sub.example.co.il']);
});

test('every email in every legal document (both languages) is a clean address that starts alphanumeric, and is daretogoin@gmail.com', () => {
  let found = 0;
  for (const lang of ['en', 'he'] as const) {
    for (const key of ['privacy', 'accessibility', 'terms'] as const) {
      const doc = getLegalDocument(lang, key);
      const texts = [doc.title, doc.intro, doc.draftNotice, ...doc.sections.flatMap((s) => [s.heading, ...s.body.split('\n\n')])];
      for (const text of texts) {
        for (const email of emailsIn(text)) {
          found += 1;
          assert.match(email, /^[A-Za-z0-9]/, `${lang}/${key}: ${email}`);
          assert.equal(email, 'daretogoin@gmail.com', `${lang}/${key}`);
        }
      }
    }
  }
  assert.ok(found >= 6, 'privacy, accessibility and terms each show the contact in both languages');
});

test('privacy policy (EN + HE) discloses the temporary ~2h retention of the analysis result, without implying permanence', () => {
  const en = JSON.stringify(getLegalDocument('en', 'privacy'));
  const he = JSON.stringify(getLegalDocument('he', 'privacy'));
  assert.match(en, /temporarily keep the generated analysis result for up to about 2 hours/);
  assert.match(en, /preventing a duplicate charge/);
  assert.match(en, /not kept as part of your archive unless you save the dream/);
  assert.match(he, /לשמור זמנית את תוצאת הניתוח שנוצרה, עד כשעתיים בערך/);
  assert.match(he, /מניעת חיוב כפול/);
  assert.match(he, /אינה נשמרת כחלק מהארכיון שלכם אלא אם שמרתם את החלום/);
});
