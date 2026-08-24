import { useEffect, useRef, type RefObject } from 'react';
import type { PointerState } from './usePointerRef';
import type { HoldState } from './HoldState';
import './CustomCursor.css';

interface CustomCursorProps {
  pointerRef: RefObject<PointerState>;
  holdRef: RefObject<HoldState>;
}

export default function CustomCursor({ pointerRef, holdRef }: CustomCursorProps) {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const ringPos = useRef({ x: 0, y: 0 });
  const hoverRef = useRef(false);

  useEffect(() => {
    const handleOver = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-cursor-hover]')) {
        hoverRef.current = true;
        ringRef.current?.classList.add('is-hover');
      }
    };
    const handleOut = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-cursor-hover]')) {
        hoverRef.current = false;
        ringRef.current?.classList.remove('is-hover');
      }
    };
    document.addEventListener('pointerover', handleOver);
    document.addEventListener('pointerout', handleOut);
    return () => {
      document.removeEventListener('pointerover', handleOver);
      document.removeEventListener('pointerout', handleOut);
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    function frame() {
      const pointer = pointerRef.current;
      const hold = holdRef.current;
      if (pointer && dotRef.current && ringRef.current && rootRef.current) {
        dotRef.current.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0) translate(-50%, -50%)`;

        const rp = ringPos.current;
        rp.x += (pointer.x - rp.x) * 0.18;
        rp.y += (pointer.y - rp.y) * 0.18;
        ringRef.current.style.transform = `translate3d(${rp.x}px, ${rp.y}px, 0) translate(-50%, -50%)`;

        const holding = !!hold?.active;
        rootRef.current.classList.toggle('is-holding', holding);
        if (holding && hold) {
          ringRef.current.style.setProperty('--hold-progress', hold.progress.toFixed(3));
        }
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [pointerRef, holdRef]);

  return (
    <div ref={rootRef} className="custom-cursor" aria-hidden="true">
      <div ref={ringRef} className="cc-ring" />
      <div ref={dotRef} className="cc-dot" />
    </div>
  );
}
