import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import type { HoldState } from './HoldState';
import type { CentralMode } from './centralMode';
import type { useDreamRecorder } from './useDreamRecorder';
import type { useSpeechTranscription } from './useSpeechTranscription';
import { createTextDreamInput, createVoiceDreamInput, type DreamInput } from './dreamInput';
import { logDiag, DIAG_SPEECH_ONLY } from './speechDiag';
import './HoldToRemember.css';

type DreamRecorderApi = ReturnType<typeof useDreamRecorder>;
type SpeechTranscriptionApi = ReturnType<typeof useSpeechTranscription>;

interface HoldToRememberProps {
  revealed: boolean;
  holdRef: RefObject<HoldState>;
  recorder: DreamRecorderApi;
  transcription: SpeechTranscriptionApi;
  centralMode: CentralMode;
  setCentralMode: (mode: CentralMode) => void;
  micUnavailable: boolean;
  setMicUnavailable: (v: boolean) => void;
  onTypedTranscriptChange: (text: string) => void;
  /** Fired once, with the normalized capture, the moment TYPE or RECORD
      genuinely completes (never on cancel). Nothing downstream is built
      yet — this only hands off the real captured dream for later stages. */
  onDreamCapture?: (input: DreamInput) => void;
  /** True once Dream Reconstruction begins — the whole capture UI (including the settled "I think I have it" text) dissolves away. */
  reconstructing?: boolean;
}

const FILL_MS = 800;
const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const FINISH_SETTLE_MS = 1100;
// Once the hold completes, the mic permission request (getUserMedia) can in
// principle sit unresolved indefinitely on a real device — a slow/obscured
// permission prompt, a browser that never surfaces one, etc. Before this,
// nothing bounded that wait: committedRef.current being true already blocks
// releasing the hold from cancelling anything (see endHold), and the
// TYPE/RECORD panels (with their own Close button) don't mount until the
// request actually settles — so a real hang left the dreamer stuck on
// "LISTENING…" with no visible way out. This timeout guarantees the UI
// always reaches a real state (recording, or a clear TYPE fallback) within
// a bounded wait, without changing anything about the 800ms hold itself.
const MIC_REQUEST_TIMEOUT_MS = 20000;

/** A specific, human-readable reason the mic didn't work — read from
    useDreamRecorder's own `error` (the real MediaDevices/MediaRecorder
    error name) rather than one generic "unavailable" message for every
    case, per the explicit ask to distinguish denied vs missing vs busy vs
    a request that never resolved at all. */
function describeMicUnavailable(errorName: string | null, timedOut: boolean): string {
  if (timedOut) return 'The microphone request took too long to respond.';
  switch (errorName) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'Microphone access was not allowed.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No microphone was found on this device.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Your microphone is being used by another app.';
    case 'unsupported':
      return "Voice recording isn't supported in this browser.";
    default:
      return 'The microphone is unavailable right now.';
  }
}

export default function HoldToRemember({
  revealed,
  holdRef,
  recorder,
  transcription,
  centralMode,
  setCentralMode,
  micUnavailable,
  setMicUnavailable,
  onTypedTranscriptChange,
  onDreamCapture,
  reconstructing = false,
}: HoldToRememberProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [entry, setEntry] = useState('');
  const [finishing, setFinishing] = useState(false);
  // The specific reason the mic fell back to TYPE (denied/missing/busy/
  // timed out/unsupported) — purely a local display concern, so this
  // doesn't need to be lifted to HeroDream.tsx alongside micUnavailable.
  const [micErrorMessage, setMicErrorMessage] = useState<string | null>(null);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const listenTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const micTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const committedRef = useRef(false);
  const finishingRef = useRef(false);
  // The real audio blob arrives asynchronously (MediaRecorder's onstop
  // fires after recordingState already flips to 'finished'), so the voice
  // DreamInput is only built once it genuinely exists — never guessed.
  const pendingVoiceCaptureRef = useRef(false);
  const capturedTranscriptRef = useRef<string | null>(null);

  const tick = useCallback(() => {
    const elapsed = performance.now() - startRef.current;
    const progress = Math.min(1, elapsed / FILL_MS);
    if (holdRef.current) holdRef.current.progress = progress;
    if (ringRef.current) {
      ringRef.current.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - progress));
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [holdRef]);

  const commitToListening = useCallback(async () => {
    logDiag('hold.committed', { diagSpeechOnly: DIAG_SPEECH_ONLY });
    setMicUnavailable(false);
    setMicErrorMessage(null);

    // DIAGNOSTIC ONLY (?diag=speechonly): isolates SpeechRecognition from
    // useDreamRecorder/MediaRecorder entirely — the mic is never opened by
    // the recorder at all — to prove or disprove whether the two are
    // contending for the microphone/audio session on a real device. Off by
    // default; the normal path below (both recorder AND transcription) is
    // completely unchanged when this flag is absent.
    if (DIAG_SPEECH_ONLY) {
      logDiag('diag.speechonly-mode-active — recorder.start() skipped entirely');
      if (holdRef.current) holdRef.current.active = false;
      transcription.reset();
      transcription.start();
      setCentralMode('recording');
      return;
    }

    // Races the real permission/recording request against a bounded
    // timeout — see MIC_REQUEST_TIMEOUT_MS above for why this exists.
    // `settled` is read inside startPromise's own .then, after the race
    // has already resolved one way or the other, to decide whether a
    // request that finishes granted AFTER the timeout already gave up
    // should still be torn down (never leave a live mic stream running
    // unseen in the background once the UI has already moved on).
    let settled = false;
    const startPromise = recorder.start().then((granted) => {
      if (settled && granted) recorder.reset();
      return granted;
    });
    const timedOutPromise = new Promise<'timeout'>((resolve) => {
      micTimeoutRef.current = setTimeout(() => resolve('timeout'), MIC_REQUEST_TIMEOUT_MS);
    });
    const result = await Promise.race([startPromise, timedOutPromise]);
    settled = true;
    clearTimeout(micTimeoutRef.current);
    logDiag('hold.recorder-race-settled', { result });

    if (result === true) {
      if (holdRef.current) holdRef.current.active = false;
      logDiag('hold.calling-transcription.start()');
      transcription.reset();
      transcription.start();
      setCentralMode('recording');
    } else {
      const timedOut = result === 'timeout';
      if (holdRef.current) {
        holdRef.current.active = false;
        holdRef.current.progress = 0;
      }
      setIsListening(false);
      setMicUnavailable(true);
      setMicErrorMessage(describeMicUnavailable(recorder.errorRef.current, timedOut));
      setCentralMode('typing');
    }
  }, [recorder, transcription, holdRef, setCentralMode, setMicUnavailable]);

  const beginHold = useCallback(() => {
    if (centralMode !== 'hold' || committedRef.current) return;
    // Unlock audio synchronously within this real gesture — iOS Safari in
    // particular refuses to do this from the delayed commit below.
    recorder.primeAudio();
    const btn = buttonRef.current;
    if (btn && holdRef.current) {
      const rect = btn.getBoundingClientRect();
      holdRef.current.cx = rect.left + rect.width / 2;
      holdRef.current.cy = rect.top + rect.height / 2;
      holdRef.current.active = true;
      holdRef.current.progress = 0;
    }
    startRef.current = performance.now();
    setIsHolding(true);
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    listenTimerRef.current = setTimeout(() => {
      committedRef.current = true;
      setIsListening(true);
      commitToListening();
    }, FILL_MS);
  }, [centralMode, holdRef, tick, commitToListening, recorder]);

  const endHold = useCallback(() => {
    if (!holdRef.current?.active) return;
    setIsHolding(false);

    if (committedRef.current) {
      // The ritual already completed — releasing now is a no-op for the
      // listening state itself, which continues regardless.
      return;
    }

    setIsListening(false);
    holdRef.current.active = false;
    clearTimeout(listenTimerRef.current);
    cancelAnimationFrame(rafRef.current);

    const decay = () => {
      if (!holdRef.current) return;
      holdRef.current.progress *= 0.9;
      if (ringRef.current) {
        const p = holdRef.current.progress;
        ringRef.current.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - p));
      }
      if (holdRef.current.progress > 0.01) {
        rafRef.current = requestAnimationFrame(decay);
      } else if (holdRef.current) {
        holdRef.current.progress = 0;
        if (ringRef.current) ringRef.current.style.strokeDashoffset = String(CIRCUMFERENCE);
      }
    };
    rafRef.current = requestAnimationFrame(decay);
  }, [holdRef]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      clearTimeout(listenTimerRef.current);
      clearTimeout(micTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (centralMode === 'typing') {
      textareaRef.current?.focus();
    }
  }, [centralMode]);

  // Live voice-reactive breathing: mirrors the mic level into the shared
  // holdRef (MemoryVeil reads it) and the ambient listening orb, every frame.
  useEffect(() => {
    if (centralMode !== 'recording') return;
    if (holdRef.current) holdRef.current.listening = true;
    let raf = 0;
    function frame() {
      const level = recorder.audioLevelRef.current?.level ?? 0;
      if (holdRef.current) holdRef.current.audioLevel = level;
      if (orbRef.current) {
        orbRef.current.style.transform = `scale(${(1 + level * 0.32).toFixed(3)})`;
        orbRef.current.style.opacity = (0.45 + level * 0.5).toFixed(3);
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [centralMode, recorder.audioLevelRef, holdRef]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && !isHolding) {
      e.preventDefault();
      beginHold();
    }
  };
  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      endHold();
    }
  };

  const handleEntryChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setEntry(e.target.value);
    onTypedTranscriptChange(e.target.value);
  };

  const handleBack = () => {
    committedRef.current = false;
    setMicUnavailable(false);
    setMicErrorMessage(null);
    setCentralMode('hold');
    setEntry('');
    onTypedTranscriptChange('');
    transcription.reset();
  };

  const handleDoneTyping = () => {
    onDreamCapture?.(createTextDreamInput(entry));
    setCentralMode('settled');
  };

  // CANCEL — not FINISH. Discards whatever is in progress (typed text, or
  // the live recording + its transcript) and returns to the original hero
  // state. Never advances to 'settled', never triggers reconstruction.
  const handleClose = useCallback(() => {
    if (centralMode === 'recording') {
      // reset() (not finish()) stops the MediaRecorder, stops every mic
      // MediaStream track, and closes the AudioContext — the browser's mic
      // indicator goes away because the tracks are actually stopped.
      recorder.reset();
      transcription.stop();
      transcription.reset();
      if (holdRef.current) {
        holdRef.current.active = false;
        holdRef.current.listening = false;
        holdRef.current.progress = 0;
        holdRef.current.audioLevel = 0;
      }
      committedRef.current = false;
      finishingRef.current = false;
      setFinishing(false);
      setIsListening(false);
      setIsHolding(false);
    } else if (centralMode === 'typing') {
      committedRef.current = false;
      setEntry('');
      onTypedTranscriptChange('');
      transcription.reset();
    } else {
      return;
    }
    setMicUnavailable(false);
    setMicErrorMessage(null);
    setCentralMode('hold');
  }, [centralMode, recorder, transcription, holdRef, onTypedTranscriptChange, setCentralMode, setMicUnavailable]);

  useEffect(() => {
    if (centralMode !== 'recording' && centralMode !== 'typing') return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [centralMode, handleClose]);

  const handleFinishDream = useCallback(() => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    capturedTranscriptRef.current = transcription.fullTranscript || null;
    pendingVoiceCaptureRef.current = true;
    recorder.finish();
    transcription.stop();

    const startLevel = holdRef.current?.audioLevel ?? 0;
    const t0 = performance.now();
    function decay(now: number) {
      const t = Math.min(1, (now - t0) / FINISH_SETTLE_MS);
      if (holdRef.current) holdRef.current.audioLevel = startLevel * (1 - t);
      if (t < 1) {
        requestAnimationFrame(decay);
      } else {
        if (holdRef.current) {
          holdRef.current.listening = false;
          holdRef.current.active = false;
        }
        setCentralMode('settled');
      }
    }
    requestAnimationFrame(decay);
  }, [recorder, transcription, holdRef, setCentralMode]);

  // The real audio blob shows up asynchronously via MediaRecorder's onstop,
  // after handleFinishDream already returns — hand off the voice DreamInput
  // only once it's genuinely ready, never before.
  useEffect(() => {
    if (!pendingVoiceCaptureRef.current || recorder.audioBlob === null) return;
    pendingVoiceCaptureRef.current = false;
    onDreamCapture?.(
      createVoiceDreamInput({
        transcript: capturedTranscriptRef.current,
        audioBlob: recorder.audioBlob,
        language: null,
        transcriptionSupported: transcription.supported,
      }),
    );
  }, [recorder.audioBlob, onDreamCapture, transcription.supported]);

  const isHoldFaded = centralMode !== 'hold';
  const requestingMic = recorder.recordingState === 'requesting-permission';

  return (
    <div className={`hold-to-remember${revealed ? ' is-revealed' : ''} is-mode-${centralMode}${reconstructing ? ' is-reconstructing' : ''}`}>
      <button
        ref={buttonRef}
        type="button"
        className={`htr-circle${isHolding ? ' is-holding' : ''}${isListening ? ' is-listening' : ''}`}
        data-cursor-hover
        tabIndex={isHoldFaded ? -1 : 0}
        aria-hidden={isHoldFaded}
        onPointerDown={(e) => {
          e.preventDefault();
          beginHold();
        }}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onPointerCancel={endHold}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        aria-label="Hold to tell me about your dream"
      >
        <svg className="htr-ring" viewBox="0 0 96 96" aria-hidden="true">
          <circle className="htr-ring-track" cx="48" cy="48" r={RADIUS} />
          <circle
            ref={ringRef}
            className="htr-ring-fill"
            cx="48"
            cy="48"
            r={RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE}
          />
        </svg>

        <span className="htr-waveform" aria-hidden="true">
          {Array.from({ length: 7 }).map((_, i) => (
            <span key={i} className="htr-bar" style={{ '--bi': i } as CSSProperties} />
          ))}
        </span>

        <span className="htr-label">
          {requestingMic ? (
            <>
              LISTENING…
              <span className="htr-privacy-note">Your dream stays yours.</span>
            </>
          ) : isListening ? (
            'LISTENING…'
          ) : (
            'HOLD TO TELL ME'
          )}
        </span>
      </button>

      <button
        type="button"
        className="htr-type-link"
        data-cursor-hover
        tabIndex={isHoldFaded ? -1 : 0}
        aria-hidden={isHoldFaded}
        onClick={() => setCentralMode('typing')}
      >
        I&rsquo;D RATHER TYPE
      </button>

      <div
        className={`central-recording${centralMode === 'recording' ? ' is-active' : ''}${finishing ? ' is-finishing' : ''}`}
        aria-hidden={centralMode !== 'recording'}
      >
        <button
          type="button"
          className="htr-close"
          data-cursor-hover
          tabIndex={centralMode === 'recording' && !finishing ? 0 : -1}
          onClick={handleClose}
          aria-label="Cancel recording"
        >
          ×
        </button>
        <p className="central-recording-heading">I&rsquo;M LISTENING.</p>
        <p className="central-recording-subheading">TELL ME EVERYTHING YOU REMEMBER.</p>
        <div ref={orbRef} className="central-recording-orb" aria-hidden="true" />
        {transcription.fullTranscript && (
          <p className="central-transcript" dir="auto">
            {transcription.fullTranscript}
          </p>
        )}
        {!transcription.supported && centralMode === 'recording' && (
          <p className="central-mic-note">LIVE TRANSCRIPT UNAVAILABLE IN THIS BROWSER</p>
        )}
        {transcription.supported && centralMode === 'recording' && transcription.error && (
          <p className="central-mic-note" role="status">
            I couldn&rsquo;t hear that. Try again, or close and type your dream instead.
          </p>
        )}
        <button
          type="button"
          className="central-finish"
          data-cursor-hover
          tabIndex={centralMode === 'recording' && !finishing ? 0 : -1}
          onClick={handleFinishDream}
        >
          FINISH DREAM
        </button>
      </div>

      <div
        className={`central-typing${centralMode === 'typing' ? ' is-active' : ''}`}
        aria-hidden={centralMode !== 'typing'}
      >
        <button
          type="button"
          className="htr-close"
          data-cursor-hover
          tabIndex={centralMode === 'typing' ? 0 : -1}
          onClick={handleClose}
          aria-label="Cancel typing"
        >
          ×
        </button>
        {micUnavailable && (
          <p className="central-mic-note">
            {micErrorMessage ?? 'The microphone is unavailable right now.'}
            <br />
            Type what you remember instead.
          </p>
        )}
        <p className="central-typing-heading">TELL ME WHAT HAPPENED.</p>
        <textarea
          ref={textareaRef}
          className="central-typing-textarea"
          placeholder="Start with anything you remember..."
          value={entry}
          onChange={handleEntryChange}
          tabIndex={centralMode === 'typing' ? 0 : -1}
          rows={4}
          dir="auto"
        />
        <div className="central-typing-actions">
          <button
            type="button"
            className="central-back"
            data-cursor-hover
            tabIndex={centralMode === 'typing' ? 0 : -1}
            onClick={handleBack}
          >
            ← Back
          </button>
          <button
            type="button"
            className="central-done"
            data-cursor-hover
            tabIndex={centralMode === 'typing' ? 0 : -1}
            onClick={handleDoneTyping}
          >
            I&rsquo;M DONE
          </button>
        </div>
      </div>

      <div
        className={`central-settled${centralMode === 'settled' ? ' is-active' : ''}`}
        aria-hidden={centralMode !== 'settled'}
      >
        <p className="central-settled-text">I THINK I HAVE IT.</p>
        <p className="central-settled-text central-settled-text--second">LET ME PUT IT BACK TOGETHER.</p>
      </div>
    </div>
  );
}
