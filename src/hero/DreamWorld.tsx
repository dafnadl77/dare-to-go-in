import type { CSSProperties } from 'react';
import type { DreamWorldEffects } from './dreamWorldEffects';
import { FALLBACK_ACCENT, type AccentColor } from './dreamAccentColor';
import './DreamWorld.css';

interface DreamWorldProps {
  effects: DreamWorldEffects;
  accentColor: AccentColor | null;
}

/**
 * Subtle environmental life layered ON TOP of the existing generated
 * reconstruction image — never a new image, never new content. Every
 * conditional layer here is gated by a real DreamAnalysis-derived flag;
 * the always-on layers are universal cinematic depth (grain, light
 * breathing, this dream's own accent-colored ambience/motes) that don't
 * change what the image factually shows — only how alive it feels having
 * just arrived through the portal.
 */
export default function DreamWorld({ effects, accentColor }: DreamWorldProps) {
  const accent = accentColor ?? FALLBACK_ACCENT;
  return (
    <div
      className="dream-world"
      aria-hidden="true"
      style={{ '--accent-rgb': `${accent.r}, ${accent.g}, ${accent.b}` } as CSSProperties}
    >
      <div className="dw-grain" />
      <div className="dw-light-breathe" />
      <div className="dw-accent-glow" />
      <div className="dw-motes">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="dw-mote" style={{ '--mi': i } as CSSProperties} />
        ))}
      </div>
      {effects.water && <div className="dw-water-shimmer" />}
      {effects.rain && <div className="dw-rain" />}
      {effects.fog && <div className="dw-fog" />}
      {effects.wind && <div className="dw-wind" />}
    </div>
  );
}
