/**
 * Diagnostic-only flag and shared types for verifying whether the real
 * MediaRecorder capture on a real device actually contains audible
 * speech, before trusting anything about the OpenAI transcription step
 * downstream. Reading this flag has zero effect unless the page is
 * loaded with ?audioDiag=1 — normal visits never see any of this.
 */
function readParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

/** ?audioDiag=1 — show the real-recording diagnostic panel (playback +
    MediaRecorder/track internals + upload/transcription result). */
export const AUDIO_DIAG_VISIBLE = readParam('audioDiag') === '1';

export interface AudioTrackSnapshot {
  readyState: MediaStreamTrackState | null;
  enabled: boolean | null;
  muted: boolean | null;
  live: boolean;
}

export interface RecordingDiag {
  /** What we asked MediaRecorder.isTypeSupported() to confirm before construction. */
  requestedMimeType: string;
  /** What the browser actually reports via recorder.mimeType once constructed. */
  actualMimeType: string;
  /** recorder.start() here is always called with no timeslice argument —
      per the Web Speech/MediaRecorder spec that means ondataavailable
      fires exactly once, at stop, with the whole clip in one chunk. This
      records that fact for the panel rather than leaving it assumed. */
  startedWithTimeslice: boolean;
  chunkSizes: number[];
  chunkTypes: string[];
  totalBytesFromChunks: number;
  blobSize: number;
  blobType: string;
  durationMs: number;
  trackAtStart: AudioTrackSnapshot | null;
  trackAtStop: AudioTrackSnapshot | null;
  streamActiveAtStop: boolean | null;
  /** A short chronological log: 'onstart', 'ondataavailable size=1234 type=audio/webm', 'onstop', 'onerror: ...' */
  events: string[];
}
