/**
 * After immediate danger or a threat (doc 106), this page sends no more AI requests until it is opened again. In memory only: nothing
 * is written to the device, so nothing marks the dreamer afterwards.
 */
let stopped: 'danger' | 'threat' | null = null;

export function stopForSession(level: 'danger' | 'threat'): void {
  stopped = level;
}

export function sessionStopped(): 'danger' | 'threat' | null {
  return stopped;
}

export function resetSessionStopForTests(): void {
  stopped = null;
}

/** The browser hears that the server asked for the age question (403 age_required); the app shows it. */
export const AGE_REQUIRED_EVENT = 'dare:age-required';
