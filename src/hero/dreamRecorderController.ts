/**
 * The microphone lifecycle behind useDreamRecorder, as a plain class so its
 * real MediaStream / MediaRecorder / AudioContext handling can be tested
 * without a browser (the environment is injected). The hook is a thin React
 * wrapper around one of these.
 *
 * The rule this class exists to enforce: whoever owns the recorder owns the
 * microphone. `dispose()` (called when the owning component unmounts — for
 * any reason: navigation, going home, a screen change) stops the
 * MediaRecorder, every MediaStream track and the AudioContext, and makes any
 * request that is still waiting on the browser (a permission prompt, the
 * recorder's own onstart) release whatever it eventually receives instead of
 * adopting it. `reset()` does the same invalidation for an in-flight start.
 */

export type RecordingState = 'idle' | 'requesting-permission' | 'recording' | 'paused' | 'finished' | 'error';

export interface AudioLevelState {
  /** Smoothed 0..1 amplitude of the live microphone input. */
  level: number;
}

export interface RecorderListener {
  onState: (state: RecordingState) => void;
  onError: (error: string | null) => void;
  onBlob: (blob: Blob | null) => void;
  onDuration: (ms: number) => void;
}

export interface RecorderEnv {
  getUserMedia: ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | null;
  MediaRecorderCtor: typeof MediaRecorder | null;
  AudioContextCtor: typeof AudioContext | null;
  requestFrame: (cb: FrameRequestCallback) => number;
  cancelFrame: (id: number) => void;
  now: () => number;
  /** The ids of the audio INPUT devices the browser knows about (never the virtual "default"/"communications" aliases). Optional. */
  listAudioInputs?: (() => Promise<string[]>) | null;
}

// onstart fires essentially immediately after MediaRecorder.start() on a
// genuinely working recorder — this only bounds the pathological case
// where it never fires at all, so that case fails the same way any other
// real failure does rather than hanging forever.
export const RECORDER_ONSTART_TIMEOUT_MS = 4000;

/** How long start() waits for a suspended AudioContext to resume. The context only drives the live level meter; some mobile
    browsers leave resume() pending forever outside a gesture, which must never hold the recording hostage. */
export const AUDIO_RESUME_WAIT_MS = 500;

/** Formats tried in order; the first this browser can record wins (Chrome/Firefox/Edge: webm, Safari/iOS: mp4, then ogg). The
    server accepts every one of them. '' = let the browser choose its own default. */
export const RECORDER_MIME_CANDIDATES = ['audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export function pickRecorderMimeType(ctor: { isTypeSupported(type: string): boolean }): string {
  for (const type of RECORDER_MIME_CANDIDATES) {
    try {
      if (ctor.isTypeSupported(type)) return type;
    } catch {
      // A browser whose isTypeSupported throws: fall through to the next candidate / the default format.
    }
  }
  return '';
}

/** The default microphone could not be opened for a DEVICE reason (not a refused permission): worth trying the other inputs. */
const DEVICE_FALLBACK_ERRORS: ReadonlySet<string> = new Set(['NotFoundError', 'DevicesNotFoundError', 'NotReadableError', 'TrackStartError', 'OverconstrainedError', 'ConstraintNotSatisfiedError', 'AbortError']);
export const MAX_DEVICE_FALLBACKS = 4;

export function browserRecorderEnv(): RecorderEnv {
  const w = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  return {
    getUserMedia: navigator.mediaDevices?.getUserMedia ? (c) => navigator.mediaDevices.getUserMedia(c) : null,
    MediaRecorderCtor: typeof MediaRecorder === 'undefined' ? null : MediaRecorder,
    AudioContextCtor: w.AudioContext ?? w.webkitAudioContext ?? null,
    requestFrame: (cb) => requestAnimationFrame(cb),
    cancelFrame: (id) => cancelAnimationFrame(id),
    now: () => performance.now(),
    listAudioInputs: navigator.mediaDevices?.enumerateDevices
      ? async () =>
          (await navigator.mediaDevices.enumerateDevices())
            .filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
            .map((d) => d.deviceId)
      : null,
  };
}

function stopTracks(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Why the microphone stream stopped delivering while a recording was open: 'muted' = the browser/OS took the input away (another
    capture started, a call, the page went to the background), 'ended' = the input is gone for good. */
export type CaptureInterruption = 'muted' | 'ended';

export class DreamRecorderController {
  /** Same value as the last onError, readable synchronously right after start() resolves (see useDreamRecorder). */
  readonly errorRef: { current: string | null } = { current: null };
  /** Updated every frame while recording; read directly by rAF loops. */
  readonly audioLevelRef: { current: AudioLevelState } = { current: { level: 0 } };

  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserData: Uint8Array<ArrayBuffer> | null = null;
  private raf = 0;
  private startTime = 0;
  /** Bumped by reset()/dispose(): a start() that began under an older value is abandoned. */
  private generation = 0;
  private disposed = false;
  /** Releases a start() that is waiting on the recorder's own onstart (called by reset()/dispose()). */
  private settleStartWait: ((ok: boolean) => void) | null = null;
  /** Told when the live microphone stream stops delivering audio (see CaptureInterruption). Observational only: it never
      touches the recording. */
  private interruptionHandler: ((reason: CaptureInterruption) => void) | null = null;
  private unwatchTracks: (() => void) | null = null;

  private readonly env: RecorderEnv;
  private readonly listener: RecorderListener;

  constructor(env: RecorderEnv, listener: RecorderListener) {
    this.env = env;
    this.listener = listener;
  }

  private setError(value: string | null): void {
    this.errorRef.current = value;
    this.listener.onError(value);
  }

  private isStale(generation: number): boolean {
    return this.disposed || generation !== this.generation;
  }

  private teardown(): void {
    this.unwatchTracks?.();
    this.unwatchTracks = null;
    this.env.cancelFrame(this.raf);
    stopTracks(this.stream);
    this.stream = null;
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
    }
    this.audioCtx = null;
    this.analyser = null;
    this.recorder = null;
  }

  /** Registers (or clears, with null) the one listener told when the microphone stream is muted or ended mid-recording. */
  setInterruptionHandler = (handler: ((reason: CaptureInterruption) => void) | null): void => {
    this.interruptionHandler = handler;
  };

  /** Watches the audio tracks of the recording stream. Purely observational (listeners only report); a stream that cannot be
      watched (no addEventListener) is simply not watched. */
  private watchTracks(stream: MediaStream): void {
    const tracks = typeof stream.getAudioTracks === 'function' ? stream.getAudioTracks() : [];
    const cleanups: Array<() => void> = [];
    for (const track of tracks) {
      if (typeof track.addEventListener !== 'function') continue;
      const onMute = () => this.interruptionHandler?.('muted');
      const onEnded = () => this.interruptionHandler?.('ended');
      track.addEventListener('mute', onMute);
      track.addEventListener('ended', onEnded);
      cleanups.push(() => {
        track.removeEventListener('mute', onMute);
        track.removeEventListener('ended', onEnded);
      });
    }
    this.unwatchTracks = () => cleanups.forEach((c) => c());
  }

  /** Releases a stream/recorder an abandoned start() had already acquired. */
  private abandon(stream: MediaStream, recorder: MediaRecorder | null): void {
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onstart = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          // Already stopping — the tracks below are what actually free the mic.
        }
      }
    }
    stopTracks(stream);
    if (this.stream === stream) this.stream = null;
    if (this.disposed) this.teardown();
  }

  /**
   * Opens the microphone. The browser's default input first; if THAT fails for a device reason (not found, in use, no longer
   * available — e.g. the default is a headset that is switched off or held by another app, or a disabled virtual device), each
   * other input the browser lists is tried in turn (a few at most), so a working microphone is not ignored just because the
   * default one is not. A refused permission is never retried. If nothing works, the FIRST error is the one reported.
   */
  private async acquireStream(getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>, generation: number): Promise<MediaStream> {
    try {
      return await getUserMedia({ audio: true });
    } catch (first) {
      const name = first instanceof Error ? first.name : '';
      const list = this.env.listAudioInputs;
      if (!DEVICE_FALLBACK_ERRORS.has(name) || !list) throw first;
      let ids: string[];
      try {
        ids = await list();
      } catch {
        throw first;
      }
      for (const id of ids.slice(0, MAX_DEVICE_FALLBACKS)) {
        if (this.isStale(generation)) throw first;
        try {
          return await getUserMedia({ audio: { deviceId: { exact: id } } });
        } catch {
          // try the next input
        }
      }
      throw first;
    }
  }

  /**
   * Creates/resumes the AudioContext synchronously. Call this directly from
   * the real user gesture (pointerdown) — some mobile browsers (notably iOS
   * Safari) refuse to unlock audio from a delayed callback like a timeout.
   */
  primeAudio = (): void => {
    const Ctor = this.env.AudioContextCtor;
    if (!Ctor || this.disposed) return;
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new Ctor();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  };

  private runAnalyserLoop(): void {
    const frame = () => {
      const analyser = this.analyser;
      const data = this.analyserData;
      if (analyser && data) {
        analyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sumSquares += v * v;
        }
        const rms = Math.sqrt(sumSquares / data.length);
        const target = Math.min(1, rms * 4.2);
        const prev = this.audioLevelRef.current.level;
        this.audioLevelRef.current.level = prev + (target - prev) * 0.18;
      }
      this.raf = this.env.requestFrame(frame);
    };
    this.raf = this.env.requestFrame(frame);
  }

  /** Requests the mic and starts recording. Only resolves true once
      MediaRecorder's own `onstart` confirms capture has genuinely begun.
      Resolves false on denial/unavailability, on a missing confirmation, or
      when this start was abandoned by reset()/dispose() while waiting — in
      which case everything it acquired has already been released. */
  start = async (): Promise<boolean> => {
    const generation = this.generation;
    this.setError(null);
    this.listener.onState('requesting-permission');

    const { getUserMedia, MediaRecorderCtor, AudioContextCtor } = this.env;
    // The microphone and the recorder are required. The AudioContext is NOT: it only draws the live level meter, so a browser
    // without it (or one where it fails) still records.
    if (!getUserMedia || !MediaRecorderCtor) {
      // getUserMedia is also absent on any page that is not served securely (plain http), which is a different fix for the dreamer.
      const secure = typeof window === 'undefined' || window.isSecureContext !== false;
      this.setError(!getUserMedia ? (secure ? 'unsupported' : 'insecure-context') : 'recorder-unsupported');
      this.listener.onState('error');
      return false;
    }

    // Which step is running, so a failure is reported as what it was (a refused permission is not a recorder that cannot be created).
    type Stage = 'getUserMedia' | 'recorder-create' | 'recorder-start';
    let stage: Stage = 'getUserMedia';
    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    try {
      stream = await this.acquireStream(getUserMedia, generation);
      // The dreamer may have left (or reset) while the permission prompt was
      // open: never adopt a stream nobody is waiting for.
      if (this.isStale(generation)) {
        stopTracks(stream);
        return false;
      }
      this.stream = stream;

      // The level meter: best effort, never allowed to block or fail the recording.
      if (AudioContextCtor) {
        try {
          if (!this.audioCtx || this.audioCtx.state === 'closed') {
            this.audioCtx = new AudioContextCtor();
          }
          const audioCtx = this.audioCtx;
          if (audioCtx.state === 'suspended') {
            await Promise.race([audioCtx.resume().catch(() => {}), new Promise<void>((resolve) => setTimeout(resolve, AUDIO_RESUME_WAIT_MS))]);
            if (this.isStale(generation)) {
              this.abandon(stream, null);
              return false;
            }
          }
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.6;
          source.connect(analyser);
          this.analyser = analyser;
          this.analyserData = new Uint8Array(analyser.frequencyBinCount);
        } catch {
          this.analyser = null;
          this.analyserData = null;
        }
      }

      stage = 'recorder-create';
      const mimeType = pickRecorderMimeType(MediaRecorderCtor);
      try {
        recorder = mimeType ? new MediaRecorderCtor(stream, { mimeType }) : new MediaRecorderCtor(stream);
      } catch (first) {
        // The chosen format was refused at construction: let the browser pick its own default before giving up.
        if (!mimeType) throw first;
        recorder = new MediaRecorderCtor(stream);
      }
      const rec = recorder;
      this.chunks = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.chunks.push(e.data);
      };
      rec.onstop = () => {
        this.listener.onBlob(new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' }));
      };
      this.recorder = rec;

      // The UI only shows "I'M LISTENING." once this resolves true, so it must
      // not resolve on the strength of calling recorder.start() alone.
      stage = 'recorder-start';
      const reallyStarted = await new Promise<boolean>((resolve) => {
        let settled = false;
        const timer = setTimeout(() => settle(false), RECORDER_ONSTART_TIMEOUT_MS);
        const settle = (ok: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (this.settleStartWait === settle) this.settleStartWait = null;
          resolve(ok);
        };
        this.settleStartWait = settle;
        rec.onstart = () => settle(true);
        rec.onerror = () => settle(false);
        try {
          rec.start();
        } catch {
          settle(false);
        }
      });

      if (this.isStale(generation)) {
        this.abandon(stream, rec);
        return false;
      }
      if (!reallyStarted) {
        this.teardown();
        this.setError('start-not-confirmed');
        this.listener.onState('error');
        return false;
      }

      this.startTime = this.env.now();
      this.watchTracks(stream);
      this.runAnalyserLoop();
      this.listener.onState('recording');
      return true;
    } catch (err) {
      if (stream && this.stream !== stream) stopTracks(stream);
      if (this.isStale(generation)) {
        if (stream) this.abandon(stream, recorder);
        return false;
      }
      this.teardown();
      const name = err instanceof Error ? err.name : 'unknown';
      // The permission/device step keeps the browser's own error name; later steps say which one failed.
      this.setError(stage === 'getUserMedia' ? name : `${stage}:${name}`);
      this.listener.onState('error');
      return false;
    }
  };

  finish = (): void => {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
    this.listener.onDuration(this.env.now() - this.startTime);
    this.teardown();
    this.listener.onState('finished');
  };

  reset = (): void => {
    this.generation += 1;
    this.settleStartWait?.(false);
    this.teardown();
    this.chunks = [];
    this.audioLevelRef.current.level = 0;
    this.listener.onBlob(null);
    this.listener.onDuration(0);
    this.setError(null);
    this.listener.onState('idle');
  };

  /** The owner is going away: release the microphone and never emit again. */
  dispose = (): void => {
    this.disposed = true;
    this.generation += 1;
    this.settleStartWait?.(false);
    const rec = this.recorder;
    if (rec) {
      rec.ondataavailable = null;
      rec.onstop = null;
      rec.onstart = null;
      rec.onerror = null;
      if (rec.state !== 'inactive') {
        try {
          rec.stop();
        } catch {
          // Already stopping.
        }
      }
    }
    this.teardown();
  };

  /** Re-arms a disposed controller — React StrictMode runs a mount's cleanup
      and then its setup again on the SAME instance. */
  revive = (): void => {
    this.disposed = false;
  };
}
