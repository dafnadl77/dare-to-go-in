/**
 * The live words shown WHILE the dreamer records, from the browser's own SpeechRecognition (Web Speech API). Purely cosmetic and
 * best effort: the authoritative text always comes from the recording itself (MediaRecorder -> /api/dream-transcription), and
 * nothing here can interrupt that recording. A plain class (the environment is injected) so its restart/stop rules are tested.
 *
 * What it does with the browser's errors (https://wicg.github.io/speech-api/#speechrecognitionerrorevent):
 *   - 'no-speech'  Chrome ends a continuous session after ~8 s of silence with this error. It is NOT a failure of the feature:
 *                  a dreamer who pauses to remember has simply not spoken yet. The session is restarted.
 *   - 'aborted'    a session was cancelled (by us, or by the page losing the microphone for a moment): restarted if still wanted.
 *   - anything else ('not-allowed', 'service-not-allowed', 'network', 'audio-capture', 'language-not-supported', ...) is a real
 *                  reason no words can appear in this browser right now: the preview stops, quietly (it is decorative), and the
 *                  reason is kept in `errorCode` and written once to the console so it can be diagnosed.
 * Before this, EVERY error (including the common, harmless 'no-speech') stopped the preview for the rest of the recording and left
 * no trace of why.
 */
export interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
export interface SpeechRecognitionResultLike {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}
export interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}
export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

export interface LivePreviewEnv {
  /** null = this browser has no SpeechRecognition at all. */
  createRecognition: (() => SpeechRecognitionLike) | null;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  warn: (message: string) => void;
}

/** idle = not started; starting = asked, nothing heard yet; live = words have arrived; stopped = ended (finished, failed or
    aborted); unsupported = this browser has no SpeechRecognition at all. */
export type LivePreviewStatus = 'idle' | 'starting' | 'live' | 'stopped' | 'unsupported';

export interface LivePreviewListener {
  onText: (finalText: string, interimText: string) => void;
  /** Optional: told whenever the status changes (the screen uses it to be honest about whether live words are really running). */
  onStatus?: (status: LivePreviewStatus) => void;
}

/** Errors that are not a failure of the feature: the session is simply started again. */
export const BENIGN_SPEECH_ERRORS: ReadonlySet<string> = new Set(['no-speech', 'aborted']);
/** A bound so a browser that keeps ending sessions can never loop forever (each silent session is ~8 s, so this covers a long recording). */
export const MAX_PREVIEW_RESTARTS = 120;
/** A short pause before starting the next session, so a browser that ends one immediately cannot spin. */
export const PREVIEW_RESTART_DELAY_MS = 250;

export function browserLivePreviewEnv(): LivePreviewEnv {
  const w = typeof window === 'undefined' ? null : (window as typeof window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike });
  const Ctor = w?.SpeechRecognition ?? w?.webkitSpeechRecognition ?? null;
  return {
    createRecognition: Ctor ? () => new Ctor() : null,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    warn: (message) => console.warn(message),
  };
}

export class LivePreviewController {
  /** Why the preview stopped for good, if it did (a browser error code); null while it is running or was never started. */
  errorCode: string | null = null;
  /** Whether live words are running right now (see LivePreviewStatus). */
  status: LivePreviewStatus = 'idle';

  private recognition: SpeechRecognitionLike | null = null;
  private wanted = false;
  private restarts = 0;
  private restartTimer: unknown = null;
  private finalText = '';
  private interimText = '';
  private lang = 'en-US';
  private warned = false;

  private readonly env: LivePreviewEnv;
  private readonly listener: LivePreviewListener;

  constructor(env: LivePreviewEnv, listener: LivePreviewListener) {
    this.env = env;
    this.listener = listener;
  }

  private emit(): void {
    this.listener.onText(this.finalText, this.interimText);
  }

  private setStatus(status: LivePreviewStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.listener.onStatus?.(status);
  }

  private fail(code: string): void {
    this.wanted = false;
    this.errorCode = code;
    this.setStatus('stopped');
    if (!this.warned) {
      this.warned = true;
      this.env.warn(`speech_preview_stopped code=${code}`);
    }
  }

  private attach(): void {
    const create = this.env.createRecognition;
    if (!create) {
      this.setStatus('unsupported');
      return;
    }

    let recognition: SpeechRecognitionLike;
    try {
      recognition = create();
      recognition.lang = this.lang;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
    } catch {
      this.fail('construct-failed');
      return;
    }

    recognition.onresult = (event) => {
      this.restarts = 0; // it is hearing the dreamer: the silence budget starts over
      if (this.wanted) this.setStatus('live');
      let interim = '';
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) finalChunk += text;
        else interim += text;
      }
      if (finalChunk) this.finalText = this.finalText ? `${this.finalText} ${finalChunk.trim()}` : finalChunk.trim();
      this.interimText = interim.trim();
      this.emit();
    };
    recognition.onerror = (event) => {
      const code = event?.error ?? 'unknown';
      if (BENIGN_SPEECH_ERRORS.has(code)) return; // onend follows and restarts the session
      this.fail(code);
    };
    recognition.onend = () => {
      if (this.recognition !== recognition) return; // an older session finishing after a newer one began
      if (!this.wanted) return;
      if (this.restarts >= MAX_PREVIEW_RESTARTS) {
        this.fail('restart-limit');
        return;
      }
      this.restarts += 1;
      this.restartTimer = this.env.setTimeout(() => {
        this.restartTimer = null;
        if (this.wanted) this.attach();
      }, PREVIEW_RESTART_DELAY_MS);
    };

    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      this.fail('start-failed');
    }
  }

  /** Best effort: safe to call when unsupported (does nothing). */
  start(lang: 'en' | 'he'): void {
    this.wanted = true;
    this.errorCode = null;
    this.warned = false;
    this.restarts = 0;
    this.finalText = '';
    this.interimText = '';
    this.lang = lang === 'he' ? 'he-IL' : 'en-US';
    this.status = 'idle';
    this.setStatus(this.env.createRecognition ? 'starting' : 'unsupported');
    this.emit();
    if (this.restartTimer !== null) {
      this.env.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    // A session left over from an earlier recording must not keep running beside the new one.
    try {
      this.recognition?.abort();
    } catch {
      // disposable
    }
    this.attach();
  }

  stop(): void {
    this.wanted = false;
    if (this.status === 'starting' || this.status === 'live') this.setStatus('stopped');
    if (this.restartTimer !== null) {
      this.env.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    try {
      this.recognition?.stop();
    } catch {
      // disposable — nothing to react to
    }
  }

  /** Switches the live words off at once and keeps the reason (used when they are suspected of competing with the recording
      for the microphone). Unlike stop(), the session is aborted, not allowed to deliver a last result. */
  abort(code: string): void {
    this.wanted = false;
    if (this.restartTimer !== null) {
      this.env.clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    try {
      this.recognition?.abort();
    } catch {
      // disposable
    }
    this.fail(code);
  }

  /** What was heard so far (final + interim), for a fallback when the recording itself could not be transcribed. */
  get heardText(): string {
    return [this.finalText, this.interimText].filter(Boolean).join(' ').trim();
  }

  reset(): void {
    this.finalText = '';
    this.interimText = '';
    this.emit();
  }
}
