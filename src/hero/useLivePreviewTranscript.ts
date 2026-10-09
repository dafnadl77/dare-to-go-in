import { useCallback, useState } from 'react';
import { LivePreviewController, browserLivePreviewEnv, type LivePreviewStatus } from './livePreviewController';

/**
 * Purely cosmetic, best-effort live transcript preview shown WHILE
 * recording — never the source of truth. MediaRecorder → OpenAI (see
 * useDreamRecorder.ts / dreamTranscription.ts) remains the only
 * authoritative pipeline; this hook's entire output is discarded the
 * moment the real transcript comes back. If browser SpeechRecognition is
 * unsupported, errors, or simply never produces anything, that is
 * invisible to the user by design — no error state is exposed here at
 * all, so there is nothing for a caller to surface and nothing that can
 * interrupt the real recording. (The reason it stopped is kept on the
 * controller and written once to the console: see livePreviewController.ts,
 * which also holds the restart rules.)
 */
interface LivePreviewApi {
  /** The evolving preview text, or '' if nothing has been heard (or the
      browser can't do this at all) — callers simply don't render anything
      when this is empty, no distinct "unsupported" state to handle. */
  previewText: string;
  /** Best-effort — safe to call even if unsupported; does nothing then. */
  start: (lang: 'en' | 'he') => void;
  stop: () => void;
  reset: () => void;
  /** Whether live words are really running (idle / starting / live / stopped / unsupported). */
  status: LivePreviewStatus;
  /** Switches the live words off at once, keeping the reason (suspected microphone competition). */
  abort: (code: string) => void;
  /** Everything heard so far — read at the moment the dreamer finishes, as a fallback if the recording cannot be transcribed. */
  heardText: () => string;
}

export function useLivePreviewTranscript(): LivePreviewApi {
  const [finalText, setFinalText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [status, setStatus] = useState<LivePreviewStatus>('idle');

  const [controller] = useState(
    () =>
      new LivePreviewController(browserLivePreviewEnv(), {
        onText: (finalPart, interimPart) => {
          setFinalText(finalPart);
          setInterimText(interimPart);
        },
        onStatus: setStatus,
      }),
  );

  const start = useCallback((lang: 'en' | 'he') => controller.start(lang), [controller]);
  const stop = useCallback(() => controller.stop(), [controller]);
  const reset = useCallback(() => controller.reset(), [controller]);
  const abort = useCallback((code: string) => controller.abort(code), [controller]);
  const heardText = useCallback(() => controller.heardText, [controller]);

  const previewText = interimText ? (finalText ? `${finalText} ${interimText}` : interimText) : finalText;

  return { previewText, start, stop, reset, status, abort, heardText };
}
