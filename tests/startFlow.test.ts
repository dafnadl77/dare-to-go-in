import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeShift, isCrowded, CROWDED_GAP_PX } from '../src/hero/useTypingPanelFit.ts';
import { readVisibleArea, KEYBOARD_MIN_INSET_PX } from '../src/hero/useKeyboardViewport.ts';
import { en, he } from '../src/i18n/translations.ts';

/**
 * The new first-dream route (sign up / sign in BEFORE the first dream, then straight back to the writing screen) and the repaired
 * writing screen (text, box, buttons and messages never overlap: long text, short screens, an open keyboard).
 * The browser checks (heights, keyboard, both languages) were run in the real page; these pin the rules.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// ------------------------------------------------------------------ 1. the gate
test('pressing START while signed out opens sign-up (never the recorder or the writing box); signed in goes straight through; while the session is read nothing starts', () => {
  const hero = code('src/hero/HeroDream.tsx');
  assert.match(hero, /const handleStartAttempt = \(\): boolean => \{\s*if \(authLoading\) return false;\s*if \(user\) return true;\s*onStartRequiresSignIn\(\);\s*return false;\s*\};/);
  const hold = code('src/hero/HoldToRemember.tsx');
  // the circle: after the "no microphone" check, before anything records or asks for the microphone
  const begin = hold.slice(hold.indexOf('const beginHold = useCallback'), hold.indexOf('recorder.primeAudio()'));
  assert.ok(begin.indexOf('if (noMicrophone) return;') < begin.indexOf('onStartAttempt && !onStartAttempt()'), 'gate after the mic check');
  assert.ok(begin.includes('if (onStartAttempt && !onStartAttempt()) return;'));
  // "write your dream" / "I'd rather type"
  assert.match(hold, /onClick=\{\(\) => \{\s*if \(onStartAttempt && !onStartAttempt\(\)\) return;\s*setCentralMode\('typing'\);\s*\}\}/);
  // sending words typed while signed out (a kept draft): kept, not sent
  assert.match(hold, /if \(dreamHasText && onStartAttempt && !onStartAttempt\(\)\) \{\s*saveDreamDraft\(entry\);\s*return;\s*\}/);
});

test('safety net: words are never analyzed for a visitor who is not signed in; they are kept for the return', () => {
  const hero = code('src/hero/HeroDream.tsx');
  assert.match(hero, /const runAnalysis = \(input: DreamInput, safetyAck\?: 'dream' \| 'not-immediate'\) => \{\s*if \(!user && !authLoading\) \{\s*saveDreamDraft\(dreamInputSourceText\(input\)\);\s*onStartRequiresSignIn\(\);\s*return;\s*\}/);
});

test('App: the gate opens SIGN-UP with the start intent; after sign-in the dreamer goes to the writing screen, not the archive; leaving the screen drops the intent', () => {
  const app = code('src/App.tsx');
  assert.match(app, /const handleStartRequiresSignIn = \(\) => \{\s*setAuthMode\('signup'\);[\s\S]*?setView\('auth'\);\s*setStartDreamIntent\(true\);\s*\};/);
  assert.match(app, /if \(startDreamIntent\) \{[\s\S]*?setOpenWriting\(true\);\s*setView\('dream'\);[\s\S]*?return;\s*\}\s*setView\(returnToPricingAfterAuth \? 'pricing' : 'archive'\);/);
  assert.match(app, /startDream=\{startDreamIntent\}/);
  assert.match(app, /if \(next !== 'auth'\) \{\s*setStartDreamIntent\(false\);/);
  assert.match(app, /onStartRequiresSignIn=\{handleStartRequiresSignIn\}/);
  assert.match(app, /openWriting=\{openWriting && !!user\}/);
});

// ------------------------------------------------------------------ 2. /?view=write (e-mail confirmation and Google)
test('/?view=write: the e-mail confirmation link and the Google return carry it; the app opens the writing screen ONLY for a confirmed session', () => {
  const auth = code('src/auth/AuthContext.tsx');
  assert.match(auth, /export const WRITE_VIEW_VALUE = 'write';/);
  assert.match(auth, /function postAuthRedirectUrl\(afterAuth\?: AfterAuthView\): string \{\s*return `\$\{window\.location\.origin\}\/\?\$\{POST_AUTH_REDIRECT_PARAM\}=\$\{afterAuth \?\? POST_AUTH_REDIRECT_VALUE\}`;\s*\}/);
  assert.match(auth, /emailRedirectTo: postAuthRedirectUrl\(afterAuth\)/);
  assert.match(auth, /redirectTo: postAuthRedirectUrl\(afterAuth\)/);
  // without the start intent nothing changes: the archive stays the default landing
  assert.match(auth, /export const POST_AUTH_REDIRECT_VALUE = 'archive';/);
  const form = code('src/archive/DreamAuth.tsx');
  assert.match(form, /signUpWithPassword\(trimmedEmail, password, name, startDream \? WRITE_VIEW_VALUE : undefined\)/);
  assert.match(form, /signInWithGoogle\(startDream \? WRITE_VIEW_VALUE : undefined\)/);

  const app = code('src/App.tsx');
  assert.match(app, /if \(value === WRITE_VIEW_VALUE\) return 'dream';/);
  assert.match(app, /const writeArrivalRef = useRef\(openWriting\);/);
  // a signed-out arrival at the address is judged only after the session check, and only for an arrival from the ADDRESS
  assert.match(app, /view !== 'dream' \|\| \(writeArrivalRef\.current && !loading && !user\)/);
  // the request is spent once, and the address stops saying /?view=write
  assert.match(app, /const handleWritingOpened = \(\) => \{\s*writeArrivalRef\.current = false;\s*setOpenWriting\(false\);\s*writeViewToUrl\('dream'\);/);
  // the writing screen opens from the HOME state only (never interrupts a recording or a dream under way)
  const hold = code('src/hero/HoldToRemember.tsx');
  assert.match(hold, /if \(!openWriting \|\| !revealed \|\| centralMode !== 'hold'\) return;\s*setCentralMode\('typing'\);\s*onWritingOpened\?\.\(\);/);
});

test('the e-mail screen uses the neutral wording that does not reveal whether an address is registered', () => {
  assert.equal(he.auth.signupCheckEmailBody, 'אם הכתובת יכולה לקבל הודעת אימות, יישלח אליה קישור להמשך.');
  assert.equal(en.auth.signupCheckEmailBody, 'If this address can receive a verification message, a link to continue will be sent to it.');
  // the same screen as before: the ways forward (sign in, forgot password, different e-mail) are untouched
  const form = read('src/archive/DreamAuth.tsx');
  assert.match(form, /t\('auth\.signupCheckEmailSignIn'\)/);
  assert.match(form, /t\('auth\.signupCheckEmailForgot'\)/);
  assert.match(form, /t\('auth\.signupCheckEmailDifferent'\)/);
});

test('the sign-up screen says why it opened (start a dream), in both languages', () => {
  assert.equal(he.auth.startDreamTagline, 'צרו חשבון כדי לספר את החלום הראשון שלכם — הוא במתנה.');
  assert.match(en.auth.startDreamTagline, /first dream/);
  assert.equal(he.auth.startDreamSigninTagline, 'התחברו כדי לספר את החלום שלכם.');
  const form = read('src/archive/DreamAuth.tsx');
  // the earlier notices (free dream used, session ended) keep priority over it
  assert.match(form, /freeDreamNotice \? t\('auth\.freeDreamUsedNotice'\) : sessionExpiredNotice \? t\('auth\.sessionExpiredNotice'\) : startDream \? t\('auth\.startDreamTagline'\)/);
});

// ------------------------------------------------------------------ 3. one free dream, nothing else touched
test('this route changes nothing about the free dream, credits, payments, Owner or the guest machinery on the server', () => {
  for (const file of ['server/freeDream.ts', 'server/dreamAttempts.ts', 'server/trialAllowance.ts', 'server/callerIdentity.ts', 'server/routes/credits.ts', 'server/routes/claimTrial.ts', 'server/payments/paymentComplete.ts', 'server/payments/checkoutStart.ts']) {
    assert.ok(!/WRITE_VIEW_VALUE|view=write|startDream|onStartAttempt/.test(read(file)), file);
  }
  // (the guest machinery itself is intact: new guest identities were closed in the NEXT step, behind an explicit lever, see guestClosure.test.ts)
  assert.match(read('server/routes/trialSession.ts'), /const minted = await mintTrialIdentity\(deps\.identity\);/);
  // the entry gate still sends only a definite zero balance to Packages (an account with its free credit has a balance of 1)
  assert.match(code('src/App.tsx'), /fetchCreditBalance\(\)\.then\(\(balance\) => \{\s*if \(cancelled \|\| balance !== 0\) return;/);
});

// ------------------------------------------------------------------ 4. the writing screen
test('computeShift: nudges a panel back inside the usable band, never when it already fits, and never pushes a too-tall one off the top', () => {
  const band = { top: 100, bottom: 700 };
  assert.equal(computeShift({ top: 200, bottom: 500 }, band), 0, 'fits: untouched');
  assert.equal(computeShift({ top: 300, bottom: 803 }, band), -103, 'runs past the bottom: moved up');
  assert.equal(computeShift({ top: 60, bottom: 400 }, band), 40, 'rides under the menu: moved down');
  assert.equal(computeShift({ top: 150, bottom: 800 }, band), 100 - 150, 'taller than the room: its top is aligned (it scrolls inside)');
});

test('isCrowded: the decorative title steps aside only while the panel would actually touch it', () => {
  assert.equal(isCrowded(300, 210), false);
  assert.equal(isCrowded(210 + CROWDED_GAP_PX - 1, 210), true);
  assert.equal(isCrowded(150, 210), true);
  assert.equal(isCrowded(150, null), false, 'no title on screen: nothing to avoid');
});

test('readVisibleArea: an open keyboard is recognised from the visible area, a zoomed page or a moving toolbar is not', () => {
  assert.deepEqual(readVisibleArea(812, { height: 476, offsetTop: 0, scale: 1 }), { keyboardOpen: true, height: 476, top: 0 });
  assert.deepEqual(readVisibleArea(812, { height: 476, offsetTop: 120.4, scale: 1 }), { keyboardOpen: true, height: 476, top: 120 });
  assert.equal(readVisibleArea(812, { height: 812 - (KEYBOARD_MIN_INSET_PX - 1), offsetTop: 0, scale: 1 }).keyboardOpen, false, 'a toolbar');
  assert.equal(readVisibleArea(812, { height: 400, offsetTop: 0, scale: 2 }).keyboardOpen, false, 'pinch-zoomed');
  assert.deepEqual(readVisibleArea(812, null), { keyboardOpen: false, height: 812, top: 0 });
});

test('the writing panel: height-capped to the measured room, scrolls inside itself, follows the keyboard, box grows then scrolls, buttons wrap and never collide', () => {
  const css = read('src/hero/HoldToRemember.css');
  const panel = css.slice(css.indexOf('.central-typing {\n  width: min(90vw, 520px);'), css.indexOf('.central-recording.is-active'));
  assert.match(panel, /max-height: var\(--htr-room, calc\(100dvh - var\(--gh-h, 4\.25rem\) - 1\.5rem\)\);/);
  assert.match(panel, /transform: translate\(-50%, calc\(-50% \+ var\(--htr-shift, 0px\)\)\);/);
  assert.match(panel, /overflow-y: auto;/);
  assert.match(panel, /overscroll-behavior: contain;/);
  assert.match(panel, /\.central-typing\.is-kb \{\s*position: fixed;\s*top: calc\(var\(--htr-vv-top, 0px\) \+ var\(--htr-vv-h, 100dvh\) \/ 2\);/);
  // the box: more room, grows with the dream (script) up to a cap, then scrolls inside itself
  assert.match(css, /\.central-typing-textarea \{[\s\S]*?min-height: 7em;[\s\S]*?max-height: min\(42dvh, 22rem\);[\s\S]*?overflow-y: auto;/);
  const hold = code('src/hero/HoldToRemember.tsx');
  assert.match(hold, /box\.style\.height = 'auto';\s*box\.style\.height = `\$\{box\.scrollHeight\}px`;/);
  // the buttons: wrap, comfortable touch size
  assert.match(css, /\.central-typing-actions \{\s*display: flex;\s*flex-wrap: wrap;/);
  assert.match(css, /\.central-typing-actions \.central-back,\s*\.central-typing-actions \.central-done \{\s*min-height: 2\.75rem;/);
  // the system messages sit INSIDE the panel, after the buttons (so they scroll with it and can never fall off the screen)
  assert.ok(hold.indexOf('className="central-typing-actions"') < hold.indexOf('className="central-mic-notice"'));
  assert.ok(!/\.central-mic-notice \{[^}]*position: absolute/.test(css));
});

test('the decorative title and prompt fade (visibility, so nothing shifts) only while the panel is crowding them', () => {
  const css = read('src/hero/HeroDream.css');
  assert.match(css, /\.hero-ui-stack:has\(\.hold-to-remember\.is-crowded\) \.memory-title,\s*\.hero-ui-stack:has\(\.hold-to-remember\.is-crowded\) \.dream-prompt \{[\s\S]*?opacity: 0 !important;[\s\S]*?visibility: hidden !important;/);
  const hold = code('src/hero/HoldToRemember.tsx');
  assert.match(hold, /useKeyboardViewport\(centralMode === 'typing', typingPanelRef\);/);
  assert.match(hold, /useTypingPanelFit\(centralMode === 'typing', typingPanelRef, \[entry, doneBlocked, micUnavailable, transcriptionErrorMessage, canRetryTranscription\]\);/);
});

test('the look, background and animations are untouched: only the writing panel and the title fade rule were added', () => {
  const css = read('src/hero/HoldToRemember.css');
  // the existing panel transition, blur and the buttons' own styling are still there
  assert.match(css, /transition:\s*opacity 0\.8s var\(--ease-memory\),\s*filter 0\.8s var\(--ease-memory\);/);
  assert.match(css, /\.central-back \{/);
  assert.match(css, /\.central-done \{/);
  assert.ok(!/keyframes/.test(read('src/hero/useTypingPanelFit.ts') + read('src/hero/useKeyboardViewport.ts')));
});
