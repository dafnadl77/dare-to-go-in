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
}

// onstart fires essentially immediately after MediaRecorder.start() on a
// genuinely working recorder — this only bounds the pathological case
// where it never fires at all, so that case fails the same way any other
// real failure does rather than hanging forever.
export const RECORDER_ONSTART_TIMEOUT_MS = 4000;

export function browserRecorderEnv(): RecorderEnv {
  const w = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  return {
    getUserMedia: navigator.mediaDevices?.getUserMedia ? (c) => navigator.mediaDevices.getUserMedia(c) : null,
    MediaRecorderCtor: typeof MediaRecorder === 'undefined' ? null : MediaRecorder,
    AudioContextCtor: w.AudioContext ?? w.webkitAudioContext ?? null,
    requestFrame: (cb) => requestAnimationFrame(cb),
    cancelFrame: (id) => cancelAnimationFrame(id),
    now: () => performance.now(),
  };
}

function stopTracks(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

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
    if (!getUserMedia || !MediaRecorderCtor || !AudioContextCtor) {
      this.setError('unsupported');
      this.listener.onState('error');
      return false;
    }

    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    try {
      stream = await getUserMedia({ audio: true });
      // The dreamer may have left (or reset) while the permission prompt was
      // open: never adopt a stream nobody is waiting for.
      if (this.isStale(generation)) {
        stopTracks(stream);
        return false;
      }
      this.stream = stream;

      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioContextCtor();
      }
      const audioCtx = this.audioCtx;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
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

      const mimeType = MediaRecorderCtor.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorderCtor.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      recorder = mimeType ? new MediaRecorderCtor(stream, { mimeType }) : new MediaRecorderCtor(stream);
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
        rec.start();
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
      this.setError(err instanceof Error ? err.name : 'unknown');
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
