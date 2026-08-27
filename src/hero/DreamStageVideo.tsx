import './DreamStageVideo.css';

interface DreamStageVideoProps {
  active: boolean;
}

/**
 * The approved Dream Stage background — a real moving cloud video, not a
 * CSS/canvas recreation. This IS the post-portal environment; nothing here
 * recolors it, tints it with the dream's palette, or layers another
 * generated room behind it. Mounted slightly before 'active' (already
 * playing/buffered behind the vortex) so the instant the portal completes
 * there is no load flash — only an opacity reveal.
 */
export default function DreamStageVideo({ active }: DreamStageVideoProps) {
  return (
    <div className="dream-stage-video-layer" data-active={active ? 'true' : 'false'} aria-hidden="true">
      <video className="dream-stage-video" src="/dream-stage-clouds.mp4" autoPlay muted loop playsInline preload="auto" />
    </div>
  );
}
