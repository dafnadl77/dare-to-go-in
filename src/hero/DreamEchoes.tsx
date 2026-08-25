import { useEffect, useRef, type RefObject } from 'react';
import { ECHO_ZONES, isInsideZone, zoneStyle } from './dreamEchoZones';
import type { EchoState } from './EchoState';
import type { PointerState } from './usePointerRef';
import { lampEnvelope, type LampState } from './lampState';
import './DreamEchoes.css';

interface DreamEchoesProps {
  pointerRef: RefObject<PointerState>;
  echoRef: RefObject<EchoState>;
  lampStateRef: RefObject<LampState>;
}

/*
 * FUTURE ASSET ARCHITECTURE — not implemented yet, no rendering here today:
 * - Sleeping-body impression: a dedicated masked-region asset over the
 *   bed, independent of the real photographic Dream Event in MemoryVeil.
 */

/**
 * Hidden atmospheric interactions. Mirror, ceiling, and window are
 * unchanged hover effects. The two bedside lamps alternate brightness on
 * their own independent schedule (useLampScheduler.ts, via lampStateRef)
 * — no hover trigger, no visible boundary, just a real brightness
 * increase right on each fixture. Bed's own autonomous "changed
 * overnight" moment and the artwork/mirror photographic swaps are driven
 * entirely by MemoryVeil.tsx (dreamEventState.ts / useDreamEventSequence.ts).
 */
export default function DreamEchoes({ pointerRef, echoRef, lampStateRef }: DreamEchoesProps) {
  const mirrorRef = useRef<HTMLDivElement>(null);
  const ceilingRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const lampLeftRef = useRef<HTMLDivElement>(null);
  const lampRightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let lastT = performance.now();

    const dwell = { mirror: 0, ceiling: 0, window: 0 };
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

      // ---- MIRROR — unchanged: a distortion disc that trails the cursor. ----
      const mirrorZone = ECHO_ZONES.mirror;
      const insideMirror = isInsideZone(mirrorZone, fx, fy);
      dwell.mirror = insideMirror ? dwell.mirror + dt : 0;
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

      // ---- CEILING — approved, unchanged. ----
      const ceilingZone = ECHO_ZONES.ceiling;
      const insideCeiling = isInsideZone(ceilingZone, fx, fy);
      dwell.ceiling = insideCeiling ? dwell.ceiling + dt : 0;
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

      // ---- WINDOW — unchanged: exterior dims in slow lockstep with dwell. ----
      const windowZone = ECHO_ZONES.window;
      const insideWindow = isInsideZone(windowZone, fx, fy);
      dwell.window = insideWindow ? dwell.window + dt : 0;
      const windowTarget = dwell.window >= windowZone.dwellMs ? 0.13 : 0;
      windowDarken += (windowTarget - windowDarken) * 0.07;
      windowRef.current?.style.setProperty('--darken', windowDarken.toFixed(3));

      // ---- LAMPS — two independent, autonomous-only fixtures, tight to
      // each lamp, alternating on their own schedule (lampStateRef). ----
      const lamp = lampStateRef.current;
      let leftIntensity = 0;
      let rightIntensity = 0;
      if (lamp?.activeSide === 'left') {
        leftIntensity = lampEnvelope(now - lamp.startTime, lamp) ?? 0;
      } else if (lamp?.activeSide === 'right') {
        rightIntensity = lampEnvelope(now - lamp.startTime, lamp) ?? 0;
      }
      lampLeftRef.current?.style.setProperty('--intensity', leftIntensity.toFixed(3));
      lampRightRef.current?.style.setProperty('--intensity', rightIntensity.toFixed(3));

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [pointerRef, echoRef, lampStateRef]);

  return (
    <div className="dream-echoes" aria-hidden="true">
      <div ref={windowRef} className="echo-zone echo-window" style={zoneStyle(ECHO_ZONES.window)} />
      <div ref={lampLeftRef} className="echo-zone echo-lamp" style={zoneStyle(ECHO_ZONES.lampLeft)} />
      <div ref={lampRightRef} className="echo-zone echo-lamp" style={zoneStyle(ECHO_ZONES.lampRight)} />
      <div ref={mirrorRef} className="echo-disc echo-mirror-disc" />
      <div ref={ceilingRef} className="echo-disc echo-ceiling-disc" />
    </div>
  );
}
