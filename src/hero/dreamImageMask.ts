// Draws the settled dream image directly into a live <canvas> that
// DreamReconstruction keeps mounted and displays in place of an <img>:
// the photo itself is cut to a soft, irregular "gap between clouds" shape
// (not a smooth oval, not a hard rectangle), and a band of real cloud
// footage is drawn on top straddling that edge, so clouds visibly drape
// over the photo rather than the photo just fading to reveal whatever is
// behind it. Approved via a side-by-side reference mockup before this was
// built — see the mockup's own notes for the earlier candidates it beat
// (a plain radial vignette, and a hand-traced exact silhouette applied via
// CSS mask-image / a PNG data URL round-tripped through an <img>, both of
// which independently proved unreliable in the field despite checking out
// pixel-correct on every remote inspection). Everything here draws
// straight into the live <canvas> that's the displayed element — no CSS
// mask-image, no PNG re-encode — which is the part that's actually been
// verified to paint correctly.
//
// Two defensive rules learned the hard way and worth keeping:
// 1. Never draw a canvas onto its own context (even via a helper that
//    "returns" it) while a filter/composite op is active — that
//    self-referential draw is exactly the kind of thing that has behaved
//    inconsistently across browsers all through this feature's history.
//    Every blur here writes into a SEPARATE destination canvas.
// 2. The photo is drawn to the canvas (full, unmasked) before the mask is
//    built. If mask-building ever throws, an un-caught error there would
//    leave that raw unmasked draw as the final visible state — a plain
//    rectangle, indistinguishable from every previous version of this bug.
//    The primary mask step is therefore wrapped so any failure falls back
//    to a trivial, hard-to-break radial vignette instead of leaving the
//    canvas unmasked.

const CLOUD_TEXTURE_URL = '/dream-cloud-overlap.jpg';

// Fixed, not per-dream-random: one deterministic "gap" shape, chosen from
// a handful the user reviewed in the approval mockup.
const SHAPE_SEED = 7;

let cloudTexturePromise: Promise<HTMLImageElement> | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load image: ${src}`));
    img.src = src;
  });
}

function getCloudTexture(): Promise<HTMLImageElement> {
  if (!cloudTexturePromise) cloudTexturePromise = loadImage(CLOUD_TEXTURE_URL);
  return cloudTexturePromise;
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
  const octx = out.getContext('2d');
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
 * stays concentric with itself, which is what lets drawCloudOverlayRing
 * carve a ring out of two of these.
 */
function buildLobeMask(cw: number, ch: number, seed: number, scale: number): HTMLCanvasElement {
  const rand = mulberry32(seed);
  const m = makeCanvas(cw, ch);
  const mctx = m.getContext('2d');
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
  const mctx = m.getContext('2d');
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

function applyMask(ctx: CanvasRenderingContext2D, mask: HTMLCanvasElement): void {
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Draws real cloud footage (a still frame from the same approved cloud
 * video used as the Dream Stage background) into a ring that straddles
 * the photo's edge — built from the outer lobe shape minus a slightly
 * shrunk inner one, so part of the ring overlaps onto the photo itself
 * (occluding it, not just revealing background through it) and part
 * spills past the photo's edge into the surrounding environment.
 */
async function drawCloudOverlayRing(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  seed: number,
): Promise<void> {
  const cloudTexture = await getCloudTexture();

  const outer = buildLobeMask(cw, ch, seed, 1.16);
  const innerShrunk = buildLobeMask(cw, ch, seed, 0.9);
  const ring = makeCanvas(cw, ch);
  const rctx = ring.getContext('2d');
  if (!rctx) return;
  rctx.drawImage(outer, 0, 0);
  rctx.globalCompositeOperation = 'destination-out';
  rctx.drawImage(innerShrunk, 0, 0);
  rctx.globalCompositeOperation = 'source-over';

  const cloudLayer = makeCanvas(cw, ch);
  const cctx = cloudLayer.getContext('2d');
  if (!cctx) return;
  const cr = coverRect(cloudTexture.naturalWidth, cloudTexture.naturalHeight, cw, ch);
  cctx.drawImage(cloudTexture, cr.dx, cr.dy, cr.dw, cr.dh);
  cctx.globalCompositeOperation = 'destination-in';
  cctx.drawImage(ring, 0, 0);
  cctx.globalCompositeOperation = 'source-over';

  ctx.drawImage(cloudLayer, 0, 0);
}

/**
 * Draws `imageUrl` into `canvas`, cut to the irregular cloud-gap shape and
 * overlaid with a ring of real cloud footage along its edge. Sized to a
 * fixed ~16:9 canvas so the result matches the arrival box's own aspect
 * ratio; CSS sizing (width/height:100% on .dr-image) scales that to the
 * real rendered box (kept meaningfully smaller than earlier passes so
 * there's always real cloud around every side, not just at the edges of
 * an already-huge box). The primary mask can never fail silently into an
 * unmasked photo — if the organic lobe shape throws for any reason, a
 * trivial ellipse vignette is applied instead. The cloud overlay ring is
 * separately best-effort: if the texture fails to load, the already-cut
 * photo is still a complete, correct result on its own.
 */
export async function drawDreamImageMask(canvas: HTMLCanvasElement, imageUrl: string): Promise<void> {
  const photo = await loadImage(imageUrl);

  const cw = 1600;
  const ch = 900;
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas context unavailable');

  const r = coverRect(photo.naturalWidth, photo.naturalHeight, cw, ch);
  ctx.clearRect(0, 0, cw, ch);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(photo, r.dx, r.dy, r.dw, r.dh);

  try {
    applyMask(ctx, buildLobeMask(cw, ch, SHAPE_SEED, 1.0));
  } catch {
    applyMask(ctx, buildSimpleVignetteMask(cw, ch));
  }

  try {
    await drawCloudOverlayRing(ctx, cw, ch, SHAPE_SEED);
  } catch {
    // Cloud texture failed to load — the cut-edge photo above is already
    // a complete, correct result on its own.
  }
}
