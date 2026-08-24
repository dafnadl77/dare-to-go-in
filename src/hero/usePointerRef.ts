import { useEffect, useRef } from 'react';

export interface PointerState {
  x: number;
  y: number;
  lastMoveAt: number;
  isDown: boolean;
  /** False until the user's real cursor has moved at least once. */
  hasMoved: boolean;
}

/** Tracks pointer position in a ref (no re-renders) for rAF-driven consumers. */
export function usePointerRef() {
  const ref = useRef<PointerState>({
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
    lastMoveAt: performance.now(),
    isDown: false,
    hasMoved: false,
  });

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const p = ref.current;
      p.x = e.clientX;
      p.y = e.clientY;
      p.lastMoveAt = performance.now();
      p.hasMoved = true;
    };
    const handleDown = () => {
      ref.current.isDown = true;
    };
    const handleUp = () => {
      ref.current.isDown = false;
    };
    window.addEventListener('pointermove', handleMove, { passive: true });
    window.addEventListener('pointerdown', handleDown, { passive: true });
    window.addEventListener('pointerup', handleUp, { passive: true });
    window.addEventListener('pointercancel', handleUp, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerdown', handleDown);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, []);

  return ref;
}
