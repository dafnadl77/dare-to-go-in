import { forwardRef, type CSSProperties } from 'react';
import './DreamStageBackground.css';

interface DreamStageBackgroundProps {
  active: boolean;
}

const STAR_COUNT = 12;

/**
 * The approved Dream Stage backdrop — the real moving cloud MP4, playing
 * full-screen. This IS the post-portal environment; nothing here recolors
 * it or tints it with the dream's palette. The same clip is reused a
 * second time as the foreground layer over the dream image (see
 * DreamStageForegroundClouds) — kept perfectly in sync with this instance
 * via a ref DreamReconstruction wires up, so both copies show the exact
 * same cloud motion at the exact same moment.
 *
 * A handful of star points twinkle independently on top, each on its own
 * unsynchronized timer — the only extra "life" layered on beyond the real
 * video motion itself.
 */
const DreamStageBackground = forwardRef<HTMLVideoElement, DreamStageBackgroundProps>(function DreamStageBackground(
  { active },
  videoRef,
) {
  return (
    <div className="dream-stage-bg-layer" data-active={active ? 'true' : 'false'} aria-hidden="true">
      <video ref={videoRef} className="dream-stage-bg-video" src="/dream-stage-clouds.mp4" autoPlay muted loop playsInline preload="auto" />
      <div className="dream-stage-stars">
        {Array.from({ length: STAR_COUNT }).map((_, i) => (
          <span
            key={i}
            className="dream-stage-star"
            style={
              {
                '--si': i,
                left: `${(i * 8.3 + 4) % 100}%`,
                top: `${(i * 13.7 + 6) % 70}%`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
});

export default DreamStageBackground;
