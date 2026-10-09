import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DreamRecorderController, type RecorderEnv, type RecordingState } from '../src/hero/dreamRecorderController.ts';
import { classifyMicFailure } from '../src/hero/micFailure.ts';
import { hasDreamText, submitTypedDream } from '../src/hero/dreamEntry.ts';
import type { DreamInput } from '../src/hero/dreamInput.ts';
import { en, he } from '../src/i18n/translations.ts';

/**
 * REGRESSION (production, reported by the owner on her own PC): a computer with no microphone (Windows lists no input devices;
 * Chrome answers getUserMedia with NotFoundError). Pressing record landed in the typing box with a kind note; pressing I'M DONE
 * with the box still empty then submitted an empty dream: the screen moved on, the analysis refused the empty text at once, and the
 * dreamer saw "Something went wrong while I was putting this together". Nothing in that path was an AI problem.
 *
 * The whole path, as a test:  no input device -> press record -> press done -> no analysis -> writing is offered.
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function noInputDeviceRecorder() {
  const attempts: MediaStreamConstraints[] = [];
  const states: RecordingState[] = [];
  const env: RecorderEnv = {
    // Chrome with no audio input at all
    getUserMedia: (c) => {
      attempts.push(c);
      return Promise.reject(Object.assign(new Error('Requested device not found'), { name: 'NotFoundError' }));
    },
    MediaRecorderCtor: class {} as unknown as typeof MediaRecorder,
    AudioContextCtor: null,
    requestFrame: () => 1,
    cancelFrame: () => {},
    now: () => 0,
    listAudioInputs: async () => [], // and nothing else to fall back to
  };
  const controller = new DreamRecorderController(env, { onState: (s) => states.push(s), onError: () => {}, onBlob: () => {}, onDuration: () => {} });
  return { controller, attempts, states };
}

test('REGRESSION: no input device -> press record -> press done -> no analysis, no failure screen, writing is offered', async () => {
  // 1. press record: the microphone cannot be opened, for a NO-DEVICE reason
  const rec = noInputDeviceRecorder();
  assert.equal(await rec.controller.start(), false);
  assert.equal(rec.controller.errorRef.current, 'NotFoundError');
  assert.equal(classifyMicFailure(rec.controller.errorRef.current, false), 'no-device', 'a calm "no microphone", not an error');
  assert.equal(rec.states.at(-1), 'error');

  // 2. the dreamer lands in the typing box (empty) and presses I'M DONE
  let analysisStarted = 0;
  let screenMovedOn = 0;
  const outcome = submitTypedDream('', {
    onCapture: () => {
      analysisStarted += 1; // this is what starts the analysis (HeroDream.handleDreamCapture -> runAnalysis)
    },
    onSubmitted: () => {
      screenMovedOn += 1; // this is what shows "I think I have it" and, after a refusal, the failure screen
    },
  });

  // 3. nothing was submitted: no analysis call, no screen change, so no "Something went wrong" screen
  assert.equal(outcome, 'blocked_empty');
  assert.equal(analysisStarted, 0, 'no analysis (no AI call) without text');
  assert.equal(screenMovedOn, 0, 'the screen does not move on to the processing/failed state');

  // 4. writing is still there: the very same button works as soon as there is something written
  const captured: DreamInput[] = [];
  assert.equal(
    submitTypedDream('I was in an old house at night', { onCapture: (i) => captured.push(i), onSubmitted: () => (screenMovedOn += 1) }),
    'submitted',
  );
  assert.equal(captured.length, 1);
  assert.equal(captured[0].originalText, 'I was in an old house at night');
  assert.equal(screenMovedOn, 1);
});

test('only text that can be analyzed is submitted: empty, spaces and punctuation alone are not a dream', () => {
  for (const empty of ['', '   ', '\n\n', ' . ', '...', '—', '!!!', '\t ?']) {
    assert.equal(hasDreamText(empty), false, JSON.stringify(empty));
    let called = false;
    assert.equal(submitTypedDream(empty, { onCapture: () => (called = true), onSubmitted: () => (called = true) }), 'blocked_empty');
    assert.equal(called, false);
  }
  for (const real of ['חלמתי', 'a', '7', ' dream ', 'חלום אחד קצר.']) {
    assert.equal(hasDreamText(real), true, real);
  }
});

test('a recording whose transcript is empty can never reach the analysis either (the typing box stays empty -> blocked)', () => {
  // transcription success needs non-empty text (interpretTranscriptionResponse -> invalid_response otherwise), and an empty
  // result leaves the box empty, so I'M DONE is blocked by the same rule
  const client = read('src/hero/transcriptionResult.ts');
  assert.match(client, /if \(!transcript\) return \{ status: 'error', reason: 'invalid_response'/);
  assert.equal(submitTypedDream('', { onSubmitted: () => assert.fail('must not move on') }), 'blocked_empty');
});

test('the capture screen has exactly ONE way to submit a dream and move on, and it goes through the rule', () => {
  const hold = read('src/hero/HoldToRemember.tsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  // the only call that starts the analysis, and the only transition to the "settled" (processing / failed) screen
  assert.equal((hold.match(/onDreamCapture/g) ?? []).length, 3, 'prop type, destructuring, and the one use inside submitTypedDream');
  assert.equal((hold.match(/setCentralMode\('settled'\)/g) ?? []).length, 1);
  assert.match(hold, /submitTypedDream\(entry, \{\s*onCapture: onDreamCapture,\s*onSubmitted: \(\) => \{\s*setEntry\(''\);\s*setDoneBlocked\(false\);\s*setCentralMode\('settled'\);/);
  // a microphone failure never submits anything: it only sets messages and moves to the typing box
  const failure = hold.slice(hold.indexOf("const kind = classifyMicFailure"), hold.indexOf('const beginHold'));
  assert.ok(!/onDreamCapture|submitTypedDream|settled/.test(failure));
  assert.match(failure, /setCentralMode\('typing'\)/);
});

test('the empty press explains itself kindly, in both languages, and I\'M DONE looks unavailable until there is text', () => {
  assert.equal(he.hold.writeSomethingFirst, 'כתבו כמה מילים על החלום כדי להמשיך.');
  assert.equal(en.hold.writeSomethingFirst, 'Write a few words about your dream to continue.');
  const hold = read('src/hero/HoldToRemember.tsx');
  assert.match(hold, /aria-disabled=\{!dreamHasText\}/);
  assert.match(hold, /\{doneBlocked && !dreamHasText && \(\s*<p className="central-mic-note" role="alert">\s*\{t\('hold\.writeSomethingFirst'\)\}/);
  assert.match(hold, /textareaRef\.current\?\.focus\(\);\s*\}\s*\};/, 'the box is focused so the dreamer can simply start writing');
  assert.match(read('src/hero/HoldToRemember.css'), /\.central-done\[aria-disabled='true'\] \{\s*opacity: 0\.45;/);
});

test('the dream engine, the writing path that works, credits, packages and payments are untouched', () => {
  const entry = read('src/hero/dreamEntry.ts').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/payment|grow|make\.com|purchase|credit|fetch\(/i.test(entry));
  // typing a dream and pressing done still hands the text on exactly as before
  let text = '';
  submitTypedDream('Flying over the sea', { onCapture: (i) => (text = i.originalText ?? ''), onSubmitted: () => {} });
  assert.equal(text, 'Flying over the sea');
});
