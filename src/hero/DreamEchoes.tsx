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
 * dwell in a zone for a few hundred ms before anything happens. Mirror and
 * ceiling are small backdrop-filter discs that physically track the cursor
 * position (in real pixels, not a static gradient inside a fixed rect) so
 * the distortion is genuinely localized to where the cursor is.
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
    const mirrorPos = { x: 0, y: 0 };
    let mirrorInit = false;
    let windowDarken = 0;

    function frame(now: number) {
      const dt = Math.min(now - lastT, 50);
      lastT = now;

      const pointer = pointerRef.current;
      const px = pointer ? pointer.x : -1;
      const py = pointer ? pointer.y : -1;
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

      // MIRROR — a small distortion disc that trails the cursor with a lag.
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
        if (mirrorActive) {
          if (!mirrorInit) {
            mirrorPos.x = px;
            mirrorPos.y = py;
            mirrorInit = true;
          }
          mirrorPos.x += (px - mirrorPos.x) * 0.045;
          mirrorPos.y += (py - mirrorPos.y) * 0.045;
          mirrorEl.style.transform = `translate3d(${mirrorPos.x}px, ${mirrorPos.y}px, 0) translate(-50%, -50%)`;
        } else {
          mirrorInit = false;
        }
        mirrorEl.classList.toggle('is-active', mirrorActive);
      }

      // CEILING — a small magnifying disc directly under the cursor.
      const ceilingZone = ECHO_ZONES.ceiling;
      if (isInsideZone(ceilingZone, fx, fy)) {
        dwell.ceiling += dt;
      } else {
        dwell.ceiling = 0;
      }
      const ceilingActive = dwell.ceiling >= ceilingZone.dwellMs;
      const ceilingEl = ceilingRef.current;
      if (ceilingEl) {
        if (ceilingActive) {
          ceilingEl.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%) scale(1.18)`;
        }
        ceilingEl.classList.toggle('is-active', ceilingActive);
      }
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
      const windowTarget = dwell.window >= windowZone.dwellMs ? 0.13 : 0;
      windowDarken += (windowTarget - windowDarken) * 0.07;
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
      <div ref={windowRef} className="echo-zone echo-window" style={zoneStyle(ECHO_ZONES.window)} />
      <div ref={lampRef} className="echo-zone echo-lamp" style={zoneStyle(ECHO_ZONES.lamp)} />
      <div ref={mirrorRef} className="echo-disc echo-mirror-disc" />
      <div ref={ceilingRef} className="echo-disc echo-ceiling-disc" />
    </div>
  );
}
