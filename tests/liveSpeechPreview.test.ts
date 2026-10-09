import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LivePreviewController,
  BENIGN_SPEECH_ERRORS,
  MAX_PREVIEW_RESTARTS,
  PREVIEW_RESTART_DELAY_MS,
  type LivePreviewEnv,
  type SpeechRecognitionLike,
} from '../src/hero/livePreviewController.ts';

/**
 * The live words under the recording (browser SpeechRecognition). Cosmetic and best effort — but it used to give up for the
 * rest of the recording on ANY error, including Chrome's routine 'no-speech' (a pause before speaking), and it never said why.
 */

class FakeRecognition implements SpeechRecognitionLike {
  static instances: FakeRecognition[] = [];
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  started = false;
  stopped = false;
  aborted = false;
  startThrows = false;
  onresult: SpeechRecognitionLike['onresult'] = null;
  onerror: SpeechRecognitionLike['onerror'] = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    if (this.startThrows) throw Object.assign(new Error('already started'), { name: 'InvalidStateError' });
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
  abort() {
    this.aborted = true;
  }
  say(text: string, isFinal: boolean, index = 0) {
    this.onresult?.({ resultIndex: index, results: { length: index + 1, [index]: { length: 1, isFinal, 0: { transcript: text } } } as never });
  }
  fail(code: string) {
    this.onerror?.({ error: code });
    this.onend?.();
  }
}

function setup(opts: { create?: (() => SpeechRecognitionLike) | null } = {}) {
  FakeRecognition.instances = [];
  const timers: Array<{ fn: () => void; ms: number; id: number; live: boolean }> = [];
  const warnings: string[] = [];
  const texts: Array<[string, string]> = [];
  const env: LivePreviewEnv = {
    createRecognition: opts.create === undefined ? () => new FakeRecognition() : opts.create,
    setTimeout: (fn, ms) => {
      const t = { fn, ms, id: timers.length + 1, live: true };
      timers.push(t);
      return t.id;
    },
    clearTimeout: (id) => {
      const t = timers.find((x) => x.id === id);
      if (t) t.live = false;
    },
    warn: (m) => warnings.push(m),
  };
  const controller = new LivePreviewController(env, { onText: (f, i) => texts.push([f, i]) });
  /** Runs every pending restart timer. */
  const tick = () => {
    for (const t of timers.filter((x) => x.live)) {
      t.live = false;
      t.fn();
    }
  };
  return { controller, timers, warnings, texts, tick, last: () => FakeRecognition.instances[FakeRecognition.instances.length - 1] };
}

test('live words appear: interim text first, then the final text is kept and joined', () => {
  const h = setup();
  h.controller.start('he');
  const r = h.last();
  assert.equal(r.lang, 'he-IL');
  assert.equal(r.continuous && r.interimResults, true);
  r.say('חלמתי', false);
  assert.deepEqual(h.texts.at(-1), ['', 'חלמתי']);
  r.say('חלמתי שאני עפה', true);
  assert.deepEqual(h.texts.at(-1), ['חלמתי שאני עפה', '']);
  r.say('מעל העיר', false);
  assert.deepEqual(h.texts.at(-1), ['חלמתי שאני עפה', 'מעל העיר']);
});

test("a pause before speaking ('no-speech', Chrome's routine ~8 s timeout) restarts the preview instead of ending it for the whole recording", () => {
  const h = setup();
  h.controller.start('en');
  assert.equal(FakeRecognition.instances.length, 1);
  h.last().fail('no-speech');
  assert.equal(h.controller.errorCode, null, 'not a failure of the feature');
  assert.equal(h.warnings.length, 0);
  assert.equal(h.timers.filter((t) => t.live).length, 1, 'a restart is scheduled');
  assert.equal(h.timers[0].ms, PREVIEW_RESTART_DELAY_MS);
  h.tick();
  assert.equal(FakeRecognition.instances.length, 2, 'a new session is listening');
  h.last().say('I was flying', true);
  assert.deepEqual(h.texts.at(-1), ['I was flying', ''], 'and the words appear');
});

test("'aborted' is benign too, and a session that simply ends while still wanted is restarted", () => {
  assert.ok(BENIGN_SPEECH_ERRORS.has('no-speech') && BENIGN_SPEECH_ERRORS.has('aborted'));
  const h = setup();
  h.controller.start('en');
  h.last().fail('aborted');
  h.tick();
  assert.equal(FakeRecognition.instances.length, 2);
  h.last().onend?.(); // ended on its own
  h.tick();
  assert.equal(FakeRecognition.instances.length, 3);
});

test('a real reason the browser cannot do live words stops the preview, quietly, and is recorded once with its code', () => {
  for (const code of ['not-allowed', 'service-not-allowed', 'network', 'audio-capture', 'language-not-supported']) {
    const h = setup();
    h.controller.start('he');
    h.last().fail(code);
    assert.equal(h.controller.errorCode, code);
    assert.deepEqual(h.warnings, [`speech_preview_stopped code=${code}`]);
    h.tick();
    assert.equal(FakeRecognition.instances.length, 1, `${code}: no restart loop`);
    // a second error from the same session does not repeat the warning
    h.last().onerror?.({ error: code });
    assert.equal(h.warnings.length, 1);
  }
});

test('stop() ends the preview for good: nothing restarts, a pending restart is cancelled', () => {
  const h = setup();
  h.controller.start('en');
  h.last().fail('no-speech');
  h.controller.stop();
  h.tick();
  assert.equal(FakeRecognition.instances.length, 1);
  h.controller.start('en');
  const r = h.last();
  h.controller.stop();
  assert.equal(r.stopped, true);
  r.onend?.();
  h.tick();
  assert.equal(FakeRecognition.instances.length, 2, 'no restart after stop()');
});

test('hearing the dreamer restores the silence budget; endless silence is bounded', () => {
  const h = setup();
  h.controller.start('en');
  for (let i = 0; i < MAX_PREVIEW_RESTARTS; i += 1) {
    h.last().fail('no-speech');
    h.tick();
  }
  assert.equal(h.controller.errorCode, null);
  h.last().say('hello', false); // heard: the budget starts over
  for (let i = 0; i < MAX_PREVIEW_RESTARTS; i += 1) {
    h.last().fail('no-speech');
    h.tick();
  }
  assert.equal(h.controller.errorCode, null);
  // with no speech at all the limit is reached and recorded
  const silent = setup();
  silent.controller.start('en');
  for (let i = 0; i < MAX_PREVIEW_RESTARTS + 2; i += 1) {
    silent.last().fail('no-speech');
    silent.tick();
  }
  assert.equal(silent.controller.errorCode, 'restart-limit');
});

test('starting again aborts the earlier session, and the old session ending does not create a duplicate', () => {
  const h = setup();
  h.controller.start('en');
  const first = h.last();
  h.controller.start('en');
  assert.equal(first.aborted, true);
  assert.equal(FakeRecognition.instances.length, 2);
  first.onend?.();
  h.tick();
  assert.equal(FakeRecognition.instances.length, 2, 'the stale session does not restart anything');
});

test('a browser without SpeechRecognition, or one that throws, is a quiet no-op with a recorded reason where there is one', () => {
  const none = setup({ create: null });
  none.controller.start('en');
  assert.equal(FakeRecognition.instances.length, 0);
  assert.equal(none.controller.errorCode, null);

  const ctorThrows = setup({ create: () => { throw new Error('boom'); } });
  ctorThrows.controller.start('en');
  assert.equal(ctorThrows.controller.errorCode, 'construct-failed');

  const startThrows = setup({
    create: () => {
      const r = new FakeRecognition();
      r.startThrows = true;
      return r;
    },
  });
  startThrows.controller.start('en');
  assert.equal(startThrows.controller.errorCode, 'start-failed');
});

test('the hook only wraps the controller; the preview still never touches the recording or what gets submitted', () => {
  const hook = readFileSync(new URL('../src/hero/useLivePreviewTranscript.ts', import.meta.url), 'utf8');
  assert.match(hook, /new LivePreviewController\(browserLivePreviewEnv\(\)/);
  assert.ok(!/MediaRecorder|getUserMedia|fetch\(/.test(hook.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
  const ctl = readFileSync(new URL('../src/hero/livePreviewController.ts', import.meta.url), 'utf8');
  assert.ok(!/MediaRecorder|getUserMedia|fetch\(/.test(ctl.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
});
