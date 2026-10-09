import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DreamRecorderController, type CaptureInterruption, type RecorderEnv } from '../src/hero/dreamRecorderController.ts';
import { LivePreviewController, type LivePreviewEnv, type LivePreviewStatus, type SpeechRecognitionLike } from '../src/hero/livePreviewController.ts';
import {
  BACKGROUND_GRACE_MS,
  LIVE_WORDS_OFF_KEY,
  LIVE_WORDS_OFF_MS,
  SPEECH_LEVEL,
  STALL_SPEECH_MS,
  disableLiveWords,
  isCollision,
  isLiveWordsDisabled,
  nextStallSpeechMs,
  type KeyValueStore,
} from '../src/hero/liveWordsPolicy.ts';
import { hasDreamText } from '../src/hero/dreamEntry.ts';
import { en, he } from '../src/i18n/translations.ts';

/**
 * Live words on phones and tablets. They used to be switched off on every touch device because the browser's SpeechRecognition can
 * compete with the recording for the microphone. They now run there too, but that risk is WATCHED while it happens, the recording is
 * never touched, and the screen never promises words that are not coming.
 *
 * (A real phone, a real microphone and a real SpeechRecognition cannot be exercised from a test: see the final report.)
 */

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// ------------------------------------------------------------------ fakes
class FakeTrack extends EventTarget {
  readyState: 'live' | 'ended' = 'live';
  stop() {
    this.readyState = 'ended';
  }
  mute() {
    this.dispatchEvent(new Event('mute'));
  }
  end() {
    this.readyState = 'ended';
    this.dispatchEvent(new Event('ended'));
  }
}
class FakeStream {
  track = new FakeTrack();
  getTracks() {
    return [this.track];
  }
  getAudioTracks() {
    return [this.track];
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
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(['x']) });
      this.onstop?.();
    });
  }
}

function recorderSetup() {
  const streams: FakeStream[] = [];
  const blobs: Array<Blob | null> = [];
  const env: RecorderEnv = {
    getUserMedia: () => {
      const s = new FakeStream();
      streams.push(s);
      return Promise.resolve(s as unknown as MediaStream);
    },
    MediaRecorderCtor: Rec as unknown as typeof MediaRecorder,
    AudioContextCtor: null,
    requestFrame: () => 1,
    cancelFrame: () => {},
    now: () => 0,
  };
  const controller = new DreamRecorderController(env, { onState: () => {}, onError: () => {}, onBlob: (b) => blobs.push(b), onDuration: () => {} });
  const seen: CaptureInterruption[] = [];
  controller.setInterruptionHandler((r) => seen.push(r));
  return { controller, streams, seen, blobs };
}

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

class FakeRecognition implements SpeechRecognitionLike {
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  aborted = false;
  onresult: SpeechRecognitionLike['onresult'] = null;
  onerror: SpeechRecognitionLike['onerror'] = null;
  onend: (() => void) | null = null;
  start() {}
  stop() {}
  abort() {
    this.aborted = true;
  }
  say(text: string, isFinal = false) {
    this.onresult?.({ resultIndex: 0, results: { length: 1, 0: { length: 1, isFinal, 0: { transcript: text } } } as never });
  }
}
function liveSetup(supported = true) {
  const instances: FakeRecognition[] = [];
  const statuses: LivePreviewStatus[] = [];
  const env: LivePreviewEnv = {
    createRecognition: supported ? () => { const r = new FakeRecognition(); instances.push(r); return r; } : null,
    setTimeout: () => 1,
    clearTimeout: () => {},
    warn: () => {},
  };
  const controller = new LivePreviewController(env, { onText: () => {}, onStatus: (s) => statuses.push(s) });
  return { controller, instances, statuses };
}

// ------------------------------------------------------------------ the recording is watched, never changed
test('a microphone stream that is muted or ended while recording is reported — and the recording itself carries on and finishes', async () => {
  const r = recorderSetup();
  assert.equal(await r.controller.start(), true);
  r.streams[0].track.mute();
  r.streams[0].track.end();
  assert.deepEqual(r.seen, ['muted', 'ended']);
  r.controller.finish();
  await new Promise((resolve) => setTimeout(resolve, 5));
  const blob = r.blobs.at(-1);
  assert.ok(blob && blob.size > 0, 'the recording is still delivered');
});

test('nothing is reported before the recording is confirmed, after it is finished, or for a stream that cannot be watched', async () => {
  const r = recorderSetup();
  // mute before start() resolves is impossible to observe (no stream yet); after finish() the listeners are removed
  assert.equal(await r.controller.start(), true);
  r.controller.finish();
  r.streams[0].track.mute();
  assert.deepEqual(r.seen, []);

  // a stream without audio-track events (older browsers / test doubles) is simply not watched
  const bare = new DreamRecorderController(
    { getUserMedia: () => Promise.resolve({ getTracks: () => [] } as unknown as MediaStream), MediaRecorderCtor: Rec as unknown as typeof MediaRecorder, AudioContextCtor: null, requestFrame: () => 1, cancelFrame: () => {}, now: () => 0 },
    { onState: () => {}, onError: () => {}, onBlob: () => {}, onDuration: () => {} },
  );
  assert.equal(await bare.start(), true);
});

// ------------------------------------------------------------------ the live words switch off for a reason, at once
test('abort() switches the live words off at once, keeps the reason and tells the screen', () => {
  const h = liveSetup();
  h.controller.start('he');
  assert.equal(h.controller.status, 'starting');
  h.instances[0].say('חלמתי על ים', false);
  assert.equal(h.controller.status, 'live');
  h.controller.abort('capture-muted');
  assert.equal(h.instances[0].aborted, true);
  assert.equal(h.controller.status, 'stopped');
  assert.equal(h.controller.errorCode, 'capture-muted');
  assert.deepEqual(h.statuses, ['starting', 'live', 'stopped']);
});

test('a browser without SpeechRecognition says "unsupported" (so the screen can say the transcript comes at the end)', () => {
  const h = liveSetup(false);
  h.controller.start('en');
  assert.equal(h.controller.status, 'unsupported');
  assert.equal(h.controller.errorCode, null);
});

test('what was heard live is available at the moment the dreamer finishes', () => {
  const h = liveSetup();
  h.controller.start('en');
  h.instances[0].say('I was flying', true);
  h.instances[0].say('over a sea', false);
  assert.equal(h.controller.heardText, 'I was flying over a sea');
  h.controller.stop();
  assert.equal(h.controller.heardText, 'I was flying over a sea', 'stopping keeps it for the fallback');
});

// ------------------------------------------------------------------ the collision policy
test('a device that collided is remembered, for a limited time, and then given another chance', () => {
  const store = memoryStore();
  const t0 = 1_000_000;
  assert.equal(isLiveWordsDisabled(store, t0), false);
  disableLiveWords(store, t0, 'muted');
  assert.equal(isLiveWordsDisabled(store, t0 + 1000), true);
  assert.equal(isLiveWordsDisabled(store, t0 + LIVE_WORDS_OFF_MS - 1), true);
  assert.equal(isLiveWordsDisabled(store, t0 + LIVE_WORDS_OFF_MS + 1), false);
  assert.equal(store.data.has(LIVE_WORDS_OFF_KEY), false, 'the stale flag is cleaned up');
});

test('storage that is missing, throws or holds garbage never breaks anything', () => {
  assert.equal(isLiveWordsDisabled(null, 1), false);
  disableLiveWords(null, 1, 'x');
  const broken: KeyValueStore = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  assert.equal(isLiveWordsDisabled(broken, 1), false);
  disableLiveWords(broken, 1, 'x');
  const garbage = memoryStore();
  garbage.setItem(LIVE_WORDS_OFF_KEY, '{not json');
  assert.equal(isLiveWordsDisabled(garbage, 1), false);
});

test('going to the background (phones mute capture then) is NOT a collision and is never remembered', () => {
  const now = 100_000;
  assert.equal(isCollision({ now, lastVisibilityChangeAt: 0, pageHidden: true }), false, 'hidden page');
  assert.equal(isCollision({ now, lastVisibilityChangeAt: now - (BACKGROUND_GRACE_MS - 500), pageHidden: false }), false, 'just came back');
  assert.equal(isCollision({ now, lastVisibilityChangeAt: now - (BACKGROUND_GRACE_MS + 500), pageHidden: false }), true, 'foreground, stream muted: a real collision');
});

test('live words that stay empty while the dreamer clearly speaks are called out; silence and arriving words reset the count', () => {
  let spoken = 0;
  for (let i = 0; i < 8; i += 1) spoken = nextStallSpeechMs(spoken, SPEECH_LEVEL + 0.2, 600, false);
  assert.ok(spoken >= STALL_SPEECH_MS, 'speaking for a while with no words = stalled');
  assert.equal(nextStallSpeechMs(spoken, 0.5, 600, true), 0, 'words arrived: not stalled');
  assert.equal(nextStallSpeechMs(1000, 0.01, 600, false), 1000, 'silence does not count as speech');
});

// ------------------------------------------------------------------ the screen
test('live words are no longer gated off on touch devices; they start only after the recording is confirmed, unless the device is remembered', () => {
  const hold = code('src/hero/HoldToRemember.tsx');
  assert.ok(!/isTouchPrimaryRef|hover: none/.test(hold), 'no touch-device switch-off remains');
  const confirmed = hold.slice(hold.indexOf('if (result === true) {'), hold.indexOf('} else {\n      const timedOut'));
  assert.match(confirmed, /setCentralMode\('recording'\)/);
  assert.match(confirmed, /isLiveWordsDisabled\(browserStore\(\), Date\.now\(\)\)/);
  assert.match(confirmed, /livePreview\.reset\(\);\s*setLiveSkipped\(true\)/, 'a remembered device starts clean: no words left over from an earlier recording');
  assert.match(confirmed, /livePreview\.start\(getAppLanguage\(\)\)/);
  assert.ok(confirmed.indexOf("setCentralMode('recording')") < confirmed.indexOf('livePreview.start'), 'recording first, live words second');
  // the recorder is never started, stopped or fed by the live words
  assert.ok(!/recorder\.(start|finish|reset)/.test(hold.slice(hold.indexOf('abortLivePreview('), hold.indexOf('abortLivePreview(') + 400)));
});

test('a stream interruption while the live words run switches them off and remembers the device; the recording is left alone', () => {
  const hold = code('src/hero/HoldToRemember.tsx');
  const handler = hold.slice(hold.indexOf('setInterruptionHandler((reason) =>'), hold.indexOf('return () => setInterruptionHandler(null)'));
  assert.match(handler, /'starting'/);
  assert.match(handler, /'live'/);
  assert.match(handler, /isCollision\(/);
  assert.match(handler, /abortLivePreview\(/);
  assert.match(handler, /disableLiveWords\(browserStore\(\), Date\.now\(\), reason\)/);
  assert.ok(!/recorder\.|finish|reset/.test(handler), 'the handler never touches the recorder');
});

test('the recording panel is honest: when live words are not running it says the transcript appears at the end, in both languages', () => {
  assert.equal(en.hold.liveWordsUnavailable, 'Recording in progress. Your words will appear when you finish.');
  assert.equal(he.hold.liveWordsUnavailable, 'ההקלטה מתבצעת. המילים יופיעו כשתסיימו.');
  const hold = code('src/hero/HoldToRemember.tsx');
  assert.match(hold, /centralMode === 'recording' && \(liveSkipped \|\| liveStalled \|\| livePreview\.status === 'unsupported' \|\| livePreview\.status === 'stopped'\)/);
  assert.match(hold, /\{liveNoteVisible && \(\s*<p className="central-live-note" role="status">\s*\{t\('hold\.liveWordsUnavailable'\)\}/);
  // and the note never promises live words
  assert.ok(!/live|בזמן אמת/i.test(en.hold.liveWordsUnavailable + he.hold.liveWordsUnavailable));
});

test('the dreamer\'s own words are never overwritten by a transcript, and the live words are only a fallback for an EMPTY box', () => {
  const hold = code('src/hero/HoldToRemember.tsx');
  // success: appended after words the dreamer wrote or edited; replaces only an untouched live fallback or an empty box
  assert.match(hold, /hasDreamText\(current\) && !entryIsLiveFallbackRef\.current\s*\?\s*`\$\{current\.trimEnd\(\)\}\\n\\n\$\{result\.transcript\}`\s*:\s*result\.transcript/);
  // the fallback fills only an empty box
  assert.match(hold, /if \(!hasDreamText\(heard\) \|\| hasDreamText\(entryRef\.current\)\) return false;/);
  // an edit ends the "untouched fallback" state
  assert.match(hold, /setEntry\(e\.target\.value\);\s*entryIsLiveFallbackRef\.current = false;/);
  // the recording is kept for a retry exactly as before
  assert.match(hold, /lastRecordingRef\.current = blob;\s*runTranscription\(blob\);/);
  assert.equal(hasDreamText('   '), false);
  assert.equal(he.hold.liveWordsKept.length > 20 && en.hold.liveWordsKept.length > 20, true);
});

test('a long dream cannot push the live text off the screen: its box scrolls; the note and the text keep their own lines', () => {
  const css = read('src/hero/HoldToRemember.css');
  const preview = css.slice(css.indexOf('.central-live-preview {'), css.indexOf('}', css.indexOf('.central-live-preview {')));
  assert.match(preview, /max-height: min\(5\.6em, 16vh\)/);
  assert.match(preview, /overflow-y: auto/);
  assert.match(preview, /overflow-wrap: anywhere/);
  assert.match(css, /\.central-live-note \{[^}]*width: 100%;[^}]*text-align: center;/);
});

test('the dream engine, packages, credits, payments and the typing path are untouched by live words', () => {
  for (const f of ['src/hero/liveWordsPolicy.ts', 'src/hero/livePreviewController.ts']) {
    assert.ok(!/payment|grow|make\.com|purchase|credit|fetch\(|dream-transcription/i.test(code(f)), f);
  }
  const entry = code('src/hero/dreamEntry.ts');
  assert.ok(!/live|speech/i.test(entry));
});
