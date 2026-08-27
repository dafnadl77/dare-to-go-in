import type { CSSProperties } from 'react';
import { FALLBACK_ACCENT, type AccentColor } from './dreamAccentColor';
import './DreamImageFrame.css';

interface DreamImageFrameProps {
  active: boolean;
  palette: AccentColor[] | null;
  /** 'hero' = the large post-arrival image; 'secondary' = the smaller,
      quieter image kept present during reflection/closing. Only the box
      this shares with .dr-image-layer changes size — the wisp technique
      itself is identical. */
  size: 'hero' | 'secondary';
}

/** The real Dream Stage video is the environment now — this only supplies
    the FOREGROUND mist that passes in front of the image's lower edges, so
    the clouds visibly overlap the photo rather than sitting only behind
    it. Deliberately absent from the top/upper-sides: the image must read
    clearly against the open "sky" of the video there, per the approved
    reference. Real overlapping blurred blobs, not a mask alone. */
const WISPS = [
  { top: '68%', left: '-14%', w: '48%', h: '42%', hue: 0 },
  { top: '66%', left: '30%', w: '54%', h: '40%', hue: 1 },
  { top: '70%', left: '66%', w: '48%', h: '42%', hue: 2 },
  { top: '38%', left: '-18%', w: '30%', h: '48%', hue: 3 },
  { top: '36%', left: '92%', w: '30%', h: '48%', hue: 0 },
];

const SPARKLE_COUNT = 7;

export default function DreamImageFrame({ active, palette, size }: DreamImageFrameProps) {
  const colors = palette && palette.length > 0 ? palette : [FALLBACK_ACCENT, FALLBACK_ACCENT, FALLBACK_ACCENT, FALLBACK_ACCENT];
  const c = (i: number) => colors[i % colors.length];

  return (
    <div
      className="dr-image-frame"
      data-arrival={active ? 'true' : 'false'}
      data-size={size}
      aria-hidden="true"
      style={
        {
          '--wisp-0': `${c(0).r}, ${c(0).g}, ${c(0).b}`,
          '--wisp-1': `${c(1).r}, ${c(1).g}, ${c(1).b}`,
          '--wisp-2': `${c(2).r}, ${c(2).g}, ${c(2).b}`,
          '--wisp-3': `${c(3).r}, ${c(3).g}, ${c(3).b}`,
        } as CSSProperties
      }
    >
      {WISPS.map((w, i) => (
        <span
          key={i}
          className="dr-cloud-wisp"
          style={
            {
              top: w.top,
              left: w.left,
              width: w.w,
              height: w.h,
              '--wisp-rgb': `var(--wisp-${w.hue})`,
              '--wi': i,
            } as CSSProperties
          }
        />
      ))}
      <div className="dr-frame-sparkles">
        {Array.from({ length: SPARKLE_COUNT }).map((_, i) => (
          <span
            key={i}
            className="dr-frame-sparkle"
            style={
              {
                '--si': i,
                '--sparkle-rgb': `var(--wisp-${i % 4})`,
                left: `${(i * 37) % 100}%`,
                top: `${(i * 53) % 100}%`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
