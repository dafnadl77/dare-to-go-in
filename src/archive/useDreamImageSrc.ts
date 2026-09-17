import { useEffect, useState } from 'react';
import type { ArchiveEntry } from './archiveData';
import { getSignedDreamImageUrl } from '../hero/dreamImageStorage';

/**
 * Resolves the real `<img>`/background-image src for one archive entry.
 *
 * `entry.image` (see archiveData.ts's toEntry) is already exactly right,
 * synchronously, for the two cases that need no Storage call at all: a
 * legacy base64 dream (`dreamImageDataUrl` set) renders that directly,
 * and a dream with no image at all falls back to the existing static
 * placeholder — both completely unchanged by Phase 2.
 *
 * The only new case is a Storage-backed dream (`dreamImagePath` set,
 * `dreamImageDataUrl` deliberately absent — see saveDreamRemote): this
 * mints a signed URL on mount and swaps to it once ready. Before that
 * resolves, `entry.image` is already the static fallback (since
 * `dreamImageDataUrl` is null for these dreams), so there's no separate
 * loading state to design — just a brief, expected fallback-to-real
 * swap, same as any lazily-loaded image.
 *
 * The signed URL is kept only in this hook's own React state — never
 * written to public.dreams, localStorage, or SavedDream itself.
 */
export function useDreamImageSrc(entry: ArchiveEntry): string {
  const path = entry.kind === 'real' ? (entry.savedDream.dreamImagePath ?? null) : null;
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setSignedUrl(null);
      return;
    }
    let cancelled = false;
    getSignedDreamImageUrl(path).then((url) => {
      if (!cancelled) setSignedUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return path ? (signedUrl ?? entry.image) : entry.image;
}
