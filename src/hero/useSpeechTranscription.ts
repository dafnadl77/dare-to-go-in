import { useCallback, useRef, useState } from 'react';

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

function detectDefaultLang(): string {
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return nav.toLowerCase().startsWith('he') ? 'he-IL' : 'en-US';
}

interface SpeechTranscriptionApi {
  /** False means: no fake transcript will ever appear — this browser has no real STT available. */
  supported: boolean;
  isListening: boolean;
  finalTranscript: string;
  interimTranscript: string;
  fullTranscript: string;
  start: (lang?: string) => void;
  stop: () => void;
  reset: () => void;
}

export function useSpeechTranscription(): SpeechTranscriptionApi {
  const [isListening, setIsListening] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldListenRef = useRef(false);
  const langRef = useRef(detectDefaultLang());
  const supportedRef = useRef(!!getSpeechRecognitionCtor());

  const attachAndStart = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = langRef.current;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = '';
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) {
          finalChunk += text;
        } else {
          interim += text;
        }
      }
      if (finalChunk) {
        setFinalTranscript((prev) => (prev ? `${prev} ${finalChunk.trim()}` : finalChunk.trim()));
      }
      setInterimTranscript(interim.trim());
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'audio-capture' || event.error === 'service-not-allowed') {
        shouldListenRef.current = false;
        setIsListening(false);
      }
      // 'no-speech' and similar are transient — onend will fire and may restart below.
    };

    recognition.onend = () => {
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
      recognition.start();
      setIsListening(true);
    } catch {
      shouldListenRef.current = false;
      setIsListening(false);
    }
  }, []);

  const start = useCallback(
    (lang?: string) => {
      if (!supportedRef.current) return;
      langRef.current = lang || detectDefaultLang();
      shouldListenRef.current = true;
      attachAndStart();
    },
    [attachAndStart],
  );

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    recognitionRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    setFinalTranscript('');
    setInterimTranscript('');
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
    start,
    stop,
    reset,
  };
}
