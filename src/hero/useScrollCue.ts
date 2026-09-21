import { useEffect, useState, type RefObject } from 'react';

/** The same condition under which the interpretation screen scrolls as one
    page (see the mobile blocks in DreamReflection.css / HeroDream.css). At
    wider widths the screen is a fixed, non-scrolling layout, so there is
    nothing below the fold to point at. */
const SCROLLING_LAYOUT_QUERY = '(max-width: 640px), (max-height: 500px)';

/** Below this many px of content past the fold it isn't worth a cue. */
const MEANINGFUL_REMAINDER_PX = 24;
/** Once the reader has moved this far down, the cue has done its job. */
const SCROLLED_PX = 32;

/**
 * Orientation cue for the interpretation screen: true while there is
 * meaningful content below the viewport that the reader hasn't reached yet.
 * `targetRef` is the last thing on the screen (the CONTINUE button's wrap).
 *
 * It is a one-way street per mount: once the reader scrolls, or the target
 * has been fully visible, the cue is dismissed for good and never comes back
 * while they keep reading. Nothing here scrolls, moves or pins anything.
 */
export function useScrollCue(active: boolean, targetRef: RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active || typeof window === 'undefined' || !window.matchMedia(SCROLLING_LAYOUT_QUERY).matches) return;

    let dismissed = false;
    const evaluate = () => {
      if (dismissed) return;
      const target = targetRef.current;
      if (!target) {
        setVisible(false);
        return;
      }
      const scrolledPast = window.scrollY > SCROLLED_PX;
      const remainder = target.getBoundingClientRect().bottom - window.innerHeight;
      if (scrolledPast || remainder <= 0) {
        dismissed = true;
        setVisible(false);
        return;
      }
      setVisible(remainder > MEANINGFUL_REMAINDER_PX);
    };

    evaluate();
    window.addEventListener('scroll', evaluate, { passive: true });
    window.addEventListener('resize', evaluate);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(evaluate) : null;
    observer?.observe(document.documentElement);
    return () => {
      window.removeEventListener('scroll', evaluate);
      window.removeEventListener('resize', evaluate);
      observer?.disconnect();
    };
  }, [active, targetRef]);

  // Gated on `active` here (not by resetting state in the effect) so leaving
  // the screen hides the cue immediately.
  return active && visible;
}
