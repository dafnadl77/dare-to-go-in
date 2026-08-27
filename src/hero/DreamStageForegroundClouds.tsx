import { forwardRef } from 'react';
import './DreamStageForegroundClouds.css';

interface DreamStageForegroundCloudsProps {
  active: boolean;
  hidden?: boolean;
  size: 'hero' | 'secondary';
  step?: string;
}

/**
 * LAYER 3 — a SECOND instance of the exact same approved cloud MP4 used
 * for the background (see DreamStageBackground), positioned over the
 * dream image and masked so only its cloud regions stay visible — the
 * center is masked to transparent so the image itself shows through.
 * Both video instances are wired by DreamReconstruction to the same
 * ref-based sync loop so they show identical motion at every moment;
 * this is what makes the visible clouds here read as literally the same
 * clouds as the background, not a second unrelated asset.
 *
 * Shares the exact same box as .dr-image-layer (see
 * DreamReconstruction.css), then scales up ~30% from that same center
 * (see .dr-fg-clouds-video) so its cloud mass physically overlaps the
 * image's edges — heaviest at the bottom and sides, with a few irregular
 * patches reaching the upper edge, per the approved mask below.
 */
const DreamStageForegroundClouds = forwardRef<HTMLVideoElement, DreamStageForegroundCloudsProps>(
  function DreamStageForegroundClouds({ active, hidden = false, size, step }, videoRef) {
    return (
      <div className="dr-fg-clouds" data-arrival={active && !hidden ? 'true' : 'false'} data-size={size} data-step={step} aria-hidden="true">
        <video ref={videoRef} className="dr-fg-clouds-video" src="/dream-stage-clouds.mp4" autoPlay muted loop playsInline preload="auto" />
      </div>
    );
  },
);

export default DreamStageForegroundClouds;
