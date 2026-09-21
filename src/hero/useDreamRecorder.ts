import { useEffect, useState, type RefObject } from 'react';
import {
  DreamRecorderController,
  browserRecorderEnv,
  type AudioLevelState,
  type RecordingState,
} from './dreamRecorderController';

export type { AudioLevelState, RecordingState };

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
  /**
   * Creates/resumes the AudioContext synchronously. Call this directly from
   * the real user gesture (pointerdown) — some mobile browsers (notably iOS
   * Safari) refuse to unlock audio from a delayed callback like a timeout,
   * even one that started inside a gesture.
   */
  primeAudio: () => void;
  /** Requests the mic and starts recording. Only resolves true once
      MediaRecorder's own `onstart` event confirms capture has genuinely
      begun — never on the strength of calling `.start()` alone. Resolves
      false on denial/unavailability, or if that confirmation never
      arrives within a bounded wait. */
  start: () => Promise<boolean>;
  finish: () => void;
  reset: () => void;
}

/**
 * React wrapper around DreamRecorderController (see it for the actual
 * microphone handling). The owner of this hook owns the microphone: when the
 * component using it unmounts — for any reason — the controller is disposed,
 * which stops the recorder, every MediaStream track and the AudioContext, so
 * the browser's recording indicator can never be left on.
 */
export function useDreamRecorder(): DreamRecorderApi {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [durationMs, setDurationMs] = useState(0);

  const [controller] = useState(
    () =>
      new DreamRecorderController(browserRecorderEnv(), {
        onState: setRecordingState,
        onError: setError,
        onBlob: setAudioBlob,
        onDuration: setDurationMs,
      }),
  );

  useEffect(() => {
    controller.revive();
    return () => controller.dispose();
  }, [controller]);

  return {
    recordingState,
    error,
    errorRef: controller.errorRef,
    audioLevelRef: controller.audioLevelRef,
    durationMs,
    audioBlob,
    primeAudio: controller.primeAudio,
    start: controller.start,
    finish: controller.finish,
    reset: controller.reset,
  };
}
