/**
 * Mock content ONLY, for designing the Dream Archive's visual language
 * before real authentication/storage exists. `image` points at existing
 * real photos already shipped in public/dream-assets/ (never a newly
 * generated API image, per spec) — a temporary stand-in for what will be
 * this dream's own actual generated image once real saved dreams (see
 * ../hero/dreamStorage.ts) are wired into the archive.
 *
 * Only 3 distinct plain photos currently exist locally for this purpose
 * (dream-art-alt.jpg, dream-bed-alt.jpg, dream-mirror-alt.jpg — every
 * other image file in the repo is either a UI mockup/storyboard, a
 * reference/diagnostic asset for the THIS IS YOUR DREAM mask work, or
 * the cloud-opening artwork itself, none of which are usable as a plain
 * "dream scene" photo). Assigned here so no two dreams that sit near
 * each other in the constellation layout (see DreamArchive.tsx's
 * LAYOUT) share the same photo, which is the most this can do about
 * visual repetition without either generating new images or adding new
 * asset files — flagged to the user rather than silently worked around.
 */
export interface MockDream {
  id: string;
  title: string;
  /** ISO date string — formatted for display where it's shown. */
  date: string;
  keywords: string[];
  /** Placeholder image standing in for this dream's own generated image. */
  image: string;
}

export const MOCK_DREAMS: MockDream[] = [
  {
    id: 'the-open-door',
    title: 'The Open Door',
    date: '2026-08-30',
    keywords: ['door', 'light', 'curiosity'],
    image: '/dream-assets/dream-art-alt.jpg',
  },
  {
    id: 'the-ocean',
    title: 'The Ocean',
    date: '2026-08-22',
    keywords: ['water', 'freedom', 'distance'],
    image: '/dream-assets/dream-mirror-alt.jpg',
  },
  {
    id: 'grandmother',
    title: 'Grandmother',
    date: '2026-08-14',
    keywords: ['memory', 'love', 'home'],
    image: '/dream-assets/dream-bed-alt.jpg',
  },
  {
    id: 'the-empty-city',
    title: 'The Empty City',
    date: '2026-08-02',
    keywords: ['city', 'silence', 'searching'],
    image: '/dream-assets/dream-mirror-alt.jpg',
  },
  {
    id: 'flying',
    title: 'Flying',
    date: '2026-07-21',
    keywords: ['sky', 'freedom', 'fear'],
    image: '/dream-assets/dream-art-alt.jpg',
  },
  {
    id: 'the-forest',
    title: 'The Forest',
    date: '2026-07-08',
    keywords: ['trees', 'path', 'unknown'],
    image: '/dream-assets/dream-bed-alt.jpg',
  },
];

/** "August 30, 2026" — matches the date style already used across DARE's own copy. */
export function formatMockDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
