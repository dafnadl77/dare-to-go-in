import { forwardRef } from 'react';
import './DreamCloudFrame.css';

interface DreamCloudFrameProps {
  active: boolean;
}

/**
 * A SECOND instance of the exact same approved cloud MP4 used for the
 * background (see DreamStageBackground), positioned over the dream image
 * and masked — with the SAME reference mask file, inverted — so only its
 * outer cloud regions stay visible, overlapping the image's true edge.
 * Real moving clouds physically covering the outer rim of the photo is
 * what actually hides the mask boundary, not the mask/feather alone.
 * Kept frame-synced with the background copy via a ref DreamReconstruction
 * wires up, exactly like the background instance, so both show identical
 * motion at every moment.
 */
const DreamCloudFrame = forwardRef<HTMLVideoElement, DreamCloudFrameProps>(function DreamCloudFrame(
  { active },
  videoRef,
) {
  return (
    <div className="dr-cloud-frame" data-active={active ? 'true' : 'false'} aria-hidden="true">
      <video ref={videoRef} className="dr-cloud-frame-video" src="/dream-stage-clouds.mp4" autoPlay muted loop playsInline preload="auto" />
    </div>
  );
});

export default DreamCloudFrame;
