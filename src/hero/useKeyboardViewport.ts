import { useEffect, type RefObject } from 'react';

/**
 * The part of the screen that is really visible while the on-screen keyboard is open.
 *
 * A phone keyboard does not shrink the page the way a window resize does: on iOS (and on Android unless the page asks otherwise) the
 * layout stays as tall as before and the keyboard simply covers its lower part, so a panel centred on the page ends up half under the
 * keyboard — the writing box and its buttons run into each other or disappear. The browser reports the visible area through
 * `window.visualViewport`; the writing panel follows it while it is open.
 */
export interface VisibleArea {
  /** The visible area is clearly smaller than the page: a keyboard is open. */
  keyboardOpen: boolean;
  /** Height of the visible area, in px. */
  height: number;
  /** Distance from the top of the page's viewport to the top of the visible area, in px. */
  top: number;
}

/** A keyboard takes well over a hundred pixels; a smaller difference is the browser's own toolbar moving. A pinch-zoomed page is never "keyboard". */
export const KEYBOARD_MIN_INSET_PX = 120;

export function readVisibleArea(innerHeight: number, viewport: { height: number; offsetTop: number; scale?: number } | null | undefined): VisibleArea {
  if (!viewport || !Number.isFinite(viewport.height) || viewport.height <= 0) return { keyboardOpen: false, height: innerHeight, top: 0 };
  const zoomed = typeof viewport.scale === 'number' && viewport.scale > 1.05;
  const keyboardOpen = !zoomed && innerHeight - viewport.height >= KEYBOARD_MIN_INSET_PX;
  return { keyboardOpen, height: Math.round(viewport.height), top: Math.max(0, Math.round(viewport.offsetTop)) };
}

export const KEYBOARD_CLASS = 'is-kb';

/**
 * While `active`, keeps the panel's `--htr-vv-h` / `--htr-vv-top` custom properties and its `is-kb` class in step with the visible area.
 * With no keyboard nothing is set, so the panel stays exactly where it always was.
 */
export function useKeyboardViewport(active: boolean, ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const viewport = typeof window !== 'undefined' ? window.visualViewport : null;
    const clear = () => {
      el.classList.remove(KEYBOARD_CLASS);
      el.style.removeProperty('--htr-vv-h');
      el.style.removeProperty('--htr-vv-top');
    };
    const apply = () => {
      const area = readVisibleArea(window.innerHeight, viewport);
      if (!area.keyboardOpen) {
        clear();
        return;
      }
      el.classList.add(KEYBOARD_CLASS);
      el.style.setProperty('--htr-vv-h', `${area.height}px`);
      el.style.setProperty('--htr-vv-top', `${area.top}px`);
    };
    apply();
    viewport?.addEventListener('resize', apply);
    viewport?.addEventListener('scroll', apply);
    window.addEventListener('resize', apply);
    return () => {
      viewport?.removeEventListener('resize', apply);
      viewport?.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
      clear();
    };
  }, [active, ref]);
}
