import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DreamRecorderController, type RecorderEnv, type RecordingState } from '../src/hero/dreamRecorderController.ts';

// ---- Fakes that model the real MediaStream / MediaRecorder / AudioContext lifecycle ----

class FakeTrack {
  readyState: 'live' | 'ended' = 'live';
  stop() {
    this.readyState = 'ended';
  }
}
class FakeStream {
  tracks = [new FakeTrack(), new FakeTrack()];
  getTracks() {
    return this.tracks;
  }
  get live() {
    return this.tracks.some((t) => t.readyState === 'live');
  }
}
class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static confirmStart = true;
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onstart: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public stream: FakeStream) {
    FakeRecorder.instances.push(this);
  }
  static isTypeSupported() {
    return true;
  }
  start() {
    this.state = 'recording';
    if (FakeRecorder.confirmStart) queueMicrotask(() => this.onstart?.());
  }
  stop() {
    this.state = 'inactive';
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(['x']) });
      this.onstop?.();
    });
  }
}
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: 'running' | 'suspended' | 'closed' = 'running';
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
  createMediaStreamSource() {
    return { connect() {} };
  }
  createAnalyser() {
    return { fftSize: 0, smoothingTimeConstant: 0, frequencyBinCount: 8, getByteTimeDomainData() {} };
  }
}

interface Harness {
  controller: DreamRecorderController;
  streams: FakeStream[];
  states: RecordingState[];
  blobs: (Blob | null)[];
  frames: { requested: number; cancelled: number };
  /** Resolves the next pending getUserMedia (when `deferred` is used). */
  grant: () => void;
  deny: () => void;
}

function make(opts: { deferred?: boolean } = {}): Harness {
  FakeRecorder.instances = [];
  FakeRecorder.confirmStart = true;
  FakeAudioContext.instances = [];
  const streams: FakeStream[] = [];
  const states: RecordingState[] = [];
  const blobs: (Blob | null)[] = [];
  const frames = { requested: 0, cancelled: 0 };
  let pending: { resolve: (s: FakeStream) => void; reject: (e: Error) => void } | null = null;
  const env: RecorderEnv = {
    getUserMedia: () => {
      const stream = new FakeStream();
      streams.push(stream);
      if (!opts.deferred) return Promise.resolve(stream as unknown as MediaStream);
      return new Promise<MediaStream>((resolve, reject) => {
        pending = { resolve: () => resolve(stream as unknown as MediaStream), reject };
      });
    },
    MediaRecorderCtor: FakeRecorder as unknown as typeof MediaRecorder,
    AudioContextCtor: FakeAudioContext as unknown as typeof AudioContext,
    requestFrame: () => {
      frames.requested += 1;
      return frames.requested;
    },
    cancelFrame: () => {
      frames.cancelled += 1;
    },
    now: () => 0,
  };
  const controller = new DreamRecorderController(env, {
    onState: (s) => states.push(s),
    onError: () => {},
    onBlob: (b) => blobs.push(b),
    onDuration: () => {},
  });
  return {
    controller,
    streams,
    states,
    blobs,
    frames,
    grant: () => pending?.resolve(streams[streams.length - 1]),
    deny: () => pending?.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

test('A. dispose while recording stops the recorder and every MediaStream track and closes the AudioContext', async () => {
  const h = make();
  assert.equal(await h.controller.start(), true);
  assert.equal(h.streams[0].live, true, 'the microphone is live while recording');
  h.controller.dispose();
  assert.equal(h.streams[0].live, false, 'every track ended');
  assert.equal(FakeRecorder.instances[0].state, 'inactive');
  assert.equal(FakeAudioContext.instances[0].state, 'closed');
  assert.ok(h.frames.cancelled > 0, 'the analyser loop is cancelled');
  await flush();
  assert.deepEqual(h.blobs, [], 'nothing is emitted after the owner is gone');
});

test('B. leaving while the permission prompt is still open releases the stream that arrives later', async () => {
  const h = make({ deferred: true });
  const started = h.controller.start();
  await flush();
  h.controller.dispose(); // the dreamer navigated away
  h.grant(); // ...and only then does the browser hand over the microphone
  assert.equal(await started, false);
  assert.equal(h.streams[0].live, false, 'a stream nobody is waiting for is never left live');
  assert.equal(FakeRecorder.instances.length, 0, 'no recorder was ever created for it');
});

test('C. reset() during a pending start abandons it the same way', async () => {
  const h = make({ deferred: true });
  const started = h.controller.start();
  await flush();
  h.controller.reset();
  h.grant();
  assert.equal(await started, false);
  assert.equal(h.streams[0].live, false);
  assert.equal(h.states[h.states.length - 1], 'idle', 'the state stays at the reset value');
});

test('D. dispose while waiting for the recorder\'s own onstart releases everything', async () => {
  const h = make();
  FakeRecorder.confirmStart = false;
  const started = h.controller.start();
  await flush();
  assert.equal(FakeRecorder.instances[0].state, 'recording');
  h.controller.dispose();
  // The onstart that never fires is now moot — start() must not hang or adopt anything.
  FakeRecorder.instances[0].onstart?.();
  assert.equal(await Promise.race([started, new Promise((r) => setTimeout(() => r('hung'), 100))]), false);
  assert.equal(h.streams[0].live, false);
});

test('E. record → finish → reset → record again works and leaves no stream live', async () => {
  const h = make();
  assert.equal(await h.controller.start(), true);
  h.controller.finish();
  await flush();
  assert.equal(h.streams[0].live, false, 'finishing releases the microphone');
  assert.equal(h.blobs.length, 1, 'the recorded blob is delivered');
  h.controller.reset();
  assert.equal(await h.controller.start(), true, 'the next recording starts normally');
  assert.equal(h.streams.length, 2);
  assert.equal(h.streams[1].live, true);
  h.controller.dispose();
  assert.equal(h.streams[1].live, false);
});

test('F. rapid start/reset/start: only the latest stream stays live, earlier ones are all released', async () => {
  const h = make();
  const first = h.controller.start();
  h.controller.reset();
  const second = h.controller.start();
  const results = await Promise.all([first, second]);
  assert.deepEqual(results, [false, true]);
  const live = h.streams.filter((s) => s.live);
  assert.equal(live.length, 1, 'exactly one microphone stream remains, the current one');
  h.controller.dispose();
  assert.equal(h.streams.filter((s) => s.live).length, 0);
});

test('G. a denied permission is reported and leaves nothing live', async () => {
  const h = make({ deferred: true });
  const started = h.controller.start();
  await flush();
  h.deny();
  assert.equal(await started, false);
  assert.equal(h.states[h.states.length - 1], 'error');
  assert.equal(h.controller.errorRef.current, 'NotAllowedError');
});

test('H. revive() re-arms a disposed controller (React StrictMode runs cleanup then setup on the same instance)', async () => {
  const h = make();
  h.controller.dispose();
  h.controller.revive();
  assert.equal(await h.controller.start(), true);
  assert.equal(h.streams[0].live, true);
  h.controller.dispose();
  assert.equal(h.streams[0].live, false);
});

test('I. unsupported browsers fail cleanly without touching the microphone', async () => {
  const h = make();
  const bare = new DreamRecorderController(
    { getUserMedia: null, MediaRecorderCtor: null, AudioContextCtor: null, requestFrame: () => 0, cancelFrame: () => {}, now: () => 0 },
    { onState: (s) => h.states.push(s), onError: () => {}, onBlob: () => {}, onDuration: () => {} },
  );
  assert.equal(await bare.start(), false);
  assert.equal(bare.errorRef.current, 'unsupported');
});
