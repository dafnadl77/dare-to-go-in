import { useEffect, type RefObject } from 'react';
import { usePointerRef } from './usePointerRef';

/**
 * Applies a very subtle, eased parallax offset to `targetRef`'s element in
 * response to pointer movement, written as CSS custom properties
 * (`--parallax-x`/`--parallax-y`) rather than a direct transform so the
 * consuming CSS can combine it with its own transforms. Same eased rAF
 * pattern HeroDream already uses for its own UI layer, factored out so the
 * post-dream surfaces (the generated image, the floating element field)
 * can share it without duplicating the loop.
 */
export function usePointerParallax(targetRef: RefObject<HTMLElement | null>, strength = 10, active = true) {
  const pointerRef = usePointerRef();

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const eased = { x: 0, y: 0 };
    function frame() {
      const pointer = pointerRef.current;
      const el = targetRef.current;
      if (pointer && el) {
        const nx = pointer.x / window.innerWidth - 0.5;
        const ny = pointer.y / window.innerHeight - 0.5;
        eased.x += (nx - eased.x) * 0.04;
        eased.y += (ny - eased.y) * 0.04;
        el.style.setProperty('--parallax-x', `${(eased.x * strength).toFixed(2)}px`);
        el.style.setProperty('--parallax-y', `${(eased.y * strength).toFixed(2)}px`);
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [pointerRef, targetRef, strength, active]);
}
