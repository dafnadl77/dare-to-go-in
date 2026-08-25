import { useEffect, useRef, type RefObject } from 'react';
import { createFbmNoise2D, clamp01 } from './noise';
import { createGrainTile } from './grain';
import { PHASE_START_MS } from './useOpeningSequence';
import { CONSOLE_EXCLUDE_ZONE, isInsideRect } from './dreamEchoZones';
import { DREAM_EVENT_REGIONS, type DreamEventRegion } from './dreamEventRegions';
import { dreamEventEnvelope, type DreamEventState, type DreamEventType } from './dreamEventState';
import { coverFit, coverRectToDest, type CoverTransform } from './coverFit';
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
  dreamEventRef: RefObject<DreamEventState>;
  startTime: number;
}

interface EventComposite {
  canvas: HTMLCanvasElement;
  dx: number;
  dy: number;
}

/**
 * Builds the small masked crossfade patch for one Dream Event region —
 * called once per event activation, not per frame. `videoCover` is the
 * exact object-fit:cover transform of the hero video's own native
 * resolution into the current canvas size; the region's normalized
 * (0..1) bounds are defined in that same source-image coordinate system,
 * so applying the identical transform keeps the reference photo's patch
 * pixel-aligned with the video underneath regardless of viewport aspect.
 */
function buildEventComposite(
  region: DreamEventRegion,
  img: HTMLImageElement,
  videoCover: CoverTransform,
  videoW: number,
  videoH: number,
  canvasW: number,
  canvasH: number,
): EventComposite | null {
  if (!img.complete || img.naturalWidth === 0) return null;

  const rect = coverRectToDest(videoCover, videoW, videoH, region.xMin, region.xMax, region.yMin, region.yMax);
  if (rect.w <= 0 || rect.h <= 0) return null;

  const rx = rect.x;
  const ry = rect.y;
  const rw = rect.w;
  const rh = rect.h;

  const padL = rw * region.pad.left;
  const padR = rw * region.pad.right;
  const padT = rh * region.pad.top;
  const padB = rh * region.pad.bottom;

  const dx = Math.max(0, rx - padL);
  const dy = Math.max(0, ry - padT);
  const dxEnd = Math.min(canvasW, rx + rw + padR);
  const dyEnd = Math.min(canvasH, ry + rh + padB);
  const dw = dxEnd - dx;
  const dh = dyEnd - dy;
  if (dw <= 0 || dh <= 0) return null;

  // The destination rect (dx,dy,dw,dh) corresponds to a normalized (0..1)
  // fraction of the video's source frame. The reference photo shares the
  // exact same full-frame composition, so that same fraction — applied to
  // its own native resolution — is its correct source crop.
  const normX = (dx - videoCover.offsetX) / (videoW * videoCover.scale);
  const normY = (dy - videoCover.offsetY) / (videoH * videoCover.scale);
  const normW = dw / (videoW * videoCover.scale);
  const normH = dh / (videoH * videoCover.scale);
  const sxImg = normX * img.naturalWidth;
  const syImg = normY * img.naturalHeight;
  const swImg = normW * img.naturalWidth;
  const shImg = normH * img.naturalHeight;

  const composite = document.createElement('canvas');
  composite.width = Math.max(1, Math.round(dw));
  composite.height = Math.max(1, Math.round(dh));
  const cctx = composite.getContext('2d')!;
  cctx.drawImage(img, sxImg, syImg, swImg, shImg, 0, 0, composite.width, composite.height);

  const insetLeft = rx - dx;
  const insetTop = ry - dy;
  const solidW = rw;
  const solidH = rh;

  const pads = [padL, padR, padT, padB].filter((p) => p > 1);
  const blurPx = pads.length ? Math.max(6, Math.min(...pads, 60) * 0.6) : Math.max(2, Math.min(solidW, solidH) * 0.035);

  cctx.globalCompositeOperation = 'destination-in';
  cctx.filter = `blur(${blurPx}px)`;
  cctx.fillStyle = '#fff';
  cctx.beginPath();
  if (region.shape === 'ellipse') {
    cctx.ellipse(
      insetLeft + solidW / 2,
      insetTop + solidH / 2,
      Math.max(1, solidW / 2),
      Math.max(1, solidH / 2),
      0,
      0,
      Math.PI * 2,
    );
  } else {
    cctx.roundRect(insetLeft, insetTop, solidW, solidH, Math.min(solidW, solidH) * 0.06);
  }
  cctx.fill();
  cctx.filter = 'none';
  cctx.globalCompositeOperation = 'source-over';

  return { canvas: composite, dx, dy };
}

const GRID_W = 72;
const GRID_H = 40;
const RENDER_SCALE = 0.55;
const MAX_DPR = 1.5;

const CURSOR_RADIUS = 8.5;
const FOCUS_RADIUS = 15;
const CEILING_ECHO_RADIUS = 13;
const REVEAL_BAND = 0.16;
const IDLE_MS = 3000;
const LOOP_CROSSFADE_MS = 850;

export default function MemoryVeil({
  videoARef,
  videoBRef,
  pointerRef,
  holdRef,
  echoRef,
  dreamEventRef,
  startTime,
}: MemoryVeilProps) {
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

    // Interactive blue light — a distinct, always-on layer above the fog
    // atmosphere (not the local unfogging grid above). A large, heavily
    // feathered pool of cool underwater blue that trails the cursor with
    // slight inertia, brighter near the ocean ceiling, subtler elsewhere,
    // and silent over the books/console exclusion zone. Disabled entirely
    // on touch-only devices, since there is no persistent cursor there.
    const hoverMql = window.matchMedia('(hover: none)');
    let blueLightEnabled = !hoverMql.matches;
    const updateHoverCapability = () => {
      blueLightEnabled = !hoverMql.matches;
    };
    hoverMql.addEventListener('change', updateHoverCapability);
    const blueLightPos = { x: vw / 2, y: vh / 2 };
    let blueLightInit = false;

    // Dream Event images (bed/art/mirror) — small local masked crossfades,
    // never the whole background. Preloaded once; the composite for the
    // currently active event is (re)built only when that event starts.
    const dreamEventImages: Record<DreamEventType, HTMLImageElement> = {
      bed: new Image(),
      art: new Image(),
      mirror: new Image(),
    };
    (Object.keys(DREAM_EVENT_REGIONS) as DreamEventType[]).forEach((key) => {
      dreamEventImages[key].src = DREAM_EVENT_REGIONS[key].src;
    });
    let cachedEventType: DreamEventType | null = null;
    let cachedEventStartTime = 0;
    let cachedComposite: EventComposite | null = null;

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

      if (blueLightEnabled && pointer?.hasMoved) {
        if (!blueLightInit) {
          blueLightPos.x = pointer.x;
          blueLightPos.y = pointer.y;
          blueLightInit = true;
        }
        blueLightPos.x += (pointer.x - blueLightPos.x) * 0.08;
        blueLightPos.y += (pointer.y - blueLightPos.y) * 0.08;
      }

      const addRate = 3.4 * dt;
      const focusAddRate = 4.4 * dt;
      const ceilingAddRate = 3.2 * dt;
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
          const cellExcluded = isInsideRect(CONSOLE_EXCLUDE_ZONE, gx / GRID_W, gy / GRID_H);

          if (cursorActive && !cellExcluded && dist < CURSOR_RADIUS * 1.4) {
            const n = edgeNoise(gx * 0.22 + timeOffset * 40, gy * 0.22 - timeOffset * 30);
            const effR = CURSOR_RADIUS * (0.62 + 0.55 * n);
            if (dist < effR) {
              const falloff = Math.pow(1 - dist / effR, 1.6);
              val = Math.min(1, val + falloff * addRate);
            }
          }

          if (ceilingIntensity > 0.01 && !cellExcluded && dist < CEILING_ECHO_RADIUS) {
            const falloff = Math.pow(1 - dist / CEILING_ECHO_RADIUS, 1.3);
            val = Math.min(1, val + falloff * ceilingIntensity * ceilingAddRate);
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

        // ---- Dream Event masked crossfade (bed/art/mirror) — sits between the
        // raw video and the fog atmosphere, so fog still settles over it naturally. ----
        const event = dreamEventRef.current;
        if (event?.activeType) {
          const type = event.activeType;
          const alpha = dreamEventEnvelope(now - event.startTime, event);
          if (alpha !== null && alpha > 0.002) {
            if (cachedEventType !== type || cachedEventStartTime !== event.startTime) {
              const videoW = loopFrame.primary.videoWidth;
              const videoH = loopFrame.primary.videoHeight;
              const videoCover = coverFit(videoW, videoH, canvas!.width, canvas!.height);
              cachedComposite = buildEventComposite(
                DREAM_EVENT_REGIONS[type],
                dreamEventImages[type],
                videoCover,
                videoW,
                videoH,
                canvas!.width,
                canvas!.height,
              );
              cachedEventType = type;
              cachedEventStartTime = event.startTime;
            }
            if (cachedComposite) {
              ctx2.globalAlpha = alpha;
              ctx2.drawImage(cachedComposite.canvas, cachedComposite.dx, cachedComposite.dy);
              ctx2.globalAlpha = 1;
            }
          }
        }

        ctx2.imageSmoothingEnabled = true;
        ctx2.drawImage(fogCanvas, 0, 0, fw, fh, 0, 0, canvas!.width, canvas!.height);

        if (blueLightEnabled && pointer?.hasMoved) {
          const lightFx = blueLightPos.x / vw;
          const lightFy = blueLightPos.y / vh;
          if (!isInsideRect(CONSOLE_EXCLUDE_ZONE, lightFx, lightFy)) {
            const ceilingBoost = clamp01((0.34 - lightFy) / 0.34);
            const baseAlpha = 0.07 + ceilingBoost * 0.15;
            const lx = blueLightPos.x * dpr;
            const ly = blueLightPos.y * dpr;
            const r = 150 * dpr * (1 + ceilingBoost * 0.25);

            ctx2.save();
            ctx2.globalCompositeOperation = 'screen';
            ctx2.filter = 'blur(28px)';
            const grad = ctx2.createRadialGradient(lx, ly, 0, lx, ly, r);
            grad.addColorStop(0, `rgba(120, 195, 225, ${baseAlpha.toFixed(3)})`);
            grad.addColorStop(0.45, `rgba(110, 180, 215, ${(baseAlpha * 0.55).toFixed(3)})`);
            grad.addColorStop(1, 'rgba(110, 180, 215, 0)');
            ctx2.fillStyle = grad;
            ctx2.beginPath();
            ctx2.arc(lx, ly, r, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.restore();
          }
        }
      }

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      hoverMql.removeEventListener('change', updateHoverCapability);
    };
  }, [videoARef, videoBRef, pointerRef, holdRef, echoRef, dreamEventRef, startTime]);

  return <canvas ref={canvasRef} className="memory-veil" aria-hidden="true" />;
}
