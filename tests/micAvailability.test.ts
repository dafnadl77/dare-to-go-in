import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeMicAvailability, isChromiumFamily, probeMicAvailability, type MicProbeEnv } from '../src/hero/micAvailability.ts';
import { en, he } from '../src/i18n/translations.ts';

/**
 * Real users without a microphone (a desktop PC with no input device is the common case). DARE asks the browser whether any audio
 * input exists WITHOUT opening one (no permission prompt on load), tells the dreamer kindly, and puts "Write your dream" first —
 * while recording stays offered, and follows the hardware (devicechange) without a reload.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* sourceFiles(full);
    else if (/\.(ts|tsx)$/.test(name)) yield full;
  }
}

// ------------------------------------------------------------------ when an empty device list means "no microphone"
test('an empty list is "no microphone" only where the browser lists devices before permission (Chromium) or after it was granted', () => {
  const judge = judgeMicAvailability;
  assert.equal(judge({ inputCount: 1, permission: 'prompt', chromium: false }), 'available');
  assert.equal(judge({ inputCount: 0, permission: 'prompt', chromium: true }), 'none', 'Chrome/Edge: reliable');
  assert.equal(judge({ inputCount: 0, permission: 'granted', chromium: false }), 'none', 'any browser once permission is granted');
  assert.equal(judge({ inputCount: 0, permission: 'prompt', chromium: false }), 'unknown', 'Safari/Firefox before permission: empty means "not told yet"');
  assert.equal(judge({ inputCount: 0, permission: 'unknown', chromium: false }), 'unknown');
  assert.equal(judge({ inputCount: 0, permission: 'denied', chromium: false }), 'unknown');
});

test('the Chromium family is recognised from userAgentData.brands', () => {
  assert.equal(isChromiumFamily([{ brand: 'Not.A/Brand' }, { brand: 'Chromium' }, { brand: 'Google Chrome' }]), true);
  assert.equal(isChromiumFamily([{ brand: 'Microsoft Edge' }, { brand: 'Chromium' }]), true);
  assert.equal(isChromiumFamily(undefined), false, 'Safari and Firefox expose no brands');
  assert.equal(isChromiumFamily([]), false);
});

test('the probe reads the device list and permission without ever failing the page', async () => {
  const env = (devices: string[] | 'throws' | null, permission: 'granted' | 'prompt' | 'denied' | 'throws' | null, chromium: boolean): MicProbeEnv => ({
    enumerateDevices: devices === null ? null : devices === 'throws' ? () => Promise.reject(new Error('x')) : () => Promise.resolve(devices.map((kind) => ({ kind }))),
    queryPermission: permission === null ? null : permission === 'throws' ? () => Promise.reject(new Error('x')) : () => Promise.resolve(permission),
    chromium,
  });
  assert.equal(await probeMicAvailability(env(['audioinput', 'audiooutput'], 'prompt', false)), 'available');
  assert.equal(await probeMicAvailability(env(['audiooutput'], 'prompt', true)), 'none', 'a desktop with speakers only');
  assert.equal(await probeMicAvailability(env([], 'prompt', true)), 'none');
  assert.equal(await probeMicAvailability(env([], 'prompt', false)), 'unknown');
  assert.equal(await probeMicAvailability(env([], 'granted', false)), 'none');
  assert.equal(await probeMicAvailability(env([], 'throws', true)), 'none', 'a failing permissions query does not hide a reliable answer');
  assert.equal(await probeMicAvailability(env([], null, false)), 'unknown');
  assert.equal(await probeMicAvailability(env('throws', 'prompt', true)), 'unknown');
  assert.equal(await probeMicAvailability(env(null, null, true)), 'unknown');
});

// ------------------------------------------------------------------ never asks for the microphone on its own
test('no permission is requested on load: the microphone is opened only by the recorder, started only by the dreamer\'s own press', () => {
  const avail = stripComments(read('src/hero/micAvailability.ts'));
  assert.ok(!/getUserMedia|SpeechRecognition|MediaRecorder/.test(avail), 'checking for a microphone never opens one');
  const users: string[] = [];
  for (const file of sourceFiles(join(root, 'src'))) {
    if (/getUserMedia\s*\(/.test(stripComments(readFileSync(file, 'utf8')))) users.push(file.slice(root.length).replace(/\\/g, '/'));
  }
  assert.deepEqual(users.sort(), ['src/hero/dreamRecorderController.ts'].sort(), 'only the recorder opens the microphone');
  // and the recorder starts only from the press-and-hold commit
  const hold = read('src/hero/HoldToRemember.tsx');
  assert.equal((stripComments(hold).match(/recorder\.start\(\)/g) ?? []).length, 1);
  assert.match(hold, /listenTimerRef\.current = setTimeout\(\(\) => \{\s*committedRef\.current = true;\s*setIsListening\(true\);\s*commitToListening\(\);/);
});

test('the availability follows the hardware with no reload, and cleans up after itself', () => {
  const avail = read('src/hero/micAvailability.ts');
  assert.match(avail, /addEventListener\?\.\('devicechange', recheck\)/);
  assert.match(avail, /removeEventListener\?\.\('devicechange', recheck\)/);
  assert.match(avail, /aliveRef\.current = false/);
});

// ------------------------------------------------------------------ what the dreamer sees
test('without a microphone: the kind message, a clear "Write your dream" button, and recording is dimmed, never removed', () => {
  assert.equal(he.hold.micNoDevice, 'לא מצאנו מיקרופון במכשיר הזה. אפשר לספר לנו את החלום בכתיבה.');
  assert.equal(he.hold.writeYourDream, 'כתיבת החלום');
  assert.equal(en.hold.micNoDevice, 'We couldn’t find a microphone on this device. You can tell us your dream by writing it.');
  assert.equal(en.hold.writeYourDream, 'Write your dream');

  const hold = read('src/hero/HoldToRemember.tsx');
  assert.match(hold, /\{noMicrophone \? t\('hold\.writeYourDream'\) : t\('hold\.idRatherType'\)\}/);
  assert.match(hold, /\{noMicrophone \? t\('hold\.micNoDevice'\) : t\('hold\.pressAndHoldHint'\)\}/);
  assert.match(hold, /htr-type-link\$\{noMicrophone \? ' htr-type-link--primary' : ''\}/);
  // writing is always one tap away, in every state: the button is never conditional on a microphone
  assert.match(hold, /onClick=\{\(\) => setCentralMode\('typing'\)\}\s*>\s*\{noMicrophone/);

  const css = read('src/hero/HoldToRemember.css');
  const noMic = css.slice(css.indexOf('.htr-circle.is-no-mic'), css.indexOf('/* "Press and hold while you speak"'));
  assert.match(noMic, /opacity: 0\.6;/);
  assert.ok(!/display:\s*none|visibility:\s*hidden|pointer-events:\s*none/.test(noMic), 'the circle stays usable');
});

test('a press that finds no microphone is a calm "write it instead", not an error and not a failed analysis', () => {
  const hold = read('src/hero/HoldToRemember.tsx');
  // the typing hint is not repeated when the message already offers writing
  assert.match(hold, /\{micFailureKind !== 'no-device' && \(\s*<>\s*<br \/>\s*\{t\('hold\.typeInsteadHint'\)\}/);
  // a missing microphone is remembered (so the home screen offers writing first) until the hardware changes
  assert.match(hold, /if \(kind === 'no-device'\) markMicNone\(\);/);
  assert.match(hold, /markMicAvailable\(\);\s*if \(holdRef\.current\) holdRef\.current\.active = false;/);
  // nothing in the capture screen routes a microphone problem to the analysis-failed state
  const failurePath = hold.slice(hold.indexOf("const kind = classifyMicFailure"), hold.indexOf('const beginHold'));
  assert.ok(!/analysisFailed|onDreamCapture|onRetryAnalysis/.test(failurePath));
});

test('the blocked-permission message tells the dreamer how to allow it, in both languages', () => {
  assert.match(en.hold.micDenied, /lock icon/i);
  assert.match(en.hold.micDenied, /allow the microphone/i);
  assert.match(he.hold.micDenied, /סמל המנעול/);
  assert.match(he.hold.micDenied, /אפשרו מיקרופון/);
});

test('the dream engine, credits, packages and payments are untouched by this change', () => {
  for (const file of ['src/hero/micAvailability.ts']) {
    assert.ok(!/payment|grow|make\.com|purchase|credit|dreamAnalysis|analyzeDream/i.test(stripComments(read(file))), file);
  }
});
