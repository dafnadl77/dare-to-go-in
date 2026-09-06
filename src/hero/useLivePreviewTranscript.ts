import { useCallback, useRef, useState } from 'react';

/**
 * Purely cosmetic, best-effort live transcript preview shown WHILE
 * recording — never the source of truth. MediaRecorder → OpenAI (see
 * useDreamRecorder.ts / dreamTranscription.ts) remains the only
 * authoritative pipeline; this hook's entire output is discarded the
 * moment the real transcript comes back. If browser SpeechRecognition is
 * unsupported, throws, errors, or simply never produces anything, that
 * is invisible to the user by design — no error state is exposed here at
 * all, so there is nothing for a caller to surface and nothing that can
 * interrupt the real recording. Minimal local typing (not relying on
 * ambient DOM lib types that may not exist), matching the shape actually
 * used here only.
 */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
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
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface LivePreviewApi {
  /** The evolving preview text, or '' if nothing has been heard (or the
      browser can't do this at all) — callers simply don't render anything
      when this is empty, no distinct "unsupported" state to handle. */
  previewText: string;
  /** Best-effort — safe to call even if unsupported; does nothing then. */
  start: (lang: 'en' | 'he') => void;
  stop: () => void;
  reset: () => void;
}

export function useLivePreviewTranscript(): LivePreviewApi {
  const [finalText, setFinalText] = useState('');
  const [interimText, setInterimText] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldRunRef = useRef(false);

  const attach = useCallback((lang: string) => {
    const Ctor = getCtor();
    if (!Ctor) return;

    let recognition: SpeechRecognitionLike;
    try {
      recognition = new Ctor();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
    } catch {
      // Construction itself can throw on some browsers — this preview is
      // disposable, so just give up quietly.
      return;
    }

    recognition.onresult = (event) => {
      let interim = '';
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) finalChunk += text;
        else interim += text;
      }
      if (finalChunk) {
        setFinalText((prev) => (prev ? `${prev} ${finalChunk.trim()}` : finalChunk.trim()));
      }
      setInterimText(interim.trim());
    };
    // No error handling beyond "stop trying" — this is decorative only,
    // never something the dreamer needs to be told about.
    recognition.onerror = () => {
      shouldRunRef.current = false;
    };
    recognition.onend = () => {
      if (shouldRunRef.current) {
        attach(lang);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      shouldRunRef.current = false;
    }
  }, []);

  const start = useCallback(
    (lang: 'en' | 'he') => {
      shouldRunRef.current = true;
      setFinalText('');
      setInterimText('');
      attach(lang === 'he' ? 'he-IL' : 'en-US');
    },
    [attach],
  );

  const stop = useCallback(() => {
    shouldRunRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {
      // disposable — nothing to react to
    }
  }, []);

  const reset = useCallback(() => {
    setFinalText('');
    setInterimText('');
  }, []);

  const previewText = interimText ? (finalText ? `${finalText} ${interimText}` : interimText) : finalText;

  return { previewText, start, stop, reset };
}
