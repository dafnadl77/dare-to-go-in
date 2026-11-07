import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DREAM_CHECK_LIMIT_MS, HOW_IT_WORKS_SEEN_METADATA_KEY, howItWorksSeen, rememberHowItWorksSeen, typingStepFor } from '../src/hero/howItWorksOnce.ts';
import { CIRCLE_GAP_PX, HOW_CONTROL_GAP_PX, typeLinkLift } from '../src/hero/typeLinkClearance.ts';

/**
 * "How it works" opens by itself once, on the first choice to write, and the typing button never touches its control (2026-11-07).
 * Real clicks, windows, phones and landscape were run on the real page; these pin the rules.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('only a confirmed empty account gets the explanation', () => {
  assert.equal(typingStepFor(false, 'none'), 'explain');
  assert.equal(typingStepFor(false, 'some'), 'write-and-mark', 'an existing dreamer goes straight to writing and is marked');
  assert.equal(typingStepFor(false, 'pending'), 'write', 'not known yet: writing, never a wrong explanation');
  assert.equal(typingStepFor(false, 'unknown'), 'write', 'the read failed: writing is not blocked');
  assert.equal(typingStepFor(false, 'seen'), 'write', 'marked on another device: the session here was older');
  assert.equal(typingStepFor(false, 'none', true), 'write-and-mark', 'she read it as a guest: not again, and the account learns it');
  for (const dreams of ['none', 'some', 'pending', 'unknown'] as const) assert.equal(typingStepFor(true, dreams), 'write', 'a marked account always writes directly');
});

test('the mark lives on the account, and a failed save still holds for this page', () => {
  const user = (meta: Record<string, unknown>, id = 'a') => ({ id, user_metadata: meta });
  assert.equal(howItWorksSeen(null), false);
  assert.equal(howItWorksSeen(user({})), false);
  assert.equal(howItWorksSeen(user({ [HOW_IT_WORKS_SEEN_METADATA_KEY]: '2026-11-07T10:00:00Z' })), true);
  rememberHowItWorksSeen('b');
  assert.equal(howItWorksSeen(user({}, 'b')), true, 'seen on this page, whatever the save did');
  assert.equal(howItWorksSeen(user({}, 'c')), false, 'another account on the same device is not affected');
});

test('the mark is saved through the account metadata: no table, no migration', () => {
  const auth = read('src/auth/AuthContext.tsx');
  assert.match(auth, /async markHowItWorksSeen\(\) \{\s*const \{ error \} = await supabase\.auth\.updateUser\(\{ data: \{ \[HOW_IT_WORKS_SEEN_METADATA_KEY\]:/);
  const storage = read('src/hero/dreamRemoteStorage.ts');
  assert.match(storage, /export async function accountHowItWorksState[\s\S]*?supabase\.auth\.getUser\(\)[\s\S]*?\.select\('id'\)\.eq\('owner_id', ownerId\)\.limit\(1\)/, 'the mark as the account holds it now, one id, no dream content');
});

test('saving the mark never stops writing, and the choice to write goes through one door', () => {
  const hero = read('src/hero/HeroDream.tsx');
  const chosen = /const handleTypingChosen = \(\) => \{([\s\S]*?)\n  \};/.exec(hero);
  assert.ok(chosen);
  assert.match(hero, /const markHowSeen = \(userId: string\) => \{\s*rememberHowItWorksSeen\(userId\);\s*void markHowItWorksSeen\(\)\.catch\(\(\) => undefined\);/, 'not awaited: a failure blocks nothing');
  assert.match(chosen[1], /markHowSeen\(user\.id\);\s*forgetGuestSawHowItWorks\(\);/);
  assert.match(chosen[1], /setCentralMode\('typing'\);/);
  assert.match(hero, /if \(writeAfterHowRef\.current\) \{\s*writeAfterHowRef\.current = false;\s*setCentralMode\('typing'\);\s*return;/, 'closing goes on to writing');
  assert.match(hero, /<HowItWorksTeaser onOpen=\{handleHowOpened\} \/>/);
  const byHand = /const handleHowOpened = \(\) => \{([\s\S]*?)\n  \};/.exec(hero);
  assert.ok(byHand);
  assert.match(byHand[1], /setHowOpen\(true\);\s*if \(!user\) rememberGuestSawHowItWorks\(\);\s*else if \(!howSeen\) markHowSeen\(user\.id\);/, 'read by hand is read');
  assert.doesNotMatch(byHand[1], /writeAfterHowRef/, 'closing it by hand returns to the opening, with nothing after it');
  assert.ok(DREAM_CHECK_LIMIT_MS <= 2000, 'the arrival after sign-in is never held back for long');
  assert.match(hero, /openWriting=\{openWriting && \(howSeen \|\| accountDreams !== 'pending'\)\}/);
  const hold = read('src/hero/HoldToRemember.tsx');
  assert.equal(hold.match(/if \(onTypingChosen\) onTypingChosen\(\);/g)?.length, 2, 'the button and the arrival after sign-in');
  assert.match(hold, /if \(onStartAttempt && !onStartAttempt\(\)\) return;\s*if \(onTypingChosen\) onTypingChosen\(\);/, 'a guest still goes to sign-up first');
});

test('the typing button moves only by what is missing', () => {
  const base = { linkTop: 600, linkBottom: 640, circleBottom: 560 };
  assert.equal(typeLinkLift({ ...base, howTop: 700 }), 0, 'room to spare: the approved opening is untouched');
  assert.equal(typeLinkLift({ ...base, howTop: 640 + HOW_CONTROL_GAP_PX }), 0, 'exactly enough');
  assert.equal(typeLinkLift({ ...base, howTop: 636 }), 4 + HOW_CONTROL_GAP_PX, 'overlapping by 4px');
  assert.equal(typeLinkLift({ ...base, howTop: null }), 0, 'the control is under the header on this phone');
  assert.equal(typeLinkLift({ ...base, howTop: 560 }), 600 - 560 - CIRCLE_GAP_PX, 'it never reaches the circle');
  assert.equal(typeLinkLift({ linkTop: 562, linkBottom: 602, circleBottom: 560, howTop: 590 }), 0, 'no room at all: it stays');
});

test('the lift is zero by default and touches nothing but the button', () => {
  assert.match(read('src/hero/HoldToRemember.css'), /\.htr-type-link \{\s*position: relative;[\s\S]*?top: calc\(-1 \* var\(--hiw-type-lift, 0px\)\);/);
  const source = read('src/hero/typeLinkClearance.ts');
  assert.equal(source.match(/setProperty\(/g)?.length, 2, 'two values are ever set: the button lift, and the short phone drop of "How it works"');
  assert.doesNotMatch(read('src/hero/HowItWorks.css'), /hiw-type-lift/, 'the control and the section are unchanged');
});
