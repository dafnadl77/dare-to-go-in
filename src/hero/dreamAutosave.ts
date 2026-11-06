/**
 * SAVING AN OPEN DREAM AS IT GOES (autosave, 2026-11-05). One write at a time, always the newest state: what is pending is replaced, never
 * queued, so a slow network can never write an older state over a newer one. Free of React and of the network, so the rules are tested
 * exactly.
 *
 * "Saved" is said only after the server confirmed the write. A failed write goes on being tried while the screen is open, with a growing
 * pause up to half a minute; the connection coming back tries at once. `conflict` means another device moved on (the dream is read again), `gone` that
 * the dream no longer exists: nothing is ever written back over a deleted dream.
 */

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'retrying' | 'failing' | 'conflict' | 'gone';
export type WriteResult = 'saved' | 'conflict' | 'gone';
/** The first answer about a state: 'failed' = not saved yet (it is still being tried). */
export type PushResult = WriteResult | 'failed';

/** From this many failures in a row the message asks her to keep the screen open. */
export const FAILURES_BEFORE_WARNING = 3;
const FIRST_PAUSE_MS = 2000;
const LONGEST_PAUSE_MS = 30000;

export const pauseAfter = (failures: number): number => Math.min(LONGEST_PAUSE_MS, FIRST_PAUSE_MS * 2 ** Math.max(0, failures - 1));

export interface AutosaveDeps<S> {
  /** Writes the state on the version last known. Throws when the write did not reach the server. */
  write: (state: S, baseRev: number) => Promise<WriteResult>;
  onStatus: (status: AutosaveStatus) => void;
  wait?: (ms: number) => Promise<void>;
}

export interface Autosave<S> {
  /** Answered when this very state (or a newer one) was written, or when its write failed; a failed state goes on being tried. */
  push: (state: S) => Promise<PushResult>;
  /** The connection is back: tries again at once. */
  retryNow: () => void;
  /** Another device moved on and its version was read: the next write goes on from it. */
  adopt: (rev: number) => void;
  stop: () => void;
  readonly rev: number;
}

export function createAutosave<S>(deps: AutosaveDeps<S>, startRev: number): Autosave<S> {
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let rev = startRev;
  let latest: S | null = null;
  let pushed = 0;
  let running = false;
  let stopped = false;
  let failures = 0;
  let wake: (() => void) | null = null;
  let waiters: { seq: number; resolve: (r: PushResult) => void }[] = [];

  /** Only the states already covered hear the answer: a newer state is never told "saved" for an older write. */
  const answer = (r: PushResult, upTo: number) => {
    waiters = waiters.filter((w) => {
      if (w.seq > upTo) return true;
      w.resolve(r);
      return false;
    });
  };

  const run = async () => {
    if (running || stopped) return;
    running = true;
    while (latest !== null && !stopped) {
      const state: S = latest;
      const seq = pushed;
      latest = null;
      deps.onStatus('saving');
      try {
        const result = await deps.write(state, rev);
        failures = 0;
        if (result === 'saved') {
          rev += 1;
          // a newer state may already be waiting: "saved" is said only when nothing is
          if (latest === null) deps.onStatus('saved');
          answer('saved', seq);
          continue;
        }
        latest = null;
        deps.onStatus(result);
        answer(result, Number.POSITIVE_INFINITY);
        if (result === 'gone') stopped = true;
        break;
      } catch {
        failures += 1;
        if (latest === null) latest = state;
        deps.onStatus(failures >= FAILURES_BEFORE_WARNING ? 'failing' : 'retrying');
        answer('failed', seq);
        await Promise.race([
          wait(pauseAfter(failures)),
          new Promise<void>((resolve) => {
            wake = resolve;
          }),
        ]);
        wake = null;
      }
    }
    running = false;
  };

  return {
    push(state) {
      if (stopped) return Promise.resolve('gone');
      latest = state;
      pushed += 1;
      const seq = pushed;
      const answered = new Promise<PushResult>((resolve) => waiters.push({ seq, resolve }));
      void run();
      return answered;
    },
    retryNow() {
      wake?.();
      if (latest !== null) void run();
    },
    adopt(next) {
      rev = next;
    },
    stop() {
      stopped = true;
      latest = null;
      wake?.();
      answer('gone', Number.POSITIVE_INFINITY);
    },
    get rev() {
      return rev;
    },
  };
}

/** What one autosave write carries: the dream as it stands, and the picture (only the picture that is new is uploaded). */
export interface ProgressState<R = ProgressRecord> {
  record: R;
  image: string | null;
}

interface ProgressRecord {
  id: string;
  dreamImagePath?: string | null;
  journey?: { rev: number };
}

export interface ProgressWriterDeps<R> {
  /** Creates the row when the server could not; the same id, so never a second dream. */
  open: (record: R, ownerId: string) => Promise<void>;
  upload: (ownerId: string, dreamId: string, image: string) => Promise<string>;
  save: (record: R, ownerId: string, baseRev: number) => Promise<WriteResult>;
  removeImage: (path: string) => Promise<void>;
}

/**
 * One write of an open dream: the row if it is missing, the picture if it is new, then the dream on its version. The picture counts as
 * saved only with the row that points to it; a picture uploaded for a dream deleted meanwhile is removed again.
 */
export function createProgressWriter<R extends ProgressRecord>(
  start: { ownerId: string; opened: boolean; imagePath: string | null; savedImage: string | null },
  deps: ProgressWriterDeps<R>,
) {
  let { opened, imagePath, savedImage } = start;
  return async (state: ProgressState<R>, baseRev: number): Promise<WriteResult> => {
    if (!opened) {
      await deps.open(state.record, start.ownerId);
      opened = true;
    }
    const uploaded = state.image && state.image !== savedImage ? await deps.upload(start.ownerId, state.record.id, state.image) : null;
    const path = uploaded ?? imagePath;
    const result = await deps.save(
      { ...state.record, dreamImagePath: path, journey: { ...state.record.journey, rev: baseRev + 1 } } as R,
      start.ownerId,
      baseRev,
    );
    if (result === 'saved') {
      imagePath = path;
      savedImage = state.image ?? savedImage;
    } else if (result === 'gone' && uploaded) {
      await deps.removeImage(uploaded).catch(() => undefined);
    }
    return result;
  };
}
