/**
 * Mock content ONLY, for designing the Dream Archive's visual language
 * before real authentication/storage exists. Never generated via the real
 * image API (per spec) — each dream gets a soft, hand-tuned gradient
 * "memory window" tinted to its own mood instead of a mismatched stock
 * photo. Swap this module out entirely once real saved dreams (see
 * ../hero/dreamStorage.ts) are wired into the archive; nothing else
 * should need to change shape-wise, since MockDream deliberately mirrors
 * the fields a real SavedDream can actually supply (title, date, a
 * handful of keywords, an image).
 */
export interface MockDream {
  id: string;
  title: string;
  /** ISO date string — formatted for display where it's shown. */
  date: string;
  keywords: string[];
  /** A two-stop gradient standing in for the dream's own generated image. */
  gradient: [string, string];
}

export const MOCK_DREAMS: MockDream[] = [
  {
    id: 'the-open-door',
    title: 'The Open Door',
    date: '2026-08-30',
    keywords: ['door', 'light', 'curiosity'],
    gradient: ['#4a3a1e', '#e8c77e'],
  },
  {
    id: 'the-ocean',
    title: 'The Ocean',
    date: '2026-08-22',
    keywords: ['water', 'freedom', 'distance'],
    gradient: ['#0f2a3a', '#3f8a9c'],
  },
  {
    id: 'grandmother',
    title: 'Grandmother',
    date: '2026-08-14',
    keywords: ['memory', 'love', 'home'],
    gradient: ['#3a1f22', '#c98a6b'],
  },
  {
    id: 'the-empty-city',
    title: 'The Empty City',
    date: '2026-08-02',
    keywords: ['city', 'silence', 'searching'],
    gradient: ['#1c1e2a', '#5b6a8c'],
  },
  {
    id: 'flying',
    title: 'Flying',
    date: '2026-07-21',
    keywords: ['sky', 'freedom', 'fear'],
    gradient: ['#152238', '#7fa8d9'],
  },
  {
    id: 'the-forest',
    title: 'The Forest',
    date: '2026-07-08',
    keywords: ['trees', 'path', 'unknown'],
    gradient: ['#131f18', '#4f7a52'],
  },
];

/** "August 30, 2026" — matches the date style already used across DARE's own copy. */
export function formatMockDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}
