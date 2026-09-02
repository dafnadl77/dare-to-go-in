import { useCallback, useEffect, useRef, useState } from 'react';
import { getAppLanguage } from './appLanguage';
import { logDiag } from './speechDiag';

/**
 * Minimal local typing for the Web Speech API — it isn't reliably present
 * in TS's DOM lib across versions, so we declare only what we use rather
 * than relying on ambient globals that may not exist.
 */
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  // Diagnostic-only lifecycle hooks (not used for app logic) — the Web
  // Speech API's fuller event set, useful for pinpointing exactly which
  // stage a real device reaches: did audio capture even start, did the
  // browser detect sound, did it detect actual speech, before any
  // result/error/end ever fires.
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onsoundstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onsoundend: (() => void) | null;
  onaudioend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * The app's own language abstraction (appLanguage.ts) is the single source
 * of truth for what language is currently in play — not the browser's
 * locale. Wiring recognition to it (rather than `navigator.language`) means
 * a future language switcher makes speech recognition follow along for
 * free, with zero further changes here.
 */
function detectDefaultLang(): string {
  return getAppLanguage() === 'he' ? 'he-IL' : 'en-US';
}

// If recognition has been genuinely listening this long with not one result
// (interim or final), something in the pipeline is silently not working —
// a mic conflict, a network hiccup the browser never surfaced as onerror,
// etc. Rather than leave the dreamer staring at "LISTENING…" forever with
// no feedback, this treats prolonged total silence as a soft failure the UI
// can act on, the same way a real onerror does. Recognition itself keeps
// running (it may still catch up), and the moment a real result arrives,
// this clears itself automatically.
const SILENCE_WATCHDOG_MS = 6000;

interface SpeechTranscriptionApi {
  /** False means: no fake transcript will ever appear — this browser has no real STT available. */
  supported: boolean;
  isListening: boolean;
  finalTranscript: string;
  interimTranscript: string;
  fullTranscript: string;
  /** Non-null means recognition is running but not producing results (or
      failed outright) — a reason to show the caller's own inline fallback
      message. Cleared automatically the moment a real result comes in. */
  error: string | null;
  start: (lang?: string) => void;
  stop: () => void;
  reset: () => void;
}

export function useSpeechTranscription(): SpeechTranscriptionApi {
  const [isListening, setIsListening] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldListenRef = useRef(false);
  const langRef = useRef(detectDefaultLang());
  const supportedRef = useRef(!!getSpeechRecognitionCtor());
  // Whether ANY result (interim or final) has arrived since the current
  // start() call — read by the silence watchdog below.
  const hasResultRef = useRef(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const attachAndStart = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      logDiag('speech.unsupported', { hadCtor: false });
      setError('unsupported');
      return;
    }

    const recognition = new Ctor();
    recognition.lang = langRef.current;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    logDiag('speech.instance-created', { lang: recognition.lang, continuous: true, interimResults: true });

    recognition.onstart = () => {
      logDiag('speech.onstart');
    };
    recognition.onaudiostart = () => {
      logDiag('speech.onaudiostart');
    };
    recognition.onsoundstart = () => {
      logDiag('speech.onsoundstart');
    };
    recognition.onspeechstart = () => {
      logDiag('speech.onspeechstart');
    };
    recognition.onspeechend = () => {
      logDiag('speech.onspeechend');
    };
    recognition.onsoundend = () => {
      logDiag('speech.onsoundend');
    };
    recognition.onaudioend = () => {
      logDiag('speech.onaudioend');
    };

    recognition.onresult = (event) => {
      hasResultRef.current = true;
      clearTimeout(watchdogRef.current);
      setError(null);

      let interim = '';
      let finalChunk = '';
      const seen: Array<{ i: number; transcript: string; isFinal: boolean; confidence: number }> = [];
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? '';
        seen.push({ i, transcript: text, isFinal: result.isFinal, confidence: result[0]?.confidence ?? -1 });
        if (result.isFinal) {
          finalChunk += text;
        } else {
          interim += text;
        }
      }
      logDiag('speech.onresult', { resultIndex: event.resultIndex, resultsLength: event.results.length, results: seen });
      if (finalChunk) {
        setFinalTranscript((prev) => (prev ? `${prev} ${finalChunk.trim()}` : finalChunk.trim()));
      }
      setInterimTranscript(interim.trim());
    };

    recognition.onerror = (event) => {
      const reason = event.error;
      const fatal =
        reason === 'not-allowed' ||
        reason === 'audio-capture' ||
        reason === 'service-not-allowed' ||
        reason === 'language-not-supported' ||
        reason === 'bad-grammar';
      logDiag('speech.onerror', { error: reason, message: event.message ?? null, fatal });
      if (fatal) {
        shouldListenRef.current = false;
        setIsListening(false);
        clearTimeout(watchdogRef.current);
      }
      // 'no-speech' and 'aborted' are routine transient noise (a pause, a
      // deliberate stop) — onend already handles those. Everything else
      // (network errors in particular — common on mobile, since Chrome's
      // recognizer is cloud-backed — plus any reason not enumerated above)
      // is surfaced so the caller can show its inline fallback message,
      // without necessarily giving up on listening.
      if (reason !== 'no-speech' && reason !== 'aborted') {
        setError(reason);
      }
    };

    recognition.onend = () => {
      logDiag('speech.onend', { willRestart: shouldListenRef.current, hadAnyResult: hasResultRef.current });
      if (shouldListenRef.current) {
        // Chrome in particular ends the session after a pause; keep listening
        // for the rest of the dream by starting a fresh instance.
        attachAndStart();
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;
    try {
      logDiag('speech.calling-start', { lang: recognition.lang });
      recognition.start();
      logDiag('speech.start-call-returned');
      setIsListening(true);
      clearTimeout(watchdogRef.current);
      watchdogRef.current = setTimeout(() => {
        if (shouldListenRef.current && !hasResultRef.current) {
          logDiag('speech.silence-watchdog-fired', { ms: SILENCE_WATCHDOG_MS });
          setError('no-audio-detected');
        }
      }, SILENCE_WATCHDOG_MS);
    } catch (err) {
      logDiag('speech.start-threw', { name: err instanceof Error ? err.name : String(err), message: err instanceof Error ? err.message : null });
      shouldListenRef.current = false;
      setIsListening(false);
      setError(err instanceof Error ? err.name : 'start-failed');
    }
  }, []);

  const start = useCallback(
    (lang?: string) => {
      logDiag('speech.start() called', {
        supported: supportedRef.current,
        appLanguage: getAppLanguage(),
        resolvedLang: lang || detectDefaultLang(),
      });
      if (!supportedRef.current) {
        setError('unsupported');
        return;
      }
      langRef.current = lang || detectDefaultLang();
      shouldListenRef.current = true;
      hasResultRef.current = false;
      setError(null);
      attachAndStart();
    },
    [attachAndStart],
  );

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    clearTimeout(watchdogRef.current);
    recognitionRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    setFinalTranscript('');
    setInterimTranscript('');
    setError(null);
    hasResultRef.current = false;
  }, []);

  // One-time report of capability detection itself — desktop's report of
  // "no sound, no error, no transcript at all" could mean this came back
  // false (no SpeechRecognition/webkitSpeechRecognition constructor on
  // that browser) rather than a failure further down the pipeline.
  useEffect(() => {
    const w = window as typeof window & {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    logDiag('speech.capability-check', {
      hasSpeechRecognition: typeof w.SpeechRecognition !== 'undefined',
      hasWebkitSpeechRecognition: typeof w.webkitSpeechRecognition !== 'undefined',
      supported: supportedRef.current,
      userAgent: navigator.userAgent,
    });
  }, []);

  // Recognition (and its watchdog timer) must not keep running past the
  // component that owns this hook — otherwise a stray onend could restart
  // it into the void after the UI has moved on.
  useEffect(() => {
    return () => {
      clearTimeout(watchdogRef.current);
      shouldListenRef.current = false;
      recognitionRef.current?.abort();
    };
  }, []);

  const fullTranscript = interimTranscript
    ? finalTranscript
      ? `${finalTranscript} ${interimTranscript}`
      : interimTranscript
    : finalTranscript;

  return {
    supported: supportedRef.current,
    isListening,
    finalTranscript,
    interimTranscript,
    fullTranscript,
    error,
    start,
    stop,
    reset,
  };
}
