import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { en, he } from '../src/i18n/translations.ts';
import { getLegalDocument, type LegalKey } from '../src/legal/legalContent.ts';
import {
  BACKUP_DELETE_AFTER_HIDING_DAYS,
  BACKUP_HIDE_AFTER_DAYS,
  BACKUP_RETENTION_DAYS,
  BACKUP_RETENTION_VERIFIED,
  GOOGLE_FONTS_SELF_HOSTED,
  MIN_AGE,
  OPENAI_ABUSE_LOG_DAYS,
  REQUEST_ANSWER_DAYS,
  TRIAL_COOKIE_NAME,
} from '../src/legal/retention.ts';

/**
 * Launch preparation (October 2026): the Privacy Policy and the Terms may only say what the system really does. These tests pin the
 * statements that can be checked against the code, keep the Hebrew and English documents in step, and refuse a claim the system does not
 * keep (a backup period nobody verified, a "permanent" deletion that leaves copies, a fonts statement that contradicts the CSP).
 * The documents stay DRAFTS: nothing here removes or weakens the "not reviewed by a lawyer" notice.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const text = (lang: 'he' | 'en', key: LegalKey) => {
  const d = getLegalDocument(lang, key);
  return [d.title, d.intro, ...d.sections.flatMap((s) => [s.heading, s.body]), d.draftNotice].join('\n');
};

test('Hebrew and English documents have the same structure and the same hard facts', () => {
  for (const key of ['privacy', 'terms'] as const) {
    const a = getLegalDocument('en', key);
    const b = getLegalDocument('he', key);
    assert.equal(a.sections.length, b.sections.length, `${key}: same number of sections`);
    for (const [i, s] of a.sections.entries()) {
      const t = b.sections[i];
      // every digit sequence (ages, days, prices, the business number) appears in both versions of the section
      const nums = (x: string) => (x.match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/[.,]$/, '')).sort().join('|');
      assert.equal(nums(s.body), nums(t.body), `${key} / "${s.heading}": same numbers in both languages`);
    }
  }
  for (const lang of ['he', 'en'] as const) {
    const p = text(lang, 'privacy');
    for (const name of ['Supabase', 'Vercel', 'OpenAI', 'Backblaze', 'GitHub', 'Make', 'Grow', 'Morning', 'Google']) assert.ok(p.includes(name), `${lang}: the Privacy Policy names ${name}`);
    assert.ok(p.includes(TRIAL_COOKIE_NAME), `${lang}: the free-dream cookie is disclosed`);
    assert.ok(p.includes('store=false'), `${lang}: the OpenAI setting is stated`);
    assert.ok(p.includes(String(MIN_AGE)) && text(lang, 'terms').includes(String(MIN_AGE)), `${lang}: the minimum age is in both documents`);
    assert.ok(p.includes(String(OPENAI_ABUSE_LOG_DAYS)), `${lang}: the OpenAI request-record period is stated`);
    assert.ok(p.includes(String(REQUEST_ANSWER_DAYS)), `${lang}: the answer time for privacy requests is stated`);
  }
});

test('the backup period is stated only after someone verified it in Backblaze B2', () => {
  for (const lang of ['he', 'en'] as const) {
    const p = text(lang, 'privacy');
    const mentions = new RegExp(`\\b${BACKUP_RETENTION_DAYS}\\b`).test(p);
    if (BACKUP_RETENTION_VERIFIED) assert.ok(mentions, `${lang}: verified, so the ${BACKUP_RETENTION_DAYS}-day period must be stated`);
    else assert.ok(!mentions, `${lang}: NOT verified, so no backup period in days may be promised`);
    assert.match(p, lang === 'en' ? /Backups:/ : /גיבויים:/, `${lang}: backups are disclosed either way`);
  }
});

test('while the backup deletion is unverified, no text anywhere says that backups expire or are deleted', () => {
  if (BACKUP_RETENTION_VERIFIED) return;
  const ui = read('src/i18n/translations.ts') + read('src/faq/faqContent.ts');
  for (const key of ['privacy', 'terms'] as const) {
    assert.ok(!/backup[^.;]*\b(expir|are then deleted|deleted automatically)/i.test(text('en', key).replace(/Backups: [^\n]*We are setting an automatic deletion period[^\n]*/, '')), `en/${key}`);
    assert.ok(!/גיבוי[^.;]*פוקע/.test(text('he', key)), `he/${key}`);
  }
  assert.ok(!/backup[^.']*expir/i.test(ui), 'the app and FAQ texts');
  assert.ok(!/גיבוי[^.']*פוקע/.test(ui), 'the app and FAQ texts (he)');
});

test('no document calls a deletion permanent or final while copies remain, in the documents or in the app', () => {
  for (const key of ['privacy', 'terms'] as const) {
    assert.ok(!/permanently (delete|remove)|deleted permanently|permanent deletion/i.test(text('en', key)), `en/${key}`);
    assert.ok(!/לצמיתות/.test(text('he', key)), `he/${key}`);
  }
  const ui = read('src/i18n/translations.ts');
  let seen = 0;
  for (const m of ui.matchAll(/(settingsDeleteBody|deleteAccountTitle|deleteAccountBody|deleteAccountConfirm):\s*\n?\s*'((?:[^'\\]|\\.)*)'/g)) {
    seen += 1;
    assert.ok(!/permanent|לצמיתות/i.test(m[2]), `${m[1]}: no "permanent" claim in the app`);
  }
  assert.equal(seen, 8, 'four delete-account texts in each language');
  assert.match(text('en', 'privacy'), /We do not describe a deletion as final for copies that still exist/);
});

test('deleting one dream also deletes the pattern reflections drawn from it: the migration, the rollback and the wording agree', () => {
  const m = read('supabase/migrations/20261018_pattern_reflections_follow_dream_deletion.sql');
  assert.match(m, /after delete on public\.dreams/);
  assert.match(m, /old\.id::text = any \(dream_ids\)/);
  assert.match(m, /owner_id = old\.owner_id/, 'only the same account is touched');
  assert.match(read('supabase/rollbacks/20261018_pattern_reflections_follow_dream_deletion_rollback.sql'), /drop trigger if exists dreams_delete_pattern_reflections/);
  assert.match(text('en', 'privacy'), /removes the saved dream, its image and the pattern reflections drawn from it/);
  assert.match(text('en', 'privacy'), /Reflections drawn only from other dreams are not affected/);
  assert.match(text('he', 'privacy'), /את הרהורי הדפוסים שנוצרו ממנו/);
  assert.match(text('he', 'privacy'), /הרהורים שנוצרו רק מחלומות אחרים אינם מושפעים/);
  // the account deletion function still removes everything that is left
  assert.match(read('supabase/migrations/20260924_account_deletion.sql'), /delete from public\.pattern_reflections where owner_id = p_user/);
});

test('the backup period quoted is the real worst case of the two B2 lifecycle rules (daily processing included)', () => {
  assert.equal(BACKUP_HIDE_AFTER_DAYS, 34);
  assert.equal(BACKUP_DELETE_AFTER_HIDING_DAYS, 1);
  assert.equal(BACKUP_RETENTION_DAYS, BACKUP_HIDE_AFTER_DAYS + BACKUP_DELETE_AFTER_HIDING_DAYS + 2);
  assert.ok(BACKUP_RETENTION_DAYS >= 35, 'never print fewer days than the rules can take');
});

test('fonts are self-hosted: every file exists, nothing loads from Google, and the CSP no longer allows it', () => {
  const css = read('public/fonts/fonts.css');
  const files = [...css.matchAll(/url\(\/fonts\/([a-z-]+\.woff2)\)/g)].map((m) => m[1]);
  assert.equal(files.length, 7);
  for (const f of files) {
    const buf = readFileSync(new URL(`../public/fonts/${f}`, import.meta.url));
    assert.equal(buf.subarray(0, 4).toString('latin1'), 'wOF2', `${f} is a real woff2 file`);
    assert.ok(buf.length > 5000, `${f} is not empty`);
  }
  assert.match(css, /font-family: 'Heebo'[\s\S]*?font-weight: 300 700/);
  assert.match(css, /font-family: 'Fraunces'[\s\S]*?font-weight: 400/);
  for (const page of ['index.html', 'public/faq/index.html', 'public/en/faq/index.html', 'src/faq/renderFaqPage.ts']) {
    const src = read(page);
    assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(src), `${page}: no Google Fonts`);
    assert.match(src, /\/fonts\/fonts\.css/, `${page}: loads the local font sheet`);
  }
  assert.ok(GOOGLE_FONTS_SELF_HOSTED);
});

test('every OpenAI Responses call asks not to store the response, and nothing asks to store it', () => {
  const dir = new URL('../server/routes/', import.meta.url);
  let calls = 0;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/responses\.create\(\{([\s\S]*?)\n\s*\}\);/g)) {
      calls += 1;
      assert.match(m[1], /\bstore: false,/, `${f}: responses.create must carry store: false`);
    }
    assert.ok(!/store: true/.test(src), `${f}: never store: true`);
  }
  assert.equal(calls, 6, 'the six Responses API calls (analysis, element labels, dream questions, reflection, translation, pattern reflection)');
});

test('retention facts quoted in the documents are the real ones', () => {
  const cookie = read('server/trialIdentity.ts');
  assert.match(cookie, /TRIAL_COOKIE_NAME = 'dare_trial'/);
  assert.match(cookie, /COOKIE_MAX_AGE_SECONDS = 365 \* 24 \* 60 \* 60/);
  assert.match(cookie, /'HttpOnly'/);
  assert.match(text('en', 'privacy'), /lasts up to one year/);
  const purge = read('supabase/migrations/20261005_purge_expired_analysis_results.sql');
  assert.match(purge, /'\*\/10 \* \* \* \*'/);
  assert.match(purge, /purge_expired_analysis_results\(2\)/);
  assert.match(text('en', 'privacy'), /a database job runs every 10 minutes/);
  // the Storage is purged by folder on account deletion, and the Auth user is deleted last
  assert.match(read('server/accountDeletion.ts'), /deleteAuthUser: LAST|4\. deleteAuthUser/);
});

test('the fonts statement agrees with the Content-Security-Policy', () => {
  const csp = (JSON.parse(read('vercel.json')).headers[0].headers as { key: string; value: string }[]).find((h) => h.key === 'Content-Security-Policy')!.value;
  const allowsGoogleFonts = /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(csp);
  assert.equal(GOOGLE_FONTS_SELF_HOSTED, !allowsGoogleFonts, 'GOOGLE_FONTS_SELF_HOSTED must be true exactly when the CSP no longer allows Google Fonts');
  for (const lang of ['he', 'en'] as const) assert.equal(/Google Fonts/.test(text(lang, 'privacy')), !GOOGLE_FONTS_SELF_HOSTED, `${lang}: Google Fonts disclosure present exactly while fonts are loaded from Google`);
});

test('Terms: personal reflection and entertainment, not a therapeutic service; liability limited without taking away statutory rights; user content rights; distress line', () => {
  const e = text('en', 'terms');
  const h = text('he', 'terms');
  assert.match(e, /personal reflection and entertainment only/);
  assert.match(e, /not a medical, psychological, psychiatric, counselling or therapeutic service/);
  assert.ok(!/wellness/i.test(e), 'the word "wellness" suggests a therapeutic service');
  assert.match(h, /להתבוננות אישית ולבידור בלבד/);
  assert.ok(!/רווחה אישית/.test(h));
  assert.match(e, /as is/);
  assert.match(e, /Nothing in these terms excludes or limits liability that cannot be excluded or limited by law/);
  assert.match(e, /including your rights as a consumer/);
  assert.match(h, /אין בתנאים אלו כדי להוציא או להגביל אחריות שאי אפשר להוציא או להגביל לפי דין/);
  assert.match(e, /Your dream text, corrections and associations remain yours/);
  assert.match(h, /טקסט החלומות, התיקונים והאסוציאציות שלכם נשארים שלכם/);
  assert.match(e, /ERAN/);
  assert.match(h, /ער"ן/);
  // purchases and cancellations are unchanged and still point at the law
  assert.match(e, /3 dreams for ₪59, 10 dreams for ₪149, 25 dreams for ₪279/);
  assert.match(e, /Nothing here limits your rights as a consumer/);
});

test('Privacy: sensitive information, transfers abroad, providers, rights and what remains after deletion are all stated', () => {
  const e = text('en', 'privacy');
  const h = text('he', 'privacy');
  assert.match(e, /Dreams can reveal sensitive information/);
  assert.match(h, /חלומות עשויים לחשוף מידע רגיש/);
  assert.match(e, /processed outside Israel, including in the United States/);
  assert.match(h, /מועבר ומעובד מחוץ לישראל, כולל בארצות הברית/);
  assert.match(e, /Frankfurt, Germany/);
  assert.match(e, /Washington, D\.C\. area/);
  assert.match(e, /We do not use your dream content to train any model/);
  assert.match(e, /not used to train its models by default/);
  assert.match(e, /Order and payment records/);
  assert.match(e, /whatever our providers keep under their own policies/);
  assert.match(h, /מה שהספקים שלנו שומרים לפי המדיניות שלהם/);
  assert.match(e, /Privacy Protection Authority/);
});

test('sign-up: age confirmation (18+) and a Terms / Privacy notice, in both languages, without touching how accounts are created', () => {
  const src = read('src/archive/DreamAuth.tsx');
  assert.match(src, /id="auth-age-confirm"/);
  assert.match(src, /auth\.errorAgeRequired/);
  assert.equal((src.match(/ageConfirmed\)/g) ?? []).length >= 2, true, 'both the form and the Google button check the confirmation on sign-up');
  assert.match(src, /PrivacyPolicyDialog/);
  assert.match(src, /renderLegalNotice/);
  // the same calls as before: nothing about the account mechanism changed
  assert.match(src, /signUpWithPassword\(trimmedEmail, password, name, startDream \? WRITE_VIEW_VALUE : undefined\)/);
  assert.match(src, /signInWithPassword\(trimmedEmail, password\)/);
  for (const [lang, t] of [['en', en], ['he', he]] as const) {
    const a = t.auth as unknown as Record<string, string>;
    for (const k of ['ageConfirm', 'errorAgeRequired', 'legalNoticeSignup', 'legalNoticeSignin', 'legalTermsLink', 'legalPrivacyLink', 'legalClose']) assert.ok(a[k] && a[k].length > 3, `${lang}: auth.${k}`);
    assert.ok(a.legalNoticeSignup.includes('{terms}') && a.legalNoticeSignup.includes('{privacy}'), `${lang}: signup notice has both links`);
    assert.ok(a.legalNoticeSignin.includes('{terms}') && a.legalNoticeSignin.includes('{privacy}'), `${lang}: sign-in notice has both links`);
    assert.ok(a.ageConfirm.includes(String(MIN_AGE)), `${lang}: the declaration states the age`);
    assert.ok(a.legalNoticeSignup.toLowerCase().includes(lang === 'en' ? 'outside israel' : 'מחוץ לישראל'), `${lang}: the notice mentions processing outside Israel`);
  }
});
