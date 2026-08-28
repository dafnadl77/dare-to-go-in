// Draws the settled dream image directly into a live <canvas> that
// DreamReconstruction keeps mounted and displays in place of an <img>,
// with a soft radial-gradient feather baked into its alpha channel — no
// hard edge, no separate "frame", just the photo dissolving into the
// cloud environment behind it.
//
// This replaces an earlier, much more elaborate approach (an exact
// organic "opening in the clouds" silhouette, hand-traced from a
// reference outline, plus a second cloud-video layer masked to overlap
// the image's edge) that went through several rounds of debugging in the
// field without ever reliably rendering correctly for the user — right
// down to the traced-shape PNG mask itself, applied via CSS mask-image,
// then via <canvas> compositing to a data URL, then finally drawn
// straight into a live <canvas>: all three were independently verified
// pixel-correct (including via getImageData sampled live in the user's
// own browser console) yet still didn't consistently paint correctly on
// screen. Simplifying to a plain radial-gradient vignette — generated
// procedurally, no external mask asset, no custom shape — removes that
// entire class of risk: it's the same live-<canvas> rendering path
// already confirmed to work, just with the simplest possible mask.

/**
 * Draws `imageUrl` into `canvas`, feathered by a soft radial-gradient
 * vignette instead of a hard rectangular edge — opaque through the
 * center, fading to fully transparent toward the corners. Sized to a
 * fixed ~16:9 canvas so the result matches the arrival box's own aspect
 * ratio; CSS sizing (width/height:100% on .dr-image) scales that to the
 * real rendered box.
 */
export async function drawDreamImageMask(canvas: HTMLCanvasElement, imageUrl: string): Promise<void> {
  const photo = await loadImage(imageUrl);

  const cw = 1600;
  const ch = 900;
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas context unavailable');

  const iw = photo.naturalWidth;
  const ih = photo.naturalHeight;
  const scale = Math.max(cw / iw, ch / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;

  ctx.clearRect(0, 0, cw, ch);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(photo, dx, dy, dw, dh);

  // A soft ellipse (matching the box's own aspect ratio, not a circle):
  // fully opaque through the middle, fading out over the outer ~30-45% so
  // the photo's own edge is never a visible line. Canvas 2D only offers
  // circular radial gradients, so the ellipse comes from a non-uniform
  // scale around the gradient fill — the same 64%/66% proportions
  // approved in the reference mockup.
  const cx = cw / 2;
  const cy = ch * 0.48;
  const rx = cw * 0.64;
  const ry = ch * 0.66;

  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(0.52, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.65)');
  gradient.addColorStop(0.92, 'rgba(0, 0, 0, 0)');

  ctx.globalCompositeOperation = 'destination-in';
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  ctx.fillStyle = gradient;
  ctx.fillRect(-4, -4, 8, 8);
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load image: ${src}`));
    img.src = src;
  });
}
