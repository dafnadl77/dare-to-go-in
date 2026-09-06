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
import { createTextDreamInput, type DreamInput } from './dreamInput';
import { transcribeDreamAudio } from './dreamTranscription';
import { getAppLanguage } from './appLanguage';
import { useLivePreviewTranscript } from './useLivePreviewTranscript';
import './HoldToRemember.css';

type DreamRecorderApi = ReturnType<typeof useDreamRecorder>;

interface HoldToRememberProps {
  revealed: boolean;
  holdRef: RefObject<HoldState>;
  recorder: DreamRecorderApi;
  centralMode: CentralMode;
  setCentralMode: (mode: CentralMode) => void;
  micUnavailable: boolean;
  setMicUnavailable: (v: boolean) => void;
  onTypedTranscriptChange: (text: string) => void;
  /** Fired once, with the normalized capture, the moment TYPE (typed
      directly, or reviewed after a spoken recording was transcribed)
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
// Once the hold completes, the mic permission request (getUserMedia, plus
// MediaRecorder actually confirming it started — see useDreamRecorder's
// own onstart-gated start()) can in principle sit unresolved indefinitely
// on a real device — a slow/obscured permission prompt, a browser that
// never surfaces one, etc. Before this, nothing bounded that wait:
// committedRef.current being true already blocks releasing the hold from
// cancelling anything (see endHold), and the TYPE/RECORD panels (with
// their own Close button) don't mount until the request actually settles
// — so a real hang left the dreamer stuck on "LISTENING…" with no visible
// way out. This timeout guarantees the UI always reaches a real state
// (recording, or a clear TYPE fallback) within a bounded wait, without
// changing anything about the 800ms hold itself.
const MIC_REQUEST_TIMEOUT_MS = 20000;
// Bounds the OpenAI transcription round-trip the same way — a slow
// network or a stalled response must not leave the dreamer staring at
// "TRANSCRIBING…" forever with no way out.
const TRANSCRIPTION_TIMEOUT_MS = 30000;

const TRANSCRIPTION_FAILED_MESSAGE = "I couldn't transcribe that. Try again or type your dream.";

/** One of exactly two messages: the mic itself couldn't be reached (any
    getUserMedia-stage failure — denied, no device, busy, unsupported —
    or the request timing out), or it was reached but MediaRecorder never
    confirmed it actually started recording ('start-not-confirmed', from
    useDreamRecorder). Never show "I'm listening" without a real,
    confirmed recording, and be honest about which stage actually failed.
    Both land the dreamer in TYPE with an immediately usable, focused,
    empty textarea — never a silent dead end. */
function describeRecordingFailure(errorName: string | null, timedOut: boolean): string {
  if (!timedOut && errorName === 'start-not-confirmed') {
    return "I couldn't start listening.";
  }
  return "I couldn't access your microphone.";
}

export default function HoldToRemember({
  revealed,
  holdRef,
  recorder,
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
  const rippleRef = useRef<HTMLDivElement>(null);
  // Touch-primary devices (phones/tablets) can't reliably run browser
  // SpeechRecognition alongside the MediaRecorder capture already holding
  // the microphone — confirmed against Chromium's own long-standing,
  // still-open issue (Blink>Speech, OS:Android — getUserMedia "hijacks"
  // the audio stream so SpeechRecognition never receives it) and matches
  // the exact real-device symptom reported: recording works, no live
  // words ever appear, no error. Desktop is unaffected — this only ever
  // reads true on a device with no persistent pointer, matching the same
  // `(hover: none)` signal already used elsewhere in this codebase (see
  // MemoryVeil.tsx) to distinguish touch-primary devices from desktop.
  // Read once at mount: this decides whether to even attempt starting
  // SpeechRecognition for this recording session, not something that
  // needs to react to a mid-session hardware change.
  const [isTouchPrimary] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches,
  );
  const [isHolding, setIsHolding] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [entry, setEntry] = useState('');
  const [finishing, setFinishing] = useState(false);
  // The specific reason the mic fell back to TYPE — purely a local
  // display concern, so this doesn't need to be lifted to HeroDream.tsx
  // alongside micUnavailable.
  const [micErrorMessage, setMicErrorMessage] = useState<string | null>(null);
  // Set only when a recorded clip failed to come back as usable text —
  // separate from micErrorMessage since it's a different failure (the mic
  // worked fine; OpenAI transcription itself didn't).
  const [transcriptionErrorMessage, setTranscriptionErrorMessage] = useState<string | null>(null);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const listenTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const micTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const transcriptionTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const committedRef = useRef(false);
  const finishingRef = useRef(false);
  // The real audio blob arrives asynchronously (MediaRecorder's onstop
  // fires after recordingState already flips to 'finished'), so
  // transcription is only kicked off once it genuinely exists.
  const pendingTranscriptionRef = useRef(false);
  // Lets a deliberate Close (or the timeout above) cancel an in-flight
  // transcription request without a late response clobbering state the
  // dreamer has already moved past.
  const transcribeAbortRef = useRef<AbortController | null>(null);
  // Purely cosmetic, best-effort — see useLivePreviewTranscript.ts. Never
  // read by anything that decides what actually gets submitted; the real
  // transcript always comes from recorder.audioBlob -> OpenAI below.
  const livePreview = useLivePreviewTranscript();

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
    setMicUnavailable(false);
    setMicErrorMessage(null);

    // Races the real permission/recording request against a bounded
    // timeout — see MIC_REQUEST_TIMEOUT_MS above for why this exists.
    // recorder.start() itself only resolves true once MediaRecorder's own
    // onstart confirms capture genuinely began (see useDreamRecorder) —
    // so centralMode only ever becomes 'recording' (showing "I'M
    // LISTENING.") on the strength of that real confirmation, never
    // merely because getUserMedia succeeded or a timeout elapsed.
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

    if (result === true) {
      if (holdRef.current) holdRef.current.active = false;
      setCentralMode('recording');
      // Best-effort only — see useLivePreviewTranscript.ts. Started only
      // now, after the real recording is genuinely confirmed, so a
      // preview never implies "listening" on its own. Skipped entirely on
      // touch-primary devices — see isTouchPrimary above: SpeechRecognition
      // cannot reliably receive audio there while MediaRecorder already
      // holds the microphone, so starting it would just be a dead
      // recognizer running for nothing. Mobile gets the audio-reactive
      // orb/ripple below instead; desktop behavior is unchanged.
      if (!isTouchPrimary) {
        livePreview.start(getAppLanguage());
      }
    } else {
      const timedOut = result === 'timeout';
      if (holdRef.current) {
        holdRef.current.active = false;
        holdRef.current.progress = 0;
      }
      setIsListening(false);
      setMicUnavailable(true);
      setMicErrorMessage(describeRecordingFailure(recorder.errorRef.current, timedOut));
      setCentralMode('typing');
    }
  }, [recorder, holdRef, setCentralMode, setMicUnavailable, livePreview, isTouchPrimary]);

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
      clearTimeout(transcriptionTimeoutRef.current);
      transcribeAbortRef.current?.abort();
      // livePreview.stop is useCallback-stable (empty deps in
      // useLivePreviewTranscript.ts) — capturing it here at mount, with
      // this effect intentionally kept mount/unmount-only ([]), is safe:
      // this must run only on real unmount, not on every re-render (which
      // would otherwise abort an in-flight recording/transcription on
      // every keystroke elsewhere in this component).
      livePreview.stop();
    };
  }, []);

  useEffect(() => {
    if (centralMode === 'typing') {
      textareaRef.current?.focus();
    }
  }, [centralMode]);

  // Live voice-reactive breathing: mirrors the mic level into the shared
  // holdRef (MemoryVeil reads it) and the ambient listening orb, every
  // frame. On touch-primary devices this is the ONLY real-time feedback
  // that DARE is hearing the dreamer (no live-preview text there — see
  // isTouchPrimary above), so the orb reacts a bit more clearly there,
  // and a soft rippling ring (mounted only on mobile, see JSX below)
  // expands and fades with real speech. Desktop's own orb math is
  // untouched — same scale/opacity formula as before this change.
  useEffect(() => {
    if (centralMode !== 'recording') return;
    if (holdRef.current) holdRef.current.listening = true;
    let raf = 0;
    function frame() {
      const level = recorder.audioLevelRef.current?.level ?? 0;
      if (holdRef.current) holdRef.current.audioLevel = level;
      if (orbRef.current) {
        const orbScale = isTouchPrimary ? 1 + level * 0.42 : 1 + level * 0.32;
        const orbOpacity = isTouchPrimary ? 0.4 + level * 0.6 : 0.45 + level * 0.5;
        orbRef.current.style.transform = `scale(${orbScale.toFixed(3)})`;
        orbRef.current.style.opacity = orbOpacity.toFixed(3);
      }
      if (isTouchPrimary && rippleRef.current) {
        // A small dead-zone so ambient room noise doesn't keep a faint
        // ring visible at rest — it should read as calm during silence
        // and clearly ripple outward only on real speech.
        const rippleLevel = Math.max(0, level - 0.08);
        rippleRef.current.style.transform = `translate(-50%, -50%) scale(${(1 + rippleLevel * 0.95).toFixed(3)})`;
        rippleRef.current.style.opacity = (rippleLevel * 0.55).toFixed(3);
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [centralMode, recorder.audioLevelRef, holdRef, isTouchPrimary]);

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
    setTranscriptionErrorMessage(null);
    setCentralMode('hold');
    setEntry('');
    onTypedTranscriptChange('');
  };

  const handleDoneTyping = () => {
    onDreamCapture?.(createTextDreamInput(entry));
    setCentralMode('settled');
  };

  // CANCEL — not FINISH. Discards whatever is in progress (typed text, a
  // live recording, or an in-flight transcription) and returns to the
  // original hero state. Never advances to 'settled', never triggers
  // reconstruction.
  const handleClose = useCallback(() => {
    if (centralMode === 'recording') {
      // reset() (not finish()) stops the MediaRecorder, stops every mic
      // MediaStream track, and closes the AudioContext — the browser's mic
      // indicator goes away because the tracks are actually stopped.
      recorder.reset();
      livePreview.stop();
      livePreview.reset();
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
    } else if (centralMode === 'transcribing') {
      transcribeAbortRef.current?.abort();
      transcribeAbortRef.current = null;
      clearTimeout(transcriptionTimeoutRef.current);
      pendingTranscriptionRef.current = false;
      recorder.reset();
      committedRef.current = false;
      finishingRef.current = false;
      setFinishing(false);
    } else if (centralMode === 'typing') {
      committedRef.current = false;
      setEntry('');
      onTypedTranscriptChange('');
    } else {
      return;
    }
    setMicUnavailable(false);
    setMicErrorMessage(null);
    setTranscriptionErrorMessage(null);
    setCentralMode('hold');
  }, [centralMode, recorder, holdRef, onTypedTranscriptChange, setCentralMode, setMicUnavailable, livePreview]);

  useEffect(() => {
    if (centralMode !== 'recording' && centralMode !== 'transcribing' && centralMode !== 'typing') return;
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
    pendingTranscriptionRef.current = true;
    recorder.finish();
    // The preview's job ends here — the real, authoritative transcript
    // comes from the effect below once OpenAI responds. Stop (not
    // reset(), which would blank previewText — it just fades out along
    // with the rest of the recording panel) rather than leaving it
    // running uselessly through the transcribing/typing states.
    livePreview.stop();
    // Set immediately, synchronously — not gated behind the audioLevel
    // decay below. Real transcription (a network round trip) can in
    // principle resolve faster than that decay's own rAF loop completes;
    // if the mode switch waited for the decay's *last* frame to fire
    // setCentralMode('transcribing'), it could race the transcription
    // effect's later setCentralMode('typing') and land AFTER it — wrongly
    // reverting the UI back to a stale "transcribing" state once the real
    // work was already done. There is exactly one writer of this
    // transition now, so no ordering to get wrong.
    setCentralMode('transcribing');

    // Purely the ambient audioLevel/orb settling — no longer decides
    // anything about which panel is showing.
    const startLevel = holdRef.current?.audioLevel ?? 0;
    const t0 = performance.now();
    function decay(now: number) {
      const t = Math.min(1, (now - t0) / FINISH_SETTLE_MS);
      if (holdRef.current) holdRef.current.audioLevel = startLevel * (1 - t);
      if (t < 1) {
        requestAnimationFrame(decay);
      } else if (holdRef.current) {
        holdRef.current.listening = false;
        holdRef.current.active = false;
      }
    }
    requestAnimationFrame(decay);
  }, [recorder, holdRef, setCentralMode, livePreview]);

  // The real audio blob shows up asynchronously via MediaRecorder's onstop,
  // after handleFinishDream already returns. Once it exists, send it to
  // the OpenAI-backed /api/dream-transcription route and write whatever
  // comes back into `entry` — the exact same state TYPE mode's own
  // textarea/submit uses — so review/edit/submit is one unified path
  // regardless of how the words got there.
  useEffect(() => {
    if (!pendingTranscriptionRef.current || recorder.audioBlob === null) return;
    pendingTranscriptionRef.current = false;
    const blob = recorder.audioBlob;

    if (blob.size === 0) {
      setTranscriptionErrorMessage(TRANSCRIPTION_FAILED_MESSAGE);
      setCentralMode('typing');
      return;
    }

    const controller = new AbortController();
    transcribeAbortRef.current = controller;
    transcriptionTimeoutRef.current = setTimeout(() => controller.abort(), TRANSCRIPTION_TIMEOUT_MS);

    transcribeDreamAudio(blob, getAppLanguage(), controller.signal).then((result) => {
      clearTimeout(transcriptionTimeoutRef.current);
      // A deliberate Close (or a fresh recording started since) already
      // cleared the ref — this response is stale, do nothing with it.
      if (transcribeAbortRef.current !== controller) return;
      transcribeAbortRef.current = null;

      if (result.status === 'ok') {
        setEntry(result.transcript);
        onTypedTranscriptChange(result.transcript);
        setTranscriptionErrorMessage(null);
      } else {
        setTranscriptionErrorMessage(TRANSCRIPTION_FAILED_MESSAGE);
      }
      setCentralMode('typing');
    }, () => {
      // transcribeDreamAudio() always resolves (it catches its own
      // network/parsing errors) rather than rejecting — this only guards
      // against a genuinely unexpected exception, so the dreamer still
      // reaches a real, usable state instead of being stranded on
      // TRANSCRIBING… forever.
      if (transcribeAbortRef.current !== controller) return;
      transcribeAbortRef.current = null;
      setTranscriptionErrorMessage(TRANSCRIPTION_FAILED_MESSAGE);
      setCentralMode('typing');
    });
  }, [recorder.audioBlob, onTypedTranscriptChange, setCentralMode]);

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
        <div className="central-recording-orb-wrap">
          {/* Touch-primary only — a soft ring that ripples outward and
              fades with real mic amplitude (see the audio-reactive frame
              loop above). Not mounted on desktop at all, so desktop's
              orb-only treatment is pixel-for-pixel unchanged. */}
          {isTouchPrimary && <div ref={rippleRef} className="central-recording-ripple" aria-hidden="true" />}
          <div ref={orbRef} className="central-recording-orb" aria-hidden="true" />
        </div>
        {/* Purely cosmetic — see useLivePreviewTranscript.ts. Absent
            entirely (no message, no placeholder) when unsupported,
            silent, or on a touch-primary device (see isTouchPrimary
            above — SpeechRecognition is never even started there, so
            previewText simply never populates and this never renders);
            the authoritative transcript always comes from OpenAI after
            FINISH DREAM, never from this. */}
        {livePreview.previewText && (
          <p className="central-live-preview" dir="auto">
            {livePreview.previewText}
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
        className={`central-transcribing${centralMode === 'transcribing' ? ' is-active' : ''}`}
        aria-hidden={centralMode !== 'transcribing'}
      >
        <button
          type="button"
          className="htr-close"
          data-cursor-hover
          tabIndex={centralMode === 'transcribing' ? 0 : -1}
          onClick={handleClose}
          aria-label="Cancel transcription"
        >
          ×
        </button>
        <p className="central-recording-heading">TRANSCRIBING…</p>
        <div className="central-transcribing-orb" aria-hidden="true" />
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
            {micErrorMessage ?? "I couldn't access your microphone."}
            <br />
            Type your dream instead.
          </p>
        )}
        {!micUnavailable && transcriptionErrorMessage && (
          <p className="central-mic-note" role="status">
            {transcriptionErrorMessage}
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
