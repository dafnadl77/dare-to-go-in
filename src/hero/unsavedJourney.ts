/**
 * When is a dream journey worth protecting, and how a leave request is decided.
 * Kept free of React and of any app import so the rules are testable exactly.
 */

/** The Dream Stage steps after which nothing is left to lose (saved), or the dreamer chose to let it go. */
const RESOLVED_STEPS = new Set(['saved', 'letting-go', 'gone']);

/**
 * A dream is "meaningfully unsaved" once it has actually been analyzed (a real result
 * exists, and for a signed-in account a credit has been spent on it) and it has
 * neither been saved nor deliberately let go. Nothing before that is warned about,
 * and normal step-to-step progression inside the Dream Stage never changes the answer.
 * `saving` still counts as unsaved: the write has not been confirmed yet.
 */
export function hasUnsavedDream(state: { analysisOk: boolean; insideStep: string }): boolean {
  return state.analysisOk && !RESOLVED_STEPS.has(state.insideStep);
}

/** 'proceed' = navigate straight away; 'confirm' = ask first. */
export function decideLeave(unsaved: boolean): 'proceed' | 'confirm' {
  return unsaved ? 'confirm' : 'proceed';
}

/**
 * The tiny state machine behind the in-app "leave this dream?" dialog.
 *  - request(action): runs `action` immediately when nothing is unsaved, otherwise
 *    parks it and reports that a confirmation is needed.
 *  - confirm(): discards the journey FIRST (which invalidates its epoch), then runs the
 *    parked action.
 *  - cancel(): drops the parked action; nothing else changes.
 */
export function createLeaveGate(discardJourney: () => void) {
  let pending: (() => void) | null = null;
  return {
    request(action: () => void, unsaved: boolean): 'ran' | 'needs-confirmation' {
      if (decideLeave(unsaved) === 'proceed') {
        pending = null;
        action();
        return 'ran';
      }
      pending = action;
      return 'needs-confirmation';
    },
    confirm(): boolean {
      const action = pending;
      pending = null;
      if (!action) return false;
      discardJourney();
      action();
      return true;
    },
    cancel(): void {
      pending = null;
    },
    hasPending(): boolean {
      return pending !== null;
    },
  };
}

/** The `beforeunload` handler for refresh / tab close / leaving the site. Only ever attached while a dream is unsaved. */
export function handleBeforeUnload(event: { preventDefault(): void; returnValue?: unknown }): string {
  event.preventDefault();
  // Legacy browsers require a returnValue to show their generic confirmation.
  event.returnValue = '';
  return '';
}
