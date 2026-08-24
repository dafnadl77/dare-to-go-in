import { useEffect, useRef, type RefObject } from 'react';
import { ECHO_ZONES, isInsideZone, zoneStyle } from './dreamEchoZones';
import type { EchoState } from './EchoState';
import type { PointerState } from './usePointerRef';
import './DreamEchoes.css';

interface DreamEchoesProps {
  pointerRef: RefObject<PointerState>;
  echoRef: RefObject<EchoState>;
}

/**
 * Hidden atmospheric interactions. No hotspots, no labels — the cursor must
 * dwell in a zone for several hundred ms before anything happens. The room
 * doesn't react; it reveals things that were already there.
 */
export default function DreamEchoes({ pointerRef, echoRef }: DreamEchoesProps) {
  const bedGlowRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const ceilingRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const windowFigureRef = useRef<HTMLDivElement>(null);
  const lampRef = useRef<HTMLDivElement>(null);
  const lampSpillRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let lastT = performance.now();

    const dwell = { bed: 0, mirror: 0, ceiling: 0, window: 0, lamp: 0, art: 0 };
    const bedGlow = { x: 0, y: 0 };
    let bedGlowInit = false;
    const mirrorPos = { x: 0, y: 0 };
    let mirrorInit = false;
    let windowDarken = 0;
    let windowFigure = 0;

    function frame(now: number) {
      const dt = Math.min(now - lastT, 50);
      lastT = now;

      const pointer = pointerRef.current;
      const px = pointer ? pointer.x : -1;
      const py = pointer ? pointer.y : -1;
      const fx = pointer ? pointer.x / window.innerWidth : -1;
      const fy = pointer ? pointer.y / window.innerHeight : -1;

      // BED — an organic light glow that lags the cursor; the actual
      // texture reveal comes from MemoryVeil's clarity boost via bedIntensity.
      const bedZone = ECHO_ZONES.bed;
      const insideBed = isInsideZone(bedZone, fx, fy);
      dwell.bed = insideBed ? dwell.bed + dt : 0;
      const bedActive = dwell.bed >= bedZone.dwellMs;
      const bedEl = bedGlowRef.current;
      if (bedEl) {
        if (bedActive) {
          if (!bedGlowInit) {
            bedGlow.x = px;
            bedGlow.y = py;
            bedGlowInit = true;
          }
          bedGlow.x += (px - bedGlow.x) * 0.05;
          bedGlow.y += (py - bedGlow.y) * 0.05;
          bedEl.style.transform = `translate3d(${bedGlow.x}px, ${bedGlow.y}px, 0) translate(-50%, -50%)`;
        } else {
          bedGlowInit = false;
        }
        bedEl.classList.toggle('is-active', bedActive);
      }
      if (echoRef.current) {
        const target = bedActive ? 1 : 0;
        echoRef.current.bedIntensity += (target - echoRef.current.bedIntensity) * 0.05;
      }

      // MIRROR — unchanged: a distortion disc that trails the cursor.
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

      // CEILING — unchanged: approved moving circular light/reveal.
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

      // WINDOW — exterior dims, and a faceless figure slowly becomes
      // noticeable in the glass, then dissolves gradually on leaving.
      const windowZone = ECHO_ZONES.window;
      const insideWindow = isInsideZone(windowZone, fx, fy);
      dwell.window = insideWindow ? dwell.window + dt : 0;
      const windowActive = dwell.window >= windowZone.dwellMs;
      const windowDarkenTarget = windowActive ? 0.13 : 0;
      windowDarken += (windowDarkenTarget - windowDarken) * 0.07;
      windowRef.current?.style.setProperty('--darken', windowDarken.toFixed(3));

      const figureTarget = windowActive ? 1 : 0;
      const figureRate = windowActive ? 0.022 : 0.03;
      windowFigure += (figureTarget - windowFigure) * figureRate;
      windowFigureRef.current?.style.setProperty('--figure', windowFigure.toFixed(3));

      // LAMP — a real, continuous brightness increase, not a flicker.
      const lampZone = ECHO_ZONES.lamp;
      const insideLamp = isInsideZone(lampZone, fx, fy);
      dwell.lamp = insideLamp ? dwell.lamp + dt : 0;
      const lampActive = dwell.lamp >= lampZone.dwellMs;
      lampRef.current?.classList.toggle('is-active', lampActive);
      lampSpillRef.current?.classList.toggle('is-active', lampActive);

      // WALL ART — the framed image slowly morphs into another.
      const artZone = ECHO_ZONES.art;
      const insideArt = isInsideZone(artZone, fx, fy);
      dwell.art = insideArt ? dwell.art + dt : 0;
      const artActive = dwell.art >= artZone.dwellMs;
      artRef.current?.classList.toggle('is-active', artActive);

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [pointerRef, echoRef]);

  return (
    <div className="dream-echoes" aria-hidden="true">
      <div ref={windowRef} className="echo-zone echo-window" style={zoneStyle(ECHO_ZONES.window)} />
      <div ref={windowFigureRef} className="echo-zone echo-window-figure" style={zoneStyle(ECHO_ZONES.window)} />
      <div ref={lampRef} className="echo-zone echo-lamp" style={zoneStyle(ECHO_ZONES.lamp)} />
      <div ref={lampSpillRef} className="echo-zone echo-lamp-spill" style={zoneStyle(ECHO_ZONES.lamp)} />
      <div ref={artRef} className="echo-zone echo-art" style={zoneStyle(ECHO_ZONES.art)} />
      <div ref={bedGlowRef} className="echo-disc echo-bed-glow" />
      <div ref={mirrorRef} className="echo-disc echo-mirror-disc" />
      <div ref={ceilingRef} className="echo-disc echo-ceiling-disc" />
    </div>
  );
}
