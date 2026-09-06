import { useCallback, useRef, useState, type RefObject } from 'react';
import type { AudioTrackSnapshot, RecordingDiag } from './audioRecordingDiag';

export type RecordingState = 'idle' | 'requesting-permission' | 'recording' | 'paused' | 'finished' | 'error';

export interface AudioLevelState {
  /** Smoothed 0..1 amplitude of the live microphone input. */
  level: number;
}

interface DreamRecorderApi {
  recordingState: RecordingState;
  error: string | null;
  /** The same value as `error`, but readable synchronously right after
      `start()` resolves — a caller awaiting `start()` inside its own
      closure (see HoldToRemember.tsx's commitToListening) captured
      whatever `recorder` object existed BEFORE `start()` ran; reading
      `error` (React state) off that same stale closure afterwards still
      reflects its old value (null), since the state update that actually
      sets it happens on a later render this closure never re-runs to
      pick up. A ref mutates in place, so `.current` is always the true
      latest value regardless of which render's closure reads it. */
  errorRef: RefObject<string | null>;
  /** Updated every frame while recording; read directly by rAF loops to avoid re-renders. */
  audioLevelRef: RefObject<AudioLevelState>;
  durationMs: number;
  audioBlob: Blob | null;
  /** Diagnostic-only snapshot of the just-finished recording — populated
      every time regardless of ?audioDiag=1 (cheap: a handful of numbers
      and short strings, no behavioral effect), so the diagnostic panel
      simply reads whatever's here rather than needing its own parallel
      instrumentation. Null until a recording has actually completed once. */
  lastRecordingDiag: RecordingDiag | null;
  /**
   * Creates/resumes the AudioContext synchronously. Call this directly from
   * the real user gesture (pointerdown) — some mobile browsers (notably iOS
   * Safari) refuse to unlock audio from a delayed callback like a timeout,
   * even one that started inside a gesture.
   */
  primeAudio: () => void;
  /** Requests the mic and starts recording. Resolves false on denial/unavailability. */
  start: () => Promise<boolean>;
  finish: () => void;
  reset: () => void;
}

function getAudioContextCtor(): typeof AudioContext | null {
  const w = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function snapshotTrack(track: MediaStreamTrack | undefined): AudioTrackSnapshot | null {
  if (!track) return null;
  return {
    readyState: track.readyState,
    enabled: track.enabled,
    muted: track.muted,
    live: track.readyState === 'live',
  };
}

export function useDreamRecorder(): DreamRecorderApi {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<string | null>(null);
  const setErrorBoth = useCallback((value: string | null) => {
    errorRef.current = value;
    setError(value);
  }, []);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [lastRecordingDiag, setLastRecordingDiag] = useState<RecordingDiag | null>(null);

  const audioLevelRef = useRef<AudioLevelState>({ level: 0 });
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const rafRef = useRef(0);
  const startTimeRef = useRef(0);

  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    recorderRef.current = null;
  }, []);

  const primeAudio = useCallback(() => {
    const AudioCtxCtor = getAudioContextCtor();
    if (!AudioCtxCtor) return;
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioCtxCtor();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
  }, []);

  const runAnalyserLoop = useCallback(() => {
    function frame() {
      const analyser = analyserRef.current;
      const data = analyserDataRef.current;
      if (analyser && data) {
        analyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sumSquares += v * v;
        }
        const rms = Math.sqrt(sumSquares / data.length);
        const target = Math.min(1, rms * 4.2);
        const prev = audioLevelRef.current.level;
        audioLevelRef.current.level = prev + (target - prev) * 0.18;
      }
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    setErrorBoth(null);
    setRecordingState('requesting-permission');

    const AudioCtxCtor = getAudioContextCtor();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined' || !AudioCtxCtor) {
      setErrorBoth('unsupported');
      setRecordingState('error');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioCtxCtor();
      }
      const audioCtx = audioCtxRef.current;
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
      }
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      analyserRef.current = analyser;
      analyserDataRef.current = new Uint8Array(analyser.frequencyBinCount);

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];

      // Diagnostic-only bookkeeping (see audioRecordingDiag.ts) — never
      // read by the actual recording/transcription logic below, just
      // assembled into lastRecordingDiag once the clip finishes so a
      // real-device test can report exactly what MediaRecorder produced.
      const diagChunkSizes: number[] = [];
      const diagChunkTypes: string[] = [];
      const diagEvents: string[] = [];
      const t0 = performance.now();
      const logEvent = (label: string) => diagEvents.push(`+${Math.round(performance.now() - t0)}ms ${label}`);
      const audioTrack = stream.getAudioTracks()[0];
      const trackAtStart = snapshotTrack(audioTrack);

      recorder.onstart = () => {
        logEvent('onstart');
      };
      recorder.ondataavailable = (e) => {
        const size = e.data ? e.data.size : 0;
        const type = e.data ? e.data.type : '';
        diagChunkSizes.push(size);
        diagChunkTypes.push(type);
        logEvent(`ondataavailable size=${size} type=${type || '(none)'}`);
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onerror = (e) => {
        const err = (e as unknown as { error?: DOMException }).error;
        logEvent(`onerror: ${err ? err.name : 'unknown'}`);
      };
      recorder.onstop = () => {
        logEvent('onstop');
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setAudioBlob(blob);
        // Note: finish() calls recorder.stop() then teardown() SYNCHRONOUSLY,
        // while this onstop handler only fires asynchronously afterward —
        // so by now teardown() has already stopped every track. trackAtStop
        // / streamActiveAtStop below is genuinely "state after our own
        // teardown ran", not a live mid-recording snapshot; that's honest
        // and still useful (confirms teardown behaved), just not what
        // "at stop" might suggest at a glance — hence trackAtStart above
        // is the one that reflects the track's actual condition while
        // audio was really being captured.
        setLastRecordingDiag({
          requestedMimeType: mimeType || '(browser default)',
          actualMimeType: recorder.mimeType || '(unknown)',
          startedWithTimeslice: false,
          chunkSizes: diagChunkSizes,
          chunkTypes: diagChunkTypes,
          totalBytesFromChunks: diagChunkSizes.reduce((a, b) => a + b, 0),
          blobSize: blob.size,
          blobType: blob.type,
          durationMs: performance.now() - startTimeRef.current,
          trackAtStart,
          trackAtStop: snapshotTrack(audioTrack),
          streamActiveAtStop: stream.active,
          events: diagEvents,
        });
      };
      recorderRef.current = recorder;
      // No timeslice argument — see RecordingDiag.startedWithTimeslice's
      // doc comment for what that implies about ondataavailable timing.
      recorder.start();

      startTimeRef.current = performance.now();
      runAnalyserLoop();
      setRecordingState('recording');
      return true;
    } catch (err) {
      teardown();
      setErrorBoth(err instanceof Error ? err.name : 'unknown');
      setRecordingState('error');
      return false;
    }
  }, [runAnalyserLoop, teardown, setErrorBoth]);

  const finish = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setDurationMs(performance.now() - startTimeRef.current);
    teardown();
    setRecordingState('finished');
  }, [teardown]);

  const reset = useCallback(() => {
    teardown();
    chunksRef.current = [];
    audioLevelRef.current.level = 0;
    setAudioBlob(null);
    setLastRecordingDiag(null);
    setDurationMs(0);
    setErrorBoth(null);
    setRecordingState('idle');
  }, [teardown, setErrorBoth]);

  return {
    recordingState,
    error,
    errorRef,
    audioLevelRef,
    durationMs,
    audioBlob,
    lastRecordingDiag,
    primeAudio,
    start,
    finish,
    reset,
  };
}
