import type { DreamEventType } from './dreamEventState';

export interface DreamEventRegion {
  /** Normalized source-image fractions (0..1) — the true, unpadded object bounds, in the same coordinate space as the hero video's own frame. */
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  /** A full-room reference image sharing the exact crop/framing/perspective as the hero video — the same normalized rect is cropped out of both. */
  src: string;
  shape: 'ellipse' | 'rect';
  /** Extra feather room as a fraction of the region's own width/height, per edge. 0 on any edge that already sits at the frame's own crop boundary (no seam possible there). */
  pad: { left: number; right: number; top: number; bottom: number };
}

/**
 * Reference regions for the three real-photo Dream Events. Each source
 * image is a full-room photo sharing the hero video's exact crop/framing,
 * so the same normalized rect crops correctly out of any of them via the
 * shared video cover-fit transform.
 */
export const DREAM_EVENT_REGIONS: Record<DreamEventType, DreamEventRegion> = {
  bed: {
    xMin: 0.0,
    xMax: 0.42,
    yMin: 0.66,
    yMax: 1.0,
    src: '/dream-assets/dream-bed-alt.jpg',
    shape: 'ellipse',
    pad: { left: 0, right: 0.3, top: 0.3, bottom: 0 },
  },
  art: {
    // Exact inner-opening coordinates measured against the master
    // reference frame: left 12.93%, top 39.55%, width 4.73%, height
    // 12.93%. This is the INNER picture area only — never the frame.
    // Padding kept small since the physical frame sits close outside it.
    xMin: 0.1293,
    xMax: 0.1766,
    yMin: 0.3955,
    yMax: 0.5248,
    src: '/dream-assets/dream-art-alt.jpg',
    shape: 'rect',
    pad: { left: 0.08, right: 0.08, top: 0.06, bottom: 0.06 },
  },
  mirror: {
    // Re-measured directly from the reference photo's own pixels (texture
    // variance + luminance scan) rather than by eye: the mirror is a tall
    // narrow panel flush against the right edge of the frame, glass
    // starting ~x=2415/2560 and running to the photo's own right edge,
    // spanning almost the full wall height from just under the crown
    // molding (~y=180/1440) down to where the console/books begin
    // (~y=940/1440). The previous box (0.775-0.965, 0.215-0.545) was
    // actually capturing the doorway and marble wall beside the mirror,
    // not the mirror itself — this replaces it.
    xMin: 0.943,
    xMax: 0.998,
    yMin: 0.125,
    yMax: 0.653,
    src: '/dream-assets/dream-mirror-alt.jpg',
    shape: 'rect',
    pad: { left: 0.06, right: 0.02, top: 0.04, bottom: 0.04 },
  },
};
