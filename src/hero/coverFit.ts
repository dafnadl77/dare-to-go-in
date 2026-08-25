export interface CoverTransform {
  scale: number;
  /** Destination-space offset of the scaled source's top-left corner (negative = cropped off-canvas). */
  offsetX: number;
  offsetY: number;
}

/**
 * The exact geometry CSS `object-fit: cover` would produce for a source of
 * (srcW, srcH) filling a destination of (dstW, dstH): uniform scale-up
 * until the source fully covers the destination, centered, cropping
 * whichever axis overflows. Used so canvas-drawn media (which ignores any
 * CSS object-fit on its source element) can be positioned identically to
 * how the video would look if it were the one actually painted.
 */
export function coverFit(srcW: number, srcH: number, dstW: number, dstH: number): CoverTransform {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const offsetX = (dstW - srcW * scale) / 2;
  const offsetY = (dstH - srcH * scale) / 2;
  return { scale, offsetX, offsetY };
}

/** Maps a normalized (0..1) rect in source-image space to destination canvas pixels, via a cover-fit transform. */
export function coverRectToDest(
  t: CoverTransform,
  srcW: number,
  srcH: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: t.offsetX + xMin * srcW * t.scale,
    y: t.offsetY + yMin * srcH * t.scale,
    w: (xMax - xMin) * srcW * t.scale,
    h: (yMax - yMin) * srcH * t.scale,
  };
}
