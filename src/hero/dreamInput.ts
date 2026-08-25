/**
 * The single normalized shape both capture paths (typed and spoken)
 * ultimately produce. Every field is either exactly what the user
 * typed/said, or null/empty when that data genuinely isn't available —
 * never invented.
 */
export interface DreamInput {
  inputMode: 'voice' | 'text';
  /** Exactly what the user typed. Empty string for voice input. */
  originalText: string;
  /** The real transcription of the recording, or null if none is available (never a placeholder). */
  transcript: string | null;
  /** The recorded audio, or null for typed input / before it's ready. */
  audioBlob: Blob | null;
  /** BCP-47 language tag if known, else null — no guessing. */
  language: string | null;
  createdAt: number;
  /** 'connected': a real transcription mechanism produced (or could produce) `transcript`. 'not_connected': no real transcription is available — `transcript` must not be faked. 'n/a': text input, transcription doesn't apply. */
  transcriptionStatus: 'connected' | 'not_connected' | 'n/a';
}

export function createTextDreamInput(text: string): DreamInput {
  return {
    inputMode: 'text',
    originalText: text,
    transcript: null,
    audioBlob: null,
    language: null,
    createdAt: Date.now(),
    transcriptionStatus: 'n/a',
  };
}

export function createVoiceDreamInput(params: {
  transcript: string | null;
  audioBlob: Blob | null;
  language: string | null;
  transcriptionSupported: boolean;
}): DreamInput {
  return {
    inputMode: 'voice',
    originalText: '',
    transcript: params.transcript,
    audioBlob: params.audioBlob,
    language: params.language,
    createdAt: Date.now(),
    transcriptionStatus: params.transcriptionSupported ? 'connected' : 'not_connected',
  };
}

/** The text this input actually contains, for whichever mode produced it — never fabricated. */
export function dreamInputSourceText(input: DreamInput): string {
  return input.inputMode === 'text' ? input.originalText : (input.transcript ?? '');
}
