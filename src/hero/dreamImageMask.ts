// Renders the settled dream image into a live <canvas> that
// DreamReconstruction keeps mounted and repaints every animation frame:
// the photo is cut to a soft, irregular "gap between clouds" shape, with
// real cloud footage draped over its edge — but unlike every earlier
// version of this, the canvas is filled with the CURRENT frame of the
// same cloud background video as its base layer FIRST, then the masked
// photo is composited on top of that, all inside this one canvas's own
// 2D context. The canvas that reaches the screen is therefore fully
// opaque everywhere — there is no transparent pixel left for the browser
// to alpha-blend against the video underneath at display time.
//
// Why this exists: every previous version (CSS mask-image, a canvas-baked
// PNG handed to a fresh <img>, a live <canvas> left genuinely
// transparent outside the mask) was independently verified pixel-correct
// — including getImageData sampled live, on the user's own machine, on
// the exact broken screen, reporting fully transparent corners and a
// fully opaque center exactly as intended — and the screen still showed
// a plain hard rectangle every time regardless. Correct pixel data with
// wrong screen output, repeated across categorically different
// mechanisms, points at the one layer common to all of them: the browser
// compositing a transparent element against the moving <video>
// background underneath. Baking that same video's current frame directly
// into the canvas removes the need for that compositing step entirely —
// what's "outside" the photo's shape is real cloud video content painted
// directly into the canvas's own pixels, not transparency revealing a
// separate element below.
//
// Baking the video frame in didn't fix it either — confirmed the exact
// same fully-opaque, fully-correct-pixel-data canvas (verified again via
// getImageData: alpha 255 everywhere, real cloud color at the corners,
// real photo color at the center) still painted as a plain hard
// rectangle for the user, in both Chrome AND Brave — two different
// browsers sharing the same underlying engine (Chromium) AND, since
// Brave ships its own independent ad/privacy blocking, not an
// extension-specific quirk either. That points at the GPU/graphics
// driver layer common to every Chromium-based browser on that one
// machine, not at any particular browser or extension. Every
// getContext('2d') call here passes { willReadFrequently: true } — a
// standard hint that pushes the browser to render that canvas in
// software instead of on the GPU, since software readback is cheaper
// than GPU readback. If the real problem has been GPU-accelerated
// canvas/video compositing misbehaving on that specific machine all
// along, moving this canvas off the GPU path entirely sidesteps it.
//
// Two defensive rules learned the hard way and worth keeping:
// 1. Never draw a canvas onto its own context (even via a helper that
//    "returns" it) while a filter/composite op is active — that
//    self-referential draw is exactly the kind of thing that has behaved
//    inconsistently across browsers all through this feature's history.
//    Every blur here writes into a SEPARATE destination canvas.
// 2. Any masked layer is built on its OWN temporary canvas and composited
//    onto the main canvas via a plain drawImage — never destination-in
//    applied directly to the main canvas — so a failure while building
//    one layer can never leave the main canvas's video base half-erased.

const CLOUD_TEXTURE_URL = '/dream-cloud-overlap.jpg';

// Fixed, not per-dream-random: one deterministic "gap" shape, chosen from
// a handful the user reviewed in the approval mockup.
const SHAPE_SEED = 7;

const CANVAS_W = 1600;
const CANVAS_H = 900;

export interface DreamImageAssets {
  photo: HTMLImageElement;
  cloudTexture: HTMLImageElement | null;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load image: ${src}`));
    img.src = src;
  });
}

let cloudTexturePromise: Promise<HTMLImageElement> | null = null;
function getCloudTexture(): Promise<HTMLImageElement> {
  if (!cloudTexturePromise) cloudTexturePromise = loadImage(CLOUD_TEXTURE_URL);
  return cloudTexturePromise;
}

/** Preloads everything renderDreamImageFrame needs. Call once per settled image. */
export async function loadDreamImageAssets(imageUrl: string): Promise<DreamImageAssets> {
  const photo = await loadImage(imageUrl);
  const cloudTexture = await getCloudTexture().catch(() => null);
  return { photo, cloudTexture };
}

// Deterministic PRNG (mulberry32) so the same seed always reproduces the
// same lobe layout — no external shape asset to load or keep in sync.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function coverRect(iw: number, ih: number, cw: number, ch: number) {
  const scale = Math.max(cw / iw, ch / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  return { dx: (cw - dw) / 2, dy: (ch - dh) / 2, dw, dh };
}

function makeCanvas(cw: number, ch: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  return c;
}

/** Blurs `source` into a new canvas of the same size — never writes back into `source` itself. */
function blurToNewCanvas(source: HTMLCanvasElement, radiusPx: number): HTMLCanvasElement {
  const out = makeCanvas(source.width, source.height);
  const octx = out.getContext('2d', { willReadFrequently: true });
  if (!octx) return source;
  octx.filter = `blur(${radiusPx}px)`;
  octx.drawImage(source, 0, 0);
  octx.filter = 'none';
  return out;
}

/**
 * Builds a soft "cloud-lobe" alpha mask at the given scale (1.0 = the
 * photo's normal edge, >1 expands outward, <1 shrinks inward) — a ring of
 * overlapping soft circles around a base ellipse, unioned additively and
 * blurred so the union reads as an irregular cloud silhouette rather than
 * a smooth curve or a scalloped polygon. Same seed at different scales
 * stays concentric with itself, which is what lets buildCloudRingLayer
 * carve a ring out of two of these.
 */
function buildLobeMask(cw: number, ch: number, seed: number, scale: number): HTMLCanvasElement {
  const rand = mulberry32(seed);
  const m = makeCanvas(cw, ch);
  const mctx = m.getContext('2d', { willReadFrequently: true });
  if (!mctx) return m;

  const cx = cw / 2;
  const cy = ch * 0.48;
  const baseRx = cw * 0.4 * scale;
  const baseRy = ch * 0.4 * scale;
  const lobes = 13;

  mctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < lobes; i++) {
    const angle = (i / lobes) * Math.PI * 2 + rand() * 0.35;
    const wobble = 0.72 + rand() * 0.56;
    const lx = cx + Math.cos(angle) * baseRx * wobble;
    const ly = cy + Math.sin(angle) * baseRy * wobble;
    const lobeR = cw * 0.2 * scale * (0.65 + rand() * 0.6);
    const g = mctx.createRadialGradient(lx, ly, 0, lx, ly, lobeR);
    g.addColorStop(0, 'rgba(255, 255, 255, 1)');
    g.addColorStop(0.6, 'rgba(255, 255, 255, 0.9)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    mctx.fillStyle = g;
    mctx.beginPath();
    mctx.arc(lx, ly, lobeR, 0, Math.PI * 2);
    mctx.fill();
  }

  // A solid core so the center never thins out between lobes.
  const coreR = Math.min(baseRx, baseRy) * 0.9;
  const coreG = mctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  coreG.addColorStop(0, 'rgba(255, 255, 255, 1)');
  coreG.addColorStop(1, 'rgba(255, 255, 255, 0.95)');
  mctx.fillStyle = coreG;
  mctx.globalCompositeOperation = 'lighter';
  mctx.beginPath();
  mctx.ellipse(cx, cy, baseRx * 0.9, baseRy * 0.9, 0, 0, Math.PI * 2);
  mctx.fill();

  // Soften the lumpy union into a cloud-like edge — into a fresh canvas,
  // never back into `m` itself.
  return blurToNewCanvas(m, 26);
}

/** A trivial, hard-to-break fallback: a single soft ellipse, no lobes, no blur filter. */
function buildSimpleVignetteMask(cw: number, ch: number): HTMLCanvasElement {
  const m = makeCanvas(cw, ch);
  const mctx = m.getContext('2d', { willReadFrequently: true });
  if (!mctx) return m;
  const cx = cw / 2;
  const cy = ch * 0.48;
  const rx = cw * 0.62;
  const ry = ch * 0.64;
  const g = mctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.55, 'rgba(255, 255, 255, 1)');
  g.addColorStop(0.75, 'rgba(255, 255, 255, 0.6)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  mctx.save();
  mctx.translate(cx, cy);
  mctx.scale(rx, ry);
  mctx.fillStyle = g;
  mctx.fillRect(-4, -4, 8, 8);
  mctx.restore();
  return m;
}

/** Draws `photo` masked to the lobe shape (falling back to a plain vignette on any failure) onto its own canvas. */
function buildMaskedPhotoLayer(photo: HTMLImageElement, cw: number, ch: number): HTMLCanvasElement {
  const layer = makeCanvas(cw, ch);
  const lctx = layer.getContext('2d', { willReadFrequently: true });
  if (!lctx) return layer;

  const r = coverRect(photo.naturalWidth, photo.naturalHeight, cw, ch);
  lctx.drawImage(photo, r.dx, r.dy, r.dw, r.dh);

  let mask: HTMLCanvasElement;
  try {
    mask = buildLobeMask(cw, ch, SHAPE_SEED, 1.0);
  } catch {
    mask = buildSimpleVignetteMask(cw, ch);
  }
  lctx.globalCompositeOperation = 'destination-in';
  lctx.drawImage(mask, 0, 0);
  lctx.globalCompositeOperation = 'source-over';
  return layer;
}

/**
 * Builds a ring of real cloud footage that straddles the photo's edge —
 * the outer lobe shape minus a slightly shrunk inner one, so part of it
 * overlaps onto the photo itself and part spills past it. Returns null
 * (skip silently) if the cloud texture never loaded.
 */
function buildCloudRingLayer(cloudTexture: HTMLImageElement | null, cw: number, ch: number): HTMLCanvasElement | null {
  if (!cloudTexture) return null;

  const outer = buildLobeMask(cw, ch, SHAPE_SEED, 1.16);
  const innerShrunk = buildLobeMask(cw, ch, SHAPE_SEED, 0.9);
  const ring = makeCanvas(cw, ch);
  const rctx = ring.getContext('2d', { willReadFrequently: true });
  if (!rctx) return null;
  rctx.drawImage(outer, 0, 0);
  rctx.globalCompositeOperation = 'destination-out';
  rctx.drawImage(innerShrunk, 0, 0);
  rctx.globalCompositeOperation = 'source-over';

  const layer = makeCanvas(cw, ch);
  const cctx = layer.getContext('2d', { willReadFrequently: true });
  if (!cctx) return null;
  const cr = coverRect(cloudTexture.naturalWidth, cloudTexture.naturalHeight, cw, ch);
  cctx.drawImage(cloudTexture, cr.dx, cr.dy, cr.dw, cr.dh);
  cctx.globalCompositeOperation = 'destination-in';
  cctx.drawImage(ring, 0, 0);
  cctx.globalCompositeOperation = 'source-over';
  return layer;
}

/**
 * Paints one frame: the cloud video's CURRENT frame as an opaque base
 * (falling back to a plain dark fill if the video isn't ready yet),
 * then the masked photo, then the cloud-overlap ring, all composited
 * within this canvas's own context. The result is fully opaque — meant
 * to be called every animation frame while THIS IS YOUR DREAM is showing,
 * so the baked-in cloud base stays visually in step with the real
 * background video playing beyond this canvas's own box.
 */
export function renderDreamImageFrame(
  canvas: HTMLCanvasElement,
  assets: DreamImageAssets,
  videoEl: HTMLVideoElement | null,
): void {
  if (canvas.width !== CANVAS_W) canvas.width = CANVAS_W;
  if (canvas.height !== CANVAS_H) canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const cw = CANVAS_W;
  const ch = CANVAS_H;

  if (videoEl && videoEl.readyState >= 2 && videoEl.videoWidth > 0) {
    const vr = coverRect(videoEl.videoWidth, videoEl.videoHeight, cw, ch);
    ctx.drawImage(videoEl, vr.dx, vr.dy, vr.dw, vr.dh);
  } else {
    // Video not ready yet — an opaque placeholder close to the stage's
    // own night palette, never a transparent/blank frame.
    ctx.fillStyle = '#0f1a2c';
    ctx.fillRect(0, 0, cw, ch);
  }

  ctx.drawImage(buildMaskedPhotoLayer(assets.photo, cw, ch), 0, 0);

  const ring = buildCloudRingLayer(assets.cloudTexture, cw, ch);
  if (ring) ctx.drawImage(ring, 0, 0);
}
