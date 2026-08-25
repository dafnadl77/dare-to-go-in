/**
 * The single normalized shape both capture paths (typed and spoken)
 * ultimately produce. Nothing downstream exists yet (no reconstruction,
 * no AI call) — this is only the handoff object those future stages will
 * consume. Every field is either exactly what the user typed/said, or
 * null/empty when that data genuinely isn't available yet — never invented.
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
}

export function createTextDreamInput(text: string): DreamInput {
  return {
    inputMode: 'text',
    originalText: text,
    transcript: null,
    audioBlob: null,
    language: null,
    createdAt: Date.now(),
  };
}

export function createVoiceDreamInput(params: {
  transcript: string | null;
  audioBlob: Blob | null;
  language: string | null;
}): DreamInput {
  return {
    inputMode: 'voice',
    originalText: '',
    transcript: params.transcript,
    audioBlob: params.audioBlob,
    language: params.language,
    createdAt: Date.now(),
  };
}
