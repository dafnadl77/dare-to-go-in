/**
 * The archive list's load lifecycle, so "still loading" and "the fetch failed" can never
 * be mistaken for "you have no dreams". Only a SUCCESSFUL fetch that returned zero dreams
 * shows the real empty state.
 */
export type ArchiveLoadStatus = 'loading' | 'ready' | 'error';

export type ArchiveDisplay = 'loading' | 'error' | 'empty' | 'list';

export function archiveDisplay(status: ArchiveLoadStatus, visibleCount: number): ArchiveDisplay {
  if (status === 'loading') return 'loading';
  if (status === 'error') return 'error';
  return visibleCount === 0 ? 'empty' : 'list';
}

/**
 * The next status when a fetch starts. A refetch that happens while a list is already on
 * screen keeps showing it (no flash back to loading); a first load, or a retry from the
 * error state, shows loading.
 */
export function statusWhenFetchStarts(previous: ArchiveLoadStatus): ArchiveLoadStatus {
  return previous === 'ready' ? 'ready' : 'loading';
}

/** A failed background refetch never replaces a list the dreamer can already see with an error. */
export function statusWhenFetchFails(previous: ArchiveLoadStatus): ArchiveLoadStatus {
  return previous === 'ready' ? 'ready' : 'error';
}
