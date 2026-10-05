import type { JournalDocument, JournalDream, JournalImage } from './journalTypes.js';
import { fixtureImages, sampleDocument } from '../../tests/journalFixtures.js';

/**
 * PREVIEW VALIDATION ONLY. Demo journals built from invented dreams and the site's own artwork; no user data exists in
 * this module and nothing here can read any. Not part of the production export path.
 */

export type FixtureKind = 'en' | 'he' | 'mixed' | 'stress';

/** The same JPEG with one extra comment segment, so every dream carries DIFFERENT bytes (a real archive never repeats one image). */
function uniqueVariant(image: JournalImage, tag: number): JournalImage {
  const base64 = image.dataUri.slice(image.dataUri.indexOf(',') + 1);
  const bytes = Buffer.from(base64, 'base64');
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return image;
  const comment = Buffer.from(`preview-fixture-${tag}`, 'latin1');
  const segment = Buffer.concat([Buffer.from([0xff, 0xfe, 0, comment.length + 2]), comment]);
  const out = Buffer.concat([bytes.subarray(0, 2), segment, bytes.subarray(2)]);
  return { ...image, dataUri: `data:image/jpeg;base64,${out.toString('base64')}` };
}

export function buildFixtureDocument(kind: FixtureKind, count = 12): JournalDocument {
  if (kind === 'en') return sampleDocument('en');
  if (kind === 'he') return sampleDocument('he');
  const en = sampleDocument('en');
  const he = sampleDocument('he');
  if (kind === 'mixed') {
    // Hebrew journal whose dreams alternate between Hebrew and English.
    const dreams: JournalDream[] = [];
    for (let i = 0; i < Math.max(en.dreams.length, he.dreams.length); i += 1) {
      if (he.dreams[i]) dreams.push({ ...he.dreams[i], id: `mixed-he-${i}` });
      if (en.dreams[i]) dreams.push({ ...en.dreams[i], id: `mixed-en-${i}` });
    }
    return { language: 'he', timeZone: 'Asia/Jerusalem', dreams, patterns: [...he.patterns, ...en.patterns] };
  }
  // stress: `count` dreams cycling through the 12 templates (every fourth one is a long dream), each with a unique image.
  const templates = [...en.dreams, ...he.dreams];
  const pool = Object.values(fixtureImages()).filter((img) => img.dataUri.length < 1_000_000);
  const dreams: JournalDream[] = Array.from({ length: count }, (_, i) => {
    const t = templates[i % templates.length];
    const long = templates[i % 2 === 0 ? 1 : 7];
    const useLong = i % 4 === 1;
    const image = i % 7 === 6 ? null : uniqueVariant(pool[i % pool.length], i);
    const date = new Date(Date.UTC(2022, 0, 5 + i * 11, 20, 0, 0)).toISOString();
    return { ...t, id: `stress-${i + 1}`, createdAt: date, title: `${t.title} ${i + 1}`, sourceText: useLong ? long.sourceText : t.sourceText, image };
  });
  return { language: 'en', timeZone: 'Asia/Jerusalem', dreams, patterns: en.patterns };
}
