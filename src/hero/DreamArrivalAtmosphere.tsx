import type { CSSProperties } from 'react';
import { FALLBACK_ACCENT, type AccentColor } from './dreamAccentColor';
import './DreamArrivalAtmosphere.css';

interface DreamArrivalAtmosphereProps {
  palette: AccentColor[] | null;
  active: boolean;
}

const BOKEH_COUNT = 14;

/**
 * The rich, colorful nebula/cloud space the reconstructed dream image
 * rests inside once the dreamer has arrived — CSS/canvas-free, layered
 * gradients and drifting bokeh only, no new image generation. Every color
 * here comes from this dream's own extracted palette (see
 * dreamAccentColor.ts), never a fixed hue, so the "fantasy amplification"
 * still reads as this specific dream, not a generic backdrop.
 */
export default function DreamArrivalAtmosphere({ palette, active }: DreamArrivalAtmosphereProps) {
  const colors = palette && palette.length > 0 ? palette : [FALLBACK_ACCENT, FALLBACK_ACCENT, FALLBACK_ACCENT, FALLBACK_ACCENT];
  const c = (i: number) => colors[i % colors.length];

  return (
    <div
      className="dream-atmosphere"
      data-active={active ? 'true' : 'false'}
      aria-hidden="true"
      style={
        {
          '--atmo-1': `${c(0).r}, ${c(0).g}, ${c(0).b}`,
          '--atmo-2': `${c(1).r}, ${c(1).g}, ${c(1).b}`,
          '--atmo-3': `${c(2).r}, ${c(2).g}, ${c(2).b}`,
          '--atmo-4': `${c(3).r}, ${c(3).g}, ${c(3).b}`,
        } as CSSProperties
      }
    >
      <div className="da-nebula da-nebula--a" />
      <div className="da-nebula da-nebula--b" />
      <div className="da-nebula da-nebula--c" />
      <div className="da-nebula da-nebula--d" />
      <div className="da-trails">
        <span className="da-trail da-trail--a" />
        <span className="da-trail da-trail--b" />
      </div>
      <div className="da-bokeh-field">
        {Array.from({ length: BOKEH_COUNT }).map((_, i) => (
          <span
            key={i}
            className="da-bokeh"
            style={
              {
                '--bi': i,
                '--bokeh-rgb': `var(--atmo-${(i % 4) + 1})`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
