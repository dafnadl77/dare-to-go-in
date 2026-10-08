/**
 * Why a recording could not START, named from what the browser actually reported — so the screen can say the real thing instead of
 * one line ("I couldn't access your microphone") for every different failure. Pure: no browser objects, so it is tested directly.
 *
 * `error` is whatever DreamRecorderController left in errorRef: the browser's own error name for the permission/device step
 * (NotAllowedError, NotFoundError, ...), or one of the controller's own codes ('unsupported', 'insecure-context',
 * 'recorder-unsupported', 'start-not-confirmed', 'recorder-create:<name>', 'recorder-start:<name>').
 */
export type MicFailureKind =
  | 'permission-denied'
  | 'no-device'
  | 'device-busy'
  | 'insecure-context'
  | 'unsupported'
  | 'format-unsupported'
  | 'start-failed'
  | 'timeout'
  | 'unknown';

const PERMISSION_DENIED = new Set(['NotAllowedError', 'PermissionDeniedError', 'SecurityError']);
const NO_DEVICE = new Set(['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError', 'ConstraintNotSatisfiedError']);
const DEVICE_BUSY = new Set(['NotReadableError', 'TrackStartError', 'AbortError']);

export function classifyMicFailure(error: string | null, timedOut: boolean): MicFailureKind {
  // The permission prompt (or the device) never answered within the wait: not a refusal, not a missing device.
  if (timedOut) return 'timeout';
  if (!error) return 'unknown';
  if (PERMISSION_DENIED.has(error)) return 'permission-denied';
  if (NO_DEVICE.has(error)) return 'no-device';
  if (DEVICE_BUSY.has(error)) return 'device-busy';
  if (error === 'insecure-context') return 'insecure-context';
  if (error === 'unsupported' || error === 'recorder-unsupported') return 'unsupported';
  // The microphone itself WAS reached; the browser then could not create a recorder for it.
  if (error.startsWith('recorder-create:')) return 'format-unsupported';
  if (error === 'start-not-confirmed' || error.startsWith('recorder-start:')) return 'start-failed';
  return 'unknown';
}

/** The translation key (under `hold.`) for each failure. */
export const MIC_FAILURE_MESSAGE_KEY: Record<MicFailureKind, string> = {
  'permission-denied': 'hold.micDenied',
  'no-device': 'hold.micNoDevice',
  'device-busy': 'hold.micBusy',
  'insecure-context': 'hold.micInsecure',
  unsupported: 'hold.micUnsupported',
  'format-unsupported': 'hold.micFormat',
  'start-failed': 'hold.micErrorStartFailed',
  timeout: 'hold.micTimeout',
  unknown: 'hold.micErrorGeneric',
};
