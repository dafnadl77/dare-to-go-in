import { useEffect, useRef, type RefObject } from 'react';
import { createFbmNoise2D, clamp01 } from './noise';
import { createGrainTile } from './grain';
import { PHASE_START_MS } from './useOpeningSequence';
import type { PointerState } from './usePointerRef';
import type { HoldState } from './HoldState';
import type { EchoState } from './EchoState';
import { createVideoLoopController, drawVideoLoopFrame } from './videoLoopController';
import './MemoryVeil.css';

interface MemoryVeilProps {
  videoARef: RefObject<HTMLVideoElement | null>;
  videoBRef: RefObject<HTMLVideoElement | null>;
  pointerRef: RefObject<PointerState>;
  holdRef: RefObject<HoldState>;
  echoRef: RefObject<EchoState>;
  startTime: number;
}

const GRID_W = 72;
const GRID_H = 40;
const RENDER_SCALE = 0.55;
const MAX_DPR = 1.5;

const CURSOR_RADIUS = 8.5;
const FOCUS_RADIUS = 15;
const CEILING_ECHO_RADIUS = 13;
const BED_ECHO_RADIUS = 11;
const REVEAL_BAND = 0.16;
const IDLE_MS = 3000;
const LOOP_CROSSFADE_MS = 850;

export default function MemoryVeil({ videoARef, videoBRef, pointerRef, holdRef, echoRef, startTime }: MemoryVeilProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const videoA = videoARef.current as HTMLVideoElement | null;
    const videoB = videoBRef.current as HTMLVideoElement | null;
    if (!canvas || !videoA || !videoB) return;

    const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D | null;
    if (!ctx) return;
    const ctx2: CanvasRenderingContext2D = ctx;

    const loop = createVideoLoopController(videoA, videoB, LOOP_CROSSFADE_MS);

    const fogCanvas = document.createElement('canvas');
    const fogCtx = fogCanvas.getContext('2d')!;

    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = GRID_W;
    gridCanvas.height = GRID_H;
    const gridCtx = gridCanvas.getContext('2d')!;
    const gridImage = gridCtx.createImageData(GRID_W, GRID_H);

    const grainTile = createGrainTile(96, 917);
    const grainPattern = fogCtx.createPattern(grainTile, 'repeat')!;

    const ambientNoise = createFbmNoise2D(7, 3);
    const orderNoise = createFbmNoise2D(13, 2);
    const edgeNoise = createFbmNoise2D(21, 2);

    const cellCount = GRID_W * GRID_H;
    const ambientBase = new Float32Array(cellCount);
    const revealOrder = new Float32Array(cellCount);
    const cursorClarity = new Float32Array(cellCount);

    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        const idx = gy * GRID_W + gx;
        ambientBase[idx] = ambientNoise(gx * 0.09, gy * 0.09);
        const o = orderNoise(gx * 0.11 + 40, gy * 0.11 + 40);
        revealOrder[idx] = clamp01(o * 0.8 + Math.random() * 0.2);
      }
    }

    let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    let vw = window.innerWidth;
    let vh = window.innerHeight;

    function resize() {
      vw = window.innerWidth;
      vh = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas!.width = Math.round(vw * dpr);
      canvas!.height = Math.round(vh * dpr);
      fogCanvas.width = Math.round(vw * RENDER_SCALE);
      fogCanvas.height = Math.round(vh * RENDER_SCALE);
    }
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let lastT = performance.now();

    function frame(now: number) {
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;

      const loopFrame = loop.update(now);

      const elapsedMs = now - startTime;
      const introRaw = clamp01((elapsedMs - PHASE_START_MS.emerging) / (PHASE_START_MS.title - PHASE_START_MS.emerging));
      const introEased = 1 - Math.pow(1 - introRaw, 3);
      const introAmount = introEased * (1 + REVEAL_BAND);

      const pointer = pointerRef.current;
      const hold = holdRef.current;
      const idleFor = pointer ? now - pointer.lastMoveAt : Infinity;
      const isIdle = idleFor > IDLE_MS;

      const cursorActive = !!pointer?.hasMoved;
      const px = pointer ? (pointer.x / vw) * GRID_W : GRID_W / 2;
      const py = pointer ? (pointer.y / vh) * GRID_H : GRID_H / 2;
      const fx = hold ? (hold.cx / vw) * GRID_W : 0;
      const fy = hold ? (hold.cy / vh) * GRID_H : 0;
      const listening = !!hold?.listening;
      const focusActive = !!hold?.active || listening;
      const audioLevel = listening && hold ? hold.audioLevel : 0;

      const ceilingIntensity = echoRef.current ? echoRef.current.ceilingIntensity : 0;
      const bedIntensity = echoRef.current ? echoRef.current.bedIntensity : 0;

      const addRate = 3.4 * dt;
      const focusAddRate = 4.4 * dt;
      const ceilingAddRate = 3.2 * dt;
      const bedAddRate = 2.8 * dt;
      const lingerDecay = Math.pow(0.965, dt * 60);
      const idleDecay = Math.pow(0.9, dt * 60);
      const decay = isIdle ? idleDecay : lingerDecay;

      const data = gridImage.data;
      const timeOffset = now * 0.00005;

      for (let gy = 0; gy < GRID_H; gy++) {
        for (let gx = 0; gx < GRID_W; gx++) {
          const idx = gy * GRID_W + gx;
          let val = cursorClarity[idx] * decay;

          const dx = gx - px;
          const dy = gy - py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (cursorActive && dist < CURSOR_RADIUS * 1.4) {
            const n = edgeNoise(gx * 0.22 + timeOffset * 40, gy * 0.22 - timeOffset * 30);
            const effR = CURSOR_RADIUS * (0.62 + 0.55 * n);
            if (dist < effR) {
              const falloff = Math.pow(1 - dist / effR, 1.6);
              val = Math.min(1, val + falloff * addRate);
            }
          }

          if (ceilingIntensity > 0.01 && dist < CEILING_ECHO_RADIUS) {
            const falloff = Math.pow(1 - dist / CEILING_ECHO_RADIUS, 1.3);
            val = Math.min(1, val + falloff * ceilingIntensity * ceilingAddRate);
          }

          if (bedIntensity > 0.01 && dist < BED_ECHO_RADIUS) {
            const n = edgeNoise(gx * 0.2 + timeOffset * 30, gy * 0.2 - timeOffset * 22 + 40);
            const effR = BED_ECHO_RADIUS * (0.7 + 0.5 * n);
            if (dist < effR) {
              const falloff = Math.pow(1 - dist / effR, 1.3);
              val = Math.min(1, val + falloff * bedIntensity * bedAddRate);
            }
          }

          if (focusActive) {
            const fdx = gx - fx;
            const fdy = gy - fy;
            const fdist = Math.sqrt(fdx * fdx + fdy * fdy);
            if (fdist < FOCUS_RADIUS * 1.3) {
              const n = edgeNoise(gx * 0.18 - timeOffset * 20, gy * 0.18 + timeOffset * 25 + 90);
              const breathe = listening ? 1 + audioLevel * 0.15 : 1;
              const effR = FOCUS_RADIUS * (0.75 + 0.35 * n) * breathe;
              if (fdist < effR) {
                const falloff = Math.pow(1 - fdist / effR, 1.4);
                const intensity = listening ? 0.35 + 0.65 * audioLevel : 0.4 + 0.6 * hold.progress;
                val = Math.min(1, val + falloff * focusAddRate * intensity);
              }
            }
          }

          cursorClarity[idx] = val;

          const baseFog = 0.52 + ambientBase[idx] * 0.28;
          const ro = revealOrder[idx];
          const introLocal = clamp01((introAmount - (ro - REVEAL_BAND)) / (2 * REVEAL_BAND));
          const introClearBoost = 0.6;
          const clearness = Math.min(0.94, introLocal * introClearBoost + val);
          const remainingFog = baseFog * (1 - clearness);
          const eraseAlpha = clamp01(1 - remainingFog);

          const p4 = idx * 4;
          data[p4] = 255;
          data[p4 + 1] = 255;
          data[p4 + 2] = 255;
          data[p4 + 3] = Math.round(eraseAlpha * 255);
        }
      }
      gridCtx.putImageData(gridImage, 0, 0);

      if (loopFrame.primary.readyState >= 2 && loopFrame.primary.videoWidth > 0) {
        const fw = fogCanvas.width;
        const fh = fogCanvas.height;

        fogCtx.globalCompositeOperation = 'source-over';
        fogCtx.filter = 'blur(14px) saturate(0.8) brightness(0.86) contrast(1.08)';
        drawVideoLoopFrame(fogCtx, loopFrame, fw, fh);

        fogCtx.filter = 'none';
        fogCtx.globalCompositeOperation = 'source-atop';
        fogCtx.fillStyle = 'rgba(196, 184, 158, 0.07)';
        fogCtx.fillRect(0, 0, fw, fh);

        const grainOffsetX = Math.sin(now * 0.00013) * 6;
        const grainOffsetY = Math.cos(now * 0.00011) * 6;
        fogCtx.globalCompositeOperation = 'overlay';
        fogCtx.globalAlpha = 0.05 + audioLevel * 0.025;
        fogCtx.save();
        fogCtx.translate(grainOffsetX, grainOffsetY);
        fogCtx.fillStyle = grainPattern;
        fogCtx.fillRect(-10, -10, fw + 20, fh + 20);
        fogCtx.restore();
        fogCtx.globalAlpha = 1;

        fogCtx.globalCompositeOperation = 'destination-out';
        fogCtx.imageSmoothingEnabled = true;
        fogCtx.drawImage(gridCanvas, 0, 0, GRID_W, GRID_H, 0, 0, fw, fh);
        fogCtx.globalCompositeOperation = 'source-over';

        const holdIntensity = listening ? audioLevel * 0.6 : hold ? hold.progress : 0;
        ctx2.filter =
          holdIntensity > 0.01
            ? `saturate(${(1 + holdIntensity * 0.18).toFixed(3)}) contrast(${(1 + holdIntensity * 0.06).toFixed(3)}) brightness(${(1 + holdIntensity * 0.03).toFixed(3)})`
            : 'none';
        drawVideoLoopFrame(ctx2, loopFrame, canvas!.width, canvas!.height);

        ctx2.filter = 'none';
        ctx2.imageSmoothingEnabled = true;
        ctx2.drawImage(fogCanvas, 0, 0, fw, fh, 0, 0, canvas!.width, canvas!.height);
      }

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [videoARef, videoBRef, pointerRef, holdRef, echoRef, startTime]);

  return <canvas ref={canvasRef} className="memory-veil" aria-hidden="true" />;
}
