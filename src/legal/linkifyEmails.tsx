import type { ReactNode } from 'react';
import { splitEmails } from './emailPattern';

/** Plain legal text with any email address made a real mailto: link — the text itself stays untouched plain strings. */
export function linkifyEmails(text: string): ReactNode[] {
  return splitEmails(text).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} className="legal-email-link" href={`mailto:${part}`} dir="ltr">
        {part}
      </a>
    ) : (
      part
    ),
  );
}
