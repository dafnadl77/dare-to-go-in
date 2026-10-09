import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DreamRecorderController, MAX_DEVICE_FALLBACKS, type RecorderEnv } from '../src/hero/dreamRecorderController.ts';

/**
 * Chrome can hold the microphone PERMISSION while the browser's DEFAULT input is unusable (a headset that is switched off, a device
 * another app holds, a disabled virtual device). Then getUserMedia({audio:true}) fails although another input works. The recorder
 * now tries the other inputs the browser lists, for those device-level failures only.
 */

class Track {
  readyState: 'live' | 'ended' = 'live';
  stop() {
    this.readyState = 'ended';
  }
}
class Stream {
  tracks = [new Track()];
  getTracks() {
    return this.tracks;
  }
  get live() {
    return this.tracks.some((t) => t.readyState === 'live');
  }
}
class Rec {
  state: 'inactive' | 'recording' = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onstart: (() => void) | null = null;
  onerror: (() => void) | null = null;
  static isTypeSupported() {
    return true;
  }
  start() {
    this.state = 'recording';
    queueMicrotask(() => this.onstart?.());
  }
  stop() {
    this.state = 'inactive';
  }
}

type Behavior = (constraints: MediaStreamConstraints) => 'ok' | string;

function setup(behavior: Behavior, inputs: string[] | 'throws' | null) {
  const attempts: MediaStreamConstraints[] = [];
  const streams: Stream[] = [];
  const env: RecorderEnv = {
    getUserMedia: (constraints) => {
      attempts.push(constraints);
      const outcome = behavior(constraints);
      if (outcome === 'ok') {
        const s = new Stream();
        streams.push(s);
        return Promise.resolve(s as unknown as MediaStream);
      }
      return Promise.reject(Object.assign(new Error(outcome), { name: outcome }));
    },
    MediaRecorderCtor: Rec as unknown as typeof MediaRecorder,
    AudioContextCtor: null,
    requestFrame: () => 1,
    cancelFrame: () => {},
    now: () => 0,
    listAudioInputs: inputs === null ? null : inputs === 'throws' ? () => Promise.reject(new Error('enumerate failed')) : () => Promise.resolve(inputs),
  };
  const controller = new DreamRecorderController(env, { onState: () => {}, onError: () => {}, onBlob: () => {}, onDuration: () => {} });
  const deviceOf = (c: MediaStreamConstraints) => ((c.audio as { deviceId?: { exact?: string } } | boolean)) && typeof c.audio === 'object' ? c.audio.deviceId?.exact : 'default';
  return { controller, attempts, streams, deviceOf };
}

test('when the default input cannot be opened but another can, the recording starts on the one that works', async () => {
  const h = setup((c) => (typeof c.audio === 'object' && c.audio.deviceId && (c.audio.deviceId as { exact?: string }).exact === 'mic-b' ? 'ok' : 'NotReadableError'), ['mic-a', 'mic-b', 'mic-c']);
  assert.equal(await h.controller.start(), true);
  assert.deepEqual(h.attempts.map(h.deviceOf), ['default', 'mic-a', 'mic-b'], 'default first, then the others in order, stopping at the first that works');
  assert.equal(h.streams.length, 1);
  assert.equal(h.streams[0].live, true);
  h.controller.dispose();
  assert.equal(h.streams[0].live, false);
});

test('a refused permission is NEVER retried on other inputs', async () => {
  const h = setup(() => 'NotAllowedError', ['mic-a', 'mic-b']);
  assert.equal(await h.controller.start(), false);
  assert.equal(h.attempts.length, 1);
  assert.equal(h.controller.errorRef.current, 'NotAllowedError');
});

test('when no input works, the ORIGINAL error is the one reported, and the number of tries is bounded', async () => {
  const ids = Array.from({ length: 10 }, (_, i) => `mic-${i}`);
  const h = setup((c) => (typeof c.audio === 'object' ? 'NotReadableError' : 'NotFoundError'), ids);
  assert.equal(await h.controller.start(), false);
  assert.equal(h.controller.errorRef.current, 'NotFoundError');
  assert.equal(h.attempts.length, 1 + MAX_DEVICE_FALLBACKS);
  assert.equal(h.streams.length, 0);
});

test('without a device list (or if listing fails) behavior is exactly as before: one attempt, its own error', async () => {
  for (const inputs of [null, 'throws'] as const) {
    const h = setup(() => 'NotFoundError', inputs);
    assert.equal(await h.controller.start(), false);
    assert.equal(h.attempts.length, 1);
    assert.equal(h.controller.errorRef.current, 'NotFoundError');
  }
});

test('a working default is used as before: one attempt, the browser default input, no device list consulted', async () => {
  let listed = 0;
  const h = setup(() => 'ok', ['mic-a']);
  const originalList = (h.controller as unknown as { env: RecorderEnv }).env.listAudioInputs;
  (h.controller as unknown as { env: RecorderEnv }).env.listAudioInputs = async () => {
    listed += 1;
    return originalList ? originalList() : [];
  };
  assert.equal(await h.controller.start(), true);
  assert.equal(h.attempts.length, 1);
  assert.deepEqual(h.attempts[0], { audio: true });
  assert.equal(listed, 0);
  h.controller.dispose();
});
