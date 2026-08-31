/**
 * Mock content ONLY, for designing the Dream Archive's visual language
 * before every dreamer has enough real saved dreams to fill a timeline.
 * `image` points at existing real photos already shipped in
 * public/dream-assets/ (never a newly generated API image, per spec) — a
 * temporary stand-in for what will be this dream's own actual generated
 * image once real saved dreams (see ../hero/dreamStorage.ts) fill this
 * slot in the chronology instead.
 *
 * Titles/dates/keywords match the approved MY DREAM ARCHIVE reference
 * exactly. Only 3 distinct plain photos currently exist locally for the
 * `image` field (dream-art-alt.jpg, dream-bed-alt.jpg,
 * dream-mirror-alt.jpg — every other image file in the repo is either a
 * UI mockup/storyboard, a reference/diagnostic asset for the THIS IS YOUR
 * DREAM mask work, or the cloud-opening artwork itself, none of which are
 * usable as a plain "dream scene" photo), assigned here so no two dreams
 * adjacent in the timeline share the same photo — the most this can do
 * about visual repetition without generating new images or adding new
 * asset files, flagged to the user rather than silently worked around.
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
    keywords: ['curiosity', 'change', 'possibility'],
    image: '/dream-assets/dream-art-alt.jpg',
  },
  {
    id: 'the-ocean',
    title: 'The Ocean',
    date: '2026-08-22',
    keywords: ['freedom', 'depth', 'flow'],
    image: '/dream-assets/dream-mirror-alt.jpg',
  },
  {
    id: 'grandmother',
    title: 'Grandmother',
    date: '2026-08-14',
    keywords: ['love', 'wisdom', 'roots'],
    image: '/dream-assets/dream-bed-alt.jpg',
  },
  {
    id: 'the-empty-city',
    title: 'The Empty City',
    date: '2026-08-02',
    keywords: ['silence', 'lost', 'search'],
    image: '/dream-assets/dream-mirror-alt.jpg',
  },
  {
    id: 'flying',
    title: 'Flying',
    date: '2026-07-21',
    keywords: ['freedom', 'lightness', 'escape'],
    image: '/dream-assets/dream-art-alt.jpg',
  },
  {
    id: 'the-forest',
    title: 'The Forest',
    date: '2026-07-08',
    keywords: ['growth', 'peace', 'return'],
    image: '/dream-assets/dream-bed-alt.jpg',
  },
];
