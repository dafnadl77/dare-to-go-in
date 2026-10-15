import type { ReactNode } from 'react';
import { linkifyEmails } from './linkifyEmails';

/**
 * Renders one legal section's body as plain text nodes (never HTML): paragraphs are separated by a blank line, and a paragraph whose lines
 * all start with "- " becomes a bulleted list. Used by the Legal page and by the policy dialog, so both show a document identically.
 */
export default function LegalBody({ body, paragraphClass, listClass }: { body: string; paragraphClass: string; listClass: string }): ReactNode {
  return body.split('\n\n').map((paragraph, i) => {
    const lines = paragraph.split('\n');
    if (lines.length > 0 && lines.every((line) => line.startsWith('- '))) {
      return (
        <ul className={listClass} key={i}>
          {lines.map((line, j) => (
            <li key={j}>{linkifyEmails(line.slice(2))}</li>
          ))}
        </ul>
      );
    }
    return (
      <p className={paragraphClass} key={i}>
        {linkifyEmails(paragraph)}
      </p>
    );
  });
}
