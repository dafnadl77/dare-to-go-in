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
import type { DreamInput } from './dreamInput';
import { transcribeDreamAudio, type TranscriptionErrorReason } from './dreamTranscription';
import { takeDreamDraft } from './dreamDraft';
import { classifyMicFailure, MIC_FAILURE_MESSAGE_KEY, type MicFailureKind } from './micFailure';
import { useMicAvailability } from './micAvailability';
import { hasDreamText, submitTypedDream } from './dreamEntry';
import {
  STALL_SPEECH_MS,
  browserStore,
  disableLiveWords,
  isCollision,
  isLiveWordsDisabled,
  nextStallSpeechMs,
} from './liveWordsPolicy';
import { getAppLanguage, normalizeTranscriptionLanguage } from './appLanguage';
import { useLivePreviewTranscript } from './useLivePreviewTranscript';
import { useLanguage } from '../i18n/LanguageContext';
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
  /** True once a genuinely failed dream-analysis response has come back
      for the dream just submitted — swaps the settled panel's "I think I
      have it" text for a recoverable error + retry, instead of leaving
      the dreamer staring at that text forever (the analysisResult.status
      === 'error' case was previously never rendered anywhere). */
  analysisFailed?: boolean;
  /** The failure was UNCERTAIN (no answer in time) for a signed-in account: the retry is the same paid request and will not be charged again, and the panel says so. */
  analysisUncertain?: boolean;
  /** Re-runs analysis for the exact same captured dream — see
      HeroDream.tsx's retryAnalysis. */
  onRetryAnalysis?: () => void;
  /** The exact text the failed analysis was run on. EDIT puts it back into the typing field so the dreamer never has to retype it. */
  capturedDreamText?: string;
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
const MIC_REQUEST_TIMEOUT_MS = 30000;
// Bounds the OpenAI transcription round-trip the same way — a slow
// network or a stalled response must not leave the dreamer staring at
// "TRANSCRIBING…" forever with no way out.
const TRANSCRIPTION_TIMEOUT_MS = 60000;
// A server-side payload ceiling (see server/routes/dreamTranscription.ts)
// backstops cost-abuse from directly-crafted requests, but the intended,
// normal way a real recording ever gets this long is simply forgetting to
// release HOLD — so this auto-finishes exactly like a real release would,
// using the same handleFinishDream() path, rather than leaving the
// dreamer recording indefinitely.
const RECORDING_MAX_DURATION_MS = 10 * 60 * 1000;

/** The mic could not be started. Says WHICH thing failed — the permission was refused, there is no microphone, another app holds it,
    the page is not secure, the browser cannot record, the recorder would not start, or the permission prompt was never answered —
    from what the browser actually reported (see micFailure.ts), never one line for all of them. Every one of these lands the
    dreamer in TYPE with an immediately usable, focused textarea: never a dead end. Takes `t` as a parameter since it is a plain
    function, not a component. */
function describeRecordingFailure(errorName: string | null, timedOut: boolean, t: (path: string) => string): string {
  return t(MIC_FAILURE_MESSAGE_KEY[classifyMicFailure(errorName, timedOut)]);
}

/** Why a recording could not become text — said plainly, with the way forward (typing always still works), instead of one
    generic line that hid, for example, "your free dream was already used" behind "I couldn't transcribe that". */
/** Failures where sending the SAME recording again can work (the upload or the service had a hiccup); the rest need typing, signing in or a shorter recording. */
const RETRYABLE_TRANSCRIPTION_FAILURES = new Set<TranscriptionErrorReason>(['network', 'timeout', 'request_failed', 'rate_limited', 'invalid_response']);

function describeTranscriptionFailure(reason: TranscriptionErrorReason, t: (path: string) => string): string {
  switch (reason) {
    case 'free_dream_used':
      return t('hold.transcriptionFreeDreamUsed');
    case 'not_authenticated':
      return t('hold.transcriptionSessionExpired');
    case 'credits_required':
      return t('hold.transcriptionCreditsRequired');
    case 'too_large':
      return t('hold.transcriptionTooLarge');
    case 'network':
      return t('hold.transcriptionNetwork');
    case 'timeout':
      return t('hold.transcriptionTimeout');
    default:
      return t('hold.transcriptionFailed');
  }
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
  analysisFailed = false,
  analysisUncertain = false,
  onRetryAnalysis,
  capturedDreamText = '',
}: HoldToRememberProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const rippleRef = useRef<HTMLDivElement>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [entry, setEntry] = useState('');
  const dreamHasText = hasDreamText(entry);
  useEffect(() => {
    entryRef.current = entry;
  }, [entry]);
  const [finishing, setFinishing] = useState(false);
  // The specific reason the mic fell back to TYPE — purely a local
  // display concern, so this doesn't need to be lifted to HeroDream.tsx
  // alongside micUnavailable.
  const [micErrorMessage, setMicErrorMessage] = useState<string | null>(null);
  // Which kind of failure it was: a missing microphone is a calm "write it instead", not an error, and needs no extra hint line.
  const [micFailureKind, setMicFailureKind] = useState<MicFailureKind | null>(null);
  // Whether there is a microphone at all, learned without opening one (no permission prompt) and kept current as hardware changes.
  const { availability: micAvailability, markNone: markMicNone, markAvailable: markMicAvailable } = useMicAvailability();
  const noMicrophone = micAvailability === 'none';
  // Set only when a recorded clip failed to come back as usable text —
  // separate from micErrorMessage since it's a different failure (the mic
  // worked fine; OpenAI transcription itself didn't).
  const [transcriptionErrorMessage, setTranscriptionErrorMessage] = useState<string | null>(null);
  // The recording that failed to transcribe stays available for "try again" until the dreamer leaves this step.
  const lastRecordingRef = useRef<Blob | null>(null);
  const [canRetryTranscription, setCanRetryTranscription] = useState(false);
  // I'M DONE was pressed with nothing written: the box stays, with a gentle note, and nothing is sent anywhere.
  const [doneBlocked, setDoneBlocked] = useState(false);
  // Live words are honest about themselves: when they are not running (this browser has none, this device is remembered as
  // competing with the recording for the microphone, they stopped, or they have heard nothing while the dreamer clearly speaks),
  // the recording panel says plainly that the transcript will appear at the end instead of promising words that never come.
  const [liveSkipped, setLiveSkipped] = useState(false);
  const [liveStalled, setLiveStalled] = useState(false);
  // The words the browser caught live at the moment the dreamer finished: the fallback if the recording cannot be transcribed.
  const liveHeardRef = useRef('');
  // The typing box holds exactly this fallback (not yet edited by the dreamer): an accurate transcript may replace it.
  const entryIsLiveFallbackRef = useRef(false);
  const entryRef = useRef('');
  const lastVisibilityChangeRef = useRef(0);
  const livePreviewElRef = useRef<HTMLParagraphElement>(null);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const listenTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const micTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const transcriptionTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const recordingMaxDurationTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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
  const { t, language } = useLanguage();
  // Live words run on phones and tablets too, in the browsers that have them. The one real risk there is that a phone lets only one
  // consumer hold the microphone, so running SpeechRecognition beside the MediaRecorder can silence the recording (Chromium issue
  // 41083534 on Android; WebKit has similar audio-session conflicts). That cannot be known from a feature test, so it is WATCHED:
  // the recording's microphone stream being muted/ended while the live words run (page in the foreground) switches the live words
  // off at once and remembers the device (liveWordsPolicy.ts), and the recording itself is never touched either way.

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
    setLiveSkipped(false);
    setLiveStalled(false);

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
      markMicAvailable();
      if (holdRef.current) holdRef.current.active = false;
      setCentralMode('recording');
      // Live words start only AFTER the recording is confirmed running, on every device — unless this device was found to compete
      // with the recording for the microphone (then the panel says the transcript will appear at the end). Never affects
      // recorder.start()/finish() or what actually gets submitted: strictly additional, optional UI on top of the recording.
      if (isLiveWordsDisabled(browserStore(), Date.now())) {
        // Nothing from an earlier recording may linger as this one's live text (or as its fallback words).
        livePreview.reset();
        setLiveSkipped(true);
      } else {
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
      console.warn(`mic_failure code=${recorder.errorRef.current ?? 'none'} timedOut=${timedOut}`);
      const kind = classifyMicFailure(recorder.errorRef.current, timedOut);
      setMicFailureKind(kind);
      // No microphone: remembered until the hardware changes, so the home screen offers writing first (recording is never hidden for good).
      if (kind === 'no-device') markMicNone();
      setMicErrorMessage(describeRecordingFailure(recorder.errorRef.current, timedOut, t));
      setCentralMode('typing');
    }
  }, [recorder, holdRef, setCentralMode, setMicUnavailable, t, livePreview, markMicNone, markMicAvailable]);

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
      clearTimeout(recordingMaxDurationTimeoutRef.current);
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
    } else {
      setDoneBlocked(false);
    }
  }, [centralMode]);

  // Words kept when the dreamer had to sign in (or choose a package) before their dream could be analyzed come back here, in the
  // typing box, once the home screen is ready — never sent anywhere, read once (see dreamDraft.ts).
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (!revealed || draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    const draft = takeDreamDraft();
    if (!draft) return;
    setEntry(draft);
    onTypedTranscriptChange(draft);
    setCentralMode('typing');
  }, [revealed, onTypedTranscriptChange, setCentralMode]);

  // Live voice-reactive breathing: mirrors the mic level into the shared
  // holdRef (MemoryVeil reads it) and the ambient listening orb, every
  // frame. Applied universally (never platform-gated) — on touch-primary
  // devices this is the ONLY real-time "I'm hearing you" feedback (see
  // isTouchPrimaryRef above for why live-preview text is desktop-only);
  // on desktop it runs alongside the live preview, not instead of it.
  useEffect(() => {
    if (centralMode !== 'recording') return;
    if (holdRef.current) holdRef.current.listening = true;
    let raf = 0;
    function frame() {
      const level = recorder.audioLevelRef.current?.level ?? 0;
      if (holdRef.current) holdRef.current.audioLevel = level;
      if (orbRef.current) {
        orbRef.current.style.transform = `scale(${(1 + level * 0.42).toFixed(3)})`;
        orbRef.current.style.opacity = (0.4 + level * 0.6).toFixed(3);
      }
      if (rippleRef.current) {
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
    entryIsLiveFallbackRef.current = false;
    if (doneBlocked && hasDreamText(e.target.value)) setDoneBlocked(false);
    onTypedTranscriptChange(e.target.value);
  };

  // BACK — returns to the initial 'hold' capture state from TYPE, whether
  // TYPE was reached directly ("I'd rather type"), via a failed/timed-out
  // mic request, or after reviewing a real transcript post-recording.
  //
  // ROOT CAUSE of the "stuck after Back" bug: this used to reset every
  // piece of HoldToRemember's OWN local state but never called
  // recorder.reset() — unlike handleClose, which does, for its
  // 'recording'/'transcribing' branches. HeroDream.tsx derives
  // `listeningEverStarted` from `recorder.recordingState !== 'idle' &&
  // !== 'error'` and feeds it straight into MemoryTitle's `dissolving`
  // prop and DreamPrompt's `quiet` prop — the title/prompt "recede" while
  // real recording is in progress. But whenever a real recording actually
  // ran (recordingState left 'idle' and became 'recording' -> 'finished'
  // on FINISH DREAM) or a mic request timed out without ever resolving
  // (recordingState stuck at 'requesting-permission' — see
  // MIC_REQUEST_TIMEOUT_MS above), recordingState never returns to
  // 'idle' on its own. Clicking Back correctly restored centralMode to
  // 'hold' (the circle itself was always genuinely visible and
  // interactive — confirmed live), but `listeningEverStarted` stayed
  // permanently true, so the DARE TO GO IN title stayed dissolved and the
  // "what do you remember" prompt stayed in its quiet/receded state
  // forever after — reading as an incomplete/broken capture screen even
  // though the HOLD control underneath it was fully functional.
  const handleBack = () => {
    committedRef.current = false;
    recorder.reset();
    setMicUnavailable(false);
    setMicErrorMessage(null);
    setTranscriptionErrorMessage(null);
    lastRecordingRef.current = null;
    setCanRetryTranscription(false);
    setCentralMode('hold');
    setEntry('');
    onTypedTranscriptChange('');
  };

  // I'M DONE. Only a dream with something written (or transcribed) in it goes on to the analysis. With an EMPTY box — e.g. after a
  // recording that could not start because there is no microphone — nothing is submitted, nothing is analyzed and no failure screen
  // appears: the dreamer stays in the typing box. (The analysis used to be started with empty text, refuse it at once, and show
  // "Something went wrong while I was putting this together".)
  // On success the box is cleared: if that dream is later discarded (LET IT GO) and the screen returns to 'hold' for a new one, TYPE
  // re-mounts empty instead of with the PREVIOUS dream's text; onDreamCapture already received its own copy of the text.
  const handleDoneTyping = () => {
    const outcome = submitTypedDream(entry, {
      onCapture: onDreamCapture,
      onSubmitted: () => {
        setEntry('');
        setDoneBlocked(false);
        setCentralMode('settled');
      },
    });
    if (outcome === 'blocked_empty') {
      setDoneBlocked(true);
      textareaRef.current?.focus();
    }
  };

  // CANCEL — not FINISH. Discards whatever is in progress (typed text, a
  // live recording, or an in-flight transcription) and returns to the
  // original hero state. Never advances to 'settled', never triggers
  // reconstruction.
  const handleClose = useCallback(() => {
    if (centralMode === 'recording') {
      clearTimeout(recordingMaxDurationTimeoutRef.current);
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
    lastRecordingRef.current = null;
    setCanRetryTranscription(false);
    setCentralMode('hold');
  }, [centralMode, recorder, holdRef, onTypedTranscriptChange, setCentralMode, setMicUnavailable, livePreview]);

  // Returning to the capture state from ANY other step (Back, LET IT GO, RETURN
  // TO THE ROOM — HeroDream.handleGoHome just sets centralMode to 'hold' while
  // this component stays mounted) must leave the press-and-hold ritual usable
  // again. ROOT CAUSE of "the circle stops working after a completed voice
  // dream": committedRef (and finishingRef / isListening / the recorder's own
  // 'finished' state) were only cleared by handleBack/handleClose — never on
  // the path through DONE → journey → home — so beginHold's
  // `committedRef.current` early-return swallowed every later press and the
  // label stayed on LISTENING. Keyed on the mode TRANSITION, so it can't
  // interfere with a hold that is in progress (centralMode stays 'hold' then).
  const previousModeRef = useRef(centralMode);
  useEffect(() => {
    const previous = previousModeRef.current;
    previousModeRef.current = centralMode;
    if (centralMode !== 'hold' || previous === 'hold') return;
    committedRef.current = false;
    finishingRef.current = false;
    clearTimeout(listenTimerRef.current);
    clearTimeout(micTimeoutRef.current);
    clearTimeout(recordingMaxDurationTimeoutRef.current);
    if (holdRef.current) {
      holdRef.current.active = false;
      holdRef.current.listening = false;
      holdRef.current.progress = 0;
      holdRef.current.audioLevel = 0;
    }
    setFinishing(false);
    setIsListening(false);
    setIsHolding(false);
    if (recorder.recordingState !== 'idle') recorder.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centralMode]);

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
    clearTimeout(recordingMaxDurationTimeoutRef.current);
    pendingTranscriptionRef.current = true;
    liveHeardRef.current = livePreview.heardText();
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

  // Is the page in the foreground? Phones mute capture when a page goes to the background; that is not a collision.
  useEffect(() => {
    lastVisibilityChangeRef.current = Date.now();
    const onVisibility = () => {
      lastVisibilityChangeRef.current = Date.now();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // The recording's microphone stream stopped delivering while the live words were running: they compete for the microphone on
  // this device. Switch them off at once (the recording is untouched), remember the device, and say so honestly.
  const livePreviewStatusRef = useRef(livePreview.status);
  useEffect(() => {
    livePreviewStatusRef.current = livePreview.status;
  }, [livePreview.status]);
  const { setInterruptionHandler } = recorder;
  const { abort: abortLivePreview } = livePreview;
  useEffect(() => {
    setInterruptionHandler((reason) => {
      const running = livePreviewStatusRef.current === 'starting' || livePreviewStatusRef.current === 'live';
      if (!running) return;
      const collision = isCollision({
        now: Date.now(),
        lastVisibilityChangeAt: lastVisibilityChangeRef.current,
        pageHidden: document.visibilityState === 'hidden',
      });
      if (!collision) return;
      console.warn(`speech_preview_conflict capture=${reason}`);
      abortLivePreview(`capture-${reason}`);
      disableLiveWords(browserStore(), Date.now(), reason);
      setLiveSkipped(true);
    });
    return () => setInterruptionHandler(null);
  }, [setInterruptionHandler, abortLivePreview]);

  // Live words that stay empty while the dreamer is clearly speaking (some phones start the recognizer and never deliver a word,
  // without any error): say that the transcript will appear at the end instead of leaving a silent promise.
  const hasLiveWords = livePreview.previewText !== '';
  const { audioLevelRef } = recorder;
  useEffect(() => {
    if (hasLiveWords) setLiveStalled(false);
  }, [hasLiveWords]);
  useEffect(() => {
    if (centralMode !== 'recording') return;
    let spokenMs = 0;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      spokenMs = nextStallSpeechMs(spokenMs, audioLevelRef.current?.level ?? 0, now - last, hasLiveWords);
      last = now;
      if (spokenMs >= STALL_SPEECH_MS) setLiveStalled(true);
    }, 500);
    return () => clearInterval(timer);
  }, [centralMode, audioLevelRef, hasLiveWords]);

  // A long dream makes the live text longer than its box: keep the newest words in view.
  useEffect(() => {
    const el = livePreviewElRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [livePreview.previewText]);

  const liveNoteVisible =
    centralMode === 'recording' && (liveSkipped || liveStalled || livePreview.status === 'unsupported' || livePreview.status === 'stopped');

  // Additive safety valve, not a UX feature to advertise — a real dreamer
  // finishes in well under this. Starts counting only once recording is
  // genuinely confirmed (centralMode reaching 'recording'), and is cleared
  // above the moment the dream finishes or the panel is closed any other
  // way, so this can only ever fire while a recording is truly still open.
  useEffect(() => {
    if (centralMode !== 'recording') return;
    recordingMaxDurationTimeoutRef.current = setTimeout(() => {
      handleFinishDream();
    }, RECORDING_MAX_DURATION_MS);
    return () => clearTimeout(recordingMaxDurationTimeoutRef.current);
  }, [centralMode, handleFinishDream]);

  // The real audio blob shows up asynchronously via MediaRecorder's onstop,
  // after handleFinishDream already returns. Once it exists, send it to
  // the OpenAI-backed /api/dream-transcription route and write whatever
  // comes back into `entry` — the exact same state TYPE mode's own
  // textarea/submit uses — so review/edit/submit is one unified path
  // regardless of how the words got there.
  // When the accurate transcript could not be produced, the words the browser caught while the dreamer spoke are put in the (empty)
  // box so nothing said is lost; they are editable, and an accurate transcript later replaces them only while they are untouched.
  // Returns whether they were kept. A box the dreamer already wrote in is never touched.
  const keepLiveWords = useCallback((): boolean => {
    const heard = liveHeardRef.current.trim();
    if (!hasDreamText(heard) || hasDreamText(entryRef.current)) return false;
    entryIsLiveFallbackRef.current = true;
    setEntry(heard);
    onTypedTranscriptChange(heard);
    return true;
  }, [onTypedTranscriptChange]);

  // Sends one recording to /api/dream-transcription. The result is applied only if this is still the active request (a deliberate
  // Close, or a newer recording, supersedes it). Success fills the typing box; any failure says which stage failed and still lands
  // in the typing box, keeping the recording so "try again" can send it once more.
  const runTranscription = useCallback(
    (blob: Blob) => {
      const controller = new AbortController();
      transcribeAbortRef.current = controller;
      transcriptionTimeoutRef.current = setTimeout(() => controller.abort(), TRANSCRIPTION_TIMEOUT_MS);
      setCanRetryTranscription(false);

      transcribeDreamAudio(blob, normalizeTranscriptionLanguage(getAppLanguage()), controller.signal).then(
        (result) => {
          clearTimeout(transcriptionTimeoutRef.current);
          // A deliberate Close (or a fresh recording started since) already cleared the ref: this response is stale.
          if (transcribeAbortRef.current !== controller) return;
          transcribeAbortRef.current = null;

          if (result.status === 'ok') {
            lastRecordingRef.current = null;
            // The accurate transcript fills an empty box, or replaces the live words kept as a fallback (not yet edited). Words the
            // dreamer typed or edited are never overwritten: the transcript is added after them.
            const current = entryRef.current;
            const text =
              hasDreamText(current) && !entryIsLiveFallbackRef.current ? `${current.trimEnd()}\n\n${result.transcript}` : result.transcript;
            entryIsLiveFallbackRef.current = false;
            setEntry(text);
            onTypedTranscriptChange(text);
            setTranscriptionErrorMessage(null);
          } else {
            setTranscriptionErrorMessage(keepLiveWords() ? t('hold.liveWordsKept') : describeTranscriptionFailure(result.reason, t));
            setCanRetryTranscription(RETRYABLE_TRANSCRIPTION_FAILURES.has(result.reason));
          }
          setCentralMode('typing');
        },
        () => {
          // transcribeDreamAudio() always resolves; this only guards a genuinely unexpected exception so the dreamer still reaches a
          // usable state instead of being stranded on TRANSCRIBING… forever.
          if (transcribeAbortRef.current !== controller) return;
          transcribeAbortRef.current = null;
          setTranscriptionErrorMessage(keepLiveWords() ? t('hold.liveWordsKept') : t('hold.transcriptionFailed'));
          setCanRetryTranscription(true);
          setCentralMode('typing');
        },
      );
    },
    [onTypedTranscriptChange, setCentralMode, t, keepLiveWords],
  );

  // The real audio blob shows up asynchronously via MediaRecorder's onstop, after handleFinishDream already returns. Once it
  // exists, send it off and write whatever comes back into `entry` — the same state TYPE mode's own textarea/submit uses — so
  // review/edit/submit is one unified path regardless of how the words got there.
  useEffect(() => {
    if (!pendingTranscriptionRef.current || recorder.audioBlob === null) return;
    pendingTranscriptionRef.current = false;
    const blob = recorder.audioBlob;

    if (blob.size === 0) {
      setTranscriptionErrorMessage(keepLiveWords() ? t('hold.liveWordsKept') : t('hold.transcriptionFailed'));
      setCentralMode('typing');
      return;
    }

    lastRecordingRef.current = blob;
    runTranscription(blob);
  }, [recorder.audioBlob, runTranscription, setCentralMode, t, keepLiveWords]);

  const handleRetryTranscription = () => {
    const blob = lastRecordingRef.current;
    if (!blob) return;
    setTranscriptionErrorMessage(null);
    setCanRetryTranscription(false);
    setCentralMode('transcribing');
    runTranscription(blob);
  };

  const isHoldFaded = centralMode !== 'hold';
  const requestingMic = recorder.recordingState === 'requesting-permission';

  return (
    <div className={`hold-to-remember${revealed ? ' is-revealed' : ''} is-mode-${centralMode}${reconstructing ? ' is-reconstructing' : ''}`}>
      <button
        ref={buttonRef}
        type="button"
        className={`htr-circle${isHolding ? ' is-holding' : ''}${isListening ? ' is-listening' : ''}${noMicrophone ? ' is-no-mic' : ''}`}
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
        aria-label={t('hold.holdAria')}
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
              {t('hold.listening')}
              <span className="htr-privacy-note">{t('hold.privacyNote')}</span>
            </>
          ) : isListening ? (
            t('hold.listening')
          ) : (
            t('hold.holdToTellMe')
          )}
        </span>
      </button>

      <button
        type="button"
        className={`htr-type-link${noMicrophone ? ' htr-type-link--primary' : ''}`}
        data-cursor-hover
        tabIndex={isHoldFaded ? -1 : 0}
        aria-hidden={isHoldFaded}
        onClick={() => setCentralMode('typing')}
      >
        {noMicrophone ? t('hold.writeYourDream') : t('hold.idRatherType')}
      </button>

      {/* A short, plain-language clarification that the circle above
          needs a press-and-hold, not a tap — added because the hold
          gesture alone wasn't obvious enough on its own. Fades with the
          circle/type-link (same is-mode-* rule in HoldToRemember.css),
          never shown once a gesture has actually started. */}
      <p className="htr-hold-hint" aria-hidden={isHoldFaded} role={noMicrophone ? 'status' : undefined}>
        {noMicrophone ? t('hold.micNoDevice') : t('hold.pressAndHoldHint')}
      </p>

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
          aria-label={t('hold.cancelRecording')}
        >
          ×
        </button>
        <p className="central-recording-heading">{t('hold.imListening')}</p>
        <p className="central-recording-subheading">{t('hold.tellMeEverything')}</p>
        <div className="central-recording-orb-wrap">
          {/* A soft ring that ripples outward and glows with real
              mic amplitude (see the audio-reactive frame loop above) — the
              "DARE is hearing you" cue on every platform, live words or
              not (when live words are unavailable it is the dreamer's only
              real-time feedback, together with the note below). */}
          <div ref={rippleRef} className="central-recording-ripple" aria-hidden="true" />
          <div ref={orbRef} className="central-recording-orb" aria-hidden="true" />
        </div>
        {/* Purely cosmetic — see useLivePreviewTranscript.ts. Explicit
            dir (not "auto") so a short or ambiguous interim result can't
            be mis-detected — this always matches the active UI language,
            which is also the language passed to livePreview.start(). The
            authoritative transcript always comes from the server after
            FINISH DREAM; it is never read by anything that decides what
            actually gets submitted. */}
        {livePreview.previewText && (
          <p ref={livePreviewElRef} className="central-live-preview" dir={language === 'he' ? 'rtl' : 'ltr'}>
            {livePreview.previewText}
          </p>
        )}
        {liveNoteVisible && (
          <p className="central-live-note" role="status">
            {t('hold.liveWordsUnavailable')}
          </p>
        )}
        <button
          type="button"
          className="central-finish"
          data-cursor-hover
          tabIndex={centralMode === 'recording' && !finishing ? 0 : -1}
          onClick={handleFinishDream}
        >
          {t('hold.finishDream')}
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
          aria-label={t('hold.cancelTranscription')}
        >
          ×
        </button>
        <p className="central-recording-heading">{t('hold.transcribing')}</p>
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
          aria-label={t('hold.cancelTyping')}
        >
          ×
        </button>
        {(micUnavailable || transcriptionErrorMessage || (doneBlocked && !dreamHasText)) && (
          <div className="central-mic-notice">
            {micUnavailable && (
              <p className="central-mic-note" role="status">
                {micErrorMessage ?? t('hold.micErrorGeneric')}
                {micFailureKind !== 'no-device' && (
                  <>
                    <br />
                    {t('hold.typeInsteadHint')}
                  </>
                )}
              </p>
            )}
            {!micUnavailable && transcriptionErrorMessage && (
              <>
                <p className="central-mic-note" role="status">
                  {transcriptionErrorMessage}
                </p>
                {canRetryTranscription && (
                  <button
                    type="button"
                    className="central-retry"
                    data-cursor-hover
                    tabIndex={centralMode === 'typing' ? 0 : -1}
                    onClick={handleRetryTranscription}
                  >
                    {t('hold.retryTranscription')}
                  </button>
                )}
              </>
            )}
            {doneBlocked && !dreamHasText && (
              <p className="central-mic-note" role="alert">
                {t('hold.writeSomethingFirst')}
              </p>
            )}
          </div>
        )}
        <p className="central-typing-heading">{t('hold.tellMeWhatHappened')}</p>
        <textarea
          ref={textareaRef}
          className="central-typing-textarea"
          placeholder={t('hold.typingPlaceholder')}
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
            {t('hold.back')}
          </button>
          <button
            type="button"
            className="central-done"
            data-cursor-hover
            tabIndex={centralMode === 'typing' ? 0 : -1}
            aria-disabled={!dreamHasText}
            onClick={handleDoneTyping}
          >
            {t('hold.imDone')}
          </button>
        </div>
      </div>

      <div
        className={`central-settled${centralMode === 'settled' ? ' is-active' : ''}`}
        aria-hidden={centralMode !== 'settled'}
      >
        {analysisFailed ? (
          <>
            <p className="central-settled-text">{t(analysisUncertain ? 'hold.analysisUncertain' : 'hold.analysisFailed')}</p>
            <div className="central-settled-actions">
              <button
                type="button"
                className="central-done"
                data-cursor-hover
                tabIndex={centralMode === 'settled' ? 0 : -1}
                onClick={onRetryAnalysis}
              >
                {t('hold.tryAgain')}
              </button>
              <button
                type="button"
                className="central-back"
                data-cursor-hover
                tabIndex={centralMode === 'settled' ? 0 : -1}
                onClick={() => {
                  // handleDoneTyping cleared the field when the dream was submitted; put the exact
                  // captured text back so EDIT resumes from it instead of an empty box.
                  setEntry(capturedDreamText);
                  onTypedTranscriptChange(capturedDreamText);
                  setCentralMode('typing');
                }}
              >
                {t('hold.editDream')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="central-settled-text">{t('hold.iThinkIHaveIt')}</p>
            <p className="central-settled-text central-settled-text--second">{t('hold.letMePutItBackTogether')}</p>
          </>
        )}
      </div>
    </div>
  );
}
