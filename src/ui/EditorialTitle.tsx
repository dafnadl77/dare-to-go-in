import { useLanguage } from '../i18n/LanguageContext';

interface EditorialTitleProps {
  text: string;
}

/**
 * Renders English editorial heading text using the SAME word-flow
 * structure and typography axis as the HOME "DARE TO GO IN" logo
 * (.memory-title, MemoryTitle.tsx/.css) — not a separately maintained
 * approximation. Each word becomes its own flex child sharing
 * .editorial-word-flow/.editorial-word (src/index.css), the exact same
 * classes .memory-title itself now uses, so the real inter-word gap
 * (`gap: 0 0.5em`, never a rendered space character) and the logo's
 * measured font-optical-sizing axis are genuinely the same implementation
 * for both, not two rules that happen to agree. The typography axis
 * itself (font-family/weight/opsz/letter-spacing) is NOT redeclared
 * here — it's inherited from whatever heading class wraps this
 * (.da-title, .dd-eyebrow, .ar-title, ...), which already carries
 * .font-editorial-display's shared rule.
 *
 * Deliberately does NOT reproduce .memory-title's per-letter
 * mouse-proximity blur/dissolve animation (see MemoryTitle.tsx) — that's
 * a HOME-specific interactive flourish, orthogonal to what makes text
 * look like the logo (the word structure + typography, both reused here).
 *
 * Hebrew-safe by construction: reads the CURRENT UI language itself
 * (never a prop the caller could get wrong) and renders a plain
 * passthrough of `text` — no word-span structure, no forced LTR — for
 * any language other than English, so Hebrew headings are completely
 * unaffected and keep their own approved typography exactly as before.
 * `text` may contain literal `\n` line breaks (e.g. the reflection
 * question's two-line prompt) — each line becomes its own word-flow row.
 */
export default function EditorialTitle({ text }: EditorialTitleProps) {
  const { language } = useLanguage();
  if (language !== 'en') return <>{text}</>;

  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, li) => (
        <span className="editorial-word-flow" key={li}>
          {line
            .split(' ')
            .filter(Boolean)
            .map((word, wi) => (
              <span className="editorial-word" key={wi}>
                {word}
              </span>
            ))}
        </span>
      ))}
    </>
  );
}
