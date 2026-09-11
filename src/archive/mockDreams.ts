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
 *
 * Real, human-written EN and HE copy for every field that displays as UI
 * content (title/excerpt/keywords) — mock/sample data is exactly the kind
 * of thing that must follow the current interface language, unlike a
 * dreamer's own saved words (see archiveData.ts's titleFromSavedDream for
 * that distinction).
 */
export interface MockDreamCopy {
  title: string;
  /** One short sentence — what the card's excerpt line shows. */
  excerpt: string;
  keywords: string[];
}

export interface MockDream {
  id: string;
  /** ISO date string — formatted for display where it's shown. */
  date: string;
  /** Placeholder image standing in for this dream's own generated image. */
  image: string;
  en: MockDreamCopy;
  he: MockDreamCopy;
}

export const MOCK_DREAMS: MockDream[] = [
  {
    id: 'the-open-door',
    date: '2026-08-30',
    image: '/dream-assets/dream-art-alt.jpg',
    en: {
      title: 'The Open Door',
      excerpt: 'A door I had never noticed before stood open at the end of the hallway.',
      keywords: ['curiosity', 'change', 'possibility'],
    },
    he: {
      title: 'הדלת הפתוחה',
      excerpt: 'דלת שמעולם לא שמתי לב אליה עמדה פתוחה בקצה המסדרון.',
      keywords: ['סקרנות', 'שינוי', 'אפשרות'],
    },
  },
  {
    id: 'the-ocean',
    date: '2026-08-22',
    image: '/dream-assets/dream-mirror-alt.jpg',
    en: {
      title: 'The Ocean',
      excerpt: 'I was floating far from shore, weightless, the water warm and endless.',
      keywords: ['freedom', 'depth', 'flow'],
    },
    he: {
      title: 'האוקיינוס',
      excerpt: 'צפתי רחוק מהחוף, חסרת משקל, המים חמים וללא סוף.',
      keywords: ['חופש', 'עומק', 'זרימה'],
    },
  },
  {
    id: 'grandmother',
    date: '2026-08-14',
    image: '/dream-assets/dream-bed-alt.jpg',
    en: {
      title: 'Grandmother',
      excerpt: 'She was in the kitchen again, humming the same old song as always.',
      keywords: ['love', 'wisdom', 'roots'],
    },
    he: {
      title: 'סבתא',
      excerpt: 'היא הייתה שוב במטבח, מזמזמת את אותו שיר ישן כמו תמיד.',
      keywords: ['אהבה', 'חוכמה', 'שורשים'],
    },
  },
  {
    id: 'the-empty-city',
    date: '2026-08-02',
    image: '/dream-assets/dream-mirror-alt.jpg',
    en: {
      title: 'The Empty City',
      excerpt: 'Every street was mine alone — no cars, no voices, just quiet windows.',
      keywords: ['silence', 'lost', 'search'],
    },
    he: {
      title: 'העיר הריקה',
      excerpt: 'כל רחוב היה שלי בלבד — בלי מכוניות, בלי קולות, רק חלונות שקטים.',
      keywords: ['שקט', 'אבוד', 'חיפוש'],
    },
  },
  {
    id: 'flying',
    date: '2026-07-21',
    image: '/dream-assets/dream-art-alt.jpg',
    en: {
      title: 'Flying',
      excerpt: 'I only had to lean forward and the ground would let me go.',
      keywords: ['freedom', 'lightness', 'escape'],
    },
    he: {
      title: 'מעוף',
      excerpt: 'רק הייתי צריכה להתכופף קדימה והקרקע הייתה משחררת אותי.',
      keywords: ['חופש', 'קלילות', 'בריחה'],
    },
  },
  {
    id: 'the-forest',
    date: '2026-07-08',
    image: '/dream-assets/dream-bed-alt.jpg',
    en: {
      title: 'The Forest',
      excerpt: 'The trees were taller than I remembered, and somehow they knew my name.',
      keywords: ['growth', 'peace', 'return'],
    },
    he: {
      title: 'היער',
      excerpt: 'העצים היו גבוהים מכפי שזכרתי, ומאיזושהי סיבה הם ידעו את שמי.',
      keywords: ['צמיחה', 'שלווה', 'חזרה'],
    },
  },
];
