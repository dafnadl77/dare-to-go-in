/**
 * window.innerWidth/innerHeight can transiently report 0 during a resize or
 * viewport-emulation transition. Sizing a canvas from that leaves it 0x0,
 * and a later drawImage() using it as the source throws InvalidStateError —
 * which, thrown mid-frame, stops an rAF animation loop for good (see
 * MemoryVeil.tsx's resize()). Kept in its own module (no CSS/JSX imports)
 * so it's unit-testable with a plain node:test run, no DOM/canvas
 * infrastructure required.
 */
export function isValidViewportSize(width: number, height: number): boolean {
  return width > 0 && height > 0;
}
