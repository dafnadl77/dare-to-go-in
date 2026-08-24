import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { PointerState } from './usePointerRef';
import './MemoryTitle.css';

interface MemoryTitleProps {
  revealed: boolean;
  /** True once the room begins listening — the title softens into the environment. */
  dissolving?: boolean;
  pointerRef: RefObject<PointerState>;
}

const TITLE = 'DARE TO GO IN';
const VARIANTS = ['a', 'b', 'c'] as const;

function hashSeed(i: number) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const CHAR_COUNT = TITLE.replace(/ /g, '').length;

export default function MemoryTitle({ revealed, dissolving = false, pointerRef }: MemoryTitleProps) {
  const rootRef = useRef<HTMLHeadingElement>(null);
  const spanRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const phaseRef = useRef<number[]>(
    Array.from({ length: CHAR_COUNT }, (_, i) => hashSeed(i + 31) * Math.PI * 2),
  );

  const words = useMemo(() => TITLE.split(' '), []);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setSettled(true), 4000);
    return () => clearTimeout(timer);
  }, [revealed]);

  useEffect(() => {
    let raf = 0;
    const spans = spanRefs.current;
    const phases = phaseRef.current;

    function frame(now: number) {
      const pointer = pointerRef.current;
      if (pointer && rootRef.current) {
        const t = now * 0.001;
        for (let i = 0; i < spans.length; i++) {
          const span = spans[i];
          if (!span) continue;
          const rect = span.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dist = Math.hypot(pointer.x - cx, pointer.y - cy);
          const proximity = Math.max(0, 1 - dist / 300);

          const phase = phases[i] ?? 0;
          // Ink-under-water: the veil passing over a letter makes it
          // gently blur/dissolve and reconstruct on its own slow cycle —
          // amplitude is zero at rest and only grows near the cursor.
          const osc1 = 0.5 + 0.5 * Math.sin(t * 1.2 + phase);
          const osc2 = 0.5 + 0.5 * Math.sin(t * 0.8 + phase * 1.7 + 2.1);
          const blur = proximity * (0.5 + 1.6 * osc1);
          const dissolve = proximity * (0.08 + 0.26 * osc2);

          span.style.setProperty('--prox', proximity.toFixed(3));
          span.style.setProperty('--m-blur', blur.toFixed(3));
          span.style.setProperty('--m-dissolve', dissolve.toFixed(3));
        }
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [pointerRef]);

  let globalIndex = 0;

  return (
    <h1
      ref={rootRef}
      className={`memory-title${revealed ? ' is-revealed' : ''}${settled ? ' is-settled' : ''}${dissolving ? ' is-dissolving' : ''}`}
      aria-label={TITLE}
    >
      {words.map((word, wi) => (
        <span className="mt-word" key={wi}>
          {word.split('').map((ch, ci) => {
            const i = globalIndex++;
            const seed = hashSeed(i + 1);
            const variant = VARIANTS[Math.floor(seed * VARIANTS.length)];
            const delay = 0.05 + seed * 1.7;
            const duration = 1.5 + hashSeed(i + 99) * 0.6;
            return (
              <span
                key={ci}
                ref={(el) => {
                  spanRefs.current[i] = el;
                }}
                className={`mt-char mt-char--${variant}`}
                style={
                  {
                    '--delay': `${delay}s`,
                    '--dur': `${duration}s`,
                  } as CSSProperties
                }
                aria-hidden="true"
              >
                {ch}
              </span>
            );
          })}
        </span>
      ))}
    </h1>
  );
}
