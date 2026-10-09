import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DreamRecorderController,
  pickRecorderMimeType,
  AUDIO_RESUME_WAIT_MS,
  type RecorderEnv,
  type RecordingState,
} from '../src/hero/dreamRecorderController.ts';
import { classifyMicFailure, MIC_FAILURE_MESSAGE_KEY, type MicFailureKind } from '../src/hero/micFailure.ts';
import { interpretTranscriptionResponse, interpretTranscriptionThrow } from '../src/hero/transcriptionResult.ts';
import { en, he } from '../src/i18n/translations.ts';

/**
 * Voice recording, stage by stage. "I couldn't access your microphone" used to be shown for every failure of the START step —
 * a refused permission, no device, a busy device, an AudioContext hiccup, a recorder the browser would not create — and a
 * transcription failure had one generic line. Each stage now reports what it actually was, and typing is always available.
 * (The real microphone, real prompts and real devices cannot be exercised from a test: see the final report.)
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ------------------------------------------------------------------ fakes
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
interface RecorderBehavior {
  /** Throw from the constructor when a mimeType option is passed / always. */
  throwWithMime?: boolean;
  throwAlways?: boolean;
  startThrows?: boolean;
  confirmStart?: boolean;
  supported?: (type: string) => boolean;
}
function makeRecorderClass(behavior: RecorderBehavior) {
  const constructed: Array<{ options: unknown }> = [];
  class Rec {
    state: 'inactive' | 'recording' = 'inactive';
    mimeType = 'audio/webm';
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onstart: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(_stream: unknown, options?: { mimeType?: string }) {
      constructed.push({ options });
      if (behavior.throwAlways || (behavior.throwWithMime && options?.mimeType)) {
        throw Object.assign(new Error('unsupported'), { name: 'NotSupportedError' });
      }
    }
    static isTypeSupported(type: string) {
      return behavior.supported ? behavior.supported(type) : true;
    }
    start() {
      if (behavior.startThrows) throw Object.assign(new Error('bad state'), { name: 'InvalidStateError' });
      this.state = 'recording';
      if (behavior.confirmStart !== false) queueMicrotask(() => this.onstart?.());
    }
    stop() {
      this.state = 'inactive';
      queueMicrotask(() => {
        this.ondataavailable?.({ data: new Blob(['x']) });
        this.onstop?.();
      });
    }
  }
  return { Rec, constructed };
}

class Ctx {
  state: 'running' | 'suspended' | 'closed' = 'running';
  constructor(private mode: 'ok' | 'throws' | 'resume-hangs' = 'ok') {
    if (mode === 'throws') throw new Error('too many AudioContexts');
    if (mode === 'resume-hangs') this.state = 'suspended';
  }
  resume() {
    return this.mode === 'resume-hangs' ? new Promise<void>(() => {}) : Promise.resolve();
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

function setup(opts: {
  gum?: 'ok' | { name: string } | null;
  recorder?: RecorderBehavior;
  audio?: 'ok' | 'throws' | 'resume-hangs' | 'absent';
}) {
  const streams: Stream[] = [];
  const { Rec, constructed } = makeRecorderClass(opts.recorder ?? {});
  const gum = opts.gum === undefined ? 'ok' : opts.gum;
  const audio = opts.audio ?? 'ok';
  const env: RecorderEnv = {
    getUserMedia:
      gum === null
        ? null
        : () => {
            if (gum !== 'ok') return Promise.reject(Object.assign(new Error('gum'), { name: gum.name }));
            const s = new Stream();
            streams.push(s);
            return Promise.resolve(s as unknown as MediaStream);
          },
    MediaRecorderCtor: Rec as unknown as typeof MediaRecorder,
    AudioContextCtor: audio === 'absent' ? null : (class extends Ctx { constructor() { super(audio); } } as unknown as typeof AudioContext),
    requestFrame: () => 1,
    cancelFrame: () => {},
    now: () => 0,
  };
  const states: RecordingState[] = [];
  const controller = new DreamRecorderController(env, { onState: (s) => states.push(s), onError: () => {}, onBlob: () => {}, onDuration: () => {} });
  return { controller, streams, states, constructed };
}

// ------------------------------------------------------------------ the START step names what failed
test('each getUserMedia failure is classified as what it is', () => {
  const table: Array<[string | null, boolean, MicFailureKind]> = [
    ['NotAllowedError', false, 'permission-denied'],
    ['PermissionDeniedError', false, 'permission-denied'],
    ['SecurityError', false, 'permission-denied'],
    ['NotFoundError', false, 'no-device'],
    ['DevicesNotFoundError', false, 'no-device'],
    ['OverconstrainedError', false, 'no-device'],
    ['NotReadableError', false, 'device-busy'],
    ['TrackStartError', false, 'device-busy'],
    ['AbortError', false, 'device-busy'],
    ['insecure-context', false, 'insecure-context'],
    ['unsupported', false, 'unsupported'],
    ['recorder-unsupported', false, 'unsupported'],
    ['recorder-create:NotSupportedError', false, 'format-unsupported'],
    ['start-not-confirmed', false, 'start-failed'],
    ['recorder-start:InvalidStateError', false, 'start-failed'],
    [null, true, 'timeout'],
    ['NotAllowedError', true, 'timeout'],
    ['SomethingNew', false, 'unknown'],
    [null, false, 'unknown'],
  ];
  for (const [error, timedOut, expected] of table) assert.equal(classifyMicFailure(error, timedOut), expected, `${error}/${timedOut}`);
});

test('every failure kind has its own message, in Hebrew and English, and only "unknown" is the generic line', () => {
  const kinds = Object.keys(MIC_FAILURE_MESSAGE_KEY) as MicFailureKind[];
  const texts = { en: new Set<string>(), he: new Set<string>() };
  for (const kind of kinds) {
    const key = MIC_FAILURE_MESSAGE_KEY[kind].replace('hold.', '') as keyof typeof en.hold;
    for (const [lang, dict] of [['en', en], ['he', he]] as const) {
      const text = dict.hold[key];
      assert.ok(typeof text === 'string' && text.length > 10 && !/undefined|null/.test(text), `${lang}.${kind}`);
      texts[lang].add(text);
    }
  }
  assert.equal(texts.en.size, kinds.length, 'no two failures share a message (EN)');
  assert.equal(texts.he.size, kinds.length, 'no two failures share a message (HE)');
  // The refusal message says what to DO about it (allow it for this site), not only what happened.
  assert.match(en.hold.micDenied, /allow/i);
  assert.match(he.hold.micDenied, /אפשרו/);
});

test('a refused permission is reported with the browser\'s own error name and leaves nothing live', async () => {
  const h = setup({ gum: { name: 'NotAllowedError' } });
  assert.equal(await h.controller.start(), false);
  assert.equal(h.controller.errorRef.current, 'NotAllowedError');
  assert.equal(h.states.at(-1), 'error');
  assert.equal(h.streams.some((s) => s.live), false);
});

test('no microphone at all is reported as such', async () => {
  const h = setup({ gum: { name: 'NotFoundError' } });
  assert.equal(await h.controller.start(), false);
  assert.equal(classifyMicFailure(h.controller.errorRef.current, false), 'no-device');
});

test('a page that is not secure gets its own reason (getUserMedia is simply absent there)', async () => {
  const w = globalThis as { window?: unknown };
  const original = w.window;
  w.window = { isSecureContext: false };
  try {
    const h = setup({ gum: null });
    assert.equal(await h.controller.start(), false);
    assert.equal(h.controller.errorRef.current, 'insecure-context');
  } finally {
    w.window = original;
  }
  const bare = setup({ gum: null });
  assert.equal(await bare.controller.start(), false);
  assert.equal(bare.controller.errorRef.current, 'unsupported');
});

test('a browser without MediaRecorder says so, without touching the microphone', async () => {
  const streams: Stream[] = [];
  const env: RecorderEnv = {
    getUserMedia: () => {
      const s = new Stream();
      streams.push(s);
      return Promise.resolve(s as unknown as MediaStream);
    },
    MediaRecorderCtor: null,
    AudioContextCtor: Ctx as unknown as typeof AudioContext,
    requestFrame: () => 1,
    cancelFrame: () => {},
    now: () => 0,
  };
  const c = new DreamRecorderController(env, { onState: () => {}, onError: () => {}, onBlob: () => {}, onDuration: () => {} });
  assert.equal(await c.start(), false);
  assert.equal(c.errorRef.current, 'recorder-unsupported');
  assert.equal(streams.length, 0);
});

// ------------------------------------------------------------------ failures that are NOT "no microphone access"
test('the AudioContext only draws the level meter: its failure or absence never stops a recording', async () => {
  for (const audio of ['throws', 'absent'] as const) {
    const h = setup({ audio });
    assert.equal(await h.controller.start(), true, audio);
    assert.equal(h.states.at(-1), 'recording');
    assert.equal(h.streams[0].live, true);
    h.controller.dispose();
    assert.equal(h.streams[0].live, false);
  }
});

test('a suspended AudioContext whose resume() never answers (some phones) does not hold the recording hostage', async () => {
  const h = setup({ audio: 'resume-hangs' });
  const started = Date.now();
  assert.equal(await h.controller.start(), true);
  assert.ok(Date.now() - started < AUDIO_RESUME_WAIT_MS + 1500, 'start() returned within the bounded wait');
  h.controller.dispose();
});

test('a recorder the browser refuses to build with the chosen format falls back to the browser\'s default format', async () => {
  const h = setup({ recorder: { throwWithMime: true } });
  assert.equal(await h.controller.start(), true);
  assert.equal(h.constructed.length, 2, 'first with the chosen mimeType, then with the default');
  assert.equal((h.constructed[1].options as unknown), undefined);
  h.controller.dispose();
});

test('a recorder that cannot be created at all is a FORMAT problem (the microphone itself was reached), and the stream is released', async () => {
  const h = setup({ recorder: { throwAlways: true } });
  assert.equal(await h.controller.start(), false);
  assert.equal(h.controller.errorRef.current, 'recorder-create:NotSupportedError');
  assert.equal(classifyMicFailure(h.controller.errorRef.current, false), 'format-unsupported');
  assert.equal(h.streams.some((s) => s.live), false, 'the microphone is not left open');
});

test('a recorder that throws on start, or never confirms it started, is "could not start listening"', async () => {
  const thrown = setup({ recorder: { startThrows: true } });
  assert.equal(await thrown.controller.start(), false);
  assert.equal(classifyMicFailure(thrown.controller.errorRef.current, false), 'start-failed');
  assert.equal(thrown.streams.some((s) => s.live), false);
});

test('the recording format: webm where supported, mp4 on Safari, ogg as a last resort, the browser default if none', () => {
  assert.equal(pickRecorderMimeType({ isTypeSupported: () => true }), 'audio/webm');
  assert.equal(pickRecorderMimeType({ isTypeSupported: (t) => t === 'audio/mp4' }), 'audio/mp4');
  assert.equal(pickRecorderMimeType({ isTypeSupported: (t) => t.startsWith('audio/ogg') }), 'audio/ogg;codecs=opus');
  assert.equal(pickRecorderMimeType({ isTypeSupported: () => false }), '');
  assert.equal(pickRecorderMimeType({ isTypeSupported: () => { throw new Error('boom'); } }), '');
  // every one of these is a format the server's transcription route accepts
  const route = read('server/routes/dreamTranscription.ts');
  for (const ext of ["'m4a'", "'ogg'", "'webm'"]) assert.ok(route.includes(ext), ext);
});

// ------------------------------------------------------------------ the TRANSCRIPTION step names what failed
test('upload / transcription / sign-in / credit failures are told apart (and none of them is a microphone problem)', () => {
  const r = (status: number, body: unknown) => interpretTranscriptionResponse(status, body);
  const reason = (x: ReturnType<typeof r>) => (x.status === 'error' ? x.reason : 'ok');
  assert.deepEqual(r(200, { transcript: '  שלום  ' }), { status: 'ok', transcript: 'שלום' });
  assert.equal(reason(r(200, { transcript: '' })), 'invalid_response');
  assert.equal(reason(r(200, null)), 'invalid_response');
  assert.equal(reason(r(401, { reason: 'not_authenticated', message: 'x' })), 'not_authenticated');
  assert.equal(reason(r(403, { reason: 'free_dream_used', message: 'x' })), 'free_dream_used');
  assert.equal(reason(r(403, { reason: 'limit_reached', message: 'x' })), 'limit_reached');
  assert.equal(reason(r(402, { reason: 'credits_required', message: 'x' })), 'credits_required');
  assert.equal(reason(r(413, { reason: 'request_failed', message: 'x' })), 'too_large');
  assert.equal(reason(r(413, null)), 'too_large', 'the platform answers 413 without our JSON');
  assert.equal(reason(r(429, { reason: 'rate_limited', message: 'x' })), 'rate_limited');
  assert.equal(reason(r(502, { reason: 'not_configured', message: 'x' })), 'not_configured');
  assert.equal(reason(r(500, null)), 'request_failed');
  assert.equal(reason(r(500, { reason: 'something_new', message: 'x' })), 'request_failed');
  // the request itself failing
  assert.equal((interpretTranscriptionThrow(new TypeError('Failed to fetch')) as { reason: string }).reason, 'network');
  assert.equal((interpretTranscriptionThrow(Object.assign(new Error('aborted'), { name: 'AbortError' })) as { reason: string }).reason, 'timeout');
  assert.equal((interpretTranscriptionThrow('weird') as { reason: string }).reason, 'network');
});

test('the screen shows the matching message for each stage, keeps the recording for a retry, and always lands in typing', () => {
  const hold = read('src/hero/HoldToRemember.tsx');
  for (const [reason, key] of [
    ['free_dream_used', 'transcriptionFreeDreamUsed'],
    ['not_authenticated', 'transcriptionSessionExpired'],
    ['credits_required', 'transcriptionCreditsRequired'],
    ['too_large', 'transcriptionTooLarge'],
    ['network', 'transcriptionNetwork'],
    ['timeout', 'transcriptionTimeout'],
  ] as const) {
    assert.match(hold, new RegExp(`case '${reason}':\\s*return t\\('hold\\.${key}'\\)`), reason);
  }
  // a transcription failure never uses a microphone message, and a mic failure never uses a transcription one
  const transcriptionFn = hold.slice(hold.indexOf('function describeTranscriptionFailure'), hold.indexOf('export default function HoldToRemember'));
  assert.ok(!/hold\.mic/.test(transcriptionFn), 'transcription messages never mention the microphone');
  const micFn = hold.slice(hold.indexOf('function describeRecordingFailure'), hold.indexOf('/** Failures where sending the SAME recording'));
  assert.ok(!/hold\.transcription/.test(micFn), 'mic messages never mention transcription');
  // retry sends the SAME recording; leaving the step forgets it
  assert.match(hold, /const handleRetryTranscription = \(\) => \{\s*const blob = lastRecordingRef\.current;\s*if \(!blob\) return;/);
  assert.equal((hold.match(/lastRecordingRef\.current = null;/g) ?? []).length >= 3, true, 'forgotten on success, Back and Close');
  assert.match(hold, /RETRYABLE_TRANSCRIPTION_FAILURES = new Set<TranscriptionErrorReason>\(\['network', 'timeout', 'request_failed', 'rate_limited', 'invalid_response'\]\)/);
  // the mic failure path still ends in the typing box
  assert.match(hold, /setMicErrorMessage\(describeRecordingFailure\(recorder\.errorRef\.current, timedOut, t\)\);\s*setCentralMode\('typing'\);/);
  for (const dict of [en, he]) {
    for (const key of ['transcriptionTooLarge', 'transcriptionNetwork', 'transcriptionTimeout', 'retryTranscription'] as const) {
      assert.ok(dict.hold[key].length > 3 && !/undefined|null/.test(dict.hold[key]), key);
    }
  }
});

test('the permission prompt gets 30 seconds, and its expiry says it was not answered', () => {
  const hold = read('src/hero/HoldToRemember.tsx');
  assert.match(hold, /const MIC_REQUEST_TIMEOUT_MS = 30000;/);
  assert.equal(MIC_FAILURE_MESSAGE_KEY.timeout, 'hold.micTimeout');
});

test('the notice sits below the buttons, out of the centred panel\'s flow, so it cannot overlap the prompt, the heading, the text box or the buttons', () => {
  const css = read('src/hero/HoldToRemember.css');
  // out of flow: it cannot grow the (vertically centred) panel upward over the "What do you remember..." line
  assert.match(css, /\.central-mic-notice \{[\s\S]*?position: absolute;[\s\S]*?top: 100%;[\s\S]*?left: 0;[\s\S]*?right: 0;[\s\S]*?flex-direction: column;/);
  assert.match(css, /\.central-retry \{/);
  // both kinds of notice (microphone and transcription) use that one container, after the buttons in the layout
  const hold = read('src/hero/HoldToRemember.tsx');
  // ONE container for every kind of notice (two absolute containers would sit on top of each other under the buttons)
  assert.equal((hold.match(/className="central-mic-notice"/g) ?? []).length, 1);
  assert.ok(!/<p className="central-mic-note">/.test(hold), 'no bare in-flow note remains');
});

test('the engine, packages, credits and payments are untouched by the recording fix', () => {
  for (const file of ['src/hero/micFailure.ts', 'src/hero/transcriptionResult.ts', 'src/hero/dreamRecorderController.ts']) {
    // (transcriptionResult.ts only NAMES the server's "credits_required" refusal so it can be shown; it grants/spends nothing)
    assert.ok(!/payment|grow|make\.com|purchase|grant_credits|\bspend\b/i.test(read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), file);
  }
});
