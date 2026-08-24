import { useEffect, useRef, type RefObject } from 'react';
import { ECHO_ZONES, isInsideZone, zoneStyle } from './dreamEchoZones';
import type { EchoState } from './EchoState';
import type { PointerState } from './usePointerRef';
import './DreamEchoes.css';

interface DreamEchoesProps {
  pointerRef: RefObject<PointerState>;
  echoRef: RefObject<EchoState>;
}

const LAMP_FLICKER_MS = 650;
const BED_PULSE_MS = 1500;

/**
 * Hidden atmospheric interactions. No hotspots, no labels — the cursor must
 * dwell in a zone for a few hundred ms before anything happens, and every
 * effect is a visual overlay only (nothing here touches video playback).
 */
export default function DreamEchoes({ pointerRef, echoRef }: DreamEchoesProps) {
  const bedRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const ceilingRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const lampRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let lastT = performance.now();

    const dwell = { bed: 0, mirror: 0, ceiling: 0, window: 0, lamp: 0 };
    const fired = { bed: false, lamp: false };
    let bedPulseTimer: ReturnType<typeof setTimeout> | undefined;
    let lampFlickerTimer: ReturnType<typeof setTimeout> | undefined;
    const mirrorLag = { x: 0.5, y: 0.5 };
    let windowDarken = 0;

    function frame(now: number) {
      const dt = Math.min(now - lastT, 50);
      lastT = now;

      const pointer = pointerRef.current;
      const fx = pointer ? pointer.x / window.innerWidth : -1;
      const fy = pointer ? pointer.y / window.innerHeight : -1;

      // BED — one soft displacement pulse per visit.
      const bedZone = ECHO_ZONES.bed;
      if (isInsideZone(bedZone, fx, fy)) {
        dwell.bed += dt;
        if (dwell.bed >= bedZone.dwellMs && !fired.bed) {
          fired.bed = true;
          const el = bedRef.current;
          if (el) {
            el.classList.remove('is-pulsing');
            el.getBoundingClientRect();
            el.classList.add('is-pulsing');
          }
          clearTimeout(bedPulseTimer);
          bedPulseTimer = setTimeout(() => bedRef.current?.classList.remove('is-pulsing'), BED_PULSE_MS);
        }
      } else {
        dwell.bed = 0;
        fired.bed = false;
      }

      // MIRROR — continuous reflection that trails the cursor.
      const mirrorZone = ECHO_ZONES.mirror;
      const insideMirror = isInsideZone(mirrorZone, fx, fy);
      if (insideMirror) {
        dwell.mirror += dt;
      } else {
        dwell.mirror = 0;
      }
      const mirrorActive = dwell.mirror >= mirrorZone.dwellMs;
      const mirrorEl = mirrorRef.current;
      if (mirrorEl) {
        mirrorEl.classList.toggle('is-active', mirrorActive);
        if (mirrorActive) {
          const localX = (fx - mirrorZone.xMin) / (mirrorZone.xMax - mirrorZone.xMin);
          const localY = (fy - mirrorZone.yMin) / (mirrorZone.yMax - mirrorZone.yMin);
          mirrorLag.x += (localX - mirrorLag.x) * 0.035;
          mirrorLag.y += (localY - mirrorLag.y) * 0.035;
          mirrorEl.style.setProperty('--mx', `${(mirrorLag.x * 100).toFixed(1)}%`);
          mirrorEl.style.setProperty('--my', `${(mirrorLag.y * 100).toFixed(1)}%`);
        }
      }

      // CEILING — locally thins the Memory Veil and lifts the light a touch.
      const ceilingZone = ECHO_ZONES.ceiling;
      if (isInsideZone(ceilingZone, fx, fy)) {
        dwell.ceiling += dt;
      } else {
        dwell.ceiling = 0;
      }
      const ceilingActive = dwell.ceiling >= ceilingZone.dwellMs;
      ceilingRef.current?.classList.toggle('is-active', ceilingActive);
      if (echoRef.current) {
        const target = ceilingActive ? 1 : 0;
        echoRef.current.ceilingIntensity += (target - echoRef.current.ceilingIntensity) * 0.05;
      }

      // WINDOW — the exterior slowly dims, then slowly restores.
      const windowZone = ECHO_ZONES.window;
      if (isInsideZone(windowZone, fx, fy)) {
        dwell.window += dt;
      } else {
        dwell.window = 0;
      }
      const windowTarget = dwell.window >= windowZone.dwellMs ? 0.24 : 0;
      windowDarken += (windowTarget - windowDarken) * 0.012;
      windowRef.current?.style.setProperty('--darken', windowDarken.toFixed(3));

      // LAMP — a single fluctuation, resets only once the cursor leaves.
      const lampZone = ECHO_ZONES.lamp;
      if (isInsideZone(lampZone, fx, fy)) {
        dwell.lamp += dt;
        if (dwell.lamp >= lampZone.dwellMs && !fired.lamp) {
          fired.lamp = true;
          const el = lampRef.current;
          el?.classList.add('is-flickering');
          clearTimeout(lampFlickerTimer);
          lampFlickerTimer = setTimeout(() => lampRef.current?.classList.remove('is-flickering'), LAMP_FLICKER_MS);
        }
      } else {
        dwell.lamp = 0;
        fired.lamp = false;
      }

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(bedPulseTimer);
      clearTimeout(lampFlickerTimer);
    };
  }, [pointerRef, echoRef]);

  return (
    <div className="dream-echoes" aria-hidden="true">
      <div ref={bedRef} className="echo-zone echo-bed" style={zoneStyle(ECHO_ZONES.bed)} />
      <div ref={mirrorRef} className="echo-zone echo-mirror" style={zoneStyle(ECHO_ZONES.mirror)} />
      <div ref={ceilingRef} className="echo-zone echo-ceiling" style={zoneStyle(ECHO_ZONES.ceiling)} />
      <div ref={windowRef} className="echo-zone echo-window" style={zoneStyle(ECHO_ZONES.window)} />
      <div ref={lampRef} className="echo-zone echo-lamp" style={zoneStyle(ECHO_ZONES.lamp)} />
    </div>
  );
}
