import { useEffect, type RefObject } from 'react';

/**
 * Keeps the writing panel inside the part of the screen that is really usable, and keeps the decorative title out of its way.
 *
 * The panel is centred on the home screen's own centre, which sits below the title and the prompt. A long dream (the box grows), or a
 * message under the buttons, makes the panel taller and, being centred, it rises into the title above it — or, on a tall screen, its
 * lower edge slips past the bottom. Instead of guessing with fixed numbers, this measures: the panel is nudged (a vertical shift, nothing
 * else about it changes) back into the band between the menu and the bottom of the visible area, and the title / prompt are faded away
 * ONLY while they would actually collide with it. With room to spare nothing moves and nothing fades.
 */
export const FIT_MARGIN_PX = 8;
export const CROWDED_GAP_PX = 10;
export const CROWDED_CLASS = 'is-crowded';

export interface Band {
  top: number;
  bottom: number;
}

/** The vertical shift (px, positive = down) that brings a panel [top, bottom] inside the band. 0 when it already fits or cannot fit at all. */
export function computeShift(panel: Band, band: Band): number {
  const height = panel.bottom - panel.top;
  const room = band.bottom - band.top;
  // Taller than the room (it is height-capped and scrolls, so this is only a rounding case): align its top, never push it off the top.
  if (height >= room) return Math.round(band.top - panel.top);
  if (panel.bottom > band.bottom) return Math.round(band.bottom - panel.bottom);
  if (panel.top < band.top) return Math.round(band.top - panel.top);
  return 0;
}

/** The decorative lines above the panel are in the way when the panel's top reaches into (or within a small gap of) their lowest edge. */
export function isCrowded(panelTop: number, decorBottom: number | null, gap: number = CROWDED_GAP_PX): boolean {
  return decorBottom !== null && panelTop < decorBottom + gap;
}

export function useTypingPanelFit(active: boolean, panelRef: RefObject<HTMLElement | null>, dependencies: ReadonlyArray<unknown>): void {
  useEffect(() => {
    const panel = panelRef.current;
    if (!active || !panel) return;
    const root = panel.closest('.hold-to-remember');
    let frame = 0;

    const fit = () => {
      frame = 0;
      const viewport = window.visualViewport;
      const innerBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
      const header = document.querySelector('.global-header');
      const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
      // The menu is fixed to the top of the page, so it covers the top of the visible area unless the keyboard has scrolled it away.
      const band: Band = { top: Math.max(headerBottom, viewport?.offsetTop ?? 0) + FIT_MARGIN_PX, bottom: innerBottom - FIT_MARGIN_PX };
      // The panel's height cap IS the measured room (so it can never be taller than the usable band, whatever the header turns out to be),
      // and it is measured from the unshifted position so the result never depends on the previous shift.
      panel.style.setProperty('--htr-room', `${Math.max(0, Math.round(band.bottom - band.top))}px`);
      panel.style.setProperty('--htr-shift', '0px');
      const rect = panel.getBoundingClientRect();
      const shift = computeShift({ top: rect.top, bottom: rect.bottom }, band);
      panel.style.setProperty('--htr-shift', `${shift}px`);

      // The decorative title and prompt step aside only while the (shifted) panel would touch them.
      let decorBottom: number | null = null;
      for (const el of document.querySelectorAll('.memory-title, .dream-prompt')) {
        const b = (el as HTMLElement).getBoundingClientRect();
        if (b.height > 0) decorBottom = Math.max(decorBottom ?? -Infinity, b.bottom);
      }
      root?.classList.toggle(CROWDED_CLASS, isCrowded(rect.top + shift, decorBottom));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(fit);
    };

    schedule();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    observer?.observe(panel);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      panel.style.removeProperty('--htr-shift');
      panel.style.removeProperty('--htr-room');
      root?.classList.remove(CROWDED_CLASS);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, panelRef, ...dependencies]);
}
