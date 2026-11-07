import { useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * THE OPENING SCROLLS ONLY WHEN IT DOES NOT FIT (2026-11-07, her choice over hiding content or shrinking the header). On a very small or very low
 * screen the opening's column, "How it works" and the footer cannot all stand apart on one screen: they overlapped, or a control was out of
 * reach. Then, and only then, the opening becomes a page that scrolls below the header, with "How it works" and the footer (its credit line and
 * legal links kept) after the typing button. On every screen where it all fits nothing changes. The circle, its place and its animation are
 * never touched.
 *
 * The decision is taken from the normal layout, before the screen is painted, and kept until the window changes size.
 */

export interface FitBox {
  name: string;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** How far two boxes overlap (0 when they do not, or by no more than a hair). */
const overlapOf = (a: FitBox, b: FitBox) => {
  const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return x > 2 && y > 2 ? Math.round(y) : 0;
};
const overlaps = (a: FitBox, b: FitBox) => overlapOf(a, b) > 0;
// the circle is round: its square box always touches the question's corners, which never shows
const IGNORED = new Set(['prompt/circle', 'circle/prompt']);

/** Does the opening fit? `missing`: a control that should be on the screen and is hidden by the layout (a low screen hides "How it works"). */
export function openingFits(boxes: readonly FitBox[], viewportHeight: number, missing: readonly string[]): boolean {
  return fitProblem(boxes, viewportHeight, missing) === null;
}

/** Why it does not fit (a short name, never any text of the page), or null. */
export function fitProblem(boxes: readonly FitBox[], viewportHeight: number, missing: readonly string[]): string | null {
  if (missing.length) return `hidden:${missing.join('+')}`;
  for (const b of boxes) if ((b.name === 'type' || b.name === 'how' || b.name === 'circle' || b.name.startsWith('footer')) && (b.bottom > viewportHeight + 1 || b.top < -1)) return `out:${b.name}`;
  for (let i = 0; i < boxes.length; i += 1)
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.name.startsWith('footer') && b.name.startsWith('footer')) continue;
      if (IGNORED.has(`${a.name}/${b.name}`)) continue;
      if (overlaps(a, b)) return `overlap:${a.name}/${b.name}:${overlapOf(a, b)}`;
    }
  return null;
}

// Layout positions, so the opening's reveal (a transform) never disturbs the measurement; the circle keeps the size it is drawn at.
function layoutTop(el: HTMLElement): number {
  let top = 0;
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
  return top;
}
const shown = (el: Element | null): el is HTMLElement => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

function measure(): { fits: boolean; headerBottom: number; reason: string | null } {
  const header = document.querySelector<HTMLElement>('.global-header');
  const headerBottom = shown(header) ? header.getBoundingClientRect().bottom : 0;
  const boxes: FitBox[] = [];
  const add = (name: string, el: HTMLElement | null, fixed = false) => {
    if (!shown(el)) return;
    const r = el.getBoundingClientRect();
    if (r.height < 4 || r.width < 4) return; // visually hidden (a low screen's big title)
    const top = fixed ? r.top : layoutTop(el) - (r.height - el.offsetHeight) / 2;
    // a negative margin pulls a box into its neighbour by design (the explanation sits tucked under the big title): that part is not an overlap
    const style = getComputedStyle(el);
    const intoAbove = Math.max(0, -parseFloat(style.marginTop) || 0);
    const intoBelow = Math.max(0, -parseFloat(style.marginBottom) || 0);
    boxes.push({ name, top: top + intoAbove, bottom: top + r.height - intoBelow, left: r.left, right: r.right });
  };
  if (header) {
    for (const part of header.querySelectorAll<HTMLElement>('a, button')) add('header', part, true);
  }
  add('title', document.querySelector('.memory-title'));
  add('tagline', document.querySelector('.hiw-tagline'));
  add('prompt', document.querySelector('.dream-prompt'));
  add('circle', document.querySelector('.htr-circle'));
  add('type', document.querySelector('.htr-type-link'));
  add('how', document.querySelector('.hiw-trigger'));
  document.querySelectorAll<HTMLElement>('.app-footer--pinned .footer-link, .app-footer--pinned .footer-credit').forEach((el, i) => add(`footer${i}`, el));
  const missing = [
    !shown(document.querySelector('.hiw-trigger')) && 'how',
    !shown(document.querySelector('.app-footer--pinned .footer-link')) && 'footer',
  ].filter((x): x is string => Boolean(x));
  // the header's own links overlap one another by design (one bar): only their overlap with the opening counts
  const opening = boxes.filter((b) => b.name !== 'header');
  const headerParts = boxes.filter((b) => b.name === 'header');
  const underHeader = headerParts.flatMap((h) => opening.filter((o) => overlaps(h, o)).map((o) => `overlap:header/${o.name}:${overlapOf(h, o)}`))[0] ?? null;
  const reason = fitProblem(opening, innerHeight, missing) ?? underHeader;
  return { fits: reason === null, headerBottom, reason };
}

type Fit = { scroll: boolean; top: number; reason: string | null; key: string };
const NORMAL = { scroll: false, top: 0, reason: null } as const;
// the pieces whose size changes the opening's layout; observing them also gives the first, initial measurement
const WATCHED = ['.memory-title', '.hiw-tagline', '.dream-prompt', '.hold-to-remember', '.hiw-trigger', '.app-footer--pinned', '.global-header'];
const inScrollMode = () => !!document.querySelector('.hero-dream.is-scroll-fit');

/**
 * True while the opening must scroll. `active`: the idle opening with its controls; `layoutKey`: what changes its text (the language).
 * The decision is taken in the browser's own callbacks, never in the body of an effect: a ResizeObserver (it runs after layout and before the
 * screen is painted) measures the normal layout, and a new window size first puts the normal layout back (flushSync), then measures it again.
 * Both use flushSync, so the answer is on the screen before anything is painted.
 */
export function useOpeningFit(active: boolean, layoutKey: unknown): { scroll: boolean; top: number; reason: string | null } {
  // the window size is part of what a decision was taken for: after a rotation away from the opening, it is measured again
  const key = `${String(layoutKey)}|${window.innerWidth}x${window.innerHeight}`;
  const [fit, setFit] = useState<Fit>({ ...NORMAL, key });
  useLayoutEffect(() => {
    if (!active) return;
    const judge = () => {
      if (inScrollMode()) return; // already decided: only a new window size asks again
      const m = measure();
      if (!m.fits) flushSync(() => setFit({ scroll: true, top: m.headerBottom, reason: m.reason, key }));
    };
    const observer = new ResizeObserver(judge);
    for (const sel of WATCHED) document.querySelectorAll(sel).forEach((el) => observer.observe(el));
    let size = `${innerWidth}x${innerHeight}`;
    const onResize = () => {
      const now = `${innerWidth}x${innerHeight}`;
      if (now === size) return;
      size = now;
      if (inScrollMode()) flushSync(() => setFit({ ...NORMAL, key }));
      judge();
    };
    window.addEventListener('resize', onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [active, key]);
  // a decision belongs to the opening and the text it was taken for: anything else is the normal layout, measured again
  return active && fit.key === key ? { scroll: fit.scroll, top: fit.top, reason: fit.reason } : NORMAL;
}
