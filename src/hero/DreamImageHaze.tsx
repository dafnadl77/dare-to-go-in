import type { CSSProperties } from 'react';
import { FALLBACK_ACCENT, type AccentColor } from './dreamAccentColor';
import './DreamImageHaze.css';

interface DreamImageHazeProps {
  active: boolean;
  hidden?: boolean;
  accentColor: AccentColor | null;
  size: 'hero' | 'secondary';
  step?: string;
}

/**
 * LAYER 3 of the Dream Stage composition — soft atmospheric haze sitting
 * BEHIND the generated dream image (rendered before .dr-image-layer in the
 * DOM), so the photo reads as glowing out of the surrounding clouds rather
 * than a flat rectangle dropped onto them. Shares the exact box formulas
 * as .dr-image-layer (see DreamReconstruction.css) then scales up from
 * its own center — no separate width/height math to keep in sync.
 */
export default function DreamImageHaze({ active, hidden = false, accentColor, size, step }: DreamImageHazeProps) {
  const accent = accentColor ?? FALLBACK_ACCENT;
  return (
    <div
      className="dr-image-haze"
      data-arrival={active && !hidden ? 'true' : 'false'}
      data-size={size}
      data-step={step}
      aria-hidden="true"
      style={{ '--haze-rgb': `${accent.r}, ${accent.g}, ${accent.b}` } as CSSProperties}
    >
      <span className="dr-haze-glow" />
      <span className="dr-haze-mist" />
    </div>
  );
}
