import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DISPLAY_NAME_METADATA_KEY, fullNameOfUser, firstNameOfUser, normalizeDisplayName } from '../src/auth/displayName.ts';
import { en, he } from '../src/i18n/translations.ts';

/**
 * The email sign-up form asks for a name (required) and stores it on the new user's metadata under the SAME `displayName`
 * key that Settings edits and that the greeting / Settings row read. Sign-in, Google and existing users are untouched.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const auth = read('src/auth/AuthContext.tsx');
const form = read('src/archive/DreamAuth.tsx');

test('sign-up stores the validated name under the same metadata key the app already reads', () => {
  const signUp = auth.slice(auth.indexOf('async signUpWithPassword'), auth.indexOf('async signInWithGoogle'));
  assert.match(signUp, /normalizeDisplayName\(name\)/);
  assert.match(signUp, /if \(cleanName === null\) return \{ ok: false/);
  // refused BEFORE any Supabase call
  assert.ok(signUp.indexOf('cleanName === null') < signUp.indexOf('supabase.auth.signUp'));
  assert.match(signUp, /data: \{ \[DISPLAY_NAME_METADATA_KEY\]: cleanName \}/);
  assert.equal(DISPLAY_NAME_METADATA_KEY, 'displayName');
  // the Settings editor writes the very same key
  const edit = auth.slice(auth.indexOf('async updateDisplayName'), auth.indexOf('async signOut'));
  assert.match(edit, /\[DISPLAY_NAME_METADATA_KEY\]: clean/);
});

test('the existing sign-in, Google, reset and recovery calls are unchanged', () => {
  assert.match(auth, /signInWithPassword\(\{ email, password \}\)/);
  assert.match(auth, /options: \{ redirectTo: postAuthRedirectUrl\(\), queryParams: \{ prompt: 'select_account' \} \}/);
  assert.match(auth, /signInWithPassword: \(email: string, password: string\) => Promise<AuthActionResult>;/);
  const google = auth.slice(auth.indexOf('async signInWithGoogle'), auth.indexOf('async resetPasswordForEmail'));
  assert.ok(!/displayName|DISPLAY_NAME/.test(google));
  const signIn = auth.slice(auth.indexOf('async signInWithPassword'), auth.indexOf('async signUpWithPassword'));
  assert.ok(!/displayName|DISPLAY_NAME/.test(signIn));
});

test('the form: a name field only in sign-up mode, validated with the same rule as the Settings editor, before the email', () => {
  assert.match(form, /\{isSignUp && \(\s*<label className="auth-field">\s*<input[\s\S]*?autoComplete="name"[\s\S]*?maxLength=\{MAX_DISPLAY_NAME_LENGTH\}/);
  const submit = form.slice(form.indexOf('const handleSubmit'), form.indexOf('const handleGoogleClick'));
  assert.ok(submit.indexOf("t('auth.errorNameRequired')") < submit.indexOf('looksLikeEmail(trimmedEmail)'));
  assert.match(submit, /if \(isSignUp\) \{\s*if \(name\.trim\(\) === ''\)/);
  assert.match(submit, /normalizeDisplayName\(name\) === null[\s\S]*?t\('auth\.errorInvalidName'\)/);
  assert.match(submit, /await signUpWithPassword\(trimmedEmail, password, name\)/);
  // sign-in keeps its two-argument call
  assert.match(submit, /await signInWithPassword\(trimmedEmail, password\)/);
});

test('the field, its placeholder and both error messages exist in Hebrew and English', () => {
  for (const dict of [en, he]) {
    for (const key of ['namePlaceholder', 'errorNameRequired', 'errorInvalidName'] as const) {
      assert.equal(typeof dict.auth[key], 'string');
      assert.ok(dict.auth[key].trim().length > 0 && !/undefined|null/.test(dict.auth[key]), key);
    }
  }
  assert.equal(he.auth.namePlaceholder, 'שם');
  assert.equal(en.auth.namePlaceholder, 'Name');
  assert.notEqual(he.auth.errorNameRequired, en.auth.errorNameRequired);
});

test('validation: empty, whitespace, email-like, too long and symbol-only names are refused; real names pass', () => {
  for (const bad of ['', '   ', 'me@example.com', 'x'.repeat(61), '123', '---', 'bad\u0000name']) assert.equal(normalizeDisplayName(bad), null, JSON.stringify(bad));
  assert.equal(normalizeDisplayName('  דנה   כהן  '), 'דנה כהן');
  assert.equal(normalizeDisplayName('Mary-Jane O\'Neil'), "Mary-Jane O'Neil");
});

test('after sign-up the stored name drives both places: greeting = first name, Settings = full name', () => {
  // exactly what the sign-up writes (user_metadata.displayName = the normalized name)
  const signedUp = { user_metadata: { displayName: normalizeDisplayName('  דנה   כהן ')!, email: 'someone@example.com' } as never };
  assert.equal(firstNameOfUser(signedUp), 'דנה');
  assert.equal(fullNameOfUser(signedUp), 'דנה כהן');
  assert.equal(he.archive.greeting.replace('{name}', firstNameOfUser(signedUp)!), 'שלום דנה');
  const single = { user_metadata: { displayName: 'Noa' } as never };
  assert.equal(firstNameOfUser(single), 'Noa');
  assert.equal(fullNameOfUser(single), 'Noa');
});

test('Google users still get their name from Google metadata; existing users without a name stay without one', () => {
  assert.equal(fullNameOfUser({ user_metadata: { full_name: 'Google Person', name: 'Google Person' } as never }), 'Google Person');
  assert.equal(fullNameOfUser({ user_metadata: { email: 'old.user@example.com' } as never }), null);
});

test('payment, credits and package code are untouched by this change', () => {
  for (const file of ['src/auth/AuthContext.tsx', 'src/archive/DreamAuth.tsx']) {
    assert.ok(!/payment|grow|make\.com|purchase|credit/i.test(read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), file);
  }
});
