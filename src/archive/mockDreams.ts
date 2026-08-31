/**
 * Mock content ONLY, for designing the Dream Archive's visual language
 * before real authentication/storage exists. `image` points at existing
 * real photos already shipped in public/dream-assets/ (never a newly
 * generated API image, per spec) — a temporary stand-in for what will be
 * this dream's own actual generated image once real saved dreams (see
 * ../hero/dreamStorage.ts) are wired into the archive. The three photos
 * cycle across the six mocks; nothing about their content is meant to
 * literally match each dream's title.
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
    image: '/dream-assets/dream-bed-alt.jpg',
  },
  {
    id: 'grandmother',
    title: 'Grandmother',
    date: '2026-08-14',
    keywords: ['memory', 'love', 'home'],
    image: '/dream-assets/dream-mirror-alt.jpg',
  },
  {
    id: 'the-empty-city',
    title: 'The Empty City',
    date: '2026-08-02',
    keywords: ['city', 'silence', 'searching'],
    image: '/dream-assets/dream-art-alt.jpg',
  },
  {
    id: 'flying',
    title: 'Flying',
    date: '2026-07-21',
    keywords: ['sky', 'freedom', 'fear'],
    image: '/dream-assets/dream-bed-alt.jpg',
  },
  {
    id: 'the-forest',
    title: 'The Forest',
    date: '2026-07-08',
    keywords: ['trees', 'path', 'unknown'],
    image: '/dream-assets/dream-mirror-alt.jpg',
  },
];

/** "August 30, 2026" — matches the date style already used across DARE's own copy. */
export function formatMockDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
