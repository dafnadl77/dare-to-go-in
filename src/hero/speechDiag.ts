/**
 * Diagnostic-only event log for the HOLD → mic → speech-recognition
 * pipeline. Exists purely so a real-device test can be reported back with
 * exact evidence (which lifecycle stage was reached, the exact error, exact
 * timing/order between getUserMedia/MediaRecorder and SpeechRecognition) —
 * it never reads app state and never changes app behavior in the normal
 * path. Always logs to the console; also mirrors into a small on-screen
 * panel when the page is loaded with ?diaglog=1 (see SpeechDiagPanel.tsx),
 * since a phone in someone's hand usually has no attached devtools to read
 * console output from.
 */
export interface DiagEvent {
  t: number;
  type: string;
  detail?: Record<string, unknown>;
}

const log: DiagEvent[] = [];
const listeners = new Set<(e: DiagEvent) => void>();
const t0 = typeof performance !== 'undefined' ? performance.now() : 0;

export function logDiag(type: string, detail?: Record<string, unknown>): void {
  const entry: DiagEvent = {
    t: Math.round((typeof performance !== 'undefined' ? performance.now() : 0) - t0),
    type,
    detail,
  };
  log.push(entry);
  // eslint-disable-next-line no-console
  console.log(`[diag +${entry.t}ms] ${type}`, detail ?? '');
  listeners.forEach((fn) => fn(entry));
  if (typeof window !== 'undefined') {
    (window as unknown as { __speechDiagLog?: DiagEvent[] }).__speechDiagLog = log;
  }
}

export function subscribeDiag(fn: (e: DiagEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getDiagLog(): DiagEvent[] {
  return log;
}

function readParam(name: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

/** ?diaglog=1 — show the on-screen diagnostic panel (no devtools needed). */
export const DIAG_LOG_VISIBLE = readParam('diaglog') === '1';

/** ?diag=speechonly — controlled test: SpeechRecognition runs WITHOUT
    useDreamRecorder/MediaRecorder ever opening the mic, to isolate whether
    the two are contending for the microphone/audio session. Diagnostic
    only, off by default; never removes recording in the normal path — it
    only takes effect when this exact query value is present. */
export const DIAG_SPEECH_ONLY = readParam('diag') === 'speechonly';
