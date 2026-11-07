import { useEffect, useLayoutEffect } from 'react';

/**
 * The typing button and "How it works" never touch (2026-11-07). The opening's column and the control above the footer are placed apart from each
 * other, so on some windows the control rose over the button's lower edge and a click there opened the section instead of the writing screen.
 * Only the typing button moves, only by the pixels that are missing, and only towards the free space under the circle. Everywhere else the lift
 * is zero and the approved opening is exactly as it was.
 */

/** The clear space under the typing button, above "How it works". */
export const HOW_CONTROL_GAP_PX = 12;
/** The space the button always keeps under the circle as it is drawn. */
export const CIRCLE_GAP_PX = 8;

export interface TypeLinkPlacement {
  /** All without any lift already applied. */
  linkTop: number;
  linkBottom: number;
  circleBottom: number;
  /** Null when the control is not under the button (a short phone has it under the header). */
  howTop: number | null;
}

export function typeLinkLift(p: TypeLinkPlacement): number {
  const needed = p.howTop === null ? 0 : Math.max(p.linkBottom + HOW_CONTROL_GAP_PX - p.howTop, 0);
  const room = Math.max(p.linkTop - p.circleBottom - CIRCLE_GAP_PX, 0);
  return Math.ceil(Math.min(needed, room));
}

/** The clear space between "How it works" and the header's links, or the title below it, on a phone that has it under the header. */
export const HEADER_GAP_PX = 2;

/**
 * Under the header (a short phone): how far "How it works" moves down to clear the header's links. Only into free space: if the room above the
 * column is smaller than what is missing, it does not move at all (0), and the opening scrolls instead (useOpeningFit.ts). Never a tolerance.
 */
export function teaserDrop(p: { headerBottom: number; howTop: number; howBottom: number; nextTop: number | null }): number {
  const needed = p.headerBottom + HEADER_GAP_PX - p.howTop;
  if (needed <= 0) return 0;
  const room = p.nextTop === null ? Infinity : p.nextTop - HEADER_GAP_PX - p.howBottom;
  return needed <= room ? Math.ceil(needed) : 0;
}

// Layout positions, so the opening's reveal and the slow drift of the scene (both transforms) never disturb the measurement.
function layoutTop(el: HTMLElement): number {
  let top = 0;
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
  return top;
}

const LIFT_VAR = '--hiw-type-lift';
const DROP_VAR = '--hiw-teaser-drop';
const shown = (el: HTMLElement | null): el is HTMLElement => !!el && el.getClientRects().length > 0;

function fit() {
  const link = document.querySelector<HTMLElement>('.htr-type-link');
  const circle = document.querySelector<HTMLElement>('.htr-circle');
  const how = document.querySelector<HTMLElement>('.hiw-trigger');
  const root = document.documentElement;
  // A very low window has no control at all: nothing to keep clear of.
  if (!shown(link) || !shown(circle) || !shown(how)) {
    root.style.removeProperty(LIFT_VAR);
    root.style.removeProperty(DROP_VAR);
    return;
  }
  clearHeader(link, how);
  const lifted = parseFloat(root.style.getPropertyValue(LIFT_VAR)) || 0;
  const linkTop = layoutTop(link) + lifted;
  const linkBottom = linkTop + link.offsetHeight;
  const howTop = layoutTop(how);
  const lift = typeLinkLift({
    linkTop,
    linkBottom,
    // The circle is drawn larger than its box (a scale), around its centre.
    circleBottom: layoutTop(circle) + (circle.offsetHeight + circle.getBoundingClientRect().height) / 2,
    howTop: howTop + how.offsetHeight / 2 > linkTop + link.offsetHeight / 2 ? howTop : null,
  });
  if (lift === lifted) return;
  if (lift > 0) root.style.setProperty(LIFT_VAR, `${lift}px`);
  else root.style.removeProperty(LIFT_VAR);
}

// "How it works" above the typing button is the short phone's control under the header: kept clear of the header's own links.
function clearHeader(link: HTMLElement, how: HTMLElement) {
  const root = document.documentElement;
  const dropped = parseFloat(root.style.getPropertyValue(DROP_VAR)) || 0;
  const howTop = layoutTop(how) - dropped;
  if (howTop > layoutTop(link)) {
    if (dropped) root.style.removeProperty(DROP_VAR);
    return;
  }
  const h = how.getBoundingClientRect();
  const across = (r: DOMRect) => Math.min(r.right, h.right) - Math.max(r.left, h.left) > 2;
  const header = document.querySelector('.global-header');
  const headerBottom = Math.max(0, ...[...(header?.querySelectorAll<HTMLElement>('a, button') ?? [])].filter((e) => shown(e) && across(e.getBoundingClientRect())).map((e) => e.getBoundingClientRect().bottom));
  // the first piece of the column below it (a negative margin that tucks it upward is part of its design, not free space)
  const below = ['.memory-title', '.hiw-tagline', '.dream-prompt']
    .map((s) => document.querySelector<HTMLElement>(s))
    .filter((e): e is HTMLElement => shown(e) && e.offsetHeight >= 4 && across(e.getBoundingClientRect()))
    .map((e) => layoutTop(e) + Math.max(0, -parseFloat(getComputedStyle(e).marginTop) || 0))
    .filter((t) => t > howTop);
  const drop = teaserDrop({ headerBottom, howTop, howBottom: howTop + how.offsetHeight, nextTop: below.length ? Math.min(...below) : null });
  if (drop === dropped) return;
  if (drop > 0) root.style.setProperty(DROP_VAR, `${drop}px`);
  else root.style.removeProperty(DROP_VAR);
}

/** While the control is on the screen. `layoutKey` is whatever moves the control itself. The lift stays when the control leaves: the button fades
    out in place instead of jumping, and the next opening measures again. */
export function useTypeLinkClearance(layoutKey: unknown) {
  useLayoutEffect(fit, [layoutKey]);
  useEffect(() => {
    const observer = new ResizeObserver(fit);
    for (const selector of ['.hold-to-remember', '.hiw-tagline', '.app-footer--pinned']) {
      const el = document.querySelector(selector);
      if (el) observer.observe(el);
    }
    window.addEventListener('resize', fit);
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) fit();
    });
    return () => {
      live = false;
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, []);
}
