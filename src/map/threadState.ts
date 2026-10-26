import type { ConversationTurn } from '../hero/exploration';

/**
 * Where a moment's conversation stands, said plainly under it (doc 102): DARE is writing; DARE asked something and waits for her;
 * DARE said something and she may go on, move to another moment, or finish; or the moment was already talked about.
 */
export type ThreadState = 'writing' | 'waiting' | 'open' | 'done';

export function threadState(turns: readonly ConversationTurn[], pending: boolean, explored: boolean): ThreadState {
  if (explored) return 'done';
  if (pending) return 'writing';
  const last = turns[turns.length - 1];
  if (!last || last.role !== 'dare') return 'open';
  return /\?/.test(last.offer ?? '') || /\?/.test(last.text) ? 'waiting' : 'open';
}
