import type { DreamWorldEffects } from './dreamWorldEffects';
import './DreamWorld.css';

interface DreamWorldProps {
  effects: DreamWorldEffects;
}

/**
 * Subtle environmental life layered ON TOP of the existing generated
 * reconstruction image — never a new image, never new content. Every
 * conditional layer here is gated by a real DreamAnalysis-derived flag;
 * the only always-on layers are universal cinematic depth (grain, light
 * breathing) that don't change what the image factually shows.
 */
export default function DreamWorld({ effects }: DreamWorldProps) {
  return (
    <div className="dream-world" aria-hidden="true">
      <div className="dw-grain" />
      <div className="dw-light-breathe" />
      {effects.water && <div className="dw-water-shimmer" />}
      {effects.rain && <div className="dw-rain" />}
      {effects.fog && <div className="dw-fog" />}
      {effects.wind && <div className="dw-wind" />}
    </div>
  );
}
