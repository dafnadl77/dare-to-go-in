import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { PointerState } from './usePointerRef';
import './MemoryTitle.css';

interface MemoryTitleProps {
  revealed: boolean;
  pointerRef: RefObject<PointerState>;
}

const TITLE = 'DARE TO GO IN';
const VARIANTS = ['a', 'b', 'c'] as const;

function hashSeed(i: number) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export default function MemoryTitle({ revealed, pointerRef }: MemoryTitleProps) {
  const rootRef = useRef<HTMLHeadingElement>(null);
  const spanRefs = useRef<(HTMLSpanElement | null)[]>([]);

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

    function frame() {
      const pointer = pointerRef.current;
      if (pointer && rootRef.current) {
        for (let i = 0; i < spans.length; i++) {
          const span = spans[i];
          if (!span) continue;
          const rect = span.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dist = Math.hypot(pointer.x - cx, pointer.y - cy);
          const proximity = Math.max(0, 1 - dist / 260);
          span.style.setProperty('--prox', proximity.toFixed(3));
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
      className={`memory-title${revealed ? ' is-revealed' : ''}${settled ? ' is-settled' : ''}`}
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
