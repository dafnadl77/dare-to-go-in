import { getSignedDreamImageUrl } from './dreamImageStorage';
import { parseExploration, type Exploration } from './exploration';
import { resumePlan } from './dreamJourneyRecord';
import type { SavedDream } from './dreamStorage';

/**
 * COMING BACK TO AN OPEN DREAM (autosave, 2026-11-05). Everything the journey needs is read before it opens, so it starts at its own
 * step and nothing paid runs again. The picture is read into the page itself: a picture from another address could not give the dream
 * its colours.
 */

export interface DreamResume {
  dream: SavedDream;
  exploration: Exploration | null;
  imageUrl: string | null;
  phase: 'none' | 'reveal' | 'inside';
  insideStep: 'emotions' | 'map' | 'interpreting' | 'reflection' | 'closing';
}

export function resumeFrom(dream: SavedDream, imageUrl: string | null): DreamResume {
  return { dream, exploration: dream.exploration ? parseExploration(dream.exploration) : null, imageUrl, ...resumePlan(dream.journey, imageUrl !== null) };
}

const asDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

async function loadDreamImage(path: string): Promise<string | null> {
  const signed = await getSignedDreamImageUrl(path);
  if (!signed) return null;
  try {
    const res = await fetch(signed);
    return res.ok ? await asDataUrl(await res.blob()) : signed;
  } catch {
    return signed;
  }
}

export async function prepareResume(dream: SavedDream): Promise<DreamResume> {
  return resumeFrom(dream, dream.dreamImagePath ? await loadDreamImage(dream.dreamImagePath) : null);
}

/** A refresh of this tab comes back to the dream it was on. Only the dream's id, and only for this tab. */
const OPEN_DREAM_KEY = 'dare.openDream';

export function rememberOpenDream(id: string): void {
  try {
    sessionStorage.setItem(OPEN_DREAM_KEY, id);
  } catch {
    // without it a refresh simply lands on the room; the dream itself is in the archive
  }
}

export function forgetOpenDream(): void {
  try {
    sessionStorage.removeItem(OPEN_DREAM_KEY);
  } catch {
    // nothing to forget
  }
}

export function openDreamInThisTab(): string | null {
  try {
    return sessionStorage.getItem(OPEN_DREAM_KEY);
  } catch {
    return null;
  }
}
